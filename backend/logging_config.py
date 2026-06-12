import logging
import sys
from logging.handlers import RotatingFileHandler
from backend.config import settings

logger = logging.getLogger("lenovo_tracker")
logger.setLevel(logging.INFO)

# Clear existing handlers to prevent duplicates during multiple imports/reloads
if logger.hasHandlers():
    logger.handlers.clear()

# Rotating file handler (5MB size limit, keeping 3 backups)
file_handler = RotatingFileHandler(settings.LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
file_handler.setFormatter(logging.Formatter('[%(asctime)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S'))
logger.addHandler(file_handler)

# Stdout console handler
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter('[%(asctime)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S'))
logger.addHandler(console_handler)

def _log(message: str) -> None:
    """Log a message to rotating file and stdout."""
    logger.info(message)
