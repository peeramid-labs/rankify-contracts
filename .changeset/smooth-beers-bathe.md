---
'rankify-contracts': patch
---

setURI and setContractURI on rankToken now emits events:

```solidity
    event URIUpdated(string newURI, string indexed hash);
    event ContractURIUpdated(string newURI, string indexed hash);
```
