// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {LibCoinVending} from "../libraries/LibCoinVending.sol";
import {LibRankify} from "../libraries/LibRankify.sol";
import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
/**
 * @title RankifyInstanceRequirementsFacet
 * @notice Facet handling game requirements and conditions for Rankify instances
 * @dev Implements functionality for setting and checking join requirements for games,
 *      utilizing the LibCoinVending library for configuration management
 * @author Peeramid Labs, 2024
 */
contract RankifyInstanceRequirementsFacet is ReentrancyGuard {
    using LibTBG for uint256;
    using LibRankify for uint256;
    using LibTBG for LibTBG.State;

    /**
     * @dev Retrieves the join requirements for a specific game.
     * @param gameId The ID of the game.
     * @return The join requirements as a `LibCoinVending.ConditionReturn` struct.
     */
    function getJoinRequirements(uint256 gameId) public view returns (LibCoinVending.ConditionReturn memory) {
        return LibCoinVending.getPosition(bytes32(gameId));
    }

    /**
     * @dev Retrieves the join requirements for a specific token in a game.
     * @param gameId The ID of the game.
     * @param contractAddress The address of the contract.
     * @param contractId The ID of the contract.
     * @param contractType The type of the contract.
     * @return The join requirements for the specified token.
     */
    function getJoinRequirementsByToken(
        uint256 gameId,
        address contractAddress,
        uint256 contractId,
        LibCoinVending.ContractTypes contractType
    ) public view returns (LibCoinVending.ContractCondition memory) {
        return LibCoinVending.getPositionByContract(bytes32(gameId), contractAddress, contractId, contractType);
    }

    function getCommonParams() public view returns (LibRankify.CommonParams memory) {
        return LibRankify.instanceState().commonParams;
    }

    function getGameState(uint256 gameId) public view returns (IRankifyInstance.GameStateOutput memory state) {
        LibTBG.Instance storage tbgInstanceState = LibTBG._getInstance(gameId);
        LibRankify.GameState storage gameState = gameId.getGameState();
        state = IRankifyInstance.GameStateOutput({
            rank: gameState.rank,
            minGameTime: gameState.minGameTime,
            createdBy: gameState.createdBy,
            numCommitments: gameState.numCommitments,
            numVotes: gameState.numVotes,
            voting: gameState.voting,
            currentTurn: tbgInstanceState.state.currentTurn,
            turnStartedAt: tbgInstanceState.state.startedAt,
            registrationOpenAt: tbgInstanceState.state.registrationOpenAt,
            hasStarted: tbgInstanceState.state.hasStarted,
            hasEnded: tbgInstanceState.state.hasEnded,
            numPlayersMadeMove: tbgInstanceState.state.numPlayersMadeMove,
            numActivePlayers: tbgInstanceState.state.numActivePlayers,
            isOvertime: tbgInstanceState.state.isOvertime,
            timePerTurn: tbgInstanceState.settings.timePerTurn,
            maxPlayerCnt: tbgInstanceState.settings.maxPlayerCnt,
            minPlayerCnt: tbgInstanceState.settings.minPlayerCnt,
            timeToJoin: tbgInstanceState.settings.timeToJoin,
            maxTurns: tbgInstanceState.settings.maxTurns,
            voteCredits: tbgInstanceState.settings.voteCredits,
            gameMaster: tbgInstanceState.settings.gameMaster,
            metadata: gameState.metadata,
            phase: tbgInstanceState.state.phase,
            proposingPhaseDuration: tbgInstanceState.settings.turnPhaseDurations[0],
            votePhaseDuration: tbgInstanceState.settings.turnPhaseDurations[1],
            phaseStartedAt: tbgInstanceState.state.phaseStartedAt,
            startedAt: tbgInstanceState.state.startedAt
        });
    }

    /**
     * @dev Retrieves the amount of ETH that can be pulled from the bank for a specific player.
     * @param player The address of the player.
     * @return The amount of ETH that can be pulled from the bank.
     */
    function getPullableEth(address player) public view returns (uint256) {
        return LibCoinVending.bankBalance(player);
    }

    /**
     * @dev Pulls ETH from the bank for a specific player.
     * @param player The address of the player.
     * @param amount The amount of ETH to pull from the bank.
     * @notice This function allows ANYONE to pull ETH from the bank to the account; This means someone can pay tx gas for someone else to pull ETH from the bank to their account; It is not security vulnerability since vending already tries to release these funds at all times;
     */
    function pullEth(address player, uint256 amount) public nonReentrant {
        LibCoinVending.withdrawFromBank(player, amount);
    }
}
