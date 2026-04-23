// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract OracleRegistry {

    // ============ Constants ============
    uint256 public constant MIN_STAKE = 100 ether;        // 100 ROSE minimum
    uint256 public constant SLASH_PERCENT = 50;           // 50% slash for wrong vote
    uint256 public constant MIN_ORACLES_FOR_RESOLUTION = 3;

    // ============ State ============
    struct Oracle {
        uint256 stake;
        uint256 successfulResolutions;
        uint256 failedResolutions;
        bool isActive;
    }

    mapping(address => Oracle) public oracles;
    address[] public oracleList;

    // ============ Events ============
    event OracleRegistered(address indexed oracle, uint256 stake);
    event OracleUnregistered(address indexed oracle, uint256 returned);
    event OracleSlashed(address indexed oracle, uint256 amount);

    // ============ Modifiers ============
    modifier onlyOracle() {
        require(oracles[msg.sender].isActive, "Not an active oracle");
        _;
    }

    // ============ External Functions ============

    /// @notice Register as an oracle by staking ROSE
    function register() external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(!oracles[msg.sender].isActive, "Already registered");

        oracles[msg.sender] = Oracle({
            stake: msg.value,
            successfulResolutions: 0,
            failedResolutions: 0,
            isActive: true
        });
        oracleList.push(msg.sender);

        emit OracleRegistered(msg.sender, msg.value);
    }

    /// @notice Unregister and withdraw stake (if not in active dispute)
    function unregister() external onlyOracle {
        Oracle storage oracle = oracles[msg.sender];
        uint256 toReturn = oracle.stake;

        oracle.isActive = false;
        oracle.stake = 0;

        // Remove from list (swap and pop)
        for (uint i = 0; i < oracleList.length; i++) {
            if (oracleList[i] == msg.sender) {
                oracleList[i] = oracleList[oracleList.length - 1];
                oracleList.pop();
                break;
            }
        }

        payable(msg.sender).transfer(toReturn);
        emit OracleUnregistered(msg.sender, toReturn);
    }

    /// @notice Check if address is an active oracle
    function isOracle(address addr) external view returns (bool) {
        return oracles[addr].isActive;
    }

    /// @notice Get number of active oracles
    function getOracleCount() external view returns (uint256) {
        return oracleList.length;
    }

    /// @notice Slash an oracle's stake (called by PredictionMarket)
    function slash(address oracle, uint256 percent) external {
        // In production, add access control here
        Oracle storage o = oracles[oracle];
        uint256 slashAmount = (o.stake * percent) / 100;
        o.stake -= slashAmount;
        o.failedResolutions++;

        emit OracleSlashed(oracle, slashAmount);
    }

    /// @notice Reward oracle for correct resolution
    function recordSuccess(address oracle) external {
        oracles[oracle].successfulResolutions++;
    }
}
