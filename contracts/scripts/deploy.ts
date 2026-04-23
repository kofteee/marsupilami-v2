import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // 1. Deploy OracleRegistry
  console.log("\nDeploying OracleRegistry...");
  const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
  const oracleRegistry = await OracleRegistry.deploy();
  await oracleRegistry.waitForDeployment();
  const oracleRegistryAddress = await oracleRegistry.getAddress();
  console.log("OracleRegistry deployed to:", oracleRegistryAddress);

  // 2. Deploy MarketFactory
  console.log("\nDeploying MarketFactory...");
  const MarketFactory = await ethers.getContractFactory("MarketFactory");
  const marketFactory = await MarketFactory.deploy(oracleRegistryAddress);
  await marketFactory.waitForDeployment();
  const marketFactoryAddress = await marketFactory.getAddress();
  console.log("MarketFactory deployed to:", marketFactoryAddress);

  // Output deployment info
  console.log("\n========================================");
  console.log("Deployment Complete!");
  console.log("========================================");
  console.log("OracleRegistry:", oracleRegistryAddress);
  console.log("MarketFactory:", marketFactoryAddress);
  console.log("========================================");

  // Save addresses to file
  const network = await ethers.provider.getNetwork();
  const addresses = {
    network: network.name,
    chainId: Number(network.chainId),
    oracleRegistry: oracleRegistryAddress,
    marketFactory: marketFactoryAddress,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    "deployed-addresses.json",
    JSON.stringify(addresses, null, 2)
  );
  console.log("\nAddresses saved to deployed-addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
