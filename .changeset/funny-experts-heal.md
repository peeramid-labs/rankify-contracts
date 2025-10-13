---
'rankify-contracts': minor
---

## Introduced UBI based fellowships

- New contract introduced: [UBI.sol](./src/UBI.sol): It may be used as either facet or standalone.
- This UBI contract uses [Multipass](https://github.com/peeramid-labs/multipass/) as dependency - any registered user on domain is qualified for daily credits.
- Deployment scripts were added that install UBI as facet on every new fellowship.
- Now it is possible to instantiate MAO without specifying paymentToken. In such a case, a new token will be deployed named as `<Derived Token Name> ACID` (Autonomous competence Identification).
