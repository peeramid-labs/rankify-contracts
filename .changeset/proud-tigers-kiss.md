---
'rankify-contracts': patch
---

allow updating game medatata with (add owner to metadata URIs)


## Breaking change

- `MAODistribution` now requires an `owner` parameter in the `rankifySettings` struct. This is used to set the owner of the rank token.