// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "@peeramid-labs/eds/src/abstracts/CloneDistribution.sol";
import "../vendor/diamond/DiamondClonable.sol";
import "../vendor/diamond/facets/DiamondCutFacet.sol";

/**
 * @title Diamond Proxy Distribution
 * @notice This contract is EDS compatible factory for diamond proxies
 * @dev This uses modified version of Diamond Proxy, which allows proxy itself to cloned
 * @author Peeramid Labs, 2024
 */
contract DiamondDistribution is CloneDistribution {
    address private immutable _reference;

    constructor(address owner) {
        address diamondCutFacet = address(new DiamondCutFacet());
        // Deploy the diamond proxy contract
        address diamondProxy = address(new DiamondClonable(owner, diamondCutFacet));
        _reference = diamondProxy;
    }

    function instantiate(bytes memory) external virtual override returns (address[] memory, bytes32, uint256) {
        return super._instantiate();
    }

    function sources() internal view virtual override returns (address[] memory, bytes32 name, uint256 version) {
        address[] memory _sources = new address[](1);
        _sources[0] = _reference;
        return (_sources, bytes32(abi.encodePacked("DiamondDistribution")), uint256(0));
    }

    function contractURI() public pure virtual override returns (string memory) {
        return "";
    }
}
