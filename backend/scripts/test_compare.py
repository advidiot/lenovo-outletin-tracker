"""
Quick test: call the Lenovo compare API for a handful of product codes
and print the exact structure returned.
"""
import sqlite3, json, urllib.parse
try:
    from curl_cffi import requests as curl_requests
    HAS_CURL = True
except ImportError:
    import urllib.request
    HAS_CURL = False

DB_FILE = "lenovo_tracker.db"

codes = ["21MMR000R0"]
print(f"Testing with codes: {codes}")

compare_req = [{"categoryCode": "laptops", "productNumber": codes}]
url = ("https://openapi.lenovo.com/in/outletin/en/product/compare/getCompareData?compareReq="
       + urllib.parse.quote(json.dumps(compare_req)))

headers = {
    "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Linux"',
    "Referer": "https://www.lenovo.com/",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}

resp = curl_requests.get(url, headers=headers, impersonate="chrome110", timeout=20)
print(f"HTTP status: {resp.status_code}")

data = resp.json()
inner = data.get("data", [])
category = inner[0]
product_list = category.get("productList", [])
print(f"\nproductList has {len(product_list)} items\n")

for product in product_list:
    code = product.get("productNumber")
    inv = product.get("inventoryStatus")
    classification = product.get("classification", [])
    print(f"--- {code} (inventoryStatus={inv}, {len(classification)} classification entries) ---")
    for entry in classification:
        print(f"  '{entry.get('a')}': {str(entry.get('b',''))[:80]}")
    print()


