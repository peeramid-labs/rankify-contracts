// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@peeramid-labs/eds/src/repositories/OwnableRepository.sol";

contract Repo is OwnableRepository {
    constructor(address owner, bytes32 name, string memory contractURI) OwnableRepository(owner, name, contractURI) {}
}
