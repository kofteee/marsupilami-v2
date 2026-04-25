import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "./components/Header";
import { Market } from "./components/Market";
import { CreateMarket } from "./components/CreateMarket";
import { LiveFeed } from "./components/LiveFeed";
import { useMarkets } from "./hooks/useMarket";
import spottedPattern from "./assets/marsu/spotted-pattern.jpeg";
import logo from "./assets/marsu/logo.jpeg";
import "./App.css";

const queryClient = new QueryClient();

export const CATEGORIES = [
  { id: "all", label: "All Markets", icon: "🎯" },
  { id: "sports", label: "Sports", icon: "⚽" },
  { id: "politics", label: "Politics", icon: "🏛️" },
  { id: "boston", label: "Boston", icon: "🦞" },
  { id: "blockchain", label: "Blockchain Course", icon: "⛓️" },
  { id: "other", label: "Other", icon: "🌟" },
] as const;

export type CategoryId = typeof CATEGORIES[number]["id"];

export function parseCategory(question: string): { category: CategoryId; cleanQuestion: string } {
  const match = question.match(/^\[(\w+)\]\s*/i);
  if (match) {
    const categoryTag = match[1].toLowerCase();
    const cleanQuestion = question.slice(match[0].length);
    const category = CATEGORIES.find(c => c.id === categoryTag);
    if (category) {
      return { category: category.id, cleanQuestion };
    }
  }
  return { category: "other", cleanQuestion: question };
}

interface MarketListProps {
  selectedCategory: CategoryId;
}

function MarketList({ selectedCategory }: MarketListProps) {
  const { data: markets, isLoading, error } = useMarkets();

  if (isLoading) {
    return (
      <div className="loading">
        <img src={logo} alt="" className="loading-icon" />
        <span>Loading markets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <p>Error loading markets.</p>
        <p className="error-hint">Make sure you're connected to the right network and contracts are deployed.</p>
      </div>
    );
  }

  if (!markets || markets.length === 0) {
    return (
      <div className="no-markets">
        <img src={logo} alt="" className="empty-icon" />
        <p>No markets yet.</p>
        <p className="hint">Go to "Create Market" tab to create one!</p>
      </div>
    );
  }

  return (
    <div className="markets-grid">
      {markets.map((address) => (
        <Market key={address} address={address} categoryFilter={selectedCategory} />
      ))}
    </div>
  );
}

function MarketsTab() {
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("all");

  return (
    <div className="markets-tab">
      <LiveFeed />
      <div className="category-filters">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`category-btn ${selectedCategory === category.id ? "active" : ""}`}
            onClick={() => setSelectedCategory(category.id)}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-label">{category.label}</span>
          </button>
        ))}
      </div>
      <MarketList selectedCategory={selectedCategory} />
    </div>
  );
}

type TabId = "markets" | "create";

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("markets");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <Header />

        <nav className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === "markets" ? "active" : ""}`}
            onClick={() => setActiveTab("markets")}
          >
            <span className="tab-icon">📊</span>
            Open Markets
          </button>
          <button
            className={`tab-btn ${activeTab === "create" ? "active" : ""}`}
            onClick={() => setActiveTab("create")}
          >
            <span className="tab-icon">✨</span>
            Create Market
          </button>
        </nav>

        <main>
          {activeTab === "markets" && <MarketsTab />}
          {activeTab === "create" && <CreateMarket onSuccess={() => setActiveTab("markets")} />}
        </main>

        <footer>
          <div
            className="footer-pattern"
            style={{ backgroundImage: `url(${spottedPattern})` }}
          />
          <div className="footer-content">
            <p>
              Built on{" "}
              <a href="https://oasisprotocol.org/sapphire" target="_blank" rel="noopener noreferrer">
                Oasis Sapphire
              </a>
            </p>
            <p className="footer-tagline">Your bets are private. Your wins are yours.</p>
          </div>
        </footer>
      </div>
    </QueryClientProvider>
  );
}

export default App;
