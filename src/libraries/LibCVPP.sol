// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {LibCoinVending} from "./LibCoinVending.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {LibArray} from "../libraries/LibArray.sol";
import {IErrors} from "../interfaces/IErrors.sol";
import {LibQuadraticVoting} from "./LibQuadraticVoting.sol";
import {IRankToken} from "../interfaces/IRankToken.sol";
import {Fellowship} from "../Fellowship.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
/**
 * @title LibCVPP
 * @dev Library for managing continuous voting-proposing protocol threads.
 * It is designed to be used as a base library for turn-based voting, and provides the following functionality:
 * - configure initial settings such as time per turn, max participants, min participants, etc as well as perform score and leaderboard tracking
 */
library LibCVPP {
    using EnumerableSet for EnumerableSet.AddressSet;
    using LibQuadraticVoting for LibQuadraticVoting.qVotingStruct;

    bytes32 private constant _CVPP_LIB_COIN_VENDING_POSITION = keccak256("cvpp.lib.coin.vending.position");

    struct Settings {
        uint256 timePerTurn;
        uint256 maxParticipantCnt;
        uint256 minParticipantCnt;
        uint256 timeToJoin;
        uint256 maxTurns;
        uint256 voteCredits;
        address gameMaster;
        IRankToken rankToken;
        address proposalIntegrityVerifier;
        address poseidon5;
        address poseidon6;
        address poseidon2;
        LibCoinVending.ConfigPosition stakes;
        Fellowship fellowship;
    }

    struct ThreadStateReturn {
        uint256 startedAt;
        uint256 currentTurn;
        uint256 turnStartedAt;
        uint256 numCommitments;
        uint256 numVotesThisTurn;
        uint256 numVotesPrevTurn;
        uint256 numPrevProposals;
        uint256 registrationOpenAt;
        uint256 numOngoingProposals;
        uint256 permutationCommitment;
        uint256 numActiveParticipants;
        uint256 numParticipantsMadeMove;
        address createdBy;
        address winner;
        bool hasClaimedReward;
        bool hasStarted;
        bool hasEnded;
        bool isOvertime;
        string metadata;
        Fellowship fellowship;
        Settings settings;
    }

    struct State {
        uint256 startedAt;
        uint256 currentTurn;
        uint256 turnStartedAt;
        uint256 numCommitments;
        uint256 numVotesThisTurn;
        uint256 numVotesPrevTurn;
        uint256 numPrevProposals;
        uint256 registrationOpenAt;
        uint256 numOngoingProposals;
        uint256 permutationCommitment;
        uint256 numActiveParticipants;
        uint256 numParticipantsMadeMove;
        address createdBy;
        address winner;
        bool hasClaimedReward;
        bool hasStarted;
        bool hasEnded;
        bool isOvertime;
        string metadata;
        LibQuadraticVoting.qVotingStruct voting;
        address[] leaderboard;
        EnumerableSet.AddressSet participants;
        mapping(address => uint256) score;
        mapping(address => bool) madeMove;
        mapping(address => bool) isActive;
        mapping(uint256 => string) ongoingProposals; //Previous Turn Proposals (These are being voted on)
        mapping(address => uint256) proposalCommitment;
        mapping(address => bytes32) ballotHashes;
        mapping(address => bool) voted;
    }

    struct CVPP {
        Settings settings;
        State state;
    }

    /**
     * @dev Initializes the library with the provided settings. `settings` is the settings for the library.
     *
     * Requirements:
     *
     * - `settings.timePerTurn` must not be zero.
     * - `settings.maxParticipantCnt` must not be zero.
     * - `settings.minParticipantCnt` must be at least 2.
     * - `settings.maxTurns` must not be zero.
     * - `settings.timeToJoin` must not be zero.
     * - `settings.maxParticipantCnt` must not be less than `settings.minParticipantCnt`.
     * Modifies:
     *
     * - Sets the settings of the library to `settings`.
     */

    function init(CVPP storage cvpp, Settings memory newSettings) public {
        Settings storage settings = cvpp.settings;
        require(newSettings.timePerTurn != 0, IErrors.invalidConfiguration("LibCVPP::init->settings.timePerTurn"));
        require(
            newSettings.maxParticipantCnt != 0,
            IErrors.invalidConfiguration("LibCVPP::init->settings.maxParticipantCnt")
        );
        require(
            newSettings.minParticipantCnt > 1,
            IErrors.invalidConfiguration("LibCVPP::init->settings.minParticipantCnt")
        );
        require(newSettings.maxTurns != 0, IErrors.invalidConfiguration("LibCVPP::init->settings.maxTurns"));
        require(newSettings.timeToJoin != 0, IErrors.invalidConfiguration("LibCVPP::init->timeToJoin"));
        require(
            settings.minParticipantCnt < newSettings.maxParticipantCnt,
            IErrors.invalidConfiguration("LibCVPP::init->maxParticipantCnt")
        );
        require(newSettings.gameMaster != address(0), IErrors.invalidConfiguration("LibCVPP::init->gameMaster"));
        require(
            address(newSettings.fellowship) != address(0),
            IErrors.invalidConfiguration("LibCVPP::init->fellowship")
        );
        cvpp.settings = newSettings;
        LibCoinVending.configure(_CVPP_LIB_COIN_VENDING_POSITION, cvpp.settings.stakes);
    }

    /**
     * @dev Checks if a thread can be joined.
     *
     * Returns:
     *
     * - A boolean indicating whether the thread can be joined.
     */
    function canBeJoined(CVPP storage cvpp) private view returns (bool) {
        State storage state = cvpp.state;
        if (state.hasStarted || state.registrationOpenAt == 0) return false;
        return true;
    }

    /**
     * @dev Adds a Participant to a thread. `participant` is the address of the Participant.
     *
     * Requirements:
     *
     * - The thread must exist.
     * - `participant` must not already be in a thread.
     * - The number of participants in the thread with must be less than the maximum number of participants.
     *
     * Modifies:
     *
     * - Adds `participant` to the participants of the thread.
     * - Sets the madeMove of `participant` in the thread to false.
     * - Sets the thread of `participant` to `threadId`.
     */
    function addParticipant(CVPP storage cvpp, address participant) public {
        State storage state = cvpp.state;
        Settings storage settings = cvpp.settings;

        require(state.participants.length() < settings.maxParticipantCnt, "addParticipant->party full");

        require(canBeJoined(cvpp), "addParticipant->cant join now");
        state.participants.add(participant);
        state.madeMove[participant] = false;
        state.isActive[participant] = false;
    }

    /**
     * @dev Checks if a Participant is in a thread. `Participant` is the address of the Participant.
     *
     * Returns:
     *
     * - A boolean indicating whether the Participant is in the thread.
     */
    function isParticipant(CVPP storage cvpp, address participant) public view returns (bool) {
        return cvpp.state.participants.contains(participant);
    }

    /**
     * @dev Removes a Participant from a thread. `participant` is the address of the Participant.
     *
     * Requirements:
     *
     * - `participant` must be in the thread with.
     * - The thread must not have started or must have ended.
     *
     * Modifies:
     *
     * - Sets the thread of `participant` to 0.
     * - Removes `participant` from the thread.
     */
    function removeParticipant(CVPP storage cvpp, address participant) public {
        State storage state = cvpp.state;
        cvpp.settings.fellowship.unlockRank(participant);
        require(isParticipant(cvpp, participant), "Not in the thread");
        require(state.hasStarted == false || state.hasEnded == true, "Cannot leave once started");
        cvpp.state.participants.remove(participant);
        LibCoinVending.release(
            _CVPP_LIB_COIN_VENDING_POSITION,
            cvpp.state.createdBy,
            getLeaderBoard(cvpp)[0],
            participant
        );
    }

    /**
     * @dev Checks if the current turn in a thread has timed out.
     *
     * Requirements:
     *
     * - The thread must have started.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn has timed out.
     */
    function isTurnTimedOut(CVPP storage cvpp) public view returns (bool) {
        State storage state = cvpp.state;
        assert(state.hasStarted == true);
        if (block.timestamp <= cvpp.settings.timePerTurn + state.turnStartedAt) return false;
        return true;
    }

    /**
     * @dev Enforces that a thread has started.
     *
     * Requirements:
     *
     * - The thread must have started.
     */
    function enforceHasStarted(CVPP storage cvpp) public view {
        State storage state = cvpp.state;
        require(state.hasStarted, "Thread has not yet started");
    }

    /**
     * @dev Enforces that a thread has started.
     *
     * Requirements:
     *
     * - The thread must have started.
     *
     */
    function canEndTurn(CVPP storage cvpp) public view returns (bool) {
        bool turnTimedOut = isTurnTimedOut(cvpp);
        State storage state = cvpp.state;
        if (!state.hasStarted || isOver(cvpp)) return false;
        if (turnTimedOut) return true;
        return false;
    }

    /**
     * @dev Checks if the current turn in a thread can end early.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn can end early.
     */
    function canEndTurnEarly(CVPP storage cvpp) public view returns (bool) {
        State storage state = cvpp.state;
        if (!state.hasStarted || isOver(cvpp)) return false;

        uint256 activeParticipantsNotMoved = 0;
        address[] memory participants = state.participants.values();
        for (uint256 i = 0; i < participants.length; i++) {
            if (state.isActive[participants[i]] && !state.madeMove[participants[i]]) {
                activeParticipantsNotMoved++;
            }
        }
        return activeParticipantsNotMoved == 0 || canEndTurn(cvpp);
    }

    /**
     * @dev Modifier that requires the current turn in a thread to be able to end.
     *
     * Requirements:
     *
     * - The current turn in the thread must be able to end.
     */
    modifier onlyInTurnTime(CVPP storage cvpp) {
        require(isTurnTimedOut(cvpp) == false, "onlyInTurnTime -> turn timeout");
        _;
    }

    /**
     * @dev Resets the states of the participants in a thread. `State` is the state.
     *
     * Modifies:
     *
     * - Sets the madeMove and score of each Participant in `thread` to their initial values.
     */
    function _resetParticipantStates(CVPP storage cvpp) public {
        State storage state = cvpp.state;
        for (uint256 i = 0; i < state.participants.length(); ++i) {
            address Participant = state.participants.at(i);
            state.madeMove[Participant] = false;
            state.score[Participant] = 0;
        }
    }

    /**
     * @dev Sets the score of a Participant in a thread. `Participant` is the address of the Participant. `value` is the score.
     *
     * Requirements:
     *
     * - `Participant` must be in the thread.
     *
     * Modifies:
     *
     * - Sets the score of `Participant` to `value`.
     */
    function setScore(CVPP storage cvpp, address Participant, uint256 value) public {
        State storage state = cvpp.state;
        require(isParticipant(cvpp, Participant), "Participant not in a thread");
        state.score[Participant] = value;
    }

    /**
     * @dev Gets the score of a Participant in a thread. `Participant` is the address of the Participant.
     *
     * Returns:
     *
     * - The score of `Participant`.
     */
    function getScore(CVPP storage cvpp, address Participant) public view returns (uint256) {
        State storage state = cvpp.state;
        return state.score[Participant];
    }

    /**
     * @dev Gets the scores of the participants in a thread.
     *
     * Returns:
     *
     * - An array of the addresses of the participants.
     * - An array of the scores of the participants.
     */
    function getScores(CVPP storage cvpp) public view returns (address[] memory, uint256[] memory) {
        address[] memory participants = cvpp.state.participants.values();
        uint256[] memory scores = new uint256[](participants.length);
        for (uint256 i = 0; i < participants.length; ++i) {
            scores[i] = getScore(cvpp, participants[i]);
        }
        return (participants, scores);
    }

    /**
     * @dev Opens registration for a thread.
     *
     * Requirements:
     *
     * Modifies:
     *
     * - Sets the registrationOpenAt of the thread to the current block timestamp.
     */
    function openRegistration(CVPP storage cvpp) public {
        State storage state = cvpp.state;
        state.registrationOpenAt = block.timestamp;
    }

    /**
     * @dev Checks if registration is open for a thread.
     *
     * Returns:
     *
     * - A boolean indicating whether registration is open for the thread.
     */
    function isRegistrationOpen(CVPP storage cvpp) public view returns (bool) {
        State storage state = cvpp.state;
        Settings storage settings = cvpp.settings;
        if (state.registrationOpenAt == 0) {
            return false;
        } else {
            return state.registrationOpenAt < block.timestamp + settings.timeToJoin ? true : false;
        }
    }

    /**
     * @dev Checks if a thread can start.
     *
     * Returns:
     *
     * - A boolean indicating whether the thread can start.
     */
    function canStart(CVPP storage cvpp) public view returns (bool) {
        State storage state = cvpp.state;
        if (state.hasStarted) return false;
        if (state.registrationOpenAt == 0) return false;
        if (block.timestamp <= state.registrationOpenAt + cvpp.settings.timeToJoin) return false;
        if (state.participants.length() < cvpp.settings.minParticipantCnt) return false;
        return true;
    }

    /**
     * @dev Checks if a thread can start early.
     * By "early" it is assumed that time to join has not yet passed, but it's already cap participants limit reached.
     *
     * Returns:
     *
     * - A boolean indicating whether the thread can start early.
     */
    function canStartEarly(CVPP storage cvpp) public view returns (bool) {
        State storage state = cvpp.state;
        Settings storage settings = cvpp.settings;

        if ((state.participants.length() == settings.maxParticipantCnt) || canStart(cvpp)) return true;
        return false;
    }

    /**
     * @dev private function to perform common thread start operations
     * @param cvpp The thread storage reference
     */
    function _performStart(CVPP storage cvpp) private {
        require(cvpp.state.hasStarted == false, "start->already started");
        require(cvpp.state.registrationOpenAt != 0, "start->Thread registration was not yet open");
        require(cvpp.state.participants.length() >= cvpp.settings.minParticipantCnt, "start->Not enough participants");

        cvpp.state.hasStarted = true;
        cvpp.state.hasEnded = false;
        cvpp.state.currentTurn = 1;
        cvpp.state.turnStartedAt = block.timestamp;
        cvpp.state.startedAt = block.timestamp;
        _resetParticipantStates(cvpp);

        // Initialize all participants as active
        uint256 playerCount = cvpp.state.participants.length();
        cvpp.state.numActiveParticipants = playerCount;
        for (uint256 i = 0; i < playerCount; i++) {
            address Participant = cvpp.state.participants.at(i);
            cvpp.state.isActive[Participant] = true;
        }
    }

    /**
     * @dev Starts a thread early.
     * By "early" it is assumed that time to join has not yet passed, but it's already cap participants limit reached.
     *
     * Requirements:
     *
     * - The thread must not have started.
     * - The thread must have opened registration.
     * - The number of participants in the thread must be greater than or equal to the minimum number of participants.
     * - The number of participants in the thread must be equal to the maximum number of participants or the current block timestamp must be greater than the registration open time plus the time to join.
     *
     * Modifies:
     *
     * - Sets the hasStarted, hasEnded, currentTurn, and turnStartedAt of the thread to their new values.
     * - Resets the states of the participants in the thread.
     */
    function startEarly(CVPP storage cvpp) public {
        State storage state = cvpp.state;
        Settings storage settings = cvpp.settings;

        require(
            (state.participants.length() == settings.maxParticipantCnt) ||
                (block.timestamp > state.registrationOpenAt + settings.timeToJoin),
            "start->Not enough participants"
        );

        _performStart(cvpp);
    }

    /**
     * @dev Starts a thread.
     *
     * Requirements:
     *
     * - The thread must not have started.
     * - The thread must have opened registration.
     * - The current block timestamp must be greater than the registration open time plus the time to join.
     *
     * Modifies:
     *
     * - Sets the hasStarted, hasEnded, currentTurn, and turnStartedAt of the thread to their new values.
     * - Resets the states of the participants in the thread.
     */
    function start(CVPP storage cvpp) public {
        State storage state = cvpp.state;
        Settings storage settings = cvpp.settings;

        require(block.timestamp > state.registrationOpenAt + settings.timeToJoin, "start->Still Can Join");

        _performStart(cvpp);
    }

    /**
     * @dev Gets the current turn of a thread.
     *
     * Returns:
     *
     * - The current turn of the thread.
     */
    function getTurn(CVPP storage cvpp) public view returns (uint256) {
        State storage state = cvpp.state;
        return state.currentTurn;
    }

    /**
     * @dev Gets the game master of a thread.
     *
     * Returns:
     *
     * - The game master.
     */
    function getGM(CVPP storage cvpp) public view returns (address) {
        Settings storage settings = cvpp.settings;
        return settings.gameMaster;
    }

    /**
     * @dev Checks if the current turn is the last turn in a thread.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn is the last turn in the thread.
     */
    function isLastTurn(CVPP storage cvpp) public view returns (bool) {
        Settings storage settings = cvpp.settings;
        State storage state = cvpp.state;
        if (state.currentTurn == settings.maxTurns) return true;
        else return false;
    }

    /**
     * @dev Checks if a thread is over.
     *
     * Returns:
     *
     * - A boolean indicating whether the thread is over.
     */
    function isOver(CVPP storage cvpp) public view returns (bool) {
        Settings storage settings = cvpp.settings;
        State storage state = cvpp.state;
        if ((state.currentTurn > settings.maxTurns) && !state.isOvertime) return true;
        else return false;
    }

    /**
     * @dev Enforces that a thread is not over.
     *
     * Requirements:
     *
     * - The thread must not be over.
     */
    function enforceIsNotOver(CVPP storage cvpp) public view {
        require(!isOver(cvpp), "Thread over");
    }

    /**
     * @dev Ensures that the candidate is the game master of the game with the given ID. `gameId` is the ID of the game. `candidate` is the address of the candidate.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - `candidate` must be the game master of the game.
     */
    function enforceIsGM(CVPP storage cvpp, address candidate) public view {
        require(getGM(cvpp) == candidate, "Only game master");
    }

    /**
     * @dev Records a Participant's move in a thread. `Participant` is the address of the Participant.
     *
     * Requirements:
     *
     * - The thread must have started.
     * - The thread must not be over.
     * - `Participant` must not have made a move in the current turn of the thread.
     * - `Participant` must be in the thread.
     *
     * Modifies:
     *
     * - Sets the madeMove of `Participant` in the thread to true.
     * - Increments the numParticipantsMadeMove of the thread.
     */
    function attemptMove(CVPP storage cvpp, address participant) public onlyInTurnTime(cvpp) {
        State storage state = cvpp.state;
        enforceHasStarted(cvpp);
        enforceIsNotOver(cvpp);
        require(state.madeMove[participant] == false, "already made a move");
        require(cvpp.state.participants.contains(participant), "is not in the thread");
        state.madeMove[participant] = true;
        state.numParticipantsMadeMove += 1;
    }

    function isParticipantTurnComplete(CVPP storage cvpp, address participant) public view returns (bool) {
        State storage state = cvpp.state;
        return state.madeMove[participant];
    }

    /**
     * @dev Enforces that a Participant is in a thread. `Participant` is the address of the Participant.
     *
     * Requirements:
     *
     * - `Participant` must be in the thread.
     */
    function enforceIsMember(CVPP storage cvpp, address participant) public view {
        require(cvpp.state.participants.contains(participant), "account is not in the thread");
    }

    /**
     * @dev Checks if a thread has started.
     *
     * Returns:
     *
     * - A boolean indicating whether the thread has started.
     */
    function hasStarted(CVPP storage cvpp) public view returns (bool) {
        State storage state = cvpp.state;
        return state.hasStarted;
    }

    /**
     * @dev Gets the leaderboard of a thread.
     *
     * Returns:
     *
     * - An array of the addresses of the participants in the thread, sorted by score.
     */
    function getLeaderBoard(CVPP storage cvpp) public view returns (address[] memory) {
        State storage state = cvpp.state;
        return state.leaderboard;
    }

    /**
     * @dev Advances to the next turn in a thread.
     *
     * Requirements:
     *
     * - The thread must be able to end the current turn early. (all participants have moved or the turn has timed out)
     *
     * Modifies:
     *
     * - Clears the current moves in the thread.
     * - Increments the currentTurn of the thread.
     * - Sets the turnStartedAt of the thread to the current block timestamp.
     * - If the current turn is the last turn or the thread is in overtime, checks if the thread is a tie and sets the isOvertime of the thread to the result.
     * - Sets the hasEnded of the thread to whether the thread is over.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn is the last turn.
     * - A boolean indicating whether the thread is a tie.
     * - A boolean indicating whether the thread is over.
     */
    function nextTurn(CVPP storage cvpp) public returns (bool, bool, bool) {
        require(canEndTurnEarly(cvpp), "nextTurn->CanEndEarly");
        State storage state = cvpp.state;
        bool wasLastTurn = isLastTurn(cvpp);
        state.currentTurn += 1;
        state.turnStartedAt = block.timestamp;
        bool _isLastTurn = isLastTurn(cvpp);
        if (wasLastTurn || state.isOvertime) {
            bool _isTie = isTie(cvpp);
            state.isOvertime = _isTie;
        }
        state.hasEnded = isOver(cvpp);
        state.numParticipantsMadeMove = 0;

        (state.leaderboard, ) = sortByScore(cvpp);
        return (_isLastTurn, state.isOvertime, state.hasEnded);
    }

    /**
     * @dev Gets the number of participants in a thread.
     *
     * Returns:
     *
     * - The number of participants in the thread.
     */
    function getParticipantsNumber(CVPP storage cvpp) public view returns (uint256) {
        State storage state = cvpp.state;
        return state.participants.length();
    }

    /**
     * @dev Gets the participants in a thread.
     *
     * Returns:
     *
     * - An array of the addresses of the participants in the thread.
     */
    function getParticipants(CVPP storage cvpp) public view returns (address[] memory) {
        State storage state = cvpp.state;
        return state.participants.values();
    }

    /**
     * @dev Enforces that a thread is in the pre-registration stage.
     *
     * Requirements:
     *
     * - Registration must not be open for the thread.
     * - The thread must not have started.
     */
    function enforceIsPreRegistrationStage(CVPP storage cvpp) public view {
        require(!isRegistrationOpen(cvpp), "Cannot do when registration is open");
        require(!hasStarted(cvpp), "Cannot do when thread started");
    }

    /**
     * @dev Adds overtime to a thread.
     *
     * Modifies:
     *
     * - Sets the isOvertime of the thread to true.
     */
    function addOvertime(CVPP storage cvpp) public {
        State storage state = cvpp.state;
        state.isOvertime = true;
    }

    /**
     * @dev Checks if a thread is in overtime.
     *
     * Returns:
     *
     * - A boolean indicating whether the thread is in overtime.
     */
    function isOvertime(CVPP storage cvpp) public view returns (bool) {
        State storage state = cvpp.state;
        return state.isOvertime;
    }

    /**
     * @dev Resets the overtime of a thread.
     *
     * Modifies:
     *
     * - Sets the isOvertime of the thread to false.
     */
    function resetOvertime(CVPP storage cvpp) public {
        State storage state = cvpp.state;
        state.isOvertime = false;
    }

    /**
     * @dev Checks if a thread is a tie.
     * Tie being defined as at least two of the top `numWinners=1` participants having the same score.
     *
     * Returns:
     *
     * - A boolean indicating whether the thread is a tie.
     */
    function isTie(CVPP storage cvpp) public view returns (bool) {
        (, uint256[] memory scores) = getScores(cvpp);

        LibArray.quickSort(scores, int256(0), int256(scores.length - 1));

        if (scores[0] == scores[1]) {
            return (true);
        }

        return (false);
    }

    /**
     * @dev Sorts the participants in a thread by score in descending order
     *
     * Returns:
     *
     * - An array of the addresses of the participants sorted by score.
     * - An array of the scores of the participants, sorted in descending order.
     */
    function sortByScore(CVPP storage cvpp) public view returns (address[] memory, uint256[] memory) {
        (address[] memory participants, uint256[] memory scores) = getScores(cvpp);
        LibArray.quickSort(participants, scores, 0, int256(scores.length - 1));
        return (participants, scores);
    }

    function isActive(CVPP storage cvpp, address Participant) public view returns (bool) {
        State storage state = cvpp.state;
        return state.isActive[Participant];
    }

    /**
     * @dev Closes the game with the given ID and transfers the game's balance to the beneficiary. `gameId` is the ID of the game. `beneficiary` is the address to transfer the game's balance to. `playersGameEndedCallback` is a callback function to call for each player when the game ends.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     *
     * Modifies:
     *
     * - Removes and unlocks each player from the game.
     * - Calls `playersGameEndedCallback` for each player.
     * - Transfers the game's balance to `beneficiary`.
     *
     * Returns:
     *
     * - The final scores of the game.
     */
    function close(
        LibCVPP.CVPP storage cvpp
    ) public returns (address[] memory participants, address[] memory, uint256[] memory, bool) {
        (, uint256[] memory finalScores) = getScores(cvpp);
        participants = getParticipants(cvpp);
        for (uint256 i = 0; i < participants.length; ++i) {
            removeParticipant(cvpp, participants[i]);
        }
        cvpp.state.winner = cvpp.state.leaderboard[0];
        try cvpp.settings.fellowship.claim(cvpp.state.winner) {
            cvpp.state.hasClaimedReward = true;
        } catch (bytes memory reason) {
            cvpp.state.hasClaimedReward = false;
        }
        return (participants, cvpp.state.leaderboard, finalScores, cvpp.state.hasClaimedReward);
    }

    function getState(LibCVPP.CVPP storage cvpp) public view returns (LibCVPP.ThreadStateReturn memory) {
        return
            LibCVPP.ThreadStateReturn({
                hasClaimedReward: cvpp.state.hasClaimedReward,
                startedAt: cvpp.state.startedAt,
                currentTurn: cvpp.state.currentTurn,
                turnStartedAt: cvpp.state.turnStartedAt,
                numCommitments: cvpp.state.numCommitments,
                numVotesThisTurn: cvpp.state.numVotesThisTurn,
                numVotesPrevTurn: cvpp.state.numVotesPrevTurn,
                numPrevProposals: cvpp.state.numPrevProposals,
                registrationOpenAt: cvpp.state.registrationOpenAt,
                numOngoingProposals: cvpp.state.numOngoingProposals,
                permutationCommitment: cvpp.state.permutationCommitment,
                numActiveParticipants: cvpp.state.numActiveParticipants,
                numParticipantsMadeMove: cvpp.state.numParticipantsMadeMove,
                createdBy: cvpp.state.createdBy,
                winner: cvpp.state.winner,
                hasStarted: cvpp.state.hasStarted,
                hasEnded: cvpp.state.hasEnded,
                isOvertime: cvpp.state.isOvertime,
                fellowship: cvpp.settings.fellowship,
                metadata: cvpp.state.metadata,
                settings: cvpp.settings
            });
    }

    /**
     * @dev Calculates the scores using a quadratic formula based on the revealed votes and proposer indices. `gameId` is the ID of the game. `votesRevealed` is an array of revealed votes. `proposerIndices` is an array of proposer indices that links proposals to index in getPlayers().
     *
     * Returns:
     *
     * - An array of updated scores for each player.
     * - An array of scores calculated for the current round.
     */
    function calculateScores(
        LibCVPP.CVPP storage cvpp,
        uint256[][] memory votesRevealed
    ) public returns (uint256[] memory, uint256[] memory) {
        address[] memory players = cvpp.state.participants.values();
        uint256[] memory scores = new uint256[](players.length);
        bool[] memory voted = new bool[](players.length);
        bool[] memory playerProposed = new bool[](players.length);
        // Convert mapping to array to pass it to libQuadratic
        for (uint256 i = 0; i < players.length; ++i) {
            voted[i] = cvpp.state.voted[players[i]];
            playerProposed[i] = cvpp.state.proposalCommitment[players[i]] != 0;
        }
        uint256[] memory roundScores = cvpp.state.voting.tallyVotes(votesRevealed, voted, playerProposed);
        for (uint256 playerIdx = 0; playerIdx < players.length; playerIdx++) {
            //for each player
            if (cvpp.state.proposalCommitment[players[playerIdx]] != 0) {
                //if player proposal exists
                scores[playerIdx] = cvpp.state.score[players[playerIdx]] + roundScores[playerIdx];
                cvpp.state.score[players[playerIdx]] = scores[playerIdx];
            } else {
                //Player did not propose
                // TODO: implement tests for this
                // require(roundScores[playerIdx] == 0, "LibRankify->calculateScores: player got votes without proposing");
            }
        }
        return (scores, roundScores);
    }

    /**
     * @dev Cancels the thread. Refunds half of the threads's payment to the game creator, and transfers the remaining balance to the beneficiary. `onPlayerLeftCallback` is a callback function to call for each player when they leave. `beneficiary` is the address to transfer the remaining balance to.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     *
     * Modifies:
     *
     * - Calls `quitGame` for each player in the game.
     * - Transfers half of the game's payment to the game creator.
     * - Decreases the game's payments balance by the refund amount.
     * - Transfers the remaining balance of the game to `beneficiary`.
     * - Deletes the game.
     */ function cancelThread(CVPP storage cvpp) public {
        address[] memory participants = getParticipants(cvpp);
        for (uint256 i = 0; i < participants.length; ++i) {
            removeParticipant(cvpp, participants[i]); //this will throw if game has started or doesn't exist
            LibCoinVending.refund(_CVPP_LIB_COIN_VENDING_POSITION, participants[i]);
        }
        delete cvpp.state.currentTurn;
        delete cvpp.state.hasEnded;
        delete cvpp.state.hasStarted;
        delete cvpp.state.isOvertime;
        delete cvpp.state.leaderboard;
        delete cvpp.state.numParticipantsMadeMove;
        delete cvpp.state.participants;
        delete cvpp.state.registrationOpenAt;
        delete cvpp.state.turnStartedAt;
        delete cvpp.state.numActiveParticipants;
        delete cvpp.settings.gameMaster;
    }

    /**
     * @dev Allows a player to join a game. `player` is the address of the player.
     *
     * Requirements:
     *
     * - If the join thread price is not 0, the `player` must have approved this contract to transfer the join thread price amount of the thread payment token on their behalf.
     *
     * Modifies:
     *
     * - Transfers the join thread price amount of the thread payment token from `player` to this contract.
     * - Increases the payments balance of the thread by the join thread price.
     * - Adds `player` to the thread.
     */
    function joinThread(CVPP storage cvpp, address player, bytes memory gameMasterSignature, bytes32 digest) public {
        LibCoinVending.fund(_CVPP_LIB_COIN_VENDING_POSITION);
        cvpp.settings.fellowship.lockRank(player);
        addParticipant(cvpp, player);
        address signer = ECDSA.recover(digest, gameMasterSignature);
        require(
            getGM(cvpp) == signer,
            IErrors.invalidECDSARecoverSigner(digest, "LibRankify::joinGame->invalid signature")
        );
    }

    function claimReward(CVPP storage cvpp) public {
        require(cvpp.state.hasEnded, "Thread is not over");
        require(cvpp.state.hasClaimedReward == false, "Reward already claimed");
        cvpp.settings.fellowship.claim(cvpp.state.winner);
        cvpp.state.hasClaimedReward = true;
    }
}
