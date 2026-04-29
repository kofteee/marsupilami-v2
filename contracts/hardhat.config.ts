import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@oasisprotocol/sapphire-hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    sapphire_testnet: {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 0x5aff,
      accounts: [
        process.env.PRIVATE_KEY1!,
        process.env.PRIVATE_KEY2!,
        process.env.PRIVATE_KEY3!
      ].filter(Boolean),
    },
    sapphire_localnet: {
      url: "http://localhost:8545",
      chainId: 0x5afd,
      accounts: [
        process.env.PRIVATE_KEY1!,
        process.env.PRIVATE_KEY2!,
        process.env.PRIVATE_KEY3!
      ].filter(Boolean),
    },
  },
};

export default config;
