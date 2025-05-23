---
'rankify-contracts': minor
---

Significant contract architecture changes:

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
