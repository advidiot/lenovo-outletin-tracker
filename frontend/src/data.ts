import { useState, useEffect } from "react";

export type LaptopData = { [key: string]: string | number | boolean | null };

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
