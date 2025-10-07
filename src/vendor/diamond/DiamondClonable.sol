// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Adapted from the Diamond 3 reference implementation by Nick Mudge:
// https://github.com/mudgen/diamond-3-hardhat

import {LibDiamond} from "./libraries/LibDiamond.sol";
import {IDiamondCut} from "./interfaces/IDiamondCut.sol";

/**
 * @title DiamondClonable
 * @notice A modified Diamond implementation that supports cloning for efficient proxy deployment
 * @dev Extends the Diamond pattern to allow the contract to be cloned, reducing gas costs
 *      for deploying multiple instances. Includes core Diamond functionality like cut operations
 *      and function delegation.
 * @author Adapted from Nick Mudge's Diamond implementation by Peeramid Labs, 2024
 */
contract DiamondClonable {
    error functionDoesNotExist(bytes4 selector);
    address private immutable cutFacet;

    constructor(address _contractOwner, address _diamondCutFacet) payable {
        cutFacet = _diamondCutFacet;
        addDiamondCutFacet(_contractOwner);
    }

    function addDiamondCutFacet(address _contractOwner) private {
        LibDiamond.setContractOwner(_contractOwner);
        // Add the diamondCut external function from the diamondCutFacet
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory functionSelectors = new bytes4[](1);

        functionSelectors[0] = IDiamondCut.diamondCut.selector;
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: cutFacet,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: functionSelectors
        });
        LibDiamond.diamondCut(cut, address(0), "");
    }

    // Find facet for function that is called and execute the
    // function if a facet is found and return any value.
    fallback() external payable {
        LibDiamond.DiamondStorage storage ds;
        bytes32 position = LibDiamond.DIAMOND_STORAGE_POSITION;
        // get diamond storage
        assembly {
            ds.slot := position
        }
        // get facet from function selector
        address facet = ds.selectorToFacetAndPosition[msg.sig].facetAddress;
        if (facet == address(0)) {
            if (msg.sig == IDiamondCut.diamondCut.selector) {
                (IDiamondCut.FacetCut[] memory facets, address target, bytes memory data) = abi.decode(
                    msg.data[4:],
                    (IDiamondCut.FacetCut[], address, bytes)
                );
                // diamond was cloned, has no state
                // Owner is inferred from msg.sender
                addDiamondCutFacet(msg.sender);
                LibDiamond.diamondCut(facets, target, data);
                return;
            } else {
                revert functionDoesNotExist(msg.sig);
            }
        }

        // Execute external function from facet using delegatecall and return any value.
        assembly {
            // copy function selector and any arguments
            calldatacopy(0, 0, calldatasize())
            // execute function call using the facet
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            // get any return value
            returndatacopy(0, 0, returndatasize())
            // return any return value or error back to the caller
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    receive() external payable {}
}
