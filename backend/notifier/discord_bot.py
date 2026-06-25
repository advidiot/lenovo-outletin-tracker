import asyncio
from typing import Optional, List, Dict, Any
from backend.config import settings
from backend.logging_config import _log, current_time
from backend.db.connection import get_db_connection
from backend.scraper.enrichment import get_product_cpu_gpu


try:
    import discord
    from discord import app_commands
    HAS_DISCORD = True
except ImportError:
    HAS_DISCORD = False

_discord_bot: Optional["LogazeBot"] = None
SYNC_COMMANDS: bool = False

def is_discord_enabled() -> bool:
    return bool(HAS_DISCORD and settings.DISCORD_BOT_TOKEN and settings.OWNER_USER_ID)

def init_discord_bot(sync_commands: bool = False) -> Optional["LogazeBot"]:
    global _discord_bot, SYNC_COMMANDS
    if not is_discord_enabled():
        return None
    SYNC_COMMANDS = sync_commands
    _discord_bot = LogazeBot()
    return _discord_bot

def get_discord_bot() -> Optional["LogazeBot"]:
    return _discord_bot

if is_discord_enabled():
    import aiohttp

    async def _publish_message_non_blocking(channel_id: int, message_id: int) -> None:
        """Publish/crosspost a message in an announcement channel using raw HTTP to avoid blocking on 429."""
        if not settings.DISCORD_BOT_TOKEN:
            return
        url = f"https://discord.com/api/v10/channels/{channel_id}/messages/{message_id}/crosspost"
        headers = {
            "Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}",
            "Content-Type": "application/json"
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers) as resp:
                    if resp.status in (200, 201):
                        _log(f"[Discord] Successfully published message {message_id} in channel {channel_id}")
                    elif resp.status == 429:
                        try:
                            data = await resp.json()
                            retry_after = data.get("retry_after", 0)
                            _log(f"[Discord] Rate limited (429) publishing message {message_id} in channel {channel_id}. Retry after {retry_after}s. Skipping to avoid blocking bot.")
                        except Exception:
                            _log(f"[Discord] Rate limited (429) publishing message {message_id} in channel {channel_id}. Skipping to avoid blocking bot.")
                    else:
                        _log(f"[Discord] Failed to publish message {message_id} in channel {channel_id}: HTTP {resp.status}")
        except Exception as e:
            _log(f"[Discord] Error during non-blocking publish for message {message_id} in channel {channel_id}: {e}")

    async def check_authorized(interaction: discord.Interaction) -> bool:
        if interaction.user.id == settings.OWNER_USER_ID:
            return True
        try:
            def db_op():
                conn = get_db_connection()
                try:
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1 FROM discord_authorized_users WHERE user_id = ?", (str(interaction.user.id),))
                    row = cursor.fetchone()
                    return row is not None
                finally:
                    conn.close()
            authorized = await asyncio.to_thread(db_op)
            if authorized:
                return True
        except Exception as e:
            _log(f"[Discord] Auth check DB error: {e}")
        await interaction.response.send_message("❌ You are not authorized to use this command.", ephemeral=True)
        return False

    async def check_owner(interaction: discord.Interaction) -> bool:
        if interaction.user.id == settings.OWNER_USER_ID:
            return True
        await interaction.response.send_message("❌ Only the primary bot owner can use this command.", ephemeral=True)
        return False

    class LogazeBot(discord.Client):
        def __init__(self):
            intents = discord.Intents.default()
            super().__init__(intents=intents)
            self.tree = app_commands.CommandTree(self)

        async def setup_hook(self) -> None:
            self.tree.add_command(subscribe_command)
            self.tree.add_command(unsubscribe_command)
            self.tree.add_command(filters_command)
            self.tree.add_command(subscriptions_command)
            self.tree.add_command(scrape_command)
            self.tree.add_command(clean_ghosts_command)
            self.tree.add_command(status_command)
            self.tree.add_command(authorize_command)
            self.tree.add_command(deauthorize_command)
            self.tree.add_command(authorized_list_command)
            self.tree.add_command(watch_command)
            self.tree.add_command(unwatch_command)
            self.tree.add_command(watchlist_command)
            if SYNC_COMMANDS:
                await self.tree.sync()
                _log("[Discord] Slash commands synced globally.")
            else:
                _log("[Discord] Slash commands sync skipped. Use --sync-commands CLI flag to sync.")

        async def on_ready(self):
            _log(f"[Discord] Bot ready as {self.user} (ID: {self.user.id})")

    # Commands Definition (Pings version 1.0)
    @app_commands.command(name="subscribe", description="Subscribe current channel to Lenovo Outlet alerts.")
    @app_commands.describe(
        brands="Comma-separated brands (e.g. thinkpad,legion,loq,ideapad,yoga,slim)",
        min_savings="Alert only if discount percentage is at least this value",
        max_price="Alert only if price is less than or equal to this value",
        keywords="Comma-separated keywords to search in product name",
        conditions="Comma-separated conditions (e.g. certified refurbished)",
        event_type="Select which alert events to send to this channel",
        ping_role_added="Discord role to ping when a laptop is added/back in stock",
        ping_role_removed="Discord role to ping when a laptop is sold out/removed",
        ping_role_price_drop="Discord role to ping when a laptop price decreases",
        ping_role_price_hike="Discord role to ping when a laptop price increases"
    )
    @app_commands.choices(event_type=[
        app_commands.Choice(name="All Alerts (Added, Removed, Price Changes)", value="all"),
        app_commands.Choice(name="Active Alerts (Added, Price Changes)", value="active"),
        app_commands.Choice(name="Removed Alerts Only (Sold Out)", value="removed"),
        app_commands.Choice(name="Added Alerts Only (New Stock)", value="added"),
        app_commands.Choice(name="Price Changes Only", value="price_changes"),
        app_commands.Choice(name="Restocks & Price Drops Only", value="added_price_drop"),
        app_commands.Choice(name="Price Drops Only", value="price_drop"),
        app_commands.Choice(name="Price Hikes Only", value="price_hike")
    ])
    async def subscribe_command(
        interaction: discord.Interaction,
        brands: Optional[str] = None,
        min_savings: Optional[float] = None,
        max_price: Optional[float] = None,
        keywords: Optional[str] = None,
        conditions: Optional[str] = None,
        event_type: Optional[str] = "all",
        ping_role_added: Optional[discord.Role] = None,
        ping_role_removed: Optional[discord.Role] = None,
        ping_role_price_drop: Optional[discord.Role] = None,
        ping_role_price_hike: Optional[discord.Role] = None
    ):
        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        db_event_types = "all"
        if event_type == "active":
            db_event_types = "added,price_drop,price_hike"
        elif event_type == "removed":
            db_event_types = "removed"
        elif event_type == "added":
            db_event_types = "added"
        elif event_type == "price_changes":
            db_event_types = "price_drop,price_hike"
        elif event_type == "added_price_drop":
            db_event_types = "added,price_drop"
        elif event_type == "price_drop":
            db_event_types = "price_drop"
        elif event_type == "price_hike":
            db_event_types = "price_hike"

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                clean_brands = ",".join([b.strip().lower() for b in brands.split(",") if b.strip()]) if brands else None
                clean_keywords = ",".join([k.strip().lower() for k in keywords.split(",") if k.strip()]) if keywords else None
                clean_conditions = ",".join([c.strip().lower() for c in conditions.split(",") if c.strip()]) if conditions else None
                now = current_time()
                r_added_id = str(ping_role_added.id) if ping_role_added else None
                r_removed_id = str(ping_role_removed.id) if ping_role_removed else None
                r_price_drop_id = str(ping_role_price_drop.id) if ping_role_price_drop else None
                r_price_hike_id = str(ping_role_price_hike.id) if ping_role_price_hike else None
                cursor.execute("""
                    INSERT OR REPLACE INTO discord_subscriptions 
                    (channel_id, guild_id, min_savings, max_price, brands, keywords, conditions, event_types, 
                     ping_role_added_id, ping_role_removed_id, ping_role_price_drop_id, ping_role_price_hike_id, 
                     created_at, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(interaction.channel_id),
                    str(interaction.guild_id),
                    min_savings,
                    max_price,
                    clean_brands,
                    clean_keywords,
                    clean_conditions,
                    db_event_types,
                    r_added_id,
                    r_removed_id,
                    r_price_drop_id,
                    r_price_hike_id,
                    now,
                    str(interaction.user.id)
                ))
                conn.commit()
            finally:
                conn.close()

        try:
            await asyncio.to_thread(db_op)
            embed = discord.Embed(
                title="✅ Subscribed successfully",
                description=f"Alerts configured for <#{interaction.channel_id}>.",
                color=discord.Color.green()
            )
            embed.add_field(name="Brands", value=brands or "*Any*", inline=True)
            embed.add_field(name="Min Savings (%)", value=f"{min_savings}%" if min_savings is not None else "*Any*", inline=True)
            embed.add_field(name="Max Price (INR)", value=f"₹{max_price:,.0f}" if max_price is not None else "*Any*", inline=True)
            embed.add_field(name="Keywords", value=keywords or "*Any*", inline=True)
            embed.add_field(name="Conditions", value=conditions or "*Any*", inline=True)
            
            et_desc = "All Alerts"
            if event_type == "active":
                et_desc = "Active Only (Added & Price Changes)"
            elif event_type == "removed":
                et_desc = "Removed Only (Sold Out)"
            elif event_type == "added":
                et_desc = "Added Only (New Stock)"
            elif event_type == "price_changes":
                et_desc = "Price Changes Only"
            elif event_type == "added_price_drop":
                et_desc = "Restocks & Price Drops Only"
            elif event_type == "price_drop":
                et_desc = "Price Drops Only"
            elif event_type == "price_hike":
                et_desc = "Price Hikes Only"
            embed.add_field(name="Event Types", value=et_desc, inline=True)
            
            if ping_role_added:
                embed.add_field(name="Ping (Added)", value=ping_role_added.mention, inline=True)
            if ping_role_removed:
                embed.add_field(name="Ping (Removed)", value=ping_role_removed.mention, inline=True)
            if ping_role_price_drop:
                embed.add_field(name="Ping (Price Drop)", value=ping_role_price_drop.mention, inline=True)
            if ping_role_price_hike:
                embed.add_field(name="Ping (Price Hike)", value=ping_role_price_hike.mention, inline=True)
            
            embed.set_footer(text="Logaze India • Lenovo Outlet Tracker")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            _log(f"[Discord] Failed to subscribe: {e}")
            await interaction.followup.send(f"❌ Failed to subscribe: {e}", ephemeral=True)

    @app_commands.command(name="unsubscribe", description="Unsubscribe current channel from Lenovo Outlet alerts.")
    async def unsubscribe_command(interaction: discord.Interaction):
        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM discord_subscriptions WHERE channel_id = ?", (str(interaction.channel_id),))
                conn.commit()
                deleted = cursor.rowcount > 0
                return deleted
            finally:
                conn.close()

        try:
            deleted = await asyncio.to_thread(db_op)
            if deleted:
                await interaction.followup.send("❌ Channel unsubscribed. You will no longer receive alerts here.")
            else:
                await interaction.followup.send("⚠️ This channel was not subscribed to any alerts.")
        except Exception as e:
            _log(f"[Discord] Failed to unsubscribe: {e}")
            await interaction.followup.send(f"❌ Failed to unsubscribe: {e}", ephemeral=True)

    @app_commands.command(name="filters", description="Show active alert filters for this channel.")
    async def filters_command(interaction: discord.Interaction):
        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM discord_subscriptions WHERE channel_id = ?", (str(interaction.channel_id),))
                row = cursor.fetchone()
                return dict(row) if row else None
            finally:
                conn.close()

        try:
            sub = await asyncio.to_thread(db_op)
            if not sub:
                await interaction.followup.send("❌ This channel is not subscribed to any alerts. Use `/subscribe` to configure alerts.")
                return

            embed = discord.Embed(
                title="🔍 Active Channel Filters",
                description=f"Alert settings for <#{interaction.channel_id}>.",
                color=discord.Color.blue()
            )
            embed.add_field(name="Brands", value=sub.get("brands") or "*Any*", inline=True)
            embed.add_field(name="Min Savings (%)", value=f"{sub.get('min_savings')}%" if sub.get('min_savings') is not None else "*Any*", inline=True)
            embed.add_field(name="Max Price (INR)", value=f"₹{sub.get('max_price'):,.0f}" if sub.get('max_price') is not None else "*Any*", inline=True)
            embed.add_field(name="Keywords", value=sub.get("keywords") or "*Any*", inline=True)
            embed.add_field(name="Conditions", value=sub.get("conditions") or "*Any*", inline=True)
            
            et = sub.get("event_types") or "all"
            et_desc = "All Alerts"
            if et == "added,price_drop,price_hike":
                et_desc = "Active Only (Added & Price Changes)"
            elif et == "removed":
                et_desc = "Removed Only (Sold Out)"
            elif et == "added":
                et_desc = "Added Only (New Stock)"
            elif et == "price_drop,price_hike":
                et_desc = "Price Changes Only"
            elif et == "added,price_drop":
                et_desc = "Restocks & Price Drops Only"
            elif et == "price_drop":
                et_desc = "Price Drops Only"
            elif et == "price_hike":
                et_desc = "Price Hikes Only"
            elif et != "all":
                et_desc = et
            embed.add_field(name="Event Types", value=et_desc, inline=True)
            
            if sub.get("ping_role_added_id"):
                embed.add_field(name="Ping (Added)", value=f"<@&{sub['ping_role_added_id']}>", inline=True)
            if sub.get("ping_role_removed_id"):
                embed.add_field(name="Ping (Removed)", value=f"<@&{sub['ping_role_removed_id']}>", inline=True)
            if sub.get("ping_role_price_drop_id"):
                embed.add_field(name="Ping (Price Drop)", value=f"<@&{sub['ping_role_price_drop_id']}>", inline=True)
            if sub.get("ping_role_price_hike_id"):
                embed.add_field(name="Ping (Price Hike)", value=f"<@&{sub['ping_role_price_hike_id']}>", inline=True)
            
            embed.set_footer(text="Logaze India • Lenovo Outlet Tracker")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            _log(f"[Discord] Failed to retrieve filters: {e}")
            await interaction.followup.send(f"❌ Failed to retrieve filters: {e}", ephemeral=True)

    @app_commands.command(name="subscriptions", description="List all active subscriptions across all channels.")
    async def subscriptions_command(interaction: discord.Interaction):
        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM discord_subscriptions")
                rows = cursor.fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

        try:
            subs = await asyncio.to_thread(db_op)
            if not subs:
                await interaction.followup.send("ℹ️ No channels are currently subscribed to alerts.")
                return

            embed = discord.Embed(
                title="📋 All Active Subscriptions",
                color=discord.Color.purple()
            )
            for sub in subs:
                channel_mention = f"<#{sub['channel_id']}>"
                filters = []
                if sub.get("brands"):
                    filters.append(f"Brands: `{sub['brands']}`")
                if sub.get("min_savings") is not None:
                    filters.append(f"Min Savings: `{sub['min_savings']}%`")
                if sub.get("max_price") is not None:
                    filters.append(f"Max Price: `₹{sub['max_price']:,.0f}`")
                if sub.get("keywords"):
                    filters.append(f"Keywords: `{sub['keywords']}`")
                if sub.get("conditions"):
                    filters.append(f"Conditions: `{sub['conditions']}`")
                
                et = sub.get("event_types") or "all"
                et_desc = "All Alerts"
                if et == "added,price_drop,price_hike":
                    et_desc = "Active Only (Added & Price Changes)"
                elif et == "removed":
                    et_desc = "Removed Only (Sold Out)"
                elif et == "added":
                    et_desc = "Added Only (New Stock)"
                elif et == "price_drop,price_hike":
                    et_desc = "Price Changes Only"
                elif et == "added,price_drop":
                    et_desc = "Restocks & Price Drops Only"
                elif et == "price_drop":
                    et_desc = "Price Drops Only"
                elif et == "price_hike":
                    et_desc = "Price Hikes Only"
                elif et != "all":
                    et_desc = et
                filters.append(f"Event Types: `{et_desc}`")
                
                if sub.get("ping_role_added_id"):
                    filters.append(f"Ping (Added): <@&{sub['ping_role_added_id']}>")
                if sub.get("ping_role_removed_id"):
                    filters.append(f"Ping (Removed): <@&{sub['ping_role_removed_id']}>")
                if sub.get("ping_role_price_drop_id"):
                    filters.append(f"Ping (Price Drop): <@&{sub['ping_role_price_drop_id']}>")
                if sub.get("ping_role_price_hike_id"):
                    filters.append(f"Ping (Price Hike): <@&{sub['ping_role_price_hike_id']}>")
                
                filter_text = "\n".join(filters)
                embed.add_field(name=channel_mention, value=filter_text, inline=False)
                
            await interaction.followup.send(embed=embed)
        except Exception as e:
            _log(f"[Discord] Failed to retrieve subscriptions: {e}")
            await interaction.followup.send(f"❌ Failed to retrieve subscriptions: {e}", ephemeral=True)

    @app_commands.command(name="scrape", description="Manually trigger a Lenovo Outlet scrape.")
    async def scrape_command(interaction: discord.Interaction):
        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send("🔄 Manual scrape started. Checking for laptop updates...")

        try:
            # Late import to avoid circular dependency
            from backend.main import trigger_manual_scrape
            res = await asyncio.to_thread(trigger_manual_scrape)
            if res.get("success"):
                await interaction.followup.send(
                    f"✅ Scrape finished successfully!\n"
                    f"- Scanned: {res['scanned_count']} products\n"
                    f"- Active in DB: {res['active_count']}\n"
                    f"- Removed in DB: {res['removed_count']}"
                )
            else:
                await interaction.followup.send(f"❌ Scrape failed: {res.get('error')}")
        except Exception as e:
            _log(f"[Discord] Failed in Discord manual scrape: {e}")
            await interaction.followup.send(f"❌ Error during manual scrape: {e}")

    @app_commands.command(name="clean_ghosts", description="Manually trigger a ghost listings cleanup.")
    async def clean_ghosts_command(interaction: discord.Interaction):
        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send("🔄 Cleaning up ghost listings...")

        try:
            # Late import to avoid circular dependency
            from backend.main import trigger_ghost_cleanup
            res = await asyncio.to_thread(trigger_ghost_cleanup)
            if res.get("success"):
                await interaction.followup.send(
                    f"✅ Ghost cleanup finished successfully!\n"
                    f"- Cleaned {res['cleaned_count']} listings: {', '.join(res['cleaned_codes']) if res['cleaned_codes'] else 'None'}"
                )
            else:
                await interaction.followup.send(f"❌ Ghost cleanup failed: {res.get('error')}")
        except Exception as e:
            _log(f"[Discord] Failed in Discord ghost cleanup: {e}")
            await interaction.followup.send(f"❌ Error during ghost cleanup: {e}")

    @app_commands.command(name="status", description="Show the tracker system health, uptime, and database count.")
    async def status_command(interaction: discord.Interaction):
        await interaction.response.defer()

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM products WHERE active = 1")
                active = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM products WHERE active = 0")
                removed = cursor.fetchone()[0]
                return active, removed
            finally:
                conn.close()

        try:
            active, removed = await asyncio.to_thread(db_op)
            embed = discord.Embed(
                title="🖥️ Logaze India Tracker Status",
                color=discord.Color.gold()
            )
            embed.add_field(name="Bot Status", value="🟢 Online & Monitoring", inline=True)
            embed.add_field(name="HTTP Server Port", value=str(settings.PORT), inline=True)
            embed.add_field(name="Active Laptops", value=str(active), inline=True)
            embed.add_field(name="Removed Laptops", value=str(removed), inline=True)
            embed.set_footer(text="Logaze India • Lenovo Outlet Tracker")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            _log(f"[Discord] Failed to get status: {e}")
            await interaction.followup.send(f"❌ Failed to retrieve status details: {e}")

    @app_commands.command(name="authorize", description="Whitelist a user to manage alerts and run scraper commands (Owner only).")
    @app_commands.describe(user="The Discord user to authorize")
    async def authorize_command(interaction: discord.Interaction, user: discord.User):
        if not await check_owner(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                now = current_time()
                cursor.execute(
                    "INSERT OR REPLACE INTO discord_authorized_users (user_id, added_by, added_at) VALUES (?, ?, ?)",
                    (str(user.id), str(interaction.user.id), now)
                )
                conn.commit()
            finally:
                conn.close()

        try:
            await asyncio.to_thread(db_op)
            await interaction.followup.send(f"✅ User {user.mention} (`{user.id}`) is now authorized.")
        except Exception as e:
            _log(f"[Discord] Failed to authorize user: {e}")
            await interaction.followup.send(f"❌ Failed to authorize user: {e}", ephemeral=True)

    @app_commands.command(name="deauthorize", description="Revoke authorized access for a user (Owner only).")
    @app_commands.describe(user="The Discord user to deauthorize")
    async def deauthorize_command(interaction: discord.Interaction, user: discord.User):
        if not await check_owner(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM discord_authorized_users WHERE user_id = ?", (str(user.id),))
                conn.commit()
                deleted = cursor.rowcount > 0
                return deleted
            finally:
                conn.close()

        try:
            deleted = await asyncio.to_thread(db_op)
            if deleted:
                await interaction.followup.send(f"❌ Revoked authorized access for {user.mention}.")
            else:
                await interaction.followup.send(f"⚠️ User {user.mention} was not authorized.")
        except Exception as e:
            _log(f"[Discord] Failed to deauthorize user: {e}")
            await interaction.followup.send(f"❌ Failed to deauthorize user: {e}", ephemeral=True)

    @app_commands.command(name="authorized_list", description="List all whitelisted authorized users (Owner only).")
    async def authorized_list_command(interaction: discord.Interaction):
        if not await check_owner(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM discord_authorized_users")
                rows = cursor.fetchall()
                return [dict(r) for r in rows]
            finally:
                conn.close()

        try:
            users = await asyncio.to_thread(db_op)
            embed = discord.Embed(
                title="🔒 Authorized Users List",
                description=f"Primary Owner: <@{settings.OWNER_USER_ID}>",
                color=discord.Color.dark_grey()
            )
            user_lines = []
            for u in users:
                user_lines.append(f"• <@{u['user_id']}> (Added by <@{u['added_by']}> on {u['added_at']})")
                
            embed.description += "\n\n" + ("\n".join(user_lines) if user_lines else "No additional users whitelisted.")
            await interaction.followup.send(embed=embed)
        except Exception as e:
            _log(f"[Discord] Failed to list authorized users: {e}")

    @app_commands.command(name="watch", description="Watch a specific product code for stock/price notifications.")
    @app_commands.describe(
        product_code="The Lenovo product number (e.g. 83DV007GIN)",
        target_price="Alert only if price drops below or equals this value"
    )
    async def watch_command(
        interaction: discord.Interaction,
        product_code: str,
        target_price: Optional[float] = None
    ):
        if not settings.WATCHLIST_ENABLED:
            await interaction.response.send_message("❌ The personal watchlist feature is globally disabled by the administrator.", ephemeral=True)
            return

        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        product_code = product_code.strip()
        
        # Verify the product exists in DB first to get its current price & name
        def db_verify():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT product_name, current_price FROM products WHERE product_code = ?", (product_code,))
                return cursor.fetchone()
            finally:
                conn.close()

        product_row = await asyncio.to_thread(db_verify)
        product_name = product_row[0] if product_row else "Unknown Laptop"
        curr_price = product_row[1] if product_row else None

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                now = current_time()
                cursor.execute("""
                    INSERT OR REPLACE INTO watchlists (user_id, product_code, target_price, created_at)
                    VALUES (?, ?, ?, ?)
                """, (str(interaction.user.id), product_code, target_price, now))
                conn.commit()
            finally:
                conn.close()

        try:
            await asyncio.to_thread(db_op)
            price_clause = f" when price is ≤ ₹{target_price:,.0f}" if target_price is not None else ""
            msg = f"✅ Now watching **{product_name}** (`{product_code}`){price_clause}.\nYou will receive a DM when triggers are met."
            if curr_price is not None:
                msg += f"\n*Current Price in DB: ₹{curr_price:,.0f}*"
            await interaction.followup.send(msg)
        except Exception as e:
            _log(f"[Discord] Failed to watch product {product_code}: {e}")
            await interaction.followup.send(f"❌ Failed to register watch trigger: {e}", ephemeral=True)

    @app_commands.command(name="unwatch", description="Stop watching a specific product code.")
    @app_commands.describe(product_code="The Lenovo product number to stop watching")
    async def unwatch_command(interaction: discord.Interaction, product_code: str):
        if not settings.WATCHLIST_ENABLED:
            await interaction.response.send_message("❌ The personal watchlist feature is globally disabled by the administrator.", ephemeral=True)
            return

        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)
        product_code = product_code.strip()

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM watchlists WHERE user_id = ? AND product_code = ?", (str(interaction.user.id), product_code))
                conn.commit()
                return cursor.rowcount > 0
            finally:
                conn.close()

        try:
            deleted = await asyncio.to_thread(db_op)
            if deleted:
                await interaction.followup.send(f"❌ Stopped watching product `{product_code}`.")
            else:
                await interaction.followup.send(f"⚠️ You were not watching product `{product_code}`.")
        except Exception as e:
            _log(f"[Discord] Failed to unwatch product {product_code}: {e}")
            await interaction.followup.send(f"❌ Failed to remove watch trigger: {e}", ephemeral=True)

    @app_commands.command(name="watchlist", description="List all product watch triggers you are currently running.")
    async def watchlist_command(interaction: discord.Interaction):
        if not settings.WATCHLIST_ENABLED:
            await interaction.response.send_message("❌ The personal watchlist feature is globally disabled by the administrator.", ephemeral=True)
            return

        if not await check_authorized(interaction):
            return

        await interaction.response.defer(ephemeral=True)

        def db_op():
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT w.product_code, w.target_price, w.created_at, p.product_name, p.current_price, p.active, p.pending_removal_since
                    FROM watchlists w
                    LEFT JOIN products p ON w.product_code = p.product_code
                    WHERE w.user_id = ?
                """, (str(interaction.user.id),))
                return [dict(r) for r in cursor.fetchall()]
            finally:
                conn.close()

        try:
            items = await asyncio.to_thread(db_op)
            if not items:
                await interaction.followup.send("ℹ️ You are not watching any products. Use `/watch` to start watching.")
                return

            embed = discord.Embed(
                title="❤️ Your Personal Laptop Watchlist",
                color=discord.Color.red()
            )
            for item in items:
                name = item.get("product_name") or "Unknown Laptop"
                code = item["product_code"]
                target = item.get("target_price")
                curr = item.get("current_price")
                active = item.get("active")
                pending_removal = item.get("pending_removal_since")
                
                if active == 1:
                    status = "🟢 Active"
                elif pending_removal is not None:
                    status = "🟡 Cart Hold (Pending Sold Out)"
                else:
                    status = "🔴 Out of Stock / Sold Out"
                target_str = f"₹{target:,.0f}" if target is not None else "*Any Price Drop*"
                curr_str = f"₹{curr:,.0f}" if curr is not None else "N/A"
                
                desc = (
                    f"**{name}**\n"
                    f"• Status: {status}\n"
                    f"• Current Price: {curr_str}\n"
                    f"• Target Price: {target_str}\n"
                    f"• Watched Since: {item['created_at']}"
                )
                embed.add_field(name=f"Code: `{code}`", value=desc, inline=False)
                
            await interaction.followup.send(embed=embed)
        except Exception as e:
            _log(f"[Discord] Failed to list watchlist: {e}")
            await interaction.followup.send(f"❌ Failed to retrieve watchlist: {e}", ephemeral=True)





def _matches_subscription(product: dict, sub: dict) -> bool:
    price = product.get("finalPrice")
    if price is None:
        price = product.get("current_price")
    if price is not None:
        try:
            price = float(price)
        except (ValueError, TypeError):
            price = 0.0
    else:
        price = 0.0

    max_price = sub["max_price"]
    if max_price is not None and price > max_price:
        return False

    savings = product.get("savePercent")
    if savings is None:
        savings = product.get("save_percent")
    if savings is not None:
        try:
            savings = float(savings)
        except (ValueError, TypeError):
            savings = 0.0
    else:
        savings = 0.0

    min_savings = sub["min_savings"]
    if min_savings is not None and savings < min_savings:
        return False

    sub_brands = sub["brands"]
    if sub_brands:
        product_name = (product.get("productName") or "").lower()
        model_name = (product.get("model") or "").lower()
        brand_list = [b.strip().lower() for b in sub_brands.split(",") if b.strip()]
        pos_brands = [b for b in brand_list if not b.startswith("!")]
        neg_brands = [b[1:] for b in brand_list if b.startswith("!")]
        
        # Exclude if any negative brand matches
        if neg_brands and any(brand in product_name or brand in model_name for brand in neg_brands):
            return False
        # Require positive brand match if positive filters are specified
        if pos_brands and not any(brand in product_name or brand in model_name for brand in pos_brands):
            return False

    keywords = sub["keywords"]
    if keywords:
        product_name = (product.get("productName") or "").lower()
        model_name = (product.get("model") or "").lower()
        keyword_list = [k.strip().lower() for k in keywords.split(",") if k.strip()]
        pos_keywords = [k for k in keyword_list if not k.startswith("!")]
        neg_keywords = [k[1:] for k in keyword_list if k.startswith("!")]
        
        # Exclude if any negative keyword matches
        if neg_keywords and any(kw in product_name or kw in model_name for kw in neg_keywords):
            return False
        # Require positive keyword match if positive filters are specified
        if pos_keywords and not any(kw in product_name or kw in model_name for kw in pos_keywords):
            return False

    sub_conditions = sub["conditions"]
    if sub_conditions:
        condition = (product.get("productCondition") or product.get("condition") or "").lower()
        cond_list = [c.strip().lower() for c in sub_conditions.split(",") if c.strip()]
        if cond_list and condition not in cond_list:
            return False

    return True


def _build_product_embed(product: dict, event_type: str, old_price: Optional[float] = None) -> "discord.Embed":
    colors = {
        "added": discord.Color.green(),
        "removed": discord.Color.red(),
        "price_drop": discord.Color.blue(),
        "price_hike": discord.Color.gold(),
    }
    titles = {
        "added": "🆕 Laptop Added / Back in Stock",
        "removed": "❌ Laptop Removed / Sold Out",
        "price_drop": "📉 Price Drop Alert",
        "price_hike": "📈 Price Increase",
    }

    name = product.get("productName") or product.get("product_name") or "Unknown Laptop"
    code = product.get("productCode") or product.get("product_code") or "?"
    
    price = product.get("finalPrice")
    if price is None:
        price = product.get("current_price")
    
    savings = product.get("savePercent")
    if savings is None:
        savings = product.get("save_percent")
        
    condition = product.get("productCondition") or product.get("condition") or settings.DEFAULT_CONDITION
    
    url_path = product.get("url") or f"/p/{code}"
    # Form fully qualified URL if needed
    if url_path.startswith("http"):
        url = url_path
    elif url_path:
        url = f"{settings.LENOVO_BASE_URL}{url_path}"
    else:
        url = settings.LENOVO_LAPTOPS_URL
    
    thumbnail = product.get("thumbnail_url")
    if not thumbnail:
        media = product.get("media", {})
        hero = media.get("heroImage") or {}
        thumb = media.get("thumbnail") or {}
        gallery = media.get("gallery", [])

        if isinstance(hero, dict) and hero.get("imageAddress"):
            thumbnail = hero.get("imageAddress")
        elif isinstance(thumb, dict) and thumb.get("imageAddress"):
            thumbnail = thumb.get("imageAddress")
        elif gallery and isinstance(gallery, list) and len(gallery) > 0:
            item = gallery[0]
            if isinstance(item, dict):
                thumbnail = item.get("imageAddress")
 
    if thumbnail and thumbnail.startswith("//"):
        thumbnail = "https:" + thumbnail

    embed = discord.Embed(
        title=f"{titles.get(event_type, '🔔 Alert')}",
        description=f"**{name}**",
        color=colors.get(event_type, discord.Color.default()),
        url=url,
    )
    
    price_str = "N/A"
    if price is not None:
        try:
            price_str = f"₹{float(price):,.0f}"
        except (ValueError, TypeError):
            price_str = str(price)
            
    embed.add_field(name="💰 Price", value=price_str, inline=True)
    
    if old_price is not None:
        try:
            old_price_str = f"₹{float(old_price):,.0f}"
        except (ValueError, TypeError):
            old_price_str = str(old_price)
        embed.add_field(name="📉 Old Price", value=old_price_str, inline=True)

    embed.add_field(name="🏷️ Savings", value=f"{savings}%" if savings is not None else "0%", inline=True)
    embed.add_field(name="📦 Condition", value=condition, inline=True)
    embed.add_field(name="🔗 Product Code", value=f"`{code}`", inline=True)
    
    cpu, gpu = get_product_cpu_gpu(product)
    embed.add_field(name="⚙️ CPU", value=cpu, inline=True)
    embed.add_field(name="🎮 GPU", value=gpu, inline=True)
 
    if event_type == "removed":
        duration = product.get("_listing_duration")
        if duration:
            embed.add_field(name="⏱️ Listed for", value=duration, inline=True)
    elif event_type == "added":
        restock_duration = product.get("_restock_duration")
        if restock_duration:
            embed.add_field(name="⏱️ Restocked after", value=restock_duration, inline=True)
 
    if thumbnail:
        embed.set_thumbnail(url=thumbnail)

    embed.set_footer(text="Logaze India • Lenovo Outlet Tracker")
    embed.timestamp = discord.utils.utcnow()

    return embed


async def _send_compact_alerts(
    channel,
    products: list,
    event_type: str,
    old_price: Optional[float] = None,
    ping_role_id: Optional[str] = None
) -> None:
    """Format and send product alerts as a compact summary message, handling 2000 character limit."""
    ping_prefix = f"<@&{ping_role_id}> " if ping_role_id else ""
    header = f"{ping_prefix}🔔 **Logaze India: Multiple Laptop Alerts (Channel Digest)**\n"
    lines = []
    
    event_actions = {
        "added": "🆕 Added",
        "removed": "❌ Sold Out",
        "price_drop": "📉 Price Drop",
        "price_hike": "📈 Price Hike"
    }
    action = event_actions.get(event_type, "🔔 Alert")

    for p in products:
        name = p.get("productName") or p.get("product_name") or "Unknown Laptop"
        code = p.get("productCode") or p.get("product_code") or "?"
        
        price = p.get("finalPrice")
        if price is None:
            price = p.get("current_price")
        
        savings = p.get("savePercent")
        if savings is None:
            savings = p.get("save_percent")
            
        url_path = p.get("url") or f"/p/{code}"
        if url_path.startswith("http"):
            url = url_path
        elif url_path:
            url = f"{settings.LENOVO_BASE_URL}{url_path}"
        else:
            url = settings.LENOVO_LAPTOPS_URL
            
        price_str = "N/A"
        if price is not None:
            try:
                price_str = f"₹{float(price):,.0f}"
            except (ValueError, TypeError):
                price_str = str(price)

        savings_str = f"Savings: {savings}%" if savings is not None else "0%"
        
        if event_type in ("price_drop", "price_hike") and old_price is not None:
            try:
                old_price_str = f"₹{float(old_price):,.0f}"
            except (ValueError, TypeError):
                old_price_str = str(old_price)
            price_str = f"{price_str} (Was: {old_price_str})"
 
        duration_str = ""
        if event_type == "removed":
            duration = p.get("_listing_duration")
            if duration:
                duration_str = f" — Listed for: {duration}"
        elif event_type == "added":
            restock_duration = p.get("_restock_duration")
            if restock_duration:
                duration_str = f" — Restocked after: {restock_duration}"

        cpu, gpu = get_product_cpu_gpu(p)
        lines.append(f"• [{action}] {name} ({code}) — {price_str} — {savings_str}{duration_str}\n  ⚙️ {cpu} | 🎮 {gpu} — [Store Link]({url})")

    # Send messages in chunks of 2000 chars
    current_msg = header
    for line in lines:
        if len(current_msg) + len(line) + 2 > 2000:
            msg = await channel.send(current_msg)
            if channel.type == discord.ChannelType.news:
                asyncio.create_task(_publish_message_non_blocking(channel.id, msg.id))
            current_msg = ""
        current_msg += line + "\n"
    
    if current_msg:
        msg = await channel.send(current_msg)
        if channel.type == discord.ChannelType.news:
            asyncio.create_task(_publish_message_non_blocking(channel.id, msg.id))


def dispatch_discord_alerts(
    queue: list[dict],
    event_type: str,
    old_price: Optional[float] = None
) -> None:
    """Route product events to subscribed Discord channels based on their filters."""
    if not is_discord_enabled() or not _discord_bot or not _discord_bot.is_ready():
        return

    try:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM discord_subscriptions")
            subscriptions = [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()
    except Exception as e:
        _log(f"[Discord] Database error reading subscriptions: {e}")
        return

    for sub in subscriptions:
        event_types_str = sub.get("event_types", "all") or "all"
        if event_types_str != "all":
            allowed_events = {et.strip() for et in event_types_str.split(",") if et.strip()}
            if event_type not in allowed_events:
                continue

        # Filter queue products that match this subscription
        matching_products = []
        for product in queue:
            if _matches_subscription(product, sub):
                matching_products.append(product)

        if not matching_products:
            continue

        cid = sub["channel_id"]
        
        # Determine the ping role for this event type
        ping_role_id = None
        if event_type == "added":
            ping_role_id = sub.get("ping_role_added_id")
        elif event_type == "removed":
            ping_role_id = sub.get("ping_role_removed_id")
        elif event_type == "price_drop":
            ping_role_id = sub.get("ping_role_price_drop_id")
        elif event_type == "price_hike":
            ping_role_id = sub.get("ping_role_price_hike_id")

        # Schedule sending to channel
        async def send_to_channel(cid=cid, products=matching_products, ping_role_id=ping_role_id):
            try:
                channel = _discord_bot.get_channel(int(cid))
                if not channel:
                    channel = await _discord_bot.fetch_channel(int(cid))
                if not channel:
                    return

                # Send up to 10 as embeds (grouped in a batch), remaining compact
                max_embeds_count = 10
                embed_products = products[:max_embeds_count]
                compact_products = products[max_embeds_count:]

                ping_sent = False
                for i in range(0, len(embed_products), 10):
                    batch = embed_products[i:i+10]
                    embeds = []
                    for product in batch:
                        try:
                            embeds.append(_build_product_embed(product, event_type, old_price))
                        except Exception as e:
                            _log(f"[Discord] Error building embed for product: {e}")

                    if embeds:
                        content = None
                        if ping_role_id and not ping_sent:
                            content = f"<@&{ping_role_id}>"
                            ping_sent = True

                        try:
                            msg = await channel.send(content=content, embeds=embeds)
                            if channel.type == discord.ChannelType.news:
                                asyncio.create_task(_publish_message_non_blocking(channel.id, msg.id))
                            
                            # Log sent message IDs to DB for checkout hold mitigation message editing
                            def save_sent_msg_ids(msg_id, pr_codes, cid, ev_type):
                                import time
                                conn = get_db_connection()
                                try:
                                    cursor = conn.cursor()
                                    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                                    for code in pr_codes:
                                        cursor.execute("""
                                            INSERT OR REPLACE INTO discord_sent_messages 
                                            (product_code, channel_id, message_id, event_type, sent_at)
                                            VALUES (?, ?, ?, ?, ?)
                                        """, (code, str(cid), str(msg_id), ev_type, now_str))
                                    conn.commit()
                                finally:
                                    conn.close()
                            
                            pr_codes = [p.get("productCode") or p.get("product_code") for p in batch]
                            asyncio.create_task(asyncio.to_thread(save_sent_msg_ids, msg.id, pr_codes, cid, event_type))
                            
                            await asyncio.sleep(0.5)
                        except discord.errors.HTTPException as he:
                            if he.status == 429:
                                _log(f"[Discord] Rate limit hit (429) sending embeds to channel {cid}. Switching remainder to compact.")
                                remainder = products[i:]
                                await _send_compact_alerts(channel, remainder, event_type, old_price, None if ping_sent else ping_role_id)
                                return
                            else:
                                _log(f"[Discord] HTTP error sending embeds batch to channel {cid}: {he}")
                        except Exception as ex:
                            _log(f"[Discord] Error sending embeds batch to channel {cid}: {ex}")

                if compact_products:
                    await _send_compact_alerts(channel, compact_products, event_type, old_price, None if ping_sent else ping_role_id)

            except Exception as ex:
                _log(f"[Discord] Failed to send notifications to channel {cid}: {ex}")

        asyncio.run_coroutine_threadsafe(send_to_channel(), _discord_bot.loop)


def dispatch_watchlist_alerts(
    product: dict,
    event_type: str,
    old_price: Optional[float] = None
) -> None:
    """Check watchlist triggers and send direct message alerts to users if matched."""
    if not settings.WATCHLIST_ENABLED or not is_discord_enabled() or not _discord_bot or not _discord_bot.is_ready():
        return

    code = product.get("productCode") or product.get("product_code")
    if not code:
        return

    price = product.get("finalPrice")
    if price is None:
        price = product.get("current_price")
    try:
        price = float(price) if price is not None else 0.0
    except (ValueError, TypeError):
        price = 0.0

    try:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT user_id, target_price FROM watchlists WHERE product_code = ?", (code,))
            matches = cursor.fetchall()
        finally:
            conn.close()
    except Exception as e:
        _log(f"[Discord Watchlist] Database error: {e}")
        return

    for match in matches:
        user_id = match[0]
        target_price = match[1]

        # If target price is set, only alert if current price <= target_price
        if target_price is not None and price > target_price:
            continue

        # Build DM alert embed
        embed = _build_product_embed(product, event_type, old_price)
        embed.title = f"❤️ Watchlist Alert: {embed.title}"

        async def send_dm(uid=user_id, emb=embed):
            try:
                user = _discord_bot.get_user(int(uid))
                if not user:
                    user = await _discord_bot.fetch_user(int(uid))
                if user:
                    await user.send(embed=emb)
            except discord.Forbidden:
                _log(f"[Discord Watchlist] Cannot send DM to user {uid} (DMs disabled by user privacy settings)")
            except Exception as ex:
                _log(f"[Discord Watchlist] Failed to send DM to user {uid}: {ex}")

        asyncio.run_coroutine_threadsafe(send_dm(), _discord_bot.loop)

def dispatch_discord_edit(product_code: str, status: str, expire_epoch: Optional[int] = None) -> None:
    """Trigger non-blocking Discord message edits for state transitions."""
    if not is_discord_enabled() or not _discord_bot or not _discord_bot.is_ready():
        return

    async def do_edit():
        import time
        try:
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT channel_id, message_id, event_type 
                    FROM discord_sent_messages 
                    WHERE product_code = ?
                """, (product_code,))
                rows = [dict(r) for r in cursor.fetchall()]
            finally:
                conn.close()
            
            for row in rows:
                channel_id = int(row["channel_id"])
                message_id = int(row["message_id"])
                original_event_type = row["event_type"]
                
                channel = _discord_bot.get_channel(channel_id)
                if not channel:
                    try:
                        channel = await _discord_bot.fetch_channel(channel_id)
                    except Exception:
                        continue
                if not channel:
                    continue
                
                try:
                    msg = await channel.fetch_message(message_id)
                except discord.errors.NotFound:
                    _purge_discord_message(product_code, channel_id)
                    continue
                except Exception as e:
                    _log(f"[Discord Edit] Error fetching message {message_id}: {e}")
                    continue
                
                embeds = msg.embeds
                modified = False
                new_embeds = []
                
                for emb in embeds:
                    if emb.url and f"/p/{product_code}" in emb.url:
                        new_emb = emb.copy()
                        
                        desc = new_emb.description or ""
                        if "\n\n" in desc:
                            desc_clean = desc.split("\n\n")[-1]
                        else:
                            desc_clean = desc
                        
                        # Rebuild fields to strip stale information
                        fields_to_process = list(emb.fields)
                        new_emb.clear_fields()
                        for field in fields_to_process:
                            if status == "cart_hold":
                                if field.name not in ("⏱️ Listed for", "⏱️ Restocked after"):
                                    new_emb.add_field(name=field.name, value=field.value, inline=field.inline)
                            elif status == "restocked":
                                if field.name not in ("⏱️ Listed for", "⏱️ Restocked after", "📉 Old Price"):
                                    new_emb.add_field(name=field.name, value=field.value, inline=field.inline)
                            else:
                                new_emb.add_field(name=field.name, value=field.value, inline=field.inline)

                        if status == "cart_hold":
                            new_emb.title = "⚠️ Laptop In Someone's Cart"
                            new_emb.color = discord.Color.from_rgb(255, 191, 0)
                            countdown_str = f"<t:{expire_epoch}:R>" if expire_epoch else "15 minutes"
                            new_emb.description = f"⚠️ **Cart Hold Active** • Reserved in cart. Lock releases {countdown_str}.\n\n{desc_clean}"
                        
                        elif status == "sold_out":
                            new_emb.title = "❌ Laptop Removed / Sold Out"
                            new_emb.color = discord.Color.red()
                            sold_epoch = int(time.time())
                            new_emb.description = f"🔴 **Sold Out** • Confirmed sold at <t:{sold_epoch}:t> (<t:{sold_epoch}:R>).\n\n{desc_clean}"
                        
                        elif status == "restocked":
                            if original_event_type == "price_drop":
                                new_emb.title = "📉 Price Drop Alert"
                                new_emb.color = discord.Color.blue()
                            elif original_event_type == "price_hike":
                                new_emb.title = "📈 Price Increase"
                                new_emb.color = discord.Color.gold()
                            else:
                                new_emb.title = "🆕 Laptop Added / Back in Stock"
                                new_emb.color = discord.Color.green()
                            
                            new_emb.description = f"🆕 **Back in Stock** • Listing is active.\n\n{desc_clean}"
                        
                        new_embeds.append(new_emb)
                        modified = True
                    else:
                        new_embeds.append(emb)
                
                if modified:
                    try:
                        await msg.edit(embeds=new_embeds)
                        await asyncio.sleep(0.5)
                    except Exception as e:
                        _log(f"[Discord Edit] Error editing message: {e}")
        except Exception as ex:
            _log(f"[Discord Edit] Error: {ex}")

    asyncio.run_coroutine_threadsafe(do_edit(), _discord_bot.loop)

def _purge_discord_message(product_code: str, channel_id: int):
    try:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM discord_sent_messages WHERE product_code = ? AND channel_id = ?", (product_code, str(channel_id)))
            conn.commit()
            _log(f"[Discord Edit] Purged deleted message record for {product_code} in channel {channel_id}")
        finally:
            conn.close()
    except Exception as e:
        _log(f"[Discord Edit] Error purging message record: {e}")


