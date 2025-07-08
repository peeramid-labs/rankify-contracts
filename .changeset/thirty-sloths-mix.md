---
'rankify-contracts': minor
---

Enhance RankifyInstance facets with reentrancy guards and new math utilities.

Added `nonReentrant` modifier to `exitRankToken` function and implemented bank balance management in `LibCoinVending`.

Updated `RankifyInstanceRequirementsFacet` to include new withdrawal functions and improved error handling in token transfers.

Refactored `RankToken` storage position.
