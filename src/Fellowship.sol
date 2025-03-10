// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
// import {IRankifyInstance} from "../interfaces/IRankifyInstance.sol";

// import {IERC1155Receiver} from "../interfaces/IERC1155Receiver.sol";
// import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
// import "../abstracts/DiamondReentrancyGuard.sol";
// import {LibRankify} from "../libraries/LibRankify.sol";
// import {LibCoinVending} from "../libraries/LibCoinVending.sol";
// import "@openzeppelin/contracts/utils/Strings.sol";
// import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
// import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
// import "../abstracts/draft-EIP712Diamond.sol";
// import "hardhat/console.sol";
// import {IErrors} from "../interfaces/IErrors.sol";
// import {IRankToken} from "../interfaces/IRankToken.sol";
// import {DistributableGovernanceERC20} from "../tokens/DistributableGovernanceERC20.sol";
// /**
//  * @title RankifyInstanceMainFacet
//  * @notice Main facet for the Rankify protocol that handles game creation and management
//  * @dev Implements core game functionality, ERC token receivers, and reentrancy protection
//  * @author Peeramid Labs, 2024
//  */
// contract RankifyInstanceMainFacet is
//     IRankifyInstance,
//     IERC1155Receiver,
//     DiamondReentrancyGuard,
//     IERC721Receiver,
//     EIP712,
//     IErrors
// {
//     using LibTBG for LibTBG.Instance;
//     using LibTBG for uint256;
//     using LibTBG for LibTBG.Settings;
//     using LibRankify for uint256;

//     /**
//      * @dev Internal function to create a new game with the specified parameters
//      * @param params Struct containing all necessary parameters for game creation
//      * @notice This function handles the core game creation logic, including:
//      *         - Setting up the game state
//      *         - Configuring the coin vending system
//      *         - Emitting the game creation event
//      */
//     function createGame(LibRankify.NewGameParams memory params) private nonReentrant {
//         //TODO: add this back in start  game to verify commitment from game master
//         //  bytes32 digest = _hashTypedDataV4(
//         //     keccak256(
//         //         abi.encode(
//         //             keccak256(
//         //                 "AttestGameCreation(uint256 gameId,uint256 commitment)"
//         //             ),
//         //             params.gameId,
//         //             params.gmCommitment
//         //         )
//         //     )
//         // );

//         LibRankify.newGame(params);
//         LibCoinVending.ConfigPosition memory emptyConfig;
//         LibCoinVending.configure(bytes32(params.gameId), emptyConfig);
//         emit gameCreated(params.gameId, params.gameMaster, msg.sender, params.gameRank);
//     }

//     /**
//      * @dev External function to create a new game
//      * @param params Input parameters for creating a new game
//      * @notice This function:
//      *         - Validates the contract is initialized
//      *         - Processes input parameters
//      *         - Creates a new game with specified settings
//      * @custom:security nonReentrant
//      */
//     function createGame(IRankifyInstance.NewGameParamsInput memory params) public {
//         LibRankify.enforceIsInitialized();
//         LibRankify.InstanceState storage settings = LibRankify.instanceState();
//         LibRankify.NewGameParams memory newGameParams = LibRankify.NewGameParams({
//             gameId: settings.numGames + 1,
//             gameRank: params.gameRank,
//             creator: msg.sender,
//             minPlayerCnt: params.minPlayerCnt,
//             maxPlayerCnt: params.maxPlayerCnt,
//             gameMaster: params.gameMaster,
//             nTurns: params.nTurns,
//             voteCredits: params.voteCredits,
//             minGameTime: params.minGameTime,
//             timePerTurn: params.timePerTurn,
//             timeToJoin: params.timeToJoin,
//             metadata: params.metadata
//         });

//         createGame(newGameParams);
//     }



//     /**
//      * @dev Returns the current state of the contract
//      * @return LibRankify.InstanceState The current state of the contract
//      */
//     function getContractState() public pure returns (LibRankify.InstanceState memory) {
//         LibRankify.InstanceState memory state = LibRankify.instanceState();
//         return state;
//     }


//     /**
//      * @dev Estimates the price of a game with the specified minimum game time
//      * @param minGameTime The minimum game time
//      * @return uint256 The estimated price of the game
//      */
//     function estimateThreadPrice(uint128 minGameTime) public pure returns (uint256) {
//         LibRankify.InstanceState memory state = LibRankify.instanceState();
//         return LibRankify.getGamePrice(minGameTime, state.commonParams);
//     }



//     function exitRankToken(uint256 rankId, uint256 amount) external {
//         require(amount != 0, "cannot specify zero exit amount");
//         LibRankify.InstanceState storage state = LibRankify.instanceState();
//         LibRankify.CommonParams storage commons = state.commonParams;
//         IRankToken rankContract = IRankToken(commons.rankTokenAddress);
//         DistributableGovernanceERC20 tokenContract = DistributableGovernanceERC20(commons.derivedToken);
//         uint256 _toMint = amount * (commons.principalCost * (commons.minimumParticipantsInCircle ** rankId));
//         rankContract.burn(msg.sender, rankId, amount);
//         tokenContract.mint(msg.sender, _toMint);
//         emit RankTokenExited(msg.sender, rankId, amount, _toMint);
//     }

// }
