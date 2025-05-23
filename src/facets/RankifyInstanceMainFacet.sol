// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";

import {IERC1155Receiver} from "../interfaces/IERC1155Receiver.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../abstracts/DiamondReentrancyGuard.sol";
import {LibRankify} from "../libraries/LibRankify.sol";
import {LibCoinVending} from "../libraries/LibCoinVending.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../abstracts/draft-EIP712Diamond.sol";
import "hardhat/console.sol";
import {IErrors} from "../interfaces/IErrors.sol";
import {IRankToken} from "../interfaces/IRankToken.sol";
import {DistributableGovernanceERC20} from "../tokens/DistributableGovernanceERC20.sol";
/**
 * @title RankifyInstanceMainFacet
 * @notice Main facet for the Rankify protocol that handles game creation and management
 * @dev Implements core game functionality, ERC token receivers, and reentrancy protection
 * @author Peeramid Labs, 2024
 */
contract RankifyInstanceMainFacet is
    IRankifyInstance,
    IERC1155Receiver,
    DiamondReentrancyGuard,
    IERC721Receiver,
    EIP712,
    IErrors
{
    using LibTBG for LibTBG.Instance;
    using LibTBG for uint256;
    using LibTBG for LibTBG.Settings;
    using LibRankify for uint256;

    /**
     * @dev Internal function to create a new game with the specified parameters
     * @param params Struct containing all necessary parameters for game creation
     * @notice This function handles the core game creation logic, including:
     *         - Setting up the game state
     *         - Configuring the coin vending system
     *         - Emitting the game creation event
     */
    function createGame(
        LibRankify.NewGameParams memory params,
        LibCoinVending.ConfigPosition memory requirements
    ) private nonReentrant returns (uint256) {
        //TODO: add this back in start  game to verify commitment from game master
        //  bytes32 digest = _hashTypedDataV4(
        //     keccak256(
        //         abi.encode(
        //             keccak256(
        //                 "AttestGameCreation(uint256 gameId,uint256 commitment)"
        //             ),
        //             params.gameId,
        //             params.gmCommitment
        //         )
        //     )
        // );

        LibRankify.newGame(params);
        LibCoinVending.configure(bytes32(params.gameId), requirements);
        emit gameCreated(params.gameId, params.gameMaster, msg.sender, params.gameRank);
        return params.gameId;
    }

    /**
     * @dev External function to create a new game
     * @param params Input parameters for creating a new game
     * @notice This function:
     *         - Validates the contract is initialized
     *         - Processes input parameters
     *         - Creates a new game with specified settings
     * @custom:security nonReentrant
     */
    function createGame(IRankifyInstance.NewGameParamsInput memory params) public returns (uint256) {
        LibRankify.enforceIsInitialized();
        LibRankify.InstanceState storage settings = LibRankify.instanceState();
        LibRankify.NewGameParams memory newGameParams = LibRankify.NewGameParams({
            gameId: settings.numGames + 1,
            gameRank: params.gameRank,
            creator: msg.sender,
            minPlayerCnt: params.minPlayerCnt,
            maxPlayerCnt: params.maxPlayerCnt,
            gameMaster: params.gameMaster,
            nTurns: params.nTurns,
            voteCredits: params.voteCredits,
            minGameTime: params.minGameTime,
            timePerTurn: params.timePerTurn,
            timeToJoin: params.timeToJoin,
            metadata: params.metadata
        });

        LibCoinVending.ConfigPosition memory emptyConfig;
        return createGame(newGameParams, emptyConfig);
    }

    function createAndOpenGame(
        IRankifyInstance.NewGameParamsInput memory params,
        LibCoinVending.ConfigPosition memory requirements
    ) public {
        LibRankify.enforceIsInitialized();
        LibRankify.InstanceState storage settings = LibRankify.instanceState();
        LibRankify.NewGameParams memory newGameParams = LibRankify.NewGameParams({
            gameId: settings.numGames + 1,
            gameRank: params.gameRank,
            creator: msg.sender,
            minPlayerCnt: params.minPlayerCnt,
            maxPlayerCnt: params.maxPlayerCnt,
            gameMaster: params.gameMaster,
            nTurns: params.nTurns,
            voteCredits: params.voteCredits,
            minGameTime: params.minGameTime,
            timePerTurn: params.timePerTurn,
            timeToJoin: params.timeToJoin,
            metadata: params.metadata
        });

        uint256 gameId = createGame(newGameParams, requirements);
        gameId.openRegistration();
        emit RequirementsConfigured(gameId, requirements);
    }

    /**
     * @dev Sets the join requirements for a specific game.
     * Only the game creator can call this function.
     * The game must be in the pre-registration stage.
     *
     * @param gameId The ID of the game.
     * @param config The configuration position for the join requirements.
     */
    function setJoinRequirements(uint256 gameId, LibCoinVending.ConfigPosition memory config) public {
        gameId.enforceIsGameCreator(msg.sender);
        gameId.enforceIsPreRegistrationStage();
        LibCoinVending.configure(bytes32(gameId), config);
        emit IRankifyInstance.RequirementsConfigured(gameId, config);
    }

    /**
     * @dev Handles a player quitting a game with the provided game ID. `gameId` is the ID of the game. `player` is the address of the player.
     * @param gameId The ID of the game.
     * @param player The address of the player.
     * @notice This function:
     *         - Refunds the coins for `player` in the game with `gameId`.
     *         - Emits a _PlayerLeft_ event.
     */
    function onPlayerQuit(uint256 gameId, address player) private {
        LibCoinVending.refund(bytes32(gameId), player);
        emit PlayerLeft(gameId, player);
    }

    /**
     * @dev Cancels a game with the provided game ID. `gameId` is the ID of the game.
     * @param gameId The ID of the game.
     * @notice This function:
     *         - Calls the `enforceIsGameCreator` function with `msg.sender`.
     *         - Cancels the game.
     *         - Emits a _GameClosed_ event.
     * @custom:security nonReentrant
     */
    function cancelGame(uint256 gameId) public nonReentrant {
        gameId.enforceIsGameCreator(msg.sender);
        gameId.cancelGame(onPlayerQuit);
        emit GameClosed(gameId);
    }

    /**
     * @dev Allows a player to leave a game with the provided game ID. `gameId` is the ID of the game.
     * @param gameId The ID of the game.
     * @notice This function:
     *         - Calls the `quitGame` function with `msg.sender`, `true`, and `onPlayerQuit`.
     * @custom:security nonReentrant
     */
    function leaveGame(uint256 gameId) public nonReentrant {
        gameId.quitGame(msg.sender, onPlayerQuit);
    }

    /**
     * @dev Opens registration for a game with the provided game ID. `gameId` is the ID of the game.
     * @param gameId The ID of the game.
     * @notice This function:
     *         - Calls the `enforceIsGameCreator` function with `msg.sender`.
     *         - Calls the `enforceIsPreRegistrationStage` function.
     *         - Calls the `openRegistration` function.
     *         - Emits a _RegistrationOpen_ event.
     */
    function openRegistration(uint256 gameId) public {
        gameId.enforceGameExists();
        gameId.enforceIsGameCreator(msg.sender);
        gameId.enforceIsPreRegistrationStage();
        gameId.openRegistration();
        emit RegistrationOpen(gameId);
    }

    /**
     * @dev Allows a player to join a game with the provided game ID. `gameId` is the ID of the game.
     * @param gameId The ID of the game.
     * @param gameMasterSignature The ECDSA signature of the game master.
     * @param gmCommitment The gmCommitment to the player signed by the game master.
     * @param deadline The deadline for the player to sign the gmCommitment.
     * @notice This function:
     *         - Calls the `joinGame` function with `msg.sender`.
     *         - Calls the `fund` function with `bytes32(gameId)`.
     *         - Emits a _PlayerJoined_ event.
     * @custom:security nonReentrant
     */
    function joinGame(
        uint256 gameId,
        bytes memory gameMasterSignature,
        bytes32 gmCommitment,
        uint256 deadline,
        string memory voterPubKey
    ) public payable nonReentrant {
        require(block.timestamp < deadline, "Signature deadline has passed");
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    keccak256(
                        "AttestJoiningGame(address participant,uint256 gameId,bytes32 gmCommitment,uint256 deadline,bytes32 participantPubKeyHash)"
                    ),
                    msg.sender,
                    gameId,
                    gmCommitment,
                    deadline,
                    keccak256(abi.encodePacked(voterPubKey))
                )
            )
        );
        gameId.joinGame(msg.sender, gameMasterSignature, digest);
        LibCoinVending.fund(bytes32(gameId));
        emit PlayerJoined(gameId, msg.sender, gmCommitment, voterPubKey);
    }

    /**
     * @dev Starts a game with the provided game ID early. `gameId` is the ID of the game.
     * @param gameId The ID of the game.
     * @param permutationCommitment The commitment to the permutation issued by the game master.
     * @notice This function:
     *         - Calls the `enforceGameExists` function.
     *         - Calls the `startGameEarly` function.
     *         - Emits a _GameStarted_ event.
     */
    function startGame(uint256 gameId, uint256 permutationCommitment) public {
        gameId.enforceGameExists();
        gameId.startGameEarly();
        LibRankify.GameState storage game = gameId.getGameState();
        game.permutationCommitment = permutationCommitment;
        emit GameStarted(gameId);
    }

    function onERC1155Received(
        address operator,
        address,
        uint256,
        uint256,
        bytes calldata
    ) public view override returns (bytes4) {
        LibRankify.enforceIsInitialized();
        if (operator == address(this)) {
            return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
        }
        return bytes4("");
    }

    function onERC1155BatchReceived(
        address operator,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external view override returns (bytes4) {
        LibRankify.enforceIsInitialized();
        if (operator == address(this)) {
            return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
        }
        return bytes4("");
    }

    function onERC721Received(
        address operator,
        address,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        LibRankify.enforceIsInitialized();
        if (operator == address(this)) {
            return IERC721Receiver.onERC721Received.selector;
        }
        return bytes4("");
    }

    /**
     * @dev Returns the current state of the contract
     * @return LibRankify.InstanceState The current state of the contract
     */
    function getContractState() public pure returns (LibRankify.InstanceState memory) {
        LibRankify.InstanceState memory state = LibRankify.instanceState();
        return state;
    }

    /**
     * @dev Returns the current turn of the game with the specified ID
     * @param gameId The ID of the game
     * @return uint256 The current turn of the game
     */
    function getTurn(uint256 gameId) public view returns (uint256) {
        return gameId.getTurn();
    }

    /**
     * @dev Returns the game master of the game with the specified ID
     * @param gameId The ID of the game
     * @return address The game master of the game
     */
    function getGM(uint256 gameId) public view returns (address) {
        return gameId.getGM();
    }

    /**
     * @dev Returns the scores of the game with the specified ID
     * @param gameId The ID of the game
     * @return address[] The players in the game
     * @return uint256[] The scores of the players
     */
    function getScores(uint256 gameId) public view returns (address[] memory, uint256[] memory) {
        return gameId.getScores();
    }

    /**
     * @dev Returns whether the game with the specified ID is in overtime
     * @param gameId The ID of the game
     * @return bool Whether the game is in overtime
     */
    function isOvertime(uint256 gameId) public view returns (bool) {
        return gameId.isOvertime();
    }

    /**
     * @dev Returns whether the game with the specified ID is over
     * @param gameId The ID of the game
     * @return bool Whether the game is over
     */
    function isGameOver(uint256 gameId) public view returns (bool) {
        return gameId.isGameOver();
    }

    /**
     * @dev Returns the game ID of the game that the specified player is in
     * @param player The address of the player
     * @return uint256 The ID of the game
     */
    function getPlayersGames(address player) public view returns (uint256[] memory) {
        return LibTBG.getPlayersGames(player);
    }

    /**
     * @dev Returns whether the specified player is in the specified game
     * @param gameId The ID of the game
     * @param player The address of the player
     * @return bool Whether the player is in the game
     */
    function isPlayerInGame(uint256 gameId, address player) public view returns (bool) {
        return gameId.isPlayerInGame(player);
    }

    /**
     * @dev Returns whether the game with the specified ID is in the last turn
     * @param gameId The ID of the game
     * @return bool Whether the game is in the last turn
     */
    function isLastTurn(uint256 gameId) public view returns (bool) {
        return gameId.isLastTurn();
    }

    /**
     * @dev Returns whether registration is open for the game with the specified ID
     * @param gameId The ID of the game
     * @return bool Whether registration is open
     */
    function isRegistrationOpen(uint256 gameId) public view returns (bool) {
        return gameId.isRegistrationOpen();
    }

    /**
     * @dev Returns the creator of the game with the specified ID
     * @param gameId The ID of the game
     * @return address The creator of the game
     */
    function gameCreator(uint256 gameId) public view returns (address) {
        return gameId.getGameState().createdBy;
    }

    /**
     * @dev Returns the rank of the game with the specified ID
     * @param gameId The ID of the game
     * @return uint256 The rank of the game
     */
    function getGameRank(uint256 gameId) public view returns (uint256) {
        return gameId.getGameState().rank;
    }

    /**
     * @dev Estimates the price of a game with the specified minimum game time
     * @param minGameTime The minimum game time
     * @return uint256 The estimated price of the game
     */
    function estimateGamePrice(uint128 minGameTime) public pure returns (uint256) {
        LibRankify.InstanceState memory state = LibRankify.instanceState();
        return LibRankify.getGamePrice(minGameTime, state.commonParams);
    }

    /**
     * @dev Returns the players in the game with the specified ID
     * @param gameId The ID of the game
     * @return address[] The players in the game
     */
    function getPlayers(uint256 gameId) public view returns (address[] memory) {
        return gameId.getPlayers();
    }

    /**
     * @dev Returns whether the game with the specified ID can be started early
     * @param gameId The ID of the game
     * @return bool Whether the game can be started early
     */
    function canStartGame(uint256 gameId) public view returns (bool) {
        return gameId.canStartEarly();
    }

    /**
     * @dev Returns whether the turn can be ended early for the game with the specified ID
     * @param gameId The ID of the game
     * @return bool Whether the turn can be ended early
     */
    function canEndTurn(uint256 gameId) public view returns (bool) {
        return gameId.canEndTurnEarly();
    }

    /**
     * @dev Returns whether the player has completed their turn in the game with the specified ID
     * @param gameId The ID of the game
     * @param player The address of the player
     * @return bool Whether the player has completed their turn
     */
    function isPlayerTurnComplete(uint256 gameId, address player) public view returns (bool) {
        return gameId.isPlayerTurnComplete(player);
    }

    /**
     * @dev Returns the voted array for the game with the specified ID
     * @param gameId The ID of the game
     * @return bool[] The voted array
     */
    function getPlayerVotedArray(uint256 gameId) public view returns (bool[] memory) {
        LibRankify.GameState storage game = gameId.getGameState();
        address[] memory players = gameId.getPlayers();
        bool[] memory playerVoted = new bool[](players.length);
        for (uint256 i = 0; i < players.length; ++i) {
            playerVoted[i] = game.playerVoted[players[i]];
        }
        return playerVoted;
    }

    /**
     * @dev Returns the players who have moved in the game with the specified ID
     * @param gameId The ID of the game
     * @return bool[] The players who have moved
     * @return uint256 The number of players who have moved
     */
    function getPlayersMoved(uint256 gameId) public view returns (bool[] memory, uint256) {
        LibTBG.State storage game = gameId._getState();
        address[] memory players = gameId.getPlayers();
        bool[] memory playersMoved = new bool[](players.length);
        for (uint256 i = 0; i < players.length; ++i) {
            playersMoved[i] = game.madeMove[players[i]];
        }
        return (playersMoved, game.numPlayersMadeMove);
    }

    function isActive(uint256 gameId, address player) public view returns (bool) {
        return gameId.isActive(player);
    }

    function exitRankToken(uint256 rankId, uint256 amount) external {
        require(amount != 0, "cannot specify zero exit amount");
        LibRankify.InstanceState storage state = LibRankify.instanceState();
        LibRankify.CommonParams storage commons = state.commonParams;
        IRankToken rankContract = IRankToken(commons.rankTokenAddress);
        DistributableGovernanceERC20 tokenContract = DistributableGovernanceERC20(commons.derivedToken);
        uint256 _toMint = amount * (commons.principalCost * (commons.minimumParticipantsInCircle ** rankId));
        rankContract.burn(msg.sender, rankId, amount);
        tokenContract.mint(msg.sender, _toMint);
        emit RankTokenExited(msg.sender, rankId, amount, _toMint);
    }

    /**
     * @dev Returns the winner of the game with the specified ID
     * @param gameId The ID of the game
     * @return address The winner of the game
     */
    function gameWinner(uint256 gameId) public view returns (address) {
        return gameId.getGameState().winner;
    }


}
