/**
 * Demo: Simulate 100-200 accounts betting on a freshly created market
 * over a 10-minute window.
 *
 * Run:
 *   cd contracts
 *   npx hardhat run demo/simulate.ts --network localhost
 *
 * Prerequisites:
 *   - `npx hardhat node` running in another terminal
 *   - `npx hardhat run scripts/deploy.ts --network localhost` already done
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Config ────────────────────────────────────────────────────────────────

const NUM_ACCOUNTS     = randInt(100, 200);   // resolved at runtime
const DURATION_MIN     = 10;                  // minutes to spread bets over
const ODDS_UPDATE_MIN  = 2;                   // must match PredictionMarket.sol
const FUND_ETH         = "0.08";              // ETH given to each bettor wallet
const MIN_BET_ETH      = 0.01;
const MAX_BET_ETH      = 0.05;
const FUND_BATCH_SIZE  = 25;                  // wallets funded per tx batch

// ─── Helpers ───────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bar(yes: number, no: number, width = 30): string {
  const total = yes + no || 1;
  const yBlocks = Math.round((yes / total) * width);
  const nBlocks = width - yBlocks;
  return `[${"Y".repeat(yBlocks)}${"N".repeat(nBlocks)}] ${Math.round((yes / total) * 100)}% YES`;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load deployed addresses
  const addrFile = path.join(__dirname, "../deployed-addresses.json");
  if (!fs.existsSync(addrFile)) {
    throw new Error(
      "deployed-addresses.json not found.\n" +
      "Run: npx hardhat run scripts/deploy.ts --network localhost"
    );
  }
  const addresses = JSON.parse(fs.readFileSync(addrFile, "utf8"));

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("=".repeat(56));
  console.log("  MARSUPILAMI — Market Simulation Demo");
  console.log("=".repeat(56));
  console.log(`Deployer   : ${deployer.address}`);
  console.log(`Balance    : ${ethers.formatEther(balance)} ETH`);
  console.log(`Bettors    : ${NUM_ACCOUNTS}`);
  console.log(`Duration   : ${DURATION_MIN} minutes`);
  console.log("=".repeat(56));

  // 2. Create a market (contract minimum is 1 hour)
  const factory = await ethers.getContractAt("MarketFactory", addresses.marketFactory);
  const question = "Will Bitcoin surpass $150,000 before the end of 2026?";
  const durationSec = 2 * 60 * 60; // 2 hours — well above the 1-hour minimum

  console.log(`\n[1/4] Creating market...`);
  console.log(`      "${question}"`);

  const countBefore = await factory.getMarketCount();
  const createTx = await factory.createMarket(question, durationSec);
  await createTx.wait();
  const countAfter = await factory.getMarketCount();
  if (countAfter <= countBefore) throw new Error("Market creation failed — count did not increase");

  // getMarkets(start, count) — fetch the one we just created
  const newMarkets = await factory.getMarkets(countBefore, 1n);
  const marketAddress: string = newMarkets[0];

  const market = await ethers.getContractAt("PredictionMarket", marketAddress);
  const deadline = await market.bettingDeadline();
  console.log(`      Market  : ${marketAddress}`);
  console.log(`      Deadline: ${new Date(Number(deadline) * 1000).toLocaleString()}`);

  // Write demo state so the frontend can pick it up
  const demoStatePath = path.join(__dirname, "../../frontend/public/demo-state.json");
  fs.writeFileSync(demoStatePath, JSON.stringify({
    marketAddress,
    question,
    startedAt: new Date().toISOString(),
    totalBettors: NUM_ACCOUNTS,
    durationMin: DURATION_MIN,
    marketFactory: addresses.marketFactory,
  }, null, 2));
  console.log(`      Demo state written → frontend/public/demo-state.json`);

  // 3. Generate wallets
  console.log(`\n[2/4] Generating ${NUM_ACCOUNTS} wallets...`);
  const provider = ethers.provider;
  const wallets  = Array.from({ length: NUM_ACCOUNTS }, () =>
    ethers.Wallet.createRandom().connect(provider)
  );

  // 4. Fund wallets in batches
  console.log(`\n[3/4] Funding wallets (${FUND_ETH} ETH each)...`);
  const fundValue = ethers.parseEther(FUND_ETH);

  for (let i = 0; i < wallets.length; i += FUND_BATCH_SIZE) {
    const batch = wallets.slice(i, i + FUND_BATCH_SIZE);
    const txs   = await Promise.all(
      batch.map(w => deployer.sendTransaction({ to: w.address, value: fundValue }))
    );
    await Promise.all(txs.map(t => t.wait()));
    const done = Math.min(i + FUND_BATCH_SIZE, wallets.length);
    process.stdout.write(`      ${done}/${wallets.length} funded...\r`);
  }
  console.log(`      All ${NUM_ACCOUNTS} wallets funded.        `);

  // 5. Schedule bets at random times within DURATION_MIN minutes
  console.log(`\n[4/4] Placing ${NUM_ACCOUNTS} bets over ${DURATION_MIN} minutes...\n`);

  const totalMs   = DURATION_MIN * 60 * 1000;
  const schedule  = wallets
    .map((w, i) => ({ wallet: w, delayMs: randInt(0, totalMs), index: i }))
    .sort((a, b) => a.delayMs - b.delayMs);

  let yesCount  = 0;
  let noCount   = 0;
  let failCount = 0;
  const startTs = Date.now();

  // ── Parallel odds clock ──────────────────────────────────────────────────
  // Every ODDS_UPDATE_MIN real minutes: advance chain clock past the interval,
  // trigger updateOdds(), and print the current public YES/NO pools + prices.
  async function printOdds(tick: number) {
    const pubYes = await market.publicYesPool();
    const pubNo  = await market.publicNoPool();
    const tot    = pubYes + pubNo;
    const yesPct = tot > 0n ? Math.round(Number((pubYes * 100n) / tot)) : 50;
    const noPct  = 100 - yesPct;
    const yesMult = pubYes > 0n ? (Number(tot) / Number(pubYes)).toFixed(2) : "N/A";
    const noMult  = pubNo  > 0n ? (Number(tot) / Number(pubNo)).toFixed(2)  : "N/A";
    const elapsedS = Math.round((Date.now() - startTs) / 1000);
    console.log(`\n  ── Odds Reveal #${tick} (${elapsedS}s elapsed) ────────────────`);
    console.log(`     YES  ${String(yesPct).padStart(3)}%  |  Pool: ${ethers.formatEther(pubYes).padEnd(8)} ETH  |  Payout: ${yesMult}x`);
    console.log(`     NO   ${String(noPct).padStart(3)}%  |  Pool: ${ethers.formatEther(pubNo).padEnd(8)} ETH  |  Payout: ${noMult}x`);
    console.log();
  }

  const oddsClock = (async () => {
    let tick = 1;
    while (Date.now() - startTs < totalMs + 10_000) {
      await sleep(ODDS_UPDATE_MIN * 60 * 1000);
      // Advance Hardhat chain time past the contract interval, then mine a block
      await ethers.provider.send("evm_increaseTime", [ODDS_UPDATE_MIN * 60 + 5]);
      await ethers.provider.send("evm_mine", []);
      try {
        const tx = await (market.connect(deployer) as any).updateOdds();
        await tx.wait();
      } catch {
        // Silently skip if no new bets moved pending pools
      }
      await printOdds(tick);
      tick++;
    }
  })();
  // ────────────────────────────────────────────────────────────────────────

  const betPromises: Promise<void>[] = schedule.map(({ wallet, delayMs }) =>
    sleep(delayMs).then(async () => {
      const choice    = Math.random() < 0.5 ? 0 : 1;
      const betEth    = randFloat(MIN_BET_ETH, MAX_BET_ETH);
      const betWei    = ethers.parseEther(betEth.toFixed(4));
      const label     = choice === 0 ? "YES" : "NO ";
      const elapsedS  = Math.floor((Date.now() - startTs) / 1000);

      try {
        const tx = await (market.connect(wallet) as any).placeBet(choice, { value: betWei });
        await tx.wait();

        if (choice === 0) yesCount++; else noCount++;

        const betNum = yesCount + noCount;
        console.log(
          `  [${String(elapsedS).padStart(4)}s] #${String(betNum).padStart(3)} ` +
          `${label}  ${betEth.toFixed(4)} ETH  ` +
          `...${wallet.address.slice(-6)}  ` +
          `${bar(yesCount, noCount)}`
        );
      } catch {
        failCount++;
      }
    })
  );

  await Promise.all([...betPromises, oddsClock]);

  // 6. Summary
  const marketTotalDeposits = await market.totalDeposits();
  const elapsed             = Math.round((Date.now() - startTs) / 1000);

  console.log("\n" + "=".repeat(56));
  console.log("  Simulation Complete");
  console.log("=".repeat(56));
  console.log(`Duration        : ${elapsed}s`);
  console.log(`Bets placed     : ${yesCount + noCount} / ${NUM_ACCOUNTS}`);
  console.log(`  YES           : ${yesCount}`);
  console.log(`  NO            : ${noCount}`);
  console.log(`  Failed        : ${failCount}`);
  console.log(`ETH deposited   : ${ethers.formatEther(marketTotalDeposits)} ETH (on-chain)`);
  console.log(`Market address  : ${marketAddress}`);
  console.log("=".repeat(56));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
