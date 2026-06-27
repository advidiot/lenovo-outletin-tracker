import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { dataToCsv, download, LaptopData, FacetGroup, cleanGpuName } from "../data";
import { DashboardStats } from "../components/DashboardStats";
import { FilterSidebar, FilterState, DEFAULT_FILTERS } from "../components/FilterSidebar";
import { FloatingCompareBar } from "../components/FloatingCompareBar";
import { MobileCardList } from "../components/MobileCardList";
import { LenovoCardGrid } from "../components/LenovoCardGrid";
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
  facetGroups: FacetGroup[];
}

function parseWeight(weightStr: string | null): number | null {
  if (!weightStr) return null;
  const match = weightStr.toLowerCase().match(/([\d\.]+)\s*kg/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

function matchWeightRange(weightKg: number, selectedRange: string): boolean {
  const cleanRange = selectedRange.replace(/\s+/g, "").toLowerCase();
  const match = cleanRange.match(/([\d\.]+)kg-([\d\.]+)kg/);
  if (match) {
    const min = parseFloat(match[1]);
    const max = parseFloat(match[2]);
    return weightKg >= min && weightKg <= max;
  }
  return false;
}

function applyFilters(
  data: LaptopData[],
  filters: FilterState,
  searchQuery: string
): LaptopData[] {
  return data.filter((laptop) => {
    if (!filters.showUnavailable && !laptop["available"] && !(filters.showCheckoutHolds && laptop["in_cart_hold"])) return false;
    if (!filters.showCheckoutHolds && laptop["in_cart_hold"]) return false;

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
      const proc = String(laptop["processor"] || "").toLowerCase().replace(/[®™]/g, "");
      const matched = filters.processorBrands.some((selectedCpu) => {
        const cleanSelected = selectedCpu.toLowerCase().replace(/[®™]/g, "");
        if (cleanSelected === "all intel processors") {
          return proc.includes("intel");
        }
        if (cleanSelected === "all amd processors") {
          return proc.includes("amd") || proc.includes("ryzen");
        }
        if (cleanSelected.includes("vpro")) {
          const base = cleanSelected.replace("vpro", "").trim();
          return proc.includes(base) && proc.includes("vpro");
        }
        return proc.includes(cleanSelected);
      });
      if (!matched) return false;
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

    if (filters.brands && filters.brands.length > 0) {
      const model = String(laptop["model"] || "").toLowerCase();
      const brand = String(laptop["brand"] || "").toLowerCase();
      const matched = filters.brands.some((b) => {
        const cleanB = b.toLowerCase();
        return model.includes(cleanB) || brand.includes(cleanB);
      });
      if (!matched) return false;
    }

    if (filters.series && filters.series.length > 0) {
      const model = String(laptop["model"] || "").toLowerCase();
      const matched = filters.series.some((s) => {
        const cleanS = s.toLowerCase().replace(/series/g, "").replace(/laptops/g, "").trim();
        if (cleanS.includes("2-in-1")) {
          const base = cleanS.replace("2-in-1", "").trim();
          return model.includes(base) && (model.includes("2-in-1") || model.includes("flex"));
        }
        return model.includes(cleanS);
      });
      if (!matched) return false;
    }

    if (filters.storageSizes && filters.storageSizes.length > 0) {
      const storeSize = String(laptop["storage-size"] || "").toLowerCase().replace(/\s+/g, "");
      const matched = filters.storageSizes.some((s) => {
        const cleanS = s.toLowerCase().replace(/\s+/g, "");
        return storeSize === cleanS;
      });
      if (!matched) return false;
    }

    if (filters.operatingSystems && filters.operatingSystems.length > 0) {
      const os = String(laptop["operating-system"] || "").toLowerCase();
      const matched = filters.operatingSystems.some((o) => {
        return os.includes(o.toLowerCase());
      });
      if (!matched) return false;
    }

    if (filters.colors && filters.colors.length > 0) {
      const color = String(laptop.full_specs?.Color || laptop.specs?.Color || laptop.color || "").toLowerCase();
      const matched = filters.colors.some((c) => {
        return color.includes(c.toLowerCase());
      });
      if (!matched) return false;
    }

    if (filters.weights && filters.weights.length > 0) {
      const rawWeight = laptop.weight || laptop.specs?.Weight || laptop.full_specs?.Weight;
      const weightNum = parseWeight(rawWeight);
      if (weightNum === null) return false;
      const matched = filters.weights.some((w) => matchWeightRange(weightNum, w));
      if (!matched) return false;
    }

    if (filters.features && filters.features.length > 0) {
      const matched = filters.features.some((f) => {
        const cleanF = f.toLowerCase();
        if (cleanF === "touch screen") {
          return !!laptop["touch-screen"];
        }
        if (cleanF === "non-touch") {
          return !laptop["touch-screen"];
        }
        if (cleanF === "2-in-1") {
          const model = String(laptop["model"] || "").toLowerCase();
          return model.includes("2-in-1") || model.includes("flex") || model.includes("yoga");
        }
        if (cleanF === "fingerprint reader") {
          return !!(laptop.full_specs?.["Fingerprint Reader"] || laptop.specs?.["Fingerprint Reader"]);
        }
        if (cleanF === "trackpoint") {
          return String(laptop.full_specs?.["Pointing Device"] || "").toLowerCase().includes("trackpoint");
        }
        return false;
      });
      if (!matched) return false;
    }

    if (filters.byTypes && filters.byTypes.length > 0) {
      const model = String(laptop["model"] || "").toLowerCase();
      const matched = filters.byTypes.some((t) => {
        const cleanT = t.toLowerCase();
        if (cleanT.includes("convertibles")) {
          return model.includes("yoga") || model.includes("flex") || model.includes("2-in-1");
        }
        if (cleanT.includes("thin") || cleanT.includes("light")) {
          return model.includes("slim") || model.includes("yoga") || model.includes("air");
        }
        if (cleanT.includes("traditional")) {
          return !model.includes("yoga") && !model.includes("flex") && !model.includes("2-in-1") && !model.includes("all-in-one") && !model.includes("aio");
        }
        if (cleanT.includes("all-in-one") || cleanT.includes("aio")) {
          return model.includes("all-in-one") || model.includes("aio");
        }
        return false;
      });
      if (!matched) return false;
    }

    if (filters.byUses && filters.byUses.length > 0) {
      const model = String(laptop["model"] || "").toLowerCase();
      const matched = filters.byUses.some((u) => {
        const cleanU = u.toLowerCase();
        if (cleanU === "gaming") {
          return model.includes("loq") || model.includes("legion") || model.includes("gaming");
        }
        if (cleanU === "creator") {
          return model.includes("yoga pro") || model.includes("ideapad pro") || model.includes("slim 7") || model.includes("slim 9");
        }
        if (cleanU === "work") {
          return model.includes("thinkpad") || model.includes("thinkbook") || model.includes("v15") || model.includes("v14");
        }
        return true;
      });
      if (!matched) return false;
    }

    if (filters.gpuModels && filters.gpuModels.length > 0) {
      const rawGpu = String(laptop["graphic-card"] || "");
      const cleanG = cleanGpuName(rawGpu);
      if (!filters.gpuModels.includes(cleanG)) {
        return false;
      }
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

function parseFiltersFromSearchParams(params: URLSearchParams): FilterState {
  const parseArray = (key: string): string[] => {
    const val = params.get(key);
    return val ? val.split(",").filter(Boolean) : [];
  };

  const parseNumber = (key: string, defaultValue: number): number => {
    const val = params.get(key);
    return val ? parseInt(val, 10) : defaultValue;
  };

  const parseBoolean = (key: string, defaultValue = false): boolean => {
    const val = params.get(key);
    if (val === null) return defaultValue;
    return val === "1";
  };

  return {
    priceMin: parseNumber("priceMin", DEFAULT_FILTERS.priceMin),
    priceMax: parseNumber("priceMax", DEFAULT_FILTERS.priceMax),
    screenSizes: parseArray("screenSizes"),
    ramSizes: parseArray("ramSizes"),
    processorBrands: parseArray("processorBrands"),
    conditions: parseArray("conditions"),
    gpuTypes: parseArray("gpuTypes"),
    storageTypes: parseArray("storageTypes"),
    ddrGens: parseArray("ddrGens"),
    touchscreenOnly: parseBoolean("touchscreenOnly"),
    showUnavailable: parseBoolean("showUnavailable"),
    showCheckoutHolds: parseBoolean("showCheckoutHolds", true),
    storageSizes: parseArray("storageSizes"),
    operatingSystems: parseArray("operatingSystems"),
    weights: parseArray("weights"),
    brands: parseArray("brands"),
    series: parseArray("series"),
    features: parseArray("features"),
    colors: parseArray("colors"),
    byTypes: parseArray("byTypes"),
    byUses: parseArray("byUses"),
    gpuModels: parseArray("gpuModels"),
  };
}

function serializeFiltersToSearchParams(
  filters: FilterState,
  currentParams: URLSearchParams
): URLSearchParams {
  const newParams = new URLSearchParams(currentParams);

  const setArray = (key: string, arr: string[]) => {
    if (arr && arr.length > 0) {
      newParams.set(key, arr.join(","));
    } else {
      newParams.delete(key);
    }
  };

  const setNumber = (key: string, val: number, defaultVal: number) => {
    if (val !== undefined && val !== defaultVal) {
      newParams.set(key, String(val));
    } else {
      newParams.delete(key);
    }
  };

  const setBoolean = (key: string, val: boolean, defaultVal = false) => {
    if (val !== defaultVal) {
      newParams.set(key, val ? "1" : "0");
    } else {
      newParams.delete(key);
    }
  };

  setNumber("priceMin", filters.priceMin, DEFAULT_FILTERS.priceMin);
  setNumber("priceMax", filters.priceMax, DEFAULT_FILTERS.priceMax);
  setArray("screenSizes", filters.screenSizes);
  setArray("ramSizes", filters.ramSizes);
  setArray("processorBrands", filters.processorBrands);
  setArray("conditions", filters.conditions);
  setArray("gpuTypes", filters.gpuTypes);
  setArray("storageTypes", filters.storageTypes);
  setArray("ddrGens", filters.ddrGens);
  setBoolean("touchscreenOnly", filters.touchscreenOnly);
  setBoolean("showUnavailable", filters.showUnavailable);
  setBoolean("showCheckoutHolds", filters.showCheckoutHolds, true);
  setArray("storageSizes", filters.storageSizes);
  setArray("operatingSystems", filters.operatingSystems);
  setArray("weights", filters.weights);
  setArray("brands", filters.brands);
  setArray("series", filters.series);
  setArray("features", filters.features);
  setArray("colors", filters.colors);
  setArray("byTypes", filters.byTypes);
  setArray("byUses", filters.byUses);
  setArray("gpuModels", filters.gpuModels);

  return newParams;
}

export const DashboardPage = ({
  laptopData,
  lastModified,
  searchQuery,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
  facetGroups,
}: DashboardPageProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const [filters, setFilters] = useState<FilterState>(() =>
    parseFiltersFromSearchParams(searchParams)
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(
    searchParams.get("watchlist") === "1"
  );
  const [viewMode, setViewMode] = useState<"normal" | "table">(() => {
    try {
      const saved = localStorage.getItem("trackfurb_view_mode");
      return (saved === "normal" || saved === "table") ? saved : "normal";
    } catch {
      return "normal";
    }
  });

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
    setFilters(parseFiltersFromSearchParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    setShowWatchlistOnly(searchParams.get("watchlist") === "1");
  }, [searchParams]);

  useEffect(() => {
    localStorage.setItem("trackfurb_view_mode", viewMode);
  }, [viewMode]);

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

  const statsData = useMemo(() => {
    if (filters.showUnavailable) {
      return laptopData;
    } else {
      return laptopData.filter((l) => l["available"]);
    }
  }, [laptopData, filters.showUnavailable]);

  const baseTotalCount = useMemo(() => {
    if (filters.showUnavailable) {
      return laptopData.length;
    } else {
      return laptopData.filter((l) => l["available"]).length;
    }
  }, [laptopData, filters.showUnavailable]);

  const gpuModelOptions = useMemo(() => {
    const rawGpus = statsData
      .map((l) => l["graphic-card"] as string)
      .filter(Boolean);
    const cleaned = rawGpus.map(cleanGpuName);
    return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
  }, [statsData]);

  const handleBestDealClick = useCallback(
    (code: string) => navigate(`/laptop/${code}`),
    [navigate]
  );

  const handleRowSelected = useCallback(
    (code: string) => navigate(`/laptop/${code}`),
    [navigate]
  );

  const handleFiltersChange = useCallback(
    (newFilters: FilterState) => {
      setSearchParams((prev) => serializeFiltersToSearchParams(newFilters, prev));
    },
    [setSearchParams]
  );

  const handleResetFilters = useCallback(() => {
    setSearchParams((prev) => serializeFiltersToSearchParams(DEFAULT_FILTERS, prev));
    setSortBy("price-asc");
    gridRef.current?.resetGrid();
  }, [setSearchParams]);

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
        data={statsData}
        lastModified={lastModified}
        onBestDealClick={handleBestDealClick}
        showUnavailable={filters.showUnavailable}
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
            {filteredData.length !== baseTotalCount && (
              <span className="toolbar-count-total">
                {" "}
                of {baseTotalCount}
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

          <div className="toolbar-view-toggle">
            <button
              className={`btn btn-sm ${viewMode === "normal" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("normal")}
              title="Lenovo Grid Layout"
            >
              Grid View
            </button>
            <button
              className={`btn btn-sm ${viewMode === "table" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("table")}
              title="Spreadsheet Table Layout"
            >
              Table View
            </button>
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
          onFiltersChange={handleFiltersChange}
          onReset={handleResetFilters}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          isMobileOpen={mobileFilterOpen}
          onMobileClose={() => setMobileFilterOpen(false)}
          facetGroups={facetGroups}
          gpuModelOptions={gpuModelOptions}
          laptops={statsData}
        />

        <div className="dashboard-grid-area">
          {/* Desktop view */}
          <div className="desktop-grid-wrap">
            {viewMode === "normal" ? (
              <LenovoCardGrid
                data={filteredData}
                watchlist={watchlist}
                toggleWatch={handleToggleWatch}
                compareList={compareList}
                toggleCompare={handleToggleCompare}
              />
            ) : (
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
            )}
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
