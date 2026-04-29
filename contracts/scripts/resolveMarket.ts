import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const addressesPath = path.join(__dirname, "../deployed-addresses.json");
    if (!fs.existsSync(addressesPath)) {
        console.error("No deployed-addresses.json found.");
        return;
    }
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const factory = await ethers.getContractAt("MarketFactory", addresses.marketFactory);

    const count = await factory.getMarketCount();
    if (count === 0n) {
        console.error("No markets found.");
        return;
    }

    const marketAddress = await factory.allMarkets(count - 1n);
    const market = await ethers.getContractAt("PredictionMarket", marketAddress);

    console.log("Resolving market:", marketAddress);

    // 1. Check if we need to close it
    const state = await market.state();
    if (state === 0n) { // OPEN
        console.log("Market is still OPEN. Fast-forwarding time...");
        const deadline = await market.bettingDeadline();
        await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline) + 1]);
        await ethers.provider.send("evm_mine", []);

        console.log("Closing market...");
        await (await market.closeMarket()).wait();
    }

    // 2. Oracle Votes (Need 2 out of 3)
    const oracles = await market.getMarketOracles();
    console.log("Designated oracles:", oracles);

    // We need to use the oracle accounts to vote
    const signers = await ethers.getSigners();

    for (let i = 0; i < 2; i++) {
        const oracleAddress = oracles[i];
        const oracleSigner = signers.find(s => s.address.toLowerCase() === oracleAddress.toLowerCase());

        if (oracleSigner) {
            console.log(`Oracle ${oracleAddress} voting YES...`);
            await (await market.connect(oracleSigner).submitResolution(1)).wait(); // 1 = YES
        } else {
            console.warn(`Could not find signer for oracle ${oracleAddress}. Make sure you are using the default Hardhat accounts.`);
        }
    }

    const finalState = await market.state();
    const finalOutcome = await market.outcome();
    console.log("\n========================================");
    console.log("Market Resolved!");
    console.log("State:", ["Open", "Closed", "Resolved", "Cancelled"][Number(finalState)]);
    console.log("Outcome:", ["Unresolved", "YES", "NO", "Invalid"][Number(finalOutcome)]);
    console.log("========================================");
}

main().catch(console.error);
