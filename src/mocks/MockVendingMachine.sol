// SPDX-License-Identifier: MIT
// Author: Tim Pechersky <@Peersky>

pragma solidity ^0.8.20;

import {LibCoinVending} from "../libraries/LibCoinVending.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "hardhat/console.sol";

contract MockVendingMachine is ReentrancyGuard {
    constructor() {}

    address[] public participants;

    function createPosition(bytes32 position, LibCoinVending.ConfigPosition memory configuration) public {
        LibCoinVending.configure(position, configuration);
    }

    function fund(bytes32 _positionName) public payable nonReentrant {
        LibCoinVending.fund(_positionName);
    }

    function release(bytes32 position, address payee, address beneficiary) external {
        LibCoinVending.release(position, payee, beneficiary, msg.sender);
    }

    function refund(bytes32 _positionName, address to) public nonReentrant {
        LibCoinVending.refund(_positionName, to);
    }

    function refundBatch(bytes32 _positionName) public nonReentrant {
        LibCoinVending.batchRefund(_positionName, participants);
    }

    function releaseAll(bytes32 _positionName, address payee, address beneficiary) public nonReentrant {
        LibCoinVending.batchRelease(_positionName, payee, beneficiary, participants);
    }

    function onERC1155Received(
        address operator,
        address,
        uint256,
        uint256,
        bytes calldata
    ) public view returns (bytes4) {
        if (operator == address(this)) {
            return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
        }
        return bytes4("");
    }

    function onERC1155BatchReceived(
        address operator,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external view returns (bytes4) {
        if (operator == address(this)) {
            return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
        }
        return bytes4("");
    }

    function onERC721Received(address operator, address, uint256, bytes calldata) external view returns (bytes4) {
        if (operator == address(this)) {
            return IERC721Receiver.onERC721Received.selector;
        }
        return bytes4("");
    }

    function getPullableEth(address player) public view returns (uint256) {
        return LibCoinVending.bankBalance(player);
    }

    function pullEth(address player, uint256 amount) public {
        require(player == msg.sender, "unauthorized");
        LibCoinVending.withdrawFromBank(player, amount);
    }
}
