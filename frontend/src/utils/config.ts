// Contract addresses from environment variables
// In Vite, env vars must be prefixed with VITE_

export const CONTRACTS = {
  // Local Hardhat (default addresses)
  local: {
    oracleRegistry: import.meta.env.VITE_LOCAL_ORACLE_REGISTRY || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    marketFactory: import.meta.env.VITE_LOCAL_MARKET_FACTORY || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    symbol: "ETH",
  },
  // Sapphire Testnet
  testnet: {
    oracleRegistry: import.meta.env.VITE_TESTNET_ORACLE_REGISTRY || "",
    marketFactory: import.meta.env.VITE_TESTNET_MARKET_FACTORY || "",
    symbol: "ROSE",
  },
};

// Default network: 'local' or 'testnet'
export const DEFAULT_NETWORK = import.meta.env.VITE_DEFAULT_NETWORK || "local";

export function getContracts(chainId: bigint) {
  let contracts;
  if (chainId === BigInt(31337) || chainId === BigInt(0x7a69)) {
    contracts = CONTRACTS.local;
  } else if (chainId === BigInt(0x5aff)) {
    contracts = CONTRACTS.testnet;
  } else {
    // Fallback based on default network setting
    contracts = DEFAULT_NETWORK === "testnet" ? CONTRACTS.testnet : CONTRACTS.local;
  }
  
  return contracts;
}
