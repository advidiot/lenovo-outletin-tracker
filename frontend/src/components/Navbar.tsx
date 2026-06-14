import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "./ThemeProvider";
import "./Navbar.css";

interface NavbarProps {
  watchlistCount: number;
  onSearch: (query: string) => void;
  searchQuery: string;
}

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const StarIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const MenuIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);

const XIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

export const Navbar = ({ watchlistCount, onSearch, searchQuery }: NavbarProps) => {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Left: Logo */}
        <Link to="/browse" className="navbar-brand" onClick={() => setMobileMenuOpen(false)}>
          <div className="navbar-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="var(--accent-teal)"/>
              <path d="M7 8h10M7 12h6M7 16h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="navbar-brand-text">TrackFurb</span>
        </Link>

        {/* Center: Search */}
        <div className="navbar-search">
          <div className="search-input-wrap">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search laptops…"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="search-input"
              aria-label="Search laptops"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => onSearch("")} aria-label="Clear search">×</button>
            )}
          </div>
        </div>

        {/* Right: Controls */}
        <div className="navbar-actions">
          <button
            className="navbar-icon-btn"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>

          <button
            className={`navbar-watchlist-btn ${watchlistCount > 0 ? "has-items" : ""}`}
            onClick={() => navigate("/browse?watchlist=1")}
            aria-label={`Watchlist (${watchlistCount} items)`}
          >
            <StarIcon filled={watchlistCount > 0} />
            <span>Watchlist</span>
            {watchlistCount > 0 && (
              <span className="watchlist-badge">{watchlistCount}</span>
            )}
          </button>

          <Link to="/about" className="navbar-link">About</Link>
          <Link to="/faq" className="navbar-link">FAQ</Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="navbar-hamburger"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <XIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-menu">
          <div className="mobile-search">
            <div className="search-input-wrap">
              <SearchIcon />
              <input
                type="text"
                placeholder="Search laptops…"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className="search-input"
              />
              {searchQuery && (
                <button className="search-clear" onClick={() => onSearch("")}>×</button>
              )}
            </div>
          </div>
          <button
            className="mobile-menu-item"
            onClick={() => { navigate("/browse?watchlist=1"); setMobileMenuOpen(false); }}
          >
            <StarIcon filled={watchlistCount > 0} />
            Watchlist ({watchlistCount})
          </button>
          <Link to="/about" className="mobile-menu-item" onClick={() => setMobileMenuOpen(false)}>About</Link>
          <Link to="/faq" className="mobile-menu-item" onClick={() => setMobileMenuOpen(false)}>FAQ</Link>
          <button className="mobile-menu-item" onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}>
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
        </div>
      )}
    </nav>
  );
};
