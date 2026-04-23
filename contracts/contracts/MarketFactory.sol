// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PredictionMarket.sol";
import "./OracleRegistry.sol";

contract MarketFactory {

    OracleRegistry public immutable oracleRegistry;
    address[] public allMarkets;

    event MarketCreated(
        address indexed market,
        address indexed creator,
        string question,
        uint256 bettingDeadline
    );

    constructor(address _oracleRegistry) {
        oracleRegistry = OracleRegistry(_oracleRegistry);
    }

    /// @notice Create a new prediction market
    /// @param question The question to predict
    /// @param bettingDuration How long betting is open (in seconds)
    function createMarket(
        string calldata question,
        uint256 bettingDuration
    ) external returns (address) {
        require(bettingDuration >= 1 hours, "Duration too short");
        require(bettingDuration <= 30 days, "Duration too long");
        require(bytes(question).length > 0, "Empty question");
        require(bytes(question).length <= 500, "Question too long");

        PredictionMarket market = new PredictionMarket(
            address(oracleRegistry),
            question,
            bettingDuration
        );

        allMarkets.push(address(market));

        emit MarketCreated(
            address(market),
            msg.sender,
            question,
            block.timestamp + bettingDuration
        );

        return address(market);
    }

    /// @notice Get total number of markets
    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Get markets with pagination
    function getMarkets(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory)
    {
        uint256 total = allMarkets.length;
        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allMarkets[i];
        }
        return result;
    }
}
