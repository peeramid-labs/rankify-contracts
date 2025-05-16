// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "hardhat/console.sol";
import "../abstracts/LockableERC1155.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../tokens/RankToken.sol";
interface IERC20MintBurn is IERC20 {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
}

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
    /// @custom:storage-location erc7201:acid.storage.position
    struct ACID {
        uint128 principalCost;
        uint256 principalTime;
        RankToken competenceAsset;
        IERC20MintBurn rootAsset;
        IERC20MintBurn derivedAsset;
        uint32 minTournamentSize;
        uint64 exitRate;
        mapping(uint256 tournamentId => Tournament tournament) tournaments;
        address[] receivers;
        uint256[] receiverShares;
        uint256[50] __gap;
    }

    bytes32 constant ACID_STORAGE_POSITION =
        keccak256(abi.encode(uint256(keccak256("acid.storage.position")) - 1)) & ~bytes32(uint256(0xff));

    function getACIDStorage() internal pure returns (ACID storage acid) {
        bytes32 position = ACID_STORAGE_POSITION;
        assembly {
            acid.slot := position
        }
    }

    function initialize(
        ACID storage acid,
        uint128 principalCost,
        uint256 principalTime,
        address competenceAsset,
        address rootAsset,
        address derivedAsset,
        uint32 minTournamentSize,
        uint64 exitRate,
        address[] memory receivers,
        uint256[] memory receiverShares
    ) internal {
        acid.principalCost = principalCost;
        acid.principalTime = principalTime;
        acid.competenceAsset = RankToken(competenceAsset);
        acid.rootAsset = IERC20MintBurn(rootAsset);
        acid.derivedAsset = IERC20MintBurn(derivedAsset);
        acid.minTournamentSize = minTournamentSize;
        acid.exitRate = exitRate;
        require(minTournamentSize > 1, "Minimum tournament size must be greater than 1");
        require(receivers.length == receiverShares.length, "Payees and receiver shares length mismatch");
        uint256 totalShares = 0;
        for (uint256 i = 0; i < receivers.length; i++) {
            require(receiverShares[i] > 0, "Payee share must be greater than 0");
            totalShares += receiverShares[i];
        }
        require(totalShares == 10000, "Total receiver shares must be 10000");
        acid.receivers = receivers;
        acid.receiverShares = receiverShares;
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
        return Math.mulDiv(acid.principalCost, acid.principalTime, duration);
    }

    function getFinalizationPrice(ACID storage acid, uint256 tournamentId) internal view returns (uint256) {
        return
            Math.mulDiv(
                acid.principalCost,
                acid.principalTime,
                block.timestamp - acid.tournaments[tournamentId].createdAt
            );
    }

    function getExitRate(ACID storage acid, uint256 level) internal view returns (uint256) {
        uint256 exitAmount = (uint256(acid.principalCost * acid.minTournamentSize) ** level);
        return Math.mulDiv(exitAmount, acid.exitRate, 10000);
    }

    function exit(ACID storage acid, address actor, uint256 level, uint256 amount) internal {
        uint256 exitRate = getExitRate(acid, level);
        uint256 exitAmount = Math.mulDiv(acid.principalCost, exitRate, 10000);
        acid.competenceAsset.burn(actor, level, amount);
        acid.derivedAsset.mint(actor, exitAmount);
        IERC20(acid.rootAsset).safeTransferFrom(address(this), actor, exitAmount);
    }

    function finalize(ACID storage acid, uint256 tournamentId, address payer, address rankReceiver) internal {
        Tournament storage tournament = acid.tournaments[tournamentId];
        require(tournament.finalized == false, "Tournament already finalized");
        tournament.finalized = true;
        uint256 price = getFinalizationPrice(acid, tournamentId);
        uint256 budgetLeftOver = price > tournament.budget ? 0 : tournament.budget - price;
        for (uint256 i = 0; i < acid.receivers.length; i++) {
            uint256 share = Math.mulDiv(price, acid.receiverShares[i], 10000);
            if (tournament.budget > 0) {
                uint256 fromBudgetShare = share > tournament.budget ? tournament.budget : share;
                tournament.budget -= fromBudgetShare;
                share -= fromBudgetShare;
                IERC20(acid.rootAsset).safeTransferFrom(address(this), acid.receivers[i], fromBudgetShare);
            }
            if (share > 0) IERC20(acid.rootAsset).safeTransferFrom(payer, acid.receivers[i], share);
        }
        IERC20(acid.rootAsset).safeTransferFrom(address(this), tournament.createdBy, budgetLeftOver);
        acid.competenceAsset.mint(rankReceiver, tournament.level, 1, abi.encode(tournamentId));
    }
}
