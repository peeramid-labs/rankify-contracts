// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../vendor/diamond/libraries/LibDiamond.sol";

// import "./interfaces/IERC173.sol";

contract OnlyOwnerDiamond {
    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }
}
