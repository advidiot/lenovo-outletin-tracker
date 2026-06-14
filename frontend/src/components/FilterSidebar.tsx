import { useState, useMemo } from "react";
import "./FilterSidebar.css";
import { FacetGroup } from "../data";

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
}

const SCREEN_SIZES = ["13\"", "14\"", "15.6\"", "16\""];
const RAM_OPTIONS = ["8GB", "16GB", "32GB", "64GB"];
const CONDITIONS = ["New", "Refurbished", "Certified Refurbished"];
const GPU_TYPES = ["Integrated", "Dedicated"];
const STORAGE_TYPES = ["SSD (NVMe)", "SSD (SATA)", "SSD", "HDD", "eMMC", "Multi"];
const DDR_GENS = ["DDR4", "DDR5", "LPDDR4", "LPDDR4X", "LPDDR5", "LPDDR5X"];

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
  (f.showUnavailable ? 1 : 0);

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
}: FilterSidebarProps) => {
  const count = activeFilterCount(filters);

  const cpuOptions = useMemo(() => {
    const procFacet = facetGroups.find((g) => g.facetId === "4374");
    return procFacet ? procFacet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const brandOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4376");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const seriesOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4432");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const storageSizeOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4375");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const osOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4372");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const weightOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4570");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const featureOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4571");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const colorOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4373");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const byTypeOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4383");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

  const byUseOptions = useMemo(() => {
    const facet = facetGroups.find((g) => g.facetId === "4568");
    return facet ? facet.items.map((it) => it.name) : [];
  }, [facetGroups]);

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
