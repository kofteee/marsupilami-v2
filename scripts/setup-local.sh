#!/bin/bash

# Full setup for local development: deploy, register oracles, and create a demo market

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONTRACTS_DIR="$ROOT_DIR/contracts"

echo "=========================================="
echo "🚀 Setting up local environment..."
echo "=========================================="

# 1. Deploy contracts
echo ""
echo "📦 Step 1: Deploying contracts..."
"$SCRIPT_DIR/deploy-local.sh"

# 2. Register oracles
echo ""
echo "🔮 Step 2: Registering oracles..."
cd "$CONTRACTS_DIR"
npx hardhat run scripts/registerOracles.ts --network localhost

# 3. Create demo market
echo ""
echo "📊 Step 3: Creating demo market..."
npx hardhat run scripts/createMarket.ts --network localhost

# 4. Seed market with initial liquidity
echo ""
echo "💧 Step 4: Seeding market with initial liquidity..."
cd "$CONTRACTS_DIR"
# Get the latest market address from deployed-addresses.json is not enough, 
# we need to find the market created. But createMarket.ts doesn't save it to a file.
# However, we can just run a quick script to seed the last market.
cat > scripts/seedMarket.ts << EOF
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const addressesPath = path.join(__dirname, "../deployed-addresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const factory = await ethers.getContractAt("MarketFactory", addresses.marketFactory);
    const count = await factory.getMarketCount();
    if (count === 0n) return;
    const marketAddress = await factory.allMarkets(count - 1n);
    const market = await ethers.getContractAt("PredictionMarket", marketAddress);
    
    console.log("Seeding market:", marketAddress);
    const [deployer] = await ethers.getSigners();
    
    // Bet 1 ROSE on each side to provide initial odds using ZK flow
    const commitment0 = ethers.hexlify(ethers.randomBytes(32));
    const commitment1 = ethers.hexlify(ethers.randomBytes(32));
    
    await market.placeBetPrivate(commitment0, 0, { value: ethers.parseEther("1.0") });
    await market.placeBetPrivate(commitment1, 1, { value: ethers.parseEther("1.0") });
    console.log("Seeded with 1 ROSE on each side (ZK).");
}

main().catch(console.error);
EOF

npx hardhat run scripts/seedMarket.ts --network localhost
rm scripts/seedMarket.ts

echo ""
echo "=========================================="
echo "✅ Local setup complete!"
echo "=========================================="
echo "The frontend should now show 3 registered oracles and 1 active market."
echo "Make sure your MetaMask is connected to Localhost (8545)."
echo "=========================================="
