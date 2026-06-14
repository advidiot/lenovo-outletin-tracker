#!/usr/bin/env python3
"""
Utility script to verify and test Telegram bot notifications.
Usage: PYTHONPATH=. python3 backend/scripts/test_telegram.py
"""
import os
import sys

# Set a fallback PORT for the script context if not already set in env,
# to prevent Settings.load() from raising a RuntimeError.
if "PORT" not in os.environ and "SERVER_PORT" not in os.environ:
    os.environ["PORT"] = "8000"

from backend.config import settings
from backend.notifier.telegram import _send_telegram_text

def main():
    print("=== Telegram Bot Configuration Check ===")
    print(f"TELEGRAM_BOT_TOKEN:  {settings.TELEGRAM_BOT_TOKEN if settings.TELEGRAM_BOT_TOKEN else '[NOT SET]'}")
    print(f"TELEGRAM_CHANNEL_ID: {settings.TELEGRAM_CHANNEL_ID if settings.TELEGRAM_CHANNEL_ID else '[NOT SET]'}")
    print(f"TELEGRAM_ENABLED:    {settings.TELEGRAM_ENABLED}")
    print("========================================")

    if not settings.TELEGRAM_BOT_TOKEN:
        print("\n[ERROR] TELEGRAM_BOT_TOKEN is not set in the environment or .env file.")
        sys.exit(1)
    if not settings.TELEGRAM_CHANNEL_ID:
        print("\n[ERROR] TELEGRAM_CHANNEL_ID is not set in the environment or .env file.")
        sys.exit(1)

    print("\nSending a test message to your Telegram channel/chat...")
    test_message = (
        "<b>🔔 Logaze India Tracker - Setup Test</b>\n\n"
        "Your Telegram bot configuration is working correctly! 🎉"
    )
    
    try:
        _send_telegram_text(test_message)
        print("\n[SUCCESS] Test message sent! Please check your Telegram channel or chat.")
    except Exception as e:
        print(f"\n[ERROR] Failed to send Telegram message: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
