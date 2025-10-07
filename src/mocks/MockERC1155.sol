// SPDX-License-Identifier: MIT
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.20;

contract MockERC1155 is ERC1155Burnable, Ownable {
    constructor(string memory uri_, address owner) ERC1155(uri_) Ownable(owner) {
        require(owner != address(0), "must specify owner of the contract");
    }

    function mint(address to, uint256 amount, uint256 poolId, bytes memory data) public onlyOwner {
        require(to != address(0), "MockERC1155->mint: Address not specified");
        require(amount != 0, "MockERC1155->mint: amount not specified");
        require(poolId != 0, "MockERC1155->mint: pool id not specified");
        _mint(to, poolId, amount, data);
    }

    function batchMint(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) public onlyOwner {
        require(to != address(0), "MockERC1155->batchMint: Address not specified");
        require(amounts.length != 0, "MockERC1155->batchMint: amount not specified");
        require(ids.length != 0, "MockERC1155->batchMint: pool id not specified");
        _mintBatch(to, ids, amounts, data);
    }

    function levelUp(address to, uint256 id, bytes memory data) public onlyOwner {
        _burn(to, id, 1);
        _mint(to, id + 1, 1, data);
    }
}
