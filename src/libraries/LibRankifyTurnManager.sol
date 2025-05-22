// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LibTBG} from "./LibTurnBasedGame.sol";

library LibRankifyTurnManager {
    function getExternalTurn(uint256 gameId) internal view returns (uint256) {
        return LibTBG.getTurn(gameId);
    }

    function isVotingStage(uint256 gameId) internal view returns (bool) {
        uint256 externalTurn = getExternalTurn(gameId);
        return externalTurn % 2 == 0;
    }

    function isProposingStage(uint256 gameId) internal view returns (bool) {
        uint256 externalTurn = getExternalTurn(gameId);
        return externalTurn % 2 != 0;
    }

    // This function gives the "round number"
    function getGameRound(uint256 gameId) internal view returns (uint256) {
        uint256 externalTurn = getExternalTurn(gameId);
        // If externalTurn is 1 (Proposing) or 2 (Voting) -> round 1
        // If externalTurn is 3 (Proposing) or 4 (Voting) -> round 2
        return (externalTurn + 1) / 2;
    }

    function getMaxRounds(uint256 gameId) internal view returns (uint256) {
        LibTBG.Settings storage settings = LibTBG.getSettings(gameId);
        return settings.maxTurns / 2;
    }
}