import json
import time
from typing import Optional, List, Dict, Any
from backend.config import settings
from backend.logging_config import _log
from backend.db.connection import get_db_connection

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

def notify_new_listing(product: dict) -> None:
    if not settings.PUSH_ENABLED:
        return
    
    code = product.get("productCode", "?")
    name = product.get("productName", "Unknown Laptop")
    price = product.get("finalPrice", "N/A")
    saving = product.get("savePercent", 0)
    
    payload = {
        "event_type": "new_listing",
        "title": "New Laptop Listed",
        "body": f"{name} is now available for {price} INR (-{saving}%)",
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
    
    payload = {
        "event_type": "back_in_stock",
        "title": "Laptop Back in Stock",
        "body": f"{name} is back! Price: {price} INR (-{saving}%)",
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
        
    payload = {
        "event_type": "price_drop",
        "title": "Price Drop Alert",
        "body": f"{name} dropped to {new_price} INR (Was {old_price} INR)",
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
