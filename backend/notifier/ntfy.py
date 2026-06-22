import time
from typing import Optional
from email.header import Header
from backend.config import settings
from backend.logging_config import _log
from backend.scraper.api import _get_session

def _truncate_name(name: str, max_len: int = 40) -> str:
    if len(name) <= max_len:
        return name
    return name[:max_len] + "…"

def _encode_header(val: str) -> str:
    try:
        val.encode("ascii")
        return val
    except UnicodeEncodeError:
        return Header(val, "utf-8").encode()

def send_startup_alert(db_count: int) -> None:
    title = "Logaze India Tracker Online"
    message = f"Monitoring active.\nDatabase loaded with {db_count} models."
    ntfy_url = f"{settings.NTFY_BASE_URL}/{settings.NTFY_TOPIC}"
    headers = {
        "Title": _encode_header(title),
        "Priority": "default",
        "Tags": "green_circle,shield,hourglass_flowing_sand",
    }
    try:
        session = _get_session()
        response = session.post(ntfy_url, data=message.encode("utf-8"), headers=headers, timeout=10)
        if response.status_code == 200:
            _log("Startup notification sent.")
    except Exception as e:
        _log(f"Error sending startup notification: {e}")

def send_once_complete_alert(active_count: int, removed_count: int) -> None:
    title = "Logaze India: Scan Complete"
    message = f"Manual scan finished successfully.\nActive models: {active_count}\nRemoved models: {removed_count}"
    ntfy_url = f"{settings.NTFY_BASE_URL}/{settings.NTFY_TOPIC}"
    headers = {
        "Title": _encode_header(title),
        "Priority": "default",
        "Tags": "white_check_mark,clipboard,bell",
    }
    try:
        session = _get_session()
        response = session.post(ntfy_url, data=message.encode("utf-8"), headers=headers, timeout=10)
        if response.status_code == 200:
            _log("Manual scan complete notification sent.")
    except Exception as e:
        _log(f"Error sending manual scan complete notification: {e}")

def send_push_notification(
    product: dict,
    ntfy_type: str = "added",
    old_price: Optional[float] = None,
    listing_duration: Optional[str] = None,
    restock_duration: Optional[str] = None,
) -> None:
    if restock_duration is None:
        restock_duration = product.get("_restock_duration")

    name = product.get("productName", "Unknown Laptop")
    price = product.get("finalPrice", "N/A")
    saving = product.get("savePercent", "N/A")
    condition = product.get("productCondition", settings.DEFAULT_CONDITION)
    url_path = product.get("url", "")
    code = product.get("productCode")

    # If url_path is fully qualified, use it. Otherwise form it.
    if url_path.startswith("http"):
        click_url = url_path
    elif url_path:
        click_url = f"{settings.LENOVO_BASE_URL}{url_path}"
    else:
        click_url = settings.LENOVO_LAPTOPS_URL

    display_name = _truncate_name(name)

    if ntfy_type == "added":
        if restock_duration:
            title = f"Laptop Restocked: {display_name}"
            message = f"Model: {code}\nPrice: {price} INR (-{saving}%)\nCondition: {condition}\nRestocked after: {restock_duration}"
            tags = "arrows_counterclockwise,laptop,computer,bell"
        else:
            title = f"Laptop Added: {display_name}"
            message = f"Model: {code}\nPrice: {price} INR (-{saving}%)\nCondition: {condition}"
            tags = "new,laptop,computer,bell"
    elif ntfy_type == "price_drop":
        title = f"Price Drop: {display_name}"
        message = f"Model: {code}\nNew Price: {price} INR (Was {old_price} INR)\nSavings: -{saving}%"
        tags = "chart_with_downwards_trend,money_with_wings,bell"
    elif ntfy_type == "price_hike":
        title = f"Price Hike: {display_name}"
        message = f"Model: {code}\nNew Price: {price} INR (Was {old_price} INR)\nSavings: -{saving}%"
        tags = "chart_with_upwards_trend,chart,bell"
    elif ntfy_type == "removed":
        title = f"Laptop Removed: {display_name}"
        lines = [f"Model: {code}"]
        if price != "N/A":
            lines.append(f"Last Price: {price} INR (-{saving}%)")
        if condition:
            lines.append(f"Condition: {condition}")
        if listing_duration:
            lines.append(f"Listed for: {listing_duration}")
        lines.append("This item has been removed or sold out.")
        message = "\n".join(lines)
        tags = "wastebasket,x,bell"
    else:
        title = f"Tracker Alert: {display_name}"
        message = f"Model: {code}\nUnknown event type: {ntfy_type}"
        tags = "warning,bell"

    topic = settings.NTFY_TOPIC_REMOVED if ntfy_type == "removed" else settings.NTFY_TOPIC
    ntfy_url = f"{settings.NTFY_BASE_URL}/{topic}"

    headers = {
        "Title": _encode_header(title),
        "Priority": "high",
        "Tags": tags,
        "Click": click_url,
    }

    try:
        session = _get_session()
        response = session.post(ntfy_url, data=message.encode("utf-8"), headers=headers, timeout=10)
        if response.status_code == 200:
            _log(f"Push notification ({ntfy_type}) sent for {code}")
    except Exception as e:
        _log(f"Error sending notification for {code}: {e}")

def _send_batch_summary(
    batch: list[dict],
    ntfy_type: str,
    topic: str,
) -> None:
    count = len(batch)

    if ntfy_type == "added":
        title = f"{count} Laptops Added / Restocked"
        tags = "new,laptop,bell"
        lines = [f"{count} new or restocked laptops detected:\n"]
        for p in batch[:15]:
            code = p.get("productCode", "?")
            name = _truncate_name(p.get("productName", "Unknown"), 30)
            price = p.get("finalPrice", "?")
            restock_dur = p.get("_restock_duration")
            duration_str = f" (Restocked after: {restock_dur})" if restock_dur else ""
            lines.append(f"• {name} — {price} INR ({code}){duration_str}")
        if count > 15:
            lines.append(f"…and {count - 15} more.")
    elif ntfy_type == "removed":
        title = f"{count} Laptops Removed"
        tags = "wastebasket,bell"
        lines = [f"{count} laptops sold out or removed:\n"]
        for p in batch[:15]:
            code = p.get("productCode", "?")
            name = _truncate_name(p.get("productName", "Unknown"), 30)
            lines.append(f"• {name} ({code})")
        if count > 15:
            lines.append(f"…and {count - 15} more.")
    else:
        title = f"{count} Tracker Events"
        tags = "bell"
        lines = [f"{count} events occurred."]

    ntfy_url = f"{settings.NTFY_BASE_URL}/{topic}"
    headers = {
        "Title": _encode_header(title),
        "Priority": "high",
        "Tags": tags,
        "Click": settings.LENOVO_LAPTOPS_URL,
    }
    try:
        session = _get_session()
        response = session.post(ntfy_url, data="\n".join(lines).encode("utf-8"), headers=headers, timeout=10)
        if response.status_code == 200:
            _log(f"Batch notification ({ntfy_type}, {count} items) sent.")
    except Exception as e:
        _log(f"Error sending batch notification: {e}")
