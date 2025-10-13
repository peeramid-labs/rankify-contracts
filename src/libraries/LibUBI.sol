// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@peeramid-labs/multipass/src/interfaces/IMultipass.sol";
import "@peeramid-labs/multipass/src/libraries/LibMultipass.sol";
import "../tokens/DistributableGovernanceERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

library LibUBI {
    /// @notice Storage slot for the diamond storage pattern
    bytes32 private constant UBIStorageLocation =
        keccak256(abi.encode(uint256(keccak256("UBI.storage")) - 1)) & ~bytes32(uint256(0xff));

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

    struct ProposalGlobalStats {
        uint256 aggregateScore;
        uint256 proposedTimes;
        uint256 repostedTimes;
    }
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
    function getStorage() internal pure returns (UBIStorage storage s) {
        bytes32 position = UBIStorageLocation;
        assembly {
            s.slot := position
        }
    }
}
