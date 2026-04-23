import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@oasisprotocol/sapphire-hardhat";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
  },
};

export default config;
