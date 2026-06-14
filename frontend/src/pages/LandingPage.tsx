import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  subscribeToPush, 
  unsubscribeFromPush, 
  getExistingSubscription, 
  getNotificationPermission,
  updatePushPrefs,
  sendTestNotification,
  DEFAULT_PREFS,
  PushPrefs
} from "../push-notifications";
import { useToast } from "../components/ToastProvider";
import "./LandingPage.css";

interface LandingPageProps {
  laptopData: any[];
}

export const LandingPage = ({ laptopData }: LandingPageProps) => {
  const { showToast } = useToast();
  const [vapidKey, setVapidKey] = useState<string>("");
  const [discordUrl, setDiscordUrl] = useState<string>("https://discord.gg/example");
  const [telegramUrl, setTelegramUrl] = useState<string>("https://t.me/example");

  // Subscription and notification states
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission());
  const [subscribing, setSubscribing] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);

  // Preference states
  const [prefs, setPrefs] = useState<PushPrefs>(() => {
    try {
      const saved = localStorage.getItem("push_notification_prefs");
      return saved ? JSON.parse(saved) : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });

  // Fetch configs
  useEffect(() => {
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load configs");
        return res.json();
      })
      .then((data) => {
        if (data.vapidPublicKey) setVapidKey(data.vapidPublicKey);
        if (data.discordInvite) setDiscordUrl(data.discordInvite);
        if (data.telegramChannel) setTelegramUrl(data.telegramChannel);
      })
      .catch((err) => console.error("Error fetching configs:", err));
  }, []);

  // Check existing push subscription
  useEffect(() => {
    getExistingSubscription().then((sub) => {
      setSubscription(sub);
      setPermission(getNotificationPermission());
    });
  }, []);

  // Save prefs
  useEffect(() => {
    localStorage.setItem("push_notification_prefs", JSON.stringify(prefs));
    if (subscription) {
      updatePushPrefs(subscription.endpoint, prefs).catch((err) => 
        console.error("Failed to sync updated preferences to backend:", err)
      );
    }
  }, [prefs, subscription]);

  // Handle subscribe click
  const handleSubscribe = async () => {
    if (!vapidKey) {
      showToast("Web Push is currently disabled on the backend. VAPID keys missing.", "warning");
      return;
    }
    setSubscribing(true);
    try {
      const sub = await subscribeToPush(vapidKey);
      setSubscription(sub);
      setPermission(getNotificationPermission());
      if (sub) {
        await updatePushPrefs(sub.endpoint, prefs);
        showToast("🔔 Successfully subscribed to push notifications!", "success");
      }
    } catch (err: any) {
      console.error(err);
      setPermission(getNotificationPermission());
      showToast(err.message || "Failed to subscribe to push notifications.", "error");
    } finally {
      setSubscribing(false);
    }
  };

  // Handle unsubscribe click
  const handleUnsubscribe = async () => {
    if (!subscription) return;
    setSubscribing(true);
    try {
      const success = await unsubscribeFromPush(subscription);
      if (success) {
        setSubscription(null);
        setPermission(getNotificationPermission());
        showToast("Unsubscribed from browser alerts.", "info");
      } else {
        showToast("Unsubscribe call failed. Please clear browser notification settings manually.", "warning");
      }
    } catch (err: any) {
      console.error(err);
      showToast("Failed to unsubscribe.", "error");
    } finally {
      setSubscribing(false);
    }
  };

  // Send a test notification
  const handleTest = async () => {
    if (!subscription) return;
    setTesting(true);
    try {
      const success = await sendTestNotification(subscription.endpoint);
      if (success) {
        showToast("Test notification sent!", "success");
      } else {
        showToast("Failed to deliver test notification. Check if permission is blocked.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error sending test notification.", "error");
    } finally {
      setTesting(false);
    }
  };

  const handlePrefChange = (key: keyof PushPrefs, value: any) => {
    setPrefs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Stats calculation
  const activeCount = laptopData.filter((l: any) => l.available === true).length;
  const averageDiscount = Math.round(
    laptopData
      .filter((l: any) => l.available === true && Number(l["percentage-savings"]) > 0)
      .reduce((acc: number, cur: any) => acc + Number(cur["percentage-savings"]), 0) /
      (laptopData.filter((l: any) => l.available === true && Number(l["percentage-savings"]) > 0).length || 1)
  );

  return (
    <div className="landing-container">
      {/* Background glow animations */}
      <div className="landing-glow glow-1"></div>
      <div className="landing-glow glow-2"></div>

      <header className="landing-header animate-fade-in">
        <div className="landing-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="6" fill="url(#logoGrad)"/>
            <path d="M7 8h10M7 12h6M7 16h8" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0891b2" />
                <stop offset="1" stopColor="#6366f1" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 className="landing-brand">TrackFurb</h1>
        <p className="landing-tagline">
          Real-time deal tracker for refurbished Lenovo laptops in India
        </p>
      </header>

      <section className="landing-stats animate-fade-in">
        <div className="stat-pill">
          <span className="stat-indicator pulse-green"></span>
          <strong>{activeCount || "Many"}</strong> Laptops In-Stock
        </div>
        <div className="stat-pill">
          <span className="stat-icon">🏷️</span>
          Avg. <strong>{averageDiscount || "30"}%</strong> Savings
        </div>
      </section>

      <main className="landing-main">
        {/* Browse banner — full width */}
        <div className="landing-card deal-card animate-slide-up-1">
          <div className="card-accent"></div>
          <div className="card-icon">💻</div>
          <div className="deal-text-group">
            <h2 className="card-title">Browse Deals</h2>
            <p className="card-desc">
              Explore the live database of certified refurbished laptops. Filter by GPU, screen size, CPU, and RAM, check price charts, and compare models side-by-side.
            </p>
          </div>
          <Link to="/browse" className="btn btn-primary btn-lg deal-cta-btn">
            Launch Grid →
          </Link>
        </div>

        {/* Divider */}
        <div className="landing-section-divider">
          <span>Get Notified</span>
        </div>

        {/* Notification cards row */}
        <div className="landing-notify-grid">

          {/* Card 2: Discord */}
          <div className="landing-card discord-card animate-slide-up-2">
            <div className="card-accent"></div>
            <div className="card-icon">💬</div>
            <h2 className="card-title">Discord Alerts</h2>
            <p className="card-desc">
              Join our server to receive customizable notifications. Subscribe to specific role pings for instant restock announcements, price drop events, and general deal chatter.
            </p>
            <div className="card-spacer"></div>
            <a href={discordUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-lg btn-full btn-discord">
              Join Discord Server
            </a>
          </div>

          {/* Card 3: Telegram */}
          <div className="landing-card telegram-card animate-slide-up-3">
            <div className="card-accent"></div>
            <div className="card-icon">✈️</div>
            <h2 className="card-title">Telegram Feed</h2>
            <p className="card-desc">
              Prefer standard feeds? Join our Telegram channel for direct broadcasts of new refurbished laptops, major discounts, and structured batch summary listings.
            </p>
            <div className="card-spacer"></div>
            <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-lg btn-full btn-telegram">
              Join Telegram Channel
            </a>
          </div>

          {/* Card 4: Web Push Notifications */}
          <div className="landing-card push-card animate-slide-up-4">
            <div className="card-accent"></div>
          <div className="card-icon-container">
            <div className={`push-bell ${subscription ? "active-glow" : ""}`}>🔔</div>
          </div>
          <h2 className="card-title">Web Push Alerts</h2>
          <p className="card-desc">
            Receive direct browser and system notifications for laptop deal updates. Fully automated, instant, and runs entirely in your background.
          </p>

          <div className="push-controls">
            {!subscription ? (
              <>
                <button 
                  onClick={handleSubscribe} 
                  disabled={subscribing}
                  className="btn btn-primary btn-lg btn-full"
                >
                  {subscribing ? "Requesting Permissions…" : "Enable Browser Notifications"}
                </button>
                {permission === "denied" && (
                  <p className="permission-warning" style={{ color: "var(--accent-red)", fontSize: "0.8rem", marginTop: 8, textAlign: "center" }}>
                    ⚠️ Notifications are blocked. Please reset your browser site permissions to enable them.
                  </p>
                )}
              </>
            ) : (
              <div className="subscription-active-panel">
                <div className="sub-status-banner">
                  <span className="status-dot-active"></span> Active Subscription
                </div>
                
                <div className="push-preferences">
                  <h3 className="pref-header">Notification Preferences</h3>
                  
                  <label className="pref-row">
                    <span>Price Drops</span>
                    <input 
                      type="checkbox" 
                      checked={prefs.notify_price_drops} 
                      onChange={(e) => handlePrefChange("notify_price_drops", e.target.checked)}
                    />
                  </label>
                  
                  <label className="pref-row">
                    <span>New Listings</span>
                    <input 
                      type="checkbox" 
                      checked={prefs.notify_new_listings} 
                      onChange={(e) => handlePrefChange("notify_new_listings", e.target.checked)}
                    />
                  </label>

                  <label className="pref-row">
                    <span>Back in Stock</span>
                    <input 
                      type="checkbox" 
                      checked={prefs.notify_back_in_stock} 
                      onChange={(e) => handlePrefChange("notify_back_in_stock", e.target.checked)}
                    />
                  </label>

                  <label className="pref-row">
                    <span>Watchlist Only</span>
                    <input 
                      type="checkbox" 
                      checked={prefs.notify_watchlist_only} 
                      onChange={(e) => handlePrefChange("notify_watchlist_only", e.target.checked)}
                    />
                  </label>

                  <div className="pref-slider-group">
                    <div className="pref-slider-labels">
                      <span>Min. Price Drop %</span>
                      <span className="pref-slider-val">{prefs.min_drop_percent}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="30" 
                      step="5"
                      value={prefs.min_drop_percent} 
                      onChange={(e) => handlePrefChange("min_drop_percent", parseInt(e.target.value))}
                      className="pref-slider"
                    />
                  </div>
                </div>

                <div className="sub-actions-row">
                  <button 
                    onClick={handleTest} 
                    disabled={testing}
                    className="btn btn-secondary btn-sm flex-grow"
                  >
                    {testing ? "Testing…" : "Send Test Alert"}
                  </button>
                  <button 
                    onClick={handleUnsubscribe} 
                    disabled={subscribing}
                    className="btn btn-ghost btn-sm btn-danger-hover"
                  >
                    Unsubscribe
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* end landing-notify-grid */}
      </main>

      <footer className="landing-footer animate-fade-in">
        TrackFurb v2.0 — Self-Hosted Lenovo Outlet India deals tracker
      </footer>
    </div>
  );
};
