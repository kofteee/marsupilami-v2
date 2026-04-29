import { useMutation } from "@tanstack/react-query";
import { ethers } from "ethers";
import { getSigner } from "../utils/sapphire";
import { generateSecret, calculateCommitment, generateProof, formatProofForContract, calculateNullifierHash, getMerklePathFromContract } from "../utils/zk";
import PredictionMarketABI from "../abi/PredictionMarket.json";

export function usePlaceBetPrivate(marketAddress: string) {
    return useMutation({
        mutationFn: async ({ choice, amount }: { choice: number; amount: string }) => {
            const signer = await getSigner();
            const secret = await generateSecret(signer, marketAddress, choice === 0 ? "YES" : "NO");
            const nullifier = ethers.toQuantity(ethers.randomBytes(31));
            const commitment = await calculateCommitment(secret, nullifier, choice, ethers.parseEther(amount));
            const commitmentHex = ethers.toBeHex(commitment, 32);

            const market = new ethers.Contract(marketAddress, PredictionMarketABI.abi, signer);
            const tx = await market.placeBetPrivate(commitmentHex, choice, {
                value: ethers.parseEther(amount)
            });
            const receipt = await tx.wait();

            // Extract leafIndex from events
            const event = receipt.logs.find((log: any) => {
                try {
                    const parsed = market.interface.parseLog({ topics: log.topics, data: log.data });
                    return parsed?.name === "PrivateBetPlaced";
                } catch { return false; }
            });
            
            if (!event) throw new Error("PrivateBetPlaced event not found in transaction receipt");

            const parsedEvent = market.interface.parseLog({ 
                topics: event.topics, 
                data: event.data 
            });
            const leafIndex = Number(parsedEvent?.args[0]);

            // Save bet info locally for later proof generation
            const betKey = `bet_${marketAddress.toLowerCase()}_${commitmentHex}`;
            localStorage.setItem(betKey, JSON.stringify({
                nullifier,
                choice,
                amount: amount,
                leafIndex,
                timestamp: Date.now()
            }));

            return receipt;
        }
    });
}

export function useGenerateClaimTicket(marketAddress: string) {
    return useMutation({
        mutationFn: async (commitmentHex?: string) => {
            const signer = await getSigner();
            
            // 1. Recover all private bets for this user from localStorage
            const allBets = Object.keys(localStorage)
                .filter(k => k.startsWith(`bet_${marketAddress.toLowerCase()}_`) || k.startsWith(`bet_${marketAddress}_`))
                .map(k => ({ key: k, commitment: k.split('_')[2], ...JSON.parse(localStorage.getItem(k)!) }));

            if (allBets.length === 0) throw new Error("No private bets found for this market");
            
            // If commitmentHex is provided, use that specific bet, otherwise use the latest
            const bet = commitmentHex 
                ? allBets.find(b => b.commitment === commitmentHex)
                : allBets.sort((a, b) => b.timestamp - a.timestamp)[0];

            if (!bet) throw new Error("Specific bet not found");
            const choiceStr = bet.choice === 0 ? "YES" : "NO";
            const secret = await generateSecret(signer, marketAddress, choiceStr);
            const nullifier = bet.nullifier;
            const amount = ethers.parseEther(bet.amount);
            
            const market = new ethers.Contract(marketAddress, PredictionMarketABI.abi, signer);
            
            // 2. Fetch Merkle Path from Contract
            
            // We need the leafIndex.
            // or by finding it in the contract's leaves mapping (expensive)
            // For now, let's assume we stored it in localStorage during placeBetPrivate
            if (bet.leafIndex === undefined) {
                // Fallback: search for it (this is slow but works if not stored)
                throw new Error("Leaf index missing. Please place a new bet or check logs.");
            }

            const { pathElements, pathIndices, root } = await getMerklePathFromContract(market, bet.leafIndex);
            const nullifierHash = await calculateNullifierHash(nullifier);

            // 3. Generate Proof
            const inputs = {
                merkleRoot: root,
                nullifierHash: nullifierHash,
                choice: bet.choice,
                amount: amount,
                secret: BigInt(secret),
                nullifier: BigInt(nullifier),
                pathElements: pathElements,
                pathIndices: pathIndices
            };

            const { proof, publicSignals } = await generateProof(inputs);

            const ticket = {
                proof: formatProofForContract(proof),
                publicSignals: publicSignals.map((s: any) => s.toString()),
                marketAddress,
                nullifierHash: ethers.toBeHex(nullifierHash, 32)
            };

            // 4. Export as JSON
            const blob = new Blob([JSON.stringify(ticket, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `claim_ticket_${marketAddress}.json`;
            a.click();
            
            return ticket;
        }
    });
}
