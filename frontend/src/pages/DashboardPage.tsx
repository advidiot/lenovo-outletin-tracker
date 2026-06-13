import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { dataToCsv, download, LaptopData } from "../data";
import { DashboardStats } from "../components/DashboardStats";
import { FilterSidebar, FilterState, DEFAULT_FILTERS } from "../components/FilterSidebar";
import { FloatingCompareBar } from "../components/FloatingCompareBar";
import { MobileCardList } from "../components/MobileCardList";
import { useToast } from "../components/ToastProvider";
import { retrieveSettings } from "../gridSettings";
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

function sortLaptops(data: LaptopData[], sortBy: string): LaptopData[] {
  const sorted = [...data];
  if (sortBy === "price-asc") {
    sorted.sort((a, b) => Number(a["price"] || 0) - Number(b["price"] || 0));
  } else if (sortBy === "price-desc") {
    sorted.sort((a, b) => Number(b["price"] || 0) - Number(a["price"] || 0));
  } else if (sortBy === "newest") {
    sorted.sort((a, b) => {
      const aVal = String(a["first_seen"] || "");
      const bVal = String(b["first_seen"] || "");
      return bVal.localeCompare(aVal);
    });
  } else if (sortBy === "savings-desc") {
    sorted.sort((a, b) => Number(b["percentage-savings"] || 0) - Number(a["percentage-savings"] || 0));
  } else if (sortBy.endsWith("-asc") || sortBy.endsWith("-desc")) {
    const dashIndex = sortBy.lastIndexOf("-");
    const colId = sortBy.substring(0, dashIndex);
    const direction = sortBy.substring(dashIndex + 1);
    sorted.sort((a, b) => {
      const aVal = a[colId];
      const bVal = b[colId];
      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const compareResult = aVal > bVal ? 1 : -1;
      return direction === "asc" ? compareResult : -compareResult;
    });
  }
  return sorted;
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
  const [sortBy, setSortBy] = useState<string>(() => {
    try {
      const settings = retrieveSettings();
      if (settings && settings.columnState) {
        const sorted = settings.columnState.find((c) => c.sort != null);
        if (sorted) {
          if (sorted.colId === "price" && sorted.sort === "asc") return "price-asc";
          if (sorted.colId === "price" && sorted.sort === "desc") return "price-desc";
          if (sorted.colId === "first_seen" && sorted.sort === "desc") return "newest";
          if (sorted.colId === "percentage-savings" && sorted.sort === "desc") return "savings-desc";
          return `${sorted.colId}-${sorted.sort}`;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return "price-asc";
  });

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
    const filtered = applyFilters(base, filters, searchQuery);
    return sortLaptops(filtered, sortBy);
  }, [laptopData, filters, searchQuery, showWatchlistOnly, watchlist, sortBy]);

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
    setSortBy("price-asc");
    gridRef.current?.resetGrid();
  }, []);

  const handleSortChange = useCallback((newSortBy: string) => {
    setSortBy(newSortBy);
    if (newSortBy === "price-asc") {
      gridRef.current?.applySort("price", "asc");
    } else if (newSortBy === "price-desc") {
      gridRef.current?.applySort("price", "desc");
    } else if (newSortBy === "newest") {
      gridRef.current?.applySort("first_seen", "desc");
    } else if (newSortBy === "savings-desc") {
      gridRef.current?.applySort("percentage-savings", "desc");
    } else if (newSortBy.endsWith("-asc") || newSortBy.endsWith("-desc")) {
      const dashIndex = newSortBy.lastIndexOf("-");
      const colId = newSortBy.substring(0, dashIndex);
      const sort = newSortBy.substring(dashIndex + 1) as "asc" | "desc";
      gridRef.current?.applySort(colId, sort);
    }
  }, []);

  const handleGridSortChanged = useCallback((colId: string, sort: "asc" | "desc" | null) => {
    let newSortBy = "price-asc";
    if (colId === "price" && sort === "asc") newSortBy = "price-asc";
    else if (colId === "price" && sort === "desc") newSortBy = "price-desc";
    else if (colId === "first_seen" && sort === "desc") newSortBy = "newest";
    else if (colId === "percentage-savings" && sort === "desc") newSortBy = "savings-desc";
    else if (colId && sort) newSortBy = `${colId}-${sort}`;
    
    setSortBy(newSortBy);
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
          <div className="toolbar-sort">
            <span className="sort-label">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              className="select-sort"
            >
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="newest">Newest First</option>
              <option value="savings-desc">Savings: High to Low</option>
              {!["price-asc", "price-desc", "newest", "savings-desc"].includes(sortBy) && (
                <option value={sortBy}>Sorted: Custom</option>
              )}
            </select>
          </div>

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
              onSortChanged={handleGridSortChanged}
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
