import React, { useState } from 'react';
import { ethers } from 'ethers';
import { getSigner } from '../utils/sapphire';
import PredictionMarketABI from '../abi/PredictionMarket.json';

export const PrivateClaim: React.FC = () => {
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = event.target?.result as string;
                const data = JSON.parse(content);
                if (!data.proof || !data.publicSignals || !data.marketAddress) {
                    throw new Error("Invalid ticket format");
                }
                setTicket(data);
                setStatus("Ticket loaded successfully.");
            } catch (err) {
                setStatus("Error: Invalid claim ticket file.");
            }
        };
        reader.readAsText(file);
    };

    const handleClaim = async () => {
        if (!ticket) return;
        setLoading(true);
        setStatus("Submitting claim transaction...");
        try {
            const signer = await getSigner();
            const market = new ethers.Contract(ticket.marketAddress, PredictionMarketABI, signer);
            
            // Execute the claim directly paying own gas
            const tx = await market.claimWinningsPrivate(
                ticket.proof.a,
                ticket.proof.b,
                ticket.proof.c,
                ticket.publicSignals
            );
            
            setStatus("Transaction sent. Waiting for confirmation...");
            const receipt = await tx.wait();
            
            // Try to find the WinningsClaimed event
            const event = receipt.logs.find((log: any) => {
                try {
                    const parsed = market.interface.parseLog({ topics: log.topics, data: log.data });
                    return parsed?.name === "WinningsClaimed";
                } catch { return false; }
            });

            if (event) {
                const parsed = market.interface.parseLog({ topics: event.topics, data: event.data });
                const amount = ethers.formatEther(parsed?.args[1]);
                setStatus(`Claim successful! ${amount} ETH transferred to your wallet.`);
            } else {
                setStatus("Claim successful! Funds transferred to your wallet.");
            }
            setTicket(null);
        } catch (err: any) {
            console.error("Claim error:", err);
            
            // Extract the most meaningful error message
            const errorMessage = err.reason || err.shortMessage || err.message || "Unknown error";
            setStatus(`Claim failed: ${errorMessage}`);
            
            if (err.data) {
              console.log("Error data:", err.data);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="private-claim-container card">
            <h3>Air-Gapped Claimer</h3>
            <p className="description">
                Upload the <code>claim_ticket.json</code> file you generated previously. 
                You will pay the gas for this transaction on the Oasis Sapphire network.
            </p>
            
            <div className={`upload-zone ${ticket ? 'has-file' : ''}`}>
                <label className="file-input-label">
                    <input 
                        type="file" 
                        onChange={handleFileUpload} 
                        accept=".json" 
                        className="file-input"
                    />
                    {ticket ? "Change Ticket" : "Drop Ticket JSON here or Click to Upload"}
                </label>
            </div>

            {status && <p className={`status-message ${status.includes("Error") || status.includes("failed") ? 'error' : 'info'}`}>{status}</p>}

            {ticket && (
                <div className="ticket-details animate-fade-in">
                    <div className="detail-item">
                        <span className="label">Market:</span>
                        <span className="value">{ticket.marketAddress.slice(0, 10)}...</span>
                    </div>
                    <div className="detail-item">
                        <span className="label">Nullifier Hash:</span>
                        <span className="value">{ticket.nullifierHash.slice(0, 10)}...</span>
                    </div>
                    
                    <button 
                        onClick={handleClaim} 
                        disabled={loading} 
                        className="btn btn-claim-private"
                    >
                        {loading ? (
                            <span className="spinner">Processing...</span>
                        ) : (
                            "Execute Private Claim"
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};
