import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// @ts-ignore
import { buildPoseidon } from "circomlibjs";
// @ts-ignore
import * as snarkjs from "snarkjs";
import * as path from "path";
import * as fs from "fs";

describe("Prediction Market ZK Flow", function () {
  let oracleRegistry: any;
  let marketFactory: any;
  let market: any;
  let poseidon: any;
  let verifier: any;
  let owner: HardhatEthersSigner;
  let oracle1: HardhatEthersSigner;
  let oracle2: HardhatEthersSigner;
  let oracle3: HardhatEthersSigner;
  let user1: HardhatEthersSigner;

  let poseidonHash: any;
  let F: any;

  const ONE_DAY = 24 * 60 * 60;
  const MIN_STAKE = ethers.parseEther("100");
  const MIN_BET = ethers.parseEther("0.01");

  const WASM_PATH = path.join(__dirname, "../../circuits/build/withdraw_js/withdraw.wasm");
  const ZKEY_PATH = path.join(__dirname, "../../circuits/build/withdraw_final.zkey");

  before(async function () {
    const p = await buildPoseidon();
    poseidonHash = p;
    F = p.F;
  });

  beforeEach(async function () {
    [owner, oracle1, oracle2, oracle3, user1] = await ethers.getSigners();

    // 1. Deploy Poseidon (2 inputs)
    const { poseidonContract } = require("circomlibjs");
    const poseidonBytecode = poseidonContract.createCode(2);
    const poseidonABI = poseidonContract.generateABI(2);
    const PoseidonFactory = new ethers.ContractFactory(poseidonABI, poseidonBytecode, owner);
    poseidon = await PoseidonFactory.deploy();
    await poseidon.waitForDeployment();

    // 2. Deploy Verifier (Groth16Verifier)
    const VerifierFactory = await ethers.getContractFactory("Groth16Verifier");
    verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();

    // 3. Deploy OracleRegistry
    const OracleRegistryFactory = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistryFactory.deploy();
    await oracleRegistry.waitForDeployment();

    // 4. Deploy MarketFactory
    const MarketFactoryFactory = await ethers.getContractFactory("MarketFactory");
    marketFactory = await MarketFactoryFactory.deploy(
      await oracleRegistry.getAddress(),
      await verifier.getAddress(),
      await poseidon.getAddress()
    );
    await marketFactory.waitForDeployment();

    // 5. Setup Oracles
    await oracleRegistry.connect(oracle1).register({ value: MIN_STAKE });
    await oracleRegistry.connect(oracle2).register({ value: MIN_STAKE });
    await oracleRegistry.connect(oracle3).register({ value: MIN_STAKE });

    // 6. Create Market
    const oracleAddresses = [oracle1.address, oracle2.address, oracle3.address];
    const tx = await marketFactory.createMarket("Will BTC reach $100k?", ONE_DAY, oracleAddresses);
    const receipt = await tx.wait();
    
    // Parse event manually since it's a bit complex with factory
    const log = receipt.logs[0];
    const marketAddress = ethers.getUint(log.topics[1]); // address is indexed
    // Simplified market address retrieval for test
    const allMarkets = await marketFactory.getMarkets(0, 1);
    market = await ethers.getContractAt("PredictionMarket", allMarkets[0]);
  });

  it("should complete a private bet and private claim lifecycle", async function () {
    // --- STEP 1: Prepare Private Bet ---
    const secret = BigInt(ethers.hexlify(ethers.randomBytes(31)));
    const nullifier = BigInt(ethers.hexlify(ethers.randomBytes(31)));
    const choice = 0; // YES
    const amount = ethers.parseEther("1");

    // Calculate commitment: Poseidon(secret, nullifier, choice, amount)
    // Note: withdraw.circom uses Poseidon(4) for commitment
    const commitment = F.toObject(poseidonHash([secret, nullifier, BigInt(choice), amount]));
    const commitmentHex = ethers.toBeHex(commitment, 32);

    console.log("Placing private bet with commitment:", commitmentHex);
    await market.connect(user1).placeBetPrivate(commitmentHex, choice, { value: amount });

    // Verify deposit
    const info = await market.getMarketInfo();
    expect(info._totalDeposits).to.equal(amount);

    // --- STEP 2: Resolve Market ---
    await time.increase(ONE_DAY + 1);
    await market.closeMarket();
    await market.connect(oracle1).submitResolution(1); // YES
    await market.connect(oracle2).submitResolution(1); // YES -> Resolved as YES
    
    expect(await market.state()).to.equal(2); // RESOLVED
    expect(await market.outcome()).to.equal(1); // YES

    // --- STEP 3: Generate ZK Proof ---
    console.log("Generating ZK Proof for claim...");
    
    // Fetch Merkle Path from contract
    const leafIndex = 0;
    const [pathElements, pathIndices] = await market.getMerklePath(leafIndex);
    const merkleRoot = await market.tree(20, 0); // Root is at level 20

    const nullifierHash = F.toObject(poseidonHash([nullifier]));

    const inputs = {
      merkleRoot: BigInt(merkleRoot),
      nullifierHash: BigInt(nullifierHash),
      choice: BigInt(choice),
      amount: amount,
      secret: secret,
      nullifier: nullifier,
      pathElements: pathElements.map((x: string) => BigInt(x)),
      pathIndices: pathIndices.map((x: any) => Number(x))
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      inputs,
      WASM_PATH,
      ZKEY_PATH
    );

    // Format proof for contract
    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]]
    ];
    const c = [proof.pi_c[0], proof.pi_c[1]];
    const pubInputs = publicSignals;

    // --- STEP 4: Claim Winnings Private ---
    const balanceBefore = await ethers.provider.getBalance(user1.address);
    const txClaim = await market.connect(user1).claimWinningsPrivate(a, b, c, pubInputs);
    const receiptClaim = await txClaim.wait();
    const gasUsed = receiptClaim.gasUsed * receiptClaim.gasPrice;
    
    const balanceAfter = await ethers.provider.getBalance(user1.address);
    
    // In this case, YES wins and user1 was the only bettor, so they get everything (1 ETH)
    // Actually, payout = (amount * totalPool) / winnerPool = (1 * 1) / 1 = 1 ETH
    expect(balanceAfter + gasUsed - balanceBefore).to.equal(amount);
    console.log("Private claim successful!");

    // --- STEP 5: Prevent Double Spending ---
    await expect(
      market.connect(user1).claimWinningsPrivate(a, b, c, pubInputs)
    ).to.be.revertedWith("Already spent");
  });
});
