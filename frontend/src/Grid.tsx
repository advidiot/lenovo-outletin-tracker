import { forwardRef, useImperativeHandle, useRef } from "react";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import "./Grid.css";
import { AgGridEvent, ApplyColumnStateParams, ColDef, ColumnState } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";

import { retrieveSettings, saveSettings, clearSettings } from "./gridSettings";
import { LaptopData } from "./data";

interface BuyProps {
  value: string,
  data: LaptopData,
};

const Buy = ({ value, data }: BuyProps) => {
  if (data && data["available"]) {
    return (
      <a
        target="_blank"
        rel="noopener noreferrer"
        href={value}
        onClick={(e) => e.stopPropagation()}
        style={{ color: "var(--accent-teal)", fontWeight: 600, fontSize: "0.8rem" }}
      >
        Buy
      </a>
    );
  } else {
    return null;
  }
};

const CompareCheckbox = (props: any) => {
  const context = props.context || {};
  const compareList = context.compareList || [];
  const toggleCompare = context.toggleCompare || (() => {});
  const data = props.data;
  if (!data) return null;
  const isChecked = compareList.some((item: any) => item["product-number"] === data["product-number"]);
  const isDisabled = compareList.length >= 4 && !isChecked;

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
      <input
        type="checkbox"
        checked={isChecked}
        disabled={isDisabled}
        onChange={() => toggleCompare(data)}
        style={{ cursor: isDisabled ? "not-allowed" : "pointer", accentColor: "var(--accent-teal)" }}
      />
    </div>
  );
};

const StarButton = (props: any) => {
  const context = props.context || {};
  const watchlist = context.watchlist || [];
  const toggleWatch = context.toggleWatch || (() => {});
  const data = props.data;
  if (!data) return null;
  const code = String(data["product-number"]);
  const isStarred = watchlist.includes(code);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        cursor: "pointer",
        fontSize: "1.1rem",
        color: isStarred ? "var(--accent-amber)" : "var(--text-muted)",
      }}
      onClick={(e) => { e.stopPropagation(); toggleWatch(code); }}
    >
      {isStarred ? "★" : "☆"}
    </div>
  );
};


const defaultColDef = {
  sortable: true,
  filter: true,
  resizable: true,
};

const retrieveAndApplySettings = (event: AgGridEvent) => {
  const settings = retrieveSettings();
  if (!settings) {
    return;
  }

  const { filterModel, columnState } = settings;

  if (!filterModel) {
    console.error('filterModel is missing!');
    clearSettings();
    return;
  }

  if (!columnState) {
    console.error('columnState is missing!');
    clearSettings();
    return;
  }

  event.api.setFilterModel(filterModel);

  if (!event.api.applyColumnState({ state: columnState })) {
    console.error('Error applying column state!');
    clearSettings();
  }
};

const onFirstDataRendered = (event: AgGridEvent) => {
  retrieveAndApplySettings(event);
};

const onSortOrFilterChange = ({ api }: AgGridEvent) => {
  const columnState = api.getColumnState();
  const filterModel = api.getFilterModel();

  saveSettings(columnState, filterModel);
};

const memComparator = (aStr: string | null, bStr: string | null) => {
  const cleanString = (str: string | null) => str ? parseInt(str.replace("GB", "")) : 0;
  const a = cleanString(aStr);
  const b = cleanString(bStr);
  if (a === b) return 0;
  return a > b ? 1 : -1;
};

const storageComparator = (aStr: string | null, bStr: string | null) => {
  if (!aStr || !bStr) return 0;
  const cleanString = (str: string) => {
    return str.includes("GB")
      ? parseFloat(str.replace("GB", ""))
      : parseFloat(str.replace("TB", "")) * 1000;
  };
  const a = cleanString(aStr);
  const b = cleanString(bStr);
  if (a === b) return 0;
  return a > b ? 1 : -1;
};

const acAdapterComparator = (aStr: string | null, bStr: string | null) => {
  const cleanValue = (str: string | null) => {
    if (!str) return 0;
    const match = str.match(/(\d+(?:\.\d+)?)\s*W/i);
    return match ? parseFloat(match[1]) : 0;
  };
  const a = cleanValue(aStr);
  const b = cleanValue(bStr);
  if (a === b) return 0;
  return a > b ? 1 : -1;
};

const PriceRenderer = (props: any) => {
  const value = props.value;
  const data = props.data;
  if (!data) return value?.toFixed(2) ?? "";
  
  const priceDelta = Number(data["price-delta"] || 0);
  const formattedPrice = value?.toFixed(2) ?? "";
  
  if (priceDelta < -0.01) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span>{formattedPrice}</span>
        <span 
          style={{ 
            fontSize: "0.7rem", 
            backgroundColor: "rgba(16, 185, 129, 0.2)", 
            color: "#10b981", 
            padding: "1px 4px", 
            borderRadius: "3px", 
            fontWeight: "bold",
            lineHeight: 1,
            marginLeft: "4px"
          }}
          title={`Price dropped by ₹${Math.abs(priceDelta).toFixed(2)}`}
        >
          ↓
        </span>
      </div>
    );
  }
  return <span>{formattedPrice}</span>;
};

const columnDefs: ColDef[] = [
  {
    headerName: "Compare",
    field: "compare",
    width: 65,
    cellRenderer: CompareCheckbox,
    sortable: false,
    filter: false,
    resizable: false,
  },
  {
    headerName: "⭐",
    field: "watchlist",
    width: 45,
    cellRenderer: StarButton,
    sortable: false,
    filter: false,
    resizable: false,
  },
  { headerName: "",
    field: "url",
    width: 44,
    cellRenderer: Buy,
    filter: true,
    filterParams: {
      defaultOption: 'notBlank',
    },
  },
  {
    headerName: "Price",
    field: "price",
    width: 75,
    filter: "agNumberColumnFilter",
    sort: "asc",
    cellRenderer: PriceRenderer,
  },
  { headerName: "Condition", field: "product-condition", width: 70 },
  { headerName: "Model", field: "model" },
  {
    headerName: "Screen Size",
    field: "screen-size",
    width: 70,
    valueFormatter: ({ value }) => value?.toFixed(1) ?? "",
    filter: "agNumberColumnFilter",
  },
  { headerName: "Resolution", field: "resolution", width: 100 },
  { headerName: "Aspect Ratio", field: "screen-aspect-ratio", width: 80 },
  { headerName: "IPS Screen?", field: "screen-has-ips", width: 70 },
  { headerName: "OLED Screen?", field: "screen-has-oled", width: 70 },
  { headerName: "Display", field: "display" },
  {
    headerName: "Memory Size",
    field: "memory-size",
    width: 70,
    comparator: memComparator,
  },
  { headerName: "DDR Gen", field: "ddr-gen", width: 65 },
  { headerName: "Storage Type", field: "storage-type", width: 70 },
  {
    headerName: "Storage Size",
    field: "storage-size",
    width: 70,
    comparator: storageComparator,
  },
  { headerName: "Processor Brand", field: "processor-brand", width: 70 },
  { headerName: "Processor Range", field: "processor-range", width: 80 },
  { headerName: "CPU Gen", field: "processor-generation", width: 85 },
  { headerName: "CPU Series", field: "processor-series", width: 75 },
  { headerName: "Processor", field: "processor" },
  { headerName: "Graphics", field: "graphic-card" },
  { headerName: "GPU Type", field: "gpu-type", width: 75 },
  { headerName: "GPU Name", field: "gpu-name", width: 85 },
  { headerName: "Touchscreen?", field: "touch-screen", width: 70 },
  { headerName: "Memory Soldered?", field: "memory-soldered", width: 70 },
  { headerName: "Camera", field: "camera" },
  { headerName: "WiFi / Bluetooth", field: "wlan" },
  { headerName: "Battery", field: "battery" },
  {
    headerName: "Battery Capacity (Wh)",
    field: "battery-capacity",
    width: 70,
    filter: "agNumberColumnFilter",
  },
  {
    headerName: "AC Adapter",
    field: "ac-adapter",
    width: 70,
    comparator: acAdapterComparator,
  },
  { headerName: "Keyboard", field: "keyboard" },
  { headerName: "Fingerprint Reader", field: "fingerprint-reader" },
  { headerName: "Pointing Device", field: "pointing-device" },
  { headerName: "Color", field: "color" },
  { headerName: "Warranty", field: "warranty" },
  { headerName: "Weight", field: "weight" },
  { headerName: "Operating System", field: "operating-system" },
  {
    headerName: "Original Price",
    field: "orig-price",
    width: 75,
    filter: "agNumberColumnFilter",
    valueFormatter: ({ value }) => value?.toFixed(2) ?? "",
  },
  {
    headerName: "Percentage Savings",
    field: "percentage-savings",
    width: 75,
    filter: "agNumberColumnFilter",
  },
  { headerName: "Product Number", field: "product-number" },
];

const resetColumnState: ColumnState = {
  colId: "price",
  sort: "asc",
};

const resetColumnStateParams: ApplyColumnStateParams = {
  state: [resetColumnState],
  defaultState: {
    hide: null,
    flex: null,
    sort: null,
    sortIndex: null,
    aggFunc: null,
    pivot: null,
    pivotIndex: null,
    pinned: null,
    rowGroup: null,
    rowGroupIndex: null,
  }
};

interface GridProps {
  data: LaptopData[];
  onRowSelected?: (productCode: string, productName: string, available: boolean) => void;
  watchlist: string[];
  toggleWatch: (productCode: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
}

export type GridHandle = {
  resetGrid: () => void;
};

const Grid = forwardRef<GridHandle, GridProps>(({ data, onRowSelected, watchlist, toggleWatch, compareList, toggleCompare }, ref) => {
  const grid = useRef<AgGridReact>(null);

  useImperativeHandle(ref, () => ({
    resetGrid() {
      // No need to clear localStorage because resetting will cause onSortOrFilterChange to fire (and re-save localStorage)
      const gridApi = grid.current?.api;

      if (!gridApi) {
        return;
      }

      gridApi.applyColumnState(resetColumnStateParams);
      gridApi.setFilterModel(null);
    },
  }));

  return (
    <div
      id="table-wrapper"
      className="ag-theme-balham-dark"
      style={{ flex: 1, width: "100%", overflow: "hidden" }}
    >
      <AgGridReact
        ref={grid}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowData={data}
        multiSortKey={"ctrl"}
        suppressCellFocus={true}
        enableCellTextSelection={true}
        onFirstDataRendered={onFirstDataRendered}
        onSortChanged={onSortOrFilterChange}
        onFilterChanged={onSortOrFilterChange}
        context={{
          watchlist,
          toggleWatch,
          compareList,
          toggleCompare,
        }}
        onRowClicked={(event) => {
          if (onRowSelected && event.data) {
            const code = event.data["product-number"] as string;
            const name = event.data["model"] as string;
            const available = event.data["available"] as boolean;
            onRowSelected(code, name, available);
          }
        }}
        rowStyle={{ cursor: "pointer" }}
      />
    </div>
  );
});

export default Grid;
