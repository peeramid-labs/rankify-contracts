// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../vendor/diamond/DiamondClonable.sol";
import "../vendor/diamond/facets/DiamondCutFacet.sol";
import "./DiamondDistribution.sol";
import "../vendor/diamond/libraries/LibDiamond.sol";
import "../vendor/diamond/interfaces/IDiamondCut.sol";

/**
 * @title Initialized Diamond Proxy Distribution
 * @notice This contract is EDS compatible factory for diamond proxies
 * @dev This allows to store immutable initializer logic for a cloned diamond proxy
 * @author Peeramid Labs, 2024
 */
abstract contract InitializedDiamondDistribution is DiamondDistribution {
    address private immutable initializer;
    bytes4 private immutable initializerSelector;

    constructor(address owner, bytes32 _initializerId, bytes4 _initializerSelector) DiamondDistribution(owner) {
        initializer = getContractsIndex().get(_initializerId);
        initializerSelector = _initializerSelector;
    }

    function initialize(
        DiamondCutFacet instance,
        IDiamondCut.FacetCut[] memory _diamondCut,
        bytes memory args
    ) internal virtual {
        bytes memory _calldata = args.length > 0 ? abi.encodeWithSelector(initializerSelector, args) : bytes("");
        instance.diamondCut(_diamondCut, initializer, _calldata);
    }

    function get() public view virtual override returns (address[] memory, bytes32 name, uint256 version) {
        (address[] memory srcs, , ) = super.sources();
        address[] memory _sources = new address[](2);
        assert(srcs.length == 1);
        _sources[0] = srcs[0];
        _sources[1] = initializer;
        return (srcs, bytes32(abi.encodePacked("InitializedDiamondDistribution")), uint256(0));
    }

    function contractURI() public pure virtual override returns (string memory) {
        return string(abi.encodePacked(super.contractURI(), ";", "InitializedDiamondDistribution")); //ToDo: Add IPFS link with readme!
    }
}
