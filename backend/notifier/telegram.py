import time
from typing import Optional, List
from backend.config import settings
from backend.logging_config import _log
from backend.scraper.api import _get_session
import requests as standard_requests
from backend.db.connection import get_db_connection
from backend.scraper.enrichment import clean_model

def _truncate_name(name: str, max_len: int = 40) -> str:
    if len(name) <= max_len:
        return name
    return name[:max_len] + "…"

def _escape_html(text: str) -> str:
    """Escape HTML special characters for Telegram HTML parse mode."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def _send_telegram_text(text: str, chat_id: Optional[str] = None, photo_url: Optional[str] = None) -> tuple[Optional[str], Optional[str]]:
    if not settings.TELEGRAM_BOT_TOKEN:
        return None, None
    
    target_chat = chat_id or settings.TELEGRAM_CHANNEL_ID
    if not target_chat:
        return None, None
    
    if photo_url and photo_url.startswith("//"):
        photo_url = "https:" + photo_url

    # Try sending photo if photo_url is provided and caption fits within limits
    if photo_url and len(text) <= 1024:
        try:
            session = _get_session()
            # Override accept header to prevent Lenovo's CDN from serving AVIF (which Telegram sendPhoto does not support)
            download_headers = {"accept": "image/png,image/jpeg,image/webp"}
            img_resp = session.get(photo_url, headers=download_headers, timeout=15)
            if img_resp.status_code == 200:
                img_data = img_resp.content
                photo_url_api = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendPhoto"
                
                mime = img_resp.headers.get("content-type", "image/png").split(";")[0].strip()
                filename = "thumbnail.png"
                if "jpeg" in mime.lower() or "jpg" in mime.lower():
                    filename = "thumbnail.jpg"
                    mime = "image/jpeg"
                elif "webp" in mime.lower():
                    filename = "thumbnail.webp"
                    mime = "image/webp"
                elif "gif" in mime.lower():
                    filename = "thumbnail.gif"
                    mime = "image/gif"

                files = {
                    "photo": (filename, img_data, mime)
                }
                photo_payload = {
                    "chat_id": target_chat,
                    "caption": text,
                    "parse_mode": "HTML"
                }
                
                resp = standard_requests.post(photo_url_api, data=photo_payload, files=files, timeout=20)
                if resp.status_code == 200:
                    try:
                        res_json = resp.json()
                        msg_id = res_json.get("result", {}).get("message_id")
                        if msg_id:
                            return str(msg_id), "photo"
                    except Exception:
                        pass
                    return None, None
                else:
                    _log(f"[Telegram] Failed to upload photo: HTTP {resp.status_code} - {resp.text}. Falling back to text.")
            else:
                _log(f"[Telegram] Failed to download photo from CDN: HTTP {img_resp.status_code}. Falling back to text.")
        except Exception as e:
            _log(f"[Telegram] Error sending photo: {e}. Falling back to text.")

    # Fallback to sendMessage
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    
    # Split text into chunks of <= 4000 characters without breaking lines if possible
    chunks = []
    while len(text) > 4000:
        split_idx = text.rfind("\n", 0, 4000)
        if split_idx == -1:
            split_idx = 4000
        chunks.append(text[:split_idx])
        text = text[split_idx:].lstrip()
    if text:
        chunks.append(text)
        
    last_msg_id = None
    for chunk in chunks:
        payload = {
            "chat_id": target_chat,
            "text": chunk,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        try:
            session = _get_session()
            resp = session.post(url, json=payload, timeout=15)
            if resp.status_code == 200:
                try:
                    res_json = resp.json()
                    msg_id = res_json.get("result", {}).get("message_id")
                    if msg_id:
                        last_msg_id = str(msg_id)
                except Exception:
                    pass
            else:
                _log(f"[Telegram] Failed to send message: HTTP {resp.status_code} - {resp.text}")
        except Exception as e:
            _log(f"[Telegram] Error sending message: {e}")
            
    if last_msg_id:
        return last_msg_id, "text"
    return None, None

def send_telegram_startup_alert(db_count: int) -> None:
    if not settings.TELEGRAM_OWNER_ID:
        return
    text = (
        f"<b>Logaze India Tracker Online</b>\n\n"
        f"Monitoring active.\n"
        f"Database loaded with {db_count} models."
    )
    _send_telegram_text(text, chat_id=settings.TELEGRAM_OWNER_ID)

def send_telegram_once_complete_alert(active_count: int, removed_count: int) -> None:
    if not settings.TELEGRAM_OWNER_ID:
        return
    text = (
        f"<b>Logaze India: Scan Complete</b>\n\n"
        f"Manual scan finished successfully.\n"
        f"Active models: {active_count}\n"
        f"Removed models: {removed_count}"
    )
    _send_telegram_text(text, chat_id=settings.TELEGRAM_OWNER_ID)

def send_telegram_notification(
    product: dict,
    event_type: str = "added",
    old_price: Optional[float] = None,
    listing_duration: Optional[str] = None,
) -> None:
    if not settings.TELEGRAM_ENABLED:
        return
        
    if listing_duration is None:
        listing_duration = product.get("_listing_duration")
        
    name = _escape_html(product.get("productName", "Unknown Laptop"))
    price = product.get("finalPrice", "N/A")
    saving = product.get("savePercent", "N/A")
    condition = _escape_html(product.get("productCondition", settings.DEFAULT_CONDITION))
    code = _escape_html(product.get("productCode", "?"))

    display_name = _truncate_name(name)

    # Resolve product URL
    url_path = product.get("url") or f"/p/{code}"
    if url_path.startswith("http"):
        url = url_path
    elif url_path:
        if not url_path.startswith("/"):
            url_path = f"/{url_path}"
        url = f"{settings.LENOVO_BASE_URL}{url_path}"
    else:
        url = settings.LENOVO_LAPTOPS_URL

    if event_type == "added":
        title = f"Laptop Added: <a href=\"{url}\">{display_name}</a>"
        body = f"Model: {code}\nPrice: {price} INR (-{saving}%)\nCondition: {condition}\n\n🔗 <a href=\"{url}\">Buy on Lenovo Store</a>"
    elif event_type == "restock":
        title = f"Laptop Restocked: <a href=\"{url}\">{display_name}</a>"
        body = f"Model: {code}\nPrice: {price} INR (-{saving}%)\nCondition: {condition}\n\n🔗 <a href=\"{url}\">Buy on Lenovo Store</a>"
    elif event_type == "price_drop":
        title = f"Price Drop: <a href=\"{url}\">{display_name}</a>"
        body = f"Model: {code}\nNew Price: {price} INR (Was {old_price} INR)\nSavings: -{saving}%\n\n🔗 <a href=\"{url}\">Buy on Lenovo Store</a>"
    elif event_type == "price_hike":
        title = f"Price Hike: <a href=\"{url}\">{display_name}</a>"
        body = f"Model: {code}\nNew Price: {price} INR (Was {old_price} INR)\nSavings: -{saving}%\n\n🔗 <a href=\"{url}\">Buy on Lenovo Store</a>"
    elif event_type == "removed":
        title = f"Laptop Removed: <a href=\"{url}\">{display_name}</a>"
        lines = [f"Model: {code}"]
        if price != "N/A":
            lines.append(f"Last Price: {price} INR (-{saving}%)")
        if condition:
            lines.append(f"Condition: {condition}")
        if listing_duration:
            lines.append(f"Listed for: {listing_duration}")
        lines.append("This item has been removed or sold out.")
        body = "\n".join(lines)
    else:
        title = f"Tracker Alert: <a href=\"{url}\">{display_name}</a>"
        body = f"Model: {code}\nUnknown event type: {event_type}"

    photo_url = product.get("thumbnail_url")
    if not photo_url:
        media = product.get("media", {})
        hero = media.get("heroImage") or {}
        thumb = media.get("thumbnail") or {}
        gallery = media.get("gallery", [])

        if isinstance(hero, dict) and hero.get("imageAddress"):
            photo_url = hero.get("imageAddress")
        elif isinstance(thumb, dict) and thumb.get("imageAddress"):
            photo_url = thumb.get("imageAddress")
        elif gallery and isinstance(gallery, list) and len(gallery) > 0:
            item = gallery[0]
            if isinstance(item, dict):
                photo_url = item.get("imageAddress")
 
    if photo_url and photo_url.startswith("//"):
        photo_url = "https:" + photo_url
 
    text = f"<b>{title}</b>\n\n{body}"
    msg_id, msg_type = _send_telegram_text(text, photo_url=photo_url)
    
    if msg_id and settings.TELEGRAM_CHANNEL_ID:
        try:
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                cursor.execute("""
                    INSERT OR REPLACE INTO telegram_sent_messages 
                    (product_code, chat_id, message_id, event_type, message_type, sent_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (code, str(settings.TELEGRAM_CHANNEL_ID), str(msg_id), event_type, msg_type, now_str))
                conn.commit()
            finally:
                conn.close()
        except Exception as e:
            _log(f"[Telegram] Database error logging sent message: {e}")

def dispatch_telegram_edit(product_code: str, status: str, expire_time: Optional[str] = None) -> None:
    """Trigger non-blocking Telegram message edits for state transitions."""
    if not settings.TELEGRAM_ENABLED or not settings.TELEGRAM_BOT_TOKEN:
        return

    import threading
    def do_edit():
        try:
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT chat_id, message_id, event_type, message_type 
                    FROM telegram_sent_messages 
                    WHERE product_code = ?
                """, (product_code,))
                rows = cursor.fetchall()
            finally:
                conn.close()
            
            for row in rows:
                chat_id = row["chat_id"]
                message_id = row["message_id"]
                original_event_type = row["event_type"]
                message_type = row["message_type"]
                
                product_data = None
                conn = get_db_connection()
                try:
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT product_name, condition, current_price, save_percent 
                        FROM products WHERE product_code = ?
                    """, (product_code,))
                    p_row = cursor.fetchone()
                    if p_row:
                        product_data = dict(p_row)
                finally:
                    conn.close()
                
                if not product_data:
                    continue
                
                name = _escape_html(product_data.get("product_name", "Unknown Laptop"))
                price = product_data.get("current_price", "N/A")
                saving = product_data.get("save_percent", "N/A")
                condition = _escape_html(product_data.get("condition", settings.DEFAULT_CONDITION))
                display_name = _truncate_name(clean_model(name))
                url = f"{settings.LENOVO_BASE_URL}/p/{product_code}"
                
                if status == "cart_hold":
                    title = f"⚠️ [Cart Hold] Laptop Reserved: <a href=\"{url}\">{display_name}</a>"
                    expires_str = f"at {expire_time} IST" if expire_time else "soon"
                    body = f"Model: {product_code}\nPrice: {price} INR (-{saving}%)\nCondition: {condition}\n\n🛒 Cart Lock expires {expires_str}."
                elif status == "sold_out":
                    title = f"🔴 [Sold Out] Laptop Removed: <a href=\"{url}\">{display_name}</a>"
                    sold_time = time.strftime("%I:%M %p")
                    body = f"Model: {product_code}\nLast Price: {price} INR (-{saving}%)\nCondition: {condition}\n\nSold out at {sold_time} IST."
                elif status == "restocked":
                    if original_event_type == "price_drop":
                        title = f"📉 Price Drop: <a href=\"{url}\">{display_name}</a>"
                        body = f"Model: {product_code}\nPrice: {price} INR (-{saving}%)\nCondition: {condition}\n\n🔗 <a href=\"{url}\">Buy on Lenovo Store</a>"
                    else:
                        title = f"🆕 Laptop Restocked: <a href=\"{url}\">{display_name}</a>"
                        body = f"Model: {product_code}\nPrice: {price} INR (-{saving}%)\nCondition: {condition}\n\n🔗 <a href=\"{url}\">Buy on Lenovo Store</a>"
                else:
                    continue
                
                new_text = f"<b>{title}</b>\n\n{body}"
                
                if message_type == "photo":
                    url_api = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/editMessageCaption"
                    payload = {
                        "chat_id": chat_id,
                        "message_id": message_id,
                        "caption": new_text,
                        "parse_mode": "HTML"
                    }
                else:
                    url_api = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/editMessageText"
                    payload = {
                        "chat_id": chat_id,
                        "message_id": message_id,
                        "text": new_text,
                        "parse_mode": "HTML",
                        "disable_web_page_preview": True
                    }
                
                try:
                    resp = standard_requests.post(url_api, json=payload, timeout=15)
                    if resp.status_code == 400 and "message to edit not found" in resp.text:
                        _purge_telegram_message(product_code, chat_id)
                    elif resp.status_code != 200:
                        _log(f"[Telegram Edit] Failed to edit message {message_id}: HTTP {resp.status_code} - {resp.text}")
                except Exception as e:
                    _log(f"[Telegram Edit] Error editing message: {e}")
        except Exception as ex:
            _log(f"[Telegram Edit] Error: {ex}")

    threading.Thread(target=do_edit, daemon=True).start()

def _purge_telegram_message(product_code: str, chat_id: str):
    try:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM telegram_sent_messages WHERE product_code = ? AND chat_id = ?", (product_code, str(chat_id)))
            conn.commit()
            _log(f"[Telegram Edit] Purged deleted message record for {product_code} in chat {chat_id}")
        finally:
            conn.close()
    except Exception as e:
        _log(f"[Telegram Edit] Error purging message record: {e}")

def send_telegram_batch(batch: List[dict], event_type: str) -> None:
    if not settings.TELEGRAM_ENABLED or not batch:
        return
        
    count = len(batch)
    
    if event_type == "added":
        title = f"{count} Laptops Added"
        header = f"<b>{title}</b>\n\n{count} new laptops detected:\n"
        item_lines = []
        for p in batch:
            code = _escape_html(p.get("productCode", "?"))
            name = _escape_html(_truncate_name(p.get("productName", "Unknown"), 30))
            price = p.get("finalPrice", "?")
            
            # Resolve product URL
            url_path = p.get("url") or f"/p/{code}"
            if url_path.startswith("http"):
                url = url_path
            elif url_path:
                if not url_path.startswith("/"):
                    url_path = f"/{url_path}"
                url = f"{settings.LENOVO_BASE_URL}{url_path}"
            else:
                url = settings.LENOVO_LAPTOPS_URL

            item_lines.append(f"• <a href=\"{url}\">{name}</a> — {price} INR ({code})")
        body = "\n".join(item_lines)
    elif event_type == "restock":
        title = f"{count} Laptops Restocked"
        header = f"<b>{title}</b>\n\n{count} restocked laptops detected:\n"
        item_lines = []
        for p in batch:
            code = _escape_html(p.get("productCode", "?"))
            name = _escape_html(_truncate_name(p.get("productName", "Unknown"), 30))
            price = p.get("finalPrice", "?")
            
            # Resolve product URL
            url_path = p.get("url") or f"/p/{code}"
            if url_path.startswith("http"):
                url = url_path
            elif url_path:
                if not url_path.startswith("/"):
                    url_path = f"/{url_path}"
                url = f"{settings.LENOVO_BASE_URL}{url_path}"
            else:
                url = settings.LENOVO_LAPTOPS_URL

            item_lines.append(f"• <a href=\"{url}\">{name}</a> — {price} INR ({code})")
        body = "\n".join(item_lines)
    elif event_type == "removed":
        title = f"{count} Laptops Removed"
        header = f"<b>{title}</b>\n\n{count} laptops sold out or removed:\n"
        item_lines = []
        for p in batch:
            code = _escape_html(p.get("productCode", "?"))
            name = _escape_html(_truncate_name(p.get("productName", "Unknown"), 30))
            
            # Resolve product URL
            url_path = p.get("url") or f"/p/{code}"
            if url_path.startswith("http"):
                url = url_path
            elif url_path:
                if not url_path.startswith("/"):
                    url_path = f"/{url_path}"
                url = f"{settings.LENOVO_BASE_URL}{url_path}"
            else:
                url = settings.LENOVO_LAPTOPS_URL
 
            duration = p.get("_listing_duration")
            duration_str = f" (Listed for: {duration})" if duration else ""
            item_lines.append(f"• <a href=\"{url}\">{name}</a> ({code}){duration_str}")
        body = "\n".join(item_lines)
    else:
        title = f"{count} Tracker Events"
        header = f"<b>{title}</b>\n\n"
        body = f"{count} events occurred."

    text = header + body
    _send_telegram_text(text)
