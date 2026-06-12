import os
import json
import urllib.parse
import mimetypes
import http.server
import threading
from typing import Any
from backend.config import settings
from backend.logging_config import _log
from backend.scraper.enrichment import get_laptops_data, get_price_history
from backend.db.connection import get_db_connection

class LaptopTrackerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data: Any, status: int = 200) -> None:
        """Sends a JSON response (Arch 5 helper)."""
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status_code: int, message: str):
        self.send_json({"error": message}, status_code)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # Route GET API endpoints
        if path == "/api/laptops":
            try:
                data = get_laptops_data()
                self.send_json(data)
            except Exception as e:
                self.send_error_json(500, f"Database error: {str(e)}")
            return

        elif path == "/api/price_history":
            codes = query_params.get("code")
            if not codes:
                self.send_error_json(400, "Missing required query parameter: code")
                return
            product_code = codes[0]
            try:
                data = get_price_history(product_code)
                self.send_json(data)
            except Exception as e:
                self.send_error_json(500, f"Database error: {str(e)}")
            return

        elif path == "/api/vapid_public_key":
            self.send_json({"publicKey": settings.VAPID_PUBLIC_KEY or ""})
            return

        # Serve static assets from build directory (P0 Sec Fix 1 & P1 FE Fix 2)
        rel_path = path.lstrip('/')
        norm_path = os.path.normpath(rel_path)
        if norm_path.startswith("..") or os.path.isabs(norm_path):
            self.send_error(403, "Access Forbidden")
            return

        static_dir_str = str(settings.STATIC_DIR)
        if not norm_path or norm_path == "." or norm_path == "index.html":
            static_file_path = os.path.join(static_dir_str, "index.html")
        else:
            static_file_path = os.path.join(static_dir_str, norm_path)
            
        if os.path.exists(static_file_path) and os.path.isfile(static_file_path):
            abs_static = os.path.abspath(static_file_path)
            abs_dir = os.path.abspath(static_dir_str)
            if not abs_static.startswith(abs_dir):
                self.send_error(403, "Access Forbidden")
                return
            mime, _ = mimetypes.guess_type(static_file_path)
            if not mime:
                mime = "application/octet-stream"
            self.serve_file(static_file_path, mime)
        else:
            # SPA Fallback for client-side routing
            index_path = os.path.join(static_dir_str, "index.html")
            if os.path.exists(index_path):
                self.serve_file(index_path, "text/html")
            else:
                super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Scrape API triggers an in-process scan under lock
        if path == "/api/scrape":
            # Late imports to avoid circular dependency
            from backend.main import trigger_manual_scrape
            res = trigger_manual_scrape(is_first_run=True)
            if res.get("success"):
                self.send_json(res)
            else:
                status = 409 if "progress" in res.get("error", "") else 502
                self.send_error_json(status, res.get("error"))
            return

        # Clean ghosts API triggers a cleanup under lock
        elif path == "/api/clean_ghosts":
            # Late imports to avoid circular dependency
            from backend.main import trigger_ghost_cleanup
            res = trigger_ghost_cleanup()
            if res.get("success"):
                self.send_json(res)
            else:
                self.send_error_json(409 if "progress" in res.get("error", "") else 500, res.get("error"))
            return

        # Enrich specs API launches background thread under lock
        elif path == "/api/enrich_specs":
            try:
                # Late imports to avoid circular dependencies
                from backend.main import scraper_lock
                from backend.scraper.enrichment import enrich_specs
                _log("In-process spec enrichment triggered via API...")
                
                def _run():
                    with scraper_lock:
                        enrich_specs()
                t = threading.Thread(target=_run, daemon=True)
                t.start()
                
                payload = {"success": True, "message": "Spec enrichment started in background. Reload data in ~30 seconds."}
                self.send_json(payload)
            except Exception as e:
                self.send_error_json(500, f"Failed to start spec enrichment: {str(e)}")
            return

        elif path == "/api/push/subscribe":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
                    data = json.loads(body.decode("utf-8"))
                    
                    endpoint = data.get("endpoint")
                    keys = data.get("keys", {})
                    p256dh = keys.get("p256dh")
                    auth = keys.get("auth")
                    user_agent = data.get("user_agent")
                    
                    if not endpoint or not p256dh or not auth:
                        self.send_error_json(400, "Missing required subscription fields (endpoint, p256dh, auth)")
                        return
                        
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("SELECT id FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
                        row = cursor.fetchone()
                        import time
                        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                        
                        if row:
                            sub_id = row[0]
                            cursor.execute("""
                                UPDATE push_subscriptions SET
                                    p256dh = ?, auth = ?, user_agent = ?, last_used = ?
                                WHERE id = ?
                            """, (p256dh, auth, user_agent, now_str, sub_id))
                        else:
                            cursor.execute("""
                                INSERT INTO push_subscriptions (
                                    endpoint, p256dh, auth, user_agent, created_at, last_used
                                ) VALUES (?, ?, ?, ?, ?, ?)
                            """, (endpoint, p256dh, auth, user_agent, now_str, now_str))
                            sub_id = cursor.lastrowid
                        conn.commit()
                        self.send_json({"success": True, "subscription_id": sub_id})
                    finally:
                        conn.close()
                else:
                    self.send_error_json(400, "Missing request body")
            except Exception as e:
                self.send_error_json(500, f"Error subscribing: {str(e)}")
            return

        elif path == "/api/push/update_watchlist":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
                    data = json.loads(body.decode("utf-8"))
                    
                    endpoint = data.get("endpoint")
                    sub_id = data.get("subscription_id")
                    watchlist = data.get("watchlist", [])
                    
                    if not endpoint and not sub_id:
                        self.send_error_json(400, "Missing identifier (endpoint or subscription_id)")
                        return
                        
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        if sub_id is None:
                            cursor.execute("SELECT id FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
                            row = cursor.fetchone()
                            if not row:
                                self.send_error_json(404, "Subscription not found")
                                return
                            sub_id = row[0]
                            
                        import time
                        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                        
                        # Sync: full replace
                        cursor.execute("DELETE FROM subscription_watchlist WHERE subscription_id = ?", (sub_id,))
                        for code in watchlist:
                            cursor.execute("""
                                INSERT OR IGNORE INTO subscription_watchlist (subscription_id, product_code, created_at)
                                VALUES (?, ?, ?)
                            """, (sub_id, code, now_str))
                        conn.commit()
                        self.send_json({"success": True})
                    finally:
                        conn.close()
                else:
                    self.send_error_json(400, "Missing request body")
            except Exception as e:
                self.send_error_json(500, f"Error updating watchlist: {str(e)}")
            return

        elif path == "/api/push/update_prefs":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
                    data = json.loads(body.decode("utf-8"))
                    
                    endpoint = data.get("endpoint")
                    sub_id = data.get("subscription_id")
                    
                    notify_price_drops = 1 if data.get("notify_price_drops", True) else 0
                    notify_new_listings = 1 if data.get("notify_new_listings", True) else 0
                    notify_back_in_stock = 1 if data.get("notify_back_in_stock", True) else 0
                    notify_watchlist_only = 1 if data.get("notify_watchlist_only", False) else 0
                    min_drop_percent = float(data.get("min_drop_percent", 0.0))
                    
                    if not endpoint and not sub_id:
                        self.send_error_json(400, "Missing identifier (endpoint or subscription_id)")
                        return
                        
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        if sub_id is not None:
                            cursor.execute("""
                                UPDATE push_subscriptions SET
                                    notify_price_drops = ?, notify_new_listings = ?, 
                                    notify_back_in_stock = ?, notify_watchlist_only = ?, 
                                    min_drop_percent = ?
                                WHERE id = ?
                            """, (notify_price_drops, notify_new_listings, notify_back_in_stock, notify_watchlist_only, min_drop_percent, sub_id))
                        else:
                            cursor.execute("""
                                UPDATE push_subscriptions SET
                                    notify_price_drops = ?, notify_new_listings = ?, 
                                    notify_back_in_stock = ?, notify_watchlist_only = ?, 
                                    min_drop_percent = ?
                                WHERE endpoint = ?
                            """, (notify_price_drops, notify_new_listings, notify_back_in_stock, notify_watchlist_only, min_drop_percent, endpoint))
                        conn.commit()
                        self.send_json({"success": True})
                    finally:
                        conn.close()
                else:
                    self.send_error_json(400, "Missing request body")
            except Exception as e:
                self.send_error_json(500, f"Error updating preferences: {str(e)}")
            return

        elif path == "/api/push/test":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
                    data = json.loads(body.decode("utf-8"))
                    endpoint = data.get("endpoint")
                    if not endpoint:
                        self.send_error_json(400, "Missing endpoint")
                        return
                        
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("SELECT id, p256dh, auth FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
                        row = cursor.fetchone()
                        if not row:
                            self.send_error_json(404, "Subscription not found")
                            return
                        sub_id, p256dh, auth = row[0], row[1], row[2]
                        
                        from backend.notifier.push import send_push
                        payload = {
                            "event_type": "test",
                            "title": "Test Push Notification",
                            "body": "Your Logaze push notification subscription is working!",
                            "product_code": "TEST",
                            "price": 0,
                            "save_percent": 0
                        }
                        success = send_push(sub_id, endpoint, p256dh, auth, payload)
                        self.send_json({"success": success})
                    finally:
                        conn.close()
                else:
                    self.send_error_json(400, "Missing request body")
            except Exception as e:
                self.send_error_json(500, f"Error testing push: {str(e)}")
            return

        self.send_error_json(404, "Endpoint not found")

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/push/unsubscribe":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 0:
                    body = self.rfile.read(content_length)
                    data = json.loads(body.decode("utf-8"))
                    endpoint = data.get("endpoint")
                    if not endpoint:
                        self.send_error_json(400, "Missing endpoint")
                        return
                        
                    conn = get_db_connection()
                    try:
                        cursor = conn.cursor()
                        cursor.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
                        conn.commit()
                        self.send_json({"success": True, "message": "Successfully unsubscribed"})
                    finally:
                        conn.close()
                else:
                    self.send_error_json(400, "Missing request body")
            except Exception as e:
                self.send_error_json(500, f"Error unsubscribing: {str(e)}")
            return
            
        self.send_error_json(404, "Endpoint not found")

    def serve_file(self, file_path: str, content_type: str):
        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            # Add cache control for hashed assets under assets/
            if "assets/" in file_path:
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error_json(500, f"Error reading file {os.path.basename(file_path)}: {str(e)}")
