import { useMemo } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { LaptopData } from "../data";
import { formatDistance } from "date-fns";
import "./DashboardStats.css";

interface DashboardStatsProps {
  data: LaptopData[];
  lastModified: Date | null;
  onBestDealClick: (code: string) => void;
}

const BRAND_COLORS = [
  "var(--accent-teal)", "#6366f1", "var(--accent-amber)",
  "#ec4899", "#8b5cf6", "#14b8a6"
];

// Compute price distribution histogram buckets
function buildPriceBuckets(data: LaptopData[]) {
  const prices = data
    .filter((d) => d["available"] && typeof d["price"] === "number")
    .map((d) => d["price"] as number);

  if (prices.length === 0) return [];

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const bucketCount = 8;
  const step = (max - min) / bucketCount || 10000;

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    range: `₹${Math.round((min + i * step) / 1000)}k`,
    count: 0,
  }));

  prices.forEach((p) => {
    const idx = Math.min(
      Math.floor(((p - min) / (max - min)) * bucketCount),
      bucketCount - 1
    );
    buckets[idx].count++;
  });

  return buckets;
}

// Build brand split data for pie chart
function buildBrandSplit(data: LaptopData[]) {
  const counts: Record<string, number> = {};
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
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
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

// Availability split for donut
function buildAvailabilitySplit(data: LaptopData[]) {
  const available = data.filter((d) => d["available"]).length;
  const unavailable = data.length - available;
  return [
    { name: "Available", value: available },
    { name: "Sold Out", value: unavailable },
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
}: DashboardStatsProps) => {
  const isLoading = data.length === 0;

  const priceBuckets = useMemo(() => buildPriceBuckets(data), [data]);
  const brandSplit = useMemo(() => buildBrandSplit(data), [data]);
  const bestDeal = useMemo(() => findBestDeal(data), [data]);
  const availSplit = useMemo(() => buildAvailabilitySplit(data), [data]);
  const availableCount = data.filter((d) => d["available"]).length;

  const lastUpdatedText = lastModified
    ? formatDistance(lastModified, new Date(), { addSuffix: true })
    : null;

  if (isLoading) {
    return (
      <div className="stats-strip">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="stats-strip">

      {/* Card 1: Total Laptops + Price Distribution */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-label">Total Laptops</span>
          {lastUpdatedText && (
            <span className="stat-updated">Updated {lastUpdatedText}</span>
          )}
        </div>
        <div className="stat-value">{data.length.toLocaleString()}</div>
        <div className="stat-chart-label">Price distribution</div>
        <div className="stat-chart">
          <ResponsiveContainer width="100%" height={52}>
            <BarChart data={priceBuckets} barSize={6} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Bar dataKey="count" fill="var(--accent-teal)" radius={[2, 2, 0, 0]} />
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

      {/* Card 2: Availability Split */}
      <div className="stat-card">
        <div className="stat-card-header">
          <span className="stat-label">Availability</span>
        </div>
        <div className="stat-value">
          {availableCount}
          <span className="stat-value-sub"> in stock</span>
        </div>
        <div className="stat-chart-label">Available vs Sold Out</div>
        <div className="stat-chart stat-chart-donut">
          <ResponsiveContainer width="100%" height={52}>
            <PieChart>
              <Pie
                data={availSplit}
                cx="50%"
                cy="50%"
                innerRadius={14}
                outerRadius={24}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                <Cell fill="var(--accent-green)" />
                <Cell fill="var(--border-strong)" />
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
            {availSplit.map((s, i) => (
              <div key={s.name} className="donut-legend-item">
                <span
                  className="donut-dot"
                  style={{ background: i === 0 ? "var(--accent-green)" : "var(--border-strong)" }}
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
                {brandSplit.map((_, i) => (
                  <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />
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
          <div className="donut-legend">
            {brandSplit.slice(0, 3).map((b, i) => (
              <div key={b.name} className="donut-legend-item">
                <span className="donut-dot" style={{ background: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                <span>{b.name}: {b.value}</span>
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
  );
};
