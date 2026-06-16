import { useNavigate } from "react-router-dom";
import { LaptopData } from "../data";
import "./MobileCardList.css";

interface MobileCardListProps {
  data: LaptopData[];
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
  checkStock: (productCode: string) => Promise<void>;
  stockResults: Record<string, import("../useStockCheck").StockResult>;
}

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

export const MobileCardList = ({
  data,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
  checkStock,
  stockResults,
}: MobileCardListProps) => {
  const navigate = useNavigate();

  if (data.length === 0) {
    return (
      <div className="mobile-empty">
        <div className="mobile-empty-icon">🔍</div>
        <p>No laptops match your filters</p>
      </div>
    );
  }

  return (
    <div className="mobile-card-list">
      {data.map((laptop) => {
        const code = String(laptop["product-number"]);
        const isStarred = watchlist.includes(code);
        const isCompared = compareList.some((c) => c["product-number"] === laptop["product-number"]);
        const isCompareDisabled = compareList.length >= 4 && !isCompared;
        const available = laptop["available"] as boolean;

        return (
          <div
            key={code}
            className={`mobile-card ${!available ? "mobile-card-unavailable" : ""}`}
            onClick={() => navigate(`/laptop/${code}`)}
          >
            {/* Image */}
            {laptop["thumbnail_url"] ? (
              <img
                src={String(laptop["thumbnail_url"])}
                alt={String(laptop["model"])}
                className="mobile-card-img"
                loading="lazy"
              />
            ) : (
              <div className="mobile-card-img mobile-card-img-placeholder">💻</div>
            )}

            {/* Content */}
            <div className="mobile-card-content">
              <div className="mobile-card-top">
                <h3 className="mobile-card-name">{String(laptop["model"])}</h3>
                <div className="mobile-card-badges">
                  {!available && <span className="badge badge-red">Sold Out</span>}
                  {laptop["product-condition"] && (
                    <span className="badge badge-amber">
                      {String(laptop["product-condition"]).replace("CERTIFIED ", "Cert. ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="mobile-card-price">
                <span className="mobile-price-current">
                  ₹{Number(laptop["price"]).toLocaleString("en-IN")}
                </span>
                {Number(laptop["price-delta"] || 0) < -0.01 && (
                  <span 
                    className="badge badge-green" 
                    style={{ marginLeft: "4px", fontSize: "0.75rem", padding: "2px 6px" }} 
                    title={`Price dropped by ₹${Math.abs(Number(laptop["price-delta"])).toLocaleString("en-IN")}`}
                  >
                    ↓ ₹{Math.abs(Number(laptop["price-delta"])).toLocaleString("en-IN")}
                  </span>
                )}
                {laptop["orig-price"] && (
                  <span className="mobile-price-original">
                    ₹{Number(laptop["orig-price"]).toLocaleString("en-IN")}
                  </span>
                )}
                {laptop["percentage-savings"] && (
                  <span className="mobile-price-savings badge badge-green">
                    {Math.round(Number(laptop["percentage-savings"]))}% off
                  </span>
                )}
              </div>

              <div className="mobile-card-specs">
                {laptop["memory-size"] && (
                  <span className="spec-chip">{String(laptop["memory-size"])}</span>
                )}
                {laptop["storage-size"] && (
                  <span className="spec-chip">{String(laptop["storage-size"])}</span>
                )}
                {laptop["screen-size"] && (
                  <span className="spec-chip">{Number(laptop["screen-size"]).toFixed(1)}"</span>
                )}
                {laptop["processor-brand"] && (
                  <span className="spec-chip">{String(laptop["processor-brand"])}</span>
                )}
                {laptop["first_seen"] && (
                  <span className="spec-chip" title="First Tracked">
                    📅 {(() => {
                      try {
                        const d = new Date(String(laptop["first_seen"]).replace(" ", "T"));
                        return d.toLocaleDateString("en-IN", { day: 'numeric', month: 'short' });
                      } catch {
                        return String(laptop["first_seen"]);
                      }
                    })()}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div
              className="mobile-card-actions"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Stock check element */}
              {available ? (
                <div className="mobile-card-stock-check">
                  {(() => {
                    const result = stockResults[code];
                    if (!result || result.state === 'idle') {
                      return (
                        <button 
                          className="mobile-stock-btn" 
                          onClick={() => checkStock(code)}
                        >
                          Check Stock
                        </button>
                      );
                    }
                    if (result.state === 'loading') {
                      return <span className="mobile-stock-loading">Checking…</span>;
                    }
                    if (result.state === 'success') {
                      return (
                        <span className="mobile-stock-success">
                          {result.stock === 99 ? '99+' : result.stock} units
                        </span>
                      );
                    }
                    if (result.state === 'no_session') {
                      return (
                        <a 
                          href="https://www.lenovo.com/in/outletin/en/" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="mobile-stock-error-link"
                          title="Visit Lenovo first to activate session cookies."
                        >
                          ⚠️ Visit site
                        </a>
                      );
                    }
                    return <span className="mobile-stock-error">⚠️ Error</span>;
                  })()}
                </div>
              ) : (
                <span className="mobile-stock-oos">Sold Out</span>
              )}

              <div className="mobile-card-utility-actions">
                <button
                  className={`mobile-action-btn ${isStarred ? "action-starred" : ""}`}
                  onClick={() => toggleWatch(code)}
                  title={isStarred ? "Remove from watchlist" : "Add to watchlist"}
                  aria-label="Toggle watchlist"
                >
                  <StarIcon filled={isStarred} />
                </button>
                <input
                  type="checkbox"
                  checked={isCompared}
                  disabled={isCompareDisabled}
                  onChange={() => toggleCompare(laptop)}
                  className="compare-checkbox"
                  title="Compare"
                  aria-label="Add to comparison"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
