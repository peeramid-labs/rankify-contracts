// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {IErrors} from "./interfaces/IErrors.sol";
import {ProposalsIntegrity15Groth16Verifier} from "./verifiers/ProposalsIntegrity15Groth16Verifier.sol";
import {LibCVPP} from "./libraries/LibCVPP.sol";
import {IThread} from "./interfaces/IThread.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardTransientUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {IERC1155Receiver} from "./interfaces/IERC1155Receiver.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
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
 * @title Thread
 * @dev Implements CVPP (Continuous voting-proposing protocol)
 * @author Peeramid Labs, 2024
 */
contract Thread is ReentrancyGuardTransientUpgradeable, EIP712Upgradeable, IThread, IERC721Receiver, IERC1155Receiver {
    // This is the precompiled value of Poseidon2(0,0)
    uint256 private constant zeroPoseidon2 =
        14744269619966411208579211824598458697587494354926760081771325075741142829156;
    bytes32 private constant emptyProposalHash = keccak256(abi.encodePacked(""));
    error ballotIntegrityCheckFailed(bytes32 ballotHash, bytes32 ballotHashFromVotes);
    using LibCVPP for LibCVPP.CVPP;

    bytes32 private constant CVPP_STORAGE_POSITION = keccak256("cvpp.storage.position");

    function CVPPStorage() internal pure returns (LibCVPP.CVPP storage es) {
        bytes32 position = CVPP_STORAGE_POSITION;
        assembly {
            es.slot := position
        }
    }

    function initialize(
        string memory name,
        string memory version,
        LibCVPP.Settings memory settings
    ) public initializer {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        __EIP712_init(name, version);
        cvpp.init(settings);
    }

    /**
     * @dev Submits a vote. `encryptedVotes` is the encrypted votes. `voter` is the address of the voter.
     *
     * Emits a _VoteSubmitted_ event.
     *
     * Requirements:
     *
     * - Thread must have started.
     * - Thread must not be over.
     * - `voter` must be participant.
     * - The current turn must be greater than 1.
     */
    function submitVote(
        string memory sealedBallotId,
        address voter,
        bytes memory gmSignature,
        bytes memory voterSignature,
        bytes32 ballotHash
    ) public {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.enforceHasStarted();
        require(!cvpp.isOver(), "Thread is over");
        cvpp.enforceIsMember(voter);
        require(cvpp.getTurn() > 1, "No proposals exist at turn 1: cannot vote");
        address gm = cvpp.getGM();
        if (msg.sender != gm) {
            // Verify GM signature for sealed ballot
            bytes32 ballotDigest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256("SubmitVote(address voter,string sealedBallotId,bytes32 ballotHash)"),
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
        bytes32 voterDigest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    keccak256("AuthorizeVoteSubmission(string sealedBallotId,bytes32 ballotHash)"),
                    keccak256(bytes(sealedBallotId)),
                    ballotHash
                )
            )
        );
        require(
            SignatureChecker.isValidSignatureNow(voter, voterDigest, voterSignature),
            IErrors.invalidECDSARecoverSigner(voterDigest, "Invalid voter signature")
        );

        cvpp.state.ballotHashes[voter] = ballotHash;
        require(!cvpp.state.voted[voter], "Already voted");
        cvpp.state.numVotesThisTurn += 1;
        cvpp.state.voted[voter] = true;
        if (!cvpp.state.isActive[voter]) cvpp.state.numActiveParticipants += 1;
        cvpp.state.isActive[voter] = true;
        cvpp.attemptMove(voter);
        emit VoteSubmitted(cvpp.getTurn(), voter, sealedBallotId, gmSignature, voterSignature, ballotHash);
    }

    /**
     * @dev submits a proposal. `params` is the proposal data.
     * @param params ProposalParams
     * @notice this can be submitted by either participant or game master, params contain ECDSA signatures for verification
     */
    function submitProposal(IThread.ProposalParams memory params) public {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        require(!cvpp.isOver(), "Thread is over");
        address gm = cvpp.getGM();
        if (msg.sender != gm) {
            bytes32 proposalDigest = _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        keccak256("SubmitProposal(address proposer,string encryptedProposal,uint256 commitment)"),
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
                        keccak256("AuthorizeProposalSubmission(string encryptedProposal,uint256 commitment)"),
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
        cvpp.enforceIsMember(params.proposer);
        require(bytes(params.encryptedProposal).length != 0, "Cannot propose empty");
        require(cvpp.state.proposalCommitment[params.proposer] == 0, "Already proposed!");
        uint256 turn = cvpp.getTurn();
        cvpp.state.proposalCommitment[params.proposer] = params.commitment;
        cvpp.enforceHasStarted();

        if (!cvpp.state.isActive[params.proposer]) cvpp.state.numActiveParticipants += 1;
        cvpp.state.isActive[params.proposer] = true;
        cvpp.attemptMove(params.proposer);
        cvpp.state.numCommitments += 1;
        emit ProposalSubmitted(
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
     *
     * @param votes votes revealed for the previous turn
     * @param newProposals The new proposals for the current turn, see BatchProposalReveal
     * @param permutation The permutation of the participants
     * @param shuffleSalt The shuffle salt
     */
    function endTurn(
        uint256[][] memory votes,
        BatchProposalReveal memory newProposals,
        uint256[] memory permutation,
        uint256 shuffleSalt
    ) public nonReentrant {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.enforceIsGM(msg.sender);
        cvpp.enforceHasStarted();
        cvpp.enforceIsNotOver();
        uint256 turn = cvpp.getTurn();
        address[] memory participants = cvpp.getParticipants();

        if (turn != 1) {
            // 1. Handle previous turn's voting and scoring
            {
                uint256[][] memory votesSorted = new uint256[][](participants.length);
                bool[] memory used = new bool[](participants.length);
                string[] memory proposals = new string[](participants.length);

                // Verify vote integrity
                for (uint256 participant = 0; participant < participants.length; ++participant) {
                    votesSorted[participant] = new uint256[](participants.length);
                    bytes32 ballotHash = cvpp.state.ballotHashes[participants[participant]];
                    bytes32 participantSalt = keccak256(abi.encodePacked(participants[participant], shuffleSalt));
                    bytes32 ballotHashFromVotes = keccak256(abi.encodePacked(votes[participant], participantSalt));
                    if (cvpp.state.voted[participants[participant]]) {
                        require(
                            ballotHash == ballotHashFromVotes,
                            ballotIntegrityCheckFailed(ballotHash, ballotHashFromVotes)
                        );
                    }
                    // Verify proposer indices for previous turn's proposals
                    // require(permutation[participant] < participants.length, "Invalid proposer index");
                    require(!used[permutation[participant]], "Duplicate proposer index");
                    used[permutation[participant]] = true;
                    for (uint256 candidate = 0; candidate < participants.length; candidate++) {
                        votesSorted[participant][candidate] = votes[participant][permutation[candidate]];
                    }
                    require(votesSorted[participant][participant] == 0, "voted for himself"); // did not vote for himself
                    proposals[participant] = cvpp.state.ongoingProposals[permutation[participant]];
                }

                // Calculate scores for previous turn's proposals
                (, uint256[] memory roundScores) = cvpp.calculateScores(votesSorted);

                for (uint256 i = 0; i < participants.length; ++i) {
                    string memory proposal = proposals[i];
                    emit ProposalScore(turn, proposal, roundScores[i], proposal);
                }
            }
        }
        {
            uint256[32] memory PropIntegrityPublicInputs;

            require(participants.length <= 15, "Too many participants");
            require(newProposals.proposals.length == 15, "Invalid proposal count");

            // Fill public inputs with commitments
            {
                for (uint8 i = 0; i < 30; ++i) {
                    if (i < 15) {
                        if (i < participants.length) {
                            uint256 commitment = cvpp.state.proposalCommitment[participants[i]];
                            PropIntegrityPublicInputs[i] = commitment != 0 ? commitment : zeroPoseidon2;
                        } else {
                            PropIntegrityPublicInputs[i] = zeroPoseidon2;
                        }
                    } else {
                        bytes32 proposalHash = keccak256(abi.encodePacked(newProposals.proposals[i - 15]));
                        if (i - 15 < participants.length && proposalHash != emptyProposalHash) {
                            PropIntegrityPublicInputs[i] = uint256(proposalHash);
                        } else {
                            PropIntegrityPublicInputs[i] = 0;
                        }
                    }
                }
            }

            PropIntegrityPublicInputs[30] = newProposals.permutationCommitment;
            PropIntegrityPublicInputs[31] = participants.length;
            // 2. Handle current turn's proposal reveals with single proof
            require(
                ProposalsIntegrity15Groth16Verifier(cvpp.settings.proposalIntegrityVerifier).verifyProof(
                    newProposals.a,
                    newProposals.b,
                    newProposals.c,
                    PropIntegrityPublicInputs
                ),
                "Invalid batch proposal reveal proof"
            );
        }
        {
            bytes32 hash4 = IPoseidon2(cvpp.settings.poseidon2).poseidon(
                [
                    poseidonSpongeT3(
                        permutation,
                        participants.length,
                        cvpp.settings.poseidon5,
                        cvpp.settings.poseidon6
                    ),
                    bytes32(shuffleSalt)
                ]
            );
            require(hash4 == bytes32(cvpp.state.permutationCommitment), "Invalid permutation commitment");
        }

        // Emit event and clean up
        (, uint256[] memory scores) = cvpp.getScores();
        emit TurnEnded(cvpp.getTurn(), participants, scores, newProposals.proposals, permutation, votes);

        uint256 numActiveParticipants = 0;
        require(cvpp.canEndTurnEarly(), "nextTurn->CanEndEarly");
        // Clean up for next turn
        for (uint256 i = 0; i < participants.length; ++i) {
            address participant = participants[i];
            bool isActive = cvpp.state.proposalCommitment[participant] != 0 || cvpp.state.voted[participant];
            cvpp.state.isActive[participant] = isActive;
            if (isActive) numActiveParticipants++;
            cvpp.state.madeMove[participant] = false;
            cvpp.state.ongoingProposals[i] = newProposals.proposals[i];
            cvpp.state.voted[participant] = false;
            cvpp.state.ballotHashes[participant] = bytes32(0);
            cvpp.state.proposalCommitment[participant] = 0;
        }
        cvpp.state.numActiveParticipants = numActiveParticipants;

        cvpp.state.numVotesPrevTurn = cvpp.state.numVotesThisTurn;
        cvpp.state.numVotesThisTurn = 0;
        cvpp.state.numPrevProposals = cvpp.state.numCommitments;
        cvpp.state.numCommitments = 0;
        cvpp.state.permutationCommitment = uint256(newProposals.permutationCommitment);
        {
            (bool _isLastTurn, bool _isOvertime, bool _hasEnded) = cvpp.nextTurn();
            if (_isLastTurn && _isOvertime) {
                emit OverTime();
            }
            if (_isLastTurn) {
                emit LastTurn();
            }
            if (_hasEnded) {
                (
                    address[] memory participants,
                    address[] memory leaderboard,
                    uint256[] memory finalScores,
                    bool rewardClaimed
                ) = cvpp.close();
                emit Over(cvpp.state.winner, rewardClaimed, participants, leaderboard, finalScores);
            }
        }
    }

    /**
     * @dev Cancels a thread.
     * @notice This function:
     *         - Calls the `enforceIsGameCreator` function with `msg.sender`.
     *         - Cancels the thread.
     *         - Emits a _GameClosed_ event.
     * @custom:security nonReentrant
     */
    function cancelThread() public nonReentrant {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.enforceIsGM(msg.sender);
        cvpp.cancelThread();
        emit ThreadClosed();
    }

    /**
     * @dev Allows a player to leave a game.
     * @notice This function:
     *         - Calls the `quitGame` function with `msg.sender`, `true`, and `onPlayerQuit`.
     * @custom:security nonReentrant
     */
    function leaveThread() public nonReentrant {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.removeParticipant(msg.sender);
        emit ParticipantLeft(msg.sender);
    }

    /**
     * @dev Opens registration for a thread.
     * @notice This function:
     *         - Calls the `enforceIsGameCreator` function with `msg.sender`.
     *         - Calls the `enforceIsPreRegistrationStage` function.
     *         - Calls the `openRegistration` function.
     *         - Emits a _RegistrationOpen_ event.
     */
    function openRegistration() public nonReentrant {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.enforceIsGM(msg.sender);
        cvpp.enforceIsPreRegistrationStage();
        cvpp.openRegistration();
        emit RegistrationOpen();
    }

    /**
     * @dev Allows a player to join a thread.
     * @param gameMasterSignature The ECDSA signature of the game master.
     * @param gmCommitment The gmCommitment to the player signed by the game master.
     * @param deadline The deadline for the player to sign the gmCommitment.
     * @notice This function:
     *         - Calls the `joinGame` function with `msg.sender`.
     *         - Calls the `fund` function.
     *         - Emits a _PlayerJoined_ event.
     * @custom:security nonReentrant
     */
    function joinThread(
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
                        "AttestJoiningThread(address participant,bytes32 gmCommitment,uint256 deadline,bytes32 participantPubKeyHash)"
                    ),
                    msg.sender,
                    gmCommitment,
                    deadline,
                    keccak256(abi.encodePacked(voterPubKey))
                )
            )
        );
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.joinThread(msg.sender, gameMasterSignature, digest);
        emit Joined(msg.sender, gmCommitment, voterPubKey);
    }

    /**
     * @dev Starts a thread early.
     * @param permutationCommitment The commitment to the permutation issued by the game master.
     * @notice This function:
     *         - Calls the `enforceIsGM` function.
     *         - Calls the `enforceHasStarted` function.
     *         - Calls the `enforceIsNotOver` function.
     *         - Calls the `startEarly` function.
     *         - Emits a _ThreadStarted_ event.
     */
    function startThread(uint256 permutationCommitment) public {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.enforceIsGM(msg.sender);
        cvpp.enforceHasStarted();
        cvpp.enforceIsNotOver();
        cvpp.startEarly();
        cvpp.state.permutationCommitment = permutationCommitment;
        emit ThreadStarted();
    }

    function onERC1155Received(
        address operator,
        address,
        uint256,
        uint256,
        bytes calldata
    ) public view override returns (bytes4) {
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
        if (operator == address(this)) {
            return IERC721Receiver.onERC721Received.selector;
        }
        return bytes4("");
    }

    /**
     * @dev Returns the current state of the contract
     * @return LibCVPP.CVPP The current state of the contract
     */
    function getContractState() public view returns (LibCVPP.ThreadStateReturn memory) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.getState();
    }

    /**
     * @dev Returns the current turn.
     * @return uint256 The current turn
     */
    function getTurn() public view returns (uint256) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.getTurn();
    }

    /**
     * @dev Returns the game master
     * @return address The game master
     */
    function getGM() public view returns (address) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.settings.gameMaster;
    }

    /**
     * @dev Returns the scores
     * @return address[] The participants
     * @return uint256[] The scores
     */
    function getScores() public view returns (address[] memory, uint256[] memory) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.getScores();
    }

    /**
     * @dev Returns whether the thread is in overtime
     * @return bool Whether the thread is in overtime
     */
    function isOvertime() public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.state.isOvertime;
    }

    /**
     * @dev Returns whether the thread is over
     * @return bool Whether the thread is over
     */
    function isOver() public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.state.hasEnded;
    }

    /**
     * @dev Returns whether the thread is in the last turn
     * @return bool Whether the thread is in the last turn
     */
    function isLastTurn() public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.isLastTurn();
    }

    /**
     * @dev Returns whether registration is open
     * @return bool Whether registration is open
     */
    function isRegistrationOpen() public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.state.registrationOpenAt > 0;
    }

    /**
     * @dev Returns the creator
     * @return address The creator
     */
    function getCreator() public view returns (address) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.state.createdBy;
    }

    /**
     * @dev Returns the participants
     * @return address[] The participants
     */
    function getParticipants() public view returns (address[] memory) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.getParticipants();
    }

    /**
     * @dev Returns whether the thread can be started early
     * @return bool Whether the thread can be started early
     */
    function canStartThread() public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.canStart();
    }

    /**
     * @dev Returns whether the turn can be ended early
     * @return bool Whether the turn can be ended early
     */
    function canEndTurn() public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.canEndTurnEarly();
    }

    /**
     * @dev Returns whether the participant has completed their turn
     * @param participant The address of the participant
     * @return bool Whether the participant has completed their turn
     */
    function isParticipantTurnComplete(address participant) public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.isParticipantTurnComplete(participant);
    }

    /**
     * @dev Returns the voted array
     * @return bool[] The voted array
     */
    function getVotedArray() public view returns (bool[] memory) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        address[] memory participants = cvpp.getParticipants();
        bool[] memory participantVoted = new bool[](participants.length);
        for (uint256 i = 0; i < participants.length; ++i) {
            participantVoted[i] = cvpp.state.voted[participants[i]];
        }
        return participantVoted;
    }

    /**
     * @dev Returns the participants who have moved
     * @return bool[] The participants who have moved
     * @return uint256 The number of participants who have moved
     */
    function getParticipantsMoved() public view returns (bool[] memory, uint256) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        address[] memory participants = cvpp.getParticipants();
        bool[] memory participantsMoved = new bool[](participants.length);
        for (uint256 i = 0; i < participants.length; ++i) {
            participantsMoved[i] = cvpp.state.madeMove[participants[i]];
        }
        return (participantsMoved, cvpp.state.numParticipantsMadeMove);
    }

    function isActive(address participant) public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.state.isActive[participant];
    }

    /**
     * @dev Returns the winner
     * @return address The winner of the thread
     */
    function winner() public view returns (address) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.state.winner;
    }

    function madeMove(address player) public view returns (bool) {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        return cvpp.state.madeMove[player];
    }

    function claimReward() public {
        LibCVPP.CVPP storage cvpp = CVPPStorage();
        cvpp.claimReward();
    }
}
