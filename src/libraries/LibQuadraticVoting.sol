// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
error quadraticVotingError(string parameter, uint256 arg, uint256 arg2);

/**
 * @title LibQuadraticVoting
 * @dev A library for quadratic voting calculations.
 */
library LibQuadraticVoting {
    struct qVotingStruct {
        uint256 voteCredits;
        uint256 maxQuadraticPoints;
        uint256 minQuadraticPositions;
    }

    /**
     * @dev Pre-computes the values for quadratic voting. `voteCredits` is the total number of vote credits. `minExpectedVoteItems` is the minimum expected number of vote items.
     *
     * Returns:
     *
     * - A `qVotingStruct` containing the precomputed values.
     */
    function precomputeValues(
        uint256 voteCredits,
        uint256 minExpectedVoteItems
    ) internal pure returns (qVotingStruct memory) {
        qVotingStruct memory q;

        q.maxQuadraticPoints = Math.sqrt(voteCredits);

        // This block finds how many vote positions are needed to distribute all quadratic vote points.
        uint256 iterator = 0;
        uint256 accumulator = 0;
        do {
            accumulator += (q.maxQuadraticPoints - iterator) ** 2;
            iterator++;
        } while (accumulator < voteCredits);
        // This enforces requirement that all vote credits can indeed be spent (no leftovers)
        if (accumulator != voteCredits) require(false, "quadraticVotingError: voteCredits must be i^2 series"); //revert quadraticVotingError("voteCredits must be i^2 series", accumulator, voteCredits);
        q.minQuadraticPositions = iterator;
        // In order to spend all vote credits there must be at least minQuadraticPositions+1 (because proposer is also a player and cannot vote for himself)
        if (minExpectedVoteItems <= q.minQuadraticPositions)
            require(false, "quadraticVotingError: Minimum Voting positions above min players");
        // revert quadraticVotingError(
        //     "Minimum Voting positions above min players",
        //     q.minQuadraticPositions,
        //     minExpectedVoteItems
        // );
        q.voteCredits = voteCredits;
        return q;
    }

    /**
     * @dev Computes the scores for each proposal by voter preference index. `q` is the precomputed quadratic voting values. `VotersVotes` is a 2D array of votes, where each row corresponds to a voter and each column corresponds to a proposal. `isActive` is an array indicating whether each voter has voted.
     *
     * Returns:
     *
     * - An array of scores for each proposal.
     */
    function tallyVotes(
        qVotingStruct memory q,
        uint256[][] memory tally, // [participant][votedFor]
        bool[] memory hasVoted,
        bool[] memory hasProposed
    ) internal pure returns (uint256[] memory) {
        uint256 notVotedGivesEveryone = q.maxQuadraticPoints;
        uint256[] memory scores = new uint256[](tally.length);
        uint256[] memory creditsUsed = new uint256[](tally.length);

        for (uint256 participant = 0; participant < tally.length; participant++) {
            //For each proposal
            // console.log("New tally iter");
            uint256[] memory votedFor = tally[participant];
            for (uint256 candidate = 0; candidate < tally.length; candidate++) {
                // For each potential voter
                if (!hasVoted[participant] && hasProposed[candidate] && candidate != participant) {
                    // Check if participant wasn't voting
                    scores[candidate] += notVotedGivesEveryone; // Gives benefits to everyone but himself
                    creditsUsed[participant] = q.voteCredits;
                } else {
                    //If participant voted
                    scores[candidate] += votedFor[candidate];
                    creditsUsed[participant] += votedFor[candidate] ** 2;
                }
            }
            require(
                creditsUsed[participant] <= q.voteCredits,
                quadraticVotingError("Quadratic: vote credits overrun", q.voteCredits, creditsUsed[participant])
            );
        }
        return scores;
    }
}
