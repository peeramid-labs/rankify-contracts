// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";
import {IRankToken} from "../interfaces/IRankToken.sol";
import "../tokens/Rankify.sol";
import {LibQuadraticVoting} from "./LibQuadraticVoting.sol";
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

    enum JoinStatus {
        JoinedDirectly,
        AddedToWaitlist,
        AlreadyInGame,
        AlreadyWaitlisted,
        GameNotJoinable, // Covers game over, or registration not open and game not started
        GameFull,
        // InvalidSignature // Signature validation will be handled by the facet before calling internal logic
        RankRequirementsNotMet // Placeholder if fulfillRankRq could fail and we want a specific status
    }

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
     * @param beneficiary Address that receives game fees
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
     * @param numCommitments Number of players who have committed a proposal in the current proposing stage
     * @param numVotes Number of votes cast in the current voting stage
     * @param permutationCommitment Commitment related to the permutation of ongoingProposals, set at end of proposing stage
     * @param voting Quadratic voting state for this game
     * @param waitlist Array of addresses representing the waitlist for the game
     * @param isWaitlisted Mapping of addresses to booleans indicating whether a player is waitlisted
     */
    struct GameState {
        uint256 rank;
        uint256 timePerTurnVoting;
        uint256 timePerTurnProposing;
        string metadata;
        uint256 minGameTime;
        address createdBy;
        uint256 numCommitments; // Number of players who have committed a proposal in the current proposing stage
        uint256 numVotes; // Number of votes cast in the current voting stage
        uint256 permutationCommitment; // Commitment related to the permutation of ongoingProposals, set at end of proposing stage
        LibQuadraticVoting.qVotingStruct voting;
        mapping(uint256 => string) ongoingProposals; // Proposals for the current round (submitted in proposing stage, voted on in voting stage)
        mapping(address => uint256) proposalCommitment; // Player's commitment to their proposal
        mapping(address => bytes32) ballotHashes; // Player's committed ballot hash
        mapping(address => bool) playerVoted; // Has player voted in the current voting stage
        address winner;
        // --- Waitlist Data ---
        address[] waitlist;
        mapping(address => bool) isWaitlisted;
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
        uint256 votePhaseDuration;
        uint256 proposingPhaseDuration;
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
        require(params.nTurns > 0, IRankifyInstance.invalidTurnCount(params.nTurns));
        require(params.votePhaseDuration > 0, "LibRankify::newGame->Time per turn voting zero");
        require(params.proposingPhaseDuration > 0, "LibRankify::newGame->Time per turn proposing zero");
        require(
            params.votePhaseDuration + params.proposingPhaseDuration == params.timePerTurn,
            "LibRankify::newGame->Time per turn voting and proposing must sum to time per turn"
        );
        uint256[] memory phases = new uint256[](2);
        phases[0] = params.votePhaseDuration;
        phases[1] = params.proposingPhaseDuration;
        LibTBG.Settings memory newSettings = LibTBG.Settings({
            timePerTurn: params.timePerTurn,
            maxPlayerCnt: params.maxPlayerCnt,
            minPlayerCnt: params.minPlayerCnt,
            timeToJoin: params.timeToJoin,
            maxTurns: params.nTurns,
            voteCredits: params.voteCredits,
            gameMaster: params.gameMaster,
            implementationStoragePointer: bytes32(0),
            turnPhaseDurations: phases
        });

        InstanceState storage state = instanceState();

        params.gameId.createGame(newSettings); // This will enforce game does not exist yet
        GameState storage game = getGameState(params.gameId);
        game.voting = LibQuadraticVoting.precomputeValues(params.voteCredits, params.minPlayerCnt);
        game.metadata = params.metadata;
        game.timePerTurnVoting = params.votePhaseDuration;
        game.timePerTurnProposing = params.proposingPhaseDuration;
        require(
            SignedMath.abs(int256(uint256(params.minGameTime)) - int256(uint256(commonParams.principalTimeConstant))) <
                uint256(commonParams.principalTimeConstant) * 2 ** 16,
            "Min game time out of bounds"
        );
        require(commonParams.minimumParticipantsInCircle <= params.minPlayerCnt, "Min player count too low");
        uint256 gamePrice = getGamePrice(params.minGameTime, commonParams);
        address beneficiary = commonParams.beneficiary;

        require(params.gameRank != 0, IRankifyInstance.RankNotSpecified());

        game.createdBy = params.creator;
        state.numGames += 1;
        game.rank = params.gameRank;
        game.minGameTime = params.minGameTime;

        Rankify(commonParams.gamePaymentToken).transferFrom(params.creator, beneficiary, gamePrice);
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
        GameState storage game = getGameState(gameId);
        bool actionCompleted = false;

        if (isProposingStage(gameId)) {
            // In proposing stage, action is complete if a proposal commitment exists.
            if (game.proposalCommitment[player] != 0) {
                actionCompleted = true;
            }
        } else if (isVotingStage(gameId)) {
            // In voting stage, action is complete if player has voted, AND there are enough proposals.
            if (game.numCommitments < game.voting.minQuadraticPositions || game.playerVoted[player]) {
                actionCompleted = true;
            }
        }

        if (actionCompleted) {
            gameId.playerMove(player); // Call LibTBG.playerMove
            return true;
        }
        return false;
    }

    /**
     * @dev Checks if the current proposing stage can end.
     * A proposing stage can end if it's a proposing stage and all players have made their move (committed proposals)
     * or the time for the stage has run out, subject to minimum proposal and stale game rules.
     * Returns a status indicating whether and how the proposing stage can end.
     */
    function canEndProposing(uint256 gameId) public view returns (IRankifyInstance.ProposingEndStatus) {
        enforceGameExists(gameId);
        if (!isProposingStage(gameId)) {
            return IRankifyInstance.ProposingEndStatus.NotProposingStage;
        }
        LibTBG.Instance storage tbgInstanceState = LibTBG._getInstance(gameId);
        LibTBG.State storage tbgState = tbgInstanceState.state;
        LibTBG.Settings storage tbgSettings = tbgInstanceState.settings; // To get phase duration
        GameState storage game = getGameState(gameId);

        bool canTransitionBasicTBG = gameId.canTransitionPhaseEarly();

        if (canTransitionBasicTBG) {
            // Check if transition is due to timeout or all players moved
            bool allPlayersMoved = tbgState.numPlayersMadeMove == game.numCommitments;
            bool phaseTimedOut = block.timestamp >= tbgState.phaseStartedAt + tbgSettings.turnPhaseDurations[0]; // Proposing is phase 0

            if (game.numCommitments >= game.voting.minQuadraticPositions) {
                return IRankifyInstance.ProposingEndStatus.Success;
            }
            // If not enough proposals:
            bool minGameTimeReached = block.timestamp >= tbgState.startedAt + game.minGameTime;
            if (minGameTimeReached) {
                // Even if proposals are insufficient, if minGameTime is met and phase can end by TBG rules (timeout/all_moved),
                // it's considered stale and can proceed (but facet will revert as it needs Success)
                return IRankifyInstance.ProposingEndStatus.GameIsStaleAndCanEnd;
            }
            // If minGameTime not reached, and not enough proposals, and phase timed out (or all moved without enough proposals)
            if (phaseTimedOut || allPlayersMoved) {
                // All moved but not enough proposals is a specific type of not met
                return IRankifyInstance.ProposingEndStatus.MinProposalsNotMetAndNotStale;
            }
            // This case should ideally be covered by PhaseConditionsNotMet if canTransitionBasicTBG was false initially
            // or if canTransitionBasicTBG was true only because of allPlayersMoved but minProposals not met (and not stale)
            // This logic path might need refinement to ensure all conditions map to an enum state clearly.
            // For now, if it got here, it means minProposalsNotMet and not stale.
            return IRankifyInstance.ProposingEndStatus.MinProposalsNotMetAndNotStale;
        }
        return IRankifyInstance.ProposingEndStatus.PhaseConditionsNotMet;
    }

    /**
     * @dev Checks if the current voting stage can end.
     * A voting stage can end if it's a voting stage and all players have made their move (voted)
     * or the time for the stage has run out.
     * If there are not enough proposals to vote on, this stage effectively ends when LibTBG.canEndTurnEarly() becomes true (likely due to timeout).
     */
    function canEndVoting(uint256 gameId) public view returns (bool) {
        enforceGameExists(gameId);
        return isVotingStage(gameId) && gameId.canTransitionPhaseEarly();
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
    ) public returns (uint256[] memory, uint256[] memory, address, bool[] memory isActive, uint256[][] memory) {
        address[] memory players = gameId.getPlayers();
        uint256[] memory gameScores = new uint256[](players.length);
        bool[] memory playerVoted = new bool[](players.length);
        bool[] memory playerProposed = new bool[](players.length);
        address winner = address(0);
        uint256 maxScore = 0;
        GameState storage game = getGameState(gameId);
        isActive = new bool[](players.length);
        // Convert mapping to array to pass it to libQuadratic
        for (uint256 i = 0; i < players.length; ++i) {
            playerVoted[i] = game.playerVoted[players[i]];
            playerProposed[i] = game.proposalCommitment[players[i]] != 0;
        }
        (uint256[] memory roundScores, uint256[][] memory finalizedVotingMatrix) = game.voting.tallyVotes(
            votesRevealed,
            playerVoted,
            playerProposed
        );
        for (uint256 playerIdx = 0; playerIdx < players.length; playerIdx++) {
            //for each player
            if (game.proposalCommitment[players[playerIdx]] != 0) {
                //if player proposal exists
                gameScores[playerIdx] = gameId.getScore(players[playerIdx]) + roundScores[playerIdx];
                gameId.setScore(players[playerIdx], gameScores[playerIdx]);
                if (gameScores[playerIdx] > maxScore) {
                    maxScore = gameScores[playerIdx];
                    winner = players[playerIdx];
                }
            } else {
                //Player did not propose
                // TODO: implement tests for this
                // require(roundScores[playerIdx] == 0, "LibRankify->calculateScores: player got votes without proposing");
            }
        }
        return (gameScores, roundScores, winner, isActive, finalizedVotingMatrix);
    }

    function isVotingStage(uint256 gameId) public view returns (bool) {
        return LibTBG.getPhase(gameId) == 1;
    }

    function isProposingStage(uint256 gameId) public view returns (bool) {
        return LibTBG.getPhase(gameId) == 0;
    }

    /**
     * @dev Checks if a game is in a state where it can be forcibly ended due to being stale.
     * Conditions for being stale for forced end:
     * 1. Game exists and is not already over.
     * 2. Minimum game time has been reached.
     * 3. Game is stuck in the proposing stage:
     *    a. Proposing phase has timed out.
     *    b. Not all active players have made their move (committed proposals).
     *    c. The number of submitted proposals is less than minQuadraticPositions.
     * @param gameId The ID of the game.
     * @return bool True if the game is stale and can be forcibly ended, false otherwise.
     */
    function isGameStaleForForcedEnd(uint256 gameId) internal view returns (bool) {
        enforceGameExists(gameId);
        if (LibTBG.isGameOver(gameId)) {
            return false; // Already over
        }

        LibTBG.Instance storage tbgInstanceState = LibTBG._getInstance(gameId);
        LibTBG.State storage tbgState = tbgInstanceState.state;
        LibTBG.Settings storage tbgSettings = tbgInstanceState.settings; // To get phase duration
        GameState storage game = getGameState(gameId);

        bool minGameTimeReached = block.timestamp >= tbgState.startedAt + game.minGameTime;
        if (!minGameTimeReached) {
            return false;
        }

        // Check if stuck in proposing stage
        if (isProposingStage(gameId)) {
            bool proposingPhaseTimedOut = block.timestamp >=
                tbgState.phaseStartedAt + tbgSettings.turnPhaseDurations[0];
            bool notAllActivePlayersMoved = tbgState.numPlayersMadeMove < tbgState.numActivePlayers;
            bool minProposalsNotMet = game.numCommitments < game.voting.minQuadraticPositions;

            if (proposingPhaseTimedOut && notAllActivePlayersMoved && minProposalsNotMet) {
                return true;
            }
        }

        // Potentially add conditions for being stuck in voting if other scenarios arise in the future

        return false;
    }

    /**
     * @dev Returns true if the player is currently on the waitlist for the given game.
     * @param gameId The ID of the game.
     * @param player The address of the player.
     * @return True if the player is waitlisted, false otherwise.
     */
    function isPlayerWaitlisted(uint256 gameId, address player) public view returns (bool) {
        enforceGameExists(gameId);
        GameState storage game = getGameState(gameId);
        return game.isWaitlisted[player];
    }

    /**
     * @dev Returns the list of players currently on the waitlist for the given game.
     * @param gameId The ID of the game.
     * @return Array of addresses of waitlisted players.
     */
    function getWaitlistedPlayers(uint256 gameId) public view returns (address[] memory) {
        enforceGameExists(gameId);
        GameState storage game = getGameState(gameId);
        return game.waitlist;
    }

    /**
     * @dev Internal function to handle a player's request to join a game.
     *      Determines if the player can join directly, be added to a waitlist, or if the request is invalid.
     *      Signature validation is assumed to be done by the calling facet.
     * @param gameId The ID of the game.
     * @param player The address of the player requesting to join.
     * @return JoinStatus Indicating the outcome of the join request.
     */
    function _handleJoinRequest(uint256 gameId, address player /* bytes memory gameMasterSignature, bytes32 digest */) external returns (JoinStatus) {
        enforceGameExists(gameId);

        GameState storage game = getGameState(gameId);
        LibTBG.Instance storage tbgInstanceState = LibTBG._getInstance(gameId);
        LibTBG.State storage tbgState = tbgInstanceState.state;
        LibTBG.Settings storage tbgSettings = tbgInstanceState.settings; // To get phase duration

        if (LibTBG.isPlayerInGame(gameId, player)) {
            return JoinStatus.AlreadyInGame;
        }
        if (game.isWaitlisted[player]) {
            return JoinStatus.AlreadyWaitlisted;
        }

        // Check total potential players (active + waitlisted + current request) against maxPlayerCnt
        if (tbgState.numActivePlayers + game.waitlist.length >= tbgSettings.maxPlayerCnt) {
            return JoinStatus.GameFull;
        }

        fulfillRankRq(gameId, player); // If this could fail and need specific status, adjust JoinStatus enum

        if (LibTBG.isRegistrationOpen(gameId) && !LibTBG.isLastTurn(gameId)) { // Game not started or in specific join window
            gameId.addPlayer(player); // LibTBG pre-game addPlayer; should also check maxPlayerCnt
            return JoinStatus.JoinedDirectly;
        } else if (tbgState.hasStarted && (!LibTBG.isGameOver(gameId) || LibTBG.isLastTurn(gameId))) { // Game ongoing, add to waitlist
            game.waitlist.push(player);
            game.isWaitlisted[player] = true;
            return JoinStatus.AddedToWaitlist;
        } else { // Game not joinable (e.g., ended, or not started and registration closed)
            return JoinStatus.GameNotJoinable;
        }
    }

    /**
     * @dev Internal function to process the waitlist, add players to the game,
     *      and prepare for the next round. Assumes this is called at a safe point,
     *      typically after a round's scoring and before the next proposing phase.
     *      Relies on placeholder functions in LibTBG and LibQuadraticVoting for core changes.
     * @param gameId The ID of the game.
     */
    function _flushWaitlistAndPrepareNextRound(uint256 gameId) public returns (address[] memory) {
        enforceGameExists(gameId);
        GameState storage game = getGameState(gameId);
        address[] storage localWaitlist = game.waitlist;

        if (localWaitlist.length == 0) {
            _resetRoundState(gameId);
            return new address[](0);
        }

        address[] memory promotedPlayers = new address[](localWaitlist.length);

        for (uint i = 0; i < localWaitlist.length; i++) {
            address playerToAdd = localWaitlist[i];

            // --- CRITICAL ASSUMPTION: LibTBG Modification ---
            // LibTBG.addPlayerToActiveGame(gameId, playerToAdd);
            // This function MUST exist in LibTBG and correctly add the player
            // to all its internal structures for an ongoing game.
            // It should also verify that adding this player doesn't exceed maxPlayerCnt if not already guaranteed.
            // --- END CRITICAL ASSUMPTION ---

            promotedPlayers[i] = playerToAdd;
            game.isWaitlisted[playerToAdd] = false; // Clear waitlist status
            // No payment logic here as it's handled upfront by the facet.
        }

        // Emit event with the players actually promoted (which is the content of localWaitlist before clearing)
        // Important: Emit *before* deleting, to capture the list of players who were processed.
        emit IRankifyInstance.WaitlistFlushed(gameId, localWaitlist);

        delete game.waitlist; // Clear the waitlist array

        // --- CRITICAL ASSUMPTION: LibQuadraticVoting Modification ---
        // LibQuadraticVoting.updatePrecomputedValues(game.voting, gameId.getPlayers().length);
        // --- END CRITICAL ASSUMPTION ---

        _resetRoundState(gameId);
        return promotedPlayers;
    }

    /**
     * @dev Resets the game state specific to a round of proposals and voting.
     * Called when a new round starts, potentially after new players are added.
     * @param gameId The ID of the game.
     */
    function _resetRoundState(uint256 gameId) public {
        GameState storage game = getGameState(gameId);
        // Reset player-specific states for the new round for ALL players (existing and newly added)
        address[] memory players = gameId.getPlayers(); // Assumes LibTBG updated this list if players were added
        for (uint i = 0; i < players.length; i++) {
            delete game.proposalCommitment[players[i]];
            delete game.ballotHashes[players[i]];
            game.playerVoted[players[i]] = false;
        }
        // Reset general round state
        game.numCommitments = 0;
        game.numVotes = 0;
        delete game.permutationCommitment;
        // Clear ongoing proposals from the previous round
        // This requires knowing how ongoingProposals are indexed or if they are cleared differently.
        // Assuming they are indexed 0 to N-1 based on numCommitments of *previous* round.
        // If they are mapped by address, then the loop above for players might be enough
        // or a more specific clearing mechanism for `game.ongoingProposals` is needed.
        // For now, let's assume `LibTBG.startNextPhase()` or `LibTBG.startTurn()` handles
        // LibTBG's concept of turns/phases, and we handle application-specific state here.
        // Example if ongoingProposals were an array indexed 0..numCommitments-1:
        // for (uint i = 0; i < oldNumCommitments; i++) { delete game.ongoingProposals[i]; }

        // Note: LibTBG's own state for player moves in phase (`numPlayersMadeMove`)
        // should be reset by LibTBG when it advances to the new proposing phase.
    }
}
