---
'rankify-contracts': minor
---

Implemented architectural changes to make each game of Rankify a separate contract instance:

- Added new Fellowship contract that implements IFellowship interface
- Created MockDistributor implementation for testing purposes that extends OwnableDistributor
- Added LibACID library for handling asynchronous contract deployment
- Created IFellowship interface defining the contract state and operations
- Added RankToken implementation for token management
- Implemented ERC7572 abstract contract
- Removed Diamond pattern in favor of a more modular approach
- Updated ThreadDistribution and deployment scripts
- Enhanced testing infrastructure with new simulator and agent components
