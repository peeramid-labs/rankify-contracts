// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";
import {IRankToken} from "../interfaces/IRankToken.sol";
import "../tokens/Rankify.sol";
import {LibQuadraticVoting} from "./LibQuadraticVoting.sol";
import {LibRankifyTurnManager} from "./LibRankifyTurnManager.sol";
import "hardhat/console.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import {IErrors} from "../interfaces/IErrors.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
/**
 * @title LibRankify
 * @dev Core library for the Rankify protocol that handles game state management, voting, and player interactions
 * @author Peeramid Labs, 2024
 */
library LibRankify {
    using LibTBG for LibTBG.Instance;
    using LibTBG for uint256;
    using LibTBG for LibTBG.Settings;
    using LibTBG for LibTBG.State;
    using LibQuadraticVoting for LibQuadraticVoting.qVotingStruct;

    /**
     * @dev Main state structure for a Rankify instance
     * @param numGames Total number of games created in this instance
     * @param contractInitialized Whether the contract has been properly initialized
     * @param commonParams Common parameters shared across all games in this instance
     */
    struct InstanceState {
        uint256 numGames;
        bool contractInitialized;
        CommonParams commonParams;
    }

    /**
     * @dev Common parameters shared across all games in a Rankify instance
     * @param principalCost Base cost for creating a game
     * @param principalTimeConstant Time constant used for game duration calculations
     * @param gamePaymentToken Address of the token used for game payments
     * @param rankTokenAddress Address of the rank token contract
     * @param beneficiary Address that receives a portion of game fees
     * @param minimumParticipantsInCircle Minimum number of participants required to join a game
     */
    struct CommonParams {
        uint256 principalCost;
        uint96 principalTimeConstant;
        address gamePaymentToken;
        address rankTokenAddress;
        address beneficiary;
        uint256 minimumParticipantsInCircle;
        address derivedToken;
        address proposalIntegrityVerifier;
        address poseidon5;
        address poseidon6;
        address poseidon2;
    }

    /**
     * @dev Comprehensive state structure for an individual game
     * @param rank Required rank level for participation
     * @param minGameTime Minimum duration the game must run
     * @param createdBy Address of the game creator
     * @param numOngoingProposals Number of active proposals
     * @param numPrevProposals Number of completed proposals
     * @param numCommitments Number of vote commitments received
     * @param numVotesThisTurn Vote count in current turn
     * @param numVotesPrevTurn Vote count from previous turn
     * @param voting Quadratic voting state for this game
     */
    struct GameState {
        uint256 rank;
        string metadata;
        uint256 minGameTime;
        address createdBy;
        uint256 numOngoingProposals;
        uint256 numPrevProposals;
        uint256 numCommitments;
        uint256 numVotesThisTurn;
        uint256 numVotesPrevTurn;
        uint256 permutationCommitment;
        LibQuadraticVoting.qVotingStruct voting;
        mapping(uint256 => string) ongoingProposals; //Previous Turn Proposals (These are being voted on)
        mapping(address => uint256) proposalCommitment;
        mapping(address => bytes32) ballotHashes;
        mapping(address => bool) playerVoted;
        address winner;
    }

    /**
     * @dev Compares two strings for equality. `a` and `b` are the strings to compare.
     *
     * Returns:
     *
     * - `true` if the strings are equal, `false` otherwise.
     */
    function compareStrings(string memory a, string memory b) public pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }

    /**
     * @dev Returns the game storage for the given game ID. `gameId` is the ID of the game.
     *
     * Returns:
     *
     * - The game storage for `gameId`.
     */
    function getGameState(uint256 gameId) public view returns (GameState storage game) {
        bytes32 position = LibTBG.getGameDataStorage(gameId);
        assembly {
            game.slot := position
        }
    }

    /**
     * @dev Returns the Rankify InstanceSettings storage.
     *
     * Returns:
     *
     * - The instanceState storage.
     */
    function instanceState() internal pure returns (InstanceState storage contractState) {
        bytes32 position = LibTBG.getDataStorage();
        assembly {
            contractState.slot := position
        }
    }

    bytes32 public constant _PROPOSAL_PROOF_TYPEHASH =
        keccak256("signProposalByGM(uint256 gameId,uint256 turn,bytes32 proposalNHash,string encryptedProposal)");
    bytes32 public constant _VOTE_PROOF_TYPEHASH =
        keccak256("signVote(uint256 vote1,uint256 vote2,uint256 vote3,uint256 gameId,uint256 turn,bytes32 salt)");
    bytes32 public constant _VOTE_SUBMIT_PROOF_TYPEHASH =
        keccak256("publicSignVote(uint256 gameId,uint256 turn,bytes32 vote1,bytes32 vote2,bytes32 vote3)");

    /**
     * @dev Ensures that the contract is initialized.
     *
     * Requirements:
     *
     * - The contract must be initialized.
     */
    function enforceIsInitialized() public view {
        InstanceState storage settings = instanceState();
        require(settings.contractInitialized, "onlyInitialized");
    }

    /**
     * @dev Ensures that the game with the given ID exists. `gameId` is the ID of the game.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     */
    function enforceGameExists(uint256 gameId) public view {
        enforceIsInitialized();
        require(gameId.gameExists(), "game not found");
    }

    struct NewGameParams {
        uint256 gameId;
        uint256 gameRank;
        address creator;
        uint256 minPlayerCnt;
        uint256 maxPlayerCnt;
        uint256 voteCredits;
        address gameMaster;
        uint96 nTurns;
        uint128 minGameTime;
        uint128 timePerTurn;
        uint128 timeToJoin;
        string metadata;
        // ToDo: It must list gameKey for Game master and game master signature, committing to serve the game
    }

    function getGamePrice(uint128 minGameTime, CommonParams memory commonParams) public pure returns (uint256) {
        return
            Math.mulDiv(
                uint256(commonParams.principalCost),
                uint256(commonParams.principalTimeConstant),
                uint256(minGameTime)
            );
    }

    /**
     * @dev Creates a new game with the given parameters. `gameId` is the ID of the new game. `gameMaster` is the address of the game master. `gameRank` is the rank of the game. `creator` is the address of the creator of the game.
     *
     * Requirements:
     *
     * - The game with `gameId` must not already exist.
     * - `gameRank` must not be 0.
     * - If the game price is not 0, the `creator` must have approved this contract to transfer the game price amount of the game payment token on their behalf.
     *
     * Modifies:
     *
     * - Creates a new game with `gameId`.
     * - Transfers the game price amount of the game payment token from `creator` to this contract.
     * - Sets the payments balance of the game to the game price.
     * - Sets the creator of the game to `creator`.
     * - Increments the number of games.
     * - Sets the rank of the game to `gameRank`.
     * - Mints new rank tokens.
     */
    function newGame(NewGameParams memory params) public {
        // address signer = ECDSA.recover(digest, gameMasterSignature);
        //TODO: add this back in start game to verify commitment from game master
        // require(
        //     params.gameMaster == signer,
        //     IErrors.invalidECDSARecoverSigner(digest, "LibRankify::newGame->invalid signature")
        // );

        enforceIsInitialized();
        CommonParams storage commonParams = instanceState().commonParams;

        require(params.minGameTime > 0, "LibRankify::newGame->Min game time zero");
        require(params.nTurns > 1, IRankifyInstance.invalidTurnCount(params.nTurns));

        LibTBG.Settings memory newSettings = LibTBG.Settings({
            timePerTurn: params.timePerTurn,
            maxPlayerCnt: params.maxPlayerCnt,
            minPlayerCnt: params.minPlayerCnt,
            timeToJoin: params.timeToJoin,
            maxTurns: params.nTurns * 2,
            voteCredits: params.voteCredits,
            gameMaster: params.gameMaster,
            implementationStoragePointer: bytes32(0)
        });

        InstanceState storage state = instanceState();

        params.gameId.createGame(newSettings); // This will enforce game does not exist yet
        GameState storage game = getGameState(params.gameId);
        game.voting = LibQuadraticVoting.precomputeValues(params.voteCredits, params.maxPlayerCnt);
        game.metadata = params.metadata;
        require(
            SignedMath.abs(int256(uint256(params.minGameTime)) - int256(uint256(commonParams.principalTimeConstant))) <
                uint256(commonParams.principalTimeConstant) * 2 ** 16,
            "Min game time out of bounds"
        );
        require(commonParams.minimumParticipantsInCircle <= params.minPlayerCnt, "Min player count too low");
        uint256 principalGamePrice = getGamePrice(params.minGameTime, commonParams);
        uint256 burnAmount = Math.mulDiv(principalGamePrice, 9, 10);
        uint256 daoAmount = principalGamePrice - burnAmount;
        address beneficiary = commonParams.beneficiary;

        Rankify(commonParams.gamePaymentToken).burnFrom(params.creator, burnAmount);
        Rankify(commonParams.gamePaymentToken).transferFrom(params.creator, beneficiary, daoAmount);

        require(params.gameRank != 0, IRankifyInstance.RankNotSpecified());

        game.createdBy = params.creator;
        state.numGames += 1;
        game.rank = params.gameRank;
        game.minGameTime = params.minGameTime;

        IRankToken rankTokenContract = IRankToken(state.commonParams.rankTokenAddress);
        rankTokenContract.mint(address(this), 1, params.gameRank + 1, "");
    }

    /**
     * @dev Ensures that the candidate is the creator of the game with the given ID. `gameId` is the ID of the game. `candidate` is the address of the candidate.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - `candidate` must be the creator of the game.
     */
    function enforceIsGameCreator(uint256 gameId, address candidate) public view {
        enforceGameExists(gameId);
        GameState storage game = getGameState(gameId);
        require(game.createdBy == candidate, "Only game creator");
    }

    /**
     * @dev Ensures that the candidate is the game master of the game with the given ID. `gameId` is the ID of the game. `candidate` is the address of the candidate.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - `candidate` must be the game master of the game.
     */
    function enforceIsGM(uint256 gameId, address candidate) public view {
        enforceGameExists(gameId);
        require(gameId.getGM() == candidate, "Only game master");
    }

    /**
     * @dev Locks the rank token of the player. `player` is the address of the player. `gameRank` is the rank of the game. `rankTokenAddress` is the address of the rank token contract.
     *
     * Requirements:
     *
     * - `RankTokenAddress` must support `IRankToken` interface
     *
     * Modifies:
     *
     * - Locks `gameRank` rank of `player` in the rank token contract.
     */
    function _fulfillRankRq(address player, uint256 gameRank, address rankTokenAddress) private {
        IRankToken rankToken = IRankToken(rankTokenAddress);
        rankToken.lock(player, gameRank, 1);
    }

    /**
     * @dev Allows a player to join a game. `gameId` is the ID of the game. `player` is the address of the player.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     * - If the join game price is not 0, the `player` must have approved this contract to transfer the join game price amount of the game payment token on their behalf.
     *
     * Modifies:
     *
     * - Transfers the join game price amount of the game payment token from `player` to this contract.
     * - Increases the payments balance of the game by the join game price.
     * - Adds `player` to the game.
     */
    function joinGame(uint256 gameId, address player, bytes memory gameMasterSignature, bytes32 digest) public {
        enforceGameExists(gameId);
        fulfillRankRq(gameId, player);
        gameId.addPlayer(player);
        address signer = ECDSA.recover(digest, gameMasterSignature);
        require(
            gameId.getGM() == signer,
            IErrors.invalidECDSARecoverSigner(digest, "LibRankify::joinGame->invalid signature")
        );
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
     * - Emits rank rewards for the game.
     * - Removes and unlocks each player from the game.
     * - Calls `playersGameEndedCallback` for each player.
     * - Transfers the game's balance to `beneficiary`.
     *
     * Returns:
     *
     * - The final scores of the game.
     */
    function closeGame(
        uint256 gameId,
        function(uint256, address) playersGameEndedCallback
    ) internal returns (address[] memory, uint256[] memory) {
        enforceGameExists(gameId);

        // Get game state and check minimum time
        GameState storage game = getGameState(gameId);
        LibTBG.State storage tbgState = gameId._getState();
        require(
            block.timestamp - tbgState.startedAt >= game.minGameTime,
            "Game duration less than minimum required time"
        );

        (, uint256[] memory finalScores) = gameId.getScores();
        address[] memory players = gameId.getPlayers();
        for (uint256 i = 0; i < players.length; ++i) {
            removeAndUnlockPlayer(gameId, players[i]);
            playersGameEndedCallback(gameId, players[i]);
        }
        emitRankRewards(gameId, gameId.getLeaderBoard());
        return (players, finalScores);
    }

    /**
     * @dev Allows a player to quit a game. `gameId` is the ID of the game. `player` is the address of the player. `slash` is a boolean indicating whether to slash the player's payment refund. `onPlayerLeftCallback` is a callback function to call when the player leaves.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     *
     * Modifies:
     *
     * - If the join game price is not 0, transfers a refund to `player` and decreases the game's payments balance by the refund amount.
     * - Removes and unlocks `player` from the game.
     * - Calls `onPlayerLeftCallback` for `player`.
     */
    function quitGame(uint256 gameId, address player, function(uint256, address) onPlayerLeftCallback) internal {
        removeAndUnlockPlayer(gameId, player); // this will throw if game has started or doesn't exist
        onPlayerLeftCallback(gameId, player);
    }

    /**
     * @dev Cancels the game with the given ID, refunds half of the game's payment to the game creator, and transfers the remaining balance to the beneficiary. `gameId` is the ID of the game. `onPlayerLeftCallback` is a callback function to call for each player when they leave. `beneficiary` is the address to transfer the remaining balance to.
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
     */ function cancelGame(uint256 gameId, function(uint256, address) onPlayerLeftCallback) internal {
        // Cancel the game for each player
        address[] memory players = gameId.getPlayers();
        for (uint256 i = 0; i < players.length; ++i) {
            quitGame(gameId, players[i], onPlayerLeftCallback); //this will throw if game has started or doesn't exist
        }

        // Delete the game
        gameId.deleteGame();
    }

    /**
     * @dev Fulfills the rank requirement for a player to join a game. `gameId` is the ID of the game. `player` is the address of the player.
     *
     * Modifies:
     *
     * - Locks the rank token(s) of `player` in the rank token contract.
     */
    function fulfillRankRq(uint256 gameId, address player) public {
        InstanceState storage instance = instanceState();
        GameState storage game = getGameState(gameId);
        if (game.rank > 1) {
            _fulfillRankRq(player, game.rank, instance.commonParams.rankTokenAddress);
        }
    }

    /**
     * @dev Emits rank rewards to the top three addresses in the leaderboard. `gameId` is the ID of the game. `leaderboard` is an array of addresses representing the leaderboard sorted in descending order. `rankTokenAddress` is the address of the rank token contract.
     *
     * Modifies:
     *
     * - Transfers rank tokens from this contract to the top three addresses in the leaderboard.
     */
    function emitRankReward(uint256 gameId, address[] memory leaderboard, address rankTokenAddress) private {
        GameState storage game = getGameState(gameId);
        IRankToken rankTokenContract = IRankToken(rankTokenAddress);
        if (game.rank > 1) {
            rankTokenContract.burn(leaderboard[0], game.rank, 1);
        }
        rankTokenContract.safeTransferFrom(address(this), leaderboard[0], game.rank + 1, 1, "");
        game.winner = leaderboard[0];
    }

    /**
     * @dev Emits rank rewards to the top addresses in the leaderboard for each rank in the game. `gameId` is the ID of the game. `leaderboard` is an array of addresses representing the leaderboard.
     *
     * Modifies:
     *
     * - Calls `emitRankReward` for the main rank and each additional rank in the game.
     */
    function emitRankRewards(uint256 gameId, address[] memory leaderboard) public {
        InstanceState storage instance = LibRankify.instanceState();
        emitRankReward(gameId, leaderboard, instance.commonParams.rankTokenAddress);
    }

    /**
     * @dev Releases a rank token for a player with a specific game rank. `player` is the address of the player. `gameRank` is the game rank of the player. `rankTokenAddress` is the address of the rank token contract.
     *
     * Modifies:
     *
     * - Unlocks one rank token of `gameRank` for `player` in the rank token contract.
     */
    function _releaseRankToken(address player, uint256 gameRank, address rankTokenAddress) private {
        IRankToken rankToken = IRankToken(rankTokenAddress);
        rankToken.unlock(player, gameRank, 1);
    }

    /**
     * @dev Removes a player from a game and unlocks their rank tokens. `gameId` is the ID of the game. `player` is the address of the player to be removed.
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     *
     * Modifies:
     *
     * - Removes `player` from the game.
     * - If the game rank is greater than 1, unlocks the game rank token for `player` in the rank token contract.
     */
    function removeAndUnlockPlayer(uint256 gameId, address player) public {
        enforceGameExists(gameId);
        gameId.removePlayer(player); //This will throw if game is in the process
        InstanceState storage instance = instanceState();
        GameState storage game = getGameState(gameId);
        if (game.rank > 1) {
            _releaseRankToken(player, game.rank, instance.commonParams.rankTokenAddress);
        }
    }

    /**
     * @dev Tries to make a move for a player in a game. `gameId` is the ID of the game. `player` is the address of the player.
     * The "move" is considered to be a state when player has made all actions he could in the given STAGE (proposing or voting).
     *
     * Requirements:
     *
     * - The game with `gameId` must exist.
     *
     * Modifies:
     *
     * - If the player has not completed their action for the current stage (proposal or vote), does not make a move and returns `false`.
     * - Otherwise, makes a move for `player` in LibTBG and returns `true`.
     */
    function tryPlayerMove(uint256 gameId, address player) public returns (bool) {
        uint256 turn = gameId.getTurn();
        GameState storage game = getGameState(gameId);
        bool actionCompleted = false;

        if (LibRankifyTurnManager.isProposingStage(gameId)) {
            // In proposing stage, action is complete if a proposal commitment exists.
            if (game.proposalCommitment[player] != 0) {
                actionCompleted = true;
            }
        } else if (LibRankifyTurnManager.isVotingStage(gameId)) {
            // In voting stage, action is complete if player has voted.
            // Also ensure there are enough proposals from the current round to vote on.
            // Note: game.numOngoingProposals should be updated by the end of the proposing stage.
            if (game.numOngoingProposals >= game.voting.minQuadraticPositions && game.playerVoted[player]) {
                actionCompleted = true;
            }
            // If not enough proposals, players can't vote, effectively their "move" for voting stage is vacuously true if they already proposed.
            // However, the game should ideally not advance to a voting stage if there are no proposals.
            // This scenario (not enough proposals for voting stage) should be handled by canEndProposingStage logic.
            else if (game.numOngoingProposals < game.voting.minQuadraticPositions) {
                // If not enough proposals, no one can vote. Consider action complete if they proposed in the prior stage.
                // This assumes that canEndProposingStage allowed advancement.
                // This might be too complex here. Let's simplify: if it's voting, you must vote if possible.
                // The game advancement logic should handle cases of insufficient proposals.
                // So, if it's a voting stage and not enough proposals, no one *can* vote. They haven't made a "voting move".
                // But canEndVotingStage should reflect this.
                // For now, let's stick to: if it's voting stage, playerVoted is the criteria.
                // The check game.numOngoingProposals >= game.voting.minQuadraticPositions is critical for playerVoted to be meaningful.
            }
        }

        if (actionCompleted) {
            gameId.playerMove(player); // Call LibTBG.playerMove
            return true;
        }
        return false;
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
        uint256 gameId,
        uint256[][] memory votesRevealed
    ) public returns (uint256[] memory, uint256[] memory) {
        address[] memory players = gameId.getPlayers();
        uint256[] memory scores = new uint256[](players.length);
        bool[] memory playerVoted = new bool[](players.length);
        GameState storage game = getGameState(gameId);
        // Convert mapping to array to pass it to libQuadratic
        for (uint256 i = 0; i < players.length; ++i) {
            playerVoted[i] = gameId._getState().isActive[players[i]];
        }
        uint256[] memory roundScores = game.voting.tallyVotes(votesRevealed, playerVoted);
        for (uint256 playerIdx = 0; playerIdx < players.length; playerIdx++) {
            //for each player
            if (game.proposalCommitment[players[playerIdx]] != 0) {
                //if player proposal exists
                scores[playerIdx] = gameId.getScore(players[playerIdx]) + roundScores[playerIdx];
                gameId.setScore(players[playerIdx], scores[playerIdx]);
            } else {
                //Player did not propose
                // TODO: implement tests for this
                // require(roundScores[playerIdx] == 0, "LibRankify->calculateScores: player got votes without proposing");
            }
        }
        return (scores, roundScores);
    }
}
