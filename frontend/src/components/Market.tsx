import React, { useState, useEffect } from "react";
import { useMarketInfo } from "../hooks/useMarket";
import { CATEGORIES } from "../App";
import { PrivateBet } from "./PrivateBet";

interface MarketProps {
  address: string;
  categoryFilter: string;
}

const Market: React.FC<MarketProps> = ({ address, categoryFilter }) => {
  const { data: market, isLoading, error } = useMarketInfo(address);
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!market || market.state !== 0) return;

    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const diff = market.bettingDeadline - now;

      if (diff <= 0) {
        setTimeLeft("EXPIRED");
        clearInterval(timer);
      } else {
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [market]);

  if (isLoading) return <div className="market-card loading">Loading market data...</div>;
  if (error || !market) return null;

  const categoryInfo = CATEGORIES.find((c) => c.id === market.category);

  // Filter logic
  if (categoryFilter !== 'all' && market.category !== categoryFilter) return null;

  return (
    <div className="market-card animate-fade-in">
      <div className="market-header">
        <div className="market-header-main">
          <img 
            src={categoryInfo?.icon || CATEGORIES.find(c => c.id === 'other')?.icon} 
            alt={market.category} 
            className="market-status-icon" 
          />
          <div className="market-title-group">
            <h3 className="market-question">{market.question}</h3>
            <div className="market-meta">
              <span className={`status-badge status-${market.state === 0 ? 'open' : 'closed'}`}>
                {market.state === 0 ? 'Open' : 'Resolved'}
              </span>
              <div className="market-countdown">
                <span className="countdown-label">Time Left:</span>
                <span className={`countdown-value ${timeLeft === 'EXPIRED' ? 'countdown-expired' : ''}`}>
                  {timeLeft || "--:--:--"}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="market-actions">
          <div className="market-category-badge">
            {categoryInfo && (
              <span>
                <img src={categoryInfo.icon} alt="" className="category-badge-icon" />
                {categoryInfo.label}
              </span>
            )}
          </div>
          <button 
            className="btn-copy-addr" 
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(address);
              alert("Market Address Copied!");
            }}
            title="Copy Market Address"
          >
            📋 Copy Address
          </button>
        </div>
      </div>

      <div className="market-stats-grid">
        <div className="stat-box">
          <span className="stat-label">Total Pool</span>
          <span className="stat-value">{market.totalPool} {market.symbol}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Yes Pool</span>
          <span className="stat-value yes">{market.yesPool} {market.symbol} ({market.yesOdds}%)</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">No Pool</span>
          <span className="stat-value no">{market.noPool} {market.symbol} ({market.noOdds}%)</span>
        </div>
      </div>

      <div className="interaction-section">
        <PrivateBet address={address} />
      </div>

      <div className="market-footer-address">
        <code>{address}</code>
      </div>
    </div>
  );
};

export { Market };
