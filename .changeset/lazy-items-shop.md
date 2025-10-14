---
'rankify-contracts': patch
---

Emit RankifyInstanceInitialized event

The `RankifyInstanceInitialized` event is emitted upon successful initialization of
a Rankify instance. This provides on-chain visibility and facilitates external
monitoring and integration. It includes the address of the initialized instance
and its initialization parameters.

```
event RankifyInstanceInitialized(address indexed rankifyInstance, contractInitializer parameters);
```
