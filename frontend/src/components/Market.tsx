import { useState, useEffect } from "react";
import { useMarketInfo, useMyPosition, usePlaceBet, useClaim, useDemoState } from "../hooks/useMarket";
import { parseCategory, CATEGORIES } from "../App";
import type { CategoryId } from "../App";
import openMarket from "../assets/marsu/open-market.jpeg";
import closedMarket from "../assets/marsu/closed-market.jpeg";
import resolvedMarket from "../assets/marsu/resolved-market.jpeg";
import yesFruit from "../assets/marsu/yes-fruit.jpeg";
import noFruit from "../assets/marsu/no-fruit.jpeg";
import yesButton from "../assets/marsu/yes-button.jpeg";
import noButton from "../assets/marsu/no-button.jpeg";
import positionFrame from "../assets/marsu/position-frame.jpeg";
import claimRewards from "../assets/marsu/claim-rewards.jpeg";

const STATES = ["Open", "Closed", "Resolved", "Cancelled"];
const OUTCOMES = ["Unresolved", "YES", "NO", "Invalid"];
const STATUS_ICONS = [openMarket, closedMarket, resolvedMarket, closedMarket];

interface MarketProps {
  address: string;
  categoryFilter?: CategoryId;
}

export function Market({ address, categoryFilter = "all" }: MarketProps) {
  const { data: market, isLoading, error } = useMarketInfo(address);
  const { data: position } = useMyPosition(address);
  const placeBet = usePlaceBet(address);
  const claim = useClaim(address);

  const { data: demo } = useDemoState();
  const [amount, setAmount] = useState("0.1");

  // Tick every second so oddsUnknown re-evaluates in real time
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const oddsUnknown = demo
    ? (Date.now() - new Date(demo.startedAt).getTime()) / 1000 < demo.oddsUpdateMin * 60
    : false;

  if (isLoading) return <div className="card loading-card">Loading market...</div>;
  if (error) return <div className="card error">Error loading market</div>;
  if (!market) return null;

  const { category, cleanQuestion } = parseCategory(market.question);
  const categoryInfo = CATEGORIES.find(c => c.id === category);

  // Filter by category if not "all"
  if (categoryFilter !== "all" && category !== categoryFilter) {
    return null;
  }

  const deadline = new Date(market.bettingDeadline * 1000);
  const isOpen = market.state === 0 && Date.now() < deadline.getTime();
  const isResolved = market.state === 2;
  const hasPosition = position && (parseFloat(position.yesAmount) > 0 || parseFloat(position.noAmount) > 0);

  return (
    <div className="card market-card">
      <div className="market-header">
        <img
          src={STATUS_ICONS[market.state]}
          alt={STATES[market.state]}
          className="market-status-icon"
        />
        <div className="market-header-content">
          <h2>{cleanQuestion}</h2>
          {categoryInfo && (
            <span className={`category-badge category-${category}`}>
              {categoryInfo.icon} {categoryInfo.label}
            </span>
          )}
        </div>
      </div>

      <div className="market-status">
        <span className={`status-badge status-${STATES[market.state].toLowerCase()}`}>
          {STATES[market.state]}
        </span>
        {isResolved && (
          <span className={`outcome-badge outcome-${OUTCOMES[market.outcome].toLowerCase()}`}>
            {OUTCOMES[market.outcome]}
          </span>
        )}
      </div>

      <div className="market-info">
        <p>Deadline: {deadline.toLocaleString()}</p>
        <p>Total Pool: {market.totalDeposits} ROSE</p>
      </div>

      <div className="odds-container">
        <div className="odds-box yes">
          <img src={yesFruit} alt="Yes" className="odds-icon" />
          <div className="odds-label">YES</div>
          <div className="odds-value">{oddsUnknown ? "???" : `${market.yesOdds.toFixed(1)}%`}</div>
          <div className="odds-pool">{oddsUnknown ? "???" : `${market.yesPool} ROSE`}</div>
        </div>
        <div className="odds-box no">
          <img src={noFruit} alt="No" className="odds-icon" />
          <div className="odds-label">NO</div>
          <div className="odds-value">{oddsUnknown ? "???" : `${market.noOdds.toFixed(1)}%`}</div>
          <div className="odds-pool">{oddsUnknown ? "???" : `${market.noPool} ROSE`}</div>
        </div>
      </div>

      {isOpen && (
        <div className="betting-section">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount in ROSE"
            step="0.01"
            min="0.01"
          />
          <div className="bet-buttons">
            <button
              onClick={() => placeBet.mutate({ choice: 0, amount })}
              disabled={placeBet.isPending}
              className="btn btn-yes"
            >
              <img src={yesButton} alt="" className="btn-icon" />
              {placeBet.isPending ? "Placing..." : "Bet YES"}
            </button>
            <button
              onClick={() => placeBet.mutate({ choice: 1, amount })}
              disabled={placeBet.isPending}
              className="btn btn-no"
            >
              <img src={noButton} alt="" className="btn-icon" />
              {placeBet.isPending ? "Placing..." : "Bet NO"}
            </button>
          </div>
          {placeBet.isError && (
            <p className="error">Error: {(placeBet.error as Error).message}</p>
          )}
        </div>
      )}

      {hasPosition && (
        <div className="position-section" style={{ backgroundImage: `url(${positionFrame})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <h3>Your Position (Private)</h3>
          <p>YES: {position.yesAmount} ROSE</p>
          <p>NO: {position.noAmount} ROSE</p>

          {isResolved && !position.hasClaimed && (
            <button
              onClick={() => claim.mutate()}
              disabled={claim.isPending}
              className="btn btn-claim"
              style={{ backgroundImage: `url(${claimRewards})`, backgroundSize: 'cover' }}
            >
              {claim.isPending ? "Claiming..." : "Claim Winnings"}
            </button>
          )}
          {position.hasClaimed && (
            <p className="claimed">Rewards Claimed!</p>
          )}
        </div>
      )}

      <div className="market-address">
        {address.slice(0, 6)}...{address.slice(-4)}
      </div>
    </div>
  );
}
