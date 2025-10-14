// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {LibRankify} from "../libraries/LibRankify.sol";
import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";
import "../abstracts/DiamondReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../abstracts/draft-EIP712Diamond.sol";
import {LibCoinVending} from "../libraries/LibCoinVending.sol";
import "hardhat/console.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import "../vendor/diamond/libraries/LibDiamond.sol";
import {IErrors} from "../interfaces/IErrors.sol";
import {ProposalsIntegrity15Groth16Verifier} from "../verifiers/ProposalsIntegrity15Groth16Verifier.sol";

interface IPoseidon5 {
    function poseidon(bytes32[5] memory inputs) external view returns (bytes32);
}

interface IPoseidon6 {
    function poseidon(bytes32[6] memory inputs) external view returns (bytes32);
}

interface IPoseidon2 {
    function poseidon(bytes32[2] memory inputs) external view returns (bytes32);
}

/**
 * @title RankifyInstanceGameMastersFacet
 * @notice Facet handling game master functionality for Rankify instances
 * @dev Implements game master specific operations like vote submission and game management
 * @author Peeramid Labs, 2024
 */
contract RankifyInstanceGameMastersFacet is DiamondReentrancyGuard, EIP712 {
    // This is the precompiled value of Poseidon2(0,0)
    uint256 private constant zeroPoseidon2 =
        14744269619966411208579211824598458697587494354926760081771325075741142829156;
    error ballotIntegrityCheckFailed(bytes32 ballotHash, bytes32 ballotHashFromVotes);
    using LibTBG for uint256;
    using LibRankify for uint256;
    using LibTBG for LibTBG.State;
    event OverTime(uint256 indexed gameId);
    event ProposalScore(
        uint256 indexed gameId,
        uint256 indexed turn,
        string indexed proposalHash,
        string proposal,
        uint256 score
    );
    event LastTurn(uint256 indexed gameId);
    event GameOver(uint256 indexed gameId, address[] players, uint256[] scores);
    event ProposalSubmitted(
        uint256 indexed gameId,
        uint256 indexed turn,
        address indexed proposer,
        uint256 commitment,
        string encryptedProposal,
        bytes gmSignature,
        bytes proposerSignature
    );
    event VoteSubmitted(
        uint256 indexed gameId,
        uint256 indexed turn,
        address indexed player,
        string sealedBallotId,
        bytes gmSignature,
        bytes voterSignature,
        bytes32 ballotHash
    );
    event ProposingStageEnded(
        uint256 indexed gameId,
        uint256 indexed roundNumber,
        uint256 numProposals,
        string[] proposals
    );
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

    /**
     * @dev Represents a proposal for a game.
     * @param gameId The ID of the game
     * @param encryptedProposal The encrypted proposal, may be treated as simply restricted URI.
     * @param commitment The commitment to the proposal
     * @param proposer The address of the proposer
     * @param gmSignature The ECDSA signature of the game master
     * @param voterSignature The ECDSA signature of the voter
     * @notice gmSignature and voterSignature are ECDSA signatures for verification
     */
    struct ProposalParams {
        uint256 gameId;
        string encryptedProposal;
        uint256 commitment;
        address proposer;
        bytes gmSignature;
        bytes proposerSignature;
    }

    /**
     * @dev Represents a batch of proposal reveals for a game.
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

    /**
     * @dev Handles the end of the game for a player. `gameId` is the ID of the game. `player` is the address of the player.
     *
     * Modifies:
     *
     * - Releases the coins for the game with `gameId`, the game creator, the top player, and `player`.
     */
    function onPlayersGameEnd(uint256 gameId, address player) private {
        LibRankify.GameState storage game = gameId.getGameState();
        LibCoinVending.release(bytes32(gameId), game.createdBy, gameId.getLeaderBoard()[0], player);
    }

    /**
     * @dev Submits a vote for a game. `gameId` is the ID of the game. `encryptedVotes` is the encrypted votes. `voter` is the address of the voter.
     *
     * Emits a _VoteSubmitted_ event.
     *
     * Requirements:
     *
     * - The caller must be a game master of the game with `gameId`.
     * - The game with `gameId` must exist.
     * - The game with `gameId` must have started.
     * - The game with `gameId` must not be over.
     * - `voter` must be in the game with `gameId`.
     * - The current turn of the game with `gameId` must be greater than 1.
     */
    function submitVote(
        uint256 gameId,
        string memory sealedBallotId,
        address voter,
        bytes memory gmSignature,
        bytes memory voterSignature,
        bytes32 ballotHash
    ) public {
        gameId.enforceGameExists();
        gameId.enforceHasStarted();
        require(!gameId.isGameOver(), "Game over");
        gameId.enforceIsPlayingGame(voter);
        require(gameId.isVotingStage(), "Not in voting stage");
        address gm = gameId.getGM();
        if (msg.sender != gm) {
            // Verify GM signature for sealed ballot
            bytes32 ballotDigest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256("SubmitVote(uint256 gameId,address voter,string sealedBallotId,bytes32 ballotHash)"),
                        gameId,
                        voter,
                        keccak256(bytes(sealedBallotId)),
                        ballotHash
                    )
                )
            );

            require(
                SignatureChecker.isValidSignatureNow(gm, ballotDigest, gmSignature),
                IErrors.invalidECDSARecoverSigner(ballotDigest, "Invalid GM signature")
            );
        }
        // If sender is not the voter, verify voter's signature
        if (msg.sender != voter) {
            bytes32 voterDigest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256("AuthorizeVoteSubmission(uint256 gameId,string sealedBallotId,bytes32 ballotHash)"),
                        gameId,
                        keccak256(bytes(sealedBallotId)),
                        ballotHash
                    )
                )
            );
            require(
                SignatureChecker.isValidSignatureNow(voter, voterDigest, voterSignature),
                IErrors.invalidECDSARecoverSigner(voterDigest, "Invalid voter signature")
            );
        }

        LibRankify.GameState storage game = gameId.getGameState();
        game.ballotHashes[voter] = ballotHash;
        require(!game.playerVoted[voter], "Already voted");
        game.numVotes += 1;
        game.playerVoted[voter] = true;
        gameId.tryPlayerMove(voter);
        emit VoteSubmitted(gameId, gameId.getTurn(), voter, sealedBallotId, gmSignature, voterSignature, ballotHash);
    }

    /**
     * @dev submits a proposal for a game. `params` is the proposal data.
     * @param params ProposalParams
     * @notice this can be submitted by either player or game master, params contain ECDSA signatures for verification
     */
    function submitProposal(ProposalParams memory params) public {
        params.gameId.enforceGameExists();
        require(!params.gameId.isGameOver(), "Game over");
        address gm = params.gameId.getGM();
        if (msg.sender != gm) {
            bytes32 proposalDigest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "SubmitProposal(uint256 gameId,address proposer,string encryptedProposal,uint256 commitment)"
                        ),
                        params.gameId,
                        params.proposer,
                        keccak256(bytes(params.encryptedProposal)),
                        params.commitment
                    )
                )
            );
            require(
                SignatureChecker.isValidSignatureNow(gm, proposalDigest, params.gmSignature),
                IErrors.invalidECDSARecoverSigner(proposalDigest, "Invalid GM signature")
            );
        }
        if (msg.sender != params.proposer) {
            bytes32 voterDigest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256(
                            "AuthorizeProposalSubmission(uint256 gameId,string encryptedProposal,uint256 commitment)"
                        ),
                        params.gameId,
                        keccak256(bytes(params.encryptedProposal)),
                        params.commitment
                    )
                )
            );
            require(
                SignatureChecker.isValidSignatureNow(params.proposer, voterDigest, params.proposerSignature),
                "invalid proposer signature"
            );
        }
        LibRankify.GameState storage game = params.gameId.getGameState();
        require(params.gameId.isPlayerInGame(params.proposer), "not a player");
        require(bytes(params.encryptedProposal).length != 0, "Cannot propose empty");
        require(game.proposalCommitment[params.proposer] == 0, "Already proposed!");
        uint256 turn = params.gameId.getTurn();
        game.proposalCommitment[params.proposer] = params.commitment;
        params.gameId.enforceHasStarted();
        params.gameId.tryPlayerMove(params.proposer);
        game.numCommitments += 1;
        emit ProposalSubmitted(
            params.gameId,
            turn,
            params.proposer,
            params.commitment,
            params.encryptedProposal,
            params.gmSignature,
            params.proposerSignature
        );
    }

    /**
     * @dev Hashes the inputs using Poseidon sponge function.
     * @param inputs Array of inputs to hash
     * @param size Size of the inputs array
     * @param poseidon5 Address of Poseidon5 contract
     * @param poseidon6 Address of Poseidon6 contract
     * @return hash3 The final hash
     */
    function poseidonSpongeT3(
        uint256[] memory inputs,
        uint256 size,
        address poseidon5,
        address poseidon6
    ) internal view returns (bytes32) {
        // console.log("begin hashing poseidon5");
        //verify that permutation is correct
        bytes32 hash1 = IPoseidon5(poseidon5).poseidon(
            [
                bytes32(size > 0 ? inputs[0] : 0),
                bytes32(size > 1 ? inputs[1] : 1),
                bytes32(size > 2 ? inputs[2] : 2),
                bytes32(size > 3 ? inputs[3] : 3),
                bytes32(size > 4 ? inputs[4] : 4)
            ]
        );
        bytes32 hash2 = IPoseidon6(poseidon6).poseidon(
            [
                hash1,
                bytes32(size > 5 ? inputs[5] : 5),
                bytes32(size > 6 ? inputs[6] : 6),
                bytes32(size > 7 ? inputs[7] : 7),
                bytes32(size > 8 ? inputs[8] : 8),
                bytes32(size > 9 ? inputs[9] : 9)
            ]
        );
        bytes32 hash3 = IPoseidon6(poseidon6).poseidon(
            [
                hash2,
                bytes32(size > 10 ? inputs[10] : 10),
                bytes32(size > 11 ? inputs[11] : 11),
                bytes32(size > 12 ? inputs[12] : 12),
                bytes32(size > 13 ? inputs[13] : 13),
                bytes32(size > 14 ? inputs[14] : 14)
            ]
        );
        return hash3;
    }

    /**
     * @dev Handles the next turn of a game with the provided game ID. `gameId` is the ID of the game. `newProposals` is the array of new proposals.
     *
     * Emits an {OverTime_ event if the game is in the last turn and overtime.
     * emits a _LastTurn_ event if the game is in the last turn.
     * emits a _GameOver_ event if the game is over.
     */
    function _nextTurn(uint256 gameId) private {
        (bool _isLastTurn, bool _wasLastTurn, bool _isOvertime, bool _isGameOver) = gameId.next();
        if (_wasLastTurn && _isOvertime) {
            emit OverTime(gameId);
        }
        if (_isLastTurn) {
            emit LastTurn(gameId);
        }
        if (_isGameOver) {
            (address[] memory players, uint256[] memory finalScores) = gameId.closeGame(onPlayersGameEnd);
            emit GameOver(gameId, players, finalScores);
        }
    }

    /**
     * @notice Called by the Game Master to submit revealed votes and end the current voting stage.
     * Advances the game to the next proposing stage or ends the game if it's the final round.
     * @param gameId Id of the game
     * @param votes Revealed votes for the current voting stage. votes[playerIndex][voteTargetIndex].
     * @param permutation The permutation of players used when their proposals (now being voted on) were originally revealed.
     * @param shuffleSalt The salt used with the permutation for vote commitment hashing.
     * @custom:security nonReentrant Restricted to Game Master.
     */
    function endVoting(
        uint256 gameId,
        uint256[][] memory votes,
        uint256[] memory permutation,
        uint256 shuffleSalt
    ) public nonReentrant {
        {
            gameId.enforceGameExists();
            gameId.enforceIsGM(msg.sender);
            gameId.enforceHasStarted();
            gameId.enforceIsNotOver();
            require(gameId.isVotingStage(), "Not in voting stage");
        }

        LibRankify.GameState storage game = gameId.getGameState();
        address[] memory players = gameId.getPlayers();
        // 1. Handle previous turn's voting and scoring
        {
            uint256[][] memory votesSorted = new uint256[][](players.length);

            // Verify vote integrity
            for (uint256 player = 0; player < players.length; ++player) {
                votesSorted[player] = new uint256[](players.length);
                bytes32 ballotHash = game.ballotHashes[players[player]];
                bytes32 playerSalt = keccak256(abi.encodePacked(players[player], shuffleSalt));
                bytes32 ballotHashFromVotes = keccak256(abi.encodePacked(votes[player], playerSalt));
                // console.log("playerSalt", uint256(playerSalt));
                // console.log("shuffleSalt", uint256(shuffleSalt));
                // console.log("ballotHashFromVotes", uint256(ballotHashFromVotes));
                if (game.playerVoted[players[player]]) {
                    require(
                        ballotHash == ballotHashFromVotes,
                        ballotIntegrityCheckFailed(ballotHash, ballotHashFromVotes)
                    );
                }
            }

            // Verify proposer indices for previous turn's proposals
            bool[] memory used = new bool[](players.length);
            for (uint256 i = 0; i < players.length; i++) {
                require(permutation[i] < players.length, "Invalid proposer index");
                require(!used[permutation[i]], "Duplicate proposer index");
                used[permutation[i]] = true;
            }

            // Sort votes according to previous turn's proposer indices
            for (uint256 voter = 0; voter < players.length; ++voter) {
                // permutation is the index where players proposal was shuffled in to
                // uint256 proposalCol = permutation[voter];
                // We slice the votes array to get the votes for the current player

                for (uint256 candidate = 0; candidate < players.length; candidate++) {
                    votesSorted[voter][candidate] = votes[voter][permutation[candidate]];
                    if (!game.playerVoted[players[voter]]) {
                        require(
                            votesSorted[voter][candidate] == 0,
                            "Player did not vote but non zero vote was revealed"
                        );
                    }
                }
                require(votesSorted[voter][voter] == 0, "voted for himself"); // did not vote for himself
            }

            // Calculate scores for previous turn's proposals
            (
                ,
                uint256[] memory roundScores,
                address roundWinner,
                bool[] memory isActive,
                uint256[][] memory finalizedVotingMatrix
            ) = gameId.calculateScores(votesSorted);

            uint256 turn = gameId.getTurn();
            for (uint256 i = 0; i < players.length; ++i) {
                string memory proposal = game.proposals[turn][permutation[i]];
                address proposedBy = players[i];
                emit ProposalScore(gameId, turn, proposal, proposal, roundScores[i]);
                bytes32 proposalHash = keccak256(abi.encodePacked(proposal));
                LibRankify.InstanceState storage instanceState = LibRankify.instanceState();
                instanceState.proposalScore[proposalHash].turn[gameId][turn].score += roundScores[i];
                instanceState.proposalScore[proposalHash].turn[gameId][turn].proposedBy.push(proposedBy);
                instanceState.proposalScore[proposalHash].game[gameId].score += roundScores[i];
                instanceState.proposalScore[proposalHash].totalScore += roundScores[i];
            }
            emit VotingStageResults(
                gameId,
                gameId.getTurn(),
                roundWinner,
                players,
                roundScores,
                votesSorted,
                isActive,
                finalizedVotingMatrix,
                permutation
            );
        }
        {
            LibRankify.InstanceState storage instanceState = LibRankify.instanceState();
            bytes32 hash4 = IPoseidon2(instanceState.commonParams.poseidon2).poseidon(
                [
                    poseidonSpongeT3(
                        permutation,
                        players.length,
                        instanceState.commonParams.poseidon5,
                        instanceState.commonParams.poseidon6
                    ),
                    bytes32(shuffleSalt)
                ]
            );
            // console.log("hash4", uint256(hash4));
            // console.log("comparing hashes", shuffleSalt, game.permutationCommitment);
            require(hash4 == bytes32(game.permutationCommitment), "Invalid permutation commitment");
        }

        // Clean up for next turn
        for (uint256 i = 0; i < players.length; ++i) {
            game.playerVoted[players[i]] = false;
            game.ballotHashes[players[i]] = bytes32(0);
            game.proposalCommitment[players[i]] = 0;
        }

        game.numVotes = 0;
        game.numCommitments = 0;
        _nextTurn(gameId);
    }

    /**
     * @notice Called by the Game Master to submit revealed proposals and end the current proposing stage.
     * Advances the game to the next voting stage.
     * @param gameId Id of the game
     * @param newProposals The new proposals for the current turn, see BatchProposalReveal
     */
    function endProposing(uint256 gameId, BatchProposalReveal memory newProposals) public nonReentrant {
        gameId.enforceGameExists();
        gameId.enforceIsGM(msg.sender);
        gameId.enforceHasStarted();
        gameId.enforceIsNotOver();
        require(gameId.isProposingStage(), "Not in proposing stage");
        uint256 turn = gameId.getTurn();
        LibRankify.GameState storage game = gameId.getGameState();
        (bool canEnd, IRankifyInstance.ProposingEndStatus status) = gameId.canEndProposing();
        require(canEnd, IRankifyInstance.ErrorProposingStageEndFailed(gameId, status));
        address[] memory players = gameId.getPlayers();

        LibRankify.InstanceState storage instanceState = LibRankify.instanceState();
        {
            uint256[32] memory PropIntegrityPublicInputs;

            require(players.length <= 15, "Too many players, current ZKP circuit only supports 15 players");
            require(newProposals.proposals.length == 15, "Invalid proposal count");

            // Fill public inputs with commitments
            {
                for (uint256 i = 0; i < players.length; ++i) {
                    uint256 commitment = game.proposalCommitment[players[i]];
                    PropIntegrityPublicInputs[i] = commitment != 0 ? commitment : zeroPoseidon2;
                }
                // Fill remaining slots with zero hashes
                for (uint256 i = players.length; i < 15; ++i) {
                    PropIntegrityPublicInputs[i] = zeroPoseidon2;
                }
            }
            bytes32 emptyProposalHash = keccak256(abi.encodePacked(""));
            // Fill public inputs with proposals
            for (uint256 i = 15; i < 30; ++i) {
                bytes32 proposalHash = keccak256(abi.encodePacked(newProposals.proposals[i - 15]));
                instanceState.proposalScore[proposalHash].exists = true;
                instanceState.proposalScore[proposalHash].game[gameId].exists = true;
                instanceState.proposalScore[proposalHash].turn[gameId][turn] = LibRankify.TurnProposalScore({
                    proposedBy: new address[](0),
                    score: 0,
                    exists: true
                });
                if (i - 15 < players.length && proposalHash != emptyProposalHash) {
                    PropIntegrityPublicInputs[i] = uint256(proposalHash);
                } else {
                    PropIntegrityPublicInputs[i] = 0;
                }
            }

            PropIntegrityPublicInputs[30] = newProposals.permutationCommitment;
            PropIntegrityPublicInputs[31] = players.length;
            // 2. Handle current turn's proposal reveals with single proof
            require(
                ProposalsIntegrity15Groth16Verifier(instanceState.commonParams.proposalIntegrityVerifier).verifyProof(
                    newProposals.a,
                    newProposals.b,
                    newProposals.c,
                    PropIntegrityPublicInputs
                ),
                "Invalid batch proposal reveal proof"
            );
        }
        game.permutationCommitment = uint256(newProposals.permutationCommitment);
        for (uint256 i = 0; i < newProposals.proposals.length; ++i) {
            game.proposals[turn][i] = newProposals.proposals[i];
        }
        game.numProposals[turn] = newProposals.proposals.length;
        emit ProposingStageEnded(gameId, gameId.getTurn(), game.numCommitments, newProposals.proposals);
        gameId.next();
    }

    /**
     * @notice Allows a Game Master to forcibly end a game that has become stale.
     * A game is considered stale if minimum game time has passed, it's stuck in the proposing stage
     * with insufficient proposals, and the proposing phase has timed out.
     * @param gameId The ID of the game to forcibly end.
     * @custom:security nonReentrant Restricted to Game Master.
     */
    function forceEndStaleGame(uint256 gameId) public nonReentrant {
        gameId.enforceGameExists();
        require(!LibTBG.isGameOver(gameId), "Rankify: Game already over");

        gameId.enforceIsGM(msg.sender);
        (bool canEnd, IRankifyInstance.ProposingEndStatus status) = gameId.canEndProposing();
        require(
            canEnd && status == IRankifyInstance.ProposingEndStatus.GameIsStaleAndCanEnd,
            IRankifyInstance.ErrorCannotForceEndGame(gameId)
        );

        LibRankify.GameState storage game = gameId.getGameState();
        LibTBG.State storage tbgState = gameId._getState();
        tbgState.hasEnded = true;
        (address[] memory players, uint256[] memory finalScores) = gameId.closeGame(onPlayersGameEnd);
        emit GameOver(gameId, players, finalScores);
        emit IRankifyInstance.StaleGameEnded(gameId, game.winner);
    }
}
