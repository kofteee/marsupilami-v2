// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./OracleRegistry.sol";

interface IVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[4] calldata input
    ) external view returns (bool);
}

interface IPoseidon {
    function poseidon(uint256[2] memory inputs) external pure returns (uint256);
}

contract PredictionMarket {

    // ============ Enums ============
    enum Choice { YES, NO }
    enum Outcome { UNRESOLVED, YES, NO, INVALID }
    enum MarketState { OPEN, CLOSED, RESOLVED, CANCELLED }

    // ============ Structs ============
    // No public positions mapping - everything is ZK

    struct OracleVote {
        Outcome vote;
        bool hasVoted;
    }

    // ============ Constants ============
    uint256 public constant ODDS_UPDATE_INTERVAL = 2 minutes;
    uint256 public constant RESOLUTION_WINDOW = 24 hours;
    uint256 public constant MIN_BET = 0.01 ether;

    // ============ Immutables ============
    OracleRegistry public immutable oracleRegistry;
    address public immutable creator;
    string public question;
    string public category;
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
    // bettors array removed - not needed for ZK

    // Oracle resolution
    mapping(address => OracleVote) public oracleVotes;
    address[] public votedOracles;
    uint256 public yesVotes;
    uint256 public noVotes;
    uint256 public invalidVotes;

    // Per-market oracle whitelist
    address[] public marketOracles;
    mapping(address => bool) public isMarketOracle;

    // ============ ZK / Privacy State ============
    IVerifier public verifier;
    IPoseidon public poseidon;

    mapping(bytes32 => bool) public isSpent;
    
    // Incremental Merkle Tree
    uint256 public constant TREE_LEVELS = 20;
    bytes32[TREE_LEVELS] public filledSubtrees;
    bytes32[TREE_LEVELS] public zeros;
    uint256 public nextLeafIndex;
    mapping(bytes32 => bool) public roots;

    // ============ Events ============
    event PrivateBetPlaced(uint256 indexed leafIndex, bytes32 indexed commitment, uint256 amount);
    event OddsUpdated(uint256 yesPool, uint256 noPool, uint256 timestamp);
    event MarketClosed(uint256 timestamp);
    event MarketResolved(Outcome outcome);
    event RewardClaimed(address indexed user, uint256 amount);
    event PrivateClaimed(bytes32 indexed nullifierHash, address indexed recipient, uint256 amount);
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
        string memory _category,
        uint256 _bettingDuration,
        address[] memory _oracles,
        address _verifier,
        address _poseidon
    ) payable {
        oracleRegistry = OracleRegistry(_oracleRegistry);
        creator = msg.sender;
        question = _question;
        category = _category;
        bettingDeadline = block.timestamp + _bettingDuration;
        resolutionDeadline = bettingDeadline + RESOLUTION_WINDOW;
        state = MarketState.OPEN;
        lastOddsUpdate = block.timestamp;
        verifier = IVerifier(_verifier);
        poseidon = IPoseidon(_poseidon);

        // Seed liquidity to prevent 100% odds for first bettor
        if (msg.value > 0) {
            uint256 half = msg.value / 2;
            yesPool = half;
            noPool = msg.value - half;
            publicYesPool = yesPool;
            publicNoPool = noPool;
            totalDeposits = msg.value;
        }

        // Set oracles
        for (uint256 i = 0; i < _oracles.length; i++) {
            require(oracleRegistry.isOracle(_oracles[i]), "Oracle not registered");
            require(!isMarketOracle[_oracles[i]], "Duplicate oracle");
            marketOracles.push(_oracles[i]);
            isMarketOracle[_oracles[i]] = true;
        }

        _initMerkleTree();
    }

    // ============ Core Betting Functions ============

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
        require(isMarketOracle[msg.sender], "Not an oracle for this market");
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

        // Need at least 2 votes from the 3 market oracles
        if (totalVotes < 2) {
            return;
        }

        // 2 out of 3 = majority for this market
        if (yesVotes >= 2) {
            _resolve(Outcome.YES);
        } else if (noVotes >= 2) {
            _resolve(Outcome.NO);
        } else if (invalidVotes >= 2) {
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

    // ============ Private (ZK) Functions ============

    /// @notice Place a private bet using a ZK commitment
    function placeBetPrivate(bytes32 commitment, Choice choice) external payable onlyOpen {
        require(msg.value >= MIN_BET, "Bet too small");
        require(nextLeafIndex < 2**TREE_LEVELS, "Tree full");

        uint256 leafIndex = nextLeafIndex;
        _insert(commitment);

        if (choice == Choice.YES) {
            yesPool += msg.value;
            pendingYesPool += msg.value;
        } else {
            noPool += msg.value;
            pendingNoPool += msg.value;
        }
        totalDeposits += msg.value;

        _maybeUpdateOdds();

        emit PrivateBetPlaced(leafIndex, commitment, msg.value);
    }

    /// @notice Claim winnings using a ZK proof
    function claimWinningsPrivate(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[4] calldata input
    ) external onlyResolved {
        // input[0] = merkleRoot
        // input[1] = nullifierHash
        // input[2] = choice
        // input[3] = amount

        bytes32 merkleRoot = bytes32(input[0]);
        bytes32 nullifierHash = bytes32(input[1]);
        Choice choice = Choice(input[2]);
        uint256 amount = input[3];

        require(roots[merkleRoot], "Invalid Merkle root");
        require(!isSpent[nullifierHash], "Already spent");
        require(verifier.verifyProof(a, b, c, input), "Invalid ZK proof");

        isSpent[nullifierHash] = true;

        uint256 payout = _calculatePayout(choice, amount);
        require(payout > 0, "No winnings");

        payable(msg.sender).transfer(payout);
        emit PrivateClaimed(nullifierHash, msg.sender, payout);
    }

    function _calculatePayout(Choice _choice, uint256 _amount) internal view returns (uint256) {
        if (outcome == Outcome.INVALID) {
            return _amount;
        } else if (Outcome(uint8(_choice) + 1) == outcome) {
            uint256 totalPool = yesPool + noPool;
            uint256 winnerPool = (outcome == Outcome.YES) ? yesPool : noPool;
            if (winnerPool == 0) return _amount; // Safety check
            return (_amount * totalPool) / winnerPool;
        }
        return 0;
    }

    mapping(uint256 => bytes32) public leaves;
    mapping(uint256 => mapping(uint256 => bytes32)) public tree; // level => index => hash

    // ============ Merkle Tree Internal ============

    function _initMerkleTree() internal {
        // Level 0 zero is 0 for our circuits
        bytes32 currentZero = bytes32(0); 
        for (uint256 i = 0; i < TREE_LEVELS; i++) {
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
            
            uint256[2] memory inputs;
            inputs[0] = uint256(currentZero);
            inputs[1] = uint256(currentZero);
            currentZero = bytes32(poseidon.poseidon(inputs));
        }
        roots[currentZero] = true;
    }

    function _insert(bytes32 leaf) internal {
        uint256 currentIndex = nextLeafIndex;
        leaves[currentIndex] = leaf;
        tree[0][currentIndex] = leaf;
        nextLeafIndex++;
        
        bytes32 currentLevelHash = leaf;
        bytes32 left;
        bytes32 right;

        for (uint256 i = 0; i < TREE_LEVELS; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeros[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            
            uint256[2] memory inputs;
            inputs[0] = uint256(left);
            inputs[1] = uint256(right);
            currentLevelHash = bytes32(poseidon.poseidon(inputs));
            currentIndex /= 2;
            tree[i + 1][currentIndex] = currentLevelHash;
        }
        roots[currentLevelHash] = true;
    }

    /// @notice Get the Merkle proof for a given leaf index
    function getMerklePath(uint256 leafIndex) external view returns (bytes32[TREE_LEVELS] memory pathElements, uint256[TREE_LEVELS] memory pathIndices) {
        require(leafIndex < nextLeafIndex, "Invalid leaf index");
        
        uint256 currentIndex = leafIndex;
        for (uint256 i = 0; i < TREE_LEVELS; i++) {
            pathIndices[i] = currentIndex % 2;
            uint256 siblingIndex = (currentIndex % 2 == 0) ? currentIndex + 1 : currentIndex - 1;
            
            bytes32 siblingHash = tree[i][siblingIndex];
            if (siblingHash == bytes32(0)) {
                siblingHash = zeros[i];
            }
            pathElements[i] = siblingHash;
            currentIndex /= 2;
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

    /// @notice Get market info
    function getMarketInfo() external view returns (
        string memory _question,
        string memory _category,
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
            category,
            bettingDeadline,
            resolutionDeadline,
            state,
            outcome,
            publicYesPool,
            publicNoPool,
            totalDeposits
        );
    }

    /// @notice Get the market's designated oracles
    function getMarketOracles() external view returns (address[] memory) {
        return marketOracles;
    }
}
