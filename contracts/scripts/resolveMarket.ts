import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const addressesPath = path.join(__dirname, "../deployed-addresses.json");
    if (!fs.existsSync(addressesPath)) {
        console.error("deployed-addresses.json not found.");
        return;
    }
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const factory = await ethers.getContractAt("MarketFactory", addresses.marketFactory);

    const marketCount = await factory.getMarketCount();
    if (marketCount === 0n) {
        console.error("No markets found.");
        return;
    }

    // Get the latest market
    const marketAddress = process.env.MARKET_ADDRESS || await factory.allMarkets(marketCount - 1n);
    const market = await ethers.getContractAt("PredictionMarket", marketAddress);
    
    console.log("Checking market:", marketAddress);

    const state = await market.state();
    const deadline = await market.bettingDeadline();
    const block = await ethers.provider.getBlock("latest");
    const now = block!.timestamp;

    if (state === 0n) { // OPEN
        if (now < Number(deadline)) {
            console.log(`\n⚠️  MARKET STILL OPEN!`);
            console.log(`Remaining time: ${Number(deadline) - now} seconds.`);
            console.log(`Please wait for this time to pass before resolving.\n`);
            return;
        }

        console.log("Closing market...");
        await (await market.closeMarket()).wait();
        console.log("Market closed successfully.");
    }

    const oracles = await market.getMarketOracles();
    const signers = await ethers.getSigners();

    console.log("Submitting oracle resolutions...");
    for (let i = 0; i < oracles.length; i++) {
        // Check state before each vote
        const currentState = await market.state();
        if (currentState !== 1n) { // 1 = CLOSED
            console.log(`Market state is now ${currentState}. Stopping additional votes.`);
            break;
        }

        const oracleAddr = oracles[i];
        const signer = signers.find(s => s.address.toLowerCase() === oracleAddr.toLowerCase());
        
        if (signer) {
            const hasVoted = (await market.oracleVotes(oracleAddr)).hasVoted;
            if (!hasVoted) {
                console.log(`Oracle ${oracleAddr} voting YES...`);
                try {
                    await (await market.connect(signer).submitResolution(1)).wait(); // 1 = YES
                } catch (e) {
                    console.log(`Vote by ${oracleAddr} failed, likely consensus already reached.`);
                    break;
                }
            } else {
                console.log(`Oracle ${oracleAddr} already voted.`);
            }
        }
    }

    console.log("Market resolution submitted. Check frontend for final state!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
