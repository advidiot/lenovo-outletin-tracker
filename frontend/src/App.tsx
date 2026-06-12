import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import "./theme.css";
import "./index.css";
import "./App.css";

import { ThemeProvider } from "./components/ThemeProvider";
import { ToastProvider } from "./components/ToastProvider";
import { Navbar } from "./components/Navbar";
import { DashboardPage } from "./pages/DashboardPage";
import { LaptopDetailPage } from "./pages/LaptopDetailPage";
import { ComparePage } from "./pages/ComparePage";
import { AboutPage } from "./pages/AboutPage";
import { FaqPage } from "./pages/FaqPage";
import { LaptopData, loadFromStorage } from "./data";

const App = () => {
  // ── Single data fetch for the whole app ─────────────────────────────────
  const [laptopData, setLaptopData] = useState<LaptopData[]>([]);
  const [lastModified, setLastModified] = useState<Date | null>(null);

  useEffect(() => {
    loadFromStorage().then(({ laptopData: d, lastModified: m }) => {
      setLaptopData(d);
      setLastModified(m);
    });
  }, []);

  // ── Watchlist (persisted) ────────────────────────────────────────────────
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("trackfurb_watchlist");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("trackfurb_watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  const toggleWatch = useCallback((code: string) => {
    setWatchlist((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  // ── Comparison list (in-memory, max 4) ──────────────────────────────────
  const [compareList, setCompareList] = useState<LaptopData[]>([]);

  const toggleCompare = useCallback((laptop: LaptopData) => {
    setCompareList((prev) => {
      const exists = prev.some(
        (item) => item["product-number"] === laptop["product-number"]
      );
      if (exists) {
        return prev.filter(
          (item) => item["product-number"] !== laptop["product-number"]
        );
      }
      if (prev.length >= 4) return prev;
      return [...prev, laptop];
    });
  }, []);

  // ── Global search ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Navbar
            watchlistCount={watchlist.length}
            onSearch={setSearchQuery}
            searchQuery={searchQuery}
          />
          <main className="app-main">
            <Routes>
              <Route
                path="/"
                element={
                  <DashboardPage
                    laptopData={laptopData}
                    lastModified={lastModified}
                    searchQuery={searchQuery}
                    watchlist={watchlist}
                    toggleWatch={toggleWatch}
                    compareList={compareList}
                    toggleCompare={toggleCompare}
                  />
                }
              />
              <Route
                path="/laptop/:productNumber"
                element={
                  <LaptopDetailPage
                    allLaptops={laptopData}
                    watchlist={watchlist}
                    toggleWatch={toggleWatch}
                    compareList={compareList}
                    toggleCompare={toggleCompare}
                  />
                }
              />
              <Route
                path="/compare"
                element={
                  <ComparePage
                    compareList={compareList}
                    onRemove={toggleCompare}
                    onClear={() => setCompareList([])}
                  />
                }
              />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/faq" element={<FaqPage />} />
            </Routes>
          </main>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;
