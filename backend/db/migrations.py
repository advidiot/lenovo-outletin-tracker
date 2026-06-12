import sqlite3
from backend.db.connection import get_db_connection
from backend.logging_config import _log

def run_migrations() -> None:
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Enable WAL mode
        cursor.execute("PRAGMA journal_mode=WAL")
        
        # Check if schema_version exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
        has_version_table = cursor.fetchone() is not None
        
        current_version = 0
        if not has_version_table:
            # Check if products table exists to determine baseline
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
            has_products_table = cursor.fetchone() is not None
            
            # Create schema_version table
            cursor.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY)")
            
            if has_products_table:
                # Check what columns are already present
                cursor.execute("PRAGMA table_info(products)")
                columns = [row[1] for row in cursor.fetchall()]
                
                # Check if discord_subscriptions exists
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='discord_subscriptions'")
                has_discord = cursor.fetchone() is not None
                
                if has_discord:
                    current_version = 2
                elif "full_specs" in columns:
                    current_version = 1
                else:
                    current_version = 0
            else:
                current_version = 0
                
            cursor.execute("INSERT INTO schema_version (version) VALUES (?)", (current_version,))
            conn.commit()
            _log(f"Database schema version initialized to baseline: {current_version}")
        else:
            cursor.execute("SELECT version FROM schema_version")
            current_version = cursor.fetchone()[0]
            
        _log(f"Current database schema version: {current_version}")
        
        # Run migrations sequentially
        if current_version < 1:
            _log("Applying migration 1: Create base products and price_history tables.")
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    product_code TEXT PRIMARY KEY,
                    product_name TEXT,
                    condition TEXT,
                    first_seen TEXT,
                    last_seen TEXT,
                    removed_at TEXT,
                    original_price REAL,
                    current_price REAL,
                    save_percent REAL,
                    active INTEGER,
                    specs TEXT,
                    rating_star REAL,
                    comment_count INTEGER,
                    thumbnail_url TEXT,
                    full_specs TEXT
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS price_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_code TEXT,
                    timestamp TEXT,
                    price REAL,
                    save_percent REAL,
                    FOREIGN KEY(product_code) REFERENCES products(product_code)
                )
            """)
            
            # Catch up columns if base table existed but columns didn't
            cursor.execute("PRAGMA table_info(products)")
            columns = [row[1] for row in cursor.fetchall()]
            
            migrations = [
                ("removed_at", "TEXT"),
                ("specs", "TEXT"),
                ("rating_star", "REAL"),
                ("comment_count", "INTEGER"),
                ("thumbnail_url", "TEXT"),
                ("full_specs", "TEXT"),
            ]
            
            for col_name, col_type in migrations:
                if col_name not in columns:
                    _log(f"Adding column '{col_name}' ({col_type}) to products table.")
                    cursor.execute(f"ALTER TABLE products ADD COLUMN {col_name} {col_type}")
            
            cursor.execute("UPDATE schema_version SET version = 1")
            conn.commit()
            _log("Migration 1 applied successfully.")
            current_version = 1
            
        if current_version < 2:
            _log("Applying migration 2: Create Discord tables.")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS discord_subscriptions (
                    channel_id TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    min_savings REAL,
                    max_price REAL,
                    brands TEXT,
                    keywords TEXT,
                    conditions TEXT,
                    event_types TEXT DEFAULT 'all',
                    created_at TEXT,
                    updated_by TEXT
                )
            """)
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS discord_authorized_users (
                    user_id TEXT PRIMARY KEY,
                    added_by TEXT,
                    added_at TEXT
                )
            """)
            
            cursor.execute("UPDATE schema_version SET version = 2")
            conn.commit()
            _log("Migration 2 applied successfully.")
            current_version = 2
            
        if current_version < 3:
            _log("Applying migration 3: Create watchlist table.")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS watchlists (
                    user_id TEXT,
                    product_code TEXT,
                    target_price REAL,
                    created_at TEXT,
                    PRIMARY KEY (user_id, product_code)
                )
            """)
            cursor.execute("UPDATE schema_version SET version = 3")
            conn.commit()
            _log("Migration 3 applied successfully.")
            current_version = 3

        if current_version < 4:
            _log("Applying migration 4: Add price_delta column to price_history.")
            # Add signed delta column: negative = price drop, positive = price hike
            cursor.execute("PRAGMA table_info(price_history)")
            ph_columns = [row[1] for row in cursor.fetchall()]
            if "price_delta" not in ph_columns:
                cursor.execute("ALTER TABLE price_history ADD COLUMN price_delta REAL")
            cursor.execute("UPDATE schema_version SET version = 4")
            conn.commit()
            _log("Migration 4 applied successfully.")
            current_version = 4

        if current_version < 5:
            _log("Applying migration 5: Create push_subscriptions table.")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    endpoint TEXT UNIQUE NOT NULL,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    user_agent TEXT,
                    watchlist TEXT DEFAULT '[]',
                    notify_price_drops INTEGER DEFAULT 1,
                    notify_new_listings INTEGER DEFAULT 1,
                    notify_back_in_stock INTEGER DEFAULT 1,
                    notify_watchlist_only INTEGER DEFAULT 0,
                    min_drop_percent REAL DEFAULT 0.0,
                    created_at TEXT,
                    last_used TEXT
                )
            """)
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint)"
            )
            cursor.execute("UPDATE schema_version SET version = 5")
            conn.commit()
            _log("Migration 5 applied successfully.")
            current_version = 5

        if current_version < 6:
            _log("Applying migration 6: Reconstruct push_subscriptions, create subscription_watchlist.")
            
            # 1. Fetch current subscriptions and their watchlists
            cursor.execute("""
                SELECT id, endpoint, p256dh, auth, user_agent, watchlist, 
                       notify_price_drops, notify_new_listings, notify_back_in_stock, 
                       notify_watchlist_only, min_drop_percent, created_at, last_used 
                FROM push_subscriptions
            """)
            rows = cursor.fetchall()
            
            # Store existing data
            import json
            existing_subs = []
            for r in rows:
                existing_subs.append({
                    "id": r["id"],
                    "endpoint": r["endpoint"],
                    "p256dh": r["p256dh"],
                    "auth": r["auth"],
                    "user_agent": r["user_agent"],
                    "watchlist": r["watchlist"],
                    "notify_price_drops": r["notify_price_drops"],
                    "notify_new_listings": r["notify_new_listings"],
                    "notify_back_in_stock": r["notify_back_in_stock"],
                    "notify_watchlist_only": r["notify_watchlist_only"],
                    "min_drop_percent": r["min_drop_percent"],
                    "created_at": r["created_at"],
                    "last_used": r["last_used"]
                })
            
            # 2. Drop the old table and its index
            cursor.execute("DROP INDEX IF EXISTS idx_push_endpoint")
            cursor.execute("DROP TABLE IF EXISTS push_subscriptions")
            
            # 3. Recreate push_subscriptions table without watchlist column
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    endpoint TEXT UNIQUE NOT NULL,
                    p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL,
                    user_agent TEXT,
                    notify_price_drops INTEGER DEFAULT 1,
                    notify_new_listings INTEGER DEFAULT 1,
                    notify_back_in_stock INTEGER DEFAULT 1,
                    notify_watchlist_only INTEGER DEFAULT 0,
                    min_drop_percent REAL DEFAULT 0.0,
                    created_at TEXT,
                    last_used TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions(endpoint)")
            
            # 4. Create subscription_watchlist table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS subscription_watchlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subscription_id INTEGER NOT NULL,
                    product_code TEXT NOT NULL,
                    created_at TEXT,
                    FOREIGN KEY(subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE,
                    UNIQUE(subscription_id, product_code)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sub_watchlist_code ON subscription_watchlist(product_code)")
            
            # 5. Insert old subscriptions back, keeping their IDs, and populate subscription_watchlist
            for sub in existing_subs:
                cursor.execute("""
                    INSERT INTO push_subscriptions (
                        id, endpoint, p256dh, auth, user_agent, notify_price_drops,
                        notify_new_listings, notify_back_in_stock, notify_watchlist_only,
                        min_drop_percent, created_at, last_used
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    sub["id"], sub["endpoint"], sub["p256dh"], sub["auth"], sub["user_agent"],
                    sub["notify_price_drops"], sub["notify_new_listings"], sub["notify_back_in_stock"],
                    sub["notify_watchlist_only"], sub["min_drop_percent"], sub["created_at"], sub["last_used"]
                ))
                
                watchlist_json = sub["watchlist"]
                if watchlist_json:
                    try:
                        codes = json.loads(watchlist_json)
                        if isinstance(codes, list):
                            for code in codes:
                                cursor.execute("""
                                    INSERT OR IGNORE INTO subscription_watchlist (subscription_id, product_code, created_at)
                                    VALUES (?, ?, ?)
                                """, (sub["id"], code, sub["created_at"]))
                    except Exception as e:
                        _log(f"Warning: Failed to parse watchlist JSON for subscription {sub['id']}: {e}")
            
            cursor.execute("UPDATE schema_version SET version = 6")
            conn.commit()
            _log("Migration 6 applied successfully.")
            current_version = 6
            
    finally:
        conn.close()
