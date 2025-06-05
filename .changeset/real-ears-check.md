---
'rankify-contracts': minor
---

*   **Enforced Minimum Proposal Participation:**
    *   The `endProposing` function (in `RankifyInstanceGameMastersFacet.sol`) and related logic in `LibRankify.sol` now enforce that if a proposing phase ends primarily due to a timeout, it must also have a sufficient number of proposals (at least `minQuadraticPositions`).
    *   If the timeout is reached but this minimum proposal count isn't met, the game generally won't proceed to the voting phase unless the overall `minGameTime` is also met (which could trigger stale game conditions).
    *   A new `IRankifyInstance.ProposingEndStatus` enum (`Success`, `MinProposalsNotMetAndNotStale`, `GameIsStaleAndCanEnd`, `PhaseConditionsNotMet`, `NotProposingStage`) is now returned by `LibRankify.canEndProposing` to provide detailed outcomes.
    *   A corresponding `ErrorProposingStageEndFailed(uint256 gameId, IRankifyInstance.ProposingEndStatus status)` error has been introduced to clearly communicate reasons for proposing stage failures.

*   **Stale Game Resolution:**
    *   A new function, `forceEndStaleGame`, has been added to the `RankifyInstanceGameMastersFacet.sol`. This allows a Game Master to forcibly end a game that is stuck.
    *   Conditions for using `forceEndStaleGame`:
        1.  The minimum game duration (`minGameTime`) must have passed.
        2.  The game must currently be in the proposing stage.
        3.  The proposing phase duration must have timed out.
        4.  The number of submitted proposals must be less than `minQuadraticPositions`.
    *   The library function `LibRankify.isGameStaleForForcedEnd` was added to encapsulate these specific conditions.
    *   A new `StaleGameEnded(uint256 indexed gameId, address indexed winner)` event is emitted when a game is ended this way.
    *   A new `ErrorCannotForceEndGame(uint256 gameId)` error is returned if `forceEndStaleGame` is called inappropriately.
    *   Note: The `prevrandao`-based tie-breaking mechanism for stale/tied games mentioned in the original issue is **not** part of this specific changeset. Winner determination in stale scenarios currently relies on the existing scoring logic.

*   **Interface and Library Updates:**
    *   `IRankifyInstance.sol`: Added the `ProposingEndStatus` enum, the `StaleGameEnded` event, and the new error types (`ErrorProposingStageEndFailed`, `ErrorCannotForceEndGame`).
    *   `LibRankify.sol`: The `canEndProposing` function was significantly updated to return the new `ProposingEndStatus`. The helper `isGameStaleForForcedEnd` was introduced.
    *   `LibTurnBasedGame.sol`: A guard for empty player arrays was added to the `sortByScore` function to prevent errors with no players.

*   **Testing Enhancements (`test/RankifyInstance.ts`):**
    *   Comprehensive new tests were added to cover various scenarios for the `endProposing` function's behavior, especially when proposal participation is insufficient (both before and after `minGameTime` is met). These tests verify the correct `ProposingEndStatus` outcomes (e.g., `MinProposalsNotMetAndNotStale`, `GameIsStaleAndCanEnd`).
    *   Detailed tests for the new `forceEndStaleGame` function were implemented, including conditions for successful execution and expected reverts (e.g., if `minGameTime` is not met, if the game is not in the proposing stage, or if the game is already over).
    *   Edge cases, such as games with zero or only one proposer, are also covered in the new tests.

*   **Minor Refinements:**
    *   The function selector for `forceEndStaleGame` was correctly added to the facet cut in `ArguableVotingTournament.sol`.
    *   Minor type casting improvements were made in the `EnvironmentSimulator.ts` test helper script.

x
