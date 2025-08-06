---
'rankify-contracts': minor
---

Added comprehensive proposal score tracking and getter functionality:

##  **BREAKING CHANGES**

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
