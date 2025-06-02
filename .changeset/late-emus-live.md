---
'rankify-contracts': minor
---

Enhanced RankifyInstanceGameMastersFacet and LibQuadraticVoting to include additional voting data

- Updated `RankifyInstanceGameMastersFacet` to emit new parameters `isActive` and `finalizedVotingMatrix` in the `VotingStageResults` event.
- Modified `LibQuadraticVoting` to return the `finalizedVotingMatrix` alongside scores, improving the tracking of voting outcomes.
- Adjusted `LibRankify` to initialize the `isActive` array for players, ensuring accurate game state representation.
- Updated tests to accommodate the new parameters in voting functions.
- `LibQuadraticVoting.precomputeValues` in `createGame` now takes correctly `params.minPlayerCnt` as argument to minimum expected vote items;
- Minimal required number of turns is now `>0` instead of `>1` to properly reflect new phase-awareness of the game;