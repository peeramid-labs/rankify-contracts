// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import "./InitializedDiamondDistribution.sol";
import "../vendor/diamond/facets/DiamondLoupeFacet.sol";
import "../facets/EIP712InspectorFacet.sol";
import "../vendor/diamond/facets/OwnershipFacet.sol";
import "../facets/RankifyInstanceMainFacet.sol";
import "../facets/RankifyInstanceRequirementsFacet.sol";
import "../facets/RankifyInstanceGameMastersFacet.sol";
import "../initializers/RankifyInstanceInit.sol";
import "../vendor/diamond/interfaces/IDiamondCut.sol";
import "@peeramid-labs/eds/src/libraries/LibSemver.sol";
import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";

/**
 * @title ArguableVotingTournament Distribution
 * @notice This contract implements a diamond distribution for the Ethereum Distribution System (EDS).
 *         It creates and manages instances of ArguableVotingTournament, enabling decentralized
 *         tournament management with voting capabilities.
 * @dev This contract follows the Diamond pattern and is designed to be used exclusively by the
 *      Distributor contract. It manages facets for tournament operations, voting, and game master functions.
 * @author Peeramid Labs, 2024
 */
contract ArguableVotingTournament is InitializedDiamondDistribution {
    using ShortStrings for ShortString;
    DiamondLoupeFacet private immutable _loupeFacet;
    EIP712InspectorFacet private immutable _inspectorFacet;
    RankifyInstanceMainFacet private immutable _RankifyMainFacet;
    RankifyInstanceRequirementsFacet private immutable _RankifyReqsFacet;
    RankifyInstanceGameMastersFacet private immutable _RankifyGMFacet;
    OwnershipFacet private immutable _OwnershipFacet;
    address private immutable _initializer;

    ShortString private immutable distributionName;
    uint256 private immutable distributionVersion;

    /**
     * @dev Utility function to convert function signature strings to selectors
     * @param signature The function signature as a string
     * @return bytes4 The corresponding function selector
     */
    function stringToSelector(string memory signature) private pure returns (bytes4) {
        return bytes4(keccak256(bytes(signature)));
    }

    /**
     * @dev Groups the addresses of all required facets for the tournament
     * @notice This struct helps organize the deployment of the diamond proxy system
     */
    struct ArguableTournamentAddresses {
        address loupeFacet;
        address inspectorFacet;
        address RankifyMainFacet;
        address RankifyReqsFacet;
        address RankifyGMFacet;
        address OwnershipFacet;
    }

    /**
     * @dev Constructor for the ArguableVotingTournament contract
     * @dev WARNING: distributionName must be less then 31 bytes long to comply with ShortStrings immutable format
     * @notice Sets up the diamond proxy system with all required facets and initializes core components
     * @dev The initializer function is added as a regular facet to the Diamond Proxy.
     *      Since initialization is handled by the distributor contract, it's expected that
     *      the distributor will remove this facet after successful initialization.
     */
    constructor(
        address initializer,
        bytes4 initializerSelector,
        string memory _distributionName,
        LibSemver.Version memory version,
        ArguableTournamentAddresses memory addresses
    ) InitializedDiamondDistribution(address(this), bytes32(0), initializerSelector) {
        _initializer = initializer;
        _loupeFacet = DiamondLoupeFacet(addresses.loupeFacet);
        _inspectorFacet = EIP712InspectorFacet(addresses.inspectorFacet);
        _RankifyMainFacet = RankifyInstanceMainFacet(addresses.RankifyMainFacet);
        _RankifyReqsFacet = RankifyInstanceRequirementsFacet(addresses.RankifyReqsFacet);
        _RankifyGMFacet = RankifyInstanceGameMastersFacet(addresses.RankifyGMFacet);
        _OwnershipFacet = OwnershipFacet(addresses.OwnershipFacet);

        distributionName = ShortStrings.toShortString(_distributionName);
        // console.log(LibSemver.toString())
        distributionVersion = LibSemver.toUint256(version);
    }

    /**
     * @notice see Ethereum Distribution System IDistribute for interface specification.
     * @return instances Array[8]: [diamond proxy, 8x diamond facets..]
     * @return distributionName: bytes32 encoded name to be used in EIP712 signing flow
     * @return distributionVersion: uint256 encoded distribution version. Can be parsed to eip712 signature with EDS LibSemver
     * @dev   // instances: 0 - diamond; 1 - DiamondLoupeFacet; 2 - EIP712InspectorFacet; 3 - RankifyInstanceMainFacet; 4 - RankifyInstanceRequirementsFacet; 5 - RankifyInstanceGameMastersFacet // 6 - OwnershipFacet
     */
    function instantiate(
        bytes memory ownerEncoded
    ) external override returns (address[] memory instances, bytes32, uint256) {
        address owner = abi.decode(ownerEncoded, (address));
        (address[] memory _instances, , ) = super._instantiate();
        address diamond = _instances[0];
        IDiamondCut.FacetCut[] memory facetCuts = new IDiamondCut.FacetCut[](7);

        bytes4[] memory loupeSelectors = new bytes4[](4);
        loupeSelectors[0] = DiamondLoupeFacet.facets.selector;
        loupeSelectors[1] = DiamondLoupeFacet.facetFunctionSelectors.selector;
        loupeSelectors[2] = DiamondLoupeFacet.facetAddresses.selector;
        loupeSelectors[3] = DiamondLoupeFacet.facetAddress.selector;
        facetCuts[0] = IDiamondCut.FacetCut({
            facetAddress: address(_loupeFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: loupeSelectors
        });

        bytes4[] memory EIP712InspectorFacetSelectors = new bytes4[](2);
        EIP712InspectorFacetSelectors[0] = EIP712InspectorFacet.inspectEIP712Hashes.selector;
        EIP712InspectorFacetSelectors[1] = EIP712InspectorFacet.currentChainId.selector;

        facetCuts[1] = IDiamondCut.FacetCut({
            facetAddress: address(_inspectorFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: EIP712InspectorFacetSelectors
        });
        bytes4[] memory RankifyInstanceMainFacetSelectors = new bytes4[](36);
        RankifyInstanceMainFacetSelectors[0] = RankifyInstanceMainFacet.cancelGame.selector;
        RankifyInstanceMainFacetSelectors[1] = RankifyInstanceMainFacet.gameCreator.selector;
        RankifyInstanceMainFacetSelectors[2] = RankifyInstanceMainFacet.createGame.selector;
        RankifyInstanceMainFacetSelectors[3] = RankifyInstanceMainFacet.leaveGame.selector;
        RankifyInstanceMainFacetSelectors[4] = RankifyInstanceMainFacet.joinGame.selector;
        RankifyInstanceMainFacetSelectors[5] = RankifyInstanceMainFacet.openRegistration.selector;
        RankifyInstanceMainFacetSelectors[6] = RankifyInstanceMainFacet.startGame.selector;
        RankifyInstanceMainFacetSelectors[7] = RankifyInstanceMainFacet.onERC1155BatchReceived.selector;
        RankifyInstanceMainFacetSelectors[8] = RankifyInstanceMainFacet.onERC1155Received.selector;
        RankifyInstanceMainFacetSelectors[9] = RankifyInstanceMainFacet.onERC721Received.selector;
        RankifyInstanceMainFacetSelectors[10] = RankifyInstanceMainFacet.getContractState.selector;
        RankifyInstanceMainFacetSelectors[11] = RankifyInstanceMainFacet.getTurn.selector;
        RankifyInstanceMainFacetSelectors[12] = RankifyInstanceMainFacet.getGM.selector;
        RankifyInstanceMainFacetSelectors[13] = RankifyInstanceMainFacet.getScores.selector;
        RankifyInstanceMainFacetSelectors[14] = RankifyInstanceMainFacet.isOvertime.selector;
        RankifyInstanceMainFacetSelectors[15] = RankifyInstanceMainFacet.isGameOver.selector;
        RankifyInstanceMainFacetSelectors[16] = RankifyInstanceMainFacet.getPlayersGames.selector;
        RankifyInstanceMainFacetSelectors[17] = RankifyInstanceMainFacet.isLastTurn.selector;
        RankifyInstanceMainFacetSelectors[18] = RankifyInstanceMainFacet.isRegistrationOpen.selector;
        RankifyInstanceMainFacetSelectors[19] = RankifyInstanceMainFacet.getGameRank.selector;
        RankifyInstanceMainFacetSelectors[20] = RankifyInstanceMainFacet.getPlayers.selector;
        RankifyInstanceMainFacetSelectors[21] = RankifyInstanceMainFacet.canStartGame.selector;
        RankifyInstanceMainFacetSelectors[22] = RankifyInstanceMainFacet.canEndVotingStage.selector;
        RankifyInstanceMainFacetSelectors[23] = RankifyInstanceMainFacet.isPlayerTurnComplete.selector;
        RankifyInstanceMainFacetSelectors[24] = RankifyInstanceMainFacet.getPlayerVotedArray.selector;
        RankifyInstanceMainFacetSelectors[25] = RankifyInstanceMainFacet.getPlayersMoved.selector;
        RankifyInstanceMainFacetSelectors[26] = RankifyInstanceMainFacet.estimateGamePrice.selector;
        RankifyInstanceMainFacetSelectors[27] = RankifyInstanceMainFacet.isActive.selector;
        RankifyInstanceMainFacetSelectors[28] = RankifyInstanceMainFacet.exitRankToken.selector;
        RankifyInstanceMainFacetSelectors[29] = RankifyInstanceMainFacet.gameWinner.selector;
        RankifyInstanceMainFacetSelectors[30] = RankifyInstanceMainFacet.isPlayerInGame.selector;
        RankifyInstanceMainFacetSelectors[31] = RankifyInstanceMainFacet.createAndOpenGame.selector;
        RankifyInstanceMainFacetSelectors[32] = RankifyInstanceMainFacet.setJoinRequirements.selector;
        RankifyInstanceMainFacetSelectors[33] = RankifyInstanceMainFacet.canEndProposingStage.selector;
        RankifyInstanceMainFacetSelectors[34] = RankifyInstanceMainFacet.isProposingStage.selector;
        RankifyInstanceMainFacetSelectors[35] = RankifyInstanceMainFacet.isVotingStage.selector;

        facetCuts[2] = IDiamondCut.FacetCut({
            facetAddress: address(_RankifyMainFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: RankifyInstanceMainFacetSelectors
        });

        bytes4[] memory RankifyInstanceRequirementsFacetSelectors = new bytes4[](6);
        RankifyInstanceRequirementsFacetSelectors[0] = RankifyInstanceRequirementsFacet.getJoinRequirements.selector;
        RankifyInstanceRequirementsFacetSelectors[1] = RankifyInstanceRequirementsFacet
            .getJoinRequirementsByToken
            .selector;
        RankifyInstanceRequirementsFacetSelectors[2] = RankifyInstanceRequirementsFacet.getGameState.selector;
        RankifyInstanceRequirementsFacetSelectors[3] = RankifyInstanceRequirementsFacet.getCommonParams.selector;
        RankifyInstanceRequirementsFacetSelectors[4] = RankifyInstanceRequirementsFacet.getPullableEth.selector;
        RankifyInstanceRequirementsFacetSelectors[5] = RankifyInstanceRequirementsFacet.pullEth.selector;

        facetCuts[3] = IDiamondCut.FacetCut({
            facetAddress: address(_RankifyReqsFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: RankifyInstanceRequirementsFacetSelectors
        });

        bytes4[] memory RankifyInstanceGameMastersFacetSelectors = new bytes4[](5);
        RankifyInstanceGameMastersFacetSelectors[0] = RankifyInstanceGameMastersFacet.submitVote.selector;
        RankifyInstanceGameMastersFacetSelectors[1] = RankifyInstanceGameMastersFacet.submitProposal.selector;
        RankifyInstanceGameMastersFacetSelectors[2] = RankifyInstanceGameMastersFacet.endVoting.selector;
        RankifyInstanceGameMastersFacetSelectors[3] = RankifyInstanceGameMastersFacet.endProposing.selector;
        RankifyInstanceGameMastersFacetSelectors[4] = RankifyInstanceGameMastersFacet.forceEndStaleGame.selector;

        facetCuts[4] = IDiamondCut.FacetCut({
            facetAddress: address(_RankifyGMFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: RankifyInstanceGameMastersFacetSelectors
        });

        bytes4[] memory OwnershipFacetSelectors = new bytes4[](2);
        OwnershipFacetSelectors[0] = _OwnershipFacet.transferOwnership.selector;
        OwnershipFacetSelectors[1] = _OwnershipFacet.owner.selector;

        facetCuts[5] = IDiamondCut.FacetCut({
            facetAddress: address(_OwnershipFacet),
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: OwnershipFacetSelectors
        });
        bytes4[] memory initializerSelectors = new bytes4[](1);
        initializerSelectors[0] = RankifyInstanceInit.init.selector;
        facetCuts[6] = IDiamondCut.FacetCut({
            facetAddress: _initializer,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: initializerSelectors
        });

        super.initialize(DiamondCutFacet(diamond), facetCuts, "");
        address[] memory returnValue = new address[](8);
        returnValue[0] = diamond;
        returnValue[1] = facetCuts[0].facetAddress;
        returnValue[2] = facetCuts[1].facetAddress;
        returnValue[3] = facetCuts[2].facetAddress;
        returnValue[4] = facetCuts[3].facetAddress;
        returnValue[5] = facetCuts[4].facetAddress;
        returnValue[6] = facetCuts[5].facetAddress;
        returnValue[7] = facetCuts[6].facetAddress;
        //renouncing ownership
        OwnershipFacet(diamond).transferOwnership(owner);

        return (returnValue, ShortString.unwrap(distributionName), distributionVersion);
    }

    function contractURI() public pure virtual override returns (string memory) {
        return string(abi.encodePacked(super.contractURI(), ";", "ArguableVotingTournament"));
    }

    function sources() internal view virtual override returns (address[] memory, bytes32, uint256) {
        (address[] memory srcs, , ) = super.sources();
        return (srcs, ShortString.unwrap(distributionName), distributionVersion);
    }
}
