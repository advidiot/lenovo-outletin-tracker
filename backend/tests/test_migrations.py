import unittest
import os
import sqlite3
from backend.config import settings
from backend.db.connection import get_db_connection
from backend.db.migrations import run_migrations

class TestDatabaseMigrations(unittest.TestCase):
    def setUp(self):
        # Override DB_FILE with a temp test database
        self.original_db_file = settings.DB_FILE
        self.test_db_file = "temp_test_migration.db"
        settings.DB_FILE = self.test_db_file
        if os.path.exists(self.test_db_file):
            os.remove(self.test_db_file)

    def tearDown(self):
        # Restore DB_FILE and clean up temp file
        settings.DB_FILE = self.original_db_file
        if os.path.exists(self.test_db_file):
            try:
                os.remove(self.test_db_file)
            except OSError:
                pass

    def test_migrations_applied_successfully(self):
        # Run the migrations
        run_migrations()

        # Connect and verify
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            
            # Check schema version
            cursor.execute("SELECT version FROM schema_version")
            version = cursor.fetchone()[0]
            self.assertEqual(version, 10)

            # Check if discord_subscriptions table has migration 7 columns
            cursor.execute("PRAGMA table_info(discord_subscriptions)")
            columns = {row[1] for row in cursor.fetchall()}
            
            expected_columns = {
                "channel_id", "guild_id", "min_savings", "max_price", "brands", 
                "keywords", "conditions", "event_types", "created_at", "updated_by",
                "ping_role_added_id", "ping_role_removed_id", "ping_role_price_drop_id", "ping_role_price_hike_id"
            }
            
            for col in expected_columns:
                self.assertIn(col, columns, f"Expected column '{col}' to be created by migrations.")
                
        finally:
            conn.close()

if __name__ == "__main__":
    unittest.main()
