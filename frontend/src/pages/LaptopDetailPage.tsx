import { useState, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { LaptopData } from "../data";
import { useToast } from "../components/ToastProvider";
import "./LaptopDetailPage.css";

interface HistoryItem {
  timestamp: string;
  price: number;
  save_percent: number;
}

const SPEC_SECTIONS = [
  {
    key: "display",
    icon: "🖥️",
    label: "Display",
    fields: ["screen-size", "resolution", "display", "screen-aspect-ratio"],
  },
  {
    key: "performance",
    icon: "⚡",
    label: "Performance",
    fields: ["processor", "memory-size", "storage-size", "storage-type"],
  },
  {
    key: "graphics",
    icon: "🎮",
    label: "Graphics",
    fields: ["graphic-card"],
  },
  {
    key: "battery",
    icon: "🔋",
    label: "Battery",
    fields: ["battery-capacity", "battery", "ac-adapter"],
  },
  {
    key: "connectivity",
    icon: "📡",
    label: "Connectivity",
    fields: ["wlan", "bluetooth", "camera"],
  },
  {
    key: "physical",
    icon: "📦",
    label: "Physical",
    fields: ["weight", "color", "operating-system", "first_seen"],
  },
];

const FIELD_LABELS: Record<string, string> = {
  "screen-size": "Screen",
  "resolution": "Resolution",
  "display": "Panel",
  "screen-aspect-ratio": "Aspect Ratio",
  "processor": "CPU",
  "memory-size": "RAM",
  "storage-size": "Storage",
  "storage-type": "Storage Type",
  "graphic-card": "GPU",
  "battery-capacity": "Battery",
  "battery": "Battery Details",
  "ac-adapter": "Charger",
  "wlan": "Wi-Fi",
  "bluetooth": "Bluetooth",
  "camera": "Camera",
  "weight": "Weight",
  "color": "Color",
  "operating-system": "OS",
  "first_seen": "First Tracked",
};

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-date">{new Date(label).toLocaleDateString("en-IN")}</div>
      <div className="tooltip-price">₹{Number(payload[0].value).toLocaleString("en-IN")}</div>
      {payload[0].payload.save_percent && (
        <div className="tooltip-savings">{payload[0].payload.save_percent}% off</div>
      )}
    </div>
  );
};

interface LaptopDetailPageProps {
  allLaptops: LaptopData[];
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
  checkStock: (productCode: string) => Promise<void>;
  stockResults: Record<string, import("../useStockCheck").StockResult>;
}

export const LaptopDetailPage = ({
  allLaptops,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
  checkStock,
  stockResults,
}: LaptopDetailPageProps) => {
  const { productNumber } = useParams<{ productNumber: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  
  const [stockHistory, setStockHistory] = useState<{ stock: number; checked_at: string }[]>([]);
  
  const [imgError, setImgError] = useState(false);

  const laptop = allLaptops.find(
    (l) => String(l["product-number"]) === productNumber
  );

  const code = productNumber || "";
  const isStarred = watchlist.includes(code);
  const isCompared = compareList.some((c) => c["product-number"] === code);
  const available = laptop?.["available"] as boolean | undefined;

  useEffect(() => {
    if (!code) return;
    setHistoryLoading(true);
    setHistoryError(null);
    fetch(`/api/price_history?code=${code}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((d) => { setHistory(d); setHistoryLoading(false); })
      .catch(() => {
        setHistoryError("Could not load price history.");
        setHistoryLoading(false);
      });
  }, [code]);

  const loadStockHistory = useCallback(() => {
    if (!code) return;
    fetch(`/api/stock_history?code=${code}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((d) => { setStockHistory(d); })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    loadStockHistory();
  }, [code, loadStockHistory]);

  const result = stockResults[code];
  const isRecorded = result?.recorded;

  // Reload stock history when a new stock check logs a data point successfully
  useEffect(() => {
    if (isRecorded) {
      loadStockHistory();
    }
  }, [isRecorded, loadStockHistory]);

  if (!laptop) {
    return (
      <div className="detail-not-found">
        <div className="not-found-icon">🔍</div>
        <h2>Laptop not found</h2>
        <p>Product <code>{productNumber}</code> could not be found in the database.</p>
        <Link to="/browse" className="btn btn-primary">Back to Grid</Link>
      </div>
    );
  }

  const price = Number(laptop["price"]);
  const origPrice = Number(laptop["orig-price"]);
  const savings = Number(laptop["percentage-savings"]);
  const thumbnailUrl = laptop["thumbnail_url"] as string | null;

  return (
    <div className="detail-page">
      {/* Breadcrumb */}
      <div className="detail-breadcrumb">
        <button onClick={() => navigate(-1)} className="back-btn">← Back</button>
        <span className="breadcrumb-sep">/</span>
        <Link to="/browse" className="breadcrumb-link">Home</Link>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-current">{String(laptop["model"])}</span>
      </div>

      {/* Hero */}
      <div className="detail-hero card">
        {/* Image */}
        <div className="detail-image-wrap">
          {thumbnailUrl && !imgError ? (
            <img
              src={thumbnailUrl}
              alt={String(laptop["model"])}
              className="detail-image"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="detail-image-placeholder">
              <span>💻</span>
              <span className="placeholder-label">No image</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="detail-hero-info">
          <div className="detail-badges">
            {available !== undefined && (
              <span className={`badge ${available ? "badge-green" : "badge-red"}`}>
                {available ? "In Stock" : "Sold Out"}
              </span>
            )}
            {laptop["product-condition"] && (
              <span className="badge badge-amber">
                {String(laptop["product-condition"])}
              </span>
            )}
          </div>

          <h1 className="detail-title">{String(laptop["model"])}</h1>
          <p className="detail-code">Product code: {code}</p>

          <div className="detail-pricing">
            <span className="detail-price">₹{price.toLocaleString("en-IN")}</span>
            {origPrice > 0 && (
              <span className="detail-orig-price">₹{origPrice.toLocaleString("en-IN")}</span>
            )}
            {savings > 0 && (
              <span className="badge badge-green">{Math.round(savings)}% off</span>
            )}
          </div>

          <div className="detail-actions">
            {available ? (
              <a
                href={`https://www.lenovo.com/in/outletin/en/p/${code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-lg"
              >
                Buy on Lenovo Store ↗
              </a>
            ) : (
              <button className="btn btn-lg" style={{ opacity: 0.5, cursor: "not-allowed" }} disabled>
                Sold Out
              </button>
            )}

            {/* Check Stock Button / Indicator */}
            {available ? (
              <div className="detail-stock-check-container">
                {(() => {
                  const state = result?.state || 'idle';
                  if (state === 'idle') {
                    return (
                      <button 
                        className="btn btn-secondary btn-lg stock-check-button" 
                        onClick={() => checkStock(code)}
                      >
                        📦 Check Stock
                      </button>
                    );
                  }
                  if (state === 'loading') {
                    return (
                      <button className="btn btn-secondary btn-lg stock-check-button" disabled>
                        <span className="stock-spinner"></span> Checking…
                      </button>
                    );
                  }
                  if (state === 'success') {
                    return (
                      <div className="stock-check-success-msg">
                        📦 {result.stock === 99 ? '99+' : result.stock} units left
                      </div>
                    );
                  }
                  if (state === 'no_session') {
                    return (
                      <div className="stock-check-error-msg">
                        ⚠️ <a href="https://www.lenovo.com/in/outletin/en/" target="_blank" rel="noopener noreferrer" className="stock-external-link">Visit lenovo.com first ↗</a>
                      </div>
                    );
                  }
                  return (
                    <div className="stock-check-error-msg">
                      ⚠️ Could not check — <button className="stock-retry-btn" onClick={() => checkStock(code)}>retry</button>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <button className="btn btn-secondary btn-lg" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                📦 Check Stock
              </button>
            )}

            <button
              className={`btn btn-ghost ${isStarred ? "btn-starred" : ""}`}
              onClick={() => {
                toggleWatch(code);
                showToast(
                  isStarred ? "Removed from watchlist" : "⭐ Added to watchlist",
                  isStarred ? "info" : "success"
                );
              }}
              title={isStarred ? "Remove from watchlist" : "Add to watchlist"}
            >
              {isStarred ? "★" : "☆"}
            </button>

            <button
              className={`btn btn-ghost ${isCompared ? "btn-compared" : ""}`}
              onClick={() => {
                if (!isCompared && compareList.length >= 4) {
                  showToast("Comparison full — max 4 laptops", "warning");
                  return;
                }
                toggleCompare(laptop);
                showToast(
                  isCompared ? "Removed from comparison" : "✅ Added to comparison",
                  isCompared ? "info" : "success"
                );
              }}
              title={isCompared ? "Remove from comparison" : "Add to comparison"}
            >
              {isCompared ? "✓ Comparing" : "+ Compare"}
            </button>
          </div>
        </div>
      </div>

      {/* Body: chart + specs */}
      <div className="detail-body">
        {/* Price history chart */}
        <div className="detail-chart card">
          <h2 className="detail-section-title">Price History (INR)</h2>
          {historyLoading ? (
            <div className="chart-loading">
              <div className="skeleton-line" style={{ height: 200 }} />
            </div>
          ) : historyError ? (
            <div className="chart-error">{historyError}</div>
          ) : history.length === 0 ? (
            <div className="chart-empty">No price history available yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-teal)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent-teal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="var(--accent-teal)"
                  strokeWidth={2.5}
                  fill="url(#priceGradient)"
                  dot={{ fill: "var(--accent-teal)", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "var(--accent-teal)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stock History Chart (conditionally rendered) */}
        {stockHistory.length >= 2 && (
          <div className="detail-chart card stock-history-chart-card">
            <h2 className="detail-section-title">Stock History (Exact units)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stockHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-indigo, #6366f1)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent-indigo, #6366f1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="checked_at"
                  tickFormatter={(v) => {
                    if (!v) return "";
                    // format YYYY-MM-DD HH:MM:SS to DD/MM HH:MM
                    try {
                      const parts = v.split(" ");
                      const dateParts = parts[0].split("-");
                      const timeParts = parts[1].split(":");
                      return `${dateParts[2]}/${dateParts[1]} ${timeParts[0]}:${timeParts[1]}`;
                    } catch {
                      return v;
                    }
                  }}
                  tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tickFormatter={(v) => String(v)}
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip 
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="chart-tooltip">
                        <div className="tooltip-date">{label}</div>
                        <div className="tooltip-price" style={{ color: "var(--accent-indigo, #6366f1)" }}>
                          {payload[0].value === 99 ? '99+ units' : `${payload[0].value} units`}
                        </div>
                      </div>
                    );
                  }} 
                />
                <Area
                  type="stepAfter" // Staircase step-down effect
                  dataKey="stock"
                  stroke="var(--accent-indigo, #6366f1)"
                  strokeWidth={2.5}
                  fill="url(#stockGradient)"
                  dot={{ fill: "var(--accent-indigo, #6366f1)", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "var(--accent-indigo, #6366f1)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Specs */}
        <div className="detail-specs">
          <h2 className="detail-section-title">Specifications</h2>
          <div className="spec-grid">
            {SPEC_SECTIONS.map((section) => {
              const entries = section.fields
                .map((f) => ({ key: f, label: FIELD_LABELS[f] || f, value: laptop[f] }))
                .filter((e) => e.value != null && e.value !== "");

              if (entries.length === 0) return null;

              return (
                <div key={section.key} className="spec-card card">
                  <div className="spec-card-header">
                    <span className="spec-icon">{section.icon}</span>
                    <span className="spec-card-title">{section.label}</span>
                  </div>
                  <div className="spec-entries">
                    {entries.map((e) => (
                      <div key={e.key} className="spec-entry">
                        <span className="spec-entry-label">{e.label}</span>
                        <span className="spec-entry-value">
                          {e.key === "screen-size"
                            ? `${Number(e.value).toFixed(1)}"`
                            : e.key === "battery-capacity"
                            ? `${e.value} Wh`
                            : e.key === "first_seen"
                            ? (() => {
                                try {
                                  const d = new Date(String(e.value).replace(" ", "T"));
                                  return d.toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });
                                } catch {
                                  return String(e.value);
                                }
                              })()
                            : String(e.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
