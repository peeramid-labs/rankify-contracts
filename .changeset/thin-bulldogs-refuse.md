---
'rankify-contracts': patch
---

# Delegation system support 
When a voter calls `submitVote` directly, their transaction signature
implicitly authorizes the submission, making an additional EIP-712
signature redundant.

We removed this check. 

This marks the full reliance on `msg.sender` as authority to act on players behalf, WITHOUT need to explcitly sign the transactions by EOA. 
It is expected that delegation to authorize player actions is built upon by a smart-wallet that IS `msg.sender` "wrapper". 
