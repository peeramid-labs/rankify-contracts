// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {BranchToken} from "../tokens/BranchToken.sol";
import {Fellowship} from "../Fellowship.sol";
import "../initializers/RankifyInstanceInit.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";
import "@peeramid-labs/eds/src/versioning/LibSemver.sol";
import "@peeramid-labs/eds/src/erc7744/LibERC7744.sol";
import {IERC7746} from "@peeramid-labs/eds/src/interfaces/IERC7746.sol";
import {IDistributor} from "@peeramid-labs/eds/src/interfaces/IDistributor.sol";
import {UpgradableDistributionsPack} from "@peeramid-labs/eds/src/distributions/UpgradableDistributionsPack.sol";
import {AuthorizationMiddleware} from "@peeramid-labs/eds/src/middleware/AuthorizationMiddleware.sol";
import {IFellowship} from "../interfaces/IFellowship.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {IDistribution} from "@peeramid-labs/eds/src/interfaces/IDistribution.sol";
struct MaoApp {
    Fellowship fellowship;
    BranchToken governanceToken;
    IGovernor dao;
    AuthorizationMiddleware accessManager;
}

/**
 * @title MAODistribution
 * @dev This contract implements the IDistribution and CodeIndexer interfaces. It uses the Clones library for address cloning.
 *
 * @notice The contract is responsible for creating and managing DAOs and Rankify distributions.
 * @author Peeramid Labs, 2024
 */
contract MAODistribution is UpgradableDistributionsPack {
    using LibERC7744 for bytes32;
    using Clones for address;

    struct DistributorArguments {
        string name;
        string symbol;
        uint256 principalCost;
        uint96 principalTimeConstant;
        string rankTokenURI;
        string rankTokenContractURI;
        address owner;
    }

    struct TokenArguments {
        string tokenName;
        string tokenSymbol;
    }

    struct DistributorArguments {
        TokenArguments tokenSettings;
        UserRankifySettings rankifySettings;
    }

    using Clones for address;
    ShortString private immutable _distributionName;
    uint256 private immutable _distributionVersion;
    address private immutable _rankTokenBase;
    IDistribution private immutable _RankifyDistributionBase;
    address private immutable _governanceERC20Base;
    address private immutable _accessManagerBase;
    address private immutable _paymentToken;
    uint256 private immutable _minParticipantsInCircle;
    address private immutable _proposalIntegrityVerifier;
    address private immutable _poseidon5;
    address private immutable _poseidon6;
    address private immutable _poseidon2;
    address private immutable _DAO;
    /**
     * @notice Initializes the contract with the provided parameters and performs necessary checks.
     * @dev Retrieves contract addresses from a contract index using the provided identifiers
     *      and initializes the distribution system.
     * @dev WARNING: distributionName must be less then 31 bytes long to comply with ShortStrings immutable format
     * @param paymentToken Address of the token used for payments in the system
     * @param rankTokenCodeId Identifier for the rank token implementation in CodeIndex
     * @param RankifyDIistributionId Identifier for the Rankify distribution implementation
     * @param accessManagerId Identifier for the access manager implementation
     * @param governanceERC20BaseId Identifier for the governance token implementation
     * @param distributionName Name identifier for this distribution
     * @param distributionVersion Semantic version information as LibSemver.Version struct
     * @param minParticipantsInCircle Minimum number of participants in a circle
     */
    constructor(
        address paymentToken,
        bytes32[] memory zkpVerifier,
        bytes32 rankTokenCodeId,
        bytes32 RankifyDIistributionId,
        bytes32 accessManagerId,
        bytes32 governanceERC20BaseId,
        bytes32 DAOId,
        string memory distributionName,
        LibSemver.Version memory distributionVersion,
        uint256 minParticipantsInCircle
    ) {
        require(minParticipantsInCircle > 2, "minParticipantsInCircle must be greater than 2");
        _minParticipantsInCircle = minParticipantsInCircle;
        _distributionName = ShortStrings.toShortString(distributionName);
        _distributionVersion = LibSemver.toUint256(distributionVersion);
        _rankTokenBase = rankTokenCodeId.getContainerOrThrow();
        _governanceERC20Base = governanceERC20BaseId.getContainerOrThrow();
        _proposalIntegrityVerifier = zkpVerifier[0].getContainerOrThrow();
        _poseidon5 = zkpVerifier[1].getContainerOrThrow();
        _poseidon6 = zkpVerifier[2].getContainerOrThrow();
        _poseidon2 = zkpVerifier[3].getContainerOrThrow();
        _RankifyDistributionBase = IDistribution(RankifyDIistributionId.getContainerOrThrow());
        _accessManagerBase = accessManagerId.getContainerOrThrow();
        _DAO = DAOId.getContainerOrThrow();
        require(
            ERC165Checker.supportsInterface(_accessManagerBase, type(IERC7746).interfaceId),
            "Access manager does not support IERC7746"
        );
    }

    // function createToken(TokenArguments memory args) internal returns (address[] memory instances, bytes32, uint256) {
    //     MintSettings memory mintSettings = MintSettings(new address[](1), new uint256[](1));
    //     mintSettings.receivers[0] = address(this);
    //     mintSettings.amounts[0] = 0;
    //     address token = _governanceERC20Base.clone();
    //     TokenSettings memory tokenSettings = TokenSettings(token, args.tokenName, args.tokenSymbol);

    //     SimpleAccessManager.SimpleAccessManagerInitializer[]
    //         memory govTokenAccessSettings = new SimpleAccessManager.SimpleAccessManagerInitializer[](1);
    //     govTokenAccessSettings[0].selector = BranchToken.mint.selector;
    //     govTokenAccessSettings[0].disallowedAddresses = new address[](1);
    //     govTokenAccessSettings[0].distributionComponentsOnly = true;

    //     SimpleAccessManager govTokenAccessManager = SimpleAccessManager(_accessManagerBase.clone());

    //     govTokenAccessManager.initialize(govTokenAccessSettings, tokenSettings.addr, IDistributor(msg.sender)); // msg.sender must be IDistributor or it will revert
    //     BranchToken(tokenSettings.addr).initialize(
    //         tokenSettings.name,
    //         tokenSettings.symbol,
    //         mintSettings,
    //         address(govTokenAccessManager)
    //     );

    //     address[] memory returnValue = new address[](2);
    //     returnValue[0] = token;
    //     returnValue[1] = address(govTokenAccessManager);

    //     return (returnValue, "OSxDistribution", 1);
    // }

    // function createRankify(
    //     UserRankifySettings memory args,
    //     address derivedToken
    // ) internal returns (address[] memory instances, bytes32, uint256) {
    //     address rankToken = _rankTokenBase.clone();

    //     bytes4[] memory rankTokenSelectors = new bytes4[](6);
    //     rankTokenSelectors[0] = RankToken.mint.selector;
    //     rankTokenSelectors[1] = RankToken.lock.selector;
    //     rankTokenSelectors[2] = RankToken.unlock.selector;
    //     rankTokenSelectors[3] = RankToken.batchMint.selector;
    //     rankTokenSelectors[4] = RankToken.setURI.selector;
    //     rankTokenSelectors[5] = RankToken.setContractURI.selector;
    //     SimpleAccessManager rankTokenAccessManager = SimpleAccessManager(_accessManagerBase.clone());

    //     SimpleAccessManager.SimpleAccessManagerInitializer[]
    //         memory RankTokenAccessSettings = new SimpleAccessManager.SimpleAccessManagerInitializer[](6);

    //     RankTokenAccessSettings[0].selector = RankToken.mint.selector;
    //     RankTokenAccessSettings[0].disallowedAddresses = new address[](1);
    //     RankTokenAccessSettings[0].distributionComponentsOnly = true;

    //     RankTokenAccessSettings[1].selector = RankToken.lock.selector;
    //     RankTokenAccessSettings[1].disallowedAddresses = new address[](1);
    //     RankTokenAccessSettings[1].distributionComponentsOnly = true;

    //     RankTokenAccessSettings[2].selector = RankToken.unlock.selector;
    //     RankTokenAccessSettings[2].disallowedAddresses = new address[](1);
    //     RankTokenAccessSettings[2].distributionComponentsOnly = true;

    //     RankTokenAccessSettings[3].selector = RankToken.batchMint.selector;
    //     RankTokenAccessSettings[3].disallowedAddresses = new address[](1);
    //     RankTokenAccessSettings[3].distributionComponentsOnly = true;

    //     RankTokenAccessSettings[4].selector = RankToken.setURI.selector;
    //     RankTokenAccessSettings[4].distributionComponentsOnly = true;

    //     RankTokenAccessSettings[5].selector = RankToken.setContractURI.selector;
    //     RankTokenAccessSettings[5].distributionComponentsOnly = true;

        rankTokenAccessManager.initialize(RankTokenAccessSettings, rankToken, IDistributor(msg.sender)); // msg.sender must be IDistributor or it will revert
        RankToken(rankToken).initialize(
            args.rankTokenURI,
            args.rankTokenContractURI,
            address(rankTokenAccessManager),
            args.owner
        );

    //     (
    //         address[] memory RankifyDistrAddresses,
    //         bytes32 RankifyDistributionName,
    //         uint256 RankifyDistributionVersion
    //     ) = _RankifyDistributionBase.instantiate("");

    //     RankifyInstanceInit.contractInitializer memory RankifyInit = RankifyInstanceInit.contractInitializer({
    //         rewardToken: rankToken,
    //         principalCost: args.principalCost,
    //         principalTimeConstant: args.principalTimeConstant,
    //         minimumParticipantsInCircle: _minParticipantsInCircle,
    //         paymentToken: _paymentToken,
    //         derivedToken: derivedToken,
    //         proposalIntegrityVerifier: _proposalIntegrityVerifier,
    //         poseidon5: _poseidon5,
    //         poseidon6: _poseidon6,
    //         poseidon2: _poseidon2
    //     });

    //     RankifyInstanceInit(RankifyDistrAddresses[0]).init(
    //         ShortStrings.toString(ShortString.wrap(RankifyDistributionName)),
    //         LibSemver.toString(LibSemver.parse(RankifyDistributionVersion)),
    //         RankifyInit
    //     );
    //     address[] memory returnValue = new address[](RankifyDistrAddresses.length + 2);
    //     for (uint256 i; i < RankifyDistrAddresses.length; ++i) {
    //         returnValue[i] = RankifyDistrAddresses[i];
    //     }
    //     returnValue[RankifyDistrAddresses.length] = address(rankTokenAccessManager);
    //     returnValue[RankifyDistrAddresses.length + 1] = rankToken;

    //     return (returnValue, RankifyDistributionName, RankifyDistributionVersion);
    // }

    function encodeData(
        address previous,
        address hook,
        uint256 index,
        bytes memory data
    ) private returns (bytes memory) {
        DistributorArguments memory args = abi.decode(data, (DistributorArguments));
        if (index == 0) {
            // Fellowship via RankToken
            return
                abi.encodeWithSelector(
                    Fellowship.initialize.selector,
                    args.rankTokenURI,
                    args.rankTokenContractURI,
                    hook,
                    args.admin
                );
        }
        if (index == 1) {
            // BranchToken via GovernanceToken
            return
                abi.encodeWithSelector(BranchToken.initialize.selector, args.name, args.symbol, previous, args.admin);
        }
        if (index == 2) {
            // Fellowship via GovernanceToken
            // string memory name, IVotes _token, TimelockControllerUpgradeable _timelock, uint256 votingDelay, uint256 votingPeriod
            return
                abi.encodeWithSelector(
                    Fellowship.initialize.selector,
                    args.name,
                    args.symbol,
                    args.principalCost,
                    args.principalTimeConstant,
                    args.rankTokenURI,
                    args.rankTokenContractURI,
                    args.admin
                );
        }
        revert("Invalid index");
    }

    function encodeLayerConfig(
        address previous,
        address hook,
        uint256 index,
        bytes memory data
    ) private returns (bytes memory) {
        return bytes("");
    }
    /**
     * @notice Instantiates a new instance with the provided data.
     * @param data The initialization data for the new instance, typeof {DistributorArguments}.
     * @return instances An array of addresses representing the new instances.
     * @return distributionName A bytes32 value representing the name of the distribution.
     * @return distributionVersion A uint256 value representing the version of the distribution.
     * @dev `instances` array contents: GovernanceToken, Gov Token AccessManager, Rankify Diamond, 8x Rankify Diamond facets, RankTokenAccessManager, RankToken
     */
    function instantiate(
        bytes memory data
    ) public override returns (address[] memory instances, bytes32 distributionName, uint256 distributionVersion) {
        // DistributorArguments memory args = abi.decode(data, (DistributorArguments));

        // (address[] memory tokenInstances, , ) = createToken(args.tokenSettings);
        // (address[] memory RankifyInstances, , ) = createRankify(args.rankifySettings, tokenInstances[0]);

        address accessManager = _accessManagerBase.clone();
        //     function initialize(
        //     string memory uri_,
        //     string memory cURI,
        //     address accessLayer,
        //     address defaultAdmin,
        //     address branchToken
        // )
        // bytes memory rankTokenCallData = abi.encodeWithSelector(
        //     RankToken.initialize.selector,
        //     args.rankTokenURI,
        //     args.rankTokenContractURI,
        //     accessManager,
        //     args.admin
        // );

        //     function initialize(
        //     string memory name,
        //     string memory symbol,
        //     address _minter,
        //     address[] memory recipients,
        //     uint256[] memory amounts
        // ) public initializer {
        // bytes memory governanceTokenCallData = abi.encodeWithSelector(
        //     BranchToken.initialize.selector,
        //     args.govtTokenName,
        //     args.govtTokenSymbol,
        //     accessManager,
        //     args.admin
        // );
        // bytes memory instantiationData = abi.encode(accessManager, args);
        (address[] memory _instances, , ) = super._instantiate(accessManager, encodeData, encodeLayerConfig, data);
        address[] memory returnValue = new address[](_instances.length + 1);
        for (uint256 i; i < _instances.length; ++i) {
            returnValue[i] = _instances[i];
        }
        returnValue[_instances.length] = accessManager;

        // for (uint256 i; i < tokenInstances.length; ++i) {
        //     returnValue[i] = tokenInstances[i];
        // }
        // for (uint256 i; i < RankifyInstances.length; ++i) {
        //     returnValue[tokenInstances.length + i] = RankifyInstances[i];
        // }
        return (returnValue, ShortString.unwrap(_distributionName), _distributionVersion);
    }

    function contractURI() public pure virtual override returns (string memory) {
        return "";
    }

    function get() override external view returns (address[] memory sources, bytes32, uint256) {
        address[] memory srcs = new address[](5);
        srcs[0] = address(_rankTokenBase);
        srcs[1] = address(_governanceERC20Base);
        srcs[2] = address(_DAO);
        srcs[3] = address(_accessManagerBase);
        return (srcs, ShortString.unwrap(_distributionName), _distributionVersion);
    }

    /**
     * @notice Returns the schema of the distribution.
     * @dev This is only needed to ensure `DistributorArguments` are provided in ABI, as it would be internal otherwise.
     * @return DistributorArguments The schema of the distribution.
     */
    function distributionSchema(DistributorArguments memory args) external pure returns (DistributorArguments memory) {
        return args;
    }

    function sources() internal view virtual override returns (address[] memory, bytes32 name, uint256 version) {
        // Has one element less since we are adding access manager manually (it does not follow upgrade pattern)
        address[] memory srcs = new address[](4);
        srcs[0] = address(_rankTokenBase);
        srcs[1] = address(_governanceERC20Base);
        srcs[2] = address(_DAO);
        return (srcs, ShortString.unwrap(_distributionName), _distributionVersion);
    }

    function parseAppComponents(address[] memory appComponents) internal view returns (MaoApp memory) {
        MaoApp memory app;
        app.fellowship = Fellowship(appComponents[0]); //erc1155 Rank Token
        app.governanceToken = BranchToken(appComponents[1]); //erc20 Governance Token
        app.dao = IGovernor(appComponents[2]); // Derived organization governed by Governance Token
        app.accessManager = AuthorizationMiddleware(appComponents[3]); // Access manager for the fellowship
        return app;
    }
}
