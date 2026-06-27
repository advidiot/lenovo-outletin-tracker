import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { LaptopData } from "../data";
import { formatDistance } from "date-fns";
import "./DashboardStats.css";

interface DashboardStatsProps {
  data: LaptopData[];
  lastModified: Date | null;
  onBestDealClick: (code: string) => void;
  showUnavailable: boolean;
}

const BRAND_COLORS = [
  "var(--accent-teal)", "#6366f1", "var(--accent-amber)"
];

// Compute price distribution histogram buckets
function buildPriceBuckets(data: LaptopData[]) {
  const prices = data
    .map((d) => Number(d["price"]))
    .filter((p) => !isNaN(p) && p > 0);

  if (prices.length === 0) return [];

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const bucketCount = 8;
  const rangeDiff = max - min;
  const step = rangeDiff / bucketCount || 10000;

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    range: `${Math.round((min + i * step) / 1000)}k`,
    count: 0,
  }));

  prices.forEach((p) => {
    const idx = rangeDiff > 0
      ? Math.min(Math.floor(((p - min) / rangeDiff) * bucketCount), bucketCount - 1)
      : 0;
    buckets[idx].count++;
  });

  return buckets;
}

// Build brand split data for pie chart
function buildBrandSplit(data: LaptopData[]) {
  const counts: Record<string, number> = {
    "ThinkPad": 0,
    "IdeaPad": 0,
    "Yoga": 0,
    "Legion": 0,
    "ThinkBook": 0,
    "Other": 0
  };
  data.forEach((d) => {
    const model = (d["model"] as string) || "Other";
    let brand = "Other";
    if (/thinkpad/i.test(model)) brand = "ThinkPad";
    else if (/ideapad/i.test(model)) brand = "IdeaPad";
    else if (/yoga/i.test(model)) brand = "Yoga";
    else if (/legion/i.test(model)) brand = "Legion";
    else if (/thinkbook/i.test(model)) brand = "ThinkBook";
    counts[brand] = (counts[brand] || 0) + 1;
  });

  // Sort distinct brands
  const distinctSorted = Object.entries(counts)
    .filter(([name]) => name !== "Other")
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Take top 3 distinct brands
  const top3 = distinctSorted.slice(0, 3);

  // Sum remaining distinct brands + "Other"
  const remainingSum = distinctSorted.slice(3).reduce((sum, item) => sum + item.value, 0);
  const otherValue = (counts["Other"] || 0) + remainingSum;

  return [
    ...top3,
    { name: "Other", value: otherValue }
  ];
}

// Find the best deal
function findBestDeal(data: LaptopData[]) {
  const available = data.filter(
    (d) => d["available"] && typeof d["percentage-savings"] === "number"
  );
  if (available.length === 0) return null;
  return available.reduce((best, curr) =>
    (curr["percentage-savings"] as number) > (best["percentage-savings"] as number)
      ? curr
      : best
  );
}

// Build savings split data for pie chart
function buildSavingsSplit(data: LaptopData[]) {
  let epic = 0; // >= 40%
  let good = 0; // 20-40%
  let light = 0; // < 20%

  data.forEach((d) => {
    const pct = Number(d["percentage-savings"] || 0);
    if (pct >= 40) epic++;
    else if (pct >= 20) good++;
    else light++;
  });

  return [
    { name: "Epic (≥40%)", value: epic, color: "var(--accent-green)" },
    { name: "Good (20-40%)", value: good, color: "var(--accent-amber)" },
    { name: "Light (<20%)", value: light, color: "#6366f1" },
  ];
}

const SkeletonCard = () => (
  <div className="stat-card stat-card-skeleton">
    <div className="skeleton-line skeleton-title" />
    <div className="skeleton-line skeleton-value" />
    <div className="skeleton-chart" />
  </div>
);

export const DashboardStats = ({
  data,
  lastModified,
  onBestDealClick,
  showUnavailable,
}: DashboardStatsProps) => {
  const isLoading = data.length === 0;

  const priceBuckets = useMemo(() => buildPriceBuckets(data), [data]);
  const brandSplit = useMemo(() => buildBrandSplit(data), [data]);
  const bestDeal = useMemo(() => findBestDeal(data), [data]);
  const savingsSplit = useMemo(() => buildSavingsSplit(data), [data]);

  const avgSavings = useMemo(() => {
    const savingsList = data
      .map((d) => Number(d["percentage-savings"] || 0))
      .filter((s) => s > 0);
    if (savingsList.length === 0) return 0;
    const sum = savingsList.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / savingsList.length);
  }, [data]);

  const lastUpdatedText = lastModified
    ? formatDistance(lastModified, new Date(), { addSuffix: true })
    : null;

  if (isLoading) {
    return (
      <div className="stats-strip-wrap">
        <div className="stats-strip">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="stats-strip-wrap">
    <div className="stats-strip">

      {/* Card 1: Total/Available Laptops + Price Distribution */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-label">
            {showUnavailable ? "Total Laptops" : "Available Laptops"}
          </span>
          {lastUpdatedText && (
            <span className="stat-updated">Updated {lastUpdatedText}</span>
          )}
        </div>
        <div className="stat-value">{data.length.toLocaleString()}</div>
        <div className="stat-chart-label">Price distribution</div>
        <div className="stat-chart">
          <ResponsiveContainer width="100%" height={52}>
            <BarChart data={priceBuckets} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="range" hide />
              <Bar dataKey="count" fill="var(--accent-teal)" radius={[2, 2, 0, 0]} barSize={16} />
              <Tooltip
                contentStyle={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  color: "var(--text-primary)",
                }}
                formatter={(v: number) => [v, "laptops"]}
                labelFormatter={(label) => label}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Card 2: Average Savings Card */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-label">Average Savings</span>
        </div>
        <div className="stat-value">
          {avgSavings}%
          <span className="stat-value-sub"> average off</span>
        </div>
        <div className="stat-chart-label">Savings tiers split</div>
        <div className="stat-chart stat-chart-donut">
          <ResponsiveContainer width="100%" height={52}>
            <PieChart>
              <Pie
                data={savingsSplit}
                cx="50%"
                cy="50%"
                innerRadius={14}
                outerRadius={24}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {savingsSplit.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  color: "var(--text-primary)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-legend">
            {savingsSplit.map((s) => (
              <div key={s.name} className="donut-legend-item">
                <span
                  className="donut-dot"
                  style={{ background: s.color }}
                />
                <span>{s.name}: {s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card 3: Brand Split */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-label">Brand Split</span>
        </div>
        <div className="stat-value">
          {brandSplit[0]?.name || "—"}
          <span className="stat-value-sub"> most common</span>
        </div>
        <div className="stat-chart-label">By series</div>
        <div className="stat-chart stat-chart-donut">
          <ResponsiveContainer width="100%" height={52}>
            <PieChart>
              <Pie
                data={brandSplit}
                cx="50%"
                cy="50%"
                innerRadius={14}
                outerRadius={24}
                dataKey="value"
              >
                {brandSplit.map((entry, i) => (
                  <Cell key={i} fill={entry.name === "Other" ? "var(--border-strong)" : BRAND_COLORS[i % BRAND_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  color: "var(--text-primary)",
                }}
                formatter={(v: number, name: string) => [v, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="brand-grid-legend">
            {brandSplit.map((b, i) => (
              <div key={b.name} className="donut-legend-item">
                <span
                  className="donut-dot"
                  style={{
                    background: b.name === "Other" ? "var(--border-strong)" : BRAND_COLORS[i % BRAND_COLORS.length]
                  }}
                />
                <span className="brand-legend-text">{b.name}: {b.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card 4: Best Deal */}
      <div
        className={`stat-card stat-card-deal ${bestDeal ? "clickable" : ""}`}
        onClick={() =>
          bestDeal &&
          onBestDealClick(String(bestDeal["product-number"]))
        }
        role={bestDeal ? "button" : undefined}
        tabIndex={bestDeal ? 0 : undefined}
        onKeyDown={(e) =>
          e.key === "Enter" && bestDeal && onBestDealClick(String(bestDeal["product-number"]))
        }
      >
        <div className="stat-card-header">
          <span className="stat-label">Best Deal Today</span>
          {bestDeal && (
            <span className="badge badge-green">
              {Math.round(bestDeal["percentage-savings"] as number)}% off
            </span>
          )}
        </div>
        {bestDeal ? (
          <>
            <div className="stat-value stat-value-deal">
              {bestDeal["model"] as string}
            </div>
            <div className="deal-price">
              <span className="deal-current">
                ₹{Number(bestDeal["price"]).toLocaleString("en-IN")}
              </span>
              <span className="deal-original">
                ₹{Number(bestDeal["orig-price"]).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="deal-cta">View deal →</div>
          </>
        ) : (
          <div className="stat-value">—</div>
        )}
      </div>

      </div>
    </div>
  );
};
