// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "hardhat/console.sol";
import "../abstracts/LockableERC1155.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
library LibACID {
    using Address for address;
    using SafeERC20 for IERC20;
    struct Tournament {
        uint256 level;
        uint256 createdAt;
        bool finalized;
        uint256 budget;
        address createdBy;
    }
    struct ACID {
        uint256 principalCost;
        uint256 principalTime;
        LockableERC1155 competenceAsset;
        address rootAsset;
        address[] receivers;
        uint256[] receiverShares;
        uint256 humanFactor;
        mapping(uint256 tournamentId => Tournament tournament) tournaments;
    }

    function getACIDStorage() internal view returns (ACID storage acid) {
        bytes32 position = keccak256("acid.storage.position");
        assembly {
            acid.slot := position
        }
    }

    function initialize(ACID storage acid, address[] memory receivers, uint256[] memory receiverShares, uint256 principalCost, uint256 principalTime, uint256 humanFactor) internal {
        acid.receivers = receivers;
        acid.receiverShares = receiverShares;
        acid.principalCost = principalCost;
        acid.principalTime = principalTime;
        acid.humanFactor = humanFactor;
        require(humanFactor > 1, "Human factor must be greater than 1");
        require(receivers.length == receiverShares.length, "Payees and receiver shares length mismatch");
        uint256 totalShares = 0;
        for (uint256 i = 0; i < receivers.length; i++) {
            require(receiverShares[i] > 0, "Payee share must be greater than 0");
            totalShares += receiverShares[i];
        }
        require(totalShares == 10000, "Total receiver shares must be 10000");
    }

    function createRecord(ACID storage acid, uint256 level, uint256 id, uint256 budget, address sender) internal {
        require(acid.tournaments[id].createdAt == 0, "Record already exists");
        IERC20(acid.rootAsset).safeTransferFrom(sender, address(this), budget);
        acid.tournaments[id] = Tournament({
            level: level,
            createdAt: block.timestamp,
            finalized: false,
            budget: budget,
            createdBy: sender
        });
    }

    function estimatePrice(ACID storage acid, uint256 duration) internal view returns (uint256) {
        return Math.mulDiv(
            acid.principalCost,
            acid.principalTime,
            duration
        );
    }

    function getPrice(ACID storage acid, uint256 tournamentId) internal view returns (uint256) {
        return Math.mulDiv(
            acid.principalCost,
            acid.principalTime,
            block.timestamp - acid.tournaments[tournamentId].createdAt
        );
    }

    function finalize(ACID storage acid, uint256 tournamentId, address payer, address rankReceiver, function(address receiver, uint256 level) issueCompetence) internal {
        require(acid.tournaments[tournamentId].finalized == false, "Tournament already finalized");
        Tournament storage tournament = acid.tournaments[tournamentId];
        tournament.finalized = true;
        uint256 price = getPrice(acid, tournamentId);
        uint256 budgetLeftOver = price > tournament.budget ? 0 : tournament.budget - price;
        for (uint256 i = 0; i < acid.receivers.length; i++) {
            uint256 share = Math.mulDiv(price, acid.receiverShares[i], 10000);
            if(tournament.budget > 0)
            {
                uint256 fromBudgetShare = share > tournament.budget ? tournament.budget : share;
                tournament.budget -= fromBudgetShare;
                share -= fromBudgetShare;
                IERC20(acid.rootAsset).safeTransferFrom(address(this), acid.receivers[i], fromBudgetShare);
            }
            if(share > 0)
                IERC20(acid.rootAsset).safeTransferFrom(payer, acid.receivers[i], share);
        }
        IERC20(acid.rootAsset).safeTransferFrom(address(this), tournament.createdBy, budgetLeftOver);
        issueCompetence(rankReceiver, acid.tournaments[tournamentId].level);
    }

}
