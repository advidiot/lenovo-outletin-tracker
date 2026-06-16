import os
import sys
import time
import signal
import argparse
import threading
import socketserver
import http.server
import asyncio
from typing import Dict, Any

from backend.config import settings
from backend.logging_config import _log
from backend.db.connection import get_db_connection
from backend.db.migrations import run_migrations
from backend.scraper.api import get_all_active_products
from backend.scraper.processor import process_scanned_products
from backend.scraper.enrichment import enrich_specs, clean_ghost_listings, verify_and_enrich
from backend.notifier.ntfy import send_startup_alert, send_once_complete_alert
from backend.server.handler import LaptopTrackerHandler
from backend.notifier.telegram import (
    send_telegram_notification,
    send_telegram_batch,
    send_telegram_startup_alert,
    send_telegram_once_complete_alert
)
from backend.notifier.push import (
    notify_new_listing,
    notify_back_in_stock,
    notify_batch
)

# Global state
_shutdown_requested = False
scraper_lock = threading.Lock()
httpd = None

def trigger_manual_scrape(is_first_run: bool = False) -> dict:
    """Run a manual scrape process under scraper lock. Returns status dictionary."""
    acquired = scraper_lock.acquire(blocking=False)
    if not acquired:
        return {"success": False, "error": "A scrape or database update is already in progress."}
    try:
        _log("[API] Manual scrape triggered...")
        products, partial_scan = get_all_active_products()
        if products is None:
            return {"success": False, "error": "Failed to retrieve products from Lenovo API."}
        
        products = verify_and_enrich(products)
        if products is None:
            return {"success": False, "error": "Compare API unavailable. Cycle aborted (fail-closed)."}
        process_scanned_products(products, is_first_run=is_first_run, partial_scan=partial_scan)
        
        # Count stats
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM products WHERE active = 1")
            active_count = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM products WHERE active = 0")
            removed_count = cursor.fetchone()[0]
        finally:
            conn.close()

        return {
            "success": True,
            "scanned_count": len(products),
            "active_count": active_count,
            "removed_count": removed_count
        }
    except Exception as e:
        _log(f"[API] Manual scrape failed: {e}")
        return {"success": False, "error": str(e)}
    finally:
        scraper_lock.release()

def trigger_ghost_cleanup() -> dict:
    """Run a manual ghost cleanup under scraper lock. Returns status dictionary."""
    acquired = scraper_lock.acquire(blocking=False)
    if not acquired:
        return {"success": False, "error": "A scrape or database update is already in progress."}
    try:
        _log("[API] Ghost cleanup triggered...")
        cleaned_codes = clean_ghost_listings()
        return {
            "success": True,
            "cleaned_count": len(cleaned_codes),
            "cleaned_codes": cleaned_codes
        }
    except Exception as e:
        _log(f"[API] Ghost cleanup failed: {e}")
        return {"success": False, "error": str(e)}
    finally:
        scraper_lock.release()

def _handle_shutdown(signum: int, frame) -> None:
    """Handle SIGTERM/SIGINT for graceful shutdown."""
    global _shutdown_requested
    _shutdown_requested = True
    _log(f"Received shutdown signal {signum}. Shutting down gracefully…")
    if httpd:
        threading.Thread(target=httpd.shutdown, daemon=True).start()

def dispatch_all_notifications(new_listings: list, back_in_stock: list, is_first_run: bool, silent: bool) -> None:
    """Dispatches Telegram notifications and Web Push notifications for updates."""
    if is_first_run or silent:
        return

    # Telegram notifications for back_in_stock
    if back_in_stock:
        if len(back_in_stock) >= settings.NOTIFICATION_BATCH_THRESHOLD:
            send_telegram_batch(back_in_stock, "restock")
        else:
            for p in back_in_stock:
                send_telegram_notification(p, "restock")
                time.sleep(1)

    # Telegram notifications for new_listings (Point 3)
    if new_listings:
        if len(new_listings) >= settings.NOTIFICATION_BATCH_THRESHOLD:
            send_telegram_batch(new_listings, "added")
        else:
            for p in new_listings:
                send_telegram_notification(p, "added")
                time.sleep(1)

    # Web Push notifications
    if new_listings:
        if len(new_listings) >= 5:
            notify_batch(new_listings, "new_listing")
        else:
            for p in new_listings:
                notify_new_listing(p)
                
    if back_in_stock:
        if len(back_in_stock) >= 5:
            notify_batch(back_in_stock, "back_in_stock")
        else:
            for p in back_in_stock:
                notify_back_in_stock(p)



# ---------------------------------------------------------------------------
# Background Scraper Loop & Daemon
# ---------------------------------------------------------------------------

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

def run_scraper_loop(args):
    """Scraper daemon loop that runs inside a background thread."""
    global _shutdown_requested
    
    # Load db counts
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM products")
        db_count = cursor.fetchone()[0]
    finally:
        conn.close()

    is_first_run = db_count == 0
    cycle = 0

    _log("Initializing background scraper loop…")
    
    if is_first_run:
        _log("Database is empty. Performing initial background scan…")
    else:
        _log(f"Database contains {db_count} records. Ready to monitor.")
        if not args.silent:
            send_startup_alert(db_count)
            send_telegram_startup_alert(db_count)

    # Wait for Discord bot to connect and be ready if enabled
    if not args.silent:
        from backend.notifier.discord_bot import is_discord_enabled, get_discord_bot
        if is_discord_enabled():
            _log("Waiting for Discord bot to connect and be ready before starting scans...")
            for _ in range(60):
                bot = get_discord_bot()
                if bot and bot.is_ready():
                    _log("Discord bot is ready. Starting scraper scans.")
                    break
                time.sleep(0.5)
            else:
                _log("Warning: Discord bot is still not ready after 30 seconds. Proceeding with scans anyway.")

    while not _shutdown_requested:
        cycle += 1
        try:
            with scraper_lock:
                products, partial_scan = get_all_active_products()
                if products is not None:
                    products = verify_and_enrich(products)
                    if products is None:
                        _log(f"[Cycle {cycle}] Compare API unavailable. Skipping cycle (fail-closed).")
                    else:
                        new_listings, back_in_stock = process_scanned_products(
                            products,
                            is_first_run=is_first_run or args.silent,
                            partial_scan=partial_scan
                        )

                        # Dispatch Telegram + Push notifications
                        dispatch_all_notifications(new_listings, back_in_stock, is_first_run or args.silent, args.silent)

                        conn = get_db_connection()
                        try:
                            cursor = conn.cursor()
                            cursor.execute("SELECT COUNT(*) FROM products WHERE active = 1")
                            active_count = cursor.fetchone()[0]
                            cursor.execute("SELECT COUNT(*) FROM products WHERE active = 0")
                            removed_count = cursor.fetchone()[0]
                        finally:
                            conn.close()
                        _log(f"[Cycle {cycle}] Scan complete. Active: {active_count} | Removed: {removed_count} | Scanned: {len(products)}")

                        if is_first_run:
                            _log(f"Initial scan complete. Database seeded with {len(products)} products.")
                            if not args.silent:
                                send_startup_alert(len(products))
                                send_telegram_startup_alert(len(products))
                            is_first_run = False
                else:
                    _log(f"[Cycle {cycle}] Failed to retrieve products. Retrying in {settings.POLL_INTERVAL}s…")

        except Exception as e:
            _log(f"[Cycle {cycle}] Unexpected error: {e}")

        # Sleep in increments of 1s to ensure responsive shutdown
        for _ in range(settings.POLL_INTERVAL):
            if _shutdown_requested:
                break
            time.sleep(1)

    _log("Scraper background loop stopped.")

def run_discord_bot() -> None:
    from backend.notifier.discord_bot import (
        is_discord_enabled,
        get_discord_bot
    )
    if not is_discord_enabled():
        _log("[Discord] Discord bot is disabled or configuration is incomplete.")
        return

    _log("[Discord] Starting Discord bot in background thread...")
    bot = get_discord_bot()
    if not bot:
        return
    
    async def start_bot():
        try:
            await bot.start(settings.DISCORD_BOT_TOKEN)
        except Exception as e:
            _log(f"[Discord] Bot execution error: {e}")

    # Set up event loop for discord bot thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        loop.run_until_complete(start_bot())
    except Exception as e:
        _log(f"[Discord] Event loop error: {e}")
    finally:
        try:
            pending = asyncio.all_tasks(loop)
            for task in pending:
                task.cancel()
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.close()
        except Exception:
            pass

# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------

def main() -> None:
    # Setup signal handlers in the main thread
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    parser = argparse.ArgumentParser(description="Logaze India Laptop Tracker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single sync scan and exit instead of running in a loop."
    )
    parser.add_argument(
        "--silent",
        action="store_true",
        help="Run silently without sending any push notifications (use with --once or on initial run)."
    )
    parser.add_argument(
        "--sync-commands",
        action="store_true",
        help="Sync Discord slash commands globally."
    )
    args = parser.parse_args()

    # Initialise schema tables and migrations
    run_migrations()

    # Initialize Discord bot status and instance
    from backend.notifier.discord_bot import init_discord_bot, is_discord_enabled
    bot = init_discord_bot(sync_commands=args.sync_commands)

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM products")
        db_count = cursor.fetchone()[0]
    finally:
        conn.close()

    is_first_run = db_count == 0

    # CLI scan mode (--once)
    if args.once:
        _log("Running single scan (--once)…")
        try:
            products, partial_scan = get_all_active_products()
            if products is None:
                _log("Failed to retrieve products. Exiting with error.")
                sys.exit(1)

            products = verify_and_enrich(products)
            if products is None:
                _log("Compare API unavailable. Aborting single scan (fail-closed).")
                sys.exit(1)
            new_listings, back_in_stock = process_scanned_products(
                products, 
                is_first_run=is_first_run or args.silent, 
                partial_scan=partial_scan
            )

            # Dispatch Telegram + Push notifications
            dispatch_all_notifications(new_listings, back_in_stock, is_first_run or args.silent, args.silent)

            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM products WHERE active = 1")
                active_count = cursor.fetchone()[0]
                cursor.execute("SELECT COUNT(*) FROM products WHERE active = 0")
                removed_count = cursor.fetchone()[0]
            finally:
                conn.close()
            _log(f"Scan complete. Active: {active_count} | Removed: {removed_count} | Scanned: {len(products)}")

            if is_first_run:
                _log(f"Initial scan complete. Database seeded with {len(products)} products.")
                if not args.silent:
                    send_startup_alert(len(products))
                    send_telegram_startup_alert(len(products))
            else:
                if not args.silent:
                    send_once_complete_alert(active_count, removed_count)
                    send_telegram_once_complete_alert(active_count, removed_count)

        except Exception as e:
            _log(f"Unexpected error during single scan: {e}")
            sys.exit(1)
        _log("Single scan complete. Exiting.")
        return

    # Regular Web Server + Background Scraper mode
    os.makedirs(settings.STATIC_DIR, exist_ok=True)
    
    # Launch Discord bot daemon thread
    discord_thread = None
    if is_discord_enabled():
        discord_thread = threading.Thread(target=run_discord_bot, daemon=True)
        discord_thread.start()

    # Launch scraper loop daemon thread
    scraper_thread = threading.Thread(target=run_scraper_loop, args=(args,), daemon=True)
    scraper_thread.start()

    global httpd
    # Start multi-threaded HTTP server
    server_address = ('', settings.PORT)
    httpd = ThreadingHTTPServer(server_address, LaptopTrackerHandler)
    _log(f"Logaze India tracker serving at http://localhost:{settings.PORT}")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        _log("KeyboardInterrupt received. Stopping server...")
    finally:
        global _shutdown_requested
        _shutdown_requested = True
        httpd.server_close()
        _log("Server stopped. Waiting for background thread shutdown...")
        scraper_thread.join(timeout=3)
        if (is_discord_enabled() and bot and hasattr(bot, 'loop') and 
                hasattr(bot.loop, 'is_running') and bot.loop.is_running()):
            _log("Closing Discord bot connection...")
            import concurrent.futures
            fut = asyncio.run_coroutine_threadsafe(bot.close(), bot.loop)
            try:
                fut.result(timeout=3)
            except (asyncio.CancelledError, concurrent.futures.CancelledError):
                _log("Discord bot connection closed.")
            except (asyncio.TimeoutError, concurrent.futures.TimeoutError, TimeoutError):
                _log("Timeout waiting for Discord bot connection to close.")
            except Exception as e:
                _log(f"Error closing Discord bot: {type(e).__name__}: {e}")
        _log("Stopped.")
        sys.exit(0)
