// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@peeramid-labs/multipass/src/interfaces/IMultipass.sol";
import "@peeramid-labs/multipass/src/libraries/LibMultipass.sol";
import "./tokens/DistributableGovernanceERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {LibUBI} from "./libraries/LibUBI.sol";

/**
 * @title Universal Basic Income (UBI) Contract
 * @author Peeramid Labs
 * @notice This contract manages a UBI system where users can claim daily tokens and support proposals.
 * It integrates with Multipass for identity verification and uses an ERC20 token for distribution.
 * Users can claim a fixed amount of tokens daily. After claiming, they can also propose ideas or
 * support existing ones from the previous day using a quadratic voting mechanism.
 * The contract is upgradeable and pausable.
 */
contract UBI is ReentrancyGuardUpgradeable, PausableUpgradeable {
    /**
     * @notice Error thrown when a user without a valid Multipass record tries to interact with the contract.
     * @param recordFound Whether a Multipass record was found for the sender.
     * @param validUtil The timestamp until which the sender's Multipass record is valid.
     */
    error InvalidSender(bool recordFound, uint256 validUtil);

    /**
     * @notice Event emitted when a user successfully claims their daily tokens.
     * @param user The address of the user who claimed.
     * @param amount The amount of tokens claimed.
     */
    event Claimed(address indexed user, uint256 amount);

    /**
     * @notice Event emitted when a proposal is made, indicating how many times it has been proposed.
     * @param proposalHash The hash of the proposal.
     * @param newTimesProposed The new total count of times this proposal has been made.
     */
    event ProposedTime(bytes32 proposalHash, uint256 newTimesProposed);

    /**
     * @notice Event emitted when a user votes on proposals
     * @param participant Address of the voter
     * @param day Day number when the vote was cast
     * @param proposal Hash of the proposal being voted on
     * @param amount Amount of voting power allocated
     */
    event VotingByAddress(address indexed participant, uint256 indexed day, bytes32 indexed proposal, uint256 amount);

    /**
     * @notice Event emitted when a proposal's daily score is updated, indexed by proposer.
     * @param dailyScore The new daily score of the proposal.
     * @param day The day the score was updated.
     * @param proposer The address of the proposal's creator.
     * @param proposal The hash of the proposal.
     */
    event ProposalScoreUpdatedByAddress(
        uint256 indexed dailyScore,
        uint256 indexed day,
        address indexed proposer,
        bytes32 proposal
    );

    /**
     * @notice Event emitted when a proposal's daily score is updated, indexed by proposal hash.
     * @param dailyScore The new daily score of the proposal.
     * @param day The day the score was updated.
     * @param proposal The hash of the proposal.
     * @param proposer The address of the proposal's creator.
     */
    event ProposalScoreUpdatedByProposal(
        uint256 indexed dailyScore,
        uint256 indexed day,
        bytes32 indexed proposal,
        address proposer
    );

    /**
     * @notice Event emitted when a proposal's lifetime statistics are updated.
     * @param lifeTimeScore The new aggregate lifetime score of the proposal.
     * @param proposedTimes The total number of times the proposal has been submitted.
     * @param repostedTimes The total number of times the proposal has been reposted.
     */
    event ProposalLifetimeScore(
        uint256 indexed lifeTimeScore,
        uint256 indexed proposedTimes,
        uint256 indexed repostedTimes
    );

    /**
     * @notice Event for tracking proposals by address
     * @param proposer Address of the proposal creator
     * @param day Day number when the proposal was created
     * @param proposal Hash of the proposal
     * @param proposalText Full text of the proposal
     */
    event ProposingByAddress(
        address indexed proposer,
        uint256 indexed day,
        bytes32 indexed proposal,
        string proposalText,
        uint256 scoreWhenProposed
    );

    /**
     * @notice Event emitted when a user reposts an existing proposal, indexed by reposter.
     * @param proposer The original proposer's address.
     * @param day The day of the repost.
     * @param proposal The hash of the proposal.
     * @param reposter The address of the user who reposted.
     * @param proposalText The text of the proposal.
     */
    event RepostByReposter(
        address indexed proposer,
        uint256 indexed day,
        bytes32 indexed proposal,
        address reposter,
        string proposalText
    );
    /**
     * @notice Event emitted when a user reposts an existing proposal, indexed by original proposer.
     * @param reposter The address of the user who reposted.
     * @param day The day of the repost.
     * @param proposal The hash of the proposal.
     * @param proposer The original proposer's address.
     * @param proposalText The text of the proposal.
     */
    event RepostByProposer(
        address indexed reposter,
        uint256 indexed day,
        bytes32 indexed proposal,
        address proposer,
        string proposalText
    );

    /**
     * @notice Constructor
     * @dev Intentionally empty as initialization happens in initialize()
     */
    constructor(bool isTest) {
        if (!isTest) {
            _disableInitializers();
        }
    }

    /**
     * @notice Initializes the UBI contract.
     * @dev This function is called once to set up the contract's initial state.
     * It sets the Multipass contract instance, the governance token, the pauser address,
     * and the daily claim/support amounts.
     * @param _multipass The address of the Multipass contract.
     * @param _token The address of the DistributableGovernanceERC20 token contract.
     * @param _pauser The address that has permission to pause and unpause the contract.
     * @param dailyClaim The amount of tokens users can claim daily.
     * @param dailySupport The amount of support points users can allocate daily.
     * @param domainName The Multipass domain name for identity verification.
     */
    function initialize(
        IMultipass _multipass,
        DistributableGovernanceERC20 _token,
        address _pauser,
        uint256 dailyClaim,
        uint256 dailySupport,
        bytes32 domainName
    ) public initializer {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        s.multipass = _multipass;
        s.token = _token;
        s.pauser = _pauser;
        s.dailyClaimAmount = dailyClaim;
        s.dailySupportAmount = dailySupport;
        s.domainName = domainName;
        __ReentrancyGuard_init();
        __Pausable_init();
    }

    /**
     * @notice Allows a user to claim their daily tokens and optionally submit a proposal.
     * @dev A user must have a valid Multipass record to call this function. They can only claim once per day.
     * If `data` is provided, it's treated as a proposal. If the proposal is new for the day, it's created.
     * If it's a duplicate of an existing proposal for the day, it's counted as a repost.
     * Claiming also resets the user's daily support allowance.
     * @param data The proposal text. If empty, no proposal is submitted.
     */
    function claim(string memory data) public nonReentrant whenNotPaused {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        LibMultipass.NameQuery memory q = LibMultipass.NameQuery({
            domainName: s.domainName,
            wallet: msg.sender,
            targetDomain: "",
            name: "",
            id: ""
        });
        (bool exists, LibMultipass.Record memory record) = s.multipass.resolveRecord(q);
        require(bytes(data).length <= 1337, "Max Data size 1337, use IPFS link");
        require(exists && record.validUntil > block.timestamp, InvalidSender(exists, record.validUntil));
        uint256 day = currentDay();
        require(s.lastClaimedAt[msg.sender] < day, "Already claimed today");
        s.lastClaimedAt[msg.sender] = day;

        bytes32 hash = keccak256(bytes(data));
        if (s.daily[day].proposals[hash].exists) {
            emit RepostByReposter(msg.sender, day, hash, s.daily[day].proposals[hash].proposer, data);
            emit RepostByProposer(s.daily[day].proposals[hash].proposer, day, hash, msg.sender, data);
            s.proposalGlobalStats[hash].repostedTimes += 1;
        } else {
            if (hash != keccak256("")) {
                s.daily[day].proposals[hash] = LibUBI.DailyProposal({
                    proposal: hash,
                    score: 0,
                    proposer: msg.sender,
                    exists: true
                });
                s.daily[day].proposalCnt++;
                uint256 scoreWhenProposed = s.proposalGlobalStats[hash].aggregateScore;
                s.proposalGlobalStats[hash].proposedTimes += 1;
                emit ProposingByAddress(msg.sender, day, hash, data, scoreWhenProposed);
                emit ProposedTime(hash, s.proposalGlobalStats[hash].proposedTimes);
            }
        }
        s.supportSpent[msg.sender] = 0; // reset support levels spent today
        s.token.mint(msg.sender, s.dailyClaimAmount);
        emit Claimed(msg.sender, s.dailyClaimAmount);
    }

    /**
     * @notice Pauses all contract functions with the whenNotPaused modifier
     * @dev Can only be called by the WorldMultiSig contract
     */
    function pause() public {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        require(msg.sender == s.pauser, "not a pauser");
        _pause();
    }

    /**
     * @notice Pauses all contract functions with the whenNotPaused modifier
     * @dev Can only be called by the WorldMultiSig contract
     */
    function unpause() public {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        require(msg.sender == s.pauser, "not a pauser");
        _unpause();
    }

    /**
     * @notice Allows a user to support one or more proposals from the previous day.
     * @dev This function implements a quadratic voting mechanism where the cost to support is the square of the amount.
     * A user must have claimed their tokens for the current day before they can support proposals.
     * The total support spent cannot exceed the `dailySupportAmount`.
     * Users cannot support their own proposals.
     * @param votes An array of `VoteElement` structs, each containing a proposal hash and the amount of support.
     */
    function support(LibUBI.VoteElement[] memory votes) public nonReentrant whenNotPaused {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        LibMultipass.NameQuery memory q = LibMultipass.NameQuery({
            domainName: s.domainName,
            wallet: msg.sender,
            targetDomain: "",
            name: "",
            id: ""
        });
        (bool exists, LibMultipass.Record memory record) = s.multipass.resolveRecord(q);
        require(exists && record.validUntil > block.timestamp, InvalidSender(exists, record.validUntil));
        uint256 day = currentDay();
        for (uint256 i = 0; i < votes.length; i++) {
            LibUBI.VoteElement memory voteElement = votes[i];
            bool proposalExists = s.daily[day - 1].proposals[voteElement.proposal].exists;
            require(proposalExists, "Proposal is not in daily menu :(");
            address proposer = s.daily[day - 1].proposals[voteElement.proposal].proposer;
            require(voteElement.amount < s.dailySupportAmount, "Daily support limit exceeded");
            require(s.lastClaimedAt[msg.sender] == day, "First must claim");
            require(proposer != msg.sender, "Cannot support yourself");
            require(voteElement.amount < 10000, "amount too large");
            s.supportSpent[msg.sender] += voteElement.amount * voteElement.amount;
            require(s.supportSpent[msg.sender] <= s.dailySupportAmount, "Daily support limit exceeded");
            address user = msg.sender;
            uint256 decimals = s.token.decimals();
            s.token.mint(proposer, voteElement.amount * 10 ** decimals);
            emit VotingByAddress(user, day, voteElement.proposal, voteElement.amount);
            s.proposalGlobalStats[voteElement.proposal].aggregateScore += voteElement.amount;
            s.daily[day - 1].proposals[voteElement.proposal].score += voteElement.amount;
            emit ProposalScoreUpdatedByAddress(
                s.daily[day - 1].proposals[voteElement.proposal].score,
                day,
                proposer,
                voteElement.proposal
            );
            emit ProposalScoreUpdatedByProposal(
                s.daily[day - 1].proposals[voteElement.proposal].score,
                day,
                voteElement.proposal,
                proposer
            );
            emit ProposalLifetimeScore(
                s.proposalGlobalStats[voteElement.proposal].aggregateScore,
                s.proposalGlobalStats[voteElement.proposal].proposedTimes,
                s.proposalGlobalStats[voteElement.proposal].repostedTimes
            );
        }
    }

    /**
     * @notice Calculates the current day based on the block timestamp.
     * @dev The day is calculated as `block.timestamp / 1 days`.
     * @return The current day number.
     */
    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /**
     * @notice Gets the total score for a proposal
     * @param proposal Hash of the proposal to query
     * @return uint256 Current score/votes for the proposal
     */
    function proposalLifetimeStats(bytes32 proposal) public view returns (LibUBI.ProposalGlobalStats memory) {
        return LibUBI.getStorage().proposalGlobalStats[proposal];
    }

    /**
     * @notice Gets the address of the pauser.
     * @return The address with pausing/unpausing permissions.
     */
    function pauser() public view returns (address) {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        return s.pauser;
    }

    /**
     * @notice Gets the Multipass contract instance.
     * @return The `IMultipass` contract instance used for identity checks.
     */
    function multipass() public view returns (IMultipass) {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        return s.multipass;
    }

    /**
     * @notice Gets the governance token contract instance.
     * @return The `DistributableGovernanceERC20` token contract used for UBI.
     */
    function token() public view returns (DistributableGovernanceERC20) {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        return s.token;
    }

    /**
     * @notice Retrieves the main parameters of the UBI system.
     * @return dailyClaimAmount The amount of tokens for a daily claim.
     * @return dailySupportAmount The amount of support points available daily.
     * @return domainName The Multipass domain name.
     */
    function getUBIParams()
        public
        view
        returns (uint256 dailyClaimAmount, uint256 dailySupportAmount, bytes32 domainName)
    {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        dailyClaimAmount = s.dailyClaimAmount;
        dailySupportAmount = s.dailySupportAmount;
        domainName = s.domainName;
    }

    /**
     * @notice Gets the details of a proposal for a specific day.
     * @param hash The hash of the proposal.
     * @param day The day to query.
     * @return A `DailyProposal` struct with the proposal's daily information.
     */
    function getProposalDailyScore(bytes32 hash, uint256 day) public view returns (LibUBI.DailyProposal memory) {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        return s.daily[day].proposals[hash];
    }

    /**
     * @notice Gets the total number of unique proposals for a specific day.
     * @param day The day to query.
     * @return The count of proposals for that day.
     */
    function getProposalsCnt(uint256 day) public view returns (uint256) {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        return s.daily[day].proposalCnt;
    }

    /**
     * @notice Gets the day a user last claimed their tokens.
     * @param user The address of the user to query.
     * @return The day number of the last claim. Returns 0 if never claimed.
     */
    function lastClaimedAt(address user) public view returns (uint256) {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        return s.lastClaimedAt[user];
    }

    /**
     * @notice An alias for `currentDay()`.
     * @return The current day number.
     */
    function getCurrentDay() public view returns (uint256) {
        return currentDay();
    }

    /**
     * @notice Gets the current daily state for a user.
     * @param user The address of the user to query.
     * @return claimedToday A boolean indicating if the user has claimed today.
     * @return supportSpent The amount of support points the user has spent today.
     */
    function getUserState(address user) public view returns (bool claimedToday, uint256 supportSpent) {
        LibUBI.UBIStorage storage s = LibUBI.getStorage();
        claimedToday = s.lastClaimedAt[user] == currentDay() ? true : false;
        supportSpent = s.supportSpent[user];
    }
}
