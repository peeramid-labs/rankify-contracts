// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LibRankify} from "../libraries/LibRankify.sol";
/**
 * @title ScoreGetterFacet
 * @notice Facet for querying proposal scores and existence across games, turns, and instances
 * @dev Implements functionality for retrieving proposal scores, checking proposal existence,
 *      and getting proposer information for the Rankify gaming system
 * @author Peeramid Labs, 2024
 */
contract ScoreGetterFacet {
    using LibRankify for uint256;

    /**
     * @notice Get the score of a proposal in the game
     * @param gameId The ID of the game
     * @param proposalHash The hash of the proposal
     * @return score The score of the proposal
     */
    function getProposalGameScore(uint256 gameId, bytes32 proposalHash) public view returns (uint256 score) {
        LibRankify.InstanceState storage instance = LibRankify.instanceState();
        return instance.proposalScore[proposalHash].game[gameId].score;
    }

    /**
     * @notice Get the score of a proposal in the turn
     * @param gameId The ID of the game
     * @param turn The turn number
     * @param proposalHash The hash of the proposal
     * @return score The score of the proposal
     * @return proposedBy Array of addresses who proposed this proposal
     */
    function getProposalTurnScore(
        uint256 gameId,
        uint256 turn,
        bytes32 proposalHash
    ) public view returns (uint256 score, address[] memory proposedBy) {
        LibRankify.InstanceState storage instance = LibRankify.instanceState();
        return (instance.proposalScore[proposalHash].turn[gameId][turn].score, instance.proposalScore[proposalHash].turn[gameId][turn].proposedBy);
    }

    /**
     * @notice Get the scores of all proposals in the turn
     * @param gameId The ID of the game
     * @param turn The turn number
     * @return proposalHashes The hashes of the proposals
     * @return scores The scores of the proposals
     * @return proposedBy Array of proposer addresses for each proposal
     * @dev Returned arrays size is capped at max size 15 due to number of participants in the game limit
     */
    function getProposalsTurnScores(
        uint256 gameId,
        uint256 turn
    ) public view returns (bytes32[] memory proposalHashes, uint256[] memory scores, address[][] memory proposedBy) {
        LibRankify.InstanceState storage instance = LibRankify.instanceState();
        LibRankify.GameState storage game = gameId.getGameState();
        address[] memory players = gameId.getPlayers();
        scores = new uint256[](players.length);
        proposedBy = new address[][](players.length);
        proposalHashes = new bytes32[](players.length);
        uint256 i = 0;
        while (i < players.length) {
            proposalHashes[i] = keccak256(abi.encodePacked(game.proposals[turn][i]));
            scores[i] = instance.proposalScore[proposalHashes[i]].turn[gameId][turn].score;
            proposedBy[i] = instance.proposalScore[proposalHashes[i]].turn[gameId][turn].proposedBy;
            i++;
        }
    }

    /**
     * @notice Check if a proposal exists in the turn
     * @param gameId The ID of the game
     * @param turn The turn number
     * @param proposalHash The hash of the proposal
     * @return exists True if the proposal exists in the turn, false otherwise
     * @return proposedBy Array of addresses who proposed this proposal
     * @dev Returns empty array for proposedBy if proposal doesn't exist or no proposer recorded
     */
    function proposalExistsInTurn(uint256 gameId, uint256 turn, bytes32 proposalHash) public view returns (bool exists, address[] memory proposedBy) {
        LibRankify.InstanceState storage instance = LibRankify.instanceState();
        return (instance.proposalScore[proposalHash].turn[gameId][turn].exists, instance.proposalScore[proposalHash].turn[gameId][turn].proposedBy);
    }

    /**
     * @notice Check if a proposal exists in the game
     * @param gameId The ID of the game
     * @param proposalHash The hash of the proposal
     * @return exists True if the proposal exists in the game, false otherwise
     */
    function proposalExistsInGame(uint256 gameId, bytes32 proposalHash) public view returns (bool) {
        LibRankify.InstanceState storage instance = LibRankify.instanceState();
        return instance.proposalScore[proposalHash].game[gameId].exists;
    }

    /**
     * @notice Check if a proposal exists in the instance
     * @param proposalHash The hash of the proposal
     * @return exists True if the proposal exists in the instance, false otherwise
     */
    function proposalExists(bytes32 proposalHash) public view returns (bool) {
        LibRankify.InstanceState storage instance = LibRankify.instanceState();
        return instance.proposalScore[proposalHash].exists;
    }

    /**
     * @notice Get the total aggregated score of a proposal in the instance
     * @param proposalHash The hash of the proposal
     * @return score The total score of the proposal
     */
    function getProposalTotalScore(bytes32 proposalHash) public view returns (uint256) {
        LibRankify.InstanceState storage instance = LibRankify.instanceState();
        return instance.proposalScore[proposalHash].totalScore;
    }

}
