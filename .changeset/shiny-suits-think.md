---
'rankify-contracts': patch
---

Removed specific time-related divisibility checks from `LibRankify.newGame` function:

- Removed `require(commonParams.principalTimeConstant % params.nTurns == 0)`
- Removed `require(params.minGameTime % params.nTurns == 0)`

These checks were likely removed to optimize gas or simplify game creation logic by no longer strictly enforcing that `principalTimeConstant` and `minGameTime` are exact multiples of `nTurns`.
