import unittest
import os
import time
from datetime import datetime, timedelta
from backend.config import settings
from backend.db.connection import get_db_connection
from backend.db.migrations import run_migrations
from backend.scraper.processor import process_scanned_products

class TestRestockDuration(unittest.TestCase):
    def setUp(self):
        # Override DB_FILE with a temp test database
        self.original_db_file = settings.DB_FILE
        self.test_db_file = "temp_test_processor.db"
        settings.DB_FILE = self.test_db_file
        if os.path.exists(self.test_db_file):
            os.remove(self.test_db_file)
        
        # Run migrations
        run_migrations()

    def tearDown(self):
        # Restore DB_FILE and clean up temp file
        settings.DB_FILE = self.original_db_file
        if os.path.exists(self.test_db_file):
            try:
                os.remove(self.test_db_file)
            except OSError:
                pass

    def test_restock_duration_calculation(self):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        product_code = "TESTSKU123"
        product_name = "Test ThinkPad"
        
        # Formulate times
        fmt = "%Y-%m-%d %H:%M:%S"
        now_dt = datetime.now()
        sold_out_dt = now_dt - timedelta(hours=2, minutes=15)
        
        sold_out_str = sold_out_dt.strftime(fmt)
        
        # 1. Insert product as inactive (sold out) in products table
        cursor.execute("""
            INSERT INTO products (
                product_code, product_name, condition, first_seen, last_seen, removed_at,
                original_price, current_price, save_percent, active, stability_count, pending_state
            ) VALUES (?, ?, 'Refurbished', ?, ?, ?, 100000.0, 80000.0, 20.0, 0, 0, NULL)
        """, (product_code, product_name, sold_out_str, sold_out_str, sold_out_str))
        
        # 2. Insert the 'removed' event into stock_history
        cursor.execute("""
            INSERT INTO stock_history (product_code, event_type, timestamp, price)
            VALUES (?, 'removed', ?, 80000.0)
        """, (product_code, sold_out_str))
        
        conn.commit()
        conn.close()
        
        # 3. Formulate the scanned products array containing our product (now visible again)
        scanned_products = [{
            "productCode": product_code,
            "productName": product_name,
            "productCondition": "Refurbished",
            "webPrice": 100000.0,
            "finalPrice": 80000.0,
            "savePercent": 20.0,
            "url": f"/p/{product_code}"
        }]
        
        # 4. First run is False so that it processes notifications/changes.
        # Run 1: Since stability count is 0, this transitions it to pending restock (stability_count = 1).
        new_listings, back_in_stock = process_scanned_products(scanned_products, is_first_run=False)
        self.assertEqual(len(back_in_stock), 0, "Should not be back in stock in first stability cycle")
        
        # Run 2: Stability count increments to 2 (meeting STABILITY_THRESHOLD = 2).
        # This confirms the restock event.
        new_listings, back_in_stock = process_scanned_products(scanned_products, is_first_run=False)
        
        self.assertEqual(len(back_in_stock), 1, "Should be back in stock in second stability cycle")
        restocked_product = back_in_stock[0]
        self.assertIn("_restock_duration", restocked_product, "Product should have _restock_duration set")
        
        # The expected duration should be '2h 15m'.
        self.assertEqual(restocked_product["_restock_duration"], "2h 15m")

if __name__ == "__main__":
    unittest.main()
