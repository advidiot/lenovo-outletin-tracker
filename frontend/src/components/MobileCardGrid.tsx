import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LaptopData } from "../data";
import "./MobileCardGrid.css";

interface MobileCardGridProps {
  data: LaptopData[];
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
}

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

interface MobileCardItemProps {
  laptop: LaptopData;
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
}

const MobileCardItem = ({
  laptop,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
}: MobileCardItemProps) => {
  const navigate = useNavigate();
  const code = String(laptop["product-number"]);
  const isStarred = watchlist.includes(code);
  const isCompared = compareList.some((c) => c["product-number"] === laptop["product-number"]);
  const isCompareDisabled = compareList.length >= 4 && !isCompared;

  const initialSeconds = Number(laptop["hold_expires_in_seconds"] || 0);
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  useEffect(() => { setSecondsLeft(initialSeconds); }, [initialSeconds]);
  const isHold = !!laptop["in_cart_hold"] && secondsLeft > 0;
  useEffect(() => {
    if (!isHold) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isHold]);

  const available = laptop["available"] as boolean;
  const price = Number(laptop["price"]);
  const origPrice = Number(laptop["orig-price"] || 0);
  const savings = Number(laptop["percentage-savings"] || 0);
  const priceDelta = Number(laptop["price-delta"] || 0);

  const ram = String(laptop["memory-size"] || "");
  const storage = String(laptop["storage-size"] || "");
  const screen = laptop["screen-size"] ? `${Number(laptop["screen-size"]).toFixed(1)}"` : "";
  const processor = String(laptop["processor"] || "");
  const gpu = String(laptop["graphic-card"] || "");

  return (
    <div
      className={`mcg-card ${isHold ? "mcg-card-hold" : !available ? "mcg-card-unavailable" : ""}`}
      onClick={() => navigate(`/laptop/${code}`)}
    >
      {/* Image column */}
      <div className="mcg-image-col">
        {laptop["thumbnail_url"] ? (
          <img
            src={String(laptop["thumbnail_url"])}
            alt={String(laptop["model"])}
            className="mcg-image"
            loading="lazy"
          />
        ) : (
          <div className="mcg-image mcg-image-placeholder">💻</div>
        )}
        {/* Status badge below image */}
        <div className="mcg-status">
          {isHold ? (
            <span className="badge badge-amber">🛒 {formatTime(secondsLeft)}</span>
          ) : !available ? (
            <span className="badge badge-red">Sold Out</span>
          ) : (
            <span className="badge badge-green">In Stock</span>
          )}
        </div>
      </div>

      {/* Content column */}
      <div className="mcg-content">
        {/* Top row: title + star */}
        <div className="mcg-title-row" onClick={(e) => e.stopPropagation()}>
          <h3 className="mcg-title" onClick={() => navigate(`/laptop/${code}`)}>
            {String(laptop["model"])}
          </h3>
          <button
            className={`mcg-star ${isStarred ? "mcg-star-active" : ""}`}
            onClick={() => toggleWatch(code)}
            title={isStarred ? "Remove from watchlist" : "Add to watchlist"}
            aria-label="Toggle watchlist"
          >
            <StarIcon filled={isStarred} />
          </button>
        </div>

        {/* Condition badge */}
        {laptop["product-condition"] && (
          <span className="badge badge-amber mcg-condition">
            {String(laptop["product-condition"]).replace("CERTIFIED ", "Cert. ")}
          </span>
        )}

        {/* Spec chips */}
        <div className="mcg-specs">
          {ram && <span className="mcg-chip">{ram}</span>}
          {storage && <span className="mcg-chip">{storage}</span>}
          {screen && <span className="mcg-chip">{screen}</span>}
        </div>

        {/* CPU / GPU — truncated */}
        {processor && <p className="mcg-proc">{processor}</p>}
        {gpu && <p className="mcg-gpu">{gpu}</p>}

        {/* Price row */}
        <div className="mcg-price-row">
          <span className="mcg-price">₹{price.toLocaleString("en-IN")}</span>
          {priceDelta < -0.01 && (
            <span className="mcg-drop" title={`Dropped ₹${Math.abs(priceDelta).toLocaleString("en-IN")}`}>
              ↓ ₹{Math.abs(priceDelta).toLocaleString("en-IN")}
            </span>
          )}
          {origPrice > 0 && (
            <span className="mcg-orig">₹{origPrice.toLocaleString("en-IN")}</span>
          )}
          {savings > 0 && (
            <span className="badge badge-green mcg-savings">{Math.round(savings)}% off</span>
          )}
        </div>

        {/* Actions row */}
        <div className="mcg-actions" onClick={(e) => e.stopPropagation()}>
          <label className="mcg-compare-label">
            <input
              type="checkbox"
              checked={isCompared}
              disabled={isCompareDisabled}
              onChange={() => toggleCompare(laptop)}
              className="mcg-compare-check"
              aria-label="Add to comparison"
            />
            Compare
          </label>

          {isHold ? (
            <button className="btn btn-sm btn-hold" disabled>Hold</button>
          ) : available ? (
            <a
              href={`https://www.lenovo.com/in/outletin/en/p/${code}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
            >
              Buy ↗
            </a>
          ) : (
            <button className="btn btn-sm" disabled>Sold Out</button>
          )}
        </div>
      </div>
    </div>
  );
};

export const MobileCardGrid = ({
  data,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
}: MobileCardGridProps) => {
  if (data.length === 0) {
    return (
      <div className="mcg-empty">
        <div className="mcg-empty-icon">🔍</div>
        <p>No laptops match your filters</p>
      </div>
    );
  }

  return (
    <div className="mcg-list">
      {data.map((laptop) => (
        <MobileCardItem
          key={String(laptop["product-number"])}
          laptop={laptop}
          watchlist={watchlist}
          toggleWatch={toggleWatch}
          compareList={compareList}
          toggleCompare={toggleCompare}
        />
      ))}
    </div>
  );
};
