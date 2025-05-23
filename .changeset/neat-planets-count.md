---
'rankify-contracts': patch
---

- Changed LibRankify functions from `internal` to `public` to counter contract size limit
- Modified player game tracking to support multiple games:
  - Changed `playerInGame` from mapping to single uint256 to EnumerableSet.UintSet
  - Renamed `getPlayersGame` to `getPlayersGames` returning array of game IDs
  - Added `isPlayerInGame` function to check if player is in specific game
- Updated deployment script to deploy LibRankify separately and link to facets
- Fixed tests to reflect new multi-game capability
