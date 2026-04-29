// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PredictionMarket.sol";
import "./OracleRegistry.sol";

contract MarketFactory {
    address[] public allMarkets;
    OracleRegistry public immutable oracleRegistry;
    address public immutable verifier;
    address public immutable poseidon;

    event MarketCreated(
        address indexed marketAddress,
        address indexed creator,
        string question,
        string category,
        uint256 bettingDeadline
    );

    constructor(address _oracleRegistry, address _verifier, address _poseidon) {
        oracleRegistry = OracleRegistry(_oracleRegistry);
        verifier = _verifier;
        poseidon = _poseidon;
    }

    function createMarket(
        string calldata question,
        string calldata category,
        uint256 bettingDuration,
        address[] calldata oracles
    ) external payable returns (address) {
        // Reduced requirements for testing and flexibility
        require(bettingDuration >= 1 minutes, "Duration too short");
        require(bettingDuration <= 365 days, "Duration too long");
        require(bytes(question).length > 0, "Empty question");
        require(oracles.length == 3, "Must provide exactly 3 oracles");

        PredictionMarket market = new PredictionMarket{value: 1 ether}(
            address(oracleRegistry),
            question,
            category,
            bettingDuration,
            oracles,
            verifier,
            poseidon
        );

        allMarkets.push(address(market));

        emit MarketCreated(
            address(market),
            msg.sender,
            question,
            category,
            block.timestamp + bettingDuration
        );

        return address(market);
    }

    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    function getMarkets(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 end = offset + limit;
        if (end > allMarkets.length) end = allMarkets.length;
        uint256 size = end - offset;
        address[] memory markets = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            markets[i] = allMarkets[offset + i];
        }
        return markets;
    }
}
