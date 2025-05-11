// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IFellowship} from "./interfaces/IFellowship.sol";
import "@peeramid-labs/eds/src/middleware/LibMiddleware.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IFellowship} from "./interfaces/IFellowship.sol";
import {RankToken} from "./tokens/RankToken.sol";
import "@peeramid-labs/eds/src/middleware/InstallerClonable.sol";
import "./libraries/LibACID.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {LibACID} from "./libraries/LibACID.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
//ToDo: it was planned to make it track for highest token users hold (their rank), right now it's not implemented. Yet.

/**
 * @title RankToken
 * @author Peersky
 * @notice RankToken is a composite ERC1155 token that is used to track user ranks
 */
contract Fellowship is InstallerClonable, IFellowship, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using LibACID for LibACID.ACID;
    struct FellowshipStorage {
        LibACID.ACID acid;
        string _contractURI;
        address _branchToken;
        RankToken rankToken;
    }

    bytes32 constant FELLOWSHIP_STORAGE_POSITION = keccak256("fellowship.storage.position");

    function getFellowshipStorage() private pure returns (FellowshipStorage storage s) {
        bytes32 position = FELLOWSHIP_STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    constructor(
        uint128 principalCost,
        uint256 principalTime,
        address competenceAsset,
        address rootAsset,
        address derivedAsset,
        uint32 minTournamentSize,
        uint64 exitRate,
        address[] memory receivers,
        uint256[] memory receiverShares
    ) {
        initialize(
            principalCost,
            principalTime,
            competenceAsset,
            rootAsset,
            derivedAsset,
            minTournamentSize,
            exitRate,
            receivers,
            receiverShares
        );
    }

    function initialize(
        uint128 principalCost,
        uint256 principalTime,
        address competenceAsset,
        address rootAsset,
        address derivedAsset,
        uint32 minTournamentSize,
        uint64 exitRate,
        address[] memory receivers,
        uint256[] memory receiverShares
    ) public initializer {
        getFellowshipStorage().acid.initialize(
            principalCost,
            principalTime,
            competenceAsset,
            rootAsset,
            derivedAsset,
            minTournamentSize,
            exitRate,
            receivers,
            receiverShares
        );
    }

    function install(
        IDistributor distributor,
        bytes32 distributionId,
        bytes calldata args,
        string memory tag
    ) external payable returns (uint256 appId) {
        return super._installPublic(distributor, distributionId, args, tag);
    }

    /**
     * @dev External function to create a new game
     * @param args Input parameters for creating a new game
     * @notice This function:
     *         - Validates the contract is initialized
     *         - Processes input parameters
     *         - Creates a new game with specified settings
     * @custom:security nonReentrant
     */
    function _installPublic(
        IDistributor distributor,
        bytes32 distributionId,
        bytes memory args,
        string memory tag
    ) internal virtual override nonReentrant returns (uint256) {
        (uint256 budget, uint256 rank, bytes memory userAppData) = abi.decode(args, (uint256, uint256, bytes));
        LibACID.ACID storage acid = getFellowshipStorage().acid;
        uint256 appId = super._installPublic(distributor, distributionId, userAppData, tag);
        acid.createRecord(rank, appId, budget, msg.sender);
        return appId;
    }

    function claim(address rankReceiver) public nonReentrant {
        FellowshipStorage storage fellowshipStorage = getFellowshipStorage();
        uint256 appId = getAppId(msg.sender);
        require(appId != 0, "not an app");
        fellowshipStorage.acid.finalize(appId, msg.sender, rankReceiver);
    }

    /**
     * @dev Returns the current state of the contract
     * @return LibRankify.InstanceState The current state of the contract
     */
    function getContractState() public view returns (IFellowship.State memory) {
        FellowshipStorage storage fellowshipStorage = getFellowshipStorage();
        return
            IFellowship.State(
                fellowshipStorage.acid.principalCost,
                fellowshipStorage.acid.principalTime,
                address(fellowshipStorage.acid.competenceAsset),
                address(fellowshipStorage.acid.rootAsset),
                address(fellowshipStorage.acid.derivedAsset),
                fellowshipStorage.acid.minTournamentSize,
                fellowshipStorage.acid.exitRate,
                fellowshipStorage.acid.receivers,
                fellowshipStorage.acid.receiverShares
            );
    }

    /**
     * @dev Estimates the price of a game with the specified minimum game time
     * @return uint256 The estimated price of the game
     */
    function estimateThreadPrice(uint256 duration) public view returns (uint256) {
        LibACID.ACID storage state = getFellowshipStorage().acid;
        return LibACID.estimatePrice(state, duration);
    }

    function uninstall(uint256 appId) public onlyOwner {
        super._uninstall(appId);
    }

    function allowDistribution(IDistributor distributor, bytes32 distributionId, string memory tag) public onlyOwner {
        super._allowDistribution(distributor, distributionId, tag);
    }

    function disallowDistribution(
        IDistributor distributor,
        bytes32 distributionId,
        string memory tag
    ) public onlyOwner {
        super._disallowDistribution(distributor, distributionId, tag);
    }

    function whitelistDistributor(IDistributor distributor) public onlyOwner {
        super._allowAllDistributions(distributor);
    }

    function revokeWhitelistedDistributor(IDistributor distributor) public onlyOwner {
        super._disallowAllDistributions(distributor);
    }

    function changeDistributor(uint256 appId, IDistributor newDistributor, bytes[] memory appData) public onlyOwner {
        super._changeDistributor(appId, newDistributor, appData);
    }

    function upgradeApp(uint256 appId, bytes32 migrationId, bytes calldata userCalldata) public onlyOwner {
        super._upgradeApp(appId, migrationId, userCalldata);
    }

    function lockRank(address participant) public {
        FellowshipStorage storage fellowshipStorage = getFellowshipStorage();
        uint256 appId = getAppId(msg.sender);
        uint256 rank = fellowshipStorage.acid.tournaments[appId].level;
        fellowshipStorage.rankToken.lock(participant, rank, 1);
    }
    function unlockRank(address participant) public {
        FellowshipStorage storage fellowshipStorage = getFellowshipStorage();
        uint256 appId = getAppId(msg.sender);
        uint256 rank = fellowshipStorage.acid.tournaments[appId].level;
        fellowshipStorage.rankToken.unlock(participant, rank, 1);
    }

    /**
     * @dev Returns the rank
     * @return uint256 The rank
     */
    function getRank(address appComponent) public view returns (uint256) {
        uint256 appId = getAppId(appComponent);
        if (appId == 0) revert("non app component");
        return getFellowshipStorage().acid.tournaments[appId].level;
    }
}
