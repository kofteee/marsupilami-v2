import React, { useState } from 'react';
import { usePlaceBetPrivate, useGenerateClaimTicket } from '../hooks/useZKMarket';
import { useMarketInfo } from '../hooks/useMarket';
import yesButton from "../assets/marsu/yes-button.jpeg";
import noButton from "../assets/marsu/no-button.jpeg";
import claimRewards from "../assets/marsu/claim-rewards.jpeg";

interface PrivateBetProps {
    address: string;
}

export const PrivateBet: React.FC<PrivateBetProps> = ({ address }) => {
    const { data: market } = useMarketInfo(address);
    const placeBetPrivate = usePlaceBetPrivate(address);
    const generateTicket = useGenerateClaimTicket(address);
    const [amount, setAmount] = useState("0.1");

    if (!market) return null;

    const deadline = new Date(market.bettingDeadline * 1000);
    const isOpen = market.state === 0 && Date.now() < deadline.getTime();
    const isResolved = market.state === 2;

    return (
        <div className="private-bet-container card">
            <h3>Air-Gapped Private Betting</h3>
            <p className="description">
                Your bet will be hidden using a ZK-commitment. 
                Generate a ticket later to claim from a different wallet.
            </p>

            {isOpen && (
                <div className="betting-section">
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={`Amount in ${market.symbol}`}
                        step="0.01"
                        min="0.01"
                        className="bet-input"
                    />
                    <div className="bet-buttons">
                        <button
                            onClick={() => placeBetPrivate.mutate({ choice: 0, amount })}
                            disabled={placeBetPrivate.isPending}
                            className="btn btn-yes"
                        >
                            <img src={yesButton} alt="" className="btn-icon" />
                            {placeBetPrivate.isPending ? "Hashing..." : "Private YES"}
                        </button>
                        <button
                            onClick={() => placeBetPrivate.mutate({ choice: 1, amount })}
                            disabled={placeBetPrivate.isPending}
                            className="btn btn-no"
                        >
                            <img src={noButton} alt="" className="btn-icon" />
                            {placeBetPrivate.isPending ? "Hashing..." : "Private NO"}
                        </button>
                    </div>
                </div>
            )}

            {isResolved && (
                <div className="claim-section">
                    <h4>Market Resolved</h4>
                    <p className="hint">Select a bet to generate its ZK Claim Ticket:</p>
                    
                    <div className="bets-list">
                        {Object.keys(localStorage)
                            .filter(k => k.startsWith(`bet_${address.toLowerCase()}_`) || k.startsWith(`bet_${address}_`))
                            .map(k => {
                                const bet = JSON.parse(localStorage.getItem(k)!);
                                const commitment = k.split('_')[2];
                                return (
                                    <div key={k} className="bet-item">
                                        <div className="bet-details">
                                            <span className={`bet-choice ${bet.choice === 0 ? 'yes' : 'no'}`}>
                                                {bet.choice === 0 ? 'YES' : 'NO'}
                                            </span>
                                            <span className="bet-amount">{bet.amount} {market.symbol}</span>
                                            <span className="bet-date">{new Date(bet.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <button
                                            onClick={() => generateTicket.mutate(commitment)}
                                            disabled={generateTicket.isPending}
                                            className="btn btn-generate-small"
                                        >
                                            {generateTicket.isPending ? "..." : "Generate Ticket"}
                                        </button>
                                    </div>
                                );
                            })
                        }
                        {Object.keys(localStorage).filter(k => k.startsWith(`bet_${address}_`)).length === 0 && (
                            <p className="no-bets">No bets found for this market in your browser.</p>
                        )}
                    </div>

                    {generateTicket.isSuccess && (
                        <p className="success">Ticket generated! Now go to "Air-Gapped Claim" tab.</p>
                    )}
                    {generateTicket.isError && (
                        <p className="error">Error: {(generateTicket.error as Error).message}</p>
                    )}
                </div>
            )}
        </div>
    );
};
