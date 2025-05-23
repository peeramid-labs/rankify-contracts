// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {LibQuadraticVoting} from "../libraries/LibQuadraticVoting.sol";
import {LibCoinVending} from "../libraries/LibCoinVending.sol";

interface IRankifyInstance {
    error NoDivisionReminderAllowed(uint256 a, uint256 b);
    error invalidTurnCount(uint256 nTurns);
    error RankNotSpecified();

    event RegistrationOpen(uint256 indexed gameId);
    event PlayerJoined(uint256 indexed gameId, address indexed participant, bytes32 gmCommitment, string voterPubKey);
    event GameStarted(uint256 indexed gameId);
    event gameCreated(uint256 gameId, address indexed gm, address indexed creator, uint256 indexed rank);
    event GameClosed(uint256 indexed gameId);
    event PlayerLeft(uint256 indexed gameId, address indexed player);
    event RankTokenExited(address indexed player, uint256 rankId, uint256 amount, uint256 _toMint);
    event RequirementsConfigured(uint256 indexed gameId, LibCoinVending.ConfigPosition config);
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
    }

    struct GameStateOutput {
        uint256 rank;
        uint256 minGameTime;
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
}
