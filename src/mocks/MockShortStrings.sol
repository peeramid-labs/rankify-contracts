// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";

contract MockShortStrings {
    using ShortStrings for ShortString;

    function getShortStringBytes32(string memory text) public view returns (bytes32) {
        return ShortString.unwrap(ShortStrings.toShortString(text));
    }
}
