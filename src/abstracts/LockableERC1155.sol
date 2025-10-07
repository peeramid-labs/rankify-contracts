// SPDX-License-Identifier: Apache-2.0

pragma solidity ^0.8.20;
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";
import {ILockableERC1155} from "../interfaces/ILockableERC1155.sol";

/**
 * @title LockableERC1155
 * @dev This is an abstract contract that extends the ERC1155 token contract and implements the ILockableERC1155 interface.
 *      It provides functionality to lock and unlock token amounts for specific accounts and IDs.
 */
abstract contract LockableERC1155 is ERC1155BurnableUpgradeable, ILockableERC1155 {
    struct LockableERC1155Storage {
        mapping(address => mapping(uint256 tokenId => uint256)) lockedAmounts;
    }

    bytes32 constant LOCKABLE_TOKEN_STORAGE_POSITION = keccak256("erc1155.lockable.storage.position");

    function getLockableERC1155Storage() private pure returns (LockableERC1155Storage storage s) {
        bytes32 position = LOCKABLE_TOKEN_STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    /**
     * @dev Locks a specified amount of tokens for a given account and token ID.
     * If the account does not have enough balance to lock the specified amount,
     * the function will revert with an "insufficient" error message.
     * Emits a `TokensLocked` event after successfully locking the tokens.
     * @param account The address of the account to lock tokens for.
     * @param id The ID of the token to lock.
     * @param amount The amount of tokens to lock.
     */
    function lock(address account, uint256 id, uint256 amount) public virtual {
        LockableERC1155Storage storage s = getLockableERC1155Storage();
        if (balanceOf(account, id) < s.lockedAmounts[account][id] + amount)
            revert insufficient(id, s.lockedAmounts[account][id], amount);
        s.lockedAmounts[account][id] += amount;
        emit TokensLocked(account, id, amount);
    }

    /**
     * @dev Unlocks a specified amount of tokens for a given account and token ID.
     * If the locked amount is less than the specified amount, it reverts with an "insufficient" error message.
     * Emits a `TokensUnlocked` event after unlocking the tokens.
     * @param account The address of the account to unlock tokens for.
     * @param id The ID of the token to unlock.
     * @param amount The amount of tokens to unlock.
     */
    function unlock(address account, uint256 id, uint256 amount) public virtual {
        LockableERC1155Storage storage s = getLockableERC1155Storage();
        if (s.lockedAmounts[account][id] < amount) revert insufficient(id, s.lockedAmounts[account][id], amount);
        s.lockedAmounts[account][id] -= amount;
        emit TokensUnlocked(account, id, amount);
    }

    /**
     * @dev Returns the unlocked balance of a specific ERC1155 token for an account.
     * The unlocked balance is calculated by subtracting the locked amount from the total balance.
     * @param account The address of the account.
     * @param id The ID of the ERC1155 token.
     * @return The unlocked balance of the ERC1155 token for the account.
     */
    function unlockedBalanceOf(address account, uint256 id) public view returns (uint256) {
        LockableERC1155Storage storage s = getLockableERC1155Storage();
        return balanceOf(account, id) - s.lockedAmounts[account][id];
    }

    /**
     * @dev Hook function that is called before any token transfer.
     * It checks if the transfer is allowed based on the locked amounts of the tokens.
     * If the transfer is not allowed, it reverts with an error message.
     * @param from The address from which the tokens are being transferred.
     * @param to The address to which the tokens are being transferred.
     * @param ids An array of token IDs being transferred.
     * @param values An array of token amounts being transferred.
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        for (uint256 i = 0; i < ids.length; ++i) {
            if (from != address(0)) {
                if (getLockableERC1155Storage().lockedAmounts[from][ids[i]] + values[i] > balanceOf(from, ids[i])) {
                    revert insufficient(
                        ids[i],
                        balanceOf(from, ids[i]),
                        getLockableERC1155Storage().lockedAmounts[from][ids[i]] + values[i]
                    );
                }
            }
        }
        super._update(from, to, ids, values);
    }

    function burn(
        address account,
        uint256 id,
        uint256 value
    ) public virtual override(ERC1155BurnableUpgradeable, ILockableERC1155) {
        if (getLockableERC1155Storage().lockedAmounts[account][id] + value > balanceOf(account, id))
            revert insufficient(
                id,
                balanceOf(account, id),
                getLockableERC1155Storage().lockedAmounts[account][id] + value
            );
        super.burn(account, id, value);
    }
}
