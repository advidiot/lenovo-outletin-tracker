import { useNavigate } from "react-router-dom";
import { LaptopData } from "../data";
import "./LenovoCardGrid.css";

interface LenovoCardGridProps {
  data: LaptopData[];
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
  checkStock: (productCode: string) => Promise<void>;
  stockResults: Record<string, import("../useStockCheck").StockResult>;
}

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export const LenovoCardGrid = ({
  data,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
  checkStock,
  stockResults,
}: LenovoCardGridProps) => {
  const navigate = useNavigate();

  if (data.length === 0) {
    return (
      <div className="lenovo-grid-empty">
        <div className="lenovo-grid-empty-icon">🔍</div>
        <h3>No laptops match your filters</h3>
        <p>Try resetting some filters or searching for something else.</p>
      </div>
    );
  }

  return (
    <div className="lenovo-card-grid">
      {data.map((laptop) => {
        const code = String(laptop["product-number"]);
        const isStarred = watchlist.includes(code);
        const isCompared = compareList.some((c) => c["product-number"] === laptop["product-number"]);
        const isCompareDisabled = compareList.length >= 4 && !isCompared;
        const available = laptop["available"] as boolean;

        // Extract and clean specification highlights
        const processor = String(laptop["processor"] || "");
        const memory = String(laptop["memory-size"] || "") + (laptop["ddr-gen"] ? ` ${laptop["ddr-gen"]}` : "");
        const storage = String(laptop["storage-size"] || "") + (laptop["storage-type"] ? ` ${laptop["storage-type"]}` : "");
        const display = String(laptop["display"] || "");
        const graphics = String(laptop["graphic-card"] || "");
        const os = String(laptop["operating-system"] || "");

        return (
          <div
            key={code}
            className={`lenovo-card ${!available ? "lenovo-card-sold-out" : ""}`}
            onClick={() => navigate(`/laptop/${code}`)}
          >
            {/* Watchlist & Badges */}
            <div className="lenovo-card-header" onClick={(e) => e.stopPropagation()}>
              <div className="lenovo-card-badges">
                {!available ? (
                  <span className="badge badge-red">Sold Out</span>
                ) : (
                  <span className="badge badge-green">In Stock</span>
                )}
                {laptop["product-condition"] && (
                  <span className="badge badge-amber">
                    {String(laptop["product-condition"])}
                  </span>
                )}
              </div>
              <button
                className={`lenovo-star-btn ${isStarred ? "active" : ""}`}
                onClick={() => toggleWatch(code)}
                title={isStarred ? "Remove from watchlist" : "Add to watchlist"}
              >
                <StarIcon filled={isStarred} />
              </button>
            </div>

            {/* Product Image */}
            <div className="lenovo-card-image-container">
              {laptop["thumbnail_url"] ? (
                <img
                  src={String(laptop["thumbnail_url"])}
                  alt={String(laptop["model"])}
                  className="lenovo-card-image"
                  loading="lazy"
                />
              ) : (
                <div className="lenovo-card-image-placeholder">💻</div>
              )}
            </div>

            {/* Product Info */}
            <div className="lenovo-card-body">
              <h3 className="lenovo-card-title" title={String(laptop["model"])}>
                {String(laptop["model"])}
              </h3>
              <p className="lenovo-card-pn">PN: {code}</p>

              {/* Specs Summary */}
              <div className="lenovo-card-specs">
                {processor && (
                  <div className="spec-row" title={processor}>
                    <span className="spec-label">CPU:</span>
                    <span className="spec-value">{processor}</span>
                  </div>
                )}
                {memory && (
                  <div className="spec-row" title={memory}>
                    <span className="spec-label">RAM:</span>
                    <span className="spec-value">{memory}</span>
                  </div>
                )}
                {storage && (
                  <div className="spec-row" title={storage}>
                    <span className="spec-label">Storage:</span>
                    <span className="spec-value">{storage}</span>
                  </div>
                )}
                {display && (
                  <div className="spec-row" title={display}>
                    <span className="spec-label">Display:</span>
                    <span className="spec-value">{display}</span>
                  </div>
                )}
                {graphics && (
                  <div className="spec-row" title={graphics}>
                    <span className="spec-label">GPU:</span>
                    <span className="spec-value">{graphics}</span>
                  </div>
                )}
                {os && (
                  <div className="spec-row" title={os}>
                    <span className="spec-label">OS:</span>
                    <span className="spec-value">{os}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Price & Actions */}
            <div className="lenovo-card-footer" onClick={(e) => e.stopPropagation()}>
              <div className="lenovo-card-pricing-row">
                <div className="lenovo-card-pricing">
                  <div className="price-primary">
                    <span className="current-price">
                      ₹{Number(laptop["price"]).toLocaleString("en-IN")}
                    </span>
                    {Number(laptop["price-delta"] || 0) < -0.01 && (
                      <span
                        className="price-drop-indicator"
                        title={`Price dropped by ₹${Math.abs(Number(laptop["price-delta"])).toLocaleString("en-IN")}`}
                      >
                        ↓ ₹{Math.abs(Number(laptop["price-delta"])).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                  
                  {(Number(laptop["orig-price"]) > 0 || Number(laptop["percentage-savings"]) > 0) && (
                    <div className="price-secondary">
                      {Number(laptop["orig-price"]) > 0 && (
                        <span className="original-price">
                          ₹{Number(laptop["orig-price"]).toLocaleString("en-IN")}
                        </span>
                      )}
                      {Number(laptop["percentage-savings"]) > 0 && (
                        <span className="badge badge-green discount-badge">
                          {Math.round(Number(laptop["percentage-savings"]))}% off
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Stock Check section */}
                {available && (
                  <div className="lenovo-card-stock-check">
                    {(() => {
                      const result = stockResults[code];
                      if (!result || result.state === 'idle') {
                        return (
                          <button 
                            className="card-stock-btn" 
                            onClick={() => checkStock(code)}
                          >
                            Check Stock
                          </button>
                        );
                      }
                      if (result.state === 'loading') {
                        return <span className="card-stock-loading">Checking…</span>;
                      }
                      if (result.state === 'success') {
                        return (
                          <span className="card-stock-success">
                            {result.stock === 99 ? '99+' : result.stock} left
                          </span>
                        );
                      }
                      if (result.state === 'no_session') {
                        return (
                          <a 
                            href="https://www.lenovo.com/in/outletin/en/" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="card-stock-error-link"
                            title="Visit Lenovo to activate session cookies, then try again."
                          >
                            ⚠️ Visit site
                          </a>
                        );
                      }
                      return <span className="card-stock-error">⚠️ Error</span>;
                    })()}
                  </div>
                )}
              </div>

              <div className="lenovo-card-actions">
                <label className="lenovo-compare-label">
                  <input
                    type="checkbox"
                    checked={isCompared}
                    disabled={isCompareDisabled}
                    onChange={() => toggleCompare(laptop)}
                    className="compare-checkbox"
                  />
                  <span>Compare</span>
                </label>

                <div className="action-buttons">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/laptop/${code}`)}
                  >
                    Details
                  </button>
                  {available ? (
                    <a
                      href={`https://www.lenovo.com/in/outletin/en/p/${code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm buy-btn"
                    >
                      Buy ↗
                    </a>
                  ) : (
                    <button className="btn btn-sm buy-btn" disabled>
                      Sold Out
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
