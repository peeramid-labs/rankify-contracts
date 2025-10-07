// SPDX-License-Identifier: MIT
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

pragma solidity ^0.8.20;

contract MockERC721 is ERC721Burnable, Ownable {
    uint256 numTokens;

    constructor(string memory name_, string memory symbol_, address owner) ERC721(name_, symbol_) Ownable(owner) {
        require(owner != address(0), "MockERC721: must specify owner of the contract");
        numTokens = 0;
    }

    function mint(address to, uint256 tokenId, bytes memory) public onlyOwner {
        require(to != address(0), "MockERC721->mint: Address not specified");
        require(tokenId != 0, "MockERC721->mint: amount not specified");
        _mint(to, tokenId);
        numTokens += 1;
    }

    function mintNext(address to) public onlyOwner {
        require(to != address(0), "MockERC721->mintNext: Address not specified");
        mint(to, numTokens + 1, "");
    }

    function getLastTokenId() public view returns (uint256) {
        return numTokens;
    }

    function levelUp(address to, uint256 id, bytes memory) public onlyOwner {
        burn(id);
        mint(to, id + 1, "");
    }
}
