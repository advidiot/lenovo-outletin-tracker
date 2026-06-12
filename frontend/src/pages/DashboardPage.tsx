import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { dataToCsv, download, LaptopData } from "../data";
import { DashboardStats } from "../components/DashboardStats";
import { FilterSidebar, FilterState, DEFAULT_FILTERS } from "../components/FilterSidebar";
import { FloatingCompareBar } from "../components/FloatingCompareBar";
import { MobileCardList } from "../components/MobileCardList";
import { useToast } from "../components/ToastProvider";
import Grid, { GridHandle } from "../Grid";
import "./DashboardPage.css";

interface DashboardPageProps {
  laptopData: LaptopData[];
  lastModified: Date | null;
  searchQuery: string;
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
}

function applyFilters(
  data: LaptopData[],
  filters: FilterState,
  searchQuery: string
): LaptopData[] {
  return data.filter((laptop) => {
    if (!filters.showUnavailable && !laptop["available"]) return false;

    const price = Number(laptop["price"]);
    if (price < filters.priceMin || price > filters.priceMax) return false;

    if (filters.screenSizes.length > 0) {
      const screen = Number(laptop["screen-size"]);
      const matched = filters.screenSizes.some(
        (s) => Math.abs(screen - parseFloat(s)) < 0.5
      );
      if (!matched) return false;
    }

    if (filters.ramSizes.length > 0) {
      const ram = String(laptop["memory-size"] || "");
      if (
        !filters.ramSizes.some((r) =>
          ram.toUpperCase().includes(r.toUpperCase())
        )
      )
        return false;
    }

    if (filters.processorBrands.length > 0) {
      const brand = String(laptop["processor-brand"] || "");
      if (
        !filters.processorBrands.some(
          (b) => brand.toLowerCase() === b.toLowerCase()
        )
      )
        return false;
    }

    if (filters.conditions.length > 0) {
      const cond = String(laptop["product-condition"] || "");
      if (
        !filters.conditions.some((c) =>
          cond.toUpperCase().includes(c.toUpperCase())
        )
      )
        return false;
    }

    if (filters.gpuTypes && filters.gpuTypes.length > 0) {
      const gpuType = String(laptop["gpu-type"] || "");
      if (
        !filters.gpuTypes.some(
          (g) => gpuType.toLowerCase() === g.toLowerCase()
        )
      )
        return false;
    }

    if (filters.storageTypes && filters.storageTypes.length > 0) {
      const storeType = String(laptop["storage-type"] || "");
      if (
        !filters.storageTypes.some(
          (s) => storeType.toLowerCase() === s.toLowerCase()
        )
      )
        return false;
    }

    if (filters.ddrGens && filters.ddrGens.length > 0) {
      const ddrGen = String(laptop["ddr-gen"] || "");
      if (
        !filters.ddrGens.some(
          (d) => ddrGen.toLowerCase() === d.toLowerCase()
        )
      )
        return false;
    }

    if (filters.touchscreenOnly) {
      const isTouch = !!laptop["touch-screen"];
      if (!isTouch) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const model = String(laptop["model"] || "").toLowerCase();
      const code = String(laptop["product-number"] || "").toLowerCase();
      const proc = String(laptop["processor"] || "").toLowerCase();
      if (!model.includes(q) && !code.includes(q) && !proc.includes(q))
        return false;
    }

    return true;
  });
}

export const DashboardPage = ({
  laptopData,
  lastModified,
  searchQuery,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
}: DashboardPageProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(
    searchParams.get("watchlist") === "1"
  );

  useEffect(() => {
    setShowWatchlistOnly(searchParams.get("watchlist") === "1");
  }, [searchParams]);

  const gridRef = useRef<GridHandle>(null);

  const filteredData = useMemo(() => {
    const base = showWatchlistOnly
      ? laptopData.filter((item) =>
          watchlist.includes(String(item["product-number"]))
        )
      : laptopData;
    return applyFilters(base, filters, searchQuery);
  }, [laptopData, filters, searchQuery, showWatchlistOnly, watchlist]);

  const handleBestDealClick = useCallback(
    (code: string) => navigate(`/laptop/${code}`),
    [navigate]
  );

  const handleRowSelected = useCallback(
    (code: string) => navigate(`/laptop/${code}`),
    [navigate]
  );

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    gridRef.current?.resetGrid();
  }, []);

  const handleToggleWatch = useCallback(
    (code: string) => {
      const isAdding = !watchlist.includes(code);
      toggleWatch(code);
      showToast(
        isAdding ? "⭐ Added to watchlist" : "Removed from watchlist",
        isAdding ? "success" : "info"
      );
    },
    [toggleWatch, watchlist, showToast]
  );

  const handleToggleCompare = useCallback(
    (laptop: LaptopData) => {
      const exists = compareList.some(
        (c) => c["product-number"] === laptop["product-number"]
      );
      if (!exists && compareList.length >= 4) {
        showToast("Comparison full — max 4 laptops", "warning");
        return;
      }
      toggleCompare(laptop);
      showToast(
        exists ? "Removed from comparison" : "✅ Added to comparison",
        exists ? "info" : "success"
      );
    },
    [toggleCompare, compareList, showToast]
  );

  const FilterIcon = () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );

  return (
    <div className="dashboard-layout">
      {/* Stats strip */}
      <DashboardStats
        data={laptopData}
        lastModified={lastModified}
        onBestDealClick={handleBestDealClick}
      />

      {/* Toolbar */}
      <div className="dashboard-toolbar">
        <div className="toolbar-left">
          <button
            className="btn btn-ghost btn-sm toolbar-filter-btn mobile-only-btn"
            onClick={() => setMobileFilterOpen(true)}
          >
            <FilterIcon />
            Filters
          </button>

          <span className="toolbar-count">
            {filteredData.length.toLocaleString()} laptop
            {filteredData.length !== 1 ? "s" : ""}
            {filteredData.length !== laptopData.length && (
              <span className="toolbar-count-total">
                {" "}
                of {laptopData.length}
              </span>
            )}
          </span>
        </div>

        <div className="toolbar-right">
          <button
            className={`btn btn-sm ${
              showWatchlistOnly ? "btn-primary" : "btn-ghost"
            }`}
            onClick={() => setShowWatchlistOnly((v) => !v)}
            title="Show only watchlisted laptops"
          >
            ⭐ Watchlist ({watchlist.length})
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => gridRef.current?.resetGrid()}
            title="Reset grid sorting/filtering"
          >
            Reset grid
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => download("trackfurb-india.csv", dataToCsv(filteredData))}
            title="Download CSV"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="dashboard-content">
        <FilterSidebar
          filters={filters}
          onFiltersChange={setFilters}
          onReset={handleResetFilters}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          isMobileOpen={mobileFilterOpen}
          onMobileClose={() => setMobileFilterOpen(false)}
        />

        <div className="dashboard-grid-area">
          {/* Desktop: AG Grid */}
          <div className="desktop-grid-wrap">
            <Grid
              ref={gridRef}
              data={filteredData}
              watchlist={watchlist}
              toggleWatch={handleToggleWatch}
              compareList={compareList}
              toggleCompare={handleToggleCompare}
              onRowSelected={handleRowSelected}
            />
          </div>

          {/* Mobile: Card list */}
          <div className="mobile-list-wrap">
            <MobileCardList
              data={filteredData}
              watchlist={watchlist}
              toggleWatch={handleToggleWatch}
              compareList={compareList}
              toggleCompare={handleToggleCompare}
            />
          </div>
        </div>
      </div>

      {/* Floating compare bar */}
      <FloatingCompareBar
        compareList={compareList}
        onClear={() => compareList.forEach((l) => toggleCompare(l))}
      />
    </div>
  );
};
