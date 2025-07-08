# Peeramid Protocol: Security Considerations & Architectural Overview

This document provides a security-focused overview of the Peeramid protocol. It is intended to serve as an onboarding guide for security auditors, highlighting the system's architecture, key components, and areas that warrant particular attention.

## 1. Architecture and Design

The Peeramid protocol is a decentralized application built on the **Ethereum Distribution System (EDS)**. It enables users to create and participate in competitive token issuance systems, called "Rankify" instances.

### 1.1. Core EDS Concepts

The architecture relies on several key EDS concepts:

- **ERC7744 Indexer**: At the base of the dependency chain is the ERC7744-compliant codehash registry. This provides a permissionless and immutable way to reference contract bytecode, forming a trust anchor for the entire system.
- **Distributions**: These are stateless smart contracts that act as factories for deploying instances of specific contract logic. By design, they do not hold state themselves, which minimizes their attack surface and simplifies upgrades. Their primary role is to encapsulate source code (or a reference to it via a codehash) and provide a method to instantiate it. `ArguableVotingTournament.sol` is an example of a Distribution.
- **Distributors**: These are stateful contracts that manage the lifecycle, versioning, and access control for Distributions. The `DAODistributor.sol` contract is the central Distributor in this protocol. It serves as a trusted intermediary, maintaining a registry of available distributions, handling instantiation requests (potentially with a payment model, as seen in `TokenizedDistributor`), and managing the state of deployed application instances.
- **ERC7746 Middleware**: The system uses ERC7746 hooks for managing upgrades of diamond proxy instances. This creates a multi-party trust process where upgrades require consent from both the Distributor (acting as the proxy admin) and the instance owner/installer.

### 1.2. Protocol-Specific Architecture

- **`DAODistributor.sol`**: This is the protocol's central, ownable Distributor. It is the source of truth for which application logic (Distributions) can be deployed. It is controlled by a single administrative key with a time delay for sensitive actions.
- **`ArguableVotingTournament.sol`**: This is a stateless Distribution that deploys the main Rankify application instance. The instance is a **diamond proxy** composed of several facets:
  - **`RankifyInstanceMainFacet`**: Handles game creation, player management, and token receiver hooks.
  - **`RankifyInstanceRequirementsFacet`**: Manages game joining requirements using `LibCoinVending`.
  - **`RankifyInstanceGameMastersFacet`**: Implements game master functionality, such as submitting votes and proposals.
  - **`DiamondLoupeFacet`**, **`EIP712InspectorFacet`**, **`OwnershipFacet`**: Provide standard diamond, EIP-712, and ownership functionalities.
- **`MAODistribution.sol`**: This is a higher-level, stateless Distribution that composes a Rankify instance with a set of decentralized governance contracts (`Governor`, `DistributableGovernanceERC20`). It demonstrates how complex, multi-contract applications can be bundled and deployed through the EDS.
- **`LibCoinVending.sol`**: A utility library used to manage the "join requirements" for games. Players can be required to have, lock, pay, bet, or burn various assets (ETH, ERC20, ERC1155, ERC721) to participate.

## 2. Security Considerations

The following sections highlight specific areas and known risks that auditors should pay close attention to.

### 2.1. Re-entrancy Vulnerabilities

**Context:** The `LibCoinVending.sol` library, which handles complex asset transfers for game requirements, explicitly delegates re-entrancy protection to the calling contract. This is a critical design choice to maintain the library's generality.

**Points of Interest:**

- **Guarded vs. Unguarded Functions:** The following table provides a summary of the functions in the `RankifyInstanceMainFacet` and `RankifyInstanceGameMastersFacet` that are guarded and unguarded by the `nonReentrant` modifier. The team has applied guards to most functions involving external calls or state changes that could be sensitive to re-entrancy.

| Facet                             | Function               | `nonReentrant` | Notes                                                                                                                                                 |
| --------------------------------- | ---------------------- | :------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RankifyInstanceMainFacet`        | `createGame` (private) |      Yes       | This is the internal function that creates a new game. It is correctly guarded.                                                                       |
| `RankifyInstanceMainFacet`        | `createGame` (public)  |      Yes       | This is the public-facing function that creates a new game. It is also correctly guarded.                                                             |
| `RankifyInstanceMainFacet`        | `createAndOpenGame`    |      Yes       | This function creates a new game and opens registration. It is now correctly guarded by inheriting the lock from its internal `createGame` call.                                                                 |
| `RankifyInstanceMainFacet`        | `setJoinRequirements`  |      Yes       | This function sets the join requirements for a game. It is now correctly guarded.                                                                     |
| `RankifyInstanceMainFacet`        | `cancelGame`           |      Yes       | This function cancels a game and refunds the players. It is correctly guarded.                                                                        |
| `RankifyInstanceMainFacet`        | `leaveGame`            |      Yes       | This function allows a player to leave a game and get a refund. It is correctly guarded.                                                              |
| `RankifyInstanceMainFacet`        | `openRegistration`     |       No       | This function opens registration for a game. It does not make any external calls and is therefore not vulnerable to re-entrancy.                      |
| `RankifyInstanceMainFacet`        | `joinGame`             |      Yes       | This function allows a player to join a game and fund the position. It is correctly guarded.                                                          |
| `RankifyInstanceMainFacet`        | `startGame`            |      Yes       | This function starts a game. It does not make any external calls but is guarded as a preventative measure.                                      |
| `RankifyInstanceGameMastersFacet` | `submitVote`           |       No       | This function does not have a re-entrancy guard. While it doesn't directly make external calls, it does modify state.                                 |
| `RankifyInstanceGameMastersFacet` | `submitProposal`       |       No       | This function does not have a re-entrancy guard. It also modifies state.                                                                              |
| `RankifyInstanceGameMastersFacet` | `endVoting`            |      Yes       | This function is correctly guarded. It makes an external call to `onPlayersGameEnd`, which calls `LibCoinVending.release`, so the guard is necessary. |
| `RankifyInstanceGameMastersFacet` | `endProposing`         |      Yes       | This function is correctly guarded.                                                                                                                   |
| `RankifyInstanceGameMastersFacet` | `forceEndStaleGame`    |      Yes       | This function is correctly guarded. It makes an external call to `onPlayersGameEnd`, which calls `LibCoinVending.release`, so the guard is necessary. |

### 2.2. Access Control & Trust Assumptions

**Context:** The system's security model is centered on the `DAODistributor` as a trusted, centrally-controlled entity. The access control for the Rankify instance is two-layered: the Diamond Proxy defines which functions are exposed, and the individual facets implement the specific access control logic for those functions.

**Points of Interest:**

- **Distributor Ownership & Whitelisting**: `DAODistributor` uses `onlyRole(DEFAULT_ADMIN_ROLE)` with a time delay, which is a robust pattern for protecting administrative functions. Crucially, the distributor owner is responsible for whitelisting which Distributions can be instantiated. Because these Distributions are immutable and trusted by the owner at the time of whitelisting, the risk of a malicious Distribution being added to the system is mitigated.
- **`MAODistribution` Trust**: The `MAODistribution.instantiate` function and its internal helpers (`createOrg`, `createRankify`) assume they are being called by a trusted `IDistributor` (`msg.sender`). This is because the Distributor is responsible for setting up the access managers for the newly created tokens and passing itself as the trusted middleware. If this contract cou ald be called directly by an untrusted party, they could potentially configure the access managers incorrectly.
- **`exitRankToken` Function**: This function is intended to be the primary mechanism for players to convert their winnings (Rank Tokens) into governance power in the associated DAO. The function is `external` and is expected to be called by players who wish to burn their rank token in exchange for governance tokens.

### 2.3. Voting & Game Logic Integrity

**Context:** The protocol's core value proposition relies on the integrity of the competitive tournament and its voting process.

**Points of Interest:**

- **ZK Proofs**: The use of a Groth16 ZK-SNARK in `endProposing` to verify the integrity of all submitted proposals simultaneously is a strong security measure against tampering. The circuit, `proposals_integrity_15.circom`, ensures that the revealed proposals match the committed hashes and that the permutation is valid.
- **Signature Verification**: The use of `SignatureChecker.isValidSignatureNow` for off-chain message signing by Game Masters and players is a standard and effective pattern.
- **Forced Game End**: The `forceEndStaleGame` function allows a GM to end a game that is stuck. The conditions for this are based on time and game state, but this logic should be heavily scrutinized to ensure it cannot be abused to unfairly terminate a game.

### 2.4. Initializer Patterns & Frontrunning

**Context:** The `MAODistribution` contract clones and initializes multiple contracts in a single transaction.

**Points of Interest:**

- **Atomicity**: The system is designed to prevent frontrunning during the initialization of new MAOs. The `MAODistribution.instantiate` function is called by the trusted `DAODistributor`, which occurs atomically in a single transaction. Since there are no calls to untrusted external contracts during this process, there is no opportunity for a malicious actor to intercept or manipulate the initialization.
- **Lack of Re-entrancy Guard**: The top-level `instantiate` function in `MAODistribution.sol` is not marked as `nonReentrant`.

### 2.5. Known Architectural Risks & Mitigations

**Context:** We have acknowledged certain design trade-offs and have planned future improvements.

**Points of Interest:**

- **Memory Growth**: As we've noted, storing all game data in the primary `RankifyInstance` contract could lead to unbounded memory growth, which is a potential DoS vector. The suggested architectural refactor to split game-specific state into separate contracts is the correct long-term solution.
- **Stack Depth**: The risk of "stack too deep" errors from recursive functions like `quickSort` is significantly mitigated by a hard cap of **15 players** per game. This limit is primarily driven by the constraints of the `proposals_integrity_15.circom` ZK circuit.
- **Diamond Proxy Removal**: We plan to remove the Diamond Proxy in future patches to increase readability.
- **Unused Parameter**: In `ArguableVotingTournament.sol`, the `initializerSelector` constructor parameter is passed to the parent `InitializedDiamondDistribution` but appears unused, as the initializer logic is handled differently via diamond cuts. This is a minor code quality issue.
- **Unified Custom Errors**: We acknowledge the need to unify the custom error types used throughout the codebase.

### 2.6. Economic Security & Sybil Resistance

**Context:** The protocol must be resistant to Sybil attacks where an attacker creates many identities to gain disproportionate influence in the governance system.

**Points of Interest:**

- The primary defense against Sybil attacks is economic. To acquire the governance tokens necessary for a quorum attack, an attacker must first win them by playing and winning Rankify games.
- Each game has an associated cost, determined by the `principalCost` and `principalTimeConstant` parameters set at the Distribution level. These parameters cannot be changed after deployment.
- This model ensures that fast, cheap games are not possible. An attacker wishing to accumulate a large number of governance tokens quickly would have to pay a proportionally high cost, making such an attack economically infeasible under normal conditions.
- It is important to note that, by design, there are no other explicit mechanisms limiting the ability to mint the derived governance token, as the input `RankifyToken` is intended to be widely accessible. The security relies on the cost-to-acquire mechanism.
- **Integer Overflow:** The `accumulator`, `scores`, and `creditsUsed` variables could potentially overflow if the number of players and votes is very large.
- **`LibCoinVending.sol`:**
  - **Re-entrancy:** This library does not include re-entrancy guards. The responsibility for preventing re-entrancy attacks is delegated to the calling contracts.
  - **External Calls:** The `fulfillERC20`, `fulfillERC1155`, and `fulfill` functions make external calls that could be a re-entrancy vector if the receiving contracts are malicious.
  - **Bank Logic**: The library includes a "bank" feature to handle failed ETH transfers. When a `send` or `transfer` fails, the ETH is stored in a mapping (`bankPosition`) associated with the intended recipient's address. The `pullEth` function in `RankifyInstanceRequirementsFacet` allows anyone to trigger a withdrawal for a given address. While this prevents funds from being permanently stuck, it introduces a new state to manage and new functions to secure. The `pullEth` function is guarded by `nonReentrant`.

### 2.7. Library-Specific Concerns

- **`LibArray.sol` & `LibTurnBasedGame.sol`:**
  - **Stack Too Deep:** The `quickSort` function is recursive. While this can be a risk, it is heavily mitigated by the **15-player cap**, which keeps the recursion depth well within the EVM's limits.
- **`LibQuadraticVoting.sol`:**
  - **Integer Overflow:** The `accumulator`, `scores`, and `creditsUsed` variables could potentially overflow if the number of players and votes is very large.
- **`LibCoinVending.sol`:**
  - **Re-entrancy:** This library does not include re-entrancy guards. The responsibility for preventing re-entrancy attacks is delegated to the calling contracts.
  - **External Calls:** The `fulfillERC20`, `fulfillERC1155`, and `fulfill` functions make external calls that could be a re-entrancy vector if the receiving contracts are malicious.
  - **Bank Logic**: The library includes a "bank" feature to handle failed ETH transfers. When a `send` or `transfer` fails, the ETH is stored in a mapping (`bankPosition`) associated with the intended recipient's address. The `pullEth` function in `RankifyInstanceRequirementsFacet` allows anyone to trigger a withdrawal for a given address. While this prevents funds from being permanently stuck, it introduces a new state to manage and new functions to secure. The `pullEth` function is guarded by `nonReentrant`.

## 3. Areas for Auditor Scrutiny

This section details specific points of interest that we believe warrant close examination during the audit. It includes potential vulnerabilities identified during internal review and areas where we would like an expert opinion.

-   **Systemic Access Control**: The protocol employs a two-layer access control model: the Diamond Proxy's `diamondCut` determines which functions are publicly accessible, and the individual facets then implement function-specific permissions (e.g., `enforceIsGameCreator`). Auditors are requested to verify that this two-layer system is correctly implemented across all facets and that there are no gaps that would allow unauthorized access to sensitive functions.

-   **Integrity of the `MAODistribution` Instantiation Flow**:
    -   The `MAODistribution.instantiate` function is the entry point for creating a full DAO and Rankify instance. It orchestrates the cloning and initialization of multiple contracts. This is a highly complex and sensitive process.
    -   Auditors should scrutinize this flow for any potential manipulation vectors, such as re-entrancy or transaction-ordering attacks, that could lead to a partially configured or insecure MAO instance. While designed to be atomic, we welcome a thorough review of this critical function.

-   **`exitRankToken` Economic and Access Control Model**:
    -   The `exitRankToken` function is the gateway for converting game winnings into governance power. The primary security assumption is economic: the cost and time required to win Rank Tokens should make a Sybil attack on the resulting DAO prohibitively expensive.
    -   However, the function's implementation lacks explicit checks to ensure `msg.sender` is the actual owner of the tokens being burned. While the underlying ERC1155 `burn` function requires the caller to have a sufficient balance, auditors should confirm that there are no scenarios where a user could cause another user's tokens to be burned or where the token exchange logic could be manipulated. Verifying that this function is robust is a high priority.

-   **`LibQuadraticVoting` Vulnerabilities**:
    -   A `require` statement in the `precomputeValues` function, intended to prevent a potential denial-of-service via an infinite loop, is currently commented out. We request that auditors validate the necessity of this check and confirm its correctness before it is re-enabled.
    -   Auditors should also check the `tallyVotes` function for potential integer overflows and recommend explicit checks if a plausible risk exists given the system's constraints.

-   **`LibCoinVending` Hardening**:
    -   The library uses `.send()` for sending Ether within its `fulfill` function. We are aware of the potential for this to fail if a recipient's fallback function uses more than the 2300 gas stipend, and would like the auditors' recommendation on whether to migrate to the `call({value: ...})("")` pattern for consistency with `withdrawFromBank`, which uses `sendValue`.
    -   Auditors should review the "bank" logic for potential edge cases or manipulation vectors. The `pullEth` function in `RankifyInstanceRequirementsFacet` is permissionless (callable by anyone for any address with a balance). While this is intended to allow for gas-sponsoring withdrawals, it's a pattern that warrants scrutiny.

-   **Sorting Algorithm Gas Usage**: `LibTurnBasedGame` uses a recursive `quickSort` algorithm. While the 15-player limit mitigates the "stack too deep" risk, auditors are asked to confirm that the worst-case gas consumption (O(n^2)) for this function with 15 players is acceptable and does not pose a risk of exceeding the block gas limit on target networks.

## 4. Summary for Auditors

The Peeramid protocol is a sophisticated system that leverages advanced patterns like Diamond Proxies, ZK-SNARKs, and a structured distribution model via EDS. The security posture shows a clear intent to protect critical components through access control and cryptographic verification.

Key areas for deep-dive analysis should include:
1.  **`exitRankToken` Access Control**: This is the most critical and seemingly exploitable issue found during this review.
2.  **`LibCoinVending` Integration**: Verify that all state-changing interactions with this library within the facets are protected against re-entrancy.
3.  **`MAODistribution` `instantiate` Flow**: Analyze the complex instantiation logic for potential re-entrancy or other transaction-ordering vulnerabilities.
4.  **Game State Machine Logic**: Scrutinize the game logic within `LibRankify` and the facets, particularly edge cases related to player actions, timeouts (`forceEndStaleGame`), and scoring.
5.  **Trust Assumptions**: Confirm that all assumptions about trusted callers (e.g., `msg.sender` being the `IDistributor`) hold true under all possible execution paths.
6.  **Library Vulnerabilities**: Pay close attention to the potential vulnerabilities identified in the libraries, especially the infinite loop in `LibQuadraticVoting.sol` and the lack of access control on the `deleteGame` function in `LibTurnBasedGame.sol`.


# Code in the scope

Everything in src/ and /circuits except for /src/vendor and /src/fixtures

# Disclosure channel

Every validated finding that is disclosed responsibly to `sirt@peeramid.xyz` is eligible for future community reward program;