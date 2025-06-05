---
'rankify-contracts': minor
---


*   **Enforced Minimum Proposal Participation:**
    *   The `endProposing` function now strictly requires that the game meets the criteria for a successful proposing stage end (`ProposingEndStatus.Success`). If the proposing phase times out but the minimum number of proposals (`minQuadraticPositions`) hasn't been met, `endProposing` will generally prevent the game from automatically proceeding to the voting stage, unless the game is deemed stale and ended via `forceEndStaleGame`.
    *   A new `ProposingEndStatus` enum (`Success`, `MinProposalsNotMetAndNotStale`, `GameIsStaleAndCanEnd`, etc.) and a corresponding `ErrorProposingStageEndFailed` error were introduced to provide clear reasons for proposing stage outcomes.

*   **Stale Game Resolution:**
    *   A new function, `forceEndStaleGame`, has been added to the `RankifyInstanceGameMastersFacet`. This allows a Game Master to forcibly end a game if the minimum game time (`minGameTime`) has passed, the game is stuck in the proposing stage, the proposing phase has timed out, and the required minimum number of proposals (`minQuadraticPositions`) has not been submitted by active players.
    *   The library function `LibRankify.isGameStaleForForcedEnd` was added to encapsulate these conditions.
    *   A new `StaleGameEnded` event is emitted when a game is ended this way, and a new `ErrorCannotForceEndGame` error can be returned.

*   **Interface and Library Updates:**
    *   The return type of `canEndProposingStage` (exposed via `RankifyInstanceMainFacet`) was changed from `bool` to the new `IRankifyInstance.ProposingEndStatus` enum.
    *   `LibRankify.canEndProposing` was significantly updated to return the detailed `ProposingEndStatus`.

*   **Testing Enhancements:**
    *   Comprehensive tests were added to `test/RankifyInstance.ts` covering various scenarios for `endProposing` behavior with insufficient proposals (both before and after `minGameTime`), correct handling of different `ProposingEndStatus` values, and the functionality and revert conditions for the new `forceEndStaleGame` function.

*   **Minor Refinements:**
    *   The `forceEndStaleGame` selector was added to the facet cut in `ArguableVotingTournament.sol`.
    *   A guard for empty player arrays was added to `LibTurnBasedGame.sortByScore`.
    *   Minor type casting improvements in `EnvironmentSimulator.ts`.

x
