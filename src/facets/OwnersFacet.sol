// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LibRankify} from "../libraries/LibRankify.sol";
import {OnlyOwnerDiamond} from "../modifiers/OnlyOwnerDiamond.sol";

/**
 * @title RankifyInstanceMainFacet
 * @notice Main facet for the Rankify protocol that handles game creation and management
 * @dev Implements core game functionality, ERC token receivers, and reentrancy protection
 * @author Peeramid Labs, 2024
 */
contract RankifyOwnersFacet is OnlyOwnerDiamond {
    using LibRankify for uint256;

    event WhitelistedGMAdded(address indexed _address);
    event WhitelistedGMRemoved(address indexed _address);

    function addWhitelistedGM(address _address) external onlyOwner {
        LibRankify.InstanceState storage state = LibRankify.instanceState();
        state.whitelistedGMs[_address] = true;
        emit WhitelistedGMAdded(_address);
    }

    function removeWhitelistedGM(address _address) external onlyOwner {
        LibRankify.InstanceState storage state = LibRankify.instanceState();
        state.whitelistedGMs[_address] = false;
        emit WhitelistedGMRemoved(_address);
    }

    function isWhitelistedGM(address _address) external view returns (bool) {
        LibRankify.InstanceState storage state = LibRankify.instanceState();
        return state.whitelistedGMs[_address];
    }
}
