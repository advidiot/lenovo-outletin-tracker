import { Link } from "react-router-dom";
import "./AboutPage.css";

const FAQ_ITEMS = [
  {
    q: "Why do some rows have no Buy link?",
    a: "Laptops that are out of stock or marked inactive do not have a buy link. They appear in the grid when 'Show sold out' is enabled in the filters.",
  },
  {
    q: "Where is the data stored?",
    a: "All data is self-hosted in a secure SQLite database (lenovo_tracker.db). No external storage services are used — your data stays private.",
  },
  {
    q: "How does the scraper run?",
    a: "The scraper runs automatically as a background daemon thread inside app.py, polling the Lenovo Outlet API every 60 seconds.",
  },
  {
    q: "What is 'Ghost Cleanup'?",
    a: "Lenovo sometimes leaves sold-out listings visible on the index page (ghost listings). Ghost Cleanup queries Lenovo's comparison API in real-time to verify stock status and marks sold-out items inactive.",
  },
  {
    q: "How do I view price history?",
    a: "Click any laptop row (or tap on mobile) to open its full detail page, which shows the complete price history chart.",
  },
  {
    q: "How do I compare laptops?",
    a: "Check the compare checkbox on up to 4 laptops. The floating bar at the bottom will appear — click Compare to open the side-by-side comparison page.",
  },
  {
    q: "What is the Watchlist?",
    a: "Star any laptop to add it to your watchlist. Click the Watchlist button in the navbar to filter the grid to only your starred laptops. Watchlist is saved locally in your browser.",
  },
];

export const FaqPage = () => (
  <div className="static-page">
    <div className="static-page-inner">
      <div className="static-back">
        <Link to="/browse" className="back-link">← Back to TrackFurb</Link>
      </div>

      <h1 className="static-title">FAQ</h1>
      <p className="static-subtitle">Frequently asked questions about TrackFurb.</p>

      <div className="faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div key={i} className="faq-item card">
            <h2 className="faq-question">{item.q}</h2>
            <p className="faq-answer">{item.a}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);
