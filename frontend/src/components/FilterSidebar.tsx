import { useState } from "react";
import "./FilterSidebar.css";

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
}

const SCREEN_SIZES = ["13\"", "14\"", "15.6\"", "16\""];
const RAM_OPTIONS = ["8GB", "16GB", "32GB", "64GB"];
const CPU_BRANDS = ["Intel", "AMD"];
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
}: FilterSidebarProps) => {
  const count = activeFilterCount(filters);

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

        {/* Processor brand */}
        <FilterSection title="Processor">
          <div className="checkbox-group">
            {CPU_BRANDS.map((b) => (
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
