import { useMarketInfo } from "../hooks/useMarket";
import { PrivateBet } from "./PrivateBet";
import { parseCategory, CATEGORIES } from "../App";
import type { CategoryId } from "../App";

// Assets from v1
import openMarket from "../assets/marsu/open-market.jpeg";
import closedMarket from "../assets/marsu/closed-market.jpeg";
import resolvedMarket from "../assets/marsu/resolved-market.jpeg";
import yesFruit from "../assets/marsu/yes-fruit.jpeg";
import noFruit from "../assets/marsu/no-fruit.jpeg";

const STATES = ["Open", "Closed", "Resolved", "Cancelled"];
const OUTCOMES = ["Unresolved", "YES", "NO", "Invalid"];
const STATUS_ICONS = [openMarket, closedMarket, resolvedMarket, closedMarket];

interface MarketProps {
  address: string;
  categoryFilter?: CategoryId;
}

export function Market({ address, categoryFilter = "all" }: MarketProps) {
  const { data: market, isLoading, error } = useMarketInfo(address);

  if (isLoading) return <div className="card loading-card">Loading market data...</div>;
  if (error) return <div className="card error">Error loading market</div>;
  if (!market) return null;

  const { category, cleanQuestion } = parseCategory(market.question);
  const categoryInfo = CATEGORIES.find(c => c.id === category);

  // Filter by category if not "all"
  if (categoryFilter !== "all" && category !== categoryFilter) {
    return null;
  }

  const deadline = new Date(market.bettingDeadline * 1000);
  const isResolved = market.state === 2;

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
              <img src={categoryInfo.icon} alt="" className="category-badge-icon" />
              {categoryInfo.label}
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
        <p>Total Pool: {market.totalDeposits} {market.symbol}</p>
      </div>

      <div className="odds-container">
        <div className="odds-box yes">
          <img src={yesFruit} alt="Yes" className="odds-icon" />
          <div className="odds-label">YES</div>
          <div className="odds-value">{market.yesOdds.toFixed(1)}%</div>
          <div className="odds-pool">{market.yesPool} {market.symbol}</div>
        </div>
        <div className="odds-box no">
          <img src={noFruit} alt="No" className="odds-icon" />
          <div className="odds-label">NO</div>
          <div className="odds-value">{market.noOdds.toFixed(1)}%</div>
          <div className="odds-pool">{market.noPool} {market.symbol}</div>
        </div>
      </div>

      <div className="interaction-section">
        <PrivateBet address={address} />
      </div>

      <div className="market-footer">
        <code>{address}</code>
      </div>
    </div>
  );
};
