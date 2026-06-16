import { useState, useCallback, useEffect } from 'react';

export type StockState = 'idle' | 'loading' | 'success' | 'error' | 'no_session';

export interface StockResult {
  state: StockState;
  stock?: number;
  recorded?: boolean;
  error?: string;
}

// Simple in-memory cache to share stock results across components during the session
let globalStockResults: Record<string, StockResult> = {};
const listeners = new Set<() => void>();

const updateGlobalResults = (code: string, result: StockResult) => {
  globalStockResults = { ...globalStockResults, [code]: result };
  listeners.forEach((l) => l());
};

export function useStockCheck() {
  const [stockResults, setStockResults] = useState<Record<string, StockResult>>(globalStockResults);

  useEffect(() => {
    const handleUpdate = () => {
      setStockResults(globalStockResults);
    };
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  const checkStock = useCallback(async (productCode: string) => {
    updateGlobalResults(productCode, { state: 'loading' });

    try {
      // Step 1: Add to Cart with credentials to use cookies
      const addRes = await fetch('https://openapi.lenovo.com/in/outletin/en/api/cart/add', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productCode: productCode,
          qty: 1,
        }),
      });

      if (!addRes.ok) {
        throw new Error(`Add to cart failed: ${addRes.status}`);
      }

      // Step 2: Get Cart Details to retrieve item ID
      const cartRes = await fetch('https://openapi.lenovo.com/in/outletin/en/api/cart', {
        method: 'GET',
        credentials: 'include',
      });

      if (!cartRes.ok) {
        throw new Error(`Get cart failed: ${cartRes.status}`);
      }

      const cartData = await cartRes.json();
      
      // If the response is not parsed correctly, or empty list of items,
      // it means the session/cookies are invalid or cart is empty (cookies absent)
      const items = cartData?.data?.items || [];
      const item = items.find((i: any) => i.productCode === productCode);

      if (!item) {
        // No item in cart probably means cookie session wasn't active
        updateGlobalResults(productCode, { state: 'no_session' });
        return;
      }

      const itemId = item.id;

      // Step 3: Set Item Qty to 99 to trigger stock limit message
      const qtyRes = await fetch('https://openapi.lenovo.com/in/outletin/en/api/cart/item/qty', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          id: String(itemId),
          qty: '99',
        }).toString(),
      });

      if (!qtyRes.ok) {
        throw new Error(`Quantity update failed: ${qtyRes.status}`);
      }

      const qtyData = await qtyRes.json();
      const msg = qtyData?.msg || '';
      
      // Match the pattern "only left to X" or similar from the message
      const match = msg.match(/only left to (\d+)/i) || msg.match(/left to (\d+)/i) || msg.match(/only (\d+) left/i);
      let stockCount: number;

      if (match) {
        stockCount = parseInt(match[1], 10);
      } else if (qtyData?.status === 200 || qtyData?.success === true || msg === '') {
        // If it succeeded without stock limit message, it means stock is >= 99
        stockCount = 99;
      } else {
        throw new Error(msg || 'Unknown error parsing quantity update response');
      }

      // Step 4: Record to local DB history
      const dbRes = await fetch('/api/stock_check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_code: productCode,
          stock: stockCount,
        }),
      });

      let recorded = false;
      if (dbRes.ok) {
        const dbData = await dbRes.json();
        recorded = !!dbData?.recorded;
      }

      updateGlobalResults(productCode, {
        state: 'success',
        stock: stockCount,
        recorded: recorded,
      });

    } catch (err: any) {
      console.error('Error checking stock:', err);
      updateGlobalResults(productCode, {
        state: 'error',
        error: err?.message || 'Failed to check stock',
      });
    }
  }, []);

  return {
    checkStock,
    stockResults,
  };
}
