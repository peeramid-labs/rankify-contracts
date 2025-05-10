// SPDX-License-Identifier: MIT
// Author: Tim Pechersky <@Peersky>

pragma solidity ^0.8.20;

import {MockERC20} from "../mocks/MockERC20.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

/**
 * @dev This library is used to simulate the vending machine coin acceptor state machine that:
 *  - Supports large number of positions; Each represents requirements to access different goods of the virtual vending machine.
 *  - Accepts multiple assets of following types: Native (Eth), ERC20, ERC721, and ERC1155 tokens that can be stacked together.
 *  - Allows for each individual asset action promise can be one of following:
 *      - Lock: The asset is locked in the acceptor with promise that asset will be returned to the sender at release funds time.
 *      - Bet: The asset is locked in the acceptor with promise that asset will be awarded to beneficiary at release funds time.
 *      - Pay: The asset is locked in the acceptor with promise that asset will be paid to payee at release funds time.
 *      - Burn: The asset is locked in the acceptor with promise that asset will be destroyed at release funds time.
 *  - Maintains each position balance, hence allowing multiple participants to line up for the same position.
 *  - Allows three actions:
 *      - Fund position with assets
 *      - Refund assets to user
 *      - Consume assets and provide goods to user
 *      - Consuming asset might take a form of
 *      - Transferring assets to payee
 *      - Burning assets
 *      - Awarding beneficiary with assets
 *      - Returning locked assets back to sender
 *
 * This library DOES enforces that any position can only be refunded or processed only within amount funded boundaries
 * This library DOES NOT store the addresses of senders, nor beneficiaries, nor payees.
 * This is to be stored within implementation contract.
 *
 *
 *  !!!!! IMPORTANT !!!!!
 * This library does NOT invocates reentrancy guards. It is implementation contract's responsibility to enforce reentrancy guards.
 * Reentrancy guards MUST be implemented in an implementing contract.
 *
 *  Usage:
 *
 *  0. Configure position via configure(...)
 *  1. fund position with assets via fund(...)
 *  2. release or refund assets via release(...) or refund(...)
 *  3. repeat steps 1 and 2 as needed.
 *  Position can be reconfigured at any time when it's effective balance is zero: `timesFunded - timesRefund - timesReleased = 0`
 *
 *
 * Test state:
 * This library most functionality has been tested: see ../tests/LibCoinVending.ts and ../tests/report.md for details.
 *
 * ERC721 token is checked only for "HAVE" condition since putting requirements on non fungible token id yet to be resolved.
 * (see ERC721 section in the code below)
 *
 * This library has not been yet audited
 *
 */
library LibCoinVending {
    struct Condition {
        mapping(ContractTypes => mapping(address => mapping(uint256 => ContractCondition))) contracts;
        NumericCondition ethValues;
        uint256 timesRefunded;
        uint256 timesReleased;
        uint256 timesFunded;
        ContractTypes[] contractTypes;
        address[] contractAddresses;
        uint256[] contractIds;
        bool _isConfigured;
    }
    enum RequirementTypes {
        HAVE,
        LOCK,
        BURN,
        BET,
        PAY
    }

    struct TransactionProperties {
        bytes data;
        uint256 amount;
    }
    struct ContractCondition {
        TransactionProperties have;
        TransactionProperties lock;
        TransactionProperties burn;
        TransactionProperties pay;
        TransactionProperties bet;
    }

    struct NumericCondition {
        uint256 have;
        uint256 lock;
        uint256 burn;
        uint256 pay;
        uint256 bet;
    }

    enum TransferTypes {
        FUND,
        REFUND,
        RELEASE
    }

    struct ConditionReturn {
        NumericCondition ethValues;
        uint256 timesRefunded;
        uint256 timesReleased;
        uint256 timesFunded;
        address[] contractAddresses;
        uint256[] contractIds;
        ContractTypes[] contractTypes;
        bool _isConfigured;
    }

    struct configSmartRequirement {
        address contractAddress;
        uint256 contractId;
        ContractTypes contractType;
        ContractCondition contractRequirement;
    }

    struct ConfigPosition {
        NumericCondition ethValues;
        configSmartRequirement[] contracts;
    }

    struct LibCoinVendingStorage {
        mapping(bytes32 => Condition) positions;
        address beneficiary;
    }

    enum ContractTypes {
        ERC20,
        ERC1155,
        ERC721
    }

    bytes32 constant COIN_VENDING_STORAGE_POSITION = keccak256("coin.vending.storage.position");

    function coinVendingPosition(bytes32 position) internal view returns (Condition storage) {
        return coinVendingStorage().positions[keccak256(abi.encode(position))];
    }

    function coinVendingStorage() internal pure returns (LibCoinVendingStorage storage es) {
        bytes32 position = COIN_VENDING_STORAGE_POSITION;
        assembly {
            es.slot := position
        }
    }

    /**
     * @dev Transfers a specified amount of tokens from one address to another, or burns them if the destination address is zero.
     *
     * Requirements:
     *
     * - The `value` must be non-zero.
     * - The `from` address must have a sufficient token balance.
     * - If the `from` address is not this contract, it must have approved this contract to transfer tokens on its behalf.
     *
     * Modifies:
     *
     * - The token balances of the `from` and `to` addresses, or the total supply of tokens if `to` is the zero address.
     */
    function transferFromAny(address erc20Addr, address from, address to, uint256 value) internal {
        MockERC20 token = MockERC20(erc20Addr);
        if (value != 0) {
            if (from == address(this)) {
                if (to != address(0)) {
                    token.transfer(to, value);
                } else {
                    token.burn(value);
                }
            } else {
                if (to != address(0)) {
                    token.transferFrom(from, to, value);
                } else {
                    token.transferFrom(from, address(this), value);
                    token.burn(value);
                }
            }
        }
    }

    /**
     * @dev Fulfills the ERC20 token transfer according to the specified rules.
     *
     * Requirements:
     *
     * - The `from` address must have a sufficient token balance.
     * - If the `from` address is not this contract, it must have approved this contract to transfer tokens on its behalf.
     *
     * Modifies:
     *
     * - The token balances of the `from` and `to` addresses.
     */
    function fulfillERC20(
        address erc20Addr,
        ContractCondition storage tokenReq,
        address from,
        address payee,
        address beneficiary,
        address burnAddress,
        address lockAddress
    ) internal {
        transferFromAny(erc20Addr, from, lockAddress, tokenReq.lock.amount);
        transferFromAny(erc20Addr, from, burnAddress, tokenReq.burn.amount);
        transferFromAny(erc20Addr, from, payee, tokenReq.pay.amount);
        transferFromAny(erc20Addr, from, beneficiary, tokenReq.bet.amount);
        MockERC20 token = MockERC20(erc20Addr);
        uint256 value = tokenReq.have.amount;
        if (value != 0 && from != address(this)) {
            require(token.balanceOf(from) >= value, "Not enough erc20 tokens");
        }
    }

    /**
     * @dev Fulfills the ERC721 token transfer according to the specified rules.
     *
     * Requirements:
     *
     * - The `from` address must own the token.
     * - If the `from` address is not this contract, it must have approved this contract to transfer the token on its behalf.
     *
     * Modifies:
     *
     * - The token ownership from the `from` address to the `to` address.
     *
     * Notes:
     *
     * Due to non fungible nature it's an open question how to implement this method correctly for lock/burn/pay/bet cases.
     * In this library I assume that requirements are for multiple members, hence it makes no sense to put requirement on particular tokenId for ERC721.
     * I think best approach would be to split in to two methods:
     *  1. fulfillERC72Balance: Treats tokens as fungible - requires one to lock/burn/pay/bet ANY token id, but in total should be equal to desired value.
     *  2. fulfillERC721Ids: Requires one to lock/burn/pay/bet specific token id. (useful when requirements are unique per applicant).
     * fulfillERC72Balance is easy. fulfillERC721Ids brings up a question of how to select those ID's(since must specify for ERC721 contract on transfer method).
     *  Two possible solutions:
     *  1: modify fund() method to accept array of address+id pairs of NFT's and parse trough it. computationally inefficient.
     *  2: implement onERC721Received such that there is NFT vault in the contract, later fill funding position from that vault. That way applicant could pre-send NFT's to the contract and calling fund later would pull those out from the vault.

     */
    function fulfillERC72Balance(address erc721addr, ContractCondition storage tokenReq, address from) internal view {
        ERC721 token = ERC721(erc721addr);

        require(
            tokenReq.lock.amount == 0 &&
                tokenReq.burn.amount == 0 &&
                tokenReq.pay.amount == 0 &&
                tokenReq.bet.amount == 0,
            "ERC721 transfers not supported"
        );
        if (tokenReq.have.amount != 0 && from != address(this)) {
            uint256 balance = token.balanceOf(from);
            require(balance >= tokenReq.have.amount, "Not enough ERC721 balance");
        }
    }

    /**
     * @dev Fulfills the ERC1155 token transfer according to the specified rules.
     *
     * Requirements:
     *
     * - The `from` address must own the token.
     * - If the `from` address is not this contract, it must have approved this contract to transfer the token on its behalf.
     *
     * Modifies:
     *
     * - The token ownership from the `from` address to the `to` address.
     */
    function fulfillERC1155(
        address erc1155addr,
        uint256 id,
        ContractCondition storage tokenReq,
        address from,
        address payee,
        address beneficiary,
        address burnAddress,
        address lockAddress
    ) internal {
        ERC1155Burnable token = ERC1155Burnable(erc1155addr);
        uint256 value = tokenReq.have.amount;
        if (value != 0) {
            uint256 balance = token.balanceOf(from, id);
            require(balance >= value, "ERC1155 balance is not valid");
        }
        value = tokenReq.pay.amount;
        if (value != 0) {
            token.safeTransferFrom(from, payee, id, value, tokenReq.pay.data);
        }
        value = tokenReq.bet.amount;
        if (value != 0) {
            token.safeTransferFrom(from, beneficiary, id, value, tokenReq.bet.data);
        }
        value = tokenReq.burn.amount;
        if (value != 0) {
            if (burnAddress == address(0)) {
                token.burn(from, id, value);
            } else {
                token.safeTransferFrom(from, burnAddress, id, value, tokenReq.burn.data);
            }
        }
        value = tokenReq.lock.amount;
        if (value != 0) {
            token.safeTransferFrom(from, lockAddress, id, value, tokenReq.lock.data);
        }
    }

    /**
     * @dev Fulfills the conditions of a position.
     *
     * Requirements:
     *
     * - If `from` is not this contract, the sent value must be greater than or equal to the sum of the locked, paid, bet, and burned values.
     *
     * Modifies:
     *
     * - Transfers the specified amounts of Ether to the lock, payee, beneficiary, and burn addresses.
     */
    function fulfill(
        Condition storage position,
        address from,
        address payee,
        address beneficiary,
        address burnAddress,
        address lockAddress
    ) internal {
        if (from == address(this)) {
            if (position.ethValues.lock != 0) {
                payable(lockAddress).transfer(position.ethValues.lock);
            }
            if (position.ethValues.pay != 0) {
                payable(payee).transfer(position.ethValues.pay);
            }
            if (position.ethValues.bet != 0) {
                payable(beneficiary).transfer(position.ethValues.bet);
            }
            if (position.ethValues.burn != 0) {
                payable(burnAddress).transfer(position.ethValues.burn);
            }
        } else {
            uint256 VLReq = position.ethValues.lock +
                position.ethValues.pay +
                position.ethValues.bet +
                position.ethValues.burn;
            require(msg.value >= VLReq, "msg.value too low");
        }
        for (uint256 i = 0; i < position.contractAddresses.length; ++i) {
            address contractAddress = position.contractAddresses[i];
            uint256 id = position.contractIds[i];
            ContractTypes contractType = position.contractTypes[i];
            ContractCondition storage requirement = position.contracts[contractType][contractAddress][id];
            if (contractType == ContractTypes.ERC20) {
                fulfillERC20(contractAddress, requirement, from, payee, beneficiary, burnAddress, lockAddress);
            } else if (contractType == ContractTypes.ERC721) {
                fulfillERC72Balance(
                    contractAddress,
                    // id,
                    requirement,
                    from
                    // payee,
                    // beneficiary,
                    // burnAddress,
                    // lockAddress
                );
            } else if (contractType == ContractTypes.ERC1155) {
                fulfillERC1155(contractAddress, id, requirement, from, payee, beneficiary, burnAddress, lockAddress);
            }
        }
    }

    /**
     * @dev Refunds the balance of a condition to the specified address.
     *
     * `reqPos` The storage reference to the condition.
     * `to` The address to refund the balance to.
     *
     * Requirements:
     *
     * - The sum of `timesRefunded` and `timesReleased` for the condition must be less than `timesFunded`.
     *
     * Modifies:
     *
     * - Transfers the remaining balance of the condition to the `to` address.
     * - Increments the `timesRefunded` counter for the condition.
     */
    function _refund(Condition storage reqPos, address to) private {
        require((reqPos.timesRefunded + reqPos.timesReleased) < reqPos.timesFunded, "Not enough balance to refund");
        fulfill(reqPos, address(this), to, to, to, to);
        reqPos.timesRefunded += 1;
    }

    /**
     * @dev Returns all position requirements back to founder. `position` is the identifier of the condition. `to` is the address to refund the balance to.
     *
     * Requirements:
     *
     * - The sum of `timesRefunded` and `timesReleased` for the condition must be less than `timesFunded`.
     *
     * Modifies:
     *
     * - Transfers the remaining balance of the condition to the `to` address.
     * - Increments the `timesRefunded` counter for the condition.
     */
    function refund(bytes32 position, address to) internal {
        Condition storage reqPos = coinVendingPosition(position);
        _refund(reqPos, to);
    }

    /**
     * @dev Returns all position requirements back to multiple founders. `position` is the identifier of the condition. `returnAddresses` is an array of addresses to refund the balance to.
     *
     * Requirements:
     *
     * - The sum of `timesRefunded` and `timesReleased` for the condition must be less than `timesFunded`.
     *
     * Modifies:
     *
     * - Transfers the remaining balance of the condition to each address in `returnAddresses`.
     * - Increments the `timesRefunded` counter for the condition for each address in `returnAddresses`.
     */
    function batchRefund(bytes32 position, address[] memory returnAddresses) internal {
        Condition storage reqPos = coinVendingPosition(position);
        for (uint256 i = 0; i < returnAddresses.length; ++i) {
            _refund(reqPos, returnAddresses[i]);
        }
    }

    function _release(Condition storage reqPos, address payee, address beneficiary, address returnAddress) internal {
        require((reqPos.timesRefunded + reqPos.timesReleased) < reqPos.timesFunded, "Not enough balance to release");
        fulfill(reqPos, address(this), payee, beneficiary, address(0), returnAddress);
        reqPos.timesReleased += 1;
    }

    /**
     * @dev Releases the funds from a coin vending position to the specified addresses. `position` is the identifier of the condition. `payee`, `beneficiary`, and `returnAddress` are the addresses to release the funds to.
     *
     * Requirements:
     *
     * - The sum of `timesRefunded` and `timesReleased` for the condition must be less than `timesFunded`.
     *
     * Modifies:
     *
     * - Transfers the remaining balance of the condition to the `payee`, `beneficiary`, and `returnAddress`.
     * - Increments the `timesReleased` counter for the condition.
     */
    function release(bytes32 position, address payee, address beneficiary, address returnAddress) internal {
        Condition storage reqPos = coinVendingPosition(position);
        _release(reqPos, payee, beneficiary, returnAddress);
    }

    /**
     * @dev Releases the funds from a coin vending position to multiple return addresses. `position` is the identifier of the condition. `payee`, `beneficiary`, and `returnAddresses` are the addresses to release the funds to.
     *
     * Requirements:
     *
     * - The sum of `timesRefunded` and `timesReleased` for the condition must be less than `timesFunded`.
     *
     * Modifies:
     *
     * - Transfers the remaining balance of the condition to the `payee`, `beneficiary`, and each address in `returnAddresses`.
     * - Increments the `timesReleased` counter for the condition for each address in `returnAddresses`.
     */
    function batchRelease(
        bytes32 position,
        address payee,
        address beneficiary,
        address[] memory returnAddresses
    ) internal {
        Condition storage reqPos = coinVendingPosition(position);
        for (uint256 i = 0; i < returnAddresses.length; ++i) {
            {
                _release(reqPos, payee, beneficiary, returnAddresses[i]);
            }
        }
    }

    function _fund(Condition storage reqPos, address founder) private {
        require(reqPos._isConfigured, "Position does not exist");
        fulfill(reqPos, founder, address(this), address(this), address(this), address(this));
        reqPos.timesFunded += 1;
    }

    /**
     * @dev Funds the position by `msg.sender`. `position` is the identifier of the condition.
     *
     * Requirements:
     *
     * - The condition must be configured.
     *
     * Modifies:
     *
     * - Transfers the funds from `msg.sender` to this contract.
     * - Increments the `timesFunded` counter for the condition.
     */
    function fund(bytes32 position) internal {
        Condition storage reqPos = coinVendingPosition(position);
        _fund(reqPos, msg.sender);
    }

    /**
     * @dev Configures the position. `position` is the identifier of the condition. `configuration` is the new configuration for the condition.
     *
     * Requirements:
     *
     * - The condition must not have a positive balance.
     *
     * Modifies:
     *
     * - Sets the configuration of the condition to `configuration`.
     */
    function configure(bytes32 position, ConfigPosition memory configuration) internal {
        Condition storage mustDo = coinVendingPosition(position);
        require(
            mustDo.timesFunded == 0 || (mustDo.timesFunded == (mustDo.timesRefunded + mustDo.timesReleased)),
            "Cannot mutate position with currently positive balance"
        );
        mustDo.ethValues = configuration.ethValues;
        delete mustDo.contractAddresses;
        delete mustDo.contractIds;
        delete mustDo.contractTypes;
        for (uint256 i = 0; i < configuration.contracts.length; ++i) {
            mustDo.contractAddresses.push(configuration.contracts[i].contractAddress);
            mustDo.contractIds.push(configuration.contracts[i].contractId);
            mustDo.contractTypes.push(configuration.contracts[i].contractType);
            mustDo.contracts[configuration.contracts[i].contractType][configuration.contracts[i].contractAddress][
                    configuration.contracts[i].contractId
                ] = configuration.contracts[i].contractRequirement;
        }
        mustDo._isConfigured = true;
    }

    /**
     * @dev Returns the condition associated with the given position. `position` is the identifier of the condition.
     *
     * Returns:
     *
     * - The condition associated with `position`.
     */
    function getPosition(bytes32 position) internal view returns (ConditionReturn memory) {
        Condition storage pos = coinVendingPosition(position);
        ConditionReturn memory ret;
        ret.ethValues = pos.ethValues;
        ret.timesFunded = pos.timesFunded;
        ret.timesRefunded = pos.timesRefunded;
        ret.timesReleased = pos.timesReleased;
        ret._isConfigured = pos._isConfigured;
        ret.contractAddresses = pos.contractAddresses;
        ret.contractIds = pos.contractIds;
        ret.contractTypes = pos.contractTypes;
        return ret;
    }

    /**
     * @dev Returns the contract condition associated with the given position, contract address, contract ID, and contract type. `position` is the identifier of the condition. `contractAddress` is the address of the contract. `contractId` is the ID of the contract. `contractType` is the type of the contract.
     *
     * Returns:
     *
     * - The contract condition associated with `position`, `contractAddress`, `contractId`, and `contractType`.
     */
    function getPositionByContract(
        bytes32 position,
        address contractAddress,
        uint256 contractId,
        ContractTypes contractType
    ) internal view returns (ContractCondition memory) {
        Condition storage pos = coinVendingPosition(position);
        return pos.contracts[contractType][contractAddress][contractId];
    }
}
