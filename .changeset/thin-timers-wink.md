---
'rankify-contracts': minor
---

Major architectural and functional changes:

- **Two-Phase Turn System**: Transitioned from a single `endTurn` function/concept to a two-phase system with distinct `endProposing` and `endVoting` stages. This was a core change impacting many areas:
  - **Solidity Contracts**:
    - `RankifyInstanceGameMastersFacet`: `endTurn` replaced by `endVoting`; new `endProposing` function added. Event logic updated (`ProposingStageEnded`, `VotingStageResults` added). Vote/proposal submission logic now phase-aware.
    - `RankifyInstanceMainFacet`: Added new phase-specific view functions: `isProposingStage(uint256 gameId)`, `isVotingStage(uint256 gameId)`, `canEndProposingStage(uint256 gameId)`, `canEndVotingStage(uint256 gameId)`. Removed `canEndTurn`. `startGame` no longer takes `permutationCommitment`.
    - `LibRankify`: Major rework to support phases. `GameState` and `NewGameParams` updated. `tryPlayerMove` became phase-aware. Added `canEndProposing`, `canEndVoting`, `isVotingStage`, `isProposingStage`. `calculateScores` now returns round winner.
    - `LibTBG`: Core turn logic refactored. `State` now includes `phase` and `phaseStartedAt` (renamed from `turnStartedAt`). `Settings` includes `turnPhaseDurations`. `nextTurn` became `next` (phase transition). Timeout and early end logic became phase-aware (`isTimeout`, `canTransitionPhaseEarly`).
    - Interfaces (`IRankifyInstance`) and event/struct definitions updated accordingly across facets.
  - **Environment Simulator (`scripts/EnvironmentSimulator.ts`)**:
    - `endTurn` and `endWithIntegrity` refactored to call `endProposing` and `endVoting` separately.
    - `makeTurn` logic updated to reflect the two-phase process.
    - `mockValidVotes` and `mockProposals` adjusted for new timing and phase context.
    - `startGame` and `fillParty` calls to contract's `startGame` updated (no longer pass `permutationCommitment`).
    - Game creation parameters (`getCreateGameParams`) now include `proposingPhaseDuration` and `votePhaseDuration`.
  - **Proof Generation (`scripts/proofs.ts`)**:
    - `generateDeterministicPermutation` calls in `getPlayerVoteSalt`, `mockVotes`, and `generateEndTurnIntegrity` now consistently use `turn: Number(turn)` (removed `- 1` offset).

- **Deployment and Build Process Updates (specific to this branch/PR)**:
  - `deploy/02_deployRankify.ts`: Initial token minting wrapped in try-catch.
  - `deploy/mao.ts`: `skipIfAlreadyDeployed` for many contracts now conditional via `FORCE_REDEPLOY` env var.
  - `hardhat.config.ts`: `viaIR: true` enabled. `contractSizer` run is conditional. Build tasks for ABI generation and super interface updated (includes removal of excessive console logs during compilation tasks).
  - `package.json`: Test and build scripts modified (e.g., `rm -rf abi/super-interface.json`).

- **Testing (`test/RankifyInstance.ts`)**:
  - Extensive updates to align with the new two-phase turn system (event names, function calls, state expectations, usage of new view functions like `isProposingStage`).
  - Addressed numerous test failures by ensuring consistent `simulatorInstance` and `rankTokenInstance` usage, especially in `beforeEach` and shared fixture contexts.
  - Investigated and attempted fixes for `insufficient` token errors and `startGame->Not enough players` errors in complex multi-game scenarios, highlighting potential remaining issues in state management across tests or in the simulation of token rewards/locking in `runToTheEnd`.
  - Many tests are now passing, but the `Multiple games were played` suite still had failing tests related to `RankToken` state at the time of this changeset, despite efforts to ensure instance consistency.
