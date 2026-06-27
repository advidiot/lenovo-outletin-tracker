import { useState, useMemo } from "react";
import "./FilterSidebar.css";
import { FacetGroup, LaptopData } from "../data";

export interface FilterState {
  priceMin: number;
  priceMax: number;
  screenSizes: string[];
  ramSizes: string[];
  processorBrands: string[];
  conditions: string[];
  gpuTypes: string[];
  storageTypes: string[];
  ddrGens: string[];
  touchscreenOnly: boolean;
  showUnavailable: boolean;
  showCheckoutHolds: boolean;
  storageSizes: string[];
  operatingSystems: string[];
  weights: string[];
  brands: string[];
  series: string[];
  features: string[];
  colors: string[];
  byTypes: string[];
  byUses: string[];
  gpuModels: string[];
}

export const DEFAULT_FILTERS: FilterState = {
  priceMin: 0,
  priceMax: 300000,
  screenSizes: [],
  ramSizes: [],
  processorBrands: [],
  conditions: [],
  gpuTypes: [],
  storageTypes: [],
  ddrGens: [],
  storageSizes: [],
  operatingSystems: [],
  weights: [],
  brands: [],
  series: [],
  features: [],
  colors: [],
  byTypes: [],
  byUses: [],
  gpuModels: [],
  touchscreenOnly: false,
  showUnavailable: false,
  showCheckoutHolds: true,
};

interface FilterSidebarProps {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  onReset: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** For mobile bottom sheet */
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  facetGroups: FacetGroup[];
  gpuModelOptions: string[];
  laptops: LaptopData[];
}

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
  >
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const FilterSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="filter-section">
      <button
        className="filter-section-header"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="filter-section-body">{children}</div>}
    </div>
  );
};

const activeFilterCount = (f: FilterState) =>
  (f.priceMin > 0 || f.priceMax < 300000 ? 1 : 0) +
  f.screenSizes.length +
  f.ramSizes.length +
  f.processorBrands.length +
  f.conditions.length +
  f.gpuTypes.length +
  f.storageTypes.length +
  f.ddrGens.length +
  f.storageSizes.length +
  f.operatingSystems.length +
  f.weights.length +
  f.brands.length +
  f.series.length +
  f.features.length +
  f.colors.length +
  f.byTypes.length +
  f.byUses.length +
  f.gpuModels.length +
  (f.touchscreenOnly ? 1 : 0) +
  (f.showUnavailable ? 1 : 0) +
  (!f.showCheckoutHolds ? 1 : 0);

const toggle = (arr: string[], val: string) =>
  arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

export const FilterSidebar = ({
  filters,
  onFiltersChange,
  onReset,
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onMobileClose,
  facetGroups,
  gpuModelOptions,
  laptops,
}: FilterSidebarProps) => {
  const count = activeFilterCount(filters);

  const SCREEN_SIZES = useMemo(() => {
    const set = new Set<string>();
    laptops.forEach((l) => {
      const val = l["screen-size"];
      if (val != null && val !== "") {
        set.add(`${val}"`);
      }
    });
    filters.screenSizes.forEach((s) => set.add(s));
    return Array.from(set).sort((a, b) => parseFloat(a) - parseFloat(b));
  }, [laptops, filters.screenSizes]);

  const RAM_OPTIONS = useMemo(() => {
    const set = new Set<string>();
    laptops.forEach((l) => {
      const val = l["memory-size"];
      if (val) {
        set.add(String(val).toUpperCase());
      }
    });
    filters.ramSizes.forEach((r) => set.add(r));
    return Array.from(set).sort((a, b) => {
      const aNum = parseInt(a) || 0;
      const bNum = parseInt(b) || 0;
      return aNum - bNum;
    });
  }, [laptops, filters.ramSizes]);

  const CONDITIONS = useMemo(() => {
    const set = new Set<string>();
    laptops.forEach((l) => {
      const val = l["product-condition"];
      if (val) {
        set.add(String(val));
      }
    });
    filters.conditions.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [laptops, filters.conditions]);

  const GPU_TYPES = useMemo(() => {
    const set = new Set<string>();
    laptops.forEach((l) => {
      const val = l["gpu-type"];
      if (val) {
        set.add(String(val));
      }
    });
    filters.gpuTypes.forEach((g) => set.add(g));
    return Array.from(set).sort();
  }, [laptops, filters.gpuTypes]);

  const STORAGE_TYPES = useMemo(() => {
    const set = new Set<string>();
    laptops.forEach((l) => {
      const val = l["storage-type"];
      if (val) {
        set.add(String(val));
      }
    });
    filters.storageTypes.forEach((s) => set.add(s));
    return Array.from(set).sort();
  }, [laptops, filters.storageTypes]);

  const DDR_GENS = useMemo(() => {
    const set = new Set<string>();
    laptops.forEach((l) => {
      const val = l["ddr-gen"];
      if (val) {
        set.add(String(val));
      }
    });
    filters.ddrGens.forEach((d) => set.add(d));
    return Array.from(set).sort();
  }, [laptops, filters.ddrGens]);

  const cpuOptions = useMemo(() => {
    const procFacet = facetGroups.find((g) => g.facetId === "4374");
    if (!procFacet) return [];
    const allNames = procFacet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.processorBrands.includes(name)) return true;
      const cleanSelected = name.toLowerCase().replace(/[®™]/g, "");
      return laptops.some((l) => {
        const proc = String(l["processor"] || "").toLowerCase().replace(/[®™]/g, "");
        if (cleanSelected === "all intel processors") return proc.includes("intel");
        if (cleanSelected === "all amd processors") return proc.includes("amd") || proc.includes("ryzen");
        if (cleanSelected.includes("vpro")) {
          const base = cleanSelected.replace("vpro", "").trim();
          return proc.includes(base) && proc.includes("vpro");
        }
        return proc.includes(cleanSelected);
      });
    });
  }, [facetGroups, laptops, filters.processorBrands]);

  const brandOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4376");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.brands.includes(name)) return true;
      const cleanB = name.toLowerCase();
      return laptops.some((l) => {
        const model = String(l["model"] || "").toLowerCase();
        const brand = String(l["brand"] || "").toLowerCase();
        return model.includes(cleanB) || brand.includes(cleanB);
      });
    });
  }, [facetGroups, laptops, filters.brands]);

  const seriesOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4432");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.series.includes(name)) return true;
      const cleanS = name.toLowerCase().replace(/series/g, "").replace(/laptops/g, "").trim();
      return laptops.some((l) => {
        const model = String(l["model"] || "").toLowerCase();
        if (cleanS.includes("2-in-1")) {
          const base = cleanS.replace("2-in-1", "").trim();
          return model.includes(base) && (model.includes("2-in-1") || model.includes("flex"));
        }
        return model.includes(cleanS);
      });
    });
  }, [facetGroups, laptops, filters.series]);

  const storageSizeOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4375");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.storageSizes.includes(name)) return true;
      const cleanS = name.toLowerCase().replace(/\s+/g, "");
      return laptops.some((l) => {
        const storeSize = String(l["storage-size"] || "").toLowerCase().replace(/\s+/g, "");
        return storeSize === cleanS;
      });
    });
  }, [facetGroups, laptops, filters.storageSizes]);

  const osOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4372");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.operatingSystems.includes(name)) return true;
      return laptops.some((l) => {
        const os = String(l["operating-system"] || "").toLowerCase();
        return os.includes(name.toLowerCase());
      });
    });
  }, [facetGroups, laptops, filters.operatingSystems]);

  const weightOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4570");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    
    const parseWeightLocal = (weightStr: string | null): number | null => {
      if (!weightStr) return null;
      const match = weightStr.toLowerCase().match(/([\d\.]+)\s*kg/);
      return match ? parseFloat(match[1]) : null;
    };

    const matchWeightRangeLocal = (weightKg: number, selectedRange: string): boolean => {
      const cleanRange = selectedRange.replace(/\s+/g, "").toLowerCase();
      const match = cleanRange.match(/([\d\.]+)kg-([\d\.]+)kg/);
      if (match) {
        const min = parseFloat(match[1]);
        const max = parseFloat(match[2]);
        return weightKg >= min && weightKg <= max;
      }
      return false;
    };

    return allNames.filter((name) => {
      if (filters.weights.includes(name)) return true;
      return laptops.some((l) => {
        const rawWeight = l.weight || l.specs?.Weight || l.full_specs?.Weight;
        const weightNum = parseWeightLocal(rawWeight);
        return weightNum !== null && matchWeightRangeLocal(weightNum, name);
      });
    });
  }, [facetGroups, laptops, filters.weights]);

  const featureOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4571");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.features.includes(name)) return true;
      const cleanF = name.toLowerCase();
      return laptops.some((l) => {
        if (cleanF === "touch screen") {
          return !!l["touch-screen"];
        }
        if (cleanF === "non-touch") {
          return !l["touch-screen"];
        }
        if (cleanF === "2-in-1") {
          const model = String(l["model"] || "").toLowerCase();
          return model.includes("2-in-1") || model.includes("flex") || model.includes("yoga");
        }
        if (cleanF === "fingerprint reader") {
          return !!(l.full_specs?.["Fingerprint Reader"] || l.specs?.["Fingerprint Reader"]);
        }
        if (cleanF === "trackpoint") {
          return String(l.full_specs?.["Pointing Device"] || "").toLowerCase().includes("trackpoint");
        }
        return false;
      });
    });
  }, [facetGroups, laptops, filters.features]);

  const colorOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4373");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.colors.includes(name)) return true;
      return laptops.some((l) => {
        const color = String(l.full_specs?.Color || l.specs?.Color || l.color || "").toLowerCase();
        return color.includes(name.toLowerCase());
      });
    });
  }, [facetGroups, laptops, filters.colors]);

  const byTypeOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4383");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.byTypes.includes(name)) return true;
      const cleanT = name.toLowerCase();
      return laptops.some((l) => {
        const model = String(l["model"] || "").toLowerCase();
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
    });
  }, [facetGroups, laptops, filters.byTypes]);

  const byUseOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4568");
    if (!facet) return [];
    const allNames = facet.items.map((it) => it.name);
    return allNames.filter((name) => {
      if (filters.byUses.includes(name)) return true;
      const cleanU = name.toLowerCase();
      return laptops.some((l) => {
        const model = String(l["model"] || "").toLowerCase();
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
    });
  }, [facetGroups, laptops, filters.byUses]);

  const SidebarContent = (
    <div className="sidebar-content">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          Filters {count > 0 && <span className="filter-count-badge">{count}</span>}
        </div>
        <div className="sidebar-header-actions">
          {count > 0 && (
            <button className="sidebar-clear-btn" onClick={onReset}>
              Clear all
            </button>
          )}
          {/* Desktop collapse toggle */}
          <button
            className="sidebar-collapse-btn desktop-only"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand filters" : "Collapse filters"}
          >
            {collapsed ? "▶" : "◀"}
          </button>
          {/* Mobile close button */}
          {onMobileClose && (
            <button className="sidebar-collapse-btn mobile-only" onClick={onMobileClose}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Applied chips */}
      {count > 0 && (
        <div className="applied-chips">
          {filters.screenSizes.map((s) => (
            <button
              key={s}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, screenSizes: toggle(filters.screenSizes, s) })
              }
            >
              {s} ×
            </button>
          ))}
          {filters.ramSizes.map((r) => (
            <button
              key={r}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, ramSizes: toggle(filters.ramSizes, r) })
              }
            >
              {r} ×
            </button>
          ))}
          {filters.processorBrands.map((b) => (
            <button
              key={b}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, processorBrands: toggle(filters.processorBrands, b) })
              }
            >
              {b} ×
            </button>
          ))}
          {filters.conditions.map((c) => (
            <button
              key={c}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, conditions: toggle(filters.conditions, c) })
              }
            >
              {c} ×
            </button>
          ))}
          {filters.gpuTypes.map((g) => (
            <button
              key={g}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, gpuTypes: toggle(filters.gpuTypes, g) })
              }
            >
              {g} ×
            </button>
          ))}
          {filters.storageTypes.map((s) => (
            <button
              key={s}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, storageTypes: toggle(filters.storageTypes, s) })
              }
            >
              {s} ×
            </button>
          ))}
          {filters.ddrGens.map((d) => (
            <button
              key={d}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, ddrGens: toggle(filters.ddrGens, d) })
              }
            >
              {d} ×
            </button>
          ))}
          {filters.touchscreenOnly && (
            <button
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, touchscreenOnly: false })
              }
            >
              Touchscreen ×
            </button>
          )}
          {filters.brands.map((b) => (
            <button
              key={b}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, brands: toggle(filters.brands, b) })
              }
            >
              {b} ×
            </button>
          ))}
          {filters.series.map((s) => (
            <button
              key={s}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, series: toggle(filters.series, s) })
              }
            >
              {s} ×
            </button>
          ))}
          {filters.gpuModels.map((g) => (
            <button
              key={g}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, gpuModels: toggle(filters.gpuModels, g) })
              }
            >
              {g} ×
            </button>
          ))}
          {filters.features.map((f) => (
            <button
              key={f}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, features: toggle(filters.features, f) })
              }
            >
              {f} ×
            </button>
          ))}
          {filters.colors.map((c) => (
            <button
              key={c}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, colors: toggle(filters.colors, c) })
              }
            >
              {c} ×
            </button>
          ))}
          {filters.byTypes.map((t) => (
            <button
              key={t}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, byTypes: toggle(filters.byTypes, t) })
              }
            >
              {t} ×
            </button>
          ))}
          {filters.byUses.map((u) => (
            <button
              key={u}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, byUses: toggle(filters.byUses, u) })
              }
            >
              {u} ×
            </button>
          ))}
          {filters.weights.map((w) => (
            <button
              key={w}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, weights: toggle(filters.weights, w) })
              }
            >
              {w} ×
            </button>
          ))}
          {filters.operatingSystems.map((o) => (
            <button
              key={o}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, operatingSystems: toggle(filters.operatingSystems, o) })
              }
            >
              {o} ×
            </button>
          ))}
          {filters.storageSizes.map((s) => (
            <button
              key={s}
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, storageSizes: toggle(filters.storageSizes, s) })
              }
            >
              {s} ×
            </button>
          ))}
          {(filters.priceMin > 0 || filters.priceMax < 300000) && (
            <button
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, priceMin: 0, priceMax: 300000 })
              }
            >
              ₹{Math.round(filters.priceMin / 1000)}k – ₹{Math.round(filters.priceMax / 1000)}k ×
            </button>
          )}
          {!filters.showCheckoutHolds && (
            <button
              className="chip chip-active"
              onClick={() =>
                onFiltersChange({ ...filters, showCheckoutHolds: true })
              }
            >
              Hide Holds ×
            </button>
          )}
        </div>
      )}

      <div className="filter-sections">
        {/* Price range */}
        <FilterSection title="Price Range">
          <div className="price-range-labels">
            <span>₹{filters.priceMin.toLocaleString("en-IN")}</span>
            <span>₹{filters.priceMax.toLocaleString("en-IN")}</span>
          </div>
          <div className="price-sliders">
            <input
              type="range"
              min={0}
              max={300000}
              step={5000}
              value={filters.priceMin}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  priceMin: Math.min(Number(e.target.value), filters.priceMax - 5000),
                })
              }
              className="range-input"
            />
            <input
              type="range"
              min={0}
              max={300000}
              step={5000}
              value={filters.priceMax}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  priceMax: Math.max(Number(e.target.value), filters.priceMin + 5000),
                })
              }
              className="range-input"
            />
          </div>
        </FilterSection>

        {/* Screen size */}
        <FilterSection title="Screen Size">
          <div className="chip-group">
            {SCREEN_SIZES.map((s) => (
              <button
                key={s}
                className={`chip ${filters.screenSizes.includes(s) ? "chip-active" : ""}`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    screenSizes: toggle(filters.screenSizes, s),
                  })
                }
              >
                {s}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* RAM */}
        <FilterSection title="RAM">
          <div className="chip-group">
            {RAM_OPTIONS.map((r) => (
              <button
                key={r}
                className={`chip ${filters.ramSizes.includes(r) ? "chip-active" : ""}`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    ramSizes: toggle(filters.ramSizes, r),
                  })
                }
              >
                {r}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Processor range */}
        <FilterSection title="Processor">
          <div className="checkbox-group">
            {cpuOptions.map((b) => (
              <label key={b} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.processorBrands.includes(b)}
                  onChange={() =>
                    onFiltersChange({
                      ...filters,
                      processorBrands: toggle(filters.processorBrands, b),
                    })
                  }
                  className="checkbox-input"
                />
                {b}
              </label>
            ))}
          </div>
        </FilterSection>

        {/* Brand */}
        {brandOptions.length > 0 && (
          <FilterSection title="Brand">
            <div className="checkbox-group">
              {brandOptions.map((b) => (
                <label key={b} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.brands.includes(b)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        brands: toggle(filters.brands, b),
                      })
                    }
                    className="checkbox-input"
                  />
                  {b}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Series */}
        {seriesOptions.length > 0 && (
          <FilterSection title="Series">
            <div className="checkbox-group">
              {seriesOptions.map((s) => (
                <label key={s} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.series.includes(s)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        series: toggle(filters.series, s),
                      })
                    }
                    className="checkbox-input"
                  />
                  {s}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Storage Size */}
        {storageSizeOptions.length > 0 && (
          <FilterSection title="Storage Size">
            <div className="checkbox-group">
              {storageSizeOptions.map((s) => (
                <label key={s} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.storageSizes.includes(s)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        storageSizes: toggle(filters.storageSizes, s),
                      })
                    }
                    className="checkbox-input"
                  />
                  {s}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Operating System */}
        {osOptions.length > 0 && (
          <FilterSection title="Operating System">
            <div className="checkbox-group">
              {osOptions.map((o) => (
                <label key={o} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.operatingSystems.includes(o)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        operatingSystems: toggle(filters.operatingSystems, o),
                      })
                    }
                    className="checkbox-input"
                  />
                  {o}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Weight */}
        {weightOptions.length > 0 && (
          <FilterSection title="Weight">
            <div className="checkbox-group">
              {weightOptions.map((w) => (
                <label key={w} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.weights.includes(w)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        weights: toggle(filters.weights, w),
                      })
                    }
                    className="checkbox-input"
                  />
                  {w}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Features */}
        {featureOptions.length > 0 && (
          <FilterSection title="Features">
            <div className="checkbox-group">
              {featureOptions.map((f) => (
                <label key={f} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.features.includes(f)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        features: toggle(filters.features, f),
                      })
                    }
                    className="checkbox-input"
                  />
                  {f}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Color */}
        {colorOptions.length > 0 && (
          <FilterSection title="Color">
            <div className="checkbox-group">
              {colorOptions.map((c) => (
                <label key={c} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.colors.includes(c)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        colors: toggle(filters.colors, c),
                      })
                    }
                    className="checkbox-input"
                  />
                  {c}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* By Type */}
        {byTypeOptions.length > 0 && (
          <FilterSection title="By Type">
            <div className="checkbox-group">
              {byTypeOptions.map((t) => (
                <label key={t} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.byTypes.includes(t)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        byTypes: toggle(filters.byTypes, t),
                      })
                    }
                    className="checkbox-input"
                  />
                  {t}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* By Use */}
        {byUseOptions.length > 0 && (
          <FilterSection title="By Use">
            <div className="checkbox-group">
              {byUseOptions.map((u) => (
                <label key={u} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.byUses.includes(u)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        byUses: toggle(filters.byUses, u),
                      })
                    }
                    className="checkbox-input"
                  />
                  {u}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Condition */}
        <FilterSection title="Condition">
          <div className="checkbox-group">
            {CONDITIONS.map((c) => (
              <label key={c} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.conditions.includes(c)}
                  onChange={() =>
                    onFiltersChange({
                      ...filters,
                      conditions: toggle(filters.conditions, c),
                    })
                  }
                  className="checkbox-input"
                />
                {c}
              </label>
            ))}
          </div>
        </FilterSection>

        {/* GPU Type */}
        <FilterSection title="GPU Type">
          <div className="chip-group">
            {GPU_TYPES.map((g) => (
              <button
                key={g}
                className={`chip ${filters.gpuTypes.includes(g) ? "chip-active" : ""}`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    gpuTypes: toggle(filters.gpuTypes, g),
                  })
                }
              >
                {g}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Graphics Card */}
        {gpuModelOptions.length > 0 && (
          <FilterSection title="Graphics Card">
            <div className="checkbox-group">
              {gpuModelOptions.map((g) => (
                <label key={g} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={filters.gpuModels.includes(g)}
                    onChange={() =>
                      onFiltersChange({
                        ...filters,
                        gpuModels: toggle(filters.gpuModels, g),
                      })
                    }
                    className="checkbox-input"
                  />
                  {g}
                </label>
              ))}
            </div>
          </FilterSection>
        )}

        {/* Storage Type */}
        <FilterSection title="Storage Type">
          <div className="chip-group">
            {STORAGE_TYPES.map((s) => (
              <button
                key={s}
                className={`chip ${filters.storageTypes.includes(s) ? "chip-active" : ""}`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    storageTypes: toggle(filters.storageTypes, s),
                  })
                }
              >
                {s}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* DDR Generation */}
        <FilterSection title="DDR Generation">
          <div className="chip-group">
            {DDR_GENS.map((d) => (
              <button
                key={d}
                className={`chip ${filters.ddrGens.includes(d) ? "chip-active" : ""}`}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    ddrGens: toggle(filters.ddrGens, d),
                  })
                }
              >
                {d}
              </button>
            ))}
          </div>
        </FilterSection>

        {/* Display / Touchscreen */}
        <FilterSection title="Display Features">
          <label className="toggle-label">
            <span>Touchscreen only</span>
            <div
              className={`toggle ${filters.touchscreenOnly ? "toggle-on" : ""}`}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  touchscreenOnly: !filters.touchscreenOnly,
                })
              }
              role="switch"
              aria-checked={filters.touchscreenOnly}
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                onFiltersChange({
                  ...filters,
                  touchscreenOnly: !filters.touchscreenOnly,
                })
              }
            >
              <div className="toggle-thumb" />
            </div>
          </label>
        </FilterSection>

        {/* Availability */}
        <FilterSection title="Availability">
          <label className="toggle-label">
            <span>Show sold out</span>
            <div
              className={`toggle ${filters.showUnavailable ? "toggle-on" : ""}`}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  showUnavailable: !filters.showUnavailable,
                })
              }
              role="switch"
              aria-checked={filters.showUnavailable}
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                onFiltersChange({
                  ...filters,
                  showUnavailable: !filters.showUnavailable,
                })
              }
            >
              <div className="toggle-thumb" />
            </div>
          </label>
          <label className="toggle-label" style={{ marginTop: "1rem" }}>
            <span>Show checkout holds</span>
            <div
              className={`toggle ${filters.showCheckoutHolds ? "toggle-on" : ""}`}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  showCheckoutHolds: !filters.showCheckoutHolds,
                })
              }
              role="switch"
              aria-checked={filters.showCheckoutHolds}
              tabIndex={0}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                onFiltersChange({
                  ...filters,
                  showCheckoutHolds: !filters.showCheckoutHolds,
                })
              }
            >
              <div className="toggle-thumb" />
            </div>
          </label>
        </FilterSection>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`filter-sidebar ${collapsed ? "filter-sidebar-collapsed" : ""} desktop-sidebar`}
      >
        {collapsed ? (
          <button
            className="sidebar-expand-btn"
            onClick={onToggleCollapse}
            title="Show filters"
          >
            <span>Filters</span>
            {count > 0 && <span className="filter-count-badge">{count}</span>}
          </button>
        ) : (
          SidebarContent
        )}
      </aside>

      {/* Mobile bottom sheet */}
      {isMobileOpen && (
        <div className="mobile-filter-overlay" onClick={onMobileClose}>
          <div
            className="mobile-filter-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {SidebarContent}
            <div className="mobile-filter-footer">
              <button
                className="btn btn-primary btn-full"
                onClick={onMobileClose}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
