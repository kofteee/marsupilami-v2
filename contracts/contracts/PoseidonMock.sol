// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PoseidonMock {
    function poseidon(uint256[2] memory inputs) external pure returns (uint256) {
        return uint256(keccak256(abi.encode(inputs)));
    }
}
