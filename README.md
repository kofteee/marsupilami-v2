# Marsupilami - Privacy-Preserving Prediction Market

A privacy-preserving prediction market built on [Oasis Sapphire](https://oasisprotocol.org/sapphire), leveraging Trusted Execution Environments (TEE) to keep user bets confidential.

## Overview

Marsupilami enables users to participate in binary outcome (YES/NO) prediction markets without revealing their betting strategies. Unlike traditional transparent blockchain prediction markets, your bet choice remains private while still allowing for correct payout computation.

### Key Features

- **Private Betting**: Your YES/NO choice is encrypted and hidden from other users
- **Periodic Odds Disclosure**: Aggregated odds are revealed at intervals (not per-bet) to prevent correlation attacks
- **Pari-Mutuel Payouts**: Winners share the losing pool proportionally
- **Oracle Resolution**: Multiple oracles vote on outcomes with stake-based incentives
- **Category System**: Markets organized by Sports, Politics, Blockchain, Boston, and more

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│              Sapphire SDK encrypts bet choices               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Oasis Sapphire TEE                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ MarketFactory   │  │ PredictionMarket│  │OracleRegistry│ │
│  │ (creates markets│  │ (private state) │  │ (stake/slash)│ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- **MetaMask** browser extension

## Project Structure

```
marsupilami/
├── contracts/           # Solidity smart contracts
│   ├── contracts/
│   │   ├── PredictionMarket.sol   # Core market logic
│   │   ├── MarketFactory.sol      # Factory for creating markets
│   │   └── OracleRegistry.sol     # Oracle management
│   ├── scripts/
│   │   ├── deploy.ts              # Deployment script
│   │   └── createMarket.ts        # Market creation helper
│   └── test/
│       └── PredictionMarket.test.ts
├── frontend/            # React frontend
│   └── src/
│       ├── components/  # UI components
│       ├── hooks/       # Contract interaction hooks
│       └── utils/       # Sapphire integration
└── README.md
```

## Quick Start (Local Development)

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd marsupilami

# Install contract dependencies
cd contracts
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Start Local Hardhat Node

Open a terminal and start the local blockchain:

```bash
cd contracts
npx hardhat node
```

This will start a local Ethereum node at `http://localhost:8545` and display test accounts with pre-funded ETH.

**Keep this terminal running.**

### 3. Deploy Contracts

Open a new terminal:

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
```

You should see output like:

```
Deploying contracts with: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Balance: 10000.0

Deploying OracleRegistry...
OracleRegistry deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3

Deploying MarketFactory...
MarketFactory deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

========================================
Deployment Complete!
========================================
```

### 4. Configure MetaMask

1. Open MetaMask and add a custom network:
   - **Network Name**: Hardhat Local
   - **RPC URL**: `http://localhost:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`

2. Import a test account using one of the private keys from the Hardhat node output:
   ```
   Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
   Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

### 5. Start the Frontend

```bash
cd frontend
npm run dev
```

The app will be available at `http://localhost:5173`

### 6. Try the Application

1. **Connect Wallet**: Click "Connect Wallet" in the header and approve in MetaMask
2. **Create a Market**:
   - Go to "Create Market" tab
   - Select a category (e.g., Sports)
   - Enter a question (e.g., "Will the Celtics win the NBA Finals?")
   - Choose betting duration
   - Click "Create Market"
3. **Place a Bet**:
   - Go to "Markets" tab
   - Find your market
   - Enter an amount and click YES or NO
   - Your bet choice is private!
4. **View Your Position**: Your position appears as "Private" and is only visible to you

## Running Tests

```bash
cd contracts
npm run test
```

This runs the full test suite covering:
- Oracle registration and slashing
- Market creation and validation
- Private betting mechanics
- Market lifecycle (open → closed → resolved)
- Payout calculations
- Edge cases and security checks

## Creating Markets via CLI

You can also create markets from the command line:

```bash
cd contracts

# Default market
npx hardhat run scripts/createMarket.ts --network localhost

# Custom market
QUESTION="Will BTC reach $100k by December?" DURATION_DAYS=30 \
  npx hardhat run scripts/createMarket.ts --network localhost
```

## How Privacy Works

### Traditional Prediction Markets
```
User A bets YES → Visible on-chain → Everyone knows A bet YES
User B bets NO  → Visible on-chain → Everyone knows B bet NO
```

### Marsupilami (TEE-based)
```
User A bets YES → Encrypted → TEE decrypts internally → State updated privately
User B bets NO  → Encrypted → TEE decrypts internally → State updated privately
                              ↓
              Only aggregated odds released periodically
```

**Key Privacy Guarantees:**
- Your bet choice (YES/NO) is never exposed on-chain
- Only you can view your own position via `getMyPosition()`
- Aggregated odds update every 5 minutes (not per-bet) to prevent correlation
- The deposit amount is visible, but its allocation to YES/NO pools is hidden

## Smart Contract Overview

### PredictionMarket.sol
The core contract handling:
- **Private state**: `yesPool`, `noPool`, `positions` hidden by TEE
- **Public state**: `publicYesPool`, `publicNoPool` updated at intervals
- **Betting**: `placeBet(Choice)` accepts encrypted YES/NO choice
- **Resolution**: Oracles vote, 2/3 majority required
- **Claiming**: Winners receive `(userStake * totalPool) / winningPool`

### MarketFactory.sol
Factory pattern for deploying markets:
- Validates market parameters (1 hour to 30 days)
- Maintains registry of all markets
- Emits events for frontend indexing

### OracleRegistry.sol
Oracle economic incentives:
- 100 ROSE minimum stake to register
- 10% slash for voting with minority
- Success/failure tracking

## Configuration

### Contract Addresses

After deployment, addresses are saved to `contracts/deployed-addresses.json` and should match `frontend/src/utils/config.ts`:

```typescript
export const CONTRACTS = {
  local: {
    oracleRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    marketFactory: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  },
  testnet: {
    oracleRegistry: "", // Update after testnet deployment
    marketFactory: "",
  },
};
```

## Deploying to Sapphire Testnet

1. Get test ROSE tokens from the [Oasis Faucet](https://faucet.testnet.oasis.io/)

2. Set your private key:
   ```bash
   export PRIVATE_KEY="your-private-key-here"
   ```

3. Deploy:
   ```bash
   cd contracts
   npx hardhat run scripts/deploy.ts --network sapphire_testnet
   ```

4. Update `frontend/src/utils/config.ts` with the new addresses

5. Add Sapphire Testnet to MetaMask:
   - **Network Name**: Oasis Sapphire Testnet
   - **RPC URL**: `https://testnet.sapphire.oasis.io`
   - **Chain ID**: `23295` (0x5aff)
   - **Currency Symbol**: `ROSE`
   - **Block Explorer**: `https://explorer.oasis.io/testnet/sapphire`

## Troubleshooting

### "Nonce too high" error in MetaMask
Reset your account: MetaMask → Settings → Advanced → Clear activity tab data

### Contracts not responding
Make sure the Hardhat node is still running in your first terminal

### Transaction fails with "insufficient funds"
Import a Hardhat test account with pre-funded ETH (see step 4)

### Frontend shows wrong contract addresses
Verify `frontend/src/utils/config.ts` matches your deployed addresses

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24
- **Privacy Layer**: Oasis Sapphire TEE
- **Development**: Hardhat + TypeScript
- **Frontend**: React 19 + Vite + TypeScript
- **Web3**: ethers.js v6
- **State Management**: TanStack React Query

## Team

- Oktay Ozel
- Can Gokmen
- Yawei Li
- Kerem Tufan

## License

MIT

## Acknowledgments

- [Oasis Protocol](https://oasisprotocol.org/) for the Sapphire confidential EVM
- Boston University CS595 - Blockchains and their Applications
