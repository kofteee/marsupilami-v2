import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const signers = await ethers.getSigners();
    
    // Adresleri deployed-addresses.json'dan oku
    const addressesPath = path.join(__dirname, "../deployed-addresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    const oracleRegistryAddress = addresses.oracleRegistry;
    
    console.log("Checking oracles for registry:", oracleRegistryAddress);
    const registry = await ethers.getContractAt("OracleRegistry", oracleRegistryAddress);
    
    const stakeAmount = ethers.parseEther("5");
    
    for (const oracle of signers) {
        // Zaten kayıtlı mı kontrol et
        const isAlreadyActive = await registry.isOracle(oracle.address);
        if (isAlreadyActive) {
            console.log(`Oracle ${oracle.address} already registered, skipping...`);
            continue;
        }

        console.log(`Registering oracle: ${oracle.address}...`);
        try {
            const tx = await registry.connect(oracle).register({ value: stakeAmount });
            await tx.wait();
            console.log(`Oracle ${oracle.address} registered successfully!`);
        } catch (err) {
            console.log(`Failed to register ${oracle.address}:`, (err as Error).message);
        }
    }
    
    const count = await registry.getOracleCount();
    console.log(`\n✅ Total registered oracles: ${count}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
