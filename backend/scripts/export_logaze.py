import sqlite3
import json
import re
import os

DB_FILE = "lenovo_tracker.db"
OUTPUT_FILE = "logaze_laptops.json"

def clean_model(name):
    cleaned = re.sub(r'(?i)^\s*(notebook|lenovo)', '', name)
    cleaned = re.sub(r'(?i)^\s*(workstation)', 'ThinkPad', cleaned)
    return cleaned.strip()

def parse_processor_brand(proc_str):
    if not proc_str:
        return None
    match = re.search(r'(?i)Intel|AMD|MediaTek', proc_str)
    return match.group(0) if match else None

def parse_processor_range(proc_str):
    if not proc_str:
        return None
    cleaned = re.sub(r'[^A-Za-z0-9\- ]', '', proc_str)
    match = re.search(r'(?i)(i[3579]|Ryzen R?\d+|Celeron|Athlon|Xeon|Atom|Pentium|A\d+|PRO A\d+|R\d)-?', cleaned)
    if match:
        return match.group(1)
    return None

def parse_memory_size(mem_str):
    if not mem_str:
        return None
    match = re.search(r'\d+\s*GB', mem_str, re.IGNORECASE)
    return match.group(0).replace(" ", "") if match else None

def parse_storage_size(store_str):
    if not store_str:
        return None
    match = re.search(r'([\d\.]+)\s*(GB|TB)', store_str, re.IGNORECASE)
    if match:
        return f"{match.group(1)}{match.group(2)}".upper()
    return None

def parse_storage_type(store_str):
    if not store_str:
        return None
    s = store_str.lower()
    if "and" in s and "drives" in s:
        return "Multi"
    if "hard drive" in s or "rpm" in s:
        return "HDD"
    if "solid state" in s or "ssd" in s:
        return "SSD"
    if "embedded multi media card" in s or "emmc" in s:
        return "eMMC"
    return None

def parse_screen_size(disp_str):
    if not disp_str:
        return None
    match = re.search(r'(\d{2}\.?\d?)', disp_str)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            pass
    return None

def parse_resolution(disp_str):
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

def parse_aspect_ratio(resolution):
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
    
    import math
    gcd = math.gcd(w, h)
    return f"{w // gcd}:{h // gcd}"

def main():
    if not os.path.exists(DB_FILE):
        print(f"Error: Database file not found at {DB_FILE}")
        return

    conn = sqlite3.connect(DB_FILE)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM products")
        rows = cursor.fetchall()
        
        laptops = []
        for row in rows:
            specs = {}
            if row['specs']:
                try:
                    specs = json.loads(row['specs'])
                except Exception as e:
                    print(f"Error parsing specs for {row['product_code']}: {e}")
            
            proc = specs.get('Processor', '')
            mem = specs.get('Memory', '')
            store = specs.get('Storage', '')
            disp = specs.get('Display', '')
            
            res = parse_resolution(disp)
            laptop = {
                "available": row['active'] == 1,
                "brand": "Lenovo",
                "model": clean_model(row['product_name']),
                "processor": proc,
                "processor-brand": parse_processor_brand(proc),
                "processor-range": parse_processor_range(proc),
                "memory": mem,
                "memory-size": parse_memory_size(mem),
                "memory-soldered": "soldered" in mem.lower() if mem else False,
                "storage": store,
                "storage-size": parse_storage_size(store),
                "storage-type": parse_storage_type(store),
                "display": disp,
                "screen-size": parse_screen_size(disp),
                "screen-has-ips": "ips" in disp.lower() if disp else False,
                "panel-type": "IPS" if disp and "ips" in disp.lower() else "OLED" if disp and "oled" in disp.lower() else "TN" if disp and "tn" in disp.lower() else None,
                "resolution": res,
                "screen-aspect-ratio": parse_aspect_ratio(res),
                "operating-system": specs.get('Operating System'),
                "graphic-card": specs.get('Graphic Card'),
                "orig-price": row['original_price'],
                "price": row['current_price'],
                "percentage-savings": row['save_percent'],
                "product-condition": row['condition'],
                "product-number": row['product_code'],
                "url": f"https://www.lenovo.com/in/outletin/en/p/{row['product_code']}",
                "warranty": specs.get('Warranty'),
                "weight": specs.get('Weight')
            }
            laptops.append(laptop)
    finally:
        conn.close()
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(laptops, f, indent=2)
        
    print(f"Successfully processed {len(laptops)} laptops and saved to {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
