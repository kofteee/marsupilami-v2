import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { OracleRegistry, MarketFactory, PredictionMarket } from "../typechain-types";

describe("Prediction Market System", function () {
  let oracleRegistry: OracleRegistry;
  let marketFactory: MarketFactory;
  let market: PredictionMarket;
  let owner: HardhatEthersSigner;
  let oracle1: HardhatEthersSigner;
  let oracle2: HardhatEthersSigner;
  let oracle3: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const ONE_DAY = 24 * 60 * 60;
  const ONE_HOUR = 60 * 60;
  const MIN_STAKE = ethers.parseEther("100");
  const MIN_BET = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, oracle1, oracle2, oracle3, user1, user2] = await ethers.getSigners();

    // Deploy OracleRegistry
    const OracleRegistryFactory = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistryFactory.deploy();

    // Deploy MarketFactory
    const MarketFactoryFactory = await ethers.getContractFactory("MarketFactory");
    marketFactory = await MarketFactoryFactory.deploy(await oracleRegistry.getAddress());

    // Register oracles
    await oracleRegistry.connect(oracle1).register({ value: MIN_STAKE });
    await oracleRegistry.connect(oracle2).register({ value: MIN_STAKE });
    await oracleRegistry.connect(oracle3).register({ value: MIN_STAKE });

    // Create a market (1 day duration) with 3 designated oracles
    const oracleAddresses = [oracle1.address, oracle2.address, oracle3.address];
    const tx = await marketFactory.createMarket("Will it rain tomorrow?", ONE_DAY, oracleAddresses);
    const receipt = await tx.wait();

    // Get market address from event
    const event = receipt?.logs.find((log: any) => {
      try {
        const parsed = marketFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
        return parsed?.name === "MarketCreated";
      } catch {
        return false;
      }
    });

    const parsed = marketFactory.interface.parseLog({
      topics: event!.topics as string[],
      data: event!.data
    });
    const marketAddress = parsed?.args.market;

    market = await ethers.getContractAt("PredictionMarket", marketAddress);
  });

  describe("OracleRegistry", function () {
    it("should allow registration with sufficient stake", async function () {
      const newOracle = (await ethers.getSigners())[6];
      await oracleRegistry.connect(newOracle).register({ value: MIN_STAKE });

      expect(await oracleRegistry.isOracle(newOracle.address)).to.be.true;
      expect(await oracleRegistry.getOracleCount()).to.equal(4);
    });

    it("should reject registration with insufficient stake", async function () {
      const newOracle = (await ethers.getSigners())[6];
      const lowStake = ethers.parseEther("50");

      await expect(
        oracleRegistry.connect(newOracle).register({ value: lowStake })
      ).to.be.revertedWith("Insufficient stake");
    });

    it("should reject duplicate registration", async function () {
      await expect(
        oracleRegistry.connect(oracle1).register({ value: MIN_STAKE })
      ).to.be.revertedWith("Already registered");
    });

    it("should allow unregistration and return stake", async function () {
      const balanceBefore = await ethers.provider.getBalance(oracle1.address);

      const tx = await oracleRegistry.connect(oracle1).unregister();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(oracle1.address);

      expect(await oracleRegistry.isOracle(oracle1.address)).to.be.false;
      expect(balanceAfter + gasUsed - balanceBefore).to.equal(MIN_STAKE);
    });
  });

  describe("MarketFactory", function () {
    it("should create markets", async function () {
      expect(await marketFactory.getMarketCount()).to.equal(1);

      const oracles = [oracle1.address, oracle2.address, oracle3.address];
      await marketFactory.createMarket("Test question?", ONE_DAY, oracles);
      expect(await marketFactory.getMarketCount()).to.equal(2);
    });

    it("should reject duration too short", async function () {
      const oracles = [oracle1.address, oracle2.address, oracle3.address];
      await expect(
        marketFactory.createMarket("Question?", 30 * 60, oracles) // 30 minutes
      ).to.be.revertedWith("Duration too short");
    });

    it("should reject duration too long", async function () {
      const oracles = [oracle1.address, oracle2.address, oracle3.address];
      await expect(
        marketFactory.createMarket("Question?", 31 * ONE_DAY, oracles) // 31 days
      ).to.be.revertedWith("Duration too long");
    });

    it("should reject empty question", async function () {
      const oracles = [oracle1.address, oracle2.address, oracle3.address];
      await expect(
        marketFactory.createMarket("", ONE_DAY, oracles)
      ).to.be.revertedWith("Empty question");
    });

    it("should reject wrong number of oracles", async function () {
      await expect(
        marketFactory.createMarket("Question?", ONE_DAY, [oracle1.address, oracle2.address])
      ).to.be.revertedWith("Must provide exactly 3 oracles");
    });

    it("should reject unregistered oracles", async function () {
      const randomAddr = ethers.Wallet.createRandom().address;
      await expect(
        marketFactory.createMarket("Question?", ONE_DAY, [oracle1.address, oracle2.address, randomAddr])
      ).to.be.revertedWith("Oracle not registered");
    });

    it("should reject duplicate oracles", async function () {
      await expect(
        marketFactory.createMarket("Question?", ONE_DAY, [oracle1.address, oracle1.address, oracle2.address])
      ).to.be.revertedWith("Duplicate oracle");
    });

    it("should paginate markets correctly", async function () {
      const oracles = [oracle1.address, oracle2.address, oracle3.address];
      // Create 4 more markets (5 total)
      for (let i = 0; i < 4; i++) {
        await marketFactory.createMarket(`Question ${i}?`, ONE_DAY, oracles);
      }

      const page1 = await marketFactory.getMarkets(0, 2);
      expect(page1.length).to.equal(2);

      const page2 = await marketFactory.getMarkets(2, 2);
      expect(page2.length).to.equal(2);

      const page3 = await marketFactory.getMarkets(4, 2);
      expect(page3.length).to.equal(1);

      const outOfRange = await marketFactory.getMarkets(10, 2);
      expect(outOfRange.length).to.equal(0);
    });
  });

  describe("Betting", function () {
    it("should accept YES bets", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") }); // YES

      const info = await market.getMarketInfo();
      expect(info._totalDeposits).to.equal(ethers.parseEther("1"));
    });

    it("should accept NO bets", async function () {
      await market.connect(user1).placeBet(1, { value: ethers.parseEther("1") }); // NO

      const info = await market.getMarketInfo();
      expect(info._totalDeposits).to.equal(ethers.parseEther("1"));
    });

    it("should track multiple bets", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") }); // YES
      await market.connect(user2).placeBet(1, { value: ethers.parseEther("2") }); // NO

      const info = await market.getMarketInfo();
      expect(info._totalDeposits).to.equal(ethers.parseEther("3"));
    });

    it("should reject bets below minimum", async function () {
      await expect(
        market.connect(user1).placeBet(0, { value: ethers.parseEther("0.001") })
      ).to.be.revertedWith("Bet too small");
    });

    it("should reject bets after deadline", async function () {
      await time.increase(ONE_DAY + 1);

      await expect(
        market.connect(user1).placeBet(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Betting period ended");
    });

    it("should allow user to see their own position", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") }); // YES
      await market.connect(user1).placeBet(1, { value: ethers.parseEther("0.5") }); // NO

      const position = await market.connect(user1).getMyPosition();
      expect(position.yesAmount).to.equal(ethers.parseEther("1"));
      expect(position.noAmount).to.equal(ethers.parseEther("0.5"));
      expect(position.hasClaimed).to.be.false;
    });
  });

  describe("Market Lifecycle", function () {
    it("should start in OPEN state", async function () {
      const info = await market.getMarketInfo();
      expect(info._state).to.equal(0); // OPEN
    });

    it("should not allow closing before deadline", async function () {
      await expect(market.closeMarket()).to.be.revertedWith("Betting period not ended");
    });

    it("should allow closing after deadline", async function () {
      await time.increase(ONE_DAY + 1);
      await market.closeMarket();

      const info = await market.getMarketInfo();
      expect(info._state).to.equal(1); // CLOSED
    });

    it("should reveal final pools on close", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("10") }); // YES
      await market.connect(user2).placeBet(1, { value: ethers.parseEther("5") }); // NO

      await time.increase(ONE_DAY + 1);
      await market.closeMarket();

      const info = await market.getMarketInfo();
      expect(info._publicYesPool).to.equal(ethers.parseEther("10"));
      expect(info._publicNoPool).to.equal(ethers.parseEther("5"));
    });
  });

  describe("Oracle Resolution", function () {
    beforeEach(async function () {
      // Place some bets
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("10") }); // YES
      await market.connect(user2).placeBet(1, { value: ethers.parseEther("5") }); // NO

      // Close market
      await time.increase(ONE_DAY + 1);
      await market.closeMarket();
    });

    it("should accept oracle votes", async function () {
      await market.connect(oracle1).submitResolution(1); // YES

      expect(await market.yesVotes()).to.equal(1);
    });

    it("should reject non-oracle votes", async function () {
      await expect(
        market.connect(user1).submitResolution(1)
      ).to.be.revertedWith("Not an oracle for this market");
    });

    it("should reject duplicate votes", async function () {
      await market.connect(oracle1).submitResolution(1);

      await expect(
        market.connect(oracle1).submitResolution(1)
      ).to.be.revertedWith("Already voted");
    });

    it("should resolve with majority YES (2/3 oracles)", async function () {
      await market.connect(oracle1).submitResolution(1); // YES
      await market.connect(oracle2).submitResolution(1); // YES - resolves immediately

      expect(await market.outcome()).to.equal(1); // YES
      expect(await market.state()).to.equal(2); // RESOLVED
    });

    it("should resolve with majority NO (2/3 oracles)", async function () {
      await market.connect(oracle1).submitResolution(2); // NO
      await market.connect(oracle2).submitResolution(2); // NO - resolves immediately

      expect(await market.outcome()).to.equal(2); // NO
      expect(await market.state()).to.equal(2); // RESOLVED
    });

    it("should resolve with majority INVALID (2/3 oracles)", async function () {
      await market.connect(oracle1).submitResolution(3); // INVALID
      await market.connect(oracle2).submitResolution(3); // INVALID - resolves immediately

      expect(await market.outcome()).to.equal(3); // INVALID
      expect(await market.state()).to.equal(2); // RESOLVED
    });

    it("should not resolve without 2/3 majority", async function () {
      await market.connect(oracle1).submitResolution(1); // YES
      await market.connect(oracle2).submitResolution(2); // NO

      // Still CLOSED, not RESOLVED (no 2/3 majority yet)
      expect(await market.state()).to.equal(1); // CLOSED
    });
  });

  describe("Claiming Rewards", function () {
    beforeEach(async function () {
      // Place bets: user1 bets YES, user2 bets NO
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("10") }); // YES
      await market.connect(user2).placeBet(1, { value: ethers.parseEther("5") }); // NO

      // Close market
      await time.increase(ONE_DAY + 1);
      await market.closeMarket();
    });

    it("should pay winner proportionally (YES wins)", async function () {
      // Resolve as YES (2 votes is enough)
      await market.connect(oracle1).submitResolution(1);
      await market.connect(oracle2).submitResolution(1);

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      const tx = await market.connect(user1).claim();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      // user1 should receive total pool (15 ROSE) since they had all YES bets
      const payout = balanceAfter - balanceBefore + gasUsed;
      expect(payout).to.equal(ethers.parseEther("15"));
    });

    it("should pay winner proportionally (NO wins)", async function () {
      // Resolve as NO (2 votes is enough)
      await market.connect(oracle1).submitResolution(2);
      await market.connect(oracle2).submitResolution(2);

      const balanceBefore = await ethers.provider.getBalance(user2.address);
      const tx = await market.connect(user2).claim();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(user2.address);

      // user2 should receive total pool (15 ROSE) since they had all NO bets
      const payout = balanceAfter - balanceBefore + gasUsed;
      expect(payout).to.equal(ethers.parseEther("15"));
    });

    it("should refund on INVALID outcome", async function () {
      // Resolve as INVALID (2 votes is enough)
      await market.connect(oracle1).submitResolution(3);
      await market.connect(oracle2).submitResolution(3);

      const balance1Before = await ethers.provider.getBalance(user1.address);
      const tx1 = await market.connect(user1).claim();
      const receipt1 = await tx1.wait();
      const gas1 = receipt1!.gasUsed * receipt1!.gasPrice;
      const balance1After = await ethers.provider.getBalance(user1.address);

      // user1 should get 10 ROSE back
      expect(balance1After - balance1Before + gas1).to.equal(ethers.parseEther("10"));

      const balance2Before = await ethers.provider.getBalance(user2.address);
      const tx2 = await market.connect(user2).claim();
      const receipt2 = await tx2.wait();
      const gas2 = receipt2!.gasUsed * receipt2!.gasPrice;
      const balance2After = await ethers.provider.getBalance(user2.address);

      // user2 should get 5 ROSE back
      expect(balance2After - balance2Before + gas2).to.equal(ethers.parseEther("5"));
    });

    it("should reject double claims", async function () {
      await market.connect(oracle1).submitResolution(1);
      await market.connect(oracle2).submitResolution(1);

      await market.connect(user1).claim();

      await expect(market.connect(user1).claim()).to.be.revertedWith("Already claimed");
    });

    it("should reject claims with no position", async function () {
      await market.connect(oracle1).submitResolution(1);
      await market.connect(oracle2).submitResolution(1);

      await expect(market.connect(owner).claim()).to.be.revertedWith("No position");
    });

    it("should reject claims before resolution", async function () {
      await expect(market.connect(user1).claim()).to.be.revertedWith("Market not resolved");
    });
  });

  describe("Oracle Slashing", function () {
    beforeEach(async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") });
      await time.increase(ONE_DAY + 1);
      await market.closeMarket();
    });

    it("should slash minority voters", async function () {
      const stakeBefore = (await oracleRegistry.oracles(oracle3.address)).stake;

      // oracle3 votes NO (will be minority), then oracle1 and oracle2 vote YES to resolve
      await market.connect(oracle3).submitResolution(2); // NO (will be minority)
      await market.connect(oracle1).submitResolution(1); // YES
      await market.connect(oracle2).submitResolution(1); // YES - triggers resolution with 2/3 majority

      const stakeAfter = (await oracleRegistry.oracles(oracle3.address)).stake;
      const oracleInfo = await oracleRegistry.oracles(oracle3.address);

      expect(stakeAfter).to.be.lessThan(stakeBefore);
      expect(oracleInfo.failedResolutions).to.equal(1);
    });

    it("should reward majority voters", async function () {
      await market.connect(oracle1).submitResolution(1); // YES
      await market.connect(oracle2).submitResolution(1); // YES

      const oracle1Info = await oracleRegistry.oracles(oracle1.address);
      expect(oracle1Info.successfulResolutions).to.equal(1);
    });
  });

  describe("Per-Market Oracle Selection", function () {
    it("should return market oracles via getMarketOracles()", async function () {
      const oracles = await market.getMarketOracles();
      expect(oracles.length).to.equal(3);
      expect(oracles).to.include(oracle1.address);
      expect(oracles).to.include(oracle2.address);
      expect(oracles).to.include(oracle3.address);
    });

    it("should reject globally registered oracle not assigned to market", async function () {
      const oracle4 = (await ethers.getSigners())[6];
      await oracleRegistry.connect(oracle4).register({ value: MIN_STAKE });

      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") });
      await time.increase(ONE_DAY + 1);
      await market.closeMarket();

      // oracle4 is registered globally but not assigned to this market
      await expect(
        market.connect(oracle4).submitResolution(1)
      ).to.be.revertedWith("Not an oracle for this market");
    });
  });

  describe("Odds Calculation", function () {
    it("should return 50-50 odds with no bets", async function () {
      const odds = await market.getOdds();
      expect(odds.yesBps).to.equal(5000);
      expect(odds.noBps).to.equal(5000);
    });

    it("should update public odds after interval", async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("3") }); // YES
      await market.connect(user2).placeBet(1, { value: ethers.parseEther("1") }); // NO

      // Wait for odds update interval (5 minutes)
      await time.increase(5 * 60 + 1);
      await market.updateOdds();

      const odds = await market.getOdds();
      expect(odds.yesBps).to.equal(7500); // 75%
      expect(odds.noBps).to.equal(2500); // 25%
    });
  });

  describe("Force Resolution", function () {
    beforeEach(async function () {
      await market.connect(user1).placeBet(0, { value: ethers.parseEther("1") });
      await time.increase(ONE_DAY + 1);
      await market.closeMarket();
    });

    it("should allow force resolution after deadline with votes", async function () {
      // Only one oracle votes
      await market.connect(oracle1).submitResolution(1); // YES

      // Wait for resolution window to pass (24 hours)
      await time.increase(ONE_DAY + 1);

      await market.forceResolve();
      expect(await market.state()).to.equal(2); // RESOLVED
      expect(await market.outcome()).to.equal(1); // YES (plurality)
    });

    it("should reject force resolution before deadline", async function () {
      await market.connect(oracle1).submitResolution(1);

      await expect(market.forceResolve()).to.be.revertedWith("Resolution window not over");
    });

    it("should reject force resolution with no votes", async function () {
      await time.increase(ONE_DAY + 1);

      await expect(market.forceResolve()).to.be.revertedWith("No votes submitted");
    });
  });
});
