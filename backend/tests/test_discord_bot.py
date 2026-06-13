import unittest
from typing import Optional
from backend.notifier.discord_bot import _matches_subscription, _build_product_embed

class TestDiscordBotLogic(unittest.TestCase):
    def test_matches_subscription_brands(self):
        product = {
            "productName": "Lenovo ThinkPad X1 Carbon Gen 11",
            "model": "ThinkPad X1",
            "finalPrice": 120000.0,
            "savePercent": 30.0,
            "productCondition": "new"
        }
        
        # Matches positive brand
        sub_match = {
            "max_price": None,
            "min_savings": None,
            "brands": "thinkpad,legion",
            "keywords": None,
            "conditions": None
        }
        self.assertTrue(_matches_subscription(product, sub_match))

        # Does not match positive brand
        sub_no_match = {
            "max_price": None,
            "min_savings": None,
            "brands": "legion,loq",
            "keywords": None,
            "conditions": None
        }
        res = _matches_subscription(product, sub_no_match)
        self.assertFalse(res)

        # Excluded by negative brand
        sub_neg_match = {
            "max_price": None,
            "min_savings": None,
            "brands": "thinkpad,!carbon",
            "keywords": None,
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_neg_match))

    def test_matches_subscription_price_and_savings(self):
        product = {
            "productName": "Legion Pro 5",
            "model": "Legion",
            "finalPrice": 150000.0,
            "savePercent": 25.0,
            "productCondition": "certified refurbished"
        }

        # Matches both price and savings
        sub = {
            "max_price": 160000.0,
            "min_savings": 20.0,
            "brands": None,
            "keywords": None,
            "conditions": None
        }
        self.assertTrue(_matches_subscription(product, sub))

        # Price too high
        sub_price_high = {
            "max_price": 140000.0,
            "min_savings": 20.0,
            "brands": None,
            "keywords": None,
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_price_high))

        # Savings too low
        sub_savings_low = {
            "max_price": 160000.0,
            "min_savings": 30.0,
            "brands": None,
            "keywords": None,
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_savings_low))

    def test_matches_subscription_keywords(self):
        product = {
            "productName": "IdeaPad Slim 5 14IRL8",
            "model": "IdeaPad",
            "finalPrice": 60000.0,
            "savePercent": 15.0,
            "productCondition": "new"
        }

        # Matches keyword
        sub = {
            "max_price": None,
            "min_savings": None,
            "brands": None,
            "keywords": "slim,14irl8",
            "conditions": None
        }
        self.assertTrue(_matches_subscription(product, sub))

        # Excluded by negative keyword
        sub_neg = {
            "max_price": None,
            "min_savings": None,
            "brands": None,
            "keywords": "slim,!ideapad",
            "conditions": None
        }
        self.assertFalse(_matches_subscription(product, sub_neg))

    def test_build_product_embed(self):
        product = {
            "productName": "ThinkPad L14 Gen 4",
            "productCode": "21H1003GIN",
            "finalPrice": 75000.0,
            "savePercent": 10.0,
            "productCondition": "new",
            "url": "/p/21h1003gin"
        }
        
        embed = _build_product_embed(product, "added")
        self.assertEqual(embed.title, "🆕 Laptop Added / Back in Stock")
        self.assertEqual(embed.description, "**ThinkPad L14 Gen 4**")
        self.assertEqual(embed.fields[0].name, "💰 Price")
        self.assertEqual(embed.fields[0].value, "₹75,000")
        self.assertEqual(embed.fields[1].name, "🏷️ Savings")
        self.assertEqual(embed.fields[1].value, "10.0%")

if __name__ == "__main__":
    unittest.main()
