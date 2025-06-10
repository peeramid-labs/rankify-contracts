---
'rankify-contracts': minor
---

Added Governor contract for derived organizations with the following interface changes:

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
