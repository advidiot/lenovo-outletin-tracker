import { LaptopData } from "../data";
import { LenovoCard } from "./LenovoCardGrid";
import "./MobileCardGrid.css";

interface MobileCardGridProps {
  data: LaptopData[];
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
}

export const MobileCardGrid = ({
  data,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
}: MobileCardGridProps) => {
  if (data.length === 0) {
    return (
      <div className="mobile-card-grid-empty">
        <div className="mobile-card-grid-empty-icon">🔍</div>
        <p>No laptops match your filters</p>
      </div>
    );
  }

  return (
    <div className="mobile-card-grid">
      {data.map((laptop) => (
        <LenovoCard
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
