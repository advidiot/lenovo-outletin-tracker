import unittest
import unittest.mock
from typing import Optional
from backend.notifier.discord_bot import _matches_subscription, _build_product_embed

class TestDiscordBotLogic(unittest.TestCase):
    def test_matches_subscription_brands(self):
        product = {
            "productName": "Lenovo ThinkPad X1 Carbon Gen 11",
            "model": "ThinkPad X1",
            "finalPrice": 120000.0,
            "savePercent": 30.0,
            "productCondition": "new"
        }
        
        # Matches positive brand
        sub_match = {
            "max_price": None,
            "min_savings": None,
            "brands": "thinkpad,legion",
            "keywords": None,
            "conditions": None
        }
        self.assertTrue(_matches_subscription(product, sub_match))

        # Does not match positive brand
        sub_no_match = {
            "max_price": None,
            "min_savings": None,
            "brands": "legion,loq",
            "keywords": None,
            "conditions": None
        }
        res = _matches_subscription(product, sub_no_match)
        self.assertFalse(res)

        # Excluded by negative brand
        sub_neg_match = {
            "max_price": None,
            "min_savings": None,
            "brands": "thinkpad,!carbon",
            "keywords": None,
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_neg_match))

    def test_matches_subscription_price_and_savings(self):
        product = {
            "productName": "Legion Pro 5",
            "model": "Legion",
            "finalPrice": 150000.0,
            "savePercent": 25.0,
            "productCondition": "certified refurbished"
        }

        # Matches both price and savings
        sub = {
            "max_price": 160000.0,
            "min_savings": 20.0,
            "brands": None,
            "keywords": None,
            "conditions": None
        }
        self.assertTrue(_matches_subscription(product, sub))

        # Price too high
        sub_price_high = {
            "max_price": 140000.0,
            "min_savings": 20.0,
            "brands": None,
            "keywords": None,
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_price_high))

        # Savings too low
        sub_savings_low = {
            "max_price": 160000.0,
            "min_savings": 30.0,
            "brands": None,
            "keywords": None,
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_savings_low))

    def test_matches_subscription_keywords(self):
        product = {
            "productName": "IdeaPad Slim 5 14IRL8",
            "model": "IdeaPad",
            "finalPrice": 60000.0,
            "savePercent": 15.0,
            "productCondition": "new"
        }

        # Matches keyword
        sub = {
            "max_price": None,
            "min_savings": None,
            "brands": None,
            "keywords": "slim,14irl8",
            "conditions": None
        }
        self.assertTrue(_matches_subscription(product, sub))

        # Excluded by negative keyword
        sub_neg = {
            "max_price": None,
            "min_savings": None,
            "brands": None,
            "keywords": "slim,!ideapad",
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_neg))

    def test_build_product_embed(self):
        product = {
            "productName": "ThinkPad L14 Gen 4",
            "productCode": "21H1003GIN",
            "finalPrice": 75000.0,
            "savePercent": 10.0,
            "productCondition": "new",
            "url": "/p/21h1003gin"
        }
        
        embed = _build_product_embed(product, "added")
        self.assertEqual(embed.title, "🆕 Laptop Added / Back in Stock")
        self.assertEqual(embed.description, "**ThinkPad L14 Gen 4**")
        self.assertEqual(embed.fields[0].name, "💰 Price")
        self.assertEqual(embed.fields[0].value, "₹75,000")
        self.assertEqual(embed.fields[1].name, "🏷️ Savings")
        self.assertEqual(embed.fields[1].value, "10.0%")

    @unittest.mock.patch("backend.notifier.discord_bot.is_discord_enabled", return_value=True)
    @unittest.mock.patch("backend.notifier.discord_bot._discord_bot")
    @unittest.mock.patch("backend.notifier.discord_bot.get_db_connection")
    @unittest.mock.patch("asyncio.run_coroutine_threadsafe")
    def test_dispatch_discord_edit_transitions(self, mock_run_coroutine, mock_db_conn, mock_bot, mock_enabled):
        import asyncio
        import discord
        from unittest.mock import MagicMock, AsyncMock
        from backend.notifier.discord_bot import dispatch_discord_edit
        
        # Make run_coroutine_threadsafe execute the coroutine synchronously
        def run_sync(coro, loop):
            asyncio.run(coro)
        mock_run_coroutine.side_effect = run_sync
        
        # Setup database mock
        mock_conn = MagicMock()
        mock_db_conn.return_value = mock_conn
        mock_cursor = mock_conn.cursor.return_value
        
        # --- TEST 1: Transition to cart_hold ---
        mock_cursor.fetchall.return_value = [
            {"channel_id": "123", "message_id": "456", "event_type": "added"}
        ]
        
        mock_channel = MagicMock()
        mock_msg = MagicMock()
        mock_msg.edit = AsyncMock()
        mock_channel.fetch_message = AsyncMock(return_value=mock_msg)
        mock_bot.get_channel.return_value = mock_channel
        
        orig_embed = discord.Embed(
            title="🆕 Laptop Added / Back in Stock",
            description="**ThinkPad L14 Gen 4**",
            color=discord.Color.green(),
            url="https://example.com/p/123"
        )
        orig_embed.add_field(name="💰 Price", value="₹75,000", inline=True)
        orig_embed.add_field(name="⏱️ Listed for", value="5 days", inline=True)
        mock_msg.embeds = [orig_embed]
        
        dispatch_discord_edit("123", "cart_hold", expire_epoch=1700000000)
        
        mock_msg.edit.assert_called_once()
        edited_embeds = mock_msg.edit.call_args[1]["embeds"]
        self.assertEqual(len(edited_embeds), 1)
        emb = edited_embeds[0]
        self.assertEqual(emb.title, "⚠️ Laptop In Someone's Cart")
        self.assertEqual(emb.color, discord.Color.from_rgb(255, 191, 0))
        self.assertIn("Cart Hold Active", emb.description)
        self.assertIn("ThinkPad L14 Gen 4", emb.description)
        
        field_names = [f.name for f in emb.fields]
        self.assertNotIn("⏱️ Listed for", field_names)
        self.assertIn("💰 Price", field_names)
        
        # --- TEST 2: Transition to restocked from removed ---
        mock_msg.edit.reset_mock()
        mock_cursor.fetchall.return_value = [
            {"channel_id": "123", "message_id": "456", "event_type": "removed"}
        ]
        
        removed_embed = discord.Embed(
            title="❌ Laptop Removed / Sold Out",
            description="🔴 **Sold Out** • Confirmed sold\n\n**ThinkPad L14 Gen 4**",
            color=discord.Color.red(),
            url="https://example.com/p/123"
        )
        removed_embed.add_field(name="💰 Price", value="₹75,000", inline=True)
        removed_embed.add_field(name="⏱️ Listed for", value="5 days", inline=True)
        mock_msg.embeds = [removed_embed]
        
        dispatch_discord_edit("123", "restocked")
        
        mock_msg.edit.assert_called_once()
        edited_embeds = mock_msg.edit.call_args[1]["embeds"]
        emb = edited_embeds[0]
        self.assertEqual(emb.color, discord.Color.green())
        self.assertEqual(emb.title, "🆕 Laptop Added / Back in Stock")
        self.assertIn("Back in Stock", emb.description)
        self.assertIn("ThinkPad L14 Gen 4", emb.description)
        self.assertNotIn("Sold Out", emb.description)
        
        field_names = [f.name for f in emb.fields]
        self.assertNotIn("⏱️ Listed for", field_names)
        
        # --- TEST 3: Transition to restocked from price_drop ---
        mock_msg.edit.reset_mock()
        mock_cursor.fetchall.return_value = [
            {"channel_id": "123", "message_id": "456", "event_type": "price_drop"}
        ]
        
        price_drop_embed = discord.Embed(
            title="📉 Price Drop Alert",
            description="**ThinkPad L14 Gen 4**",
            color=discord.Color.blue(),
            url="https://example.com/p/123"
        )
        price_drop_embed.add_field(name="💰 Price", value="₹70,000", inline=True)
        price_drop_embed.add_field(name="📉 Old Price", value="₹75,000", inline=True)
        mock_msg.embeds = [price_drop_embed]
        
        dispatch_discord_edit("123", "restocked")
        
        mock_msg.edit.assert_called_once()
        edited_embeds = mock_msg.edit.call_args[1]["embeds"]
        emb = edited_embeds[0]
        self.assertEqual(emb.color, discord.Color.blue())
        self.assertEqual(emb.title, "📉 Price Drop Alert")
        
        field_names = [f.name for f in emb.fields]
        self.assertNotIn("📉 Old Price", field_names)

if __name__ == "__main__":
    unittest.main()
