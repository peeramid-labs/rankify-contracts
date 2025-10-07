// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IRankToken} from "../interfaces/IRankToken.sol";
import "../abstracts/LockableERC1155.sol";
import "@peeramid-labs/eds/src/abstracts/ERC7746Middleware.sol";
import "@peeramid-labs/eds/src/libraries/LibMiddleware.sol";
import {IERC1155} from "@openzeppelin/contracts/interfaces/IERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
//ToDo: it was planned to make it track for highest token users hold (their rank), right now it's not implemented. Yet.

/**
 * @title RankToken
 * @author Peersky
 * @notice RankToken is a composite ERC1155 token that is used to track user ranks
 */
contract RankToken is LockableERC1155, IRankToken, ERC7746Middleware, OwnableUpgradeable {
    struct Storage {
        string _contractURI;
    }

    bytes32 constant RANK_TOKEN_STORAGE_POSITION = keccak256("rank.token.storage.position");

    function getStorage() private pure returns (Storage storage s) {
        bytes32 position = RANK_TOKEN_STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }

    constructor(string memory uri_, string memory cURI, address accessLayer, address owner_) {
        initialize(uri_, cURI, accessLayer, owner_);
    }

    function initialize(
        string memory uri_,
        string memory cURI,
        address accessLayer,
        address owner_
    ) public initializer {
        __Ownable_init(owner_);
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

    function setContractURI(string memory uri_) public onlyOwner {
        getStorage()._contractURI = uri_;
    }

    function setURI(string memory uri_) public onlyOwner {
        _setURI(uri_);
    }
}
