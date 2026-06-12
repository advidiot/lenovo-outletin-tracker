import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LaptopData } from "../data";
import "./ComparePage.css";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface ComparePageProps {
  compareList: LaptopData[];
  onRemove: (laptop: LaptopData) => void;
  onClear: () => void;
}

const COMPARE_SPECS = [
  { label: "Image", field: "__image__" },
  { label: "Price", field: "price", format: (v: any) => v ? `₹${Number(v).toLocaleString("en-IN")}` : "N/A", best: "min" },
  { label: "Original Price", field: "orig-price", format: (v: any) => v ? `₹${Number(v).toLocaleString("en-IN")}` : "N/A" },
  { label: "Savings", field: "percentage-savings", format: (v: any) => v ? `${Math.round(Number(v))}%` : "N/A", best: "max" },
  { label: "Condition", field: "product-condition" },
  { label: "Screen Size", field: "screen-size", format: (v: any) => v ? `${Number(v).toFixed(1)}"` : "N/A" },
  { label: "Resolution", field: "resolution" },
  { label: "Aspect Ratio", field: "screen-aspect-ratio" },
  { label: "Display", field: "display" },
  { label: "Processor", field: "processor" },
  { label: "GPU", field: "graphic-card" },
  { label: "RAM", field: "memory-size", best: "max" },
  { label: "Storage", field: "storage-size" },
  { label: "Storage Type", field: "storage-type" },
  { label: "Battery", field: "battery-capacity", format: (v: any) => v ? `${v} Wh` : "N/A", best: "max" },
  { label: "Weight", field: "weight" },
  { label: "OS", field: "operating-system" },
  { label: "Camera", field: "camera" },
  { label: "Wi-Fi", field: "wlan" },
  { label: "Charger", field: "ac-adapter" },
];

function parseNumeric(v: any): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}

function getBestIdx(values: any[], best: string): number[] {
  const nums = values.map(parseNumeric);
  if (nums.every((n) => n === null)) return [];
  const valid = nums.filter((n): n is number => n !== null);
  if (valid.length < 2) return [];
  const target = best === "min" ? Math.min(...valid) : Math.max(...valid);
  return nums.reduce<number[]>((acc, n, i) => {
    if (n === target) acc.push(i);
    return acc;
  }, []);
}

export const ComparePage = ({ compareList, onRemove, onClear }: ComparePageProps) => {
  const navigate = useNavigate();
  const [priceHistories, setPriceHistories] = useState<Record<string, { timestamp: string, price: number }[]>>({});
  const [loading, setLoading] = useState(false);

  const colors = ["#06b6d4", "#a855f7", "#f59e0b", "#f43f5e"];

  useEffect(() => {
    let active = true;
    setLoading(true);
    const promises = compareList.map(async (laptop) => {
      const code = String(laptop["product-number"]);
      try {
        const res = await fetch(`/api/price_history?code=${code}`);
        if (res.ok) {
          const data = await res.json();
          return { code, history: data };
        }
      } catch (e) {
        console.error("Error fetching price history for", code, e);
      }
      return { code, history: [] };
    });

    Promise.all(promises).then((results) => {
      if (!active) return;
      const map: Record<string, any[]> = {};
      results.forEach((r) => {
        map[r.code] = r.history;
      });
      setPriceHistories(map);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [compareList]);

  const chartData = useMemo(() => {
    // 1. Get all unique timestamps from all loaded histories
    const timestamps = Array.from(
      new Set(
        Object.values(priceHistories).flatMap((h) => h.map((p) => p.timestamp))
      )
    ).sort();

    if (timestamps.length === 0) return [];

    // 2. Align prices by carrying forward last seen price
    const currentPrices: Record<string, number> = {};
    compareList.forEach((laptop) => {
      const code = String(laptop["product-number"]);
      const history = priceHistories[code] || [];
      if (history.length > 0) {
        currentPrices[code] = history[0].price;
      } else {
        currentPrices[code] = Number(laptop["price"]);
      }
    });

    return timestamps.map((ts) => {
      const dataPoint: any = {
        timestamp: ts,
        displayTime: new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      };
      
      compareList.forEach((laptop) => {
        const code = String(laptop["product-number"]);
        const history = priceHistories[code] || [];
        const match = history.find((p) => p.timestamp === ts);
        if (match) {
          currentPrices[code] = match.price;
        }
        dataPoint[code] = currentPrices[code];
      });
      
      return dataPoint;
    });
  }, [priceHistories, compareList]);

  if (compareList.length === 0) {
    return (
      <div className="compare-empty">
        <div className="compare-empty-icon">📊</div>
        <h2>Nothing to compare</h2>
        <p>Select laptops from the grid to compare them side by side.</p>
        <Link to="/" className="btn btn-primary">Go to Grid</Link>
      </div>
    );
  }

  return (
    <div className="compare-page">
      {/* Header */}
      <div className="compare-header">
        <div className="compare-breadcrumb">
          <button onClick={() => navigate(-1)} className="back-btn">← Back</button>
          <span className="breadcrumb-sep">/</span>
          <Link to="/" className="breadcrumb-link">Home</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">Compare ({compareList.length} laptops)</span>
        </div>

        <div className="compare-header-actions">
          <Link to="/" className="btn btn-ghost btn-sm">+ Add another</Link>
          <button className="btn btn-ghost btn-sm" onClick={onClear}>Clear all</button>
        </div>
      </div>

      {/* Price History Chart */}
      <div className="compare-chart-container">
        <div className="compare-chart-header">
          <h3 className="compare-chart-title">Price History Comparison</h3>
          <span className="compare-chart-subtitle">Historical price trends of the compared laptops</span>
        </div>
        
        {loading ? (
          <div className="compare-chart-loading">
            <span>Loading price history...</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="compare-chart-loading">
            <span>No historical price data available</span>
          </div>
        ) : (
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  {compareList.map((laptop, index) => {
                    const code = String(laptop["product-number"]);
                    const color = colors[index % colors.length];
                    return (
                      <linearGradient key={code} id={`grad-${code}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={color} stopOpacity={0.02}/>
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis 
                  dataKey="displayTime" 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                />
                <YAxis 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `₹${(val / 1000)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "var(--card-bg)", 
                    borderColor: "var(--border)", 
                    borderRadius: "8px", 
                    fontSize: "0.8rem", 
                    color: "var(--text-primary)" 
                  }}
                  formatter={(value: any, name: any) => {
                    const laptop = compareList.find((l) => String(l["product-number"]) === name);
                    const label = laptop ? String(laptop["model"]) : name;
                    return [`₹${Number(value).toLocaleString("en-IN")}`, label];
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "0.8rem" }}
                  formatter={(value: any) => {
                    const laptop = compareList.find((l) => String(l["product-number"]) === value);
                    return laptop ? String(laptop["model"]) : value;
                  }}
                />
                {compareList.map((laptop, index) => {
                  const code = String(laptop["product-number"]);
                  const color = colors[index % colors.length];
                  return (
                    <Area
                      key={code}
                      type="monotone"
                      dataKey={code}
                      stroke={color}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill={`url(#grad-${code})`}
                      activeDot={{ r: 6 }}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th className="compare-spec-col">Specification</th>
              {compareList.map((laptop) => (
                <th key={String(laptop["product-number"])} className="compare-laptop-col">
                  {laptop["thumbnail_url"] ? (
                    <img
                      src={String(laptop["thumbnail_url"])}
                      alt={String(laptop["model"])}
                      className="compare-col-thumb"
                    />
                  ) : (
                    <div className="compare-col-thumb compare-col-thumb-placeholder">💻</div>
                  )}
                  <div className="compare-col-name">{String(laptop["model"])}</div>
                  <div className="compare-col-code">{String(laptop["product-number"])}</div>
                  <div className="compare-col-price">
                    ₹{Number(laptop["price"]).toLocaleString("en-IN")}
                  </div>
                  <button
                    className="compare-col-remove"
                    onClick={() => onRemove(laptop)}
                    title="Remove from comparison"
                  >
                    × Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {COMPARE_SPECS.map((spec) => {
              if (spec.field === "__image__") {
                return (
                  <tr key="image" className="compare-image-row">
                    <td className="compare-spec-label">Device</td>
                    {compareList.map((laptop) => (
                      <td key={String(laptop["product-number"])} className="compare-image-cell">
                        {laptop["thumbnail_url"] ? (
                          <img
                            src={String(laptop["thumbnail_url"])}
                            alt={String(laptop["model"])}
                            className="compare-device-img"
                          />
                        ) : (
                          <div className="compare-device-placeholder">💻</div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              }

              const rawValues = compareList.map((l) => l[spec.field]);
              const displayValues = rawValues.map((v) =>
                spec.format ? spec.format(v) : (v ?? "N/A")
              );

              // Are all values identical?
              const allSame = displayValues.every(
                (v) => String(v).trim().toLowerCase() === String(displayValues[0]).trim().toLowerCase()
              );

              // Which cells are "best"?
              const bestIdxs = spec.best ? getBestIdx(rawValues, spec.best) : [];

              return (
                <tr
                  key={spec.field}
                  className={`compare-row ${!allSame ? "compare-row-diff" : ""}`}
                >
                  <td className="compare-spec-label">{spec.label}</td>
                  {displayValues.map((val, i) => (
                    <td
                      key={i}
                      className={`compare-cell ${
                        bestIdxs.includes(i) ? "compare-cell-best" : ""
                      }`}
                    >
                      {String(val)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="compare-footer">
        <Link to="/" className="btn btn-primary">Back to Grid</Link>
      </div>
    </div>
  );
};
