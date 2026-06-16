import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

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
import { LandingPage } from "./pages/LandingPage";
import { LaptopData, loadFromStorage, loadFilters, FacetGroup } from "./data";
import { useStockCheck } from "./useStockCheck";

const App = () => {
  // ── Single data fetch for the whole app ─────────────────────────────────
  const [laptopData, setLaptopData] = useState<LaptopData[]>([]);
  const [lastModified, setLastModified] = useState<Date | null>(null);
  const [facetGroups, setFacetGroups] = useState<FacetGroup[]>([]);

  useEffect(() => {
    loadFromStorage().then(({ laptopData: d, lastModified: m }) => {
      setLaptopData(d);
      setLastModified(m);
    });
    loadFilters().then(setFacetGroups);
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

    // Sync changes with backend push notifications if subscribed
    import("./push-notifications").then(({ getExistingSubscription, syncWatchlist }) => {
      getExistingSubscription().then((sub) => {
        if (sub) {
          syncWatchlist(sub.endpoint, watchlist).catch((err) =>
            console.error("Failed to sync watchlist change with push subscription:", err)
          );
        }
      });
    });
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
          <AppContent
            laptopData={laptopData}
            lastModified={lastModified}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            watchlist={watchlist}
            toggleWatch={toggleWatch}
            compareList={compareList}
            toggleCompare={toggleCompare}
            clearCompare={() => setCompareList([])}
            facetGroups={facetGroups}
          />
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
};

interface AppContentProps {
  laptopData: LaptopData[];
  lastModified: Date | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  watchlist: string[];
  toggleWatch: (code: string) => void;
  compareList: LaptopData[];
  toggleCompare: (laptop: LaptopData) => void;
  clearCompare: () => void;
  facetGroups: FacetGroup[];
}

const AppContent = ({
  laptopData,
  lastModified,
  searchQuery,
  setSearchQuery,
  watchlist,
  toggleWatch,
  compareList,
  toggleCompare,
  clearCompare,
  facetGroups,
}: AppContentProps) => {
  const location = useLocation();
  const showNavbar = location.pathname !== "/";
  const { checkStock, stockResults } = useStockCheck();

  return (
    <>
      {showNavbar && (
        <Navbar
          watchlistCount={watchlist.length}
          onSearch={setSearchQuery}
          searchQuery={searchQuery}
        />
      )}
      <main className={showNavbar ? "app-main" : ""}>
        <Routes>
          <Route
            path="/"
            element={
              <LandingPage
                laptopData={laptopData}
              />
            }
          />
          <Route
            path="/browse"
            element={
              <DashboardPage
                laptopData={laptopData}
                lastModified={lastModified}
                searchQuery={searchQuery}
                watchlist={watchlist}
                toggleWatch={toggleWatch}
                compareList={compareList}
                toggleCompare={toggleCompare}
                facetGroups={facetGroups}
                checkStock={checkStock}
                stockResults={stockResults}
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
                checkStock={checkStock}
                stockResults={stockResults}
              />
            }
          />
          <Route
            path="/compare"
            element={
              <ComparePage
                compareList={compareList}
                onRemove={toggleCompare}
                onClear={clearCompare}
              />
            }
          />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/faq" element={<FaqPage />} />
        </Routes>
      </main>
    </>
  );
};

export default App;
