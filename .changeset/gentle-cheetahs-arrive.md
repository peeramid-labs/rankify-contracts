---
'rankify-contracts': patch
---

This update introduces several major features, architectural improvements, and bug fixes to the Rankify protocol.

### ✨ Bug Fixes & improvements

- **Diamond Upgradability**: Diamond instances are now upgradeable. A new deployment script (`deploy/upgradeInstance.ts`) facilitates the upgrade process for existing instances.
- **CanEnd Turn bug fix**: Previously can end turn would not correctly return the stale game end ability, new fix correctly handles this both in view method and in ending voting phase execution 



