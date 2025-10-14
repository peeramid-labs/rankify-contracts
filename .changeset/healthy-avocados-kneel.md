---
'rankify-contracts': minor
---

## Implement whitelisted GM player joining

Introduce `RankifyOwnersFacet` to allow the contract owner to whitelist
game masters. Whitelisted GMs can now use `joinGameByMaster` to onboard
players into games, abstracting the `msg.sender` for funding. This
refactors the existing `joinGame` into a shared `_join` helper.

Also reduce Solidity optimizer runs from 2000 to 200.
