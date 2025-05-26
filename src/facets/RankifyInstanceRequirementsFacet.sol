// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {LibCoinVending} from "../libraries/LibCoinVending.sol";
import {LibRankify} from "../libraries/LibRankify.sol";
import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";
import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";
/**
 * @title RankifyInstanceRequirementsFacet
 * @notice Facet handling game requirements and conditions for Rankify instances
 * @dev Implements functionality for setting and checking join requirements for games,
 *      utilizing the LibCoinVending library for configuration management
 * @author Peeramid Labs, 2024
 */
contract RankifyInstanceRequirementsFacet {
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
            numProposals: gameState.numProposals,
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
            phaseStartedAt: tbgInstanceState.state.phaseStartedAt
        });
    }
}
