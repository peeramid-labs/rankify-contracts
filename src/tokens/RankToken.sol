// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../abstracts/LockableERC1155.sol";
import {IERC1155} from "@openzeppelin/contracts/interfaces/IERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../abstracts/ERC7572.sol";
//ToDo: it was planned to make it track for highest token users hold (their rank), right now it's not implemented. Yet.

interface IERC20Mintable {
    function mint(address to, uint256 amount) external;
}

/**
 * @title RankToken
 * @author Peersky
 * @notice RankToken is a composite ERC1155 token that is used to track user ranks
 */
contract RankToken is LockableERC1155, OwnableUpgradeable, ReentrancyGuardUpgradeable, ERC7572 {
    constructor(string memory uri_, string memory cURI) {
        initialize(uri_, cURI);
    }

    function initialize(string memory uri_, string memory cURI) public initializer {
        _setURI(uri_);
        _setContractURI(cURI);
    }

    function setURI(string memory uri_) public {
        _setURI(uri_);
    }

    function mint(address to, uint256 amount, uint256 level, bytes memory data) public {
        require(to != address(0), "RankToken->mint: Address not specified");
        require(amount != 0, "RankToken->mint: amount not specified");
        require(level != 0, "RankToken->mint: pool id not specified");
        _mint(to, level, amount, data);
    }

    function lock(address account, uint256 id, uint256 amount) public override(LockableERC1155) {
        super.lock(account, id, amount);
    }

    function unlock(address account, uint256 id, uint256 amount) public override(LockableERC1155) {
        super.unlock(account, id, amount);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        super._update(from, to, ids, values);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165, ERC1155Upgradeable) returns (bool) {
        return interfaceId == type(IERC1155).interfaceId || super.supportsInterface(interfaceId);
    }

    function burn(address account, uint256 id, uint256 value) public override(LockableERC1155) {
        super.burn(account, id, value);
    }
}
