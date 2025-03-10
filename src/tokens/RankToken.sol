// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IRankToken} from "../interfaces/IRankToken.sol";
import "../abstracts/LockableERC1155.sol";
import "@peeramid-labs/eds/src/abstracts/ERC7746Middleware.sol";
import "@peeramid-labs/eds/src/libraries/LibMiddleware.sol";
import {IERC1155} from "@openzeppelin/contracts/interfaces/IERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IFellowship} from "../interfaces/IFellowship.sol";
import "@peeramid-labs/eds/src/abstracts/InstallerCloneable.sol";
//ToDo: it was planned to make it track for highest token users hold (their rank), right now it's not implemented. Yet.

/**
 * @title RankToken
 * @author Peersky
 * @notice RankToken is a composite ERC1155 token that is used to track user ranks
 */
contract RankToken is InstallerClonable, IFellowship, LockableERC1155, IRankToken, ERC7746Middleware {
    struct Storage {
        string _contractURI;
    }

    bytes32 constant RANK_TOKEN_STORAGE_POSITION = keccak256("rank.token.storage.position");

    function getStorage() private pure returns (Storage storage s) {
        bytes32 position = LOCKABLE_TOKEN_STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    constructor(
        string memory uri_,
        string memory cURI,
        address accessLayer,
        address token,
        uint256 defaultCost,
        address defaultAdmin
    ) TokenizedDistributor(token, defaultCost, defaultAdmin) {
        initialize(uri_, cURI, accessLayer, token, defaultCost, defaultAdmin);
    }

    function initialize(string memory uri_, string memory cURI, address accessLayer, address token, uint256 defaultCost, address defaultAdmin) public initializer {
        // __Ownable_init(owner_);
        _setURI(uri_);
        getStorage()._contractURI = cURI;
        LibMiddleware.LayerStruct[] memory layers = new LibMiddleware.LayerStruct[](1);

        // Set the layer for the sender
        layers[0] = LibMiddleware.LayerStruct({layerAddess: accessLayer, layerConfigData: ""});
        LibMiddleware.setLayers(layers);
    }

    // function getRankingInstance() public view returns (address) {
    //     return getStorage().rankingInstance;
    // }

    function contractURI() public view returns (string memory) {
        return getStorage()._contractURI;
    }

    function setURI(string memory uri_) public ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        _setURI(uri_);
    }

    function setContractURI(string memory uri_) public ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        getStorage()._contractURI = uri_;
    }

    function _mintRank(address to, uint256 amount, uint256 level, bytes memory data) private {
        require(to != address(0), "RankToken->mint: Address not specified");
        require(amount != 0, "RankToken->mint: amount not specified");
        require(level != 0, "RankToken->mint: pool id not specified");
        // if (level > topRank) {
        //     topRank = level;
        //     emit Leader(to, level);
        // }
        _mint(to, level, amount, data);
    }

    function mint(
        address to,
        uint256 amount,
        uint256 level,
        bytes memory data
    ) public ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        _mintRank(to, amount, level, data);
    }

    // function updateRankingInstance(address newRankingInstance) public onlyOwner {
    //     require(newRankingInstance != address(0), "must specify ranking instance");
    //     getStorage()._rankingInstance = newRankingInstance;
    //     emit RankingInstanceUpdated(newRankingInstance);
    // }

    function lock(
        address account,
        uint256 id,
        uint256 amount
    ) public override(LockableERC1155, ILockableERC1155) ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        super.lock(account, id, amount);
    }

    function unlock(
        address account,
        uint256 id,
        uint256 amount
    ) public override(LockableERC1155, ILockableERC1155) ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        super.unlock(account, id, amount);
    }

    function batchMint(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        require(to != address(0), "RankToken->mint: Address not specified");
        require(amounts.length != 0, "RankToken->mint: amount not specified");
        require(ids.length != 0, "RankToken->mint: pool id not specified");
        _mintBatch(to, ids, amounts, data);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        super._update(from, to, ids, values);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC1155Upgradeable) returns (bool) {
        return interfaceId == type(IRankToken).interfaceId || super.supportsInterface(interfaceId);
    }

    function burn(
        address account,
        uint256 id,
        uint256 value
    ) public override(LockableERC1155, ILockableERC1155) ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        super.burn(account, id, value);
    }

    /**
     * @dev Internal function to create a new game with the specified parameters
     * @param params Struct containing all necessary parameters for game creation
     * @notice This function handles the core game creation logic, including:
     *         - Setting up the game state
     *         - Configuring the coin vending system
     *         - Emitting the game creation event
     */
    function createThread(LibRankify.NewGameParams memory params) private nonReentrant {
        //TODO: add this back in start  game to verify commitment from game master
        //  bytes32 digest = _hashTypedDataV4(
        //     keccak256(
        //         abi.encode(
        //             keccak256(
        //                 "AttestGameCreation(uint256 gameId,uint256 commitment)"
        //             ),
        //             params.gameId,
        //             params.gmCommitment
        //         )
        //     )
        // );

        LibRankify.newGame(params);
        LibCoinVending.ConfigPosition memory emptyConfig;
        LibCoinVending.configure(bytes32(params.gameId), emptyConfig);
        emit gameCreated(params.gameId, params.gameMaster, msg.sender, params.gameRank);
    }

    /**
     * @dev External function to create a new game
     * @param params Input parameters for creating a new game
     * @notice This function:
     *         - Validates the contract is initialized
     *         - Processes input parameters
     *         - Creates a new game with specified settings
     * @custom:security nonReentrant
     */
    function instantiate(bytes32 id, bytes calldata args) public nonReentrant {
        IRankifyInstance.NewGameParamsInput memory params = abi.decode(args, (IRankifyInstance.NewGameParamsInput));
        // function instantiate() public {
        LibRankify.enforceIsInitialized();
        LibRankify.InstanceState storage settings = LibRankify.instanceState();
        LibRankify.NewGameParams memory newGameParams = LibRankify.NewGameParams({
            gameId: settings.numGames + 1,
            gameRank: params.gameRank,
            creator: msg.sender,
            minPlayerCnt: params.minPlayerCnt,
            maxPlayerCnt: params.maxPlayerCnt,
            gameMaster: params.gameMaster,
            nTurns: params.nTurns,
            voteCredits: params.voteCredits,
            minGameTime: params.minGameTime,
            timePerTurn: params.timePerTurn,
            timeToJoin: params.timeToJoin,
            metadata: params.metadata
        });

        createGame(newGameParams);
    }

    function install(
        IDistributor distributor,
        bytes32 distributionId,
        bytes calldata args
    ) external payable returns (uint256 instanceId)
    {
      return super._install(distributor, distributionId, args);
    }



    /**
     * @dev Returns the current state of the contract
     * @return LibRankify.InstanceState The current state of the contract
     */
    function getContractState() public pure returns (LibRankify.InstanceState memory) {
        LibRankify.InstanceState memory state = LibRankify.instanceState();
        return state;
    }

    /**
     * @dev Estimates the price of a game with the specified minimum game time
     * @param minGameTime The minimum game time
     * @return uint256 The estimated price of the game
     */
    function estimateThreadPrice(uint128 minGameTime) public pure returns (uint256) {
        LibRankify.InstanceState memory state = LibRankify.instanceState();
        return LibRankify.getGamePrice(minGameTime, state.commonParams);
    }

    function exitRankToken(uint256 rankId, uint256 amount) external {
        require(amount != 0, "cannot specify zero exit amount");
        LibRankify.InstanceState storage state = LibRankify.instanceState();
        LibRankify.CommonParams storage commons = state.commonParams;
        IRankToken rankContract = IRankToken(commons.rankTokenAddress);
        DistributableGovernanceERC20 tokenContract = DistributableGovernanceERC20(commons.derivedToken);
        uint256 _toMint = amount * (commons.principalCost * (commons.minimumParticipantsInCircle ** rankId));
        rankContract.burn(msg.sender, rankId, amount);
        tokenContract.mint(msg.sender, _toMint);
        emit RankTokenExited(msg.sender, rankId, amount, _toMint);
    }
}
