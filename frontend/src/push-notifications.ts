// Web Push Notification Helper Utilities

export interface PushPrefs {
  notify_price_drops: boolean;
  notify_new_listings: boolean;
  notify_back_in_stock: boolean;
  notify_watchlist_only: boolean;
  min_drop_percent: number;
}

export const DEFAULT_PREFS: PushPrefs = {
  notify_price_drops: true,
  notify_new_listings: true,
  notify_back_in_stock: true,
  notify_watchlist_only: false,
  min_drop_percent: 0,
};

// Convert VAPID key to Uint8Array for PushManager
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Get active Service Worker Registration
export async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  try {
    // Check if sw.js is already registered
    const registrations = await navigator.serviceWorker.getRegistrations();
    const existing = registrations.find(reg => reg.active && reg.active.scriptURL.includes("sw.js"));
    if (existing) return existing;

    // Register service worker if not registered
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.error("Service Worker registration failed:", err);
    return null;
  }
}

// Get existing Push Subscription
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await getSWRegistration();
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

// Check Notification Permission
export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

// Request Notification Permission and Subscribe to Push
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!vapidPublicKey) {
    throw new Error("VAPID public key is missing or empty.");
  }

  const reg = await getSWRegistration();
  if (!reg) {
    throw new Error("Browser or Service Worker not supported.");
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission denied by user.");
  }

  // Subscribe with Push Manager
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  // Send subscription to backend
  const userAgent = navigator.userAgent;
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("p256dh") || []))),
        auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey("auth") || []))),
      },
      user_agent: userAgent,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || "Failed to register subscription on server.");
  }

  // Sync current local watchlist
  try {
    const saved = localStorage.getItem("trackfurb_watchlist");
    const watchlist = saved ? JSON.parse(saved) : [];
    if (watchlist.length > 0) {
      await syncWatchlist(subscription.endpoint, watchlist);
    }
  } catch (e) {
    console.error("Failed to sync initial watchlist to push subscription:", e);
  }

  return subscription;
}

// Unsubscribe from Push
export async function unsubscribeFromPush(subscription: PushSubscription): Promise<boolean> {
  try {
    // Delete from backend first
    await fetch("/api/push/unsubscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    // Unsubscribe client side
    return await subscription.unsubscribe();
  } catch (err) {
    console.error("Error unsubscribing:", err);
    return false;
  }
}

// Update Subscription Preferences
export async function updatePushPrefs(endpoint: string, prefs: PushPrefs): Promise<boolean> {
  try {
    const res = await fetch("/api/push/update_prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        notify_price_drops: prefs.notify_price_drops,
        notify_new_listings: prefs.notify_new_listings,
        notify_back_in_stock: prefs.notify_back_in_stock,
        notify_watchlist_only: prefs.notify_watchlist_only,
        min_drop_percent: prefs.min_drop_percent,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to update push preferences:", err);
    return false;
  }
}

// Sync Watchlist Items
export async function syncWatchlist(endpoint: string, watchlist: string[]): Promise<boolean> {
  try {
    const res = await fetch("/api/push/update_watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint,
        watchlist,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error("Failed to sync watchlist with server subscription:", err);
    return false;
  }
}

// Trigger Test Notification
export async function sendTestNotification(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("Failed to send test push notification:", err);
    return false;
  }
}
