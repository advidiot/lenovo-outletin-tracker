import json
import re
import urllib.parse
import time
import math
from typing import Optional, Dict, List, Any
from backend.config import settings
from backend.logging_config import _log, current_time
from backend.db.connection import get_db_connection, db_connection
from backend.scraper.api import _request

# ---------------------------------------------------------------------------
# Spec Parsing & Extraction Helpers
# ---------------------------------------------------------------------------

def clean_model(name: str) -> str:
    """Clean model names for better UI readability."""
    if not name:
        return "Unknown Model"
    cleaned = re.sub(r'(?i)^\s*(notebook|lenovo)', '', name)
    cleaned = re.sub(r'(?i)^\s*(workstation)', 'ThinkPad', cleaned)
    return cleaned.strip()

def parse_processor_brand(proc_str: Optional[str]) -> Optional[str]:
    if not proc_str:
        return None
    match = re.search(r'(?i)Intel|AMD|MediaTek', proc_str)
    return match.group(0) if match else None

def parse_processor_range(proc_str: Optional[str]) -> Optional[str]:
    if not proc_str:
        return None
    s = proc_str.replace("®", "").replace("™", "")
    s_lower = s.lower()
    
    # 1. Intel Core Ultra
    if "core ultra" in s_lower or "ultra" in s_lower:
        for num in ["9", "7", "5", "3"]:
            if f"ultra {num}" in s_lower or f"ultra  {num}" in s_lower:
                return f"Intel Core Ultra {num}"
        return "Intel Core Ultra"
        
    # 2. AMD Ryzen AI
    if "ryzen ai" in s_lower:
        for num in ["9", "7", "5", "3"]:
            if f"ai {num}" in s_lower:
                return f"AMD Ryzen AI {num}"
        return "AMD Ryzen AI"

    # 3. AMD Ryzen
    if "ryzen" in s_lower:
        for num in ["9", "7", "5", "3"]:
            if f"ryzen {num}" in s_lower or f"ryzen r{num}" in s_lower:
                return f"AMD Ryzen {num}"
        return "AMD Ryzen"
        
    # 4. Intel Core iX
    if "core" in s_lower and any(f"i{num}" in s_lower for num in ["3", "5", "7", "9"]):
        for num in ["9", "7", "5", "3"]:
            if f"i{num}" in s_lower:
                return f"Intel Core i{num}"
                
    # 5. Intel Core X (e.g. Core 5 210H)
    if "core" in s_lower:
        for num in ["9", "7", "5", "3"]:
            if re.search(r'\bcore\s+' + num + r'\b', s_lower):
                return f"Intel Core {num}"
                
    # 6. Others
    for other in ["Celeron", "Pentium", "Athlon", "Xeon", "Atom"]:
        if other.lower() in s_lower:
            return other
            
    return "Others"

def parse_memory_size(mem_str: Optional[str]) -> Optional[str]:
    if not mem_str:
        return None
    match = re.search(r'\d+\s*GB', mem_str, re.IGNORECASE)
    return match.group(0).replace(" ", "") if match else None

def parse_storage_size(store_str: Optional[str]) -> Optional[str]:
    if not store_str:
        return None
    match = re.search(r'([\d\.]+)\s*(GB|TB)', store_str, re.IGNORECASE)
    if match:
        return f"{match.group(1)}{match.group(2)}".upper()
    return None

def parse_storage_type(store_str: Optional[str]) -> Optional[str]:
    if not store_str:
        return None
    s = store_str.lower()
    if "and" in s and "drives" in s:
        return "Multi"
    if "hard drive" in s or "rpm" in s:
        return "HDD"
    if "embedded multi media card" in s or "emmc" in s:
        return "eMMC"
    if "solid state" in s or "ssd" in s:
        if "pcie" in s or "nvme" in s or "m.2" in s:
            return "SSD (NVMe)"
        if "sata" in s:
            return "SSD (SATA)"
        return "SSD"
    return None

def parse_gpu_type(gpu_str: Optional[str]) -> Optional[str]:
    if not gpu_str:
        return None
    s = gpu_str.lower()
    if "integrated" in s or "intel iris" in s or "intel uhd" in s or "intel graphics" in s or "radeon graphics" in s:
        return "Integrated"
    if "rtx" in s or "gtx" in s or "nvidia" in s or "dedicated" in s or "discrete" in s or "geforce" in s or "quadro" in s or "t500" in s or "t600" in s or "t1000" in s or "arc a" in s or "rx " in s:
        return "Dedicated"
    if "radeon" in s or "intel" in s:
        return "Integrated"
    return "Integrated"

def parse_gpu_name(gpu_str: Optional[str]) -> Optional[str]:
    if not gpu_str:
        return None
    s = gpu_str.replace("®", "").replace("™", "")
    s = re.sub(r'\s+', ' ', s).strip()
    
    match = re.search(r'(GeForce\s+RTX\s*\d{4}(?:\s*Ti)?(?:\s*[A-Z]\b)?|RTX\s*\d{4}(?:\s*Ti)?(?:\s*[A-Z]\b)?|GeForce\s+GTX\s*\d{4}(?:\s*Ti)?|GeForce\s+MX\d{3,5})', s, re.IGNORECASE)
    if match:
        val = match.group(1).strip()
        val = re.sub(r'(?i)geforce', 'GeForce', val)
        val_lower = val.lower()
        if "geforce" not in val_lower:
            val = "GeForce " + val
        if "nvidia" not in val.lower():
            val = "NVIDIA " + val
        return val
    
    match = re.search(r'(Radeon\s+\d{3,4}M)', s, re.IGNORECASE)
    if match:
        return f"AMD {match.group(1).strip()}"
        
    match = re.search(r'(Radeon\s+RX\s*\d{4}(?:\s*S|\s*XT)?)', s, re.IGNORECASE)
    if match:
        return f"AMD {match.group(1).strip()}"

    if "arc" in s.lower():
        match = re.search(r'(Arc\s+\d{3,4}\w*)', s, re.IGNORECASE)
        if match:
            return f"Intel {match.group(1).strip()}"
        return "Intel Arc Graphics"

    if "iris" in s.lower():
        if "max" in s.lower():
            return "Intel Iris Xe Max"
        return "Intel Iris Xe"

    if "uhd" in s.lower():
        return "Intel UHD Graphics"

    if "intel graphics" in s.lower():
        return "Intel Graphics"

    if "radeon graphics" in s.lower():
        return "AMD Radeon Graphics"

    cleaned = re.sub(r'(?i)^\s*(integrated|discrete|dedicated)\s*', '', s)
    return cleaned.strip()

def parse_processor_generation(proc_str: Optional[str]) -> Optional[str]:
    if not proc_str:
        return None
    s = proc_str.replace("®", "").replace("™", "")
    s_lower = s.lower()
    
    gen_match = re.search(r'(\d+)(?:th|st|nd|rd)\s+Generation', s, re.IGNORECASE)
    if gen_match:
        return f"{gen_match.group(1)}th Gen"
        
    if "core ultra" in s_lower or "ultra" in s_lower:
        model_match = re.search(r'(?:Ultra\s+[3579]\s+)?(\d{3})[U|H|V|HX|X]?', s, re.IGNORECASE)
        if model_match:
            first_digit = model_match.group(1)[0]
            if first_digit == "1":
                return "Core Ultra Series 1"
            elif first_digit == "2":
                return "Core Ultra Series 2"
        return "Core Ultra"
        
    if "intel core" in s_lower:
        model_match = re.search(r'(?:Core\s+[3579]\s+)?(\d{3})[U|H|V|HX]?', s, re.IGNORECASE)
        if model_match:
            first_digit = model_match.group(1)[0]
            if first_digit == "1":
                return "Core Series 1"
            elif first_digit == "2":
                return "Core Series 2"

    if "ryzen" in s_lower:
        if "ryzen ai" in s_lower:
            model_match = re.search(r'(?:AI\s+[3579]\s+)?(\d{3})', s, re.IGNORECASE)
            if model_match:
                first_digit = model_match.group(1)[0]
                if first_digit == "3":
                    return "Ryzen AI 300 Series"
            return "Ryzen AI"
            
        model_match = re.search(r'Ryzen\s+[3579]\s+R?(\d{4})', s, re.IGNORECASE)
        if model_match:
            first_digit = model_match.group(1)[0]
            if first_digit == "5":
                return "Ryzen 5000 Series"
            elif first_digit == "6":
                return "Ryzen 6000 Series"
            elif first_digit == "7":
                return "Ryzen 7000 Series"
            elif first_digit == "8":
                return "Ryzen 8000 Series"
            
    return None

def parse_processor_series(proc_str: Optional[str]) -> Optional[str]:
    if not proc_str:
        return None
    s = proc_str.replace("®", "").replace("™", "")
    
    match = re.search(r'\b\d{3,4}(HX|HS|H|U|V)\b', s, re.IGNORECASE)
    if match:
        suffix = match.group(1).upper()
        if suffix in ("H", "HS"):
            return "H/HS-Series"
        return f"{suffix}-Series"
    
    if re.search(r'\b\d{3,5}HX\b|\bHX\b', s, re.IGNORECASE):
        return "HX-Series"
    if re.search(r'\b\d{3,5}HS\b|\bHS\b', s, re.IGNORECASE):
        return "H/HS-Series"
    if re.search(r'\b\d{3,5}H\b|\bH\b', s, re.IGNORECASE):
        return "H/HS-Series"
    if re.search(r'\b\d{3,5}U\b|\bU\b', s, re.IGNORECASE):
        return "U-Series"
    if re.search(r'\b\d{3,5}V\b|\bV\b', s, re.IGNORECASE):
        return "V-Series"
        
    return "Other"

def clean_cpu_model(proc_str: Optional[str]) -> Optional[str]:
    if not proc_str:
        return None
    s = proc_str.replace("®", "").replace("™", "")
    s = re.sub(r'\s+', ' ', s).strip()
    # Strip generation prefix if present
    s = re.sub(r'(?i)^\s*\d+(?:th|st|nd|rd)\s+Gen(?:eration)?\s+', '', s)
    # Extract portion before 'Processor'
    match = re.search(r'(.*?)\s+Processor', s, re.IGNORECASE)
    if match:
        s = match.group(1).strip()
    return s

def clean_gpu_model(gpu_str: Optional[str]) -> Optional[str]:
    if not gpu_str:
        return None
    s = gpu_str.replace("®", "").replace("™", "")
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'(?i)^\s*(Integrated|Discrete|Dedicated)\s+', '', s)
    s = re.sub(r'(?i)geforce', 'GeForce', s)
    # Simplify dedicated GPU laptop suffixes while keeping VRAM (e.g. Laptop GPU 8GB GDDR6 -> 8GB)
    s = re.sub(r'(?i)\s+Laptop\s+GPU\s+(\d+GB)\s+GDDR\d+', r' \1', s)
    return s

def get_product_cpu_gpu(product: dict) -> tuple[str, str]:
    # Try to extract cpu and gpu from product first
    cpu = None
    gpu = None
    
    # Check specs sub-dict or full_specs if present in product dict
    product_specs = product.get("specs") or product.get("full_specs")
    if isinstance(product_specs, dict):
        cpu_raw = product_specs.get("Processor")
        gpu_raw = product_specs.get("Graphic Card")
        if cpu_raw:
            cpu = clean_cpu_model(cpu_raw)
        if gpu_raw:
            gpu = clean_gpu_model(gpu_raw)
            
    # Check classification list
    classification = product.get("classification")
    if not cpu or not gpu:
        if classification and isinstance(classification, list):
            for item in classification:
                if isinstance(item, dict):
                    if item.get("a") == "Processor":
                        cpu = clean_cpu_model(item.get("b"))
                    elif item.get("a") == "Graphic Card":
                        gpu = clean_gpu_model(item.get("b"))
                        
    # If not found, check DB
    if not cpu or not gpu:
        code = product.get("productCode") or product.get("product_code")
        if code:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT specs FROM products WHERE product_code = ?", (code,))
                row = cursor.fetchone()
                if row and row[0]:
                    specs_dict = json.loads(row[0])
                    if not cpu:
                        cpu = clean_cpu_model(specs_dict.get("Processor"))
                    if not gpu:
                        gpu = clean_gpu_model(specs_dict.get("Graphic Card"))
            except Exception:
                pass
            finally:
                if 'conn' in locals():
                    conn.close()
                    
    return cpu or "Unknown CPU", gpu or "Unknown GPU"

def parse_ddr_gen(mem_str: Optional[str]) -> Optional[str]:
    if not mem_str:
        return None
    s = mem_str.upper()
    for gen in ["LPDDR5X", "LPDDR5", "DDR5", "LPDDR4X", "LPDDR4", "DDR4"]:
        if gen in s:
            return gen
    if "DDR3" in s:
        return "DDR3"
    return None

def parse_screen_size(disp_str: Optional[str]) -> Optional[float]:
    if not disp_str:
        return None
    match = re.search(r'(\d{2}\.?\d?)', disp_str)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    return None

def parse_resolution(disp_str: Optional[str]) -> Optional[str]:
    if not disp_str:
        return None
    match = re.search(r'(\d+)\s*x\s*(\d+)', disp_str)
    if match:
        return f"{match.group(1)}x{match.group(2)}"
    
    standards = {
        "WUXGA": "1920x1200",
        "WQXGA": "2560x1600",
        "WQUXGA": "3840x2400",
        "2.2K": "2240x1400",
        "2.5K": "2560x1600",
        "2.8K": "2880x1800",
        "2K": "2160x1350",
        "3K": "3072x1920",
        "FHD+": "1920x1200",
        "UHD+": "3840x2400",
        "FHD": "1920x1080",
        "UHD": "3840x2160",
        "QHD": "2560x1600",
        "HD+": "1600x900",
        "HD": "1366x768"
    }
    for k, v in standards.items():
        if k in disp_str:
            return v
    return None

def parse_aspect_ratio(resolution: Optional[str]) -> Optional[str]:
    if not resolution:
        return None
    match = re.search(r'(\d+)\s*x\s*(\d+)', resolution)
    if not match:
        return None
    try:
        w = int(match.group(1))
        h = int(match.group(2))
    except ValueError:
        return None
    if h == 0:
        return None
    
    ratio = w / h
    if abs(ratio - 16/10) < 0.01:
        return "16:10"
    if abs(ratio - 16/9) < 0.01:
        return "16:9"
    if abs(ratio - 3/2) < 0.01:
        return "3:2"
    if abs(ratio - 4/3) < 0.01:
        return "4:3"
    if abs(ratio - 5/4) < 0.01:
        return "5:4"
    if abs(ratio - 21/9) < 0.05:
        return "21:9"
    if abs(ratio - 32/9) < 0.05:
        return "32:9"
    
    gcd = math.gcd(w, h)
    return f"{w // gcd}:{h // gcd}"

def parse_battery_capacity(battery_str: Optional[str]) -> Optional[float]:
    if not battery_str:
        return None
    match = re.search(r'(\d+(?:\.\d+)?)\s*Wh', battery_str, re.IGNORECASE)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None

# ---------------------------------------------------------------------------
# Data Handlers (Retrieving parsed DB results)
# ---------------------------------------------------------------------------

def get_laptops_data() -> List[Dict[str, Any]]:
    """Fetch all laptops from DB and parse specifications dynamically."""
    if not settings.DB_FILE.exists():
        return []
        
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.*, 
                   (SELECT ph.price_delta 
                    FROM price_history ph 
                    WHERE ph.product_code = p.product_code 
                    ORDER BY ph.timestamp DESC, ph.id DESC LIMIT 1) as latest_price_delta
            FROM products p 
            ORDER BY p.active DESC, p.last_seen DESC
        """)
        rows = cursor.fetchall()
        
        laptops = []
        for row in rows:
            specs = {}
            if row['specs']:
                try:
                    specs = json.loads(row['specs'])
                except Exception as e:
                    _log(f"Error parsing specs for {row['product_code']}: {e}")
            
            proc = specs.get('Processor', '')
            mem = specs.get('Memory', '')
            store = specs.get('Storage', '')
            disp = specs.get('Display', '')
            gpu_str = specs.get('Graphic Card')
            
            p_name = row['product_name'] or "Lenovo Laptop"
            
            full_specs = {}
            if row['full_specs']:
                try:
                    full_specs = json.loads(row['full_specs'])
                except Exception:
                    pass

            # Calculate cart hold status dynamically
            in_cart_hold = False
            hold_expires_in_seconds = 0
            if row['active'] == 0 and row['pending_removal_since'] is not None:
                try:
                    fmt = "%Y-%m-%d %H:%M:%S"
                    pending_ts = time.mktime(time.strptime(row['pending_removal_since'], fmt))
                    elapsed = int(time.time() - pending_ts)
                    db_debounce = row['debounce_duration']
                    if db_debounce is None:
                        db_debounce = settings.TIER0_DEBOUNCE_SECONDS
                    remaining = db_debounce - elapsed
                    if remaining > 0:
                        in_cart_hold = True
                        hold_expires_in_seconds = remaining
                except Exception as e:
                    _log(f"Error calculating hold expiration for {row['product_code']}: {e}")

            res = parse_resolution(disp)
            laptop = {
                "available": row['active'] == 1,
                "in_cart_hold": in_cart_hold,
                "hold_expires_in_seconds": hold_expires_in_seconds,
                "brand": "Lenovo",
                "model": clean_model(p_name),
                "processor": proc,
                "processor-brand": parse_processor_brand(proc),
                "processor-range": parse_processor_range(proc),
                "processor-generation": parse_processor_generation(proc),
                "processor-series": parse_processor_series(proc),
                "memory": mem,
                "memory-size": parse_memory_size(mem),
                "memory-soldered": "soldered" in mem.lower() if mem else False,
                "ddr-gen": parse_ddr_gen(mem),
                "storage": store,
                "storage-size": parse_storage_size(store),
                "storage-type": parse_storage_type(store),
                "display": disp,
                "screen-size": parse_screen_size(disp),
                "panel-type": "IPS" if disp and "ips" in disp.lower() else "OLED" if disp and "oled" in disp.lower() else "TN" if disp and "tn" in disp.lower() else None,
                "touch-screen": "touch" in disp.lower() and "non-touch" not in disp.lower() if disp else False,
                "resolution": res,
                "screen-aspect-ratio": parse_aspect_ratio(res),
                "operating-system": specs.get('Operating System'),
                "graphic-card": gpu_str,
                "gpu-type": parse_gpu_type(gpu_str),
                "gpu-name": parse_gpu_name(gpu_str),
                "orig-price": row['original_price'],
                "price": row['current_price'],
                "price-delta": row['latest_price_delta'] if row['latest_price_delta'] is not None else 0.0,
                "percentage-savings": row['save_percent'],
                "product-condition": row['condition'],
                "product-number": row['product_code'],
                "url": f"https://www.lenovo.com/in/outletin/en/p/{row['product_code']}",
                "warranty": specs.get('Warranty') or full_specs.get('Warranty'),
                "weight": specs.get('Weight') or full_specs.get('Weight'),
                "thumbnail_url": row['thumbnail_url'],
                "rating_star": row['rating_star'],
                "comment_count": row['comment_count'],
                "first_seen": row['first_seen'],
                "last_seen": row['last_seen'],
                "removed_at": row['removed_at'],
                # Extended spec fields from compare API
                "camera": full_specs.get('Camera'),
                "wlan": full_specs.get('WIFI'),
                "bluetooth": full_specs.get('Bluetooth'),
                "battery": full_specs.get('Battery'),
                "battery-capacity": parse_battery_capacity(full_specs.get('Battery')),
                "keyboard": full_specs.get('Keyboard'),
                "fingerprint-reader": full_specs.get('Fingerprint Reader'),
                "pointing-device": full_specs.get('Pointing Device'),
                "ac-adapter": full_specs.get('AC Adapter / Power Supply'),
                "color": full_specs.get('Color'),
                "specs": specs,
                "full_specs": full_specs,
            }
            laptops.append(laptop)

        # Strip internal scraper metadata — these columns are not for the frontend
        _INTERNAL_COLS = ("stability_count", "pending_state", "pending_removal_since", "debounce_duration")
        for item in laptops:
            for col in _INTERNAL_COLS:
                item.pop(col, None)
            
        return laptops

def get_price_history(product_code: str) -> List[Dict[str, Any]]:
    """Fetch price history data for a product code."""
    if not settings.DB_FILE.exists():
        return []
        
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT timestamp, price, save_percent 
            FROM price_history 
            WHERE product_code = ? 
            ORDER BY timestamp ASC
        """, (product_code,))
        
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

# ---------------------------------------------------------------------------
# Spec Enrichment & Ghost listings cleanup tasks
# ---------------------------------------------------------------------------

def clean_ghost_listings() -> List[str]:
    """Verify inventoryStatus of active laptops and mark out-of-stock items as inactive."""
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT product_code, current_price FROM products WHERE active = 1")
        rows = cursor.fetchall()
        codes = [row['product_code'] for row in rows]
        prices = {row['product_code']: row['current_price'] for row in rows}
        
        if not codes:
            return []

        compare_req = [{"categoryCode": "laptops", "productNumber": codes}]
        url = "https://openapi.lenovo.com/in/outletin/en/product/compare/getCompareData?compareReq=" + urllib.parse.quote(json.dumps(compare_req))

        cleaned_codes = []
        try:
            response = _request("GET", url, headers=settings.COMPARE_HEADERS, timeout=15)
            if response.status_code == 200:
                data = response.json()
                categories = data.get("data", [])
                items = categories[0].get("productList", []) if categories else []

                for item in items:
                    prod_code = item.get("productNumber")
                    inv_status = item.get("inventoryStatus") # 1 = available, 2 = unavailable
                    if prod_code and inv_status == 2:
                        now_str = current_time()
                        cursor.execute("""
                            UPDATE products 
                            SET active = 0, removed_at = ? 
                            WHERE product_code = ? AND active = 1
                        """, (now_str, prod_code))
                        if cursor.rowcount > 0:
                            cleaned_codes.append(prod_code)
                            cursor.execute("""
                                INSERT INTO stock_history (product_code, event_type, timestamp, price)
                                VALUES (?, 'removed', ?, ?)
                            """, (prod_code, now_str, prices.get(prod_code)))
                            _log(f"[Ghost Cleanup] Product {prod_code} is out of stock. Marked active=0.")
            else:
                _log(f"Ghost cleanup API error: HTTP {response.status_code}")
        except Exception as e:
            _log(f"Error executing ghost cleanup API query: {e}")

        return cleaned_codes

def get_stock_history(product_code: str) -> List[Dict[str, Any]]:
    """Fetch stock history data for a product code."""
    if not settings.DB_FILE.exists():
        return []
        
    with db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT timestamp, event_type, price
            FROM stock_history
            WHERE product_code = ?
            ORDER BY timestamp ASC
        """, (product_code,))
        
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def enrich_specs(codes: Optional[List[str]] = None) -> Dict[str, Any]:
    """Fetch full specs from the Lenovo Compare API for active products and cache them in DB.
    
    Used by the manual /api/enrich_specs endpoint as a backfill tool.
    Sends all codes in a single Compare API request (API supports 166+ codes per request).
    """
    with db_connection() as conn:
        cursor = conn.cursor()

        if codes:
            placeholders = ",".join("?" * len(codes))
            cursor.execute(f"SELECT product_code FROM products WHERE product_code IN ({placeholders})", codes)
        else:
            cursor.execute("SELECT product_code FROM products WHERE active = 1 AND (full_specs IS NULL OR full_specs = '')")

        all_codes = [row[0] for row in cursor.fetchall()]

        if not all_codes:
            _log("[Enrich] No products need enrichment.")
            return {"enriched": 0, "failed": 0}

        enriched_count = 0
        failed_count = 0

        # Send all codes in a single request — API supports 166+ codes per request
        compare_req = [{"categoryCode": "laptops", "productNumber": all_codes}]
        url = ("https://openapi.lenovo.com/in/outletin/en/product/compare/getCompareData?compareReq="
               + urllib.parse.quote(json.dumps(compare_req)))

        try:
            _log(f"[Enrich] Fetching full_specs for {len(all_codes)} products in one request...")
            response = _request("GET", url, headers=settings.COMPARE_HEADERS, timeout=30)

            if response.status_code != 200:
                _log(f"[Enrich] HTTP {response.status_code}")
                failed_count = len(all_codes)
            else:
                data = response.json()
                categories = data.get("data", [])
                items = categories[0].get("productList", []) if categories else []

                returned_codes = set()
                for item in items:
                    prod_code = item.get("productNumber")
                    if not prod_code:
                        continue
                    returned_codes.add(prod_code)

                    classification = item.get("classification", [])
                    full_specs_dict = {
                        s["a"]: s["b"]
                        for s in classification
                        if "a" in s and "b" in s
                    }

                    if item.get("inventoryStatus") is not None:
                        full_specs_dict["__inventoryStatus"] = item["inventoryStatus"]

                    full_specs_json = json.dumps(full_specs_dict, ensure_ascii=False)

                    cursor.execute(
                        "UPDATE products SET full_specs = ? WHERE product_code = ?",
                        (full_specs_json, prod_code)
                    )
                    if cursor.rowcount > 0:
                        enriched_count += 1
                        _log(f"[Enrich] Updated full_specs for {prod_code} ({len(full_specs_dict)} fields)")

                # Count codes not returned by API as failed
                failed_count = len(set(all_codes) - returned_codes)
                if failed_count:
                    _log(f"[Enrich] {failed_count} codes not returned by Compare API.")

        except Exception as e:
            _log(f"[Enrich] Request error: {e}")
            failed_count = len(all_codes)

        _log(f"[Enrich] Done. Enriched: {enriched_count} | Failed: {failed_count}")
        return {"enriched": enriched_count, "failed": failed_count}

def verify_and_enrich(products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Single Compare API call per cycle that both filters ghosts and enriches full_specs.
    
    Replaces the old filter_out_ghosts() + post-cycle enrich_specs() pattern.
    Sends ALL product codes from the Search API in ONE Compare API request, then:
      1. Filters out ghost products (inventoryStatus == 2)
      2. Writes full_specs for any product that doesn't have them yet
    
    Result: 4 Lenovo API requests per cycle (3 search + 1 compare) with instant ghost detection.
    """
    if not products:
        return []

    codes = [p["productCode"] for p in products if p.get("productCode")]
    if not codes:
        return products

    # Determine which products are missing full_specs in DB so we can backfill
    missing_specs_codes: set = set()
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            placeholders = ",".join("?" * len(codes))
            cursor.execute(
                f"SELECT product_code FROM products WHERE product_code IN ({placeholders}) AND (full_specs IS NULL OR full_specs = '')",
                codes
            )
            missing_specs_codes = {row[0] for row in cursor.fetchall()}
    except Exception as e:
        _log(f"[Verify+Enrich] DB query for missing specs failed: {e}")

    # Single Compare API request for ALL codes
    compare_req = [{"categoryCode": "laptops", "productNumber": codes}]
    url = ("https://openapi.lenovo.com/in/outletin/en/product/compare/getCompareData?compareReq="
           + urllib.parse.quote(json.dumps(compare_req)))

    unavailable_codes: set = set()
    enriched_count = 0

    try:
        _log(f"[Verify+Enrich] Checking {len(codes)} products (ghost filter + spec enrichment)...")
        response = _request("GET", url, headers=settings.COMPARE_HEADERS, timeout=30)

        if response.status_code != 200:
            _log(f"[Verify+Enrich] Compare API error HTTP {response.status_code}. Aborting cycle — fail-closed.")
            return None

        data = response.json()
        categories = data.get("data", [])
        items = categories[0].get("productList", []) if categories else []

        specs_to_write: List[tuple] = []

        for item in items:
            prod_code = item.get("productNumber")
            if not prod_code:
                continue

            inv_status = item.get("inventoryStatus") # 1 = available, 2 = unavailable
            if inv_status == 2:
                unavailable_codes.add(prod_code)

            # Spec enrichment — only for products missing full_specs
            # (also picks up brand-new products just inserted in this cycle)
            if prod_code in missing_specs_codes:
                classification = item.get("classification", [])
                full_specs_dict = {
                    s["a"]: s["b"]
                    for s in classification
                    if "a" in s and "b" in s
                }
                if inv_status is not None:
                    full_specs_dict["__inventoryStatus"] = inv_status

                if full_specs_dict:
                    specs_to_write.append((json.dumps(full_specs_dict, ensure_ascii=False), prod_code))

        # Write enriched specs to DB
        if specs_to_write:
            try:
                with db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.executemany(
                        "UPDATE products SET full_specs = ? WHERE product_code = ?",
                        specs_to_write
                    )
                    enriched_count = cursor.rowcount
            except Exception as e:
                _log(f"[Verify+Enrich] DB write for full_specs failed: {e}")

        ghost_count = len(unavailable_codes)
        if ghost_count > 0:
            _log(f"[Verify+Enrich] Ghosts filtered ({ghost_count}): {', '.join(sorted(unavailable_codes))}")
        _log(f"[Verify+Enrich] Done. Ghosts filtered: {ghost_count} | Specs enriched: {enriched_count}/{len(missing_specs_codes)}")

    except Exception as e:
        _log(f"[Verify+Enrich] Request error: {e}. Aborting cycle — fail-closed.")
        return None

    # Return products with ghosts removed
    return [p for p in products if p.get("productCode") not in unavailable_codes]

