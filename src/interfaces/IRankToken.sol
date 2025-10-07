// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ILockableERC1155} from "./ILockableERC1155.sol";

interface IRankToken is ILockableERC1155 {
    event RankingInstanceUpdated(address indexed newRankingInstance);

    // event LevelUp(address indexed account, uint256 id);

    /**
     * @dev Mints a specified amount of tokens to an account. `to` is the address of the account to mint the tokens to. `amount` is the amount of tokens to mint. `poolId` is the ID of the pool. `data` is the additional data.
     */
    function mint(address to, uint256 amount, uint256 poolId, bytes memory data) external;

    /**
     * @dev Mints specified amounts of tokens to an account. `to` is the address of the account to mint the tokens to. `ids` is the array of IDs of the tokens to mint. `amounts` is the array of amounts of tokens to mint. `data` is the additional data.
     */
    function batchMint(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external;

    // /**
    //  * @dev Updates the ranking instance. `newRankingInstance` is the address of the new ranking instance.
    //  *
    //  * emits a _RankingInstanceUpdated_ event.
    //  */
    // function updateRankingInstance(address newRankingInstance) external;

    /**
     * @dev Gets the ranking instance which can emit new rank updates and mint rank tokens.
     *
     * Returns:
     *
     * - The address of the ranking instance.
     */
    // function getRankingInstance() external view returns (address);

    // /**
    //  * @dev Finds the new rank of an account. `account` is the address of the account. `oldRank` is the old rank of the account.
    //  * It checks the balance of the account and returns the new rank that can be upgraded to.
    //  *
    //  * Returns:
    //  *
    //  * - The new rank of the account.
    //  */
    // function findNewRank(address account, uint256 oldRank) external view returns (uint256);

    // /**
    //  * @dev Gets the rank of an account. `account` is the address of the account.
    //  *
    //  * Returns:
    //  *
    //  * - The rank of the account.
    //  */
    // function getAccountRank(address account) external view returns (uint256);
}
