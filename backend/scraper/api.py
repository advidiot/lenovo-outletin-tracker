import time
import math
import urllib.parse
import json
from typing import Optional, List
from backend.config import settings
from backend.logging_config import _log

# Import curl_cffi requests if available, fallback to standard requests
try:
    from curl_cffi import requests
    HAS_CURL_CFFI = True
except ImportError:
    import requests
    HAS_CURL_CFFI = False

_session: Optional[requests.Session] = None

def _get_session() -> requests.Session:
    """Return a persistent requests Session (reuses TLS handshake)."""
    global _session
    if _session is None:
        if HAS_CURL_CFFI:
            _session = requests.Session(impersonate="chrome110")
        else:
            _session = requests.Session()
    return _session

def _recreate_session() -> requests.Session:
    """Close the current session if any, and initialize a new one to recover from stale connection errors."""
    global _session
    if _session is not None:
        try:
            _session.close()
        except Exception:
            pass
    _session = None
    return _get_session()

def _request(method: str, url: str, **kwargs) -> requests.Response:
    """Make an HTTP request with automatic session recovery on failure (Arch 4 helper)."""
    session = _get_session()
    if HAS_CURL_CFFI:
        kwargs.setdefault("impersonate", "chrome110")
    try:
        return session.request(method, url, **kwargs)
    except Exception as e:
        _log(f"HTTP connection failed: {e}. Recreating session and retrying once...")
        try:
            session = _recreate_session()
            return session.request(method, url, **kwargs)
        except Exception as retry_e:
            raise retry_e from e

def fetch_products(page: int, page_size: int = None) -> Optional[dict]:
    """Fetch a single page of products from the Lenovo Outlet API."""
    if page_size is None:
        page_size = settings.PAGE_SIZE

    params_dict = {
        "pageFilterId": settings.PAGE_FILTER_ID,
        "page": str(page),
        "pageSize": str(page_size),
        "version": "v2",
    }
    params_json = json.dumps(params_dict)
    params_encoded = urllib.parse.quote(urllib.parse.quote(params_json))
    query_string = (
        f"?pageFilterId={settings.PAGE_FILTER_ID}"
        f"&loyalty=false"
        f"&params={params_encoded}"
    )
    full_url = settings.API_URL + query_string
    last_error: Optional[str] = None
    
    for attempt in range(1 + settings.MAX_PAGE_RETRIES):
        try:
            response = _request("GET", full_url, headers=settings.HEADERS, timeout=15)

            if response.status_code == 200:
                data = response.json()
                if data.get("status") == 200:
                    return data.get("data", {})
                else:
                    last_error = f"API error {data.get('status')}: {data.get('msg')}"
            else:
                last_error = f"HTTP {response.status_code}"
        except Exception as e:
            last_error = f"Network error: {e}"

        if attempt < settings.MAX_PAGE_RETRIES:
            if settings.RETRY_DELAYS and attempt < len(settings.RETRY_DELAYS):
                delay = settings.RETRY_DELAYS[attempt]
            elif settings.RETRY_DELAYS:
                delay = settings.RETRY_DELAYS[-1]
            else:
                delay = 5.0
            _log(f"Page {page} fetch failed ({last_error}). Retrying in {delay}s… (attempt {attempt + 1}/{settings.MAX_PAGE_RETRIES})")
            time.sleep(delay)

    _log(f"Page {page} fetch failed after {1 + settings.MAX_PAGE_RETRIES} attempts: {last_error}")
    return None

def get_all_active_products() -> tuple[Optional[list[dict]], bool]:
    """Retrieve every active product across all paginated API pages.
    Returns (all_products, partial_scan).
    """
    partial_scan = False
    failed_pages_count = 0
    max_failed = getattr(settings, "MAX_FAILED_PAGES", 2)

    data = fetch_products(page=1, page_size=settings.PAGE_SIZE)
    if not data:
        _log("First page fetch failed. Aborting scrape completely.")
        return None, True

    # Save live facetGroups to JSON for the dynamic frontend filters (Arch 4 & Lenovo dynamic specs)
    facet_groups = data.get("facetGroups", [])
    if facet_groups:
        try:
            import os
            db_dir = os.path.dirname(os.path.abspath(settings.DB_FILE))
            facet_groups_path = os.path.join(db_dir, "facet_groups.json")
            with open(facet_groups_path, "w", encoding="utf-8") as fg_file:
                json.dump(facet_groups, fg_file, indent=2, ensure_ascii=False)
            _log(f"Saved live filter facetGroups to {facet_groups_path}")
        except Exception as e:
            _log(f"Error saving facetGroups: {e}")

    items = data.get("data", [])
    if not items or not isinstance(items, list):
        _log("Unexpected API response: 'data.data' is empty or not a list.")
        return None, True

    first_page_products = items[0].get("products") if items else None
    if not first_page_products:
        _log("Unexpected API response: no products in first page payload.")
        return None, True

    seen_codes: set[str] = set()
    all_products: list[dict] = []

    def _add_unique(products: list[dict]) -> None:
        for p in products:
            code = p.get("productCode")
            if code and code not in seen_codes:
                seen_codes.add(code)
                all_products.append(p)

    _add_unique(first_page_products)

    count = data.get("count", 0)
    total_pages = math.ceil(count / settings.PAGE_SIZE) if count else 1

    if total_pages > 1:
        _log(f"Scaling fetch: Found {count} items across {total_pages} pages.")
        for p in range(2, total_pages + 1):
            time.sleep(settings.INTER_PAGE_DELAY)
            page_data = fetch_products(page=p, page_size=settings.PAGE_SIZE)
            if not page_data:
                failed_pages_count += 1
                partial_scan = True
                _log(f"Page {p} failed ({failed_pages_count}/{max_failed}).")
                if failed_pages_count > max_failed:
                    _log(f"Failed pages exceeded limit ({max_failed}). Aborting cycle.")
                    return None, True
                continue
            
            page_items = page_data.get("data", [])
            if not page_items or not page_items[0].get("products"):
                failed_pages_count += 1
                partial_scan = True
                _log(f"Page {p} returned empty products ({failed_pages_count}/{max_failed}).")
                if failed_pages_count > max_failed:
                    _log(f"Failed pages exceeded limit ({max_failed}). Aborting cycle.")
                    return None, True
                continue
                
            _add_unique(page_items[0].get("products", []))

    return all_products, partial_scan
