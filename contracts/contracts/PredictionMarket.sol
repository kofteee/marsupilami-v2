// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./OracleRegistry.sol";

contract PredictionMarket {

    // ============ Enums ============
    enum Choice { YES, NO }
    enum Outcome { UNRESOLVED, YES, NO, INVALID }
    enum MarketState { OPEN, CLOSED, RESOLVED, CANCELLED }

    // ============ Structs ============
    struct Position {
        uint256 yesAmount;
        uint256 noAmount;
        bool hasClaimed;
    }

    struct OracleVote {
        Outcome vote;
        bool hasVoted;
    }

    // ============ Constants ============
    uint256 public constant ODDS_UPDATE_INTERVAL = 5 minutes;
    uint256 public constant RESOLUTION_WINDOW = 24 hours;
    uint256 public constant MIN_BET = 0.01 ether;

    // ============ Immutables ============
    OracleRegistry public immutable oracleRegistry;
    address public immutable creator;
    string public question;
    uint256 public immutable bettingDeadline;
    uint256 public immutable resolutionDeadline;

    // ============ Public State (visible on-chain) ============
    MarketState public state;
    Outcome public outcome;
    uint256 public lastOddsUpdate;
    uint256 public publicYesPool;    // Updated only at intervals
    uint256 public publicNoPool;     // Updated only at intervals
    uint256 public totalDeposits;

    // ============ PRIVATE State (hidden by TEE) ============
    // These are confidential - only accessible inside the enclave
    uint256 private yesPool;
    uint256 private noPool;
    uint256 private pendingYesPool;  // Accumulates between updates
    uint256 private pendingNoPool;
    mapping(address => Position) private positions;
    address[] private bettors;

    // Oracle resolution
    mapping(address => OracleVote) public oracleVotes;
    address[] public votedOracles;
    uint256 public yesVotes;
    uint256 public noVotes;
    uint256 public invalidVotes;

    // ============ Events ============
    event BetPlaced(address indexed user, uint256 amount);  // Note: choice NOT emitted
    event OddsUpdated(uint256 yesPool, uint256 noPool, uint256 timestamp);
    event MarketClosed(uint256 timestamp);
    event MarketResolved(Outcome outcome);
    event RewardClaimed(address indexed user, uint256 amount);
    event OracleVoted(address indexed oracle, uint256 timestamp);  // vote NOT emitted

    // ============ Modifiers ============
    modifier onlyOpen() {
        require(state == MarketState.OPEN, "Market not open");
        require(block.timestamp < bettingDeadline, "Betting period ended");
        _;
    }

    modifier onlyClosed() {
        require(state == MarketState.CLOSED, "Market not closed");
        _;
    }

    modifier onlyResolved() {
        require(state == MarketState.RESOLVED, "Market not resolved");
        _;
    }

    // ============ Constructor ============
    constructor(
        address _oracleRegistry,
        string memory _question,
        uint256 _bettingDuration
    ) {
        oracleRegistry = OracleRegistry(_oracleRegistry);
        creator = msg.sender;
        question = _question;
        bettingDeadline = block.timestamp + _bettingDuration;
        resolutionDeadline = bettingDeadline + RESOLUTION_WINDOW;
        state = MarketState.OPEN;
        lastOddsUpdate = block.timestamp;
    }

    // ============ Core Betting Functions ============

    /// @notice Place a private bet
    /// @param choice The bet choice (YES=0, NO=1) - this parameter is encrypted by Sapphire
    function placeBet(Choice choice) external payable onlyOpen {
        require(msg.value >= MIN_BET, "Bet too small");

        // Update user's position (PRIVATE)
        Position storage pos = positions[msg.sender];
        if (pos.yesAmount == 0 && pos.noAmount == 0) {
            bettors.push(msg.sender);
        }

        // Add to pending pools (will be revealed at next interval)
        if (choice == Choice.YES) {
            pos.yesAmount += msg.value;
            pendingYesPool += msg.value;
            yesPool += msg.value;
        } else {
            pos.noAmount += msg.value;
            pendingNoPool += msg.value;
            noPool += msg.value;
        }

        totalDeposits += msg.value;

        // Check if we should update public odds
        _maybeUpdateOdds();

        // Emit event WITHOUT the choice
        emit BetPlaced(msg.sender, msg.value);
    }

    /// @notice Update public odds if interval has passed
    function _maybeUpdateOdds() internal {
        if (block.timestamp >= lastOddsUpdate + ODDS_UPDATE_INTERVAL) {
            // Move pending pools to public pools
            publicYesPool += pendingYesPool;
            publicNoPool += pendingNoPool;
            pendingYesPool = 0;
            pendingNoPool = 0;
            lastOddsUpdate = block.timestamp;

            emit OddsUpdated(publicYesPool, publicNoPool, block.timestamp);
        }
    }

    /// @notice Force odds update (anyone can call after interval)
    function updateOdds() external {
        require(
            block.timestamp >= lastOddsUpdate + ODDS_UPDATE_INTERVAL,
            "Too soon"
        );
        _maybeUpdateOdds();
    }

    // ============ Market Lifecycle ============

    /// @notice Close the market for betting (anyone can call after deadline)
    function closeMarket() external {
        require(state == MarketState.OPEN, "Not open");
        require(block.timestamp >= bettingDeadline, "Betting period not ended");

        state = MarketState.CLOSED;

        // Final odds update
        publicYesPool = yesPool;
        publicNoPool = noPool;

        emit MarketClosed(block.timestamp);
    }

    // ============ Oracle Resolution ============

    /// @notice Oracle submits their resolution vote
    /// @param _outcome The oracle's vote (YES=1, NO=2, INVALID=3)
    function submitResolution(Outcome _outcome) external onlyClosed {
        require(oracleRegistry.isOracle(msg.sender), "Not an oracle");
        require(!oracleVotes[msg.sender].hasVoted, "Already voted");
        require(_outcome != Outcome.UNRESOLVED, "Invalid vote");
        require(block.timestamp < resolutionDeadline, "Resolution window closed");

        oracleVotes[msg.sender] = OracleVote({
            vote: _outcome,
            hasVoted: true
        });
        votedOracles.push(msg.sender);

        if (_outcome == Outcome.YES) yesVotes++;
        else if (_outcome == Outcome.NO) noVotes++;
        else invalidVotes++;

        emit OracleVoted(msg.sender, block.timestamp);

        // Check if we have enough votes to resolve
        _maybeResolve();
    }

    /// @notice Check if consensus reached and resolve
    function _maybeResolve() internal {
        uint256 totalVotes = votedOracles.length;
        uint256 required = oracleRegistry.getOracleCount();

        // Need at least 3 oracles or all registered oracles
        if (totalVotes < 3 && totalVotes < required) {
            return;
        }

        // Check for 2/3 majority
        uint256 majorityThreshold = (totalVotes * 2) / 3;

        if (yesVotes > majorityThreshold) {
            _resolve(Outcome.YES);
        } else if (noVotes > majorityThreshold) {
            _resolve(Outcome.NO);
        } else if (invalidVotes > majorityThreshold) {
            _resolve(Outcome.INVALID);
        }
        // Otherwise, wait for more votes
    }

    /// @notice Finalize resolution and handle slashing
    function _resolve(Outcome _outcome) internal {
        outcome = _outcome;
        state = MarketState.RESOLVED;

        // Slash oracles who voted against consensus
        for (uint i = 0; i < votedOracles.length; i++) {
            address oracle = votedOracles[i];
            if (oracleVotes[oracle].vote != _outcome) {
                oracleRegistry.slash(oracle, 10);  // 10% slash for minority vote
            } else {
                oracleRegistry.recordSuccess(oracle);
            }
        }

        emit MarketResolved(_outcome);
    }

    /// @notice Emergency resolution if oracles don't respond
    function forceResolve() external {
        require(state == MarketState.CLOSED, "Not closed");
        require(block.timestamp > resolutionDeadline, "Resolution window not over");
        require(votedOracles.length > 0, "No votes submitted");

        // Resolve with plurality (not majority)
        if (yesVotes >= noVotes && yesVotes >= invalidVotes) {
            _resolve(Outcome.YES);
        } else if (noVotes >= invalidVotes) {
            _resolve(Outcome.NO);
        } else {
            _resolve(Outcome.INVALID);
        }
    }

    // ============ Claiming ============

    /// @notice Claim winnings after resolution
    function claim() external onlyResolved {
        Position storage pos = positions[msg.sender];
        require(!pos.hasClaimed, "Already claimed");
        require(pos.yesAmount > 0 || pos.noAmount > 0, "No position");

        uint256 payout = 0;

        if (outcome == Outcome.INVALID) {
            // Refund all bets
            payout = pos.yesAmount + pos.noAmount;
        } else if (outcome == Outcome.YES) {
            // Pari-mutuel: winner gets proportional share of total pool
            // payout = userYesBet * (totalPool / yesPool)
            if (pos.yesAmount > 0) {
                uint256 totalPool = yesPool + noPool;
                payout = (pos.yesAmount * totalPool) / yesPool;
            }
        } else if (outcome == Outcome.NO) {
            if (pos.noAmount > 0) {
                uint256 totalPool = yesPool + noPool;
                payout = (pos.noAmount * totalPool) / noPool;
            }
        }

        pos.hasClaimed = true;

        if (payout > 0) {
            payable(msg.sender).transfer(payout);
            emit RewardClaimed(msg.sender, payout);
        }
    }

    // ============ View Functions ============

    /// @notice Get current public odds (YES probability in basis points)
    function getOdds() external view returns (uint256 yesBps, uint256 noBps) {
        uint256 total = publicYesPool + publicNoPool;
        if (total == 0) {
            return (5000, 5000);  // 50-50 default
        }
        yesBps = (publicYesPool * 10000) / total;
        noBps = 10000 - yesBps;
    }

    /// @notice Get user's position (only callable by the user themselves)
    /// This is a PRIVATE view - Sapphire will only return data to the caller
    function getMyPosition() external view returns (
        uint256 yesAmount,
        uint256 noAmount,
        bool hasClaimed
    ) {
        Position storage pos = positions[msg.sender];
        return (pos.yesAmount, pos.noAmount, pos.hasClaimed);
    }

    /// @notice Get market info
    function getMarketInfo() external view returns (
        string memory _question,
        uint256 _bettingDeadline,
        uint256 _resolutionDeadline,
        MarketState _state,
        Outcome _outcome,
        uint256 _publicYesPool,
        uint256 _publicNoPool,
        uint256 _totalDeposits
    ) {
        return (
            question,
            bettingDeadline,
            resolutionDeadline,
            state,
            outcome,
            publicYesPool,
            publicNoPool,
            totalDeposits
        );
    }
}
