// Contract addresses from environment variables
// In Vite, env vars must be prefixed with VITE_

export const CONTRACTS = {
  // Local Hardhat (default addresses)
  local: {
    oracleRegistry: import.meta.env.VITE_LOCAL_ORACLE_REGISTRY || "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    marketFactory: import.meta.env.VITE_LOCAL_MARKET_FACTORY || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  },
  // Sapphire Testnet
  testnet: {
    oracleRegistry: import.meta.env.VITE_TESTNET_ORACLE_REGISTRY || "",
    marketFactory: import.meta.env.VITE_TESTNET_MARKET_FACTORY || "",
  },
};

// Default network: 'local' or 'testnet'
export const DEFAULT_NETWORK = import.meta.env.VITE_DEFAULT_NETWORK || "local";

export function getContracts(chainId: bigint) {
  if (chainId === BigInt(31337)) {
    return CONTRACTS.local;
  }
  if (chainId === BigInt(0x5aff)) {
    return CONTRACTS.testnet;
  }
  // Fallback based on default network setting
  return DEFAULT_NETWORK === "testnet" ? CONTRACTS.testnet : CONTRACTS.local;
}
