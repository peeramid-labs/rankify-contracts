// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IRankToken} from "./interfaces/IRankToken.sol";
import "./abstracts/LockableERC1155.sol";
// import "@peeramid-labs/eds/src/middleware/ERC7746Middleware.sol";
import "@peeramid-labs/eds/src/middleware/LibMiddleware.sol";
import {IERC1155} from "@openzeppelin/contracts/interfaces/IERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IFellowship} from "./interfaces/IFellowship.sol";
import "@peeramid-labs/eds/src/middleware/InstallerClonable.sol";
import "./libraries/LibACID.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {LibACID} from "./libraries/LibACID.sol";
import {BranchToken} from "./tokens/BranchToken.sol";
//Safe transfer
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
//ToDo: it was planned to make it track for highest token users hold (their rank), right now it's not implemented. Yet.

/**
 * @title RankToken
 * @author Peersky
 * @notice RankToken is a composite ERC1155 token that is used to track user ranks
 */
contract Fellowship is
    InstallerClonable,
    IFellowship,
    LockableERC1155,
    IRankToken,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using LibACID for LibACID.ACID;
    struct FellowshipStorage {
        LibACID.ACID acid;
        string _contractURI;
        address _branchToken;
    }

    bytes32 constant FELLOWSHIP_STORAGE_POSITION = keccak256("fellowship.storage.position");

    function getFellowshipStorage() private pure returns (FellowshipStorage storage s) {
        bytes32 position = FELLOWSHIP_STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    constructor(
        string memory uri_,
        string memory cURI,
        address accessLayer,
        address defaultAdmin,
        address branchToken,
        address[] memory receivers,
        uint256[] memory receiverShares,
        uint256 principalCost,
        uint256 principalTime,
        uint256 humanFactor
    ) {
        initialize(
            uri_,
            cURI,
            accessLayer,
            defaultAdmin,
            branchToken,
            receivers,
            receiverShares,
            principalCost,
            principalTime,
            humanFactor
        );
    }

    function initialize(
        string memory uri_,
        string memory cURI,
        address accessLayer,
        address defaultAdmin,
        address branchToken,
        address[] memory receivers,
        uint256[] memory receiverShares,
        uint256 principalCost,
        uint256 principalTime,
        uint256 humanFactor
    ) public initializer {
        __Ownable_init(defaultAdmin);
        _setURI(uri_);
        getFellowshipStorage()._contractURI = cURI;
        //address[] memory receivers, uint256[] memory receiverShares, uint256 principalCost, uint256 principalTime, uint256 humanFactor
        getFellowshipStorage().acid.initialize(receivers, receiverShares, principalCost, principalTime, humanFactor);
        LibMiddleware.LayerStruct[] memory layers = new LibMiddleware.LayerStruct[](1);
        getFellowshipStorage()._branchToken = branchToken;

        // Set the layer for the sender
        layers[0] = LibMiddleware.LayerStruct({layerAddress: accessLayer, layerConfigData: ""});
        LibMiddleware.setLayers(layers);
    }

    // function getRankingInstance() public view returns (address) {
    //     return getFellowshipStorage().rankingInstance;
    // }

    function contractURI() public view returns (string memory) {
        return getFellowshipStorage()._contractURI;
    }

    function setURI(string memory uri_) public {
        _setURI(uri_);
    }

    function setContractURI(string memory uri_) public {
        getFellowshipStorage()._contractURI = uri_;
    }

    function mint(address to, uint256 amount, uint256 level, bytes memory data) public {
        require(to != address(0), "RankToken->mint: Address not specified");
        require(amount != 0, "RankToken->mint: amount not specified");
        require(level != 0, "RankToken->mint: pool id not specified");
        _mint(to, level, amount, data);
    }

    function lock(address account, uint256 id, uint256 amount) public override(LockableERC1155, ILockableERC1155) {
        FellowshipStorage storage fellowshipStorage = getFellowshipStorage();
        uint256 appId = getAppId(msg.sender);
        require(appId != 0, "not an app");
        require(fellowshipStorage.acid.tournaments[appId].finalized == false, "Tournament already finalized");
        super.lock(account, id, amount);
    }

    function unlock(address account, uint256 id, uint256 amount) public override(LockableERC1155, ILockableERC1155) {
        super.unlock(account, id, amount);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        super._update(from, to, ids, values);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC1155Upgradeable) returns (bool) {
        return interfaceId == type(IRankToken).interfaceId || super.supportsInterface(interfaceId);
    }

    function burn(address account, uint256 id, uint256 value) public override(LockableERC1155, ILockableERC1155) {
        super.burn(account, id, value);
    }

    /**
     * @dev Internal function to create a new game with the specified parameters
     * @notice This function handles the core game creation logic, including:
     *         - Setting up the game state
     *         - Configuring the coin vending system
     *         - Emitting the game creation event
     */
    // function createThread(LibRankify.NewGameParams memory params) private nonReentrant {
    //     //TODO: add this back in start  game to verify commitment from game master
    //     //  bytes32 digest = _hashTypedDataV4(
    //     //     keccak256(
    //     //         abi.encode(
    //     //             keccak256(
    //     //                 "AttestGameCreation(uint256 gameId,uint256 commitment)"
    //     //             ),
    //     //             params.gameId,
    //     //             params.gmCommitment
    //     //         )
    //     //     )
    //     // );

    //     LibRankify.newGame(params);
    //     LibCoinVending.ConfigPosition memory emptyConfig;
    //     LibCoinVending.configure(bytes32(params.gameId), emptyConfig);
    //     emit gameCreated(params.gameId, params.gameMaster, msg.sender, params.gameRank);
    // }

    function tokenUpgrade(address rankReceiver, uint256 level) private {
        if (level > 1) _burn(rankReceiver, level - 1, 1);
        mint(rankReceiver, 1, level, "");
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
        fellowshipStorage.acid.finalize(appId, msg.sender, rankReceiver, tokenUpgrade);
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
                fellowshipStorage.acid.competenceAsset,
                fellowshipStorage.acid.rootAsset,
                fellowshipStorage.acid.receivers,
                fellowshipStorage.acid.receiverShares,
                fellowshipStorage.acid.humanFactor,
                fellowshipStorage._contractURI,
                fellowshipStorage._branchToken
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

    function redeem(uint256 rankId, uint256 amount) external nonReentrant {
        require(amount != 0, "cannot specify zero exit amount");
        FellowshipStorage storage fellowshipStorage = getFellowshipStorage();
        BranchToken tokenContract = BranchToken(fellowshipStorage._branchToken);
        uint256 _toMint = amount *
            (fellowshipStorage.acid.principalCost * (fellowshipStorage.acid.humanFactor ** rankId));
        burn(msg.sender, rankId, amount);
        tokenContract.mint(msg.sender, _toMint);
        emit RankTokenExited(msg.sender, rankId, amount, _toMint);
    }

    function uninstall(uint256 appId) public onlyOwner {
        super._uninstall(appId);
    }

    function allowDistribution(IDistributor distributor, bytes32 distributionId, string memory tag) public onlyOwner {
        super._allowDistribution(distributor, distributionId, tag);
    }

    function disallowDistribution(IDistributor distributor, bytes32 distributionId, string memory tag) public onlyOwner {
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
        super.lock(participant, rank, 1);
    }
    function unlockRank(address participant) public {
        FellowshipStorage storage fellowshipStorage = getFellowshipStorage();
        uint256 appId = getAppId(msg.sender);
        uint256 rank = fellowshipStorage.acid.tournaments[appId].level;
        super.unlock(participant, rank, 1);
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
