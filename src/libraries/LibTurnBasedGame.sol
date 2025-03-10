// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "hardhat/console.sol";
// import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {LibArray} from "../libraries/LibArray.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IErrors} from "../interfaces/IErrors.sol";
/**
 * @title LibTBG
 * @dev Library for managing turn-based games.
 * It is designed to be used as a base library for games, and provides the following functionality:
 * - setting game settings such as time per turn, max players, min players, etc as well as perform score and leaderboard tracking
 *
 * Limitations:
 * - It is assumed there is only one game per player
 * - It is assumed there is only on game master per game
 *
 * ***WARNING*** Some limitations:
 * - This library is still under development and its interfaces may change.
 * - getting game data (which has own storage assignment and can be encapsulated from library) however there is no storage slot collision checks in place
 *
 */
library LibTBG {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Settings {
        uint256 timePerTurn;
        uint256 maxPlayerCnt;
        uint256 minPlayerCnt;
        uint256 timeToJoin;
        uint256 maxTurns;
        uint256 voteCredits;
        address gameMaster;
        bytes32 implementationStoragePointer;
    }

    struct State {
        uint256 currentTurn;
        uint256 turnStartedAt;
        uint256 registrationOpenAt;
        uint256 startedAt;
        bool hasStarted;
        bool hasEnded;
        EnumerableSet.AddressSet players;
        mapping(address => bool) madeMove;
        mapping(address => bool) isActive;
        uint256 numPlayersMadeMove;
        uint256 numActivePlayers;
        mapping(address => uint256) score;
        bool isOvertime;
        address[] leaderboard;
    }

    struct Instance {
        Settings settings;
        State state;
    }

    struct TBGStorageStruct {
        mapping(uint256 => Instance) instances;
        mapping(address => uint256) playerInGame;
        uint256 totalGamesCreated;
    }

    bytes32 constant TBG_STORAGE_POSITION = keccak256("turn_based_game.storage.position");
    bytes32 constant IMPLEMENTATION_STORAGE_POSITION = keccak256("implementation.turn_based_game.storage.position");

    function TBGStorage() internal pure returns (TBGStorageStruct storage es) {
        bytes32 position = TBG_STORAGE_POSITION;
        assembly {
            es.slot := position
        }
    }

    function _getInstance(uint256 gameId) internal view returns (Instance storage) {
        TBGStorageStruct storage tbg = TBGStorage();
        return tbg.instances[gameId];
    }

    function _getState(uint256 gameId) internal view returns (State storage) {
        TBGStorageStruct storage tbg = TBGStorage();
        return tbg.instances[gameId].state;
    }

    /**
     * @dev Initializes the game with the provided settings. `settings` is the settings for the game.
     *
     * Requirements:
     *
     * - `settings.timePerTurn` must not be zero.
     * - `settings.maxPlayerCnt` must not be zero.
     * - `settings.minPlayerCnt` must be at least 2.
     * - `settings.maxTurns` must not be zero.
     * - `settings.timeToJoin` must not be zero.
     * - `settings.maxPlayerCnt` must not be less than `settings.minPlayerCnt`.
     * Modifies:
     *
     * - Sets the settings of the game to `settings`.
     */

    function init(uint256 gameId, Settings memory newSettings) private {
        TBGStorageStruct storage tbg = TBGStorage();
        Settings storage settings = tbg.instances[gameId].settings;
        require(newSettings.timePerTurn != 0, IErrors.invalidConfiguration("LibTBG::init->settings.timePerTurn"));
        require(newSettings.maxPlayerCnt != 0, IErrors.invalidConfiguration("LibTBG::init->settings.maxPlayerCnt"));
        require(newSettings.minPlayerCnt > 1, IErrors.invalidConfiguration("LibTBG::init->settings.minPlayerCnt"));
        require(newSettings.maxTurns != 0, IErrors.invalidConfiguration("LibTBG::init->settings.maxTurns"));
        require(newSettings.timeToJoin != 0, IErrors.invalidConfiguration("LibTBG::init->timeToJoin"));
        require(
            settings.minPlayerCnt < newSettings.maxPlayerCnt,
            IErrors.invalidConfiguration("LibTBG::init->maxPlayerCnt")
        );
        require(newSettings.gameMaster != address(0), IErrors.invalidConfiguration("LibTBG::init->gameMaster"));
        tbg.instances[gameId].settings = newSettings;
    }

    /**
     * @dev Creates a new game with the provided game ID and game master. `gameId` is the ID of the game. `gm` is the address of the game master.
     *
     * Requirements:
     *
     * - The game with `gameId` must not already exist.
     * - `gm` must not be the zero address.
     * - `gameId` must not be zero.
     * - The game master of the game with `gameId` must be the zero address.
     *
     * Modifies:
     *
     * - Sets the game master of the game with `gameId` to `gm`.
     * - Increments the total number of games created.
     */
    function createGame(uint256 gameId, Settings memory settings) internal {
        require(!gameExists(gameId), "createGame->Already exists");
        require(gameId != 0, "createGame->gameId");
        init(gameId, settings);
        TBGStorageStruct storage tbg = TBGStorage();
        tbg.totalGamesCreated += 1;

        //totalGamesCreated ensures nonce-like behavior:
        //even if game would get deleted and re-created with same name, data storage would be different
        tbg.instances[gameId].settings.implementationStoragePointer = keccak256(
            abi.encode(gameId, tbg.totalGamesCreated, TBG_STORAGE_POSITION)
        );
    }

    /**
     * @dev Deletes a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     *
     * Modifies:
     *
     * - Sets the game master, current turn, hasEnded, hasStarted,
     *   implementationStoragePointer, isOvertime, leaderboard, numPlayersMadeMove,
     *   players, registrationOpenAt, and turnStartedAt of the game with `gameId`
     *   to their initial values.
     * - Sets the score and madeMove of each player in the game with `gameId`
     *   to their initial values.
     */
    function deleteGame(uint256 gameId) internal {
        TBGStorageStruct storage tbg = TBGStorage();
        address[] memory players = tbg.instances[gameId].state.players.values();
        for (uint256 i = 0; i < players.length; ++i) {
            tbg.instances[gameId].state.score[players[i]] = 0;
            tbg.instances[gameId].state.madeMove[players[i]] = false;
            tbg.instances[gameId].state.isActive[players[i]] = false;
        }
        delete tbg.instances[gameId].state.currentTurn;
        delete tbg.instances[gameId].state.hasEnded;
        delete tbg.instances[gameId].state.hasStarted;
        delete tbg.instances[gameId].state.isOvertime;
        delete tbg.instances[gameId].state.leaderboard;
        delete tbg.instances[gameId].state.numPlayersMadeMove;
        delete tbg.instances[gameId].state.players;
        delete tbg.instances[gameId].state.registrationOpenAt;
        delete tbg.instances[gameId].state.turnStartedAt;
        delete tbg.instances[gameId].state.numActivePlayers;
        delete tbg.instances[gameId].settings.gameMaster;
        delete tbg.instances[gameId].settings.implementationStoragePointer;
        delete tbg.instances[gameId].settings.timePerTurn;
        delete tbg.instances[gameId].settings.maxPlayerCnt;
        delete tbg.instances[gameId].settings.minPlayerCnt;
        delete tbg.instances[gameId].settings.timeToJoin;
        delete tbg.instances[gameId].settings.maxTurns;
        delete tbg.instances[gameId].settings.voteCredits;
    }

    /**
     * @dev Checks if a game with the provided game ID can be joined. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the game can be joined.
     */
    function canBeJoined(uint256 gameId) internal view returns (bool) {
        State storage state = _getState(gameId);
        if (state.hasStarted || state.registrationOpenAt == 0) return false;
        return true;
    }

    /**
     * @dev Adds a player to a game with the provided game ID. `gameId` is the ID of the game. `participant` is the address of the player.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - `participant` must not already be in a game.
     * - The number of players in the game with `gameId` must be less than the maximum number of players.
     * - The game with `gameId` must be joinable.
     *
     * Modifies:
     *
     * - Adds `participant` to the players of the game with `gameId`.
     * - Sets the madeMove of `participant` in the game with `gameId` to false.
     * - Sets the game of `participant` to `gameId`.
     */
    function addPlayer(uint256 gameId, address participant) internal {
        TBGStorageStruct storage tbg = TBGStorage();
        State storage state = tbg.instances[gameId].state;
        Settings storage settings = tbg.instances[gameId].settings;
        require(gameExists(gameId), "addPlayer->invalid game");

        require(tbg.playerInGame[participant] == 0, "addPlayer->Player in game");
        require(state.players.length() < settings.maxPlayerCnt, "addPlayer->party full");

        require(canBeJoined(gameId), "addPlayer->cant join now");
        state.players.add(participant);
        state.madeMove[participant] = false;
        state.isActive[participant] = false;
        tbg.playerInGame[participant] = gameId;
    }

    /**
     * @dev Checks if a player is in a game with the provided game ID. `gameId` is the ID of the game. `player` is the address of the player.
     *
     * Returns:
     *
     * - A boolean indicating whether the player is in the game.
     */
    function isPlayerInGame(uint256 gameId, address player) internal view returns (bool) {
        TBGStorageStruct storage tbg = TBGStorage();
        return tbg.playerInGame[player] == gameId ? true : false;
    }

    /**
     * @dev Removes a player from a game with the provided game ID. `gameId` is the ID of the game. `participant` is the address of the player.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - `participant` must be in the game with `gameId`.
     * - The game with `gameId` must not have started or must have ended.
     *
     * Modifies:
     *
     * - Sets the game of `participant` to 0.
     * - Removes `participant` from the players of the game with `gameId`.
     */
    function removePlayer(uint256 gameId, address participant) internal {
        TBGStorageStruct storage tbg = TBGStorage();
        State storage state = tbg.instances[gameId].state;
        require(gameExists(gameId), "game does not exist");
        require(tbg.playerInGame[participant] == gameId, "Not in the game");
        require(state.hasStarted == false || state.hasEnded == true, "Cannot leave once started");
        tbg.playerInGame[participant] = 0;
        state.players.remove(participant);
    }

    /**
     * @dev Checks if the current turn in a game with the provided game ID has timed out. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - `gameId` must not be zero.
     * - The game with `gameId` must have started.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn has timed out.
     */
    function isTurnTimedOut(uint256 gameId) internal view returns (bool) {
        TBGStorageStruct storage tbg = TBGStorage();
        State storage state = _getState(gameId);
        assert(gameId != 0);
        assert(state.hasStarted == true);
        if (block.timestamp <= tbg.instances[gameId].settings.timePerTurn + state.turnStartedAt) return false;
        return true;
    }

    /**
     * @dev Checks if a game with the provided game ID exists. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the game exists.
     */
    function gameExists(uint256 gameId) internal view returns (bool) {
        Settings storage settings = getSettings(gameId);
        if (settings.gameMaster != address(0)) return true;
        return false;
    }

    /**
     * @dev Enforces that a game with the provided game ID has started. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - `gameId` must not be zero.
     * - The game with `gameId` must have started.
     */
    function enforceHasStarted(uint256 gameId) internal view {
        State storage state = _getState(gameId);
        assert(gameId != 0);
        require(state.hasStarted, "Game has not yet started");
    }

    /**
     * @dev Enforces that a game with the provided game ID has started. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - `gameId` must not be zero.
     * - The game with `gameId` must have started.
     *
     */
    function canEndTurn(uint256 gameId) internal view returns (bool) {
        bool turnTimedOut = isTurnTimedOut(gameId);
        State storage state = _getState(gameId);
        if (!state.hasStarted || isGameOver(gameId)) return false;
        if (turnTimedOut) return true;
        return false;
    }

    /**
     * @dev Checks if the current turn in a game with the provided game ID can end early. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn can end early.
     */
    function canEndTurnEarly(uint256 gameId) internal view returns (bool) {
        State storage state = _getState(gameId);
        if (!state.hasStarted || isGameOver(gameId)) return false;

        uint256 activePlayersNotMoved = 0;
        address[] memory players = state.players.values();
        for (uint256 i = 0; i < players.length; i++) {
            if (state.isActive[players[i]] && !state.madeMove[players[i]]) {
                activePlayersNotMoved++;
            }
        }
        return activePlayersNotMoved == 0 || canEndTurn(gameId);
    }

    /**
     * @dev Modifier that requires the current turn in a game with the provided game ID to be able to end. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - The current turn in the game with `gameId` must be able to end.
     */
    modifier onlyInTurnTime(uint256 gameId) {
        require(isTurnTimedOut(gameId) == false, "onlyInTurnTime -> turn timeout");
        _;
    }

    modifier onlyWhenTurnCanEnd(uint256 gameId) {
        require(canEndTurn(gameId) == true, "onlyWhenTurnCanEnd: Not everyone made a move yet and there still is time");
        _;
    }

    /**
     * @dev Resets the states of the players in a game. `State` is the state.
     *
     * Modifies:
     *
     * - Sets the madeMove and score of each player in `game` to their initial values.
     */
    function _resetPlayerStates(State storage state) internal {
        for (uint256 i = 0; i < state.players.length(); ++i) {
            address player = state.players.at(i);
            state.madeMove[player] = false;
            state.score[player] = 0;
        }
    }

    /**
     * @dev Sets the score of a player in a game with the provided game ID. `gameId` is the ID of the game. `player` is the address of the player. `value` is the score.
     *
     * Requirements:
     *
     * - `player` must be in the game with `gameId`.
     *
     * Modifies:
     *
     * - Sets the score of `player` in the game with `gameId` to `value`.
     */
    function setScore(uint256 gameId, address player, uint256 value) internal {
        State storage state = _getState(gameId);
        require(isPlayerInGame(gameId, player), "player not in a game");
        state.score[player] = value;
    }

    /**
     * @dev Gets the score of a player in a game with the provided game ID. `gameId` is the ID of the game. `player` is the address of the player.
     *
     * Returns:
     *
     * - The score of `player` in the game with `gameId`.
     */
    function getScore(uint256 gameId, address player) internal view returns (uint256) {
        State storage state = _getState(gameId);
        return state.score[player];
    }

    /**
     * @dev Gets the scores of the players in a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - An array of the addresses of the players in the game with `gameId`.
     * - An array of the scores of the players in the game with `gameId`.
     */
    function getScores(uint256 gameId) internal view returns (address[] memory, uint256[] memory) {
        address[] memory players = getPlayers(gameId);
        uint256[] memory scores = new uint256[](players.length);
        for (uint256 i = 0; i < players.length; ++i) {
            scores[i] = getScore(gameId, players[i]);
        }
        return (players, scores);
    }

    /**
     * @dev Opens registration for a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     *
     * Modifies:
     *
     * - Sets the registrationOpenAt of the game with `gameId` to the current block timestamp.
     */
    function openRegistration(uint256 gameId) internal {
        require(gameExists(gameId), "game not found");
        State storage state = _getState(gameId);
        state.registrationOpenAt = block.timestamp;
    }

    /**
     * @dev Checks if registration is open for a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether registration is open for the game.
     */
    function isRegistrationOpen(uint256 gameId) internal view returns (bool) {
        State storage state = _getState(gameId);
        TBGStorageStruct storage tbg = TBGStorage();
        if (state.registrationOpenAt == 0) {
            return false;
        } else {
            return
                state.registrationOpenAt < block.timestamp + tbg.instances[gameId].settings.timeToJoin ? true : false;
        }
    }

    /**
     * @dev Checks if a game with the provided game ID can start. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the game can start.
     */
    function canStart(uint256 gameId) internal view returns (bool) {
        State storage state = _getState(gameId);
        TBGStorageStruct storage tbg = TBGStorage();
        if (state.hasStarted) return false;
        if (state.registrationOpenAt == 0) return false;
        if (gameId == 0) return false;
        if (block.timestamp <= state.registrationOpenAt + tbg.instances[gameId].settings.timeToJoin) return false;
        if (state.players.length() < tbg.instances[gameId].settings.minPlayerCnt) return false;
        return true;
    }

    /**
     * @dev Checks if a game with the provided game ID can start early. `gameId` is the ID of the game.
     * By "early" it is assumed that time to join has not yet passed, but it's already cap players limit reached.
     *
     * Returns:
     *
     * - A boolean indicating whether the game can start early.
     */
    function canStartEarly(uint256 gameId) internal view returns (bool) {
        State storage state = _getState(gameId);
        TBGStorageStruct storage tbg = TBGStorage();

        if ((state.players.length() == tbg.instances[gameId].settings.maxPlayerCnt) || canStart(gameId)) return true;
        return false;
    }

    /**
     * @dev Internal function to perform common game start operations
     * @param gameId The ID of the game to start
     * @param state The game state storage reference
     * @param tbg The TBG storage reference
     */
    function _performGameStart(uint256 gameId, State storage state, TBGStorageStruct storage tbg) private {
        require(state.hasStarted == false, "startGame->already started");
        require(state.registrationOpenAt != 0, "startGame->Game registration was not yet open");
        require(gameId != 0, "startGame->Game not found");
        require(state.players.length() >= tbg.instances[gameId].settings.minPlayerCnt, "startGame->Not enough players");

        state.hasStarted = true;
        state.hasEnded = false;
        state.currentTurn = 1;
        state.turnStartedAt = block.timestamp;
        state.startedAt = block.timestamp;
        _resetPlayerStates(state);

        // Initialize all players as active
        uint256 playerCount = state.players.length();
        state.numActivePlayers = playerCount;
        for (uint256 i = 0; i < playerCount; i++) {
            address player = state.players.at(i);
            state.isActive[player] = true;
        }
    }

    /**
     * @dev Starts a game with the provided game ID early. `gameId` is the ID of the game.
     * By "early" it is assumed that time to join has not yet passed, but it's already cap players limit reached.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - The game with `gameId` must not have started.
     * - The game with `gameId` must have opened registration.
     * - The number of players in the game with `gameId` must be greater than or equal to the minimum number of players.
     * - The number of players in the game with `gameId` must be equal to the maximum number of players or the current block timestamp must be greater than the registration open time plus the time to join.
     *
     * Modifies:
     *
     * - Sets the hasStarted, hasEnded, currentTurn, and turnStartedAt of the game with `gameId` to their new values.
     * - Resets the states of the players in the game with `gameId`.
     */
    function startGameEarly(uint256 gameId) internal {
        State storage state = _getState(gameId);
        TBGStorageStruct storage tbg = TBGStorage();

        require(
            (state.players.length() == tbg.instances[gameId].settings.maxPlayerCnt) ||
                (block.timestamp > state.registrationOpenAt + tbg.instances[gameId].settings.timeToJoin),
            "startGame->Not enough players"
        );

        _performGameStart(gameId, state, tbg);
    }

    /**
     * @dev Starts a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - The game with `gameId` must not have started.
     * - The game with `gameId` must have opened registration.
     * - The current block timestamp must be greater than the registration open time plus the time to join.
     *
     * Modifies:
     *
     * - Sets the hasStarted, hasEnded, currentTurn, and turnStartedAt of the game with `gameId` to their new values.
     * - Resets the states of the players in the game with `gameId`.
     */
    function startGame(uint256 gameId) internal {
        State storage state = _getState(gameId);
        TBGStorageStruct storage tbg = TBGStorage();

        require(
            block.timestamp > state.registrationOpenAt + tbg.instances[gameId].settings.timeToJoin,
            "startGame->Still Can Join"
        );

        _performGameStart(gameId, state, tbg);
    }

    /**
     * @dev Gets the current turn of a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - The current turn of the game with `gameId`.
     */
    function getTurn(uint256 gameId) internal view returns (uint256) {
        State storage state = _getState(gameId);
        return state.currentTurn;
    }

    /**
     * @dev Gets the game master of a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - The game master of the game with `gameId`.
     */
    function getGM(uint256 gameId) internal view returns (address) {
        Settings storage settings = getSettings(gameId);
        return settings.gameMaster;
    }

    /**
     * @dev Checks if the current turn is the last turn in a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn is the last turn in the game.
     */
    function isLastTurn(uint256 gameId) internal view returns (bool) {
        TBGStorageStruct storage tbg = TBGStorage();
        State storage state = _getState(gameId);
        if (state.currentTurn == tbg.instances[gameId].settings.maxTurns) return true;
        else return false;
    }

    /**
     * @dev Checks if a game with the provided game ID is over. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the game is over.
     */
    function isGameOver(uint256 gameId) internal view returns (bool) {
        TBGStorageStruct storage tbg = TBGStorage();
        State storage state = _getState(gameId);
        if ((state.currentTurn > tbg.instances[gameId].settings.maxTurns) && !state.isOvertime) return true;
        else return false;
    }

    /**
     * @dev Enforces that a game with the provided game ID is not over. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - The game with `gameId` must not be over.
     */
    function enforceIsNotOver(uint256 gameId) internal view {
        require(!isGameOver(gameId), "Game over");
    }

    /**
     * @dev Records a player's move in a game with the provided game ID. `gameId` is the ID of the game. `player` is the address of the player.
     *
     * Requirements:
     *
     * - The game with `gameId` must have started.
     * - The game with `gameId` must not be over.
     * - `player` must not have made a move in the current turn of the game with `gameId`.
     * - `player` must be in the game with `gameId`.
     *
     * Modifies:
     *
     * - Sets the madeMove of `player` in the game with `gameId` to true.
     * - Increments the numPlayersMadeMove of the game with `gameId`.
     */
    function playerMove(uint256 gameId, address player) internal onlyInTurnTime(gameId) {
        State storage state = _getState(gameId);
        enforceHasStarted(gameId);
        enforceIsNotOver(gameId);
        require(state.madeMove[player] == false, "already made a move");
        TBGStorageStruct storage tbg = TBGStorage();
        require(gameId == tbg.playerInGame[player], "is not in the game");
        state.madeMove[player] = true;
        state.numPlayersMadeMove += 1;

        // Set player as active when they make a move
        state.isActive[player] = true;
        state.numActivePlayers++;
    }

    function isPlayerTurnComplete(uint256 gameId, address player) internal view returns (bool) {
        State storage state = _getState(gameId);
        return state.madeMove[player];
    }

    /**
     * @dev Enforces that a player is in a game with the provided game ID. `gameId` is the ID of the game. `player` is the address of the player.
     *
     * Requirements:
     *
     * - `player` must be in the game with `gameId`.
     */
    function enforceIsPlayingGame(uint256 gameId, address player) internal view {
        TBGStorageStruct storage tbg = TBGStorage();
        require(gameId == tbg.playerInGame[player], "is not in the game");
    }

    /**
     * @dev Checks if a game with the provided game ID has started. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the game has started.
     */
    function hasStarted(uint256 gameId) internal view returns (bool) {
        State storage state = _getState(gameId);
        return state.hasStarted;
    }

    /**
     * @dev Gets the leaderboard of a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - An array of the addresses of the players in the game with `gameId`, sorted by score.
     */
    function getLeaderBoard(uint256 gameId) internal view returns (address[] memory) {
        State storage state = _getState(gameId);
        return state.leaderboard;
    }

    /**
     * @dev Advances to the next turn in a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - The game with `gameId` must be able to end the current turn early. (all players have moved or the turn has timed out)
     *
     * Modifies:
     *
     * - Clears the current moves in the game with `gameId`.
     * - Increments the currentTurn of the game with `gameId`.
     * - Sets the turnStartedAt of the game with `gameId` to the current block timestamp.
     * - If the current turn is the last turn or the game with `gameId` is in overtime, checks if the game is a tie and sets the isOvertime of the game with `gameId` to the result.
     * - Sets the hasEnded of the game with `gameId` to whether the game is over.
     *
     * Returns:
     *
     * - A boolean indicating whether the current turn is the last turn.
     * - A boolean indicating whether the game is a tie.
     * - A boolean indicating whether the game is over.
     */
    function nextTurn(uint256 gameId) internal returns (bool, bool, bool) {
        require(canEndTurnEarly(gameId), "nextTurn->CanEndEarly");
        State storage state = _getState(gameId);
        bool wasLastTurn = isLastTurn(gameId);
        state.currentTurn += 1;
        state.turnStartedAt = block.timestamp;
        bool _isLastTurn = isLastTurn(gameId);
        if (wasLastTurn || state.isOvertime) {
            bool _isTie = isTie(gameId);
            state.isOvertime = _isTie;
        }
        state.hasEnded = isGameOver(gameId);

        // Update player activity status for next turn
        uint256 playerCount = state.players.length();
        state.numActivePlayers = 0;

        for (uint256 i = 0; i < playerCount; i++) {
            address player = state.players.at(i);
            // If player didn't make a move this turn, mark them as inactive
            if (!state.madeMove[player]) {
                // console.log('LibTBG::nextTurn - ','player inactive!');
                state.isActive[player] = false;
            } else {
                // console.log('LibTBG::nextTurn - ','player active!');
                state.numActivePlayers++;
            }
            state.madeMove[player] = false;
        }
        state.numPlayersMadeMove = 0;

        (state.leaderboard, ) = sortByScore(gameId);
        return (_isLastTurn, state.isOvertime, state.hasEnded);
    }

    /**
     * @dev Gets the data storage pointer.
     *
     * Returns:
     *
     * - The data storage pointer.
     */
    function getDataStorage() internal pure returns (bytes32 pointer) {
        return IMPLEMENTATION_STORAGE_POSITION;
    }

    /**
     * @dev Gets the game data storage pointer of a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - The game data storage pointer of the game with `gameId`.
     */
    function getGameDataStorage(uint256 gameId) internal view returns (bytes32 pointer) {
        Settings storage settings = getSettings(gameId);
        return settings.implementationStoragePointer;
    }

    /**
     * @dev Gets the number of players in a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - The number of players in the game with `gameId`.
     */
    function getPlayersNumber(uint256 gameId) internal view returns (uint256) {
        State storage state = _getState(gameId);
        return state.players.length();
    }

    /**
     * @dev Gets the players in a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - An array of the addresses of the players in the game with `gameId`.
     */
    function getPlayers(uint256 gameId) internal view returns (address[] memory) {
        State storage state = _getState(gameId);
        return state.players.values();
    }

    /**
     * @dev Gets the game settings.
     *
     * Returns:
     *
     * - The game settings.
     */
    function getSettings(uint256 gameId) internal view returns (Settings storage) {
        TBGStorageStruct storage tbg = TBGStorage();
        return tbg.instances[gameId].settings;
    }

    /**
     * @dev Enforces that a game with the provided game ID is in the pre-registration stage. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - Registration must not be open for the game with `gameId`.
     * - The game with `gameId` must not have started.
     */
    function enforceIsPreRegistrationStage(uint256 gameId) internal view {
        require(!isRegistrationOpen(gameId), "Cannot do when registration is open");
        require(!hasStarted(gameId), "Cannot do when game started");
    }

    /**
     * @dev Adds overtime to a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Modifies:
     *
     * - Sets the isOvertime of the game with `gameId` to true.
     */
    function addOvertime(uint256 gameId) internal {
        State storage state = _getState(gameId);
        state.isOvertime = true;
    }

    /**
     * @dev Checks if a game with the provided game ID is in overtime. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - A boolean indicating whether the game is in overtime.
     */
    function isOvertime(uint256 gameId) internal view returns (bool) {
        State storage state = _getState(gameId);
        return state.isOvertime;
    }

    /**
     * @dev Resets the overtime of a game with the provided game ID. `gameId` is the ID of the game.
     *
     * Modifies:
     *
     * - Sets the isOvertime of the game with `gameId` to false.
     */
    function resetOvertime(uint256 gameId) internal {
        State storage state = _getState(gameId);
        state.isOvertime = false;
    }

    /**
     * @dev Checks if a game with the provided game ID is a tie. `gameId` is the ID of the game.
     * Tie being defined as at least two of the top `numWinners=1` players having the same score.
     *
     * Returns:
     *
     * - A boolean indicating whether the game is a tie.
     */
    function isTie(uint256 gameId) internal view returns (bool) {
        (, uint256[] memory scores) = getScores(gameId);

        LibArray.quickSort(scores, int256(0), int256(scores.length - 1));

        if (scores[0] == scores[1]) {
            return (true);
        }

        return (false);
    }

    /**
     * @dev Gets the game ID of the game a player is in. `player` is the address of the player.
     *
     * Returns:
     *
     * - The game ID of the game `player` is in.
     */
    function getPlayersGame(address player) internal view returns (uint256) {
        TBGStorageStruct storage tbg = TBGStorage();

        return tbg.playerInGame[player];
    }

    /**
     * @dev Sorts the players and scores arrays in descending order of scores using the quicksort algorithm. `players` is the array of player addresses. `scores` is the array of scores. `left` is the left index. `right` is the right index.
     *
     * Modifies:
     *
     * - Sorts the `players` and `scores` arrays in place.
     */
    function _quickSort(address[] memory players, uint256[] memory scores, int256 left, int256 right) private view {
        int256 i = left;
        int256 j = right;
        if (i == j) return;
        uint256 pivot = scores[uint256(left + (right - left) / 2)];
        while (i <= j) {
            while (scores[uint256(i)] > pivot) ++i;
            while (pivot > scores[uint256(j)]) j--;
            if (i <= j) {
                (scores[uint256(i)], scores[uint256(j)]) = (scores[uint256(j)], scores[uint256(i)]);
                (players[uint256(i)], players[uint256(j)]) = (players[uint256(j)], players[uint256(i)]);
                ++i;
                j--;
            }
        }
        if (left < j) _quickSort(players, scores, left, j);
        if (i < right) _quickSort(players, scores, i, right);
    }

    /**
     * @dev Sorts the players in a game with the provided game ID by score in descending order. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - An array of the addresses of the players in the game with `gameId`, sorted by score.
     * - An array of the scores of the players in the game with `gameId`, sorted in descending order.
     */
    function sortByScore(uint256 gameId) internal view returns (address[] memory, uint256[] memory) {
        (address[] memory players, uint256[] memory scores) = getScores(gameId);
        _quickSort(players, scores, 0, int256(scores.length - 1));
        return (players, scores);
    }

    function isActive(uint256 gameId, address player) internal view returns (bool) {
        State storage state = _getState(gameId);
        return state.isActive[player];
    }
}
