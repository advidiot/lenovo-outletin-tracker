import time
from typing import Optional, List
from backend.config import settings
from backend.logging_config import _log
from backend.scraper.api import _get_session

def _truncate_name(name: str, max_len: int = 40) -> str:
    if len(name) <= max_len:
        return name
    return name[:max_len] + "…"

def _escape_html(text: str) -> str:
    """Escape HTML special characters for Telegram HTML parse mode."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def _send_telegram_text(text: str, chat_id: Optional[str] = None) -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        return
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    
    target_chat = chat_id or settings.TELEGRAM_CHANNEL_ID
    if not target_chat:
        return
    
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
            if resp.status_code != 200:
                _log(f"[Telegram] Failed to send message: HTTP {resp.status_code} - {resp.text}")
        except Exception as e:
            _log(f"[Telegram] Error sending message: {e}")

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

    text = f"<b>{title}</b>\n\n{body}"
    _send_telegram_text(text)

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

            item_lines.append(f"• <a href=\"{url}\">{name}</a> ({code})")
        body = "\n".join(item_lines)
    else:
        title = f"{count} Tracker Events"
        header = f"<b>{title}</b>\n\n"
        body = f"{count} events occurred."

    text = header + body
    _send_telegram_text(text)
