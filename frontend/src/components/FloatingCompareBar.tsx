import { useNavigate } from "react-router-dom";
import { LaptopData } from "../data";
import "./FloatingCompareBar.css";

interface FloatingCompareBarProps {
  compareList: LaptopData[];
  onClear: () => void;
}

export const FloatingCompareBar = ({ compareList, onClear }: FloatingCompareBarProps) => {
  const navigate = useNavigate();

  if (compareList.length === 0) return null;

  return (
    <div className="floating-compare-bar">
      <div className="compare-bar-inner">
        <div className="compare-bar-info">
          <div className="compare-bar-thumbnails">
            {compareList.map((laptop) =>
              laptop["thumbnail_url"] ? (
                <img
                  key={String(laptop["product-number"])}
                  src={String(laptop["thumbnail_url"])}
                  alt={String(laptop["model"])}
                  className="compare-thumb"
                />
              ) : (
                <div
                  key={String(laptop["product-number"])}
                  className="compare-thumb compare-thumb-placeholder"
                >
                  💻
                </div>
              )
            )}
            {compareList.length < 4 &&
              Array.from({ length: 4 - compareList.length }).map((_, i) => (
                <div key={`empty-${i}`} className="compare-thumb compare-thumb-empty" />
              ))}
          </div>
          <span className="compare-bar-label">
            <strong>{compareList.length}</strong> / 4 selected
          </span>
        </div>

        <div className="compare-bar-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClear}
          >
            Clear
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={compareList.length < 2}
            onClick={() => navigate("/compare")}
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  );
};
