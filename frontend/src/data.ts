import { useState, useEffect } from "react";

export type LaptopData = { [key: string]: any };

export type StoredData = {
  laptopData: LaptopData[];
  lastModified: Date | null;
};

export const loadFromStorage = async (): Promise<StoredData> => {
  const response = await fetch("/api/laptops");
  if (!response.ok) {
    throw new Error(`Failed to fetch laptop data: ${response.statusText}`);
  }
  const laptopData = await response.json();
  const dateHeader = response.headers.get("Date");
  const lastModified = dateHeader ? new Date(dateHeader) : new Date();
  return {
    laptopData,
    lastModified: isNaN(lastModified.getTime()) ? new Date() : lastModified,
  };
};

const initialStoredData: StoredData = {
  laptopData: [],
  lastModified: null,
};

export const useData = () => {
  const [data, setData] = useState<StoredData>(initialStoredData);
  const reload = () => loadFromStorage().then(setData);
  useEffect(() => { reload(); }, []);
  return { ...data, reload };
};

export const dataToCsv = (data: LaptopData[]): string => {
  if (!data || data.length === 0) return "";
  const header = Object.keys(data[0]);
  let csv = data.map((row) =>
    header
      .map(
        (fieldName) =>
          `"${(row[fieldName]?.toString() || "").replaceAll('"', '""')}"`
      )
      .join(",")
  );
  csv.unshift(header.join(","));
  return csv.join("\r\n");
};

export const download = (filename: string, data: string): void => {
  const element = document.createElement("a");
  element.setAttribute(
    "href",
    "data:text/plain;charset=utf-8," + encodeURIComponent(data)
  );
  element.setAttribute("download", filename);
  element.style.display = "none";
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
};

export interface FacetItem {
  name: string;
  value: string;
  count: number;
}

export interface FacetGroup {
  facetId: string;
  facetName: string;
  items: FacetItem[];
}

export const loadFilters = async (): Promise<FacetGroup[]> => {
  try {
    const response = await fetch("/api/filters");
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
};

export function cleanGpuName(raw: string | null): string {
  if (!raw) return "Others";
  
  // Remove ® and ™
  let s = raw.replace(/[®™]/g, "");
  // Replace multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  
  // NVIDIA GPUs:
  const nvidiaMatch = s.match(/(GeForce\s+RTX\s*\d{4}(?:\s*Ti)?(?:\s*[A-Z]\b)?|RTX\s*\d{4}(?:\s*Ti)?(?:\s*[A-Z]\b)?|GeForce\s+GTX\s*\d{4}(?:\s*Ti)?|GeForce\s+MX\d{3,5})/i);
  if (nvidiaMatch) {
    let name = nvidiaMatch[1].trim();
    // Normalize casing
    name = name.replace(/geforce/i, "GeForce");
    if (!name.toLowerCase().includes("geforce")) {
      name = "GeForce " + name;
    }
    if (!name.toLowerCase().includes("nvidia")) {
      name = "NVIDIA " + name;
    }
    
    // Extract VRAM info like "4GB GDDR6", "8GB GDDR6", "8GB GDDR7", etc.
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
  
  // AMD Radeon GPUs:
  const amdM_Match = s.match(/(Radeon\s+\d{3,4}M)/i);
  if (amdM_Match) {
    return "AMD " + amdM_Match[1].trim().replace(/\s+/g, " ");
  }
  
  const amdRxMatch = s.match(/(Radeon\s+RX\s*\d{4}(?:\s*S|\s*XT)?)/i);
  if (amdRxMatch) {
    return "AMD " + amdRxMatch[1].trim().replace(/\s+/g, " ");
  }
  
  // Intel Arc:
  if (/arc/i.test(s)) {
    const arcMatch = s.match(/(Arc\s+\d{3,4}\w*)/i);
    if (arcMatch) {
      return "Intel " + arcMatch[1].trim();
    }
    return "Intel Arc Graphics";
  }
  
  // Intel Iris:
  if (/iris/i.test(s)) {
    if (/max/i.test(s)) return "Intel Iris Xe Max";
    return "Intel Iris Xe";
  }
  
  // Intel UHD:
  if (/uhd/i.test(s)) {
    return "Intel UHD Graphics";
  }
  
  if (/intel/i.test(s)) {
    return "Intel Graphics";
  }
  
  if (/radeon/i.test(s)) {
    return "AMD Radeon Graphics";
  }
  
  // Fallback: clean the string by stripping "integrated", "dedicated", "discrete", "laptop gpu"
  let cleaned = s.replace(/(integrated|dedicated|discrete|laptop gpu)/gi, "").replace(/\s+/g, " ").trim();
  return cleaned || "Others";
}
