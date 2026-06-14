import json
import time
from typing import Optional, List, Dict, Any
from backend.config import settings
from backend.logging_config import _log, current_time
from backend.db.connection import get_db_connection
from backend.notifier.ntfy import send_push_notification, _send_batch_summary
from backend.notifier.discord_bot import dispatch_discord_alerts
from backend.notifier.telegram import send_telegram_notification

def _compute_listing_duration(first_seen: Optional[str], removed_at: str) -> Optional[str]:
    if not first_seen:
        return None
    try:
        fmt = "%Y-%m-%d %H:%M:%S"
        t1 = time.mktime(time.strptime(first_seen, fmt))
        t2 = time.mktime(time.strptime(removed_at, fmt))
        delta = int(t2 - t1)
        if delta < 0:
            return None
        days, rem = divmod(delta, 86400)
        hours, rem = divmod(rem, 3600)
        minutes = rem // 60
        parts = []
        if days:
            parts.append(f"{days}d")
        if hours:
            parts.append(f"{hours}h")
        if minutes or not parts:
            parts.append(f"{minutes}m")
        return " ".join(parts)
    except (ValueError, OverflowError):
        return None

def _insert_price_history(cursor, product_code: str, timestamp: str, price: float, save_percent: float) -> None:
    """Helper to insert into price_history, calculating price_delta and preventing duplicates."""
    cursor.execute("""
        SELECT price FROM price_history 
        WHERE product_code = ? 
        ORDER BY timestamp DESC, id DESC LIMIT 1
    """, (product_code,))
    row = cursor.fetchone()
    if row is not None:
        last_price = row[0]
        price_delta = price - last_price
        if abs(price_delta) <= 0.01:
            # Price has not changed, skip duplicate
            return
    else:
        price_delta = 0.0

    cursor.execute("""
        INSERT INTO price_history (product_code, timestamp, price, save_percent, price_delta)
        VALUES (?, ?, ?, ?, ?)
    """, (product_code, timestamp, price, save_percent, price_delta))

def process_scanned_products(products: list[dict], is_first_run: bool, partial_scan: bool = False) -> tuple[list[dict], list[dict]]:
    """Compare freshly-scanned product list against database and process updates."""
    conn = get_db_connection()
    new_listings: list[dict] = []
    back_in_stock: list[dict] = []
    try:
        cursor = conn.cursor()

        now = current_time()
        scanned_codes: set[str] = set()

        added_queue: list[dict] = []
        removed_queue: list[dict] = []

        for p in products:
            code = p.get("productCode")
            if not code:
                continue
            scanned_codes.add(code)

            name = p.get("productName")
            condition = p.get("productCondition", settings.DEFAULT_CONDITION)

            try:
                original_price = float(p.get("webPrice", 0))
            except (ValueError, TypeError):
                original_price = 0.0
            try:
                current_price = float(p.get("finalPrice", 0))
            except (ValueError, TypeError):
                current_price = 0.0
            try:
                save_percent = float(p.get("savePercent", 0))
            except (ValueError, TypeError):
                save_percent = 0.0
            try:
                rating_star = float(p.get("ratingStar", 0)) or None
            except (ValueError, TypeError):
                rating_star = None
            try:
                comment_count = int(p.get("commentCount", 0)) or None
            except (ValueError, TypeError):
                comment_count = None

            classification = p.get("classification", [])
            specs_json = json.dumps(
                {s["a"]: s["b"] for s in classification if "a" in s and "b" in s},
                ensure_ascii=False,
            ) if classification else None

            thumbnail_url = (
                p.get("media", {}).get("thumbnail", {}).get("imageAddress") or None
            )

            cursor.execute("SELECT current_price, active FROM products WHERE product_code = ?", (code,))
            row = cursor.fetchone()

            # Recalculate save_percent dynamically to avoid stale or missing value
            calculated_save_percent = round((1.0 - current_price / original_price) * 100, 2) if original_price > 0 else save_percent

            if row is None:
                _log(f"NEW PRODUCT DETECTED: {code} - {name}")
                cursor.execute("""
                    INSERT INTO products (
                        product_code, product_name, condition, first_seen, last_seen, removed_at,
                        original_price, current_price, save_percent, active,
                        specs, rating_star, comment_count, thumbnail_url, full_specs
                    )
                    VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, ?, ?, ?, ?, NULL)
                """, (code, name, condition, now, now, original_price, current_price, calculated_save_percent,
                      specs_json, rating_star, comment_count, thumbnail_url))
                
                _insert_price_history(cursor, code, now, current_price, calculated_save_percent)

                if not is_first_run:
                    new_listings.append(p)
                    added_queue.append(p)
            else:
                db_price = row["current_price"]
                was_active = row["active"]

                cursor.execute("""
                    UPDATE products
                    SET last_seen = ?, active = 1, removed_at = NULL, product_name = ?, original_price = ?,
                        save_percent = ?, specs = ?, rating_star = ?, comment_count = ?, thumbnail_url = ?
                    WHERE product_code = ?
                """, (now, name, original_price, calculated_save_percent, specs_json, rating_star, comment_count, thumbnail_url, code))

                if was_active == 0:
                    _log(f"PRODUCT BACK IN STOCK: {code} - {name}")
                    _insert_price_history(cursor, code, now, current_price, calculated_save_percent)
                    if not is_first_run:
                        back_in_stock.append(p)
                        added_queue.append(p)

                # Float tolerance price comparison to avoid precision noise
                if abs(current_price - db_price) > 0.01:
                    _log(f"PRICE CHANGE for {code}: {db_price} -> {current_price} INR")
                    cursor.execute(
                        "UPDATE products SET current_price = ?, save_percent = ? WHERE product_code = ?",
                        (current_price, calculated_save_percent, code),
                    )
                    _insert_price_history(cursor, code, now, current_price, calculated_save_percent)

                    if not is_first_run and was_active == 1:
                        if current_price < db_price:
                            send_push_notification(p, ntfy_type="price_drop", old_price=db_price)
                            dispatch_discord_alerts([p], "price_drop", old_price=db_price)
                            send_telegram_notification(p, "price_drop", old_price=db_price)
                            from backend.notifier.discord_bot import dispatch_watchlist_alerts
                            dispatch_watchlist_alerts(p, "price_drop", old_price=db_price)
                            from backend.notifier.push import notify_price_drop
                            notify_price_drop(p, old_price=db_price, new_price=current_price)
                        else:
                            send_push_notification(p, ntfy_type="price_hike", old_price=db_price)
                            dispatch_discord_alerts([p], "price_hike", old_price=db_price)
                        time.sleep(1)

        # --- Detect removed products ---
        if not partial_scan:
            cursor.execute(
                "SELECT product_code, product_name, condition, current_price, save_percent, first_seen FROM products WHERE active = 1"
            )
            active_rows = cursor.fetchall()
            for row in active_rows:
                active_code = row["product_code"]
                if active_code not in scanned_codes:
                    _log(f"PRODUCT REMOVED (SOLD OUT): {active_code} - {row['product_name']}")
                    cursor.execute(
                        "UPDATE products SET active = 0, removed_at = ? WHERE product_code = ?",
                        (now, active_code),
                    )

                    if not is_first_run:
                        duration = _compute_listing_duration(row["first_seen"], now)
                        dummy_product = {
                            "productCode": active_code,
                            "productName": row["product_name"],
                            "productCondition": row["condition"],
                            "finalPrice": row["current_price"],
                            "savePercent": row["save_percent"],
                            "url": f"/p/{active_code}",
                            "_listing_duration": duration,
                        }
                        removed_queue.append(dummy_product)

        conn.commit()
    finally:
        conn.close()

    if not is_first_run:
        _dispatch_notifications(added_queue, "added", settings.NTFY_TOPIC)
        _dispatch_notifications(removed_queue, "removed", settings.NTFY_TOPIC_REMOVED)
        dispatch_discord_alerts(added_queue, "added")
        dispatch_discord_alerts(removed_queue, "removed")
        if added_queue:
            from backend.notifier.discord_bot import dispatch_watchlist_alerts
            for p in added_queue:
                dispatch_watchlist_alerts(p, "added")

    return new_listings, back_in_stock

def _dispatch_notifications(queue: list[dict], ntfy_type: str, topic: str) -> None:
    if not queue:
        return
    if len(queue) >= settings.NOTIFICATION_BATCH_THRESHOLD:
        _send_batch_summary(queue, ntfy_type, topic)
    else:
        for p in queue:
            duration = p.get("_listing_duration")
            send_push_notification(p, ntfy_type=ntfy_type, listing_duration=duration)
            time.sleep(1)
