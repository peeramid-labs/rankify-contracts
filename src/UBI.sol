// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@peeramid-labs/multipass/src/interfaces/IMultipass.sol";
import "@peeramid-labs/multipass/src/libraries/LibMultipass.sol";
import "./tokens/DistributableGovernanceERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

contract UBI is ReentrancyGuardUpgradeable, PausableUpgradeable, OwnableUpgradeable {
    /**
     * @notice Structure representing a vote for a proposal
     * @param proposal Hash of the proposal being voted on
     * @param amount Amount of voting power allocated to this proposal
     */
    struct VoteElement {
        bytes32 proposal;
        uint256 amount;
    }

    /**
     * @notice Structure representing a single proposal in the system
     * @param proposal Hash of the proposal text
     * @param score Current score/votes accumulated for this proposal
     * @param proposer Address of the account that submitted the proposal
     * @param exists Boolean to track if this proposal exists (used for lookups)
     */
    struct DailyProposal {
        bytes32 proposal;
        uint256 score;
        address proposer;
        bool exists;
    }

    /**
     * @notice Structure to track proposals for a specific day
     * @param proposals Mapping from proposal hash to DailyProposal data
     * @param proposalCnt Number of proposals submitted on this day
     */
    struct Daily {
        mapping(bytes32 proposal => DailyProposal) proposals;
        uint256 proposalCnt;
    }

    error InvalidSender(bool recordFound, uint256 validUtil);
    event Claimed(address indexed user, uint256 amount);

    struct UBIStorage {
        IMultipass multipass;
        DistributableGovernanceERC20 token;
        bytes32 domainName;
        uint256 dailyClaimAmount;
        uint256 dailySupportAmount;
        mapping(address => uint256) lastClaimedAt;
        mapping(address => uint256) supportSpent;
        mapping(uint256 day => Daily) daily;
        mapping(bytes32 proposal => uint256 score) proposalScores;
        uint256 lastProposalDay;
        address pauser;
    }

    /**
     * @notice Event emitted when a user votes on proposals
     * @param participant Address of the voter
     * @param day Day number when the vote was cast
     * @param proposal Hash of the proposal being voted on
     * @param amount Amount of voting power allocated
     */
    event VotingByAddress(address indexed participant, uint256 indexed day, bytes32 indexed proposal, uint256 amount);

    event ProposalScoreUpdatedByAddress(
        uint256 indexed score,
        uint256 indexed day,
        address indexed proposer,
        bytes32 proposal
    );
    event ProposalScoreUpdatedByProposal(
        uint256 indexed score,
        uint256 indexed day,
        bytes32 indexed proposal,
        address proposer
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

    event RepostByReposter(
        address indexed proposer,
        uint256 indexed day,
        bytes32 indexed proposal,
        address reposter,
        string proposalText
    );
    event RepostByProposer(
        address indexed reposter,
        uint256 indexed day,
        bytes32 indexed proposal,
        address proposer,
        string proposalText
    );
    /// @notice Storage slot for the diamond storage pattern
    bytes32 private constant UBIStorageLocation =
        keccak256(abi.encode(uint256(keccak256("UBI.storage")) - 1)) & ~bytes32(uint256(0xff));

    function getStorage() private pure returns (UBIStorage storage s) {
        bytes32 position = UBIStorageLocation;
        assembly {
            s.slot := position
        }
    }

    /**
     * @notice Constructor
     * @dev Intentionally empty as initialization happens in initialize()
     */
    constructor(bool isTest) {
        if (!isTest) {
            _disableInitializers();
        }
    }

    function initialize(
        IMultipass _multipass,
        DistributableGovernanceERC20 _token,
        address _pauser,
        address _owner,
        uint256 dailyClaim,
        uint256 dailySupport,
        bytes32 domainName
    ) public initializer {
        UBIStorage storage s = getStorage();
        s.multipass = _multipass;
        s.token = _token;
        s.pauser = _pauser;
        s.dailyClaimAmount = dailyClaim;
        s.dailySupportAmount = dailySupport;
        s.domainName = domainName;
        __ReentrancyGuard_init();
        __Pausable_init();
        __Ownable_init(_owner);
    }

    function claim(string memory data) public nonReentrant whenNotPaused {
        UBIStorage storage s = getStorage();
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
        } else {
            if (hash != keccak256("")) {
                s.daily[day].proposals[hash] = DailyProposal({
                    proposal: hash,
                    score: 0,
                    proposer: msg.sender,
                    exists: true
                });
                s.daily[day].proposalCnt++;
                uint256 scoreWhenProposed = s.proposalScores[hash];
                emit ProposingByAddress(msg.sender, day, hash, data, scoreWhenProposed);
            }
        }

        s.token.mint(msg.sender, s.dailyClaimAmount);
        emit Claimed(msg.sender, s.dailyClaimAmount);
    }

    /**
     * @notice Pauses all contract functions with the whenNotPaused modifier
     * @dev Can only be called by the WorldMultiSig contract
     */
    function pause() public {
        UBIStorage storage s = getStorage();
        require(msg.sender == s.pauser, "not a pauser");
        _pause();
    }

    /**
     * @notice Pauses all contract functions with the whenNotPaused modifier
     * @dev Can only be called by the WorldMultiSig contract
     */
    function unpause() public {
        UBIStorage storage s = getStorage();
        require(msg.sender == s.pauser, "not a pauser");
        _unpause();
    }

    function support(VoteElement[] memory votes) public nonReentrant whenNotPaused {
        UBIStorage storage s = getStorage();
        LibMultipass.NameQuery memory q = LibMultipass.NameQuery({
            domainName: s.domainName,
            wallet: msg.sender,
            targetDomain: "",
            name: "",
            id: ""
        });
        (bool exists, LibMultipass.Record memory record) = s.multipass.resolveRecord(q);
        require(exists && record.validUntil > block.timestamp, InvalidSender(exists, record.validUntil));
        uint256 totalSpent = s.supportSpent[msg.sender];
        uint256 day = currentDay();
        for (uint256 i = 0; i < votes.length; i++) {
            VoteElement memory voteElement = votes[i];
            bool proposalExists = s.daily[day - 1].proposals[voteElement.proposal].exists;
            require(proposalExists, "Proposal is not in daily menu :(");
            address proposer = s.daily[day - 1].proposals[voteElement.proposal].proposer;
            require(voteElement.amount < s.dailySupportAmount, "Daily support limit exceeded");
            require(s.lastClaimedAt[msg.sender] == day, "Can support only active claimers");
            require(proposer != msg.sender, "Cannot support yourself");
            totalSpent += voteElement.amount * voteElement.amount;
            require(totalSpent <= s.dailySupportAmount, "Daily support limit exceeded");
            address user = msg.sender;
            s.token.mint(proposer, voteElement.amount);
            emit VotingByAddress(user, day, voteElement.proposal, voteElement.amount);
            s.proposalScores[voteElement.proposal] += voteElement.amount;
            s.daily[day - 1].proposals[voteElement.proposal].score += voteElement.amount;
            emit ProposalScoreUpdatedByAddress(
                s.proposalScores[voteElement.proposal],
                day,
                proposer,
                voteElement.proposal
            );
            emit ProposalScoreUpdatedByProposal(
                s.proposalScores[voteElement.proposal],
                day,
                voteElement.proposal,
                proposer
            );
        }
        s.dailySupportAmount -= totalSpent;
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /**
     * @notice Gets the total score for a proposal
     * @param proposal Hash of the proposal to query
     * @return uint256 Current score/votes for the proposal
     */
    function proposalScores(bytes32 proposal) public view returns (uint256) {
        return getStorage().proposalScores[proposal];
    }

    function pauser() public view returns (address) {
        UBIStorage storage s = getStorage();
        return s.pauser;
    }

    function multipass() public view returns (IMultipass) {
        UBIStorage storage s = getStorage();
        return s.multipass;
    }

     function token() public view returns (DistributableGovernanceERC20) {
        UBIStorage storage s = getStorage();
        return s.token;
    }

}
