// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {IDiamondCut} from "../vendor/diamond/interfaces/IDiamondCut.sol";

library LibEIP712WithStorage {
    bytes32 constant EIP712_STORAGE_POSITION = keccak256("EIP.712.STORAGE.POSITION");

    struct LibEIP712WithStorageStorage {
        bytes32 _CACHED_DOMAIN_SEPARATOR;
        uint256 _CACHED_CHAIN_ID;
        address _CACHED_THIS;
        bytes32 _HASHED_NAME;
        bytes32 _HASHED_VERSION;
        bytes32 _TYPE_HASH;
        string _VERSION; // Added for introspection reasons
        string _NAME; // Added for introspection reasons
    }

    function EIP712WithStorage() internal pure returns (LibEIP712WithStorageStorage storage ds) {
        bytes32 position = EIP712_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }
}
