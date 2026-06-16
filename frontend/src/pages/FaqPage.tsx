import { Link } from "react-router-dom";
import "./AboutPage.css";

const FAQ_ITEMS = [
  {
    q: "How does TrackFurb work?",
    a: "TrackFurb monitors the Lenovo Outlet India store and updates its laptop listings automatically every minute. It helps you track price drops, see when items go out of stock, and find the best refurbished deals.",
  },
  {
    q: "Are these laptops brand new?",
    a: "Most laptops listed on the Lenovo Outlet are refurbished or scratch-and-dent units. The condition of each laptop (such as 'Certified Refurbished') is highlighted directly on its card.",
  },
  {
    q: "Why do some laptops show as 'Sold Out'?",
    a: "Lenovo's refurbished stock is highly limited, often with only a single unit available for a specific model. When a laptop is purchased, it is marked as sold out. You can choose to show or hide these using the 'Show sold out' checkbox in the filters sidebar.",
  },
  {
    q: "How do I buy a laptop?",
    a: "For any laptop currently in stock, you can click the 'Buy ↗' button to open its official product page on the Lenovo Outlet India store, where you can check out directly.",
  },
  {
    q: "How do I view the price history of a laptop?",
    a: "Click on any laptop card (or click the 'Details' button) to view the detail page. This displays an interactive price chart showing all price changes since the laptop was first listed.",
  },
  {
    q: "How does the comparison feature work?",
    a: "Check the 'Compare' box on up to 4 laptops. A bar will appear at the bottom of the screen — click 'Compare' to view a side-by-side comparison of their RAM, storage, processor, screen, and price details.",
  },
  {
    q: "What is the Watchlist?",
    a: "You can save laptops by clicking the star icon. Clicking the 'Watchlist' button in the navigation bar will filter the dashboard to display only your starred laptops. This list is saved locally in your web browser.",
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
