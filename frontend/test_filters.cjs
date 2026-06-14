// Standalone validation script for TrackFurb filters matching logic
const assert = require("assert");

// Copy of cleanGpuName from frontend/src/data.ts
function cleanGpuName(raw) {
  if (!raw) return "Others";
  
  let s = raw.replace(/[®™]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  
  const nvidiaMatch = s.match(/(GeForce\s+RTX\s*\d{4}(?:\s*Ti)?(?:\s*[A-Z]\b)?|RTX\s*\d{4}(?:\s*Ti)?(?:\s*[A-Z]\b)?|GeForce\s+GTX\s*\d{4}(?:\s*Ti)?|GeForce\s+MX\d{3,5})/i);
  if (nvidiaMatch) {
    let name = nvidiaMatch[1].trim();
    name = name.replace(/geforce/i, "GeForce");
    if (!name.toLowerCase().includes("geforce")) {
      name = "GeForce " + name;
    }
    if (!name.toLowerCase().includes("nvidia")) {
      name = "NVIDIA " + name;
    }
    
    const vramMatch = s.match(/(\d+\s*GB\s*GDDR\d)/i);
    if (vramMatch) {
      name += " " + vramMatch[1].toUpperCase().trim();
    } else {
      const plainVramMatch = s.match(/(\d+\s*GB)/i);
      if (plainVramMatch) {
        name += " " + plainVramMatch[1].toUpperCase().trim();
      }
    }
    return name;
  }
  
  const amdM_Match = s.match(/(Radeon\s+\d{3,4}M)/i);
  if (amdM_Match) {
    return "AMD " + amdM_Match[1].trim().replace(/\s+/g, " ");
  }
  
  const amdRxMatch = s.match(/(Radeon\s+RX\s*\d{4}(?:\s*S|\s*XT)?)/i);
  if (amdRxMatch) {
    return "AMD " + amdRxMatch[1].trim().replace(/\s+/g, " ");
  }
  
  if (/arc/i.test(s)) {
    const arcMatch = s.match(/(Arc\s+\d{3,4}\w*)/i);
    if (arcMatch) {
      return "Intel " + arcMatch[1].trim();
    }
    return "Intel Arc Graphics";
  }
  
  if (/iris/i.test(s)) {
    if (/max/i.test(s)) return "Intel Iris Xe Max";
    return "Intel Iris Xe";
  }
  
  if (/uhd/i.test(s)) {
    return "Intel UHD Graphics";
  }
  
  if (/intel/i.test(s)) {
    return "Intel Graphics";
  }
  
  if (/radeon/i.test(s)) {
    return "AMD Radeon Graphics";
  }
  
  let cleaned = s.replace(/(integrated|dedicated|discrete|laptop gpu)/gi, "").replace(/\s+/g, " ").trim();
  return cleaned || "Others";
}

// Copy of helpers from frontend/src/pages/DashboardPage.tsx
function parseWeight(weightStr) {
  if (!weightStr) return null;
  const match = weightStr.toLowerCase().match(/([\d\.]+)\s*kg/);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

function matchWeightRange(weightKg, selectedRange) {
  const cleanRange = selectedRange.replace(/\s+/g, "").toLowerCase();
  const match = cleanRange.match(/([\d\.]+)kg-([\d\.]+)kg/);
  if (match) {
    const min = parseFloat(match[1]);
    const max = parseFloat(match[2]);
    return weightKg >= min && weightKg <= max;
  }
  return false;
}

function applyFilters(data, filters) {
  return data.filter((laptop) => {
    if (!filters.showUnavailable && !laptop["available"]) return false;

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

    return true;
  });
}

// ----------------------------------------------------
// Mock Data for Testing
// ----------------------------------------------------
const mockLaptops = [
  {
    product_code: "1111",
    model: "LOQ 15IRH8",
    brand: "LOQ",
    available: true,
    "graphic-card": "NVIDIA® GeForce RTX™ 4060 Laptop GPU 8GB GDDR6",
    "storage-size": "512GB",
    "operating-system": "Windows 11 Home 64",
    weight: "2.4 kg",
    "touch-screen": false,
    full_specs: {
      Color: "Storm Grey",
      "Fingerprint Reader": "Fingerprint Reader Style"
    }
  },
  {
    product_code: "2222",
    model: "Yoga 7 2-in-1 14AHP9",
    brand: "Yoga",
    available: true,
    "graphic-card": "Integrated AMD Radeon™ 680M",
    "storage-size": "1TB",
    "operating-system": "Windows 11 Pro 64",
    weight: "1.45 kg",
    "touch-screen": true,
    full_specs: {
      Color: "Arctic Grey",
      "Pointing Device": "Trackpoint style Keyboard"
    }
  },
  {
    product_code: "3333",
    model: "IdeaPad Slim 3 15IAH8",
    brand: "IdeaPad",
    available: true,
    "graphic-card": "Integrated Intel® UHD Graphics",
    "storage-size": "512GB",
    "operating-system": "Windows 11 Home 64",
    weight: "1.62 kg",
    "touch-screen": false,
    full_specs: {
      Color: "Abyss Blue"
    }
  }
];

// ----------------------------------------------------
// Test Cases Execution
// ----------------------------------------------------
console.log("Starting filter matching tests...");

// Test 1: cleanGpuName Casing & Formatting
assert.strictEqual(cleanGpuName("NVIDIA® GeForce RTX™ 3050 Laptop GPU 4GB GDDR6"), "NVIDIA GeForce RTX 3050 4GB GDDR6");
assert.strictEqual(cleanGpuName("Integrated AMD Radeon™ 610M"), "AMD Radeon 610M");
assert.strictEqual(cleanGpuName("Integrated Intel® Arc™ 140V GPU"), "Intel Arc 140V");
assert.strictEqual(cleanGpuName("NVIDIA® Geforce RTX™ 5070 Ti Laptop GPU 12GB GDDR7"), "NVIDIA GeForce RTX 5070 Ti 12GB GDDR7");
console.log("✓ Test 1 Passed: cleanGpuName formatting is correct.");

// Test 2: GPU Model Filtering
const gpuFiltered = applyFilters(mockLaptops, { showUnavailable: true, gpuModels: ["NVIDIA GeForce RTX 4060 8GB GDDR6"] });
assert.strictEqual(gpuFiltered.length, 1);
assert.strictEqual(gpuFiltered[0].product_code, "1111");
console.log("✓ Test 2 Passed: GPU Model filter correctly matches RTX 4060.");

// Test 3: Weight Range Filtering
const weightFiltered = applyFilters(mockLaptops, { showUnavailable: true, weights: ["1.5kg - 2kg"] });
assert.strictEqual(weightFiltered.length, 1);
assert.strictEqual(weightFiltered[0].product_code, "3333"); // 1.62 kg
console.log("✓ Test 3 Passed: Weight range matching is correct.");

// Test 4: Brand / Series Filtering
const brandFiltered = applyFilters(mockLaptops, { showUnavailable: true, brands: ["Yoga"] });
assert.strictEqual(brandFiltered.length, 1);
assert.strictEqual(brandFiltered[0].product_code, "2222");

const seriesFiltered = applyFilters(mockLaptops, { showUnavailable: true, series: ["Yoga 2-in-1 Series"] });
assert.strictEqual(seriesFiltered.length, 1);
assert.strictEqual(seriesFiltered[0].product_code, "2222");
console.log("✓ Test 4 Passed: Brand & Series filters match correctly.");

// Test 5: Features Filtering (Fingerprint & Trackpoint)
const fpFiltered = applyFilters(mockLaptops, { showUnavailable: true, features: ["Fingerprint Reader"] });
assert.strictEqual(fpFiltered.length, 1);
assert.strictEqual(fpFiltered[0].product_code, "1111");

const tpFiltered = applyFilters(mockLaptops, { showUnavailable: true, features: ["TrackPoint"] });
assert.strictEqual(tpFiltered.length, 1);
assert.strictEqual(tpFiltered[0].product_code, "2222");
console.log("✓ Test 5 Passed: Features matching (Fingerprint & TrackPoint) is correct.");

// Test 6: Storage Size & OS Filtering
const storeFiltered = applyFilters(mockLaptops, { showUnavailable: true, storageSizes: ["1 TB"] });
assert.strictEqual(storeFiltered.length, 1);
assert.strictEqual(storeFiltered[0].product_code, "2222");

const osFiltered = applyFilters(mockLaptops, { showUnavailable: true, operatingSystems: ["Windows 11 Pro 64"] });
assert.strictEqual(osFiltered.length, 1);
assert.strictEqual(osFiltered[0].product_code, "2222");
console.log("✓ Test 6 Passed: Storage size and Operating System filters match correctly.");

// ----------------------------------------------------
// URL Serialization / Deserialization Logic
// ----------------------------------------------------
const DEFAULT_FILTERS = {
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

function parseFiltersFromSearchParams(params) {
  const parseArray = (key) => {
    const val = params.get(key);
    return val ? val.split(",").filter(Boolean) : [];
  };

  const parseNumber = (key, defaultValue) => {
    const val = params.get(key);
    return val ? parseInt(val, 10) : defaultValue;
  };

  const parseBoolean = (key) => {
    return params.get(key) === "1";
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

function serializeFiltersToSearchParams(filters, currentParams) {
  const newParams = new URLSearchParams(currentParams);

  const setArray = (key, arr) => {
    if (arr && arr.length > 0) {
      newParams.set(key, arr.join(","));
    } else {
      newParams.delete(key);
    }
  };

  const setNumber = (key, val, defaultVal) => {
    if (val !== undefined && val !== defaultVal) {
      newParams.set(key, String(val));
    } else {
      newParams.delete(key);
    }
  };

  const setBoolean = (key, val) => {
    if (val) {
      newParams.set(key, "1");
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

// Test 7: URL Serialization & Deserialization
const testFilters = {
  ...DEFAULT_FILTERS,
  priceMin: 10000,
  brands: ["Yoga", "LOQ"],
  touchscreenOnly: true,
};

const initialParams = new URLSearchParams("watchlist=1&other=test");
const serialized = serializeFiltersToSearchParams(testFilters, initialParams);

// Verify other query parameters are preserved
assert.strictEqual(serialized.get("watchlist"), "1");
assert.strictEqual(serialized.get("other"), "test");

// Verify serialized values
assert.strictEqual(serialized.get("priceMin"), "10000");
assert.strictEqual(serialized.get("priceMax"), null); // default value, should be omitted
assert.strictEqual(serialized.get("brands"), "Yoga,LOQ");
assert.strictEqual(serialized.get("touchscreenOnly"), "1");
assert.strictEqual(serialized.get("showUnavailable"), null);

// Roundtrip validation
const parsed = parseFiltersFromSearchParams(serialized);
assert.deepStrictEqual(parsed, testFilters);

console.log("✓ Test 7 Passed: URL parameter serialization and roundtrip validation succeeded.");

console.log("\nALL FILTER TESTS COMPLETED SUCCESSFULLY!");

