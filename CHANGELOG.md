# rankify-contracts

## 0.16.0

### Minor Changes

- [#221](https://github.com/peeramid-labs/rankify-contracts/pull/221) [`d12080bcd44197c88552f0b71ae52eb9d354c34b`](https://github.com/peeramid-labs/rankify-contracts/commit/d12080bcd44197c88552f0b71ae52eb9d354c34b) Thanks [@peersky](https://github.com/peersky)! - Added comprehensive proposal score tracking and getter functionality:

  ## **BREAKING CHANGES**

  - **`getContractState()` API Change**: Function signature completely changed
    - **Before**: `function getContractState() public pure returns (LibRankify.InstanceState memory)`
    - **After**: `function getContractState() public view returns (uint256 numGames, bool contractInitialized, LibRankify.CommonParams memory commonParams)`
    - **Impact**: External integrations must update to handle multiple return values instead of struct
  - **Storage Layout Changes**: Internal data structures modified for game state
    - **InstanceState**: Added `mapping(bytes32 => ProposalScore) proposalScore`
    - **GameState**: Deprecated `mapping(uint256 => string) ongoingProposals`, added persistent proposal storage for each **turn**; Structure is still there to avoid breaking existing games, we will remove it in future releases
    - **Impact**: Contract upgrades require data migration, affects internal proposal access patterns
    - **Solution**: Migration can be done by manually disabling new game creation (game master api) and then using indexed data to get the scores for each turn and manually writing that data to a migration script and then executing it.

  ## ✅ **NEW FEATURES**

  - **New ScoreGetterFacet**: Added facet with 7 methods for querying proposal scores and existence
    - `getProposalGameScore()` - Get proposal score for specific game
    - `getProposalTurnScore()` - Get proposal score and proposer for specific turn
    - `getProposalsTurnScores()` - Get all proposals and scores for a turn
    - `proposalExistsInTurn()` - Check if proposal exists in specific turn
    - `proposalExistsInGame()` - Check if proposal exists in specific game
    - `proposalExists()` - Check if proposal exists in instance
    - `getProposalTotalScore()` - Get aggregated score across all games
  - **Enhanced data structures**: Updated LibRankify with new proposal score tracking system
    - Added persistent score storage across turns, games, and instance
    - Added proposer tracking for each proposal
    - Restructured proposal storage from temporary to persistent
  - **Updated game flow**: Modified scoring logic to populate new data structures during voting
  - **Distribution integration**: Added ScoreGetterFacet to ArguableVotingTournament distribution
  - **Testing**: Added tests for all new getter methods

## 0.15.0

### Minor Changes

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - added permutation info to voting stage results event:

  VotingStageResults signature now is:

      event VotingStageResults(
          uint256 indexed gameId,
          uint256 indexed roundNumber,
          address indexed winner,
          address[] players,
          uint256[] scores,
          uint256[][] votesSorted,
          bool[] isActive,
          uint256[][] finalizedVotingMatrix,
          uint256[] permutation
      );

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - Enhance RankifyInstance facets with reentrancy guards and new math utilities.

  Added `nonReentrant` modifier to `exitRankToken` function and implemented bank balance management in `LibCoinVending`.

  Updated `RankifyInstanceRequirementsFacet` to include new withdrawal functions and improved error handling in token transfers.

  Refactored `RankToken` storage position.

### Patch Changes

- [#208](https://github.com/peeramid-labs/rankify-contracts/pull/208) [`f957b79280efd3a2b515ef618db12673856a6008`](https://github.com/peeramid-labs/rankify-contracts/commit/f957b79280efd3a2b515ef618db12673856a6008) Thanks [@peersky](https://github.com/peersky)! - added SECURITY.md

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - deployment artifacts updated for arbitrum sepolia

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - added pulling from contract eth if it stuck

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - added overtime emitted unit test

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - createAndOpenGame added RegistrationOpen Test

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - chore: update Solidity version to 0.8.28 and refactor ArguableVotingTournament to correctly handle ownership transfer and game state transitions

- [#206](https://github.com/peeramid-labs/rankify-contracts/pull/206) [`04b7dc741e259724f3925dbcb69fc48b0f83d4a8`](https://github.com/peeramid-labs/rankify-contracts/commit/04b7dc741e259724f3925dbcb69fc48b0f83d4a8) Thanks [@peersky](https://github.com/peersky)! - Refactor RankifyInstanceMainFacet and LibTurnBasedGame for clarity and functionality. Updated `startGame` function to improve formatting and removed redundant lines in `LibCoinVending`. Streamlined game start logic by removing unnecessary player count checks in `startGameEarly` method.

## 0.14.3

### Patch Changes

- [#202](https://github.com/peeramid-labs/rankify-contracts/pull/202) [`c22561ce66c61c6da5aeb7509c38000e6c7d7a2b`](https://github.com/peeramid-labs/rankify-contracts/commit/c22561ce66c61c6da5aeb7509c38000e6c7d7a2b) Thanks [@peersky](https://github.com/peersky)! - added overtime emitted unit test

- [#202](https://github.com/peeramid-labs/rankify-contracts/pull/202) [`c22561ce66c61c6da5aeb7509c38000e6c7d7a2b`](https://github.com/peeramid-labs/rankify-contracts/commit/c22561ce66c61c6da5aeb7509c38000e6c7d7a2b) Thanks [@peersky](https://github.com/peersky)! - createAndOpenGame added RegistraionOpen Test

- [#202](https://github.com/peeramid-labs/rankify-contracts/pull/202) [`c22561ce66c61c6da5aeb7509c38000e6c7d7a2b`](https://github.com/peeramid-labs/rankify-contracts/commit/c22561ce66c61c6da5aeb7509c38000e6c7d7a2b) Thanks [@peersky](https://github.com/peersky)! - chore: update Solidity version to 0.8.28 and refactor ArguableVotingTournament to correctly handle ownership transfer and game state transitions

- [#202](https://github.com/peeramid-labs/rankify-contracts/pull/202) [`c22561ce66c61c6da5aeb7509c38000e6c7d7a2b`](https://github.com/peeramid-labs/rankify-contracts/commit/c22561ce66c61c6da5aeb7509c38000e6c7d7a2b) Thanks [@peersky](https://github.com/peersky)! - added permutation info to voting stage results event:

  VotingStageResults signature now is:

      event VotingStageResults(
          uint256 indexed gameId,
          uint256 indexed roundNumber,
          address indexed winner,
          address[] players,
          uint256[] scores,
          uint256[][] votesSorted,
          bool[] isActive,
          uint256[][] finalizedVotingMatrix,
          uint256[] permutation
      );

## 0.14.2

### Patch Changes

- [#201](https://github.com/peeramid-labs/rankify-contracts/pull/201) [`643871036f0f3588147ce3fb850deceb88c133e7`](https://github.com/peeramid-labs/rankify-contracts/commit/643871036f0f3588147ce3fb850deceb88c133e7) Thanks [@theKosmoss](https://github.com/theKosmoss)! - Update DAODistributor.json with new contract address

## 0.14.1

### Patch Changes

- [#198](https://github.com/peeramid-labs/rankify-contracts/pull/198) [`d1fbde95a0612936e966b97c42d1c65bb0f3671d`](https://github.com/peeramid-labs/rankify-contracts/commit/d1fbde95a0612936e966b97c42d1c65bb0f3671d) Thanks [@peersky](https://github.com/peersky)! - added newest artifacts

## 0.14.0

### Minor Changes

- [#163](https://github.com/peeramid-labs/rankify-contracts/pull/163) [`9a42714b18e710f8f05c3bc18444dfa781c95c38`](https://github.com/peeramid-labs/rankify-contracts/commit/9a42714b18e710f8f05c3bc18444dfa781c95c38) Thanks [@peersky](https://github.com/peersky)! - Added Governor contract for derived organizations with the following interface changes:

  - Added `Governor.sol` contract that implements OpenZeppelin's GovernorUpgradeable
  - Modified `MAODistribution.sol` constructor to accept a new `DAOId` parameter
  - Changed `TokenArguments` to `GovernanceArgs` with new fields:
    - Added `orgName` - organization name for the Governor
    - Added `votingDelay` - delay before voting can start
    - Added `votingPeriod` - duration of voting period
    - Added `quorum` - required participation threshold
  - Updated `instantiate` function to create and initialize the Governor contract
  - Removed `owner` parameter from `rankifySettings` (now using Governor address)
  - Added `MAOApp` struct for easier reference to deployed contracts
  - Modified return value order in `parseInstantiated` to include Governor address

- [#163](https://github.com/peeramid-labs/rankify-contracts/pull/163) [`9a42714b18e710f8f05c3bc18444dfa781c95c38`](https://github.com/peeramid-labs/rankify-contracts/commit/9a42714b18e710f8f05c3bc18444dfa781c95c38) Thanks [@peersky](https://github.com/peersky)! - _ **Enforced Minimum Proposal Participation:**
  _ The `endProposing` function (in `RankifyInstanceGameMastersFacet.sol`) and related logic in `LibRankify.sol` now enforce that if a proposing phase ends primarily due to a timeout, it must also have a sufficient number of proposals (at least `minQuadraticPositions`).
  _ If the timeout is reached but this minimum proposal count isn't met, the game generally won't proceed to the voting phase unless the overall `minGameTime` is also met (which could trigger stale game conditions).
  _ A new `IRankifyInstance.ProposingEndStatus` enum (`Success`, `MinProposalsNotMetAndNotStale`, `GameIsStaleAndCanEnd`, `PhaseConditionsNotMet`, `NotProposingStage`) is now returned by `LibRankify.canEndProposing` to provide detailed outcomes. \* A corresponding `ErrorProposingStageEndFailed(uint256 gameId, IRankifyInstance.ProposingEndStatus status)` error has been introduced to clearly communicate reasons for proposing stage failures.

  - **Stale Game Resolution:**
    - A new function, `forceEndStaleGame`, has been added to the `RankifyInstanceGameMastersFacet.sol`. This allows to forcibly end a game that is stuck.
    - Conditions for using `forceEndStaleGame`:
      1.  The minimum game duration (`minGameTime`) must have passed.
      2.  The game must currently be in the proposing stage.
      3.  The proposing phase duration must have timed out.
      4.  The number of submitted proposals must be less than `minQuadraticPositions`.
    - The library function `LibRankify.isGameStaleForForcedEnd` was added to encapsulate these specific conditions.
    - A new `StaleGameEnded(uint256 indexed gameId, address indexed winner)` event is emitted when a game is ended this way.
    - A new `ErrorCannotForceEndGame(uint256 gameId)` error is returned if `forceEndStaleGame` is called inappropriately.
    - Note: The `prevrandao`-based tie-breaking mechanism for stale/tied games mentioned in the original issue is **not** part of this specific changeset. Winner determination in stale scenarios currently relies on the existing scoring logic. Tie cases are handled by picking the first player in the leaderboard.
  - **Interface and Library Updates:**
    - `IRankifyInstance.sol`: Added the `ProposingEndStatus` enum, the `StaleGameEnded` event, and the new error types (`ErrorProposingStageEndFailed`, `ErrorCannotForceEndGame`).
    - `LibRankify.sol`: The `canEndProposing` function was significantly updated to return the new `ProposingEndStatus`. The helper `isGameStaleForForcedEnd` was introduced.
    - `LibTurnBasedGame.sol`: A guard for empty player arrays was added to the `sortByScore` function to prevent errors with no players.
  - **Testing Enhancements (`test/RankifyInstance.ts`):**
    - Comprehensive new tests were added to cover various scenarios for the `endProposing` function's behavior, especially when proposal participation is insufficient (both before and after `minGameTime` is met). These tests verify the correct `ProposingEndStatus` outcomes (e.g., `MinProposalsNotMetAndNotStale`, `GameIsStaleAndCanEnd`).
    - Detailed tests for the new `forceEndStaleGame` function were implemented, including conditions for successful execution and expected reverts (e.g., if `minGameTime` is not met, if the game is not in the proposing stage, or if the game is already over).
    - Edge cases, such as games with zero or only one proposer, are also covered in the new tests.
  - **Minor Refinements:**
    - The function selector for `forceEndStaleGame` was correctly added to the facet cut in `ArguableVotingTournament.sol`.
    - Minor type casting improvements were made in the `EnvironmentSimulator.ts` test helper script.

- [#180](https://github.com/peeramid-labs/rankify-contracts/pull/180) [`b2c6d861808e8d4c0898ceed2f836613a701507c`](https://github.com/peeramid-labs/rankify-contracts/commit/b2c6d861808e8d4c0898ceed2f836613a701507c) Thanks [@peersky](https://github.com/peersky)! - Major architectural and functional changes:

  - **Two-Phase Turn System**: Transitioned from a single `endTurn` function/concept to a two-phase system with distinct `endProposing` and `endVoting` stages. This was a core change impacting many areas:
    - **Solidity Contracts**:
      - `RankifyInstanceGameMastersFacet`: `endTurn` replaced by `endVoting`; new `endProposing` function added. Event logic updated (`ProposingStageEnded`, `VotingStageResults` added). Vote/proposal submission logic now phase-aware.
      - `RankifyInstanceMainFacet`: Added new phase-specific view functions: `isProposingStage(uint256 gameId)`, `isVotingStage(uint256 gameId)`, `canEndProposingStage(uint256 gameId)`, `canEndVotingStage(uint256 gameId)`. Removed `canEndTurn`. `startGame` no longer takes `permutationCommitment`.
      - `LibRankify`: Major rework to support phases. `GameState` and `NewGameParams` updated. `tryPlayerMove` became phase-aware. Added `canEndProposing`, `canEndVoting`, `isVotingStage`, `isProposingStage`. `calculateScores` now returns round winner.
      - `LibTBG`: Core turn logic refactored. `State` now includes `phase` and `phaseStartedAt` (renamed from `turnStartedAt`). `Settings` includes `turnPhaseDurations`. `nextTurn` became `next` (phase transition). Timeout and early end logic became phase-aware (`isTimeout`, `canTransitionPhaseEarly`).
      - Interfaces (`IRankifyInstance`) and event/struct definitions updated accordingly across facets.
      - Minimal required number of turns is now `>0` instead of `>1` to properly reflect new phase-awareness of the game;
      - `canEndProposing` now returns a tuple of `(bool, ProposingEndStatus)`.
      - `onlyInTime` modifier removed from `LibTurnBasedGame`, this mean that `playerMove` is not time-aware anymore and can be called at any time as long as player is in the game and did not make a move in the current turn. This means that even turn can be ended due to timeout, players still can make last call moves until someone hits the `endProposing` or `endVoting` functions.
    - **Environment Simulator (`scripts/EnvironmentSimulator.ts`)**:
      - `endTurn` and `endWithIntegrity` refactored to call `endProposing` and `endVoting` separately.
      - `makeTurn` logic updated to reflect the two-phase process.
      - `mockValidVotes` and `mockProposals` adjusted for new timing and phase context.
      - `startGame` and `fillParty` calls to contract's `startGame` updated (no longer pass `permutationCommitment`).
      - Game creation parameters (`getCreateGameParams`) now include `proposingPhaseDuration` and `votePhaseDuration`.
      - Minimum game time increased to ensure proper phase timing and reliable testing of the `canEndProposing` conditions.
    - **Proof Generation (`scripts/proofs.ts`)**:
      - `generateDeterministicPermutation` calls in `getPlayerVoteSalt`, `mockVotes`, and `generateEndTurnIntegrity` now consistently use `turn: Number(turn)` (removed `- 1` offset).
  - **Minor contract improvements & bug fixes**:
    - Enhanced RankifyInstanceGameMastersFacet and LibQuadraticVoting to include additional voting data
    - Modified `LibQuadraticVoting` to return the `finalizedVotingMatrix` alongside scores, improving the tracking of voting outcomes.
    - Updated `RankifyInstanceGameMastersFacet` to emit new parameters `isActive` and `finalizedVotingMatrix` in the `VotingStageResults` event.
    - Adjusted `LibRankify` to initialize the `isActive` array for players, ensuring accurate game state representation.
    - `LibQuadraticVoting.precomputeValues` in `createGame` now takes correctly `params.minPlayerCnt` as argument to minimum expected vote items;
    - Fixed bug that allowed game master to submit non-zero votes for players that did not vote;
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
    - Added comprehensive proposing stage validation tests to verify the `canEndProposing` functionality across various game states and conditions.

- [#163](https://github.com/peeramid-labs/rankify-contracts/pull/163) [`9a42714b18e710f8f05c3bc18444dfa781c95c38`](https://github.com/peeramid-labs/rankify-contracts/commit/9a42714b18e710f8f05c3bc18444dfa781c95c38) Thanks [@peersky](https://github.com/peersky)! - all game price tokens are now transferred to benefeciary account

### Patch Changes

- [#163](https://github.com/peeramid-labs/rankify-contracts/pull/163) [`9a42714b18e710f8f05c3bc18444dfa781c95c38`](https://github.com/peeramid-labs/rankify-contracts/commit/9a42714b18e710f8f05c3bc18444dfa781c95c38) Thanks [@peersky](https://github.com/peersky)! - MAO-v1.3 added to distributor

- [#163](https://github.com/peeramid-labs/rankify-contracts/pull/163) [`9a42714b18e710f8f05c3bc18444dfa781c95c38`](https://github.com/peeramid-labs/rankify-contracts/commit/9a42714b18e710f8f05c3bc18444dfa781c95c38) Thanks [@peersky](https://github.com/peersky)! - added tests for cases when players are inactive

- [#180](https://github.com/peeramid-labs/rankify-contracts/pull/180) [`b2c6d861808e8d4c0898ceed2f836613a701507c`](https://github.com/peeramid-labs/rankify-contracts/commit/b2c6d861808e8d4c0898ceed2f836613a701507c) Thanks [@peersky](https://github.com/peersky)! - - Changed LibRankify functions from `internal` to `public` to counter contract size limit

  - Modified player game tracking to support multiple games:
    - Changed `playerInGame` from mapping to single uint256 to EnumerableSet.UintSet
    - Renamed `getPlayersGame` to `getPlayersGames` returning array of game IDs
    - Added `isPlayerInGame` function to check if player is in specific game
  - Updated deployment script to deploy LibRankify separately and link to facets
  - Fixed tests to reflect new multi-game capability

- [`79965567f162094e159221b6d7915633b3e43cd0`](https://github.com/peeramid-labs/rankify-contracts/commit/79965567f162094e159221b6d7915633b3e43cd0) Thanks [@peersky](https://github.com/peersky)! - updated distr artifacts

- [#180](https://github.com/peeramid-labs/rankify-contracts/pull/180) [`b2c6d861808e8d4c0898ceed2f836613a701507c`](https://github.com/peeramid-labs/rankify-contracts/commit/b2c6d861808e8d4c0898ceed2f836613a701507c) Thanks [@peersky](https://github.com/peersky)! - Removed specific time-related divisibility checks from `LibRankify.newGame` function:

  - Removed `require(commonParams.principalTimeConstant % params.nTurns == 0)`
  - Removed `require(params.minGameTime % params.nTurns == 0)`

  These checks were likely removed to optimize gas or simplify game creation logic by no longer strictly enforcing that `principalTimeConstant` and `minGameTime` are exact multiples of `nTurns`.

- [#163](https://github.com/peeramid-labs/rankify-contracts/pull/163) [`9a42714b18e710f8f05c3bc18444dfa781c95c38`](https://github.com/peeramid-labs/rankify-contracts/commit/9a42714b18e710f8f05c3bc18444dfa781c95c38) Thanks [@peersky](https://github.com/peersky)! - Added ProposingStageEnded event and updated gameCreated event defintion in IRankifyInstance

- [#163](https://github.com/peeramid-labs/rankify-contracts/pull/163) [`9a42714b18e710f8f05c3bc18444dfa781c95c38`](https://github.com/peeramid-labs/rankify-contracts/commit/9a42714b18e710f8f05c3bc18444dfa781c95c38) Thanks [@peersky](https://github.com/peersky)! - fixed bug that caused incorrect score tallying under cases when there was partially overlapping proposer/voter sets

## 0.13.1

### Patch Changes

- [`4fb1d387d1d2d283a30d6d17f467d69d32ac82b1`](https://github.com/peeramid-labs/rankify-contracts/commit/4fb1d387d1d2d283a30d6d17f467d69d32ac82b1) Thanks [@peersky](https://github.com/peersky)! - arbsepolia deployment arfifacts

## 0.13.0

### Minor Changes

- [#179](https://github.com/peeramid-labs/rankify-contracts/pull/179) [`b620687f3589daefa2dff164f3de14f6406ca9b6`](https://github.com/peeramid-labs/rankify-contracts/commit/b620687f3589daefa2dff164f3de14f6406ca9b6) Thanks [@peersky](https://github.com/peersky)! - Significant contract architecture changes:

  - **MAODistribution.sol**:
    - Removed hardcoded `_paymentToken` and `_beneficiary` immutable state variables
    - Made these configurable per distribution instance by adding to `RankifySettings` struct
    - Changed `instantiate` to use `calldata` instead of `memory` for gas optimization
    - Added pre-mint capability to token creation with `preMintAmounts` and `preMintReceivers` arrays
  - **Game Creation Improvements**:
    - Added `createAndOpenGame` function that creates and opens registration in one transaction
    - Modified `createGame` to return the created game ID
    - Added support for passing requirements directly during game creation
  - **Requirement Changes**:
    - Moved `RequirementsConfigured` event to the interface for better organization
    - Reduced minimum player count from 5 to 3
    - Removed constraints requiring `minGameTime` to be divisible by number of turns
    - Changed turn count minimum from > 2 to > 1
  - **Tests**:
    - Updated all tests to work with the new parameter structure
    - Removed tests for no longer enforced constraints

### Patch Changes

- [#179](https://github.com/peeramid-labs/rankify-contracts/pull/179) [`b620687f3589daefa2dff164f3de14f6406ca9b6`](https://github.com/peeramid-labs/rankify-contracts/commit/b620687f3589daefa2dff164f3de14f6406ca9b6) Thanks [@peersky](https://github.com/peersky)! - - Changed LibRankify functions from `internal` to `public` to counter contract size limit

  - Modified player game tracking to support multiple games:
    - Changed `playerInGame` from mapping to single uint256 to EnumerableSet.UintSet
    - Renamed `getPlayersGame` to `getPlayersGames` returning array of game IDs
    - Added `isPlayerInGame` function to check if player is in specific game
  - Updated deployment script to deploy LibRankify separately and link to facets
  - Fixed tests to reflect new multi-game capability

- [#179](https://github.com/peeramid-labs/rankify-contracts/pull/179) [`b620687f3589daefa2dff164f3de14f6406ca9b6`](https://github.com/peeramid-labs/rankify-contracts/commit/b620687f3589daefa2dff164f3de14f6406ca9b6) Thanks [@peersky](https://github.com/peersky)! - Removed specific time-related divisibility checks from `LibRankify.newGame` function:

  - Removed `require(commonParams.principalTimeConstant % params.nTurns == 0)`
  - Removed `require(params.minGameTime % params.nTurns == 0)`

  These checks were likely removed to optimize gas or simplify game creation logic by no longer strictly enforcing that `principalTimeConstant` and `minGameTime` are exact multiples of `nTurns`.

## 0.12.4

### Patch Changes

- [`2a873995acf78c913e1260a0e0f079658c6101ab`](https://github.com/peeramid-labs/rankify-contracts/commit/2a873995acf78c913e1260a0e0f079658c6101ab) Thanks [@peersky](https://github.com/peersky)! - fixed zk_artifacts compilation logic

## 0.12.3

### Patch Changes

- [#159](https://github.com/peeramid-labs/rankify-contracts/pull/159) [`7c3b2144071e21f11cce3c9e66982fb4123b8976`](https://github.com/peeramid-labs/rankify-contracts/commit/7c3b2144071e21f11cce3c9e66982fb4123b8976) Thanks [@peersky](https://github.com/peersky)! - Added owner argument to creat subject cli call

- [#159](https://github.com/peeramid-labs/rankify-contracts/pull/159) [`7c3b2144071e21f11cce3c9e66982fb4123b8976`](https://github.com/peeramid-labs/rankify-contracts/commit/7c3b2144071e21f11cce3c9e66982fb4123b8976) Thanks [@peersky](https://github.com/peersky)! - made game canceled state more explicit

- [#159](https://github.com/peeramid-labs/rankify-contracts/pull/159) [`7c3b2144071e21f11cce3c9e66982fb4123b8976`](https://github.com/peeramid-labs/rankify-contracts/commit/7c3b2144071e21f11cce3c9e66982fb4123b8976) Thanks [@peersky](https://github.com/peersky)! - allow updating game medatata with (add owner to metadata URIs)

  ## Breaking change

  - `MAODistribution` now requires an `owner` parameter in the `rankifySettings` struct. This is used to set the owner of the rank token.

- [#159](https://github.com/peeramid-labs/rankify-contracts/pull/159) [`7c3b2144071e21f11cce3c9e66982fb4123b8976`](https://github.com/peeramid-labs/rankify-contracts/commit/7c3b2144071e21f11cce3c9e66982fb4123b8976) Thanks [@peersky](https://github.com/peersky)! - Added ZK artifacts to source control, that way we ensure consistent zkey and verififer contract

## 0.12.2

### Patch Changes

- [#152](https://github.com/peeramid-labs/rankify-contracts/pull/152) [`459f582e93cb52ca4de6a02d9c7f35c3f238f35a`](https://github.com/peeramid-labs/rankify-contracts/commit/459f582e93cb52ca4de6a02d9c7f35c3f238f35a) Thanks [@peersky](https://github.com/peersky)! - made game canceled state more explicit

- [#150](https://github.com/peeramid-labs/rankify-contracts/pull/150) [`2c59281fdeb2c14180aff428d751a1ae0156ff6b`](https://github.com/peeramid-labs/rankify-contracts/commit/2c59281fdeb2c14180aff428d751a1ae0156ff6b) Thanks [@peersky](https://github.com/peersky)! - allow updating game medatata with (add owner to metadata URIs)

  ## Breaking change

  - `MAODistribution` now requires an `owner` parameter in the `rankifySettings` struct. This is used to set the owner of the rank token.

## 0.12.1

### Patch Changes

- [#136](https://github.com/peeramid-labs/rankify-contracts/pull/136) [`82efeb0f2301797a0e6435cf3a54cc7c4440e1a5`](https://github.com/peeramid-labs/rankify-contracts/commit/82efeb0f2301797a0e6435cf3a54cc7c4440e1a5) Thanks [@theKosmoss](https://github.com/theKosmoss)! - Fixed created distribution check... added new flag to setupMockEnvironment

- [#143](https://github.com/peeramid-labs/rankify-contracts/pull/143) [`f3fa6b8ef1d101a93d86b09df3978a07f449c5a2`](https://github.com/peeramid-labs/rankify-contracts/commit/f3fa6b8ef1d101a93d86b09df3978a07f449c5a2) Thanks [@peersky](https://github.com/peersky)! - Minor improvements and tweaks

- [#143](https://github.com/peeramid-labs/rankify-contracts/pull/143) [`f3fa6b8ef1d101a93d86b09df3978a07f449c5a2`](https://github.com/peeramid-labs/rankify-contracts/commit/f3fa6b8ef1d101a93d86b09df3978a07f449c5a2) Thanks [@peersky](https://github.com/peersky)! - Arbitrum Seplolia contract deployment

## 0.12.0

### Minor Changes

- [#134](https://github.com/peeramid-labs/contracts/pull/134) [`ef0faf485c1b27933fb41deb1c904708e75328f5`](https://github.com/peeramid-labs/contracts/commit/ef0faf485c1b27933fb41deb1c904708e75328f5) Thanks [@peersky](https://github.com/peersky)! - Added metadata field to game properties

- [#110](https://github.com/peeramid-labs/contracts/pull/110) [`b7081591a12eccb8a83d22d4975b4062568597c2`](https://github.com/peeramid-labs/contracts/commit/b7081591a12eccb8a83d22d4975b4062568597c2) Thanks [@peersky](https://github.com/peersky)! - # Changelog

  ## Major Contract Changes

  ### Major Features

  - **Zero-Knowledge Proof Integration**
    Added circuit-based integrity verification system for game state transitions:

    - New `proposals_integrity_15.circom` circuit using Poseidon hashing
    - Commitment scheme for proposal permutations and ballot validity
    - Proof verification required for turn transitions (`endTurn`)

  - **EIP-712 Signature Workflows**
    Implemented typed message signing for critical operations:
    - Game joining requires `signJoiningGame`, signed by GameMaster, attesting player for joining the game
    - Vote submissions now need dual signatures (GM + Voter)
    - Cryptographic commitments for proposal submissions also are signed

  ### Breaking Changes

  - **Maximum number of participants**
    Due to the limits of the ZK proof, maximum number of participants is now 15 per one game.
    We may change this later but for now this is the limit.
  - **Proposal Submission**

    - `bytes32 commitmentHash;` is now `uint256 commitment;`
    - gm and voter signatures were added

    new proposal params struct looks like this:

    ```solidity
    struct ProposalParams {
      uint256 gameId;
      string encryptedProposal;
      uint256 commitment;
      address proposer;
      bytes gmSignature;
      bytes voterSignature;
    }
    ```

  - **Vote Submission**

    - `string encryptedVotes;` is now `string sealedBallotId;`
    - signatures for gm and voter were added
    - ballot hash is added as parameter it is calculated as `keccak256(vote, playerVoteSalt)`
      new interface for vote submission looks as follows:

    ```solidity
    function submitVote(
          uint256 gameId,
          string memory sealedBallotId,
          address voter,
          bytes memory gmSignature,
          bytes memory voterSignature,
          bytes32 ballotHash
      )
    ```

  - **Turn Transition Requirements**

    `endTurn` now requires ZK proof parameters:

    ```solidity
        function endTurn(
            uint256 gameId,
            uint256[][] memory votes,
            BatchProposalReveal memory newProposals,
            uint256[] memory permutation,
            uint256 shuffleSalt
        )
    ```

    Where `BatchProposalReveal` is defined as:

    ```solidity
    /**
     * @dev Represents a batch of proposal reveals for a game.
     * @param proposals Array of revealed proposals
     * @param a ZK proof components
     * @param b ZK proof components
     * @param c ZK proof components
     * @param permutationCommitment The commitment to the permutation
     * @notice permutationCommitment must be poseidon(sponge(nextTurnPermutation), nullifier). For sponge implementation see poseidonSpongeT3
     */
    struct BatchProposalReveal {
      string[] proposals; // Array of revealed proposals
      uint[2] a; // ZK proof components
      uint[2][2] b;
      uint[2] c;
      uint256 permutationCommitment;
    }
    ```

  - **Join game**: signature and salt are now required

    ```solidity
    function joinGame(
          uint256 gameId,
          bytes memory gameMasterSignature,
          bytes memory hiddenSalt
      )
    ```

  - **Start game**
    Now requires permutationCommitment from game master. This is used as permutation integrity value during first turn proposal reveal.

    ```solidity
    function startGame(uint256 gameId, uint256 permutationCommitment)
    ```

  - **Game Winner**
    New interface to query for game winner added

    ```solidity
    /**
     * @dev Returns the winner of the game with the specified ID
     * @param gameId The ID of the game
     * @return address The winner of the game
     */
    function gameWinner(uint256 gameId) public view returns (address) {
      return gameId.getGameState().winner;
    }
    ```

  - **Player joined event**
    Now when player joins, participant address and commitment are emitted

    ```solidity
    event PlayerJoined(uint256 indexed gameId, address indexed participant, bytes hiddenSalt);
    ```

  ### Other Improvements

  - **Enhanced Security**

    - Ballot integrity checks with hash commitments

    ```solidity
    require(
        ballotHash == ballotHashFromVotes,
        "Ballot integrity check failed"
    );
    ```

  - **Testing Infrastructure**
    Added comprehensive test coverage for:

    - ZK proof generation/verification workflows
    - Signature validation edge cases
    - Game cancellation scenarios
    - Malicious actor simulations

  - **Governance Constraints**
    - Minimum participant requirements
    - Principal cost calculations based on game parameters
    - 90/10 payment split between burn and DAO
  - GameLifeCycle script was renamed to `interactive` run it with
    `pnpm hardhat --network $NETWORK interactive`
  - all signatures are now available in `./all-signatures.json`
  - `pnpm clean` added to clean all artifacts & zk proofs cache

  ### Migration Notes

  1. **Client Updates Required**
     All game interactions must now:

     - Generate ZK proofs for turn transitions
     - Handle EIP-712 signatures for votes/joining

  2. **Upgrade Path**
     ```bash
     pnpm update rankify-contracts
     ```

- [#110](https://github.com/peeramid-labs/contracts/pull/110) [`b7081591a12eccb8a83d22d4975b4062568597c2`](https://github.com/peeramid-labs/contracts/commit/b7081591a12eccb8a83d22d4975b4062568597c2) Thanks [@peersky](https://github.com/peersky)! - players now must submit game master signature upon joining

### Patch Changes

- [#129](https://github.com/peeramid-labs/contracts/pull/129) [`adb3d3f7ba536015d637a73118c24a69ceff3bd6`](https://github.com/peeramid-labs/contracts/commit/adb3d3f7ba536015d637a73118c24a69ceff3bd6) Thanks [@peersky](https://github.com/peersky)! - playbook improvement to accomodate with demo requirements

- [#110](https://github.com/peeramid-labs/contracts/pull/110) [`b7081591a12eccb8a83d22d4975b4062568597c2`](https://github.com/peeramid-labs/contracts/commit/b7081591a12eccb8a83d22d4975b4062568597c2) Thanks [@peersky](https://github.com/peersky)! - removed duplicates between test utils and playbook utils

## 0.11.2

### Patch Changes

- [#125](https://github.com/peeramid-labs/contracts/pull/125) [`ed516b3b6712c32c80007488b10e36ce41afb720`](https://github.com/peeramid-labs/contracts/commit/ed516b3b6712c32c80007488b10e36ce41afb720) Thanks [@peersky](https://github.com/peersky)! - fixed playbooks to work with updated eds internal deplyoment

- [#125](https://github.com/peeramid-labs/contracts/pull/125) [`ed516b3b6712c32c80007488b10e36ce41afb720`](https://github.com/peeramid-labs/contracts/commit/ed516b3b6712c32c80007488b10e36ce41afb720) Thanks [@peersky](https://github.com/peersky)! - using external dependency EDS to avoid need for forks or pre-deployments outside of this repo

## 0.11.1

### Patch Changes

- [#122](https://github.com/peeramid-labs/contracts/pull/122) [`8ca5c05fa5817c8220062d24d12522876822bb07`](https://github.com/peeramid-labs/contracts/commit/8ca5c05fa5817c8220062d24d12522876822bb07) Thanks [@peersky](https://github.com/peersky)! - playbooks now work without need to be uncommented

- [#124](https://github.com/peeramid-labs/contracts/pull/124) [`033b69b96b48065100b2c141f0ce2d1ca09aebe3`](https://github.com/peeramid-labs/contracts/commit/033b69b96b48065100b2c141f0ce2d1ca09aebe3) Thanks [@peersky](https://github.com/peersky)! - using external dependency EDS to avoid need for forks or pre-deployments outside of this repo

## 0.11.0

### Minor Changes

- [#121](https://github.com/peeramid-labs/contracts/pull/121) [`40c69b68b9d451e11b75ed5d867d523e69516dc4`](https://github.com/peeramid-labs/contracts/commit/40c69b68b9d451e11b75ed5d867d523e69516dc4) Thanks [@peersky](https://github.com/peersky)! - added eip712 domain name and version returns

- [#103](https://github.com/peeramid-labs/contracts/pull/103) [`2d915aa7b76215fd499b8b8387f3a268f721eab7`](https://github.com/peeramid-labs/contracts/commit/2d915aa7b76215fd499b8b8387f3a268f721eab7) Thanks [@theKosmoss](https://github.com/theKosmoss)! - Playbook teask to create sample subjects

- [#112](https://github.com/peeramid-labs/contracts/pull/112) [`1b05d8c86f3c72d2e7fd665551149531382b3ec4`](https://github.com/peeramid-labs/contracts/commit/1b05d8c86f3c72d2e7fd665551149531382b3ec4) Thanks [@peersky](https://github.com/peersky)! - added ability to mint derived tokens by burning rank tokens. added min participant count as fundamental constant to instance creation interface

- [#117](https://github.com/peeramid-labs/contracts/pull/117) [`f5c1790cbd8f4936d73feb0701920a38adc94984`](https://github.com/peeramid-labs/contracts/commit/f5c1790cbd8f4936d73feb0701920a38adc94984) Thanks [@peersky](https://github.com/peersky)! - added playbooks to set state for local dev and demos, cleaned unused dependencies, fixed minor event issues in contracts

- [#116](https://github.com/peeramid-labs/contracts/pull/116) [`eb1961809276b8400edbc9ee4b280d8e4b4dc891`](https://github.com/peeramid-labs/contracts/commit/eb1961809276b8400edbc9ee4b280d8e4b4dc891) Thanks [@theKosmoss](https://github.com/theKosmoss)! - Created mintRankifyToken playbook. Updated sample subjects playbook

## 0.10.2

### Patch Changes

- [#98](https://github.com/peeramid-labs/contracts/pull/98) [`9507326d20c5ce870cbef96650ebcae60fc5ce5a`](https://github.com/peeramid-labs/contracts/commit/9507326d20c5ce870cbef96650ebcae60fc5ce5a) Thanks [@peersky](https://github.com/peersky)! - updated readme with latest release information

## 0.10.1

### Patch Changes

- [#96](https://github.com/peeramid-labs/contracts/pull/96) [`c582421d2e4672f15e768d1a8293d42e72c5e0f9`](https://github.com/peeramid-labs/contracts/commit/c582421d2e4672f15e768d1a8293d42e72c5e0f9) Thanks [@peersky](https://github.com/peersky)! - improved create game playbooks

## 0.10.0

### Minor Changes

- [#82](https://github.com/peeramid-labs/contracts/pull/82) [`c53987d3423287f11af3e41e5f83fe1a13fa9f48`](https://github.com/peeramid-labs/contracts/commit/c53987d3423287f11af3e41e5f83fe1a13fa9f48) Thanks [@peersky](https://github.com/peersky)! - # Changeset for branch 64-principal-game-cost-time-parameters

  ## Summary

  This branch introduces significant changes to game cost and time parameters, payment handling, and rank token mechanics, along with several code improvements and bug fixes.

  ## Changes

  ### Core Game Mechanics

  - `LibRankify.sol`:
    - Introduced principal game cost calculation based on game time
    - Added minimum game time validation and constraints
    - Implemented 90/10 payment split: 90% burned, 10% to DAO
    - Removed payment refunds and game cancellation payments
    - Simplified rank token rewards to only top player
    - Added validation for turn count and game time parameters

  ### Libraries

  - `LibTBG.sol`:
    - Added `startedAt` timestamp for minimum game time tracking
    - Renamed `getGameSettings()` to `getSettings(uint256 gameId)` for better clarity
    - Updated storage access patterns for overtime functionality
    - Simplified tie detection logic to only consider top 2 players
    - Fixed storage slot access patterns

  ### Tokens

  - `DistributableGovernanceERC20.sol`:
    - Updated Solidity version from 0.8.20 to 0.8.28
  - `RankToken.sol`:
    - Updated Solidity version from ^0.8.20 to =0.8.28
    - Added IERC165 import
    - Implemented burn function with ERC7746C middleware

  ### Vendor

  - Renamed `DiamondCloneable.sol` to `DiamondClonable.sol`:
    - Fixed typo in error name from 'fucntionDoesNotExist' to 'functionDoesNotExist'
  - `DiamondLoupeFacet.sol`:
    - Updated Solidity version to ^0.8.28
  - `LibDiamond.sol`:
    - Added DuplicateSignature error definition

  ### Removed Files

  - Deleted `test/DNSFacet.ts`
  - Removed multipass sources:
    - `src/facets/DNSFacet.sol`
    - `src/initializers/MultipassInit.sol`
    - `src/libraries/LibMultipass.sol`
    - `src/interfaces/IMultipass.sol`

  ### Mocks

  - `RankifyInstanceEventMock.sol`:
    - Fixed typo in parameter name from 'proposerIndicies' to 'proposerIndices'

  ## Breaking Changes

  - Storage layout changes in LibTBG require careful migration
  - Payment handling completely reworked:
    - Removed refunds functionality
    - Implemented burn mechanism for 90% of payments
    - Added DAO benefit for 10% of payments
  - Rank token rewards simplified to only top player
  - Solidity version updates may require dependency updates
  - Renamed Diamond contract file requires build script updates
  - Removed all multipass functionality

  ## Migration Guide

  1. Update build scripts to reference new DiamondClonable filename
  2. Verify storage layout compatibility after LibTBG changes
  3. Update dependencies to support Solidity 0.8.28
  4. Remove any references to multipass functionality
  5. Update payment handling code to work with new burn mechanism
  6. Adjust rank token distribution logic for single winner
  7. Ensure game time parameters meet new constraints

- [#57](https://github.com/peeramid-labs/contracts/pull/57) [`5360ba4fbc5029dc572b78fb330a69a6df903826`](https://github.com/peeramid-labs/contracts/commit/5360ba4fbc5029dc572b78fb330a69a6df903826) Thanks [@peersky](https://github.com/peersky)! - eslint major verison change

- [#50](https://github.com/peeramid-labs/contracts/pull/50) [`80e2198289cf6fafae910d5a4f1d3442afabbbfb`](https://github.com/peeramid-labs/contracts/commit/80e2198289cf6fafae910d5a4f1d3442afabbbfb) Thanks [@peersky](https://github.com/peersky)! - Migration to v5

- [#48](https://github.com/peeramid-labs/contracts/pull/48) [`d449bb2174c3959447d717bb0d0d64f617467a45`](https://github.com/peeramid-labs/contracts/commit/d449bb2174c3959447d717bb0d0d64f617467a45) Thanks [@peersky](https://github.com/peersky)! - changed documentation generation system to be more readable and per file separated

- [#86](https://github.com/peeramid-labs/contracts/pull/86) [`5a4493123798682b7cbd3eeddf277dc11cd023da`](https://github.com/peeramid-labs/contracts/commit/5a4493123798682b7cbd3eeddf277dc11cd023da) Thanks [@peersky](https://github.com/peersky)! - added playbooks for adding distribution and creating subject, removed old multipass playbook

- [#61](https://github.com/peeramid-labs/contracts/pull/61) [`db186f717e1babebf6c1653afb7862d2120e545e`](https://github.com/peeramid-labs/contracts/commit/db186f717e1babebf6c1653afb7862d2120e545e) Thanks [@peersky](https://github.com/peersky)! - Updated readme

- [#53](https://github.com/peeramid-labs/contracts/pull/53) [`999e9339e318723137ddc2f9d640c54f157e67b9`](https://github.com/peeramid-labs/contracts/commit/999e9339e318723137ddc2f9d640c54f157e67b9) Thanks [@peersky](https://github.com/peersky)! - added playbook functionality to execute state emulation

- [#66](https://github.com/peeramid-labs/contracts/pull/66) [`40e4f88c1b27d2d1e3c4f915337779f8cfb0ed35`](https://github.com/peeramid-labs/contracts/commit/40e4f88c1b27d2d1e3c4f915337779f8cfb0ed35) Thanks [@peersky](https://github.com/peersky)! - moved eds as dependency

- [#50](https://github.com/peeramid-labs/contracts/pull/50) [`80e2198289cf6fafae910d5a4f1d3442afabbbfb`](https://github.com/peeramid-labs/contracts/commit/80e2198289cf6fafae910d5a4f1d3442afabbbfb) Thanks [@peersky](https://github.com/peersky)! - Migrated to oz contracts v5

- [#55](https://github.com/peeramid-labs/contracts/pull/55) [`73ea44f3e83cd3eab3d8f9db1a605606cfcfed21`](https://github.com/peeramid-labs/contracts/commit/73ea44f3e83cd3eab3d8f9db1a605606cfcfed21) Thanks [@peersky](https://github.com/peersky)! - generic diamond factory implementation via Ethereum Distribution System

- [#62](https://github.com/peeramid-labs/contracts/pull/62) [`0c4f23cca04fa78564877cbb971ade0a96603314`](https://github.com/peeramid-labs/contracts/commit/0c4f23cca04fa78564877cbb971ade0a96603314) Thanks [@peersky](https://github.com/peersky)! - ## Addition of Ethereum Distribution System (EDS)

  - **Feature**: Integrated the Ethereum Distribution System (EDS) for distributing Rankify contracts.
  - **Description**: Rankify contracts are now distributed via the Ethereum Distribution System, enhancing the efficiency and security of the distribution process.

  ## Redesign of Contracts

  - **Feature**: Redesigned contracts to work seamlessly as part of the Ethereum Distribution System.
  - **Description**: The contracts have been restructured and optimized to ensure compatibility and smooth operation within the EDS framework. This redesign includes:
    - Improved contract architecture for better integration with EDS.
    - Enhanced security measures to protect against potential vulnerabilities.
    - Optimized performance to handle the distribution process more efficiently.

  ## Impact

  - **Users**:
    - Can create new subjects that are called Meritocratic Autonomous Organizations (MAOs).
    - Will benefit from a more secure and efficient distribution process.
  - **Developers**: Developers will need to familiarize themselves with the new contract architecture and EDS integration.
  - **Operations**: The distribution process will be streamlined, reducing the potential for errors and improving overall system reliability.

  ## Next Steps

  - **Documentation**: Update the documentation to include details on the new EDS integration and contract redesign.
  - **Testing**: Conduct thorough testing to ensure the new system operates as expected.
  - **Deployment**: Plan and execute the deployment of the updated contracts and distribution system.

- [#84](https://github.com/peeramid-labs/contracts/pull/84) [`26bcabd15ced84405dc20009b89edd572bbf0128`](https://github.com/peeramid-labs/contracts/commit/26bcabd15ced84405dc20009b89edd572bbf0128) Thanks [@peersky](https://github.com/peersky)! - # Changeset Summary

  ## Overview

  Added ability to end turns if there are inactive players without waiting for their move.

  ## Changes

  ### ArguableVotingTournament.sol

  - Increased the size of `RankifyInstanceMainFacetSelectors` from 27 to 28.
  - Added a new function selector `RankifyInstanceMainFacet.isActive.selector`.

  ### RankifyInstanceMainFacet.sol

  - Added a new function `isActive` which takes a `gameId` and a `player` address and returns a boolean indicating if the game is active for the player.

  ### LibQuadraticVoting.sol

  - Changed the parameter name from `voterVoted` to `isActive` in the `computeScoresByVPIndex` function.
  - Moved the initialization of `notVotedGivesEveryone` to use `q.maxQuadraticPoints`.
  - Updated the condition to check `!isActive[vi]` instead of `!voterVoted[vi]`.

  ### LibTurnBasedGame.sol

  - Added a new `isActive` mapping to track active players.
  - Introduced `numActivePlayers` to count the number of active players.
  - Updated the `resetGame` function to initialize `isActive` to `false` for all players and reset `numActivePlayers`.
  - Modified `addPlayer` to initialize `isActive` to `false` for new participants.
  - Enhanced `canEndTurnEarly` to check if all active players have made their move before allowing an early turn end.
  - Removed out the `_clearCurrentMoves` function
  - Updated the `startGame` function to set all players as active initially.
  - Modified `recordMove` to mark a player as active when they make a move and increment `numActivePlayers`.

  ## Summary of Changes

  - **Functionality Enhancements**: Added a new `isActive` function in `RankifyInstanceMainFacet.sol` to check the active status of a game for a specific player.
  - **Refactoring**: Renamed parameters and adjusted logic in `LibQuadraticVoting.sol` to align with the new active status checking mechanism.
  - **Code Organization**: Updated selectors in `ArguableVotingTournament.sol` to accommodate the new functionality.
  - **Game Management Enhancements**: Introduced active player tracking and management in `LibTurnBasedGame.sol`, enhancing game state management and turn-based logic.

  These changes introduce new functionality to check the active status of a game, which likely impacts how games are managed and interacted with in your application.

- [#81](https://github.com/peeramid-labs/contracts/pull/81) [`3cfd71fc9c15c11d6a357aa7ec42607d4cde8387`](https://github.com/peeramid-labs/contracts/commit/3cfd71fc9c15c11d6a357aa7ec42607d4cde8387) Thanks [@peersky](https://github.com/peersky)! - renamed distributor contract to DAO distributor and used TokenizedDistributor instead of casual one

- [#60](https://github.com/peeramid-labs/contracts/pull/60) [`55fc1a6ed9f1b7fc4520c3ec6fab5c7f7ae7a3b5`](https://github.com/peeramid-labs/contracts/commit/55fc1a6ed9f1b7fc4520c3ec6fab5c7f7ae7a3b5) Thanks [@theKosmoss](https://github.com/theKosmoss)! - Created new playbook scenario 'gameCreated' and some general playbooks refactors

- [#31](https://github.com/peeramid-labs/contracts/pull/31) [`3da696b43f43af8b3130bf7aa2d93575b656d66f`](https://github.com/peeramid-labs/contracts/commit/3da696b43f43af8b3130bf7aa2d93575b656d66f) Thanks [@peersky](https://github.com/peersky)! - Introduced installer interfaces

- [#87](https://github.com/peeramid-labs/contracts/pull/87) [`27e1c1af2d139479a5e4d1db26ad076ffdb237db`](https://github.com/peeramid-labs/contracts/commit/27e1c1af2d139479a5e4d1db26ad076ffdb237db) Thanks [@peersky](https://github.com/peersky)! - fixed createGame playbook

- [#91](https://github.com/peeramid-labs/contracts/pull/91) [`df675d896269218e2d5a6742eb6ed3423f8789b4`](https://github.com/peeramid-labs/contracts/commit/df675d896269218e2d5a6742eb6ed3423f8789b4) Thanks [@peersky](https://github.com/peersky)! - - added deployment artifacts for 0.10.0 release
  - added getGameState getter to rankify main facet
  - added helper functions in scripts
  - implemented named distributions from newest EDS release
  - added more documentation strings

### Patch Changes

- [#54](https://github.com/peeramid-labs/contracts/pull/54) [`569fb0f7cc0cd7a99065fae3873296378b8ffd1a`](https://github.com/peeramid-labs/contracts/commit/569fb0f7cc0cd7a99065fae3873296378b8ffd1a) Thanks [@peersky](https://github.com/peersky)! - corrected interface file names

- [#67](https://github.com/peeramid-labs/contracts/pull/67) [`da9978ee38b136e5e7cf8a1f68fcb101ede9eae2`](https://github.com/peeramid-labs/contracts/commit/da9978ee38b136e5e7cf8a1f68fcb101ede9eae2) Thanks [@peersky](https://github.com/peersky)! - improved documentation generation for mkdocs compatible markdown outputs

- [#49](https://github.com/peeramid-labs/contracts/pull/49) [`ae43df3f35fdcd49d33d76eaf9b452dbe453e202`](https://github.com/peeramid-labs/contracts/commit/ae43df3f35fdcd49d33d76eaf9b452dbe453e202) Thanks [@peersky](https://github.com/peersky)! - Fixed linter errors on docs templates directory

- [#85](https://github.com/peeramid-labs/contracts/pull/85) [`9246d9faac56d6897912934259212558ca0ad975`](https://github.com/peeramid-labs/contracts/commit/9246d9faac56d6897912934259212558ca0ad975) Thanks [@peersky](https://github.com/peersky)! - # Documentation updated

  - All source code signatures now are exported during release to docs/selectors.md
  - fixed typos
  - Removed obsolete documentation

- [`a719bf84721521f733227f703d4787ec779d74e7`](https://github.com/peeramid-labs/contracts/commit/a719bf84721521f733227f703d4787ec779d74e7) Thanks [@peersky](https://github.com/peersky)! - added deployment to anvil artifacts; ensured deploy scripts do not fail if deployment artifacts already registred on index

- [#93](https://github.com/peeramid-labs/contracts/pull/93) [`be671ff81117bcc3ccb6af3408c1198532c31317`](https://github.com/peeramid-labs/contracts/commit/be671ff81117bcc3ccb6af3408c1198532c31317) Thanks [@peersky](https://github.com/peersky)! - added viem compatible abi exports as typescript

- [#89](https://github.com/peeramid-labs/contracts/pull/89) [`f5aa8c956528ed1db83a1872ae5dfa8a29b4f3c6`](https://github.com/peeramid-labs/contracts/commit/f5aa8c956528ed1db83a1872ae5dfa8a29b4f3c6) Thanks [@peersky](https://github.com/peersky)! - ensured rank token gets env from setup results & minor improvements

- [`a719bf84721521f733227f703d4787ec779d74e7`](https://github.com/peeramid-labs/contracts/commit/a719bf84721521f733227f703d4787ec779d74e7) Thanks [@peersky](https://github.com/peersky)! - removed rankify instance from deployment artifacts in favor of MAODistribution

- [#69](https://github.com/peeramid-labs/contracts/pull/69) [`be9d58a44f4d8f97aeae83e904d2d72a485ae169`](https://github.com/peeramid-labs/contracts/commit/be9d58a44f4d8f97aeae83e904d2d72a485ae169) Thanks [@peersky](https://github.com/peersky)! - doc generation template improvements

- [#44](https://github.com/peeramid-labs/contracts/pull/44) [`55c3a8531a053905a94fc4626c0dd9c897ff46fe`](https://github.com/peeramid-labs/contracts/commit/55c3a8531a053905a94fc4626c0dd9c897ff46fe) Thanks [@peersky](https://github.com/peersky)! - moved to using newer pnpm version in ci and lockfile

## 0.9.4

### Patch Changes

- [`e79d0bf`](https://github.com/rankify-it/contracts/commit/e79d0bf398556e0fa0adf78063c46efa840c85d8) Thanks [@peersky](https://github.com/peersky)! - code cleanup, libquadratic improvements, bug fixes

## 0.9.3

### Patch Changes

- [`8e5af9b`](https://github.com/rankify-it/contracts/commit/8e5af9b8b2ccb3c21473b6b57b094d0824003628) Thanks [@peersky](https://github.com/peersky)! - bug fix preventing compilation

- [`7f18108`](https://github.com/rankify-it/contracts/commit/7f18108cf74f62053c7ef62722d53f55af5f81b3) Thanks [@peersky](https://github.com/peersky)! - add more test cases

- [`8e5af9b`](https://github.com/rankify-it/contracts/commit/8e5af9b8b2ccb3c21473b6b57b094d0824003628) Thanks [@peersky](https://github.com/peersky)! - update deployment artifacts

## 0.9.2

### Patch Changes

- [`4239be3`](https://github.com/rankify-it/contracts/commit/4239be32c8d8960b76bdae46ca3fd7f03533be39) Thanks [@peersky](https://github.com/peersky)! - added view method for player moves and player did voted

## 0.9.1

### Patch Changes

- [#38](https://github.com/rankify-it/contracts/pull/38) [`b634091`](https://github.com/rankify-it/contracts/commit/b634091eea5feaec4043234b891b4f8fd8374ed9) Thanks [@peersky](https://github.com/peersky)! - added multipass deployments

## 0.9.0

### Minor Changes

- [#36](https://github.com/rankify-it/contracts/pull/36) [`bd177c8`](https://github.com/rankify-it/contracts/commit/bd177c89edd630be5f6b1b8954ebfba65d36799a) Thanks [@peersky](https://github.com/peersky)! - beta network contracts deployment

## 0.8.0

### Minor Changes

- [`1011382`](https://github.com/rankify-it/contracts/commit/1011382c54a5530a6149d4f78102839edac5e2bd) Thanks [@peersky](https://github.com/peersky)! - Deployed multipass on anvil

## 0.7.2

### Patch Changes

- [`835c821`](https://github.com/rankify-it/contracts/commit/835c82142d441b8f66e788ed754a361878029cbe) Thanks [@peersky](https://github.com/peersky)! - Use local multipass library to avoid circular deps

## 0.7.1

### Patch Changes

- [`fbcf1ce`](https://github.com/rankify-it/contracts/commit/fbcf1ce9c517c2280bd1c398102c35d054334163) Thanks [@peersky](https://github.com/peersky)! - named import for multipass from sdk

## 0.7.0

### Minor Changes

- [#11](https://github.com/rankify-it/contracts/pull/11) [`c9eb6b5`](https://github.com/rankify-it/contracts/commit/c9eb6b540a6f2fe780984eb4e979753f56a6bf88) Thanks [@peersky](https://github.com/peersky)! - Adding multipass contracts

## 0.6.0

### Minor Changes

- [`230b856`](https://github.com/rankify-it/contracts/commit/230b856f9b5246a73daad34c3c1eff4bdd8dd3e3) Thanks [@peersky](https://github.com/peersky)! - Minor contracts upgrade

## 0.5.0

### Minor Changes

- [`5d85c92`](https://github.com/rankify-it/contracts/commit/5d85c92b647c2fbcb2c2ce9fa3fb5b853329f1c3) Thanks [@peersky](https://github.com/peersky)! - Re-deploy contracts and update token metadata to correspond to music challenge of first game

## 0.4.1

### Patch Changes

- [`44d9e77`](https://github.com/rankify-it/contracts/commit/44d9e77826fa29c0671bca4fd98afa79c611df13) Thanks [@peersky](https://github.com/peersky)! - use md files

## 0.4.0

### Minor Changes

- [`fe91476`](https://github.com/rankify-it/contracts/commit/fe91476f6e4f6b39819422d23085a0b823e53728) Thanks [@peersky](https://github.com/peersky)! - docs only as single file

## 0.3.2

### Patch Changes

- [`9f35eac`](https://github.com/rankify-it/contracts/commit/9f35eac5160332855dd87d9134c5ff6998326a7d) Thanks [@peersky](https://github.com/peersky)! - use absolute readme links

## 0.3.1

### Patch Changes

- [`5113431`](https://github.com/rankify-it/contracts/commit/51134318d9b91bb73e33e3465d93807a886f2542) Thanks [@peersky](https://github.com/peersky)! - changed docgen format

## 0.3.0

### Minor Changes

- [`f291dad`](https://github.com/rankify-it/contracts/commit/f291dad6117880789b45c972e82bb12fb7942868) Thanks [@peersky](https://github.com/peersky)! - Deployed latest changes to testnet

## 0.2.3

### Patch Changes

- [`d88f83a`](https://github.com/rankify-it/contracts/commit/d88f83a65e15254bbf5ed750c645cfbe00d601ca) Thanks [@peersky](https://github.com/peersky)! - adding typing files
