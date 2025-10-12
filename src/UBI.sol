// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@peeramid-labs/multipass/src/interfaces/IMultipass.sol";
import "@peeramid-labs/multipass/src/libraries/LibMultipass.sol";
import "./tokens/DistributableGovernanceERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

contract UBI is ReentrancyGuardUpgradeable, PausableUpgradeable {
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
    struct ProposalGlobalStats {
        uint256 aggregateScore;
        uint256 proposedTimes;
        uint256 repostedTimes;
    }
    event ProposedTime(bytes32 proposalHash, uint256 newTimesProposed);
    struct UBIStorage {
        IMultipass multipass;
        DistributableGovernanceERC20 token;
        bytes32 domainName;
        uint256 dailyClaimAmount;
        uint256 dailySupportAmount;
        mapping(address => uint256) lastClaimedAt;
        mapping(address => uint256) supportSpent;
        mapping(uint256 day => Daily) daily;
        mapping(bytes32 proposalHash => ProposalGlobalStats stats) proposalGlobalStats;
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
        uint256 indexed dailyScore,
        uint256 indexed day,
        address indexed proposer,
        bytes32 proposal
    );
    event ProposalScoreUpdatedByProposal(
        uint256 indexed dailyScore,
        uint256 indexed day,
        bytes32 indexed proposal,
        address proposer
    );

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
            s.proposalGlobalStats[hash].repostedTimes += 1;
        } else {
            if (hash != keccak256("")) {
                s.daily[day].proposals[hash] = DailyProposal({
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
        uint256 day = currentDay();
        for (uint256 i = 0; i < votes.length; i++) {
            VoteElement memory voteElement = votes[i];
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

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /**
     * @notice Gets the total score for a proposal
     * @param proposal Hash of the proposal to query
     * @return uint256 Current score/votes for the proposal
     */
    function proposalLifetimeStats(bytes32 proposal) public view returns (ProposalGlobalStats memory) {
        return getStorage().proposalGlobalStats[proposal];
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

    function getUBIParams()
        public
        view
        returns (uint256 dailyClaimAmount, uint256 dailySupportAmount, bytes32 domainName)
    {
        UBIStorage storage s = getStorage();
        dailyClaimAmount = s.dailyClaimAmount;
        dailySupportAmount = s.dailySupportAmount;
        domainName = s.domainName;
    }

    function getProposalDailyScore(bytes32 hash, uint256 day) public view returns (DailyProposal memory) {
        UBIStorage storage s = getStorage();
        return s.daily[day].proposals[hash];
    }

    function getProposalsCnt(uint256 day) public view returns (uint256) {
        UBIStorage storage s = getStorage();
        return s.daily[day].proposalCnt;
    }

    function lastClaimedAt(address user) public view returns (uint256) {
        UBIStorage storage s = getStorage();
        return s.lastClaimedAt[user];
    }

    function getCurrentDay() public view returns (uint256) {
        return currentDay();
    }

    function getUserState(address user) public view returns (bool claimedToday, uint256 supportSpent) {
        UBIStorage storage s = getStorage();
        claimedToday = s.lastClaimedAt[user] == currentDay() ? true : false;
        supportSpent = s.supportSpent[user];
    }
}
