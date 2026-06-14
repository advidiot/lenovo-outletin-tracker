import { Link } from "react-router-dom";
import "./AboutPage.css";

export const AboutPage = () => (
  <div className="static-page">
    <div className="static-page-inner">
      <div className="static-back">
        <Link to="/browse" className="back-link">← Back to TrackFurb</Link>
      </div>

      <h1 className="static-title">About TrackFurb</h1>

      <div className="about-icon">🔍</div>

      <div className="static-content">
        <p>
          When I wanted to buy a refurbished ThinkPad, I found the existing tools lacking —
          I couldn't filter for specs that mattered to me, like screen resolution, size,
          or whether a laptop had an IPS panel.
        </p>

        <p>
          So I built <strong>TrackFurb</strong> — a tracker and price monitor for the{" "}
          <a
            href="https://www.lenovo.com/in/outletin/en/laptops/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Lenovo Outlet India
          </a>{" "}
          store. Filter by any spec, sort by anything, watch price history over time, compare
          laptops side-by-side, and get notified when deals drop.
        </p>

        <p>
          All data is stored locally in a SQLite database. No external services, no tracking,
          fully self-hosted.
        </p>
      </div>

      <div className="about-features">
        <div className="about-feature card">
          <span className="about-feature-icon">📊</span>
          <div>
            <strong>Price History</strong>
            <p>Track how prices change over time with interactive charts.</p>
          </div>
        </div>
        <div className="about-feature card">
          <span className="about-feature-icon">🔎</span>
          <div>
            <strong>Advanced Filtering</strong>
            <p>Filter by RAM, screen size, processor, condition, and more.</p>
          </div>
        </div>
        <div className="about-feature card">
          <span className="about-feature-icon">⚖️</span>
          <div>
            <strong>Side-by-Side Compare</strong>
            <p>Compare up to 4 laptops simultaneously with highlighted best values.</p>
          </div>
        </div>
        <div className="about-feature card">
          <span className="about-feature-icon">⭐</span>
          <div>
            <strong>Watchlist</strong>
            <p>Star laptops to track them — persisted locally in your browser.</p>
          </div>
        </div>
      </div>

      <div className="static-footer-note">
        TrackFurb v2.0 — Lenovo Outlet India Laptop Tracker
      </div>
    </div>
  </div>
);
