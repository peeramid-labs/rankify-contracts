// // SPDX-License-Identifier: MIT
// pragma solidity =0.8.28;

// import {CloneDistribution} from "@peeramid-labs/eds/src/distributions/CloneDistribution.sol";
// import "@peeramid-labs/eds/src/versioning/LibSemver.sol";
// import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";
// import {IThread} from "../interfaces/IThread.sol";
// /**
//  * @title ArguableVotingTournament Distribution
//  * @notice This contract implements a diamond distribution for the Ethereum Distribution System (EDS).
//  *         It creates and manages instances of ArguableVotingTournament, enabling decentralized
//  *         tournament management with voting capabilities.
//  * @dev This contract follows the Diamond pattern and is designed to be used exclusively by the
//  *      Distributor contract. It manages facets for tournament operations, voting, and game master functions.
//  * @author Peeramid Labs, 2024
//  */
// contract ThreadDistribution is CloneDistribution {
//     using ShortStrings for ShortString;
//     IThread private immutable _thread;

//     ShortString private immutable distributionName;
//     uint256 private immutable distributionVersion;

//     /**
//      * @dev Utility function to convert function signature strings to selectors
//      * @param signature The function signature as a string
//      * @return bytes4 The corresponding function selector
//      */
//     function stringToSelector(string memory signature) private pure returns (bytes4) {
//         return bytes4(keccak256(bytes(signature)));
//     }

//     /**
//      * @dev Constructor for the ThreadDistribution contract
//      * @dev WARNING: distributionName must be less then 31 bytes long to comply with ShortStrings immutable format
//      * @notice Sets up the diamond proxy system with all required facets and initializes core components
//      */
//     constructor(address thread, string memory _distributionName, LibSemver.Version memory version) {
//         _thread = IThread(thread);
//         distributionName = ShortStrings.toShortString(_distributionName);
//         distributionVersion = LibSemver.toUint256(version);
//     }

//     function instantiate(bytes memory) external override returns (address[] memory instances, bytes32, uint256) {
//         return super._instantiate();
//     }

//     function contractURI() public pure virtual override returns (string memory) {
//         return string(abi.encodePacked("Thread"));
//     }

//     function get() public view virtual override returns (address[] memory, bytes32, uint256) {
//         return sources();
//     }

//     function sources() internal view virtual override returns (address[] memory, bytes32, uint256) {
//         address[] memory srcs = new address[](1);
//         srcs[0] = address(_thread);
//         return (srcs, ShortString.unwrap(distributionName), distributionVersion);
//     }
// }
