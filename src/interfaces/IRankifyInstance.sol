// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {LibQuadraticVoting} from "../libraries/LibQuadraticVoting.sol";
import {LibCoinVending} from "../libraries/LibCoinVending.sol";

interface IRankifyInstance {
    enum ProposingEndStatus {
        Success,
        MinProposalsNotMetAndNotStale,
        GameIsStaleAndCanEnd, // Explicit status for when min proposals not met but game is stale
        PhaseConditionsNotMet, // Basic LibTBG conditions not met
        NotProposingStage
    }

    error NoDivisionReminderAllowed(uint256 a, uint256 b);
    error invalidTurnCount(uint256 nTurns);
    error RankNotSpecified();
    error ErrorProposingStageEndFailed(uint256 gameId, ProposingEndStatus status);
    error ErrorCannotForceEndGame(uint256 gameId);

    event RegistrationOpen(uint256 indexed gameId);
    event PlayerJoined(uint256 indexed gameId, address indexed participant, bytes32 gmCommitment, string voterPubKey);
    event GameStarted(uint256 indexed gameId);
    event gameCreated(
        uint256 gameId,
        address indexed gm,
        address indexed creator,
        uint256 indexed rank,
        uint256 proposingPhaseDuration,
        uint256 votePhaseDuration
    );
    event GameClosed(uint256 indexed gameId);
    event PlayerLeft(uint256 indexed gameId, address indexed player);
    event RankTokenExited(address indexed player, uint256 rankId, uint256 amount, uint256 _toMint);
    event RequirementsConfigured(uint256 indexed gameId, LibCoinVending.ConfigPosition config);
    event StaleGameEnded(uint256 indexed gameId, address winner);
    event ProposingStageEnded(
        uint256 indexed gameId,
        uint256 indexed roundNumber,
        uint256 numProposals,
        string[] proposals
    );

    struct NewGameParamsInput {
        uint256 gameRank;
        uint256 minPlayerCnt;
        uint256 maxPlayerCnt;
        uint96 nTurns;
        uint256 voteCredits;
        address gameMaster;
        uint128 minGameTime;
        uint128 timePerTurn;
        uint128 timeToJoin;
        string metadata;
        uint256 votePhaseDuration;
        uint256 proposingPhaseDuration;
    }

    struct GameStateOutput {
        uint256 rank;
        uint256 minGameTime;
        address createdBy;
        uint256 numCommitments;
        uint256 numVotes;
        LibQuadraticVoting.qVotingStruct voting;
        uint256 currentTurn;
        uint256 turnStartedAt;
        uint256 registrationOpenAt;
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
        uint256 phase;
        uint256 votePhaseDuration;
        uint256 proposingPhaseDuration;
        uint256 phaseStartedAt;
    }
}
