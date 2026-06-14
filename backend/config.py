import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Dict, List

# Core Directory Paths
PACKAGE_DIR = Path(__file__).parent.parent.resolve()

def load_env_file() -> None:
    env_path = PACKAGE_DIR / ".env"
    if env_path.exists():
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")
        except Exception as e:
            print(f"Error loading .env file: {e}")

# Load environment variables from .env if present
load_env_file()

@dataclass
class Settings:
    # Server / Runtime Configuration
    PORT: int
    DIRECTORY: Path
    STATIC_DIR: Path
    DB_FILE: Path
    LOG_FILE: Path
    POLL_INTERVAL: int = 60

    # Discord Notifications Configuration
    DISCORD_BOT_TOKEN: Optional[str] = None
    OWNER_USER_ID: int = 0
    DISCORD_ENABLED: bool = False
    WATCHLIST_ENABLED: bool = True

    # ntfy Configuration
    NTFY_TOPIC: str = "lenovo_outlet_india_tracker_alert"
    NTFY_TOPIC_REMOVED: str = "lenovo_outlet_india_tracker_alert_removed"
    NOTIFICATION_BATCH_THRESHOLD: int = 5

    # API and Scraper Constants
    API_URL: str = "https://openapi.lenovo.com/in/outletin/en/ofp/search/dlp/product/query/get/_tsc"
    LENOVO_BASE_URL: str = "https://www.lenovo.com/in/outletin/en"
    LENOVO_LAPTOPS_URL: str = "https://www.lenovo.com/in/outletin/en/laptops/"
    NTFY_BASE_URL: str = "https://ntfy.sh"
    PAGE_FILTER_ID: str = "afdcd3f7-d8e6-4e9e-a76a-d6060dc75ae9"
    DEFAULT_CONDITION: str = "CERTIFIED REFURBISHED"
    PAGE_SIZE: int = 40
    MAX_PAGE_RETRIES: int = 2
    RETRY_DELAYS: List[float] = None
    INTER_PAGE_DELAY: float = 1.5
    COMPARE_BATCH_SIZE: int = 10

    # Headers
    HEADERS: Dict[str, str] = None
    COMPARE_HEADERS: Dict[str, str] = None

    # Telegram Configuration
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHANNEL_ID: Optional[str] = None
    TELEGRAM_OWNER_ID: Optional[str] = None
    TELEGRAM_ENABLED: bool = False

    # Push Notification (VAPID) Configuration
    VAPID_PRIVATE_KEY: Optional[str] = None
    VAPID_PUBLIC_KEY: Optional[str] = None
    VAPID_SUBJECT: str = "mailto:admin@logaze.com"
    PUSH_ENABLED: bool = False
    
    # Scraper Robustness
    MAX_FAILED_PAGES: int = 2

    @classmethod
    def load(cls) -> "Settings":
        # Check PORT
        env_port = os.environ.get("PORT") or os.environ.get("SERVER_PORT")
        if not env_port:
            raise RuntimeError(
                "Error: Neither PORT nor SERVER_PORT environment variables are set. FalixNodes requires a designated port."
            )
        try:
            port = int(env_port)
        except ValueError:
            raise RuntimeError(f"Error: Invalid PORT value: {env_port}")

        directory = PACKAGE_DIR
        static_dir = directory / "frontend" / "dist"
        db_file = directory / "data" / "lenovo_tracker.db"
        log_file = directory / "data" / "lenovo_tracker.log"

        poll_interval = int(os.environ.get("POLL_INTERVAL", "60"))

        discord_bot_token = os.environ.get("DISCORD_BOT_TOKEN")
        try:
            owner_user_id = int(os.environ.get("OWNER_USER_ID", "0"))
        except ValueError:
            owner_user_id = 0

        # Try to detect Discord installation
        try:
            import discord
            HAS_DISCORD = True
        except ImportError:
            HAS_DISCORD = False

        discord_enabled = bool(HAS_DISCORD and discord_bot_token and owner_user_id)
        watchlist_enabled = os.environ.get("WATCHLIST_ENABLED", "true").lower() in ("true", "1", "yes")

        ntfy_topic = os.environ.get("NTFY_TOPIC", "lenovo_outlet_india_tracker_alert")
        ntfy_topic_removed = os.environ.get("NTFY_TOPIC_REMOVED", "lenovo_outlet_india_tracker_alert_removed")
        
        try:
            notification_batch_threshold = int(os.environ.get("NOTIFICATION_BATCH_THRESHOLD", "5"))
        except ValueError:
            notification_batch_threshold = 5

        retry_delays = [3.0, 6.0]
        
        headers = {
            "Referer": "https://www.lenovo.com/in/outletin/en/laptops/",
            "Origin": "https://www.lenovo.com",
            "Accept": "application/json, text/plain, */*",
        }

        compare_headers = {
            "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Linux"',
            "Referer": "https://www.lenovo.com/",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        }

        telegram_bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
        telegram_channel_id = os.environ.get("TELEGRAM_CHANNEL_ID")
        telegram_owner_id = os.environ.get("TELEGRAM_OWNER_ID")
        telegram_enabled = bool(telegram_bot_token and telegram_channel_id)

        vapid_private_key = os.environ.get("VAPID_PRIVATE_KEY")
        vapid_public_key = os.environ.get("VAPID_PUBLIC_KEY")
        vapid_subject = os.environ.get("VAPID_SUBJECT", "mailto:admin@logaze.com")

        if not vapid_private_key or not vapid_public_key:
            try:
                from cryptography.hazmat.primitives.asymmetric import ec
                import base64
                
                # Generate a prime256v1 key pair
                private_key = ec.generate_private_key(ec.SECP256R1())
                public_key = private_key.public_key()
                
                # DER format and base64url encode (no padding)
                private_der = private_key.private_numbers().private_value.to_bytes(32, byteorder="big")
                vapid_private_key = base64.urlsafe_b64encode(private_der).decode('utf-8').rstrip('=')
                
                public_numbers = public_key.public_numbers()
                x = public_numbers.x.to_bytes(32, byteorder="big")
                y = public_numbers.y.to_bytes(32, byteorder="big")
                public_der = b"\x04" + x + y
                vapid_public_key = base64.urlsafe_b64encode(public_der).decode('utf-8').rstrip('=')
                
                print("\n" + "="*80)
                print("WARNING: VAPID keys were not found in environment variables!")
                print("Dynamically generated new VAPID keys for this session:")
                print(f"VAPID_PUBLIC_KEY={vapid_public_key}")
                print(f"VAPID_PRIVATE_KEY={vapid_private_key}")
                print("To persist these keys, please add them to your .env file.")
                print("="*80 + "\n")
            except Exception:
                # If cryptography is not available yet, we leave them as None
                pass

        push_enabled = bool(vapid_private_key and vapid_public_key)

        try:
            max_failed_pages = int(os.environ.get("MAX_FAILED_PAGES", "2"))
        except ValueError:
            max_failed_pages = 2

        return cls(
            PORT=port,
            DIRECTORY=directory,
            STATIC_DIR=static_dir,
            DB_FILE=db_file,
            LOG_FILE=log_file,
            POLL_INTERVAL=poll_interval,
            DISCORD_BOT_TOKEN=discord_bot_token,
            OWNER_USER_ID=owner_user_id,
            DISCORD_ENABLED=discord_enabled,
            WATCHLIST_ENABLED=watchlist_enabled,
            NTFY_TOPIC=ntfy_topic,
            NTFY_TOPIC_REMOVED=ntfy_topic_removed,
            NOTIFICATION_BATCH_THRESHOLD=notification_batch_threshold,
            RETRY_DELAYS=retry_delays,
            HEADERS=headers,
            COMPARE_HEADERS=compare_headers,
            TELEGRAM_BOT_TOKEN=telegram_bot_token,
            TELEGRAM_CHANNEL_ID=telegram_channel_id,
            TELEGRAM_OWNER_ID=telegram_owner_id,
            TELEGRAM_ENABLED=telegram_enabled,
            VAPID_PRIVATE_KEY=vapid_private_key,
            VAPID_PUBLIC_KEY=vapid_public_key,
            VAPID_SUBJECT=vapid_subject,
            PUSH_ENABLED=push_enabled,
            MAX_FAILED_PAGES=max_failed_pages,
        )

# Load global settings instance
settings = Settings.load()
