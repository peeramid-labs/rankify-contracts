// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {LibQuadraticVoting} from "../libraries/LibQuadraticVoting.sol";
import {LibCVPP} from "../libraries/LibCVPP.sol";
import {LibCoinVending} from "../libraries/LibCoinVending.sol";
interface IThread {
    error NoDivisionReminderAllowed(uint256 a, uint256 b);
    error invalidTurnCount(uint256 nTurns);
    error RankNotSpecified();

    event RegistrationOpen();
    event Joined(address indexed participant, bytes32 gmCommitment, string voterPubKey);
    event ThreadStarted();
    event ThreadClosed();
    event ParticipantLeft(address indexed participant);
    event VoteSubmitted(
        uint256 indexed turn,
        address indexed participant,
        string sealedBallotId,
        bytes gmSignature,
        bytes voterSignature,
        bytes32 ballotHash
    );
    event OverTime();
    event ProposalScore(uint256 indexed turn, string indexed proposalHash, uint256 indexed score, string proposal);
    event TurnEnded(
        uint256 indexed turn,
        address[] participants,
        uint256[] scores,
        string[] newProposals,
        uint256[] proposerIndices,
        uint256[][] votes
    );
    event LastTurn();
    event Over(address indexed winner, bool indexed rewardClaimed, address[] participants, address[] leaderboard, uint256[] scores);
    event ProposalSubmitted(
        uint256 indexed turn,
        address indexed proposer,
        uint256 commitment,
        string encryptedProposal,
        bytes gmSignature,
        bytes proposerSignature
    );
    event RequirementsConfigured(LibCoinVending.ConfigPosition config);

    /**
     * @dev Represents a proposal.
     * @param encryptedProposal The encrypted proposal, may be treated as simply restricted URI.
     * @param commitment The commitment to the proposal
     * @param proposer The address of the proposer
     * @param gmSignature The ECDSA signature of the game master
     * @param voterSignature The ECDSA signature of the voter
     * @notice gmSignature and voterSignature are ECDSA signatures for verification
     */
    struct ProposalParams {
        string encryptedProposal;
        uint256 commitment;
        address proposer;
        bytes gmSignature;
        bytes proposerSignature;
    }

    /**
     * @dev Represents a batch of proposal reveal.
     * @param proposals Array of revealed proposals
     * @param a ZK proof components
     * @param b ZK proof components
     * @param c ZK proof components
     * @param permutationCommitment The commitment to the permutation
     * @notice permutationCommitment must be poseidon(sponge(nextTurnPermutation), nullifier). For sponge implementation see poseidonSpongeT3
     */
    struct BatchProposalReveal {
        string[] proposals; // Array of revealed proposals
        uint[2] a; // ZK proof components
        uint[2][2] b;
        uint[2] c;
        uint256 permutationCommitment;
    }

    struct StateOutput {
        uint256 rank;
        uint256 minThreadTime;
        address createdBy;
        uint256 numOngoingProposals;
        uint256 numPrevProposals;
        uint256 numCommitments;
        uint256 numVotesThisTurn;
        uint256 numVotesPrevTurn;
        LibQuadraticVoting.qVotingStruct voting;
        uint256 currentTurn;
        uint256 turnStartedAt;
        uint256 registrationOpenAt;
        uint256 startedAt;
        bool hasStarted;
        bool hasEnded;
        uint256 numPlayersMadeMove;
        uint256 numActivePlayers;
        bool isOvertime;
        uint256 timePerTurn;
        uint256 maxPlayerCnt;
        uint256 minPlayerCnt;
        uint256 timeToJoin;
        uint256 maxTurns;
        uint256 voteCredits;
        address gameMaster;
        string metadata;
    }

    function initialize(string memory name, string memory version, LibCVPP.Settings memory settings) external;

    function submitVote(
        string memory sealedBallotId,
        address voter,
        bytes memory gmSignature,
        bytes memory voterSignature,
        bytes32 ballotHash
    ) external;

    function submitProposal(ProposalParams memory params) external;

    function endTurn(
        uint256[][] memory votes,
        BatchProposalReveal memory newProposals,
        uint256[] memory permutation,
        uint256 shuffleSalt
    ) external;

    function startThread(uint256 permutationCommitment) external;

    function cancelThread() external;

    function leaveThread() external;

    function getTurn() external view returns (uint256);

    function getGM() external view returns (address);

    function getScores() external view returns (address[] memory, uint256[] memory);

    function isOvertime() external view returns (bool);

    function isOver() external view returns (bool);

    function isLastTurn() external view returns (bool);

    function isRegistrationOpen() external view returns (bool);

    function getCreator() external view returns (address);

    function getParticipants() external view returns (address[] memory);

    function canStartThread() external view returns (bool);

    function canEndTurn() external view returns (bool);

    function isParticipantTurnComplete(address participant) external view returns (bool);

    function getContractState() external view returns (LibCVPP.ThreadStateReturn memory);

    function getVotedArray() external view returns (bool[] memory);

    function getParticipantsMoved() external view returns (bool[] memory, uint256);

    function isActive(address participant) external view returns (bool);

    function winner() external view returns (address);
}
