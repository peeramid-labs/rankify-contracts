---
'rankify-contracts': patch
---

added permutation info to voting stage results event:

VotingStageResults signature now is:

    event VotingStageResults(
        uint256 indexed gameId,
        uint256 indexed roundNumber,
        address indexed winner,
        address[] players,
        uint256[] scores,
        uint256[][] votesSorted,
        bool[] isActive,
        uint256[][] finalizedVotingMatrix,
        uint256[] permutation
    );
