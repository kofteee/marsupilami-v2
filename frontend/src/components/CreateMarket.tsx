import { useState } from "react";
import { useCreateMarket } from "../hooks/useMarket";
import createMarketIcon from "../assets/marsu/create-market.jpeg";
import successIcon from "../assets/marsu/success.jpeg";
import pendingIcon from "../assets/marsu/pending.jpeg";

export function CreateMarket() {
  const [question, setQuestion] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [isOpen, setIsOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const createMarket = useCreateMarket();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    createMarket.mutate(
      { question: question.trim(), durationDays },
      {
        onSuccess: () => {
          setQuestion("");
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            setIsOpen(false);
          }, 2000);
        },
      }
    );
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="btn btn-create create-market-btn">
        <img src={createMarketIcon} alt="" className="btn-icon" />
        Create Market
      </button>
    );
  }

  if (showSuccess) {
    return (
      <div className="card create-market-form success-state">
        <img src={successIcon} alt="Success" className="success-icon" />
        <h2>Market Created!</h2>
        <p>Your prediction market is now live.</p>
      </div>
    );
  }

  return (
    <div className="card create-market-form">
      <div className="form-header">
        <img src={createMarketIcon} alt="" className="form-header-icon" />
        <h2>Create New Market</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will ETH reach $10,000 by end of 2026?"
            maxLength={500}
            required
          />
        </div>

        <div className="form-group">
          <label>Betting Duration (days)</label>
          <input
            type="number"
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
            min={1}
            max={30}
            required
          />
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMarket.isPending}
            className="btn btn-primary"
          >
            {createMarket.isPending ? (
              <>
                <img src={pendingIcon} alt="" className="btn-icon spinning" />
                Creating...
              </>
            ) : (
              "Create Market"
            )}
          </button>
        </div>

        {createMarket.isError && (
          <p className="error">Error: {(createMarket.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}
