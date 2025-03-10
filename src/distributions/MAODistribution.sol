// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@peeramid-labs/eds/src/interfaces/IDistribution.sol";
import "@peeramid-labs/eds/src/libraries/LibSemver.sol";
import {DistributableGovernanceERC20, MintSettings} from "../tokens/DistributableGovernanceERC20.sol";
import {IERC7746} from "@peeramid-labs/eds/src/interfaces/IERC7746.sol";
import {SimpleAccessManager} from "@peeramid-labs/eds/src/managers/SimpleAccessManager.sol";
import {IDistributor} from "@peeramid-labs/eds/src/interfaces/IDistributor.sol";
import {RankToken} from "../tokens/RankToken.sol";
import "../initializers/RankifyInstanceInit.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "@peeramid-labs/eds/src/abstracts/CodeIndexer.sol";
import "hardhat/console.sol";
import {TokenSettings} from "../vendor/aragon/interfaces.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";
/**
 * @title MAODistribution
 * @dev This contract implements the IDistribution and CodeIndexer interfaces. It uses the Clones library for address cloning.
 *
 * @notice The contract is responsible for creating and managing DAOs and Rankify distributions.
 * @author Peeramid Labs, 2024
 */
contract MAODistribution is IDistribution, CodeIndexer {
    struct UserRankifySettings {
        uint256 principalCost;
        uint96 principalTimeConstant;
        string rankTokenURI;
        string rankTokenContractURI;
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
    address private immutable _trustedForwarder;
    ShortString private immutable _distributionName;
    uint256 private immutable _distributionVersion;
    address private immutable _rankTokenBase;
    IDistribution private immutable _RankifyDistributionBase;
    address private immutable _governanceERC20Base;
    address private immutable _accessManagerBase;
    address private immutable _paymentToken;
    address private immutable _beneficiary;
    uint256 private immutable _minParticipantsInCircle;
    address private immutable _proposalIntegrityVerifier;
    address private immutable _poseidon5;
    address private immutable _poseidon6;
    address private immutable _poseidon2;
    /**
     * @notice Initializes the contract with the provided parameters and performs necessary checks.
     * @dev Retrieves contract addresses from a contract index using the provided identifiers
     *      and initializes the distribution system.
     * @dev WARNING: distributionName must be less then 31 bytes long to comply with ShortStrings immutable format
     * @param trustedForwarder Address of the trusted forwarder for meta-transactions (WARNING: Not yet reviewed)
     * @param paymentToken Address of the token used for payments in the system
     * @param beneficiary Address that receives payments and fees
     * @param rankTokenCodeId Identifier for the rank token implementation in CodeIndex
     * @param RankifyDIistributionId Identifier for the Rankify distribution implementation
     * @param accessManagerId Identifier for the access manager implementation
     * @param governanceERC20BaseId Identifier for the governance token implementation
     * @param distributionName Name identifier for this distribution
     * @param distributionVersion Semantic version information as LibSemver.Version struct
     * @param minParticipantsInCircle Minimum number of participants in a circle
     */
    constructor(
        address trustedForwarder,
        address paymentToken,
        address beneficiary,
        address[] memory zkpVerifier,
        bytes32 rankTokenCodeId,
        bytes32 RankifyDIistributionId,
        bytes32 accessManagerId,
        bytes32 governanceERC20BaseId,
        string memory distributionName,
        LibSemver.Version memory distributionVersion,
        uint256 minParticipantsInCircle
    ) {
        require(minParticipantsInCircle > 2, "minParticipantsInCircle must be greater than 2");
        _minParticipantsInCircle = minParticipantsInCircle;

        _trustedForwarder = trustedForwarder;
        _distributionName = ShortStrings.toShortString(distributionName);
        _distributionVersion = LibSemver.toUint256(distributionVersion);
        _rankTokenBase = getContractsIndex().get(rankTokenCodeId);
        _governanceERC20Base = getContractsIndex().get(governanceERC20BaseId);
        _proposalIntegrityVerifier = zkpVerifier[0];
        _poseidon5 = zkpVerifier[1];
        _poseidon6 = zkpVerifier[2];
        _poseidon2 = zkpVerifier[3];
        if (_poseidon5 == address(0)) {
            revert("Poseidon5 not found");
        }
        if (_poseidon6 == address(0)) {
            revert("Poseidon6 not found");
        }
        if (_poseidon2 == address(0)) {
            revert("Poseidon2 not found");
        }
        if (_proposalIntegrityVerifier == address(0)) {
            revert("Verifier not set");
        }
        if (_governanceERC20Base == address(0)) {
            revert("Governance ERC20 base not found");
        }

        if (beneficiary == address(0)) {
            revert("Beneficiary not found");
        }
        _beneficiary = beneficiary;
        if (paymentToken == address(0)) {
            revert("Payment token not found");
        }
        _paymentToken = paymentToken;
        if (_rankTokenBase == address(0)) {
            revert("Rank token base not found");
        }
        _RankifyDistributionBase = IDistribution(getContractsIndex().get(RankifyDIistributionId));
        if (address(_RankifyDistributionBase) == address(0)) {
            revert("Rankify distribution base not found");
        }

        _accessManagerBase = getContractsIndex().get(accessManagerId);
        if (_accessManagerBase == address(0)) {
            revert("Access manager base not found");
        }
        require(
            ERC165Checker.supportsInterface(_accessManagerBase, type(IERC7746).interfaceId),
            "Access manager does not support IERC7746"
        );
    }

    function createToken(TokenArguments memory args) internal returns (address[] memory instances, bytes32, uint256) {
        MintSettings memory mintSettings = MintSettings(new address[](1), new uint256[](1));
        mintSettings.receivers[0] = address(this);
        mintSettings.amounts[0] = 0;
        address token = _governanceERC20Base.clone();
        TokenSettings memory tokenSettings = TokenSettings(token, args.tokenName, args.tokenSymbol);

        SimpleAccessManager.SimpleAccessManagerInitializer[]
            memory govTokenAccessSettings = new SimpleAccessManager.SimpleAccessManagerInitializer[](1);
        govTokenAccessSettings[0].selector = DistributableGovernanceERC20.mint.selector;
        govTokenAccessSettings[0].disallowedAddresses = new address[](1);
        govTokenAccessSettings[0].distributionComponentsOnly = true;

        SimpleAccessManager govTokenAccessManager = SimpleAccessManager(_accessManagerBase.clone());

        govTokenAccessManager.initialize(govTokenAccessSettings, tokenSettings.addr, IDistributor(msg.sender)); // msg.sender must be IDistributor or it will revert
        DistributableGovernanceERC20(tokenSettings.addr).initialize(
            tokenSettings.name,
            tokenSettings.symbol,
            mintSettings,
            address(govTokenAccessManager)
        );

        address[] memory returnValue = new address[](2);
        returnValue[0] = token;
        returnValue[1] = address(govTokenAccessManager);

        return (returnValue, "OSxDistribution", 1);
    }

    function createRankify(
        UserRankifySettings memory args,
        address derivedToken
    ) internal returns (address[] memory instances, bytes32, uint256) {
        address rankToken = _rankTokenBase.clone();

        bytes4[] memory rankTokenSelectors = new bytes4[](6);
        rankTokenSelectors[0] = RankToken.mint.selector;
        rankTokenSelectors[1] = RankToken.lock.selector;
        rankTokenSelectors[2] = RankToken.unlock.selector;
        rankTokenSelectors[3] = RankToken.batchMint.selector;
        rankTokenSelectors[4] = RankToken.setURI.selector;
        rankTokenSelectors[5] = RankToken.setContractURI.selector;
        SimpleAccessManager rankTokenAccessManager = SimpleAccessManager(_accessManagerBase.clone());

        SimpleAccessManager.SimpleAccessManagerInitializer[]
            memory RankTokenAccessSettings = new SimpleAccessManager.SimpleAccessManagerInitializer[](6);

        RankTokenAccessSettings[0].selector = RankToken.mint.selector;
        RankTokenAccessSettings[0].disallowedAddresses = new address[](1);
        RankTokenAccessSettings[0].distributionComponentsOnly = true;

        RankTokenAccessSettings[1].selector = RankToken.lock.selector;
        RankTokenAccessSettings[1].disallowedAddresses = new address[](1);
        RankTokenAccessSettings[1].distributionComponentsOnly = true;

        RankTokenAccessSettings[2].selector = RankToken.unlock.selector;
        RankTokenAccessSettings[2].disallowedAddresses = new address[](1);
        RankTokenAccessSettings[2].distributionComponentsOnly = true;

        RankTokenAccessSettings[3].selector = RankToken.batchMint.selector;
        RankTokenAccessSettings[3].disallowedAddresses = new address[](1);
        RankTokenAccessSettings[3].distributionComponentsOnly = true;

        RankTokenAccessSettings[4].selector = RankToken.setURI.selector;
        RankTokenAccessSettings[4].distributionComponentsOnly = true;

        RankTokenAccessSettings[5].selector = RankToken.setContractURI.selector;
        RankTokenAccessSettings[5].distributionComponentsOnly = true;

        rankTokenAccessManager.initialize(RankTokenAccessSettings, rankToken, IDistributor(msg.sender)); // msg.sender must be IDistributor or it will revert
        RankToken(rankToken).initialize(args.rankTokenURI, args.rankTokenContractURI, address(rankTokenAccessManager), msg.sender);

        (
            address[] memory RankifyDistrAddresses,
            bytes32 RankifyDistributionName,
            uint256 RankifyDistributionVersion
        ) = _RankifyDistributionBase.instantiate("");

        RankifyInstanceInit.contractInitializer memory RankifyInit = RankifyInstanceInit.contractInitializer({
            rewardToken: rankToken,
            principalCost: args.principalCost,
            principalTimeConstant: args.principalTimeConstant,
            minimumParticipantsInCircle: _minParticipantsInCircle,
            paymentToken: _paymentToken,
            beneficiary: _beneficiary,
            derivedToken: derivedToken,
            proposalIntegrityVerifier: _proposalIntegrityVerifier,
            poseidon5: _poseidon5,
            poseidon6: _poseidon6,
            poseidon2: _poseidon2
        });

        RankifyInstanceInit(RankifyDistrAddresses[0]).init(
            ShortStrings.toString(ShortString.wrap(RankifyDistributionName)),
            LibSemver.toString(LibSemver.parse(RankifyDistributionVersion)),
            RankifyInit
        );
        address[] memory returnValue = new address[](RankifyDistrAddresses.length + 2);
        for (uint256 i; i < RankifyDistrAddresses.length; ++i) {
            returnValue[i] = RankifyDistrAddresses[i];
        }
        returnValue[RankifyDistrAddresses.length] = address(rankTokenAccessManager);
        returnValue[RankifyDistrAddresses.length + 1] = rankToken;

        return (returnValue, RankifyDistributionName, RankifyDistributionVersion);
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
        DistributorArguments memory args = abi.decode(data, (DistributorArguments));

        (address[] memory tokenInstances, , ) = createToken(args.tokenSettings);
        (address[] memory RankifyInstances, , ) = createRankify(args.rankifySettings, tokenInstances[0]);

        address[] memory returnValue = new address[](tokenInstances.length + RankifyInstances.length);

        for (uint256 i; i < tokenInstances.length; ++i) {
            returnValue[i] = tokenInstances[i];
        }
        for (uint256 i; i < RankifyInstances.length; ++i) {
            returnValue[tokenInstances.length + i] = RankifyInstances[i];
        }
        return (returnValue, ShortString.unwrap(_distributionName), _distributionVersion);
    }

    function contractURI() public pure virtual override returns (string memory) {
        return "";
    }

    function get() external view returns (address[] memory sources, bytes32, uint256) {
        address[] memory srcs = new address[](5);
        srcs[0] = address(_trustedForwarder);
        srcs[1] = address(_rankTokenBase);
        srcs[2] = address(_RankifyDistributionBase);
        srcs[3] = address(_governanceERC20Base);
        srcs[4] = address(_accessManagerBase);
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
}
