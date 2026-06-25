import json
import time
from typing import Optional, List, Dict, Any
from backend.config import settings
from backend.logging_config import _log
from backend.db.connection import get_db_connection
from backend.scraper.enrichment import get_product_cpu_gpu

# Try importing pywebpush
try:
    from pywebpush import webpush, WebPushException
    HAS_PYWEBPUSH = True
except ImportError:
    HAS_PYWEBPUSH = False

def send_push(subscription_id: int, endpoint: str, p256dh: str, auth: str, payload: dict) -> bool:
    """Send web push notification using pywebpush."""
    if not settings.PUSH_ENABLED or not HAS_PYWEBPUSH:
        return False
        
    subscription_info = {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth
        }
    }
    
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={
                "sub": settings.VAPID_SUBJECT
            },
            headers={
                "Urgency": "high",
                "TTL": "3600"
            },
            timeout=10
        )
        
        # Update last_used timestamp
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            now_str = time.strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("UPDATE push_subscriptions SET last_used = ? WHERE id = ?", (now_str, subscription_id))
            conn.commit()
        finally:
            conn.close()
        return True
    except WebPushException as ex:
        _log(f"[Push] WebPushException for sub {subscription_id}: {ex}")
        # Prune if status is 404 (Not Found) or 410 (Gone)
        if ex.response is not None and ex.response.status_code in (404, 410):
            _log(f"[Push] Subscription {subscription_id} is dead/expired. Pruning...")
            _prune_subscription(subscription_id)
        return False
    except Exception as e:
        _log(f"[Push] Unexpected error sending push to sub {subscription_id}: {e}")
        return False

def _prune_subscription(subscription_id: int) -> None:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM push_subscriptions WHERE id = ?", (subscription_id,))
        conn.commit()
        _log(f"[Push] Deleted subscription {subscription_id}")
    except Exception as e:
        _log(f"[Push] Failed to delete subscription {subscription_id}: {e}")
    finally:
        conn.close()

def _get_matching_subscriptions(product_code: str) -> List[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id, s.endpoint, s.p256dh, s.auth, 
                   s.notify_price_drops, s.notify_new_listings, s.notify_back_in_stock,
                   s.notify_watchlist_only, s.min_drop_percent,
                   (SELECT 1 FROM subscription_watchlist w 
                    WHERE w.subscription_id = s.id AND w.product_code = ?) as is_in_watchlist
            FROM push_subscriptions s
        """, (product_code,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        _log(f"[Push] Error querying subscriptions: {e}")
        return []
    finally:
        conn.close()

def _get_all_subscriptions() -> List[dict]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id, s.endpoint, s.p256dh, s.auth, 
                   s.notify_price_drops, s.notify_new_listings, s.notify_back_in_stock,
                   s.notify_watchlist_only, s.min_drop_percent
            FROM push_subscriptions s
        """)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        _log(f"[Push] Error querying all subscriptions: {e}")
        return []
    finally:
        conn.close()

def _get_watchlist_for_sub(subscription_id: int) -> List[str]:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT product_code FROM subscription_watchlist WHERE subscription_id = ?", (subscription_id,))
        rows = cursor.fetchall()
        return [r[0] for r in rows]
    except Exception as e:
        _log(f"[Push] Error querying watchlist for subscription {subscription_id}: {e}")
        return []
    finally:
        conn.close()


def notify_new_listing(product: dict) -> None:
    if not settings.PUSH_ENABLED:
        return
    
    code = product.get("productCode", "?")
    name = product.get("productName", "Unknown Laptop")
    price = product.get("finalPrice", "N/A")
    saving = product.get("savePercent", 0)
    
    cpu, gpu = get_product_cpu_gpu(product)
    payload = {
        "event_type": "new_listing",
        "title": "New Laptop Listed",
        "body": f"{name} is now available for {price} INR (-{saving}%) | CPU: {cpu} | GPU: {gpu}",
        "product_code": code,
        "price": price,
        "save_percent": saving
    }
    
    subs = _get_matching_subscriptions(code)
    for sub in subs:
        if sub["notify_watchlist_only"] == 1 and not sub["is_in_watchlist"]:
            continue
        if sub["notify_new_listings"] == 0:
            continue
            
        send_push(sub["id"], sub["endpoint"], sub["p256dh"], sub["auth"], payload)

def notify_back_in_stock(product: dict) -> None:
    if not settings.PUSH_ENABLED:
        return
        
    code = product.get("productCode", "?")
    name = product.get("productName", "Unknown Laptop")
    price = product.get("finalPrice", "N/A")
    saving = product.get("savePercent", 0)
    
    restock_dur = product.get("_restock_duration")
    body_suffix = f" (Restocked after {restock_dur})" if restock_dur else ""
    
    cpu, gpu = get_product_cpu_gpu(product)
    payload = {
        "event_type": "back_in_stock",
        "title": "Laptop Back in Stock",
        "body": f"{name} is back! Price: {price} INR (-{saving}%){body_suffix} | CPU: {cpu} | GPU: {gpu}",
        "product_code": code,
        "price": price,
        "save_percent": saving
    }
    
    subs = _get_matching_subscriptions(code)
    for sub in subs:
        if sub["notify_watchlist_only"] == 1 and not sub["is_in_watchlist"]:
            continue
        if sub["notify_back_in_stock"] == 0:
            continue
            
        send_push(sub["id"], sub["endpoint"], sub["p256dh"], sub["auth"], payload)

def notify_price_drop(product: dict, old_price: float, new_price: float) -> None:
    if not settings.PUSH_ENABLED:
        return
        
    code = product.get("productCode", "?")
    name = product.get("productName", "Unknown Laptop")
    saving = product.get("savePercent", 0)
    
    # Calculate price drop percentage
    drop_percent = 0.0
    if old_price > 0:
        drop_percent = round((old_price - new_price) / old_price * 100, 2)
        
    cpu, gpu = get_product_cpu_gpu(product)
    payload = {
        "event_type": "price_drop",
        "title": "Price Drop Alert",
        "body": f"{name} dropped to {new_price} INR (Was {old_price} INR) | CPU: {cpu} | GPU: {gpu}",
        "product_code": code,
        "price": new_price,
        "old_price": old_price,
        "save_percent": saving,
        "drop_percent": drop_percent
    }
    
    subs = _get_matching_subscriptions(code)
    for sub in subs:
        if sub["notify_watchlist_only"] == 1 and not sub["is_in_watchlist"]:
            continue
        if sub["notify_price_drops"] == 0:
            continue
        if drop_percent < (sub["min_drop_percent"] or 0.0):
            continue
            
        send_push(sub["id"], sub["endpoint"], sub["p256dh"], sub["auth"], payload)

def notify_batch(products: List[dict], event_type: str) -> None:
    if not settings.PUSH_ENABLED or not products:
        return
        
    count = len(products)
    subs = _get_all_subscriptions()
    
    for sub in subs:
        # Check preferences
        if event_type == "new_listing" and sub["notify_new_listings"] == 0:
            continue
        if event_type == "back_in_stock" and sub["notify_back_in_stock"] == 0:
            continue
            
        # Filter products based on watchlist if notify_watchlist_only is set
        matching_products = products
        if sub["notify_watchlist_only"] == 1:
            watchlist = _get_watchlist_for_sub(sub["id"])
            matching_products = [p for p in products if p.get("productCode") in watchlist]
            if not matching_products:
                continue
        
        match_count = len(matching_products)
        if match_count < 5:
            for p in matching_products:
                code = p.get("productCode", "?")
                name = p.get("productName", "Unknown Laptop")
                price = p.get("finalPrice", "N/A")
                saving = p.get("savePercent", 0)
                cpu, gpu = get_product_cpu_gpu(p)
                if event_type == "new_listing":
                    payload = {
                        "event_type": "new_listing",
                        "title": "New Laptop Listed",
                        "body": f"{name} is now available for {price} INR (-{saving}%) | CPU: {cpu} | GPU: {gpu}",
                        "product_code": code,
                        "price": price,
                        "save_percent": saving
                    }
                else:
                    restock_dur = p.get("_restock_duration")
                    body_suffix = f" (Restocked after {restock_dur})" if restock_dur else ""
                    payload = {
                        "event_type": "back_in_stock",
                        "title": "Laptop Back in Stock",
                        "body": f"{name} is back! Price: {price} INR (-{saving}%){body_suffix} | CPU: {cpu} | GPU: {gpu}",
                        "product_code": code,
                        "price": price,
                        "save_percent": saving
                    }
                send_push(sub["id"], sub["endpoint"], sub["p256dh"], sub["auth"], payload)
        else:
            # Send batch notification
            if event_type == "new_listing":
                title = f"{match_count} Laptops Listed"
                body = f"{match_count} laptops added to stock"
            else:
                title = f"{match_count} Laptops Back in Stock"
                body = f"{match_count} laptops added to stock"
                
            payload = {
                "event_type": f"{event_type}_batch",
                "title": title,
                "body": body,
                "product_code": "",  # Redirects to browse
                "count": match_count
            }
            send_push(sub["id"], sub["endpoint"], sub["p256dh"], sub["auth"], payload)


