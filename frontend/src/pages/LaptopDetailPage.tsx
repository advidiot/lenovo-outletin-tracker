import { useState, useEffect } from "react";
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
}

export const LaptopDetailPage = ({
  allLaptops,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
}: LaptopDetailPageProps) => {
  const { productNumber } = useParams<{ productNumber: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
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

  if (!laptop) {
    return (
      <div className="detail-not-found">
        <div className="not-found-icon">🔍</div>
        <h2>Laptop not found</h2>
        <p>Product <code>{productNumber}</code> could not be found in the database.</p>
        <Link to="/" className="btn btn-primary">Back to Grid</Link>
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
        <Link to="/" className="breadcrumb-link">Home</Link>
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
