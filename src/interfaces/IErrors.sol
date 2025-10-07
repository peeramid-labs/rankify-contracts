// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IErrors {
    error invalidConfiguration(string message);
    error zeroValue();
    error invalidECDSARecoverSigner(bytes32 digest, string message);
}
