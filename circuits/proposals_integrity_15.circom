pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/gates.circom";

/**
 * @title ProposalIntegrity
 * @dev This circuit verifies the integrity of a single proposal by checking the commitment hash
 */
template ProposalIntegrity() {
    // Public inputs
    signal input commitment;

    // Private inputs
    signal input proposal;
    signal input randomness;

    // Generate commitment and verify
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== proposal;
    commitmentHasher.inputs[1] <== randomness;
    commitment === commitmentHasher.out;
}

/**
 * @title ProposalsIntegrity15
 * @dev This circuit verifies the integrity of 15 proposals in a single proof.
 * @param commitments Ongoing turn commitments Poseidon(proposal, randomness)
 * @param permutedProposals proposals that are revealed in the current turn.
 * @param permutationCommitment Commitment to the shuffling order hash(sponge(permutation[0...14]), permutationRandomness)
 * @param numActive Number of active players (0...14)
 * @param permutation (_private_) Random permutation of the proposals that are revealed in the current turn
 * @param randomnesses (_private_) Randomness for the proposals, known only to player and GM
 * @param permutationRandomness (_private_) Randomness for the permutation, known only to GM
 * @notice sponge is calculating intermediate poseidon values as solidity limit is 6 inputs for Poseidon implementation of circomlib
 */
template ProposalsIntegrity15() {
    // Public inputs
    signal input commitments[15];        // Ongoing turn commitments Poseidon(proposal, randomness)
    signal input permutedProposals[15];  // proposals that are revealed in the current turn.
    signal input permutationCommitment;  // Commitment to the shuffling order hash(permutation[], permutationRandomness)
    signal input numActive;              // Number of active players

    // Private inputs for each proposal (arrays of size 15)
    signal input permutation[15];       // Permutation of the proposals that are revealed in the current turn
    signal input randomnesses[15];      // randomnesses
    signal input permutationRandomness; // Randomness for the permutation

    // Verify numActive is in valid range
    component numActiveRange = LessThan(8);
    numActiveRange.in[0] <== numActive;
    numActiveRange.in[1] <== 16;  // Must be strictly less than 16 (0...15)
    numActiveRange.out === 1;

    // Also ensure numActive is non-negative
    component numActiveNonNeg = GreaterEqThan(32);
    numActiveNonNeg.in[0] <== numActive;
    numActiveNonNeg.in[1] <== 0;
    numActiveNonNeg.out === 1;

    // Declare components outside the loop
    component verifiers[15];
    signal partialSums[15][16];  // One more column for final sum
    // Create and verify proposals and randomnesses, removing the permutations
    signal proposals[15];
    signal tempProposals[15][16];
    component isEqualPermutation[15][15];
    component rangeChecks[15];
    component isActiveSlot[15];

    // Initialize components
    for (var i = 0; i < 15; i++) {
        verifiers[i] = ProposalIntegrity();
        isActiveSlot[i] = LessThan(8);
        isActiveSlot[i].in[0] <== i;
        isActiveSlot[i].in[1] <== numActive;
    }


    for (var i = 0; i < 15; i++) {
        partialSums[i][0] <== 0;
        tempProposals[i][0] <== 0;
        rangeChecks[i] = LessThan(8);
        rangeChecks[i].in[0] <== permutation[i];
        rangeChecks[i].in[1] <== 15;
        rangeChecks[i].out === 1;

        for (var j = 0; j < 15; j++) {
            isEqualPermutation[i][j] = IsEqual();
            isEqualPermutation[i][j].in[0] <== permutation[i];
            isEqualPermutation[i][j].in[1] <== j;

            tempProposals[i][j + 1] <== tempProposals[i][j] + isEqualPermutation[i][j].out * permutedProposals[j];
            partialSums[i][j + 1] <== partialSums[i][j] + isEqualPermutation[i][j].out;
        }

        // For active slots (i < numActive), each value must be used exactly once
        // For inactive slots (i >= numActive), permutation must map to itself
        isActiveSlot[i].out * (partialSums[i][15] - 1) === 0;
        (1 - isActiveSlot[i].out) * (permutation[i] - i) === 0;

        // Create and verify proposals and randomnesses
        proposals[i] <== tempProposals[i][15];
    }

    // Create and verify permutation commitment
    /**
     * @notice sponge is calculating intermediate poseidon values as solidity limit is 6 inputs for Poseidon implementation of circomlib
     */
    component permutationHasher1 = Poseidon(5);
    component permutationHasher2 = Poseidon(6);
    component permutationHasher3 = Poseidon(6);
    component permutationHasher4 = Poseidon(2);

    permutationHasher1.inputs[0] <== permutation[0];
    permutationHasher1.inputs[1] <== permutation[1];
    permutationHasher1.inputs[2] <== permutation[2];
    permutationHasher1.inputs[3] <== permutation[3];
    permutationHasher1.inputs[4] <== permutation[4];

    permutationHasher2.inputs[0] <== permutationHasher1.out;
    permutationHasher2.inputs[1] <== permutation[5];
    permutationHasher2.inputs[2] <== permutation[6];
    permutationHasher2.inputs[3] <== permutation[7];
    permutationHasher2.inputs[4] <== permutation[8];
    permutationHasher2.inputs[5] <== permutation[9];

    permutationHasher3.inputs[0] <== permutationHasher2.out;
    permutationHasher3.inputs[1] <== permutation[10];
    permutationHasher3.inputs[2] <== permutation[11];
    permutationHasher3.inputs[3] <== permutation[12];
    permutationHasher3.inputs[4] <== permutation[13];
    permutationHasher3.inputs[5] <== permutation[14];

    permutationHasher4.inputs[0] <== permutationHasher3.out;
    permutationHasher4.inputs[1] <== permutationRandomness;

    permutationCommitment === permutationHasher4.out;

     // Verify each proposal
    for (var i = 0; i < 15; i++) {
        // Connect signals directly
        verifiers[i].proposal <== proposals[i];
        verifiers[i].randomness <== randomnesses[i];
        verifiers[i].commitment <== commitments[i];
    }


}

component main { public [ commitments, permutedProposals, permutationCommitment, numActive ] } = ProposalsIntegrity15();
