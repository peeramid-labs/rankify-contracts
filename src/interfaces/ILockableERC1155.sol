// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC1155} from "@openzeppelin/contracts/interfaces/IERC1155.sol";

/**
 * @title ILockableERC1155
 * @dev Interface for a lockable ERC1155 token contract.
 */
interface ILockableERC1155 is IERC1155 {
    error insufficient(uint256 id, uint256 balance, uint256 required);

    event TokensLocked(address indexed account, uint256 indexed id, uint256 value);

    event TokensUnlocked(address indexed account, uint256 indexed id, uint256 value);

    /**
     * @dev Locks a specified amount of tokens for a given account and token ID. `account` is the address of the account to lock the tokens for. `id` is the ID of the token to lock. `amount` is the amount of tokens to lock.
     *
     * emits a _TokensLocked_ event.
     */
    function lock(address account, uint256 id, uint256 amount) external;

    /**
     * @dev Unlocks a specified amount of tokens for a given account and token ID. `account` is the address of the account to unlock the tokens for. `id` is the ID of the token to unlock. `amount` is the amount of tokens to unlock.
     *
     * emits a _TokensUnlocked_ event.
     */
    function unlock(address account, uint256 id, uint256 amount) external;

    /**
     * @dev Returns the unlocked balance of tokens for a given account and token ID. `account` is the address of the account to check the unlocked balance for. `id` is the ID of the token to check the unlocked balance for.
     *
     * Returns:
     *
     * - The unlocked balance of tokens.
     */
    function unlockedBalanceOf(address account, uint256 id) external view returns (uint256);

    function burn(address account, uint256 id, uint256 value) external;
}
