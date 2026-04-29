import { useState, useEffect } from "react";
import { useCreateMarket, useRegisteredOracles } from "../hooks/useMarket";
import { CATEGORIES } from "../App";
import type { CategoryId } from "../App";

// Assets from v1
import createMarketIcon from "../assets/marsu/create-market.jpeg";
import successIcon from "../assets/marsu/success.jpeg";
import pendingIcon from "../assets/marsu/pending.jpeg";

interface CreateMarketProps {
  onSuccess?: () => void;
}

export function CreateMarket({ onSuccess }: CreateMarketProps) {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<CategoryId>("other");
  const [durationDays, setDurationDays] = useState(7);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedOracles, setSelectedOracles] = useState<string[]>([]);

  const createMarket = useCreateMarket();
  const { data: registeredOracles, isLoading: oraclesLoading } = useRegisteredOracles();

  // Auto-select first 3 oracles when they load
  useEffect(() => {
    if (registeredOracles && registeredOracles.length >= 3 && selectedOracles.length === 0) {
      setSelectedOracles(registeredOracles.slice(0, 3).map(o => o.address));
    }
  }, [registeredOracles, selectedOracles.length]);

  const toggleOracle = (address: string) => {
    setSelectedOracles(prev => {
      if (prev.includes(address)) {
        return prev.filter(a => a !== address);
      }
      if (prev.length < 3) {
        return [...prev, address];
      }
      return prev;
    });
  };

  const selectableCategories = CATEGORIES.filter(c => c.id !== "all");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    if (selectedOracles.length !== 3) return;

    // Prepend category tag to question
    const fullQuestion = `[${category}] ${question.trim()}`;

    createMarket.mutate(
      { question: fullQuestion, durationDays, oracles: selectedOracles },
      {
        onSuccess: () => {
          setQuestion("");
          setCategory("other");
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            onSuccess?.();
          }, 2000);
        },
      }
    );
  };

  if (showSuccess) {
    return (
      <div className="create-market-page">
        <div className="card create-market-form success-state">
          <img src={successIcon} alt="Success" className="success-icon" />
          <h2>Market Created!</h2>
          <p>Your prediction market is now live.</p>
          <p className="hint">Redirecting to markets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="create-market-page">
      <div className="card create-market-form">
        <div className="form-header">
          <img src={createMarketIcon} alt="" className="form-header-icon" />
          <div>
            <h2>Create New Market</h2>
            <p className="form-subtitle">Start a prediction market and let the crowd decide</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Category</label>
            <div className="category-select">
              {selectableCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`category-option ${category === cat.id ? "selected" : ""}`}
                  onClick={() => setCategory(cat.id)}
                  style={{ backgroundImage: `url(${cat.icon})` }}
                >
                  <span className="category-option-label">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Question</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={getPlaceholder(category)}
              maxLength={500}
              required
            />
            <p className="form-hint">Ask a yes/no question that can be resolved objectively</p>
          </div>

          <div className="form-group">
            <label>Betting Duration (Days)</label>
            <input
              type="number"
              min={1}
              max={30}
              value={durationDays}
              onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
              className="duration-input"
            />
          </div>

          <div className="form-group">
            <label>Oracles ({selectedOracles.length}/3 selected)</label>
            {oraclesLoading ? (
              <p className="form-hint">Loading oracles...</p>
            ) : !registeredOracles || registeredOracles.length < 3 ? (
              <p className="error">Not enough registered oracles. Need at least 3.</p>
            ) : (
              <div className="oracle-select">
                {registeredOracles.map((oracle) => (
                  <button
                    key={oracle.address}
                    type="button"
                    className={`oracle-option ${selectedOracles.includes(oracle.address) ? "selected" : ""}`}
                    onClick={() => toggleOracle(oracle.address)}
                    disabled={!selectedOracles.includes(oracle.address) && selectedOracles.length >= 3}
                  >
                    <span className="oracle-address">
                      {oracle.address.slice(0, 6)}...{oracle.address.slice(-4)}
                    </span>
                    <span className="oracle-stats">
                      {oracle.stake} ROSE · {oracle.successfulResolutions} wins
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button
              type="submit"
              disabled={createMarket.isPending || !question.trim() || selectedOracles.length !== 3}
              className="btn btn-primary btn-large"
            >
              {createMarket.isPending ? (
                <>
                  <img src={pendingIcon} alt="" className="btn-icon spinning" />
                  Creating...
                </>
              ) : (
                <>
                  <img src={createMarketIcon} alt="" className="btn-icon" />
                  Create Market
                </>
              )}
            </button>
          </div>

          {createMarket.isError && (
            <p className="error">Error: {(createMarket.error as Error).message}</p>
          )}
        </form>
      </div>
    </div>
  );
}

function getPlaceholder(category: CategoryId): string {
  switch (category) {
    case "sports":
      return "Will the Celtics win the NBA Championship?";
    case "politics":
      return "Will the incumbent win the election?";
    case "boston":
      return "Will it snow tomorrow in Boston?";
    case "blockchain":
      return "Will ETH gas stay low?";
    default:
      return "Will something happen?";
  }
}
