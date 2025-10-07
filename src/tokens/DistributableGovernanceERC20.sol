// SPDX-License-Identifier: AGPL-3.0-or-later

pragma solidity =0.8.28;

// import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
// import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20MetadataUpgradeable.sol"
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20VotesUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/utils/VotesUpgradeable.sol";
import "@peeramid-labs/eds/src/abstracts/ERC7746Middleware.sol";
import "@peeramid-labs/eds/src/libraries/LibMiddleware.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @notice The settings for the initial mint of the token.
/// @param receivers The receivers of the tokens.
/// @param amounts The amounts of tokens to be minted for each receiver.
/// @dev The lengths of `receivers` and `amounts` must match.
struct MintSettings {
    address[] receivers;
    uint256[] amounts;
}

/// @title IERC20MintableUpgradeable
/// @notice Interface to allow minting of [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens.
interface IERC20MintableUpgradeable {
    /// @notice Mints [ERC-20](https://eips.ethereum.org/EIPS/eip-20) tokens for a receiving address.
    /// @param _to The receiving address.
    /// @param _amount The amount of tokens.
    function mint(address _to, uint256 _amount) external;
}

/// @title DistributableGovernanceERC20
/// @author Peeramid Labs, adapted version from Aragon Association
/// @notice An [OpenZeppelin `Votes`](https://docs.openzeppelin.com/contracts/4.x/api/governance#Votes) compatible [ERC-20](https://eips.ethereum.org/EIPS/eip-20) token that can be used for voting and is managed by a DAO.
contract DistributableGovernanceERC20 is
    IERC20MintableUpgradeable,
    Initializable,
    ERC165Upgradeable,
    ERC20VotesUpgradeable,
    ERC7746Middleware,
    ReentrancyGuardUpgradeable
{
    /// @notice Thrown if the number of receivers and amounts specified in the mint settings do not match.
    /// @param receiversArrayLength The length of the `receivers` array.
    /// @param amountsArrayLength The length of the `amounts` array.
    error MintSettingsArrayLengthMismatch(uint256 receiversArrayLength, uint256 amountsArrayLength);

    /// @notice Calls the initialize function.
    /// @param _name The name of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _symbol The symbol of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _mintSettings The token mint settings struct containing the `receivers` and `amounts`.
    constructor(string memory _name, string memory _symbol, MintSettings memory _mintSettings, address _accessManager) {
        initialize(_name, _symbol, _mintSettings, _accessManager);
    }

    /// @notice Initializes the contract and mints tokens to a list of receivers.
    /// @param _name The name of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _symbol The symbol of the [ERC-20](https://eips.ethereum.org/EIPS/eip-20) governance token.
    /// @param _mintSettings The token mint settings struct containing the `receivers` and `amounts`.
    function initialize(
        string memory _name,
        string memory _symbol,
        MintSettings memory _mintSettings,
        address accessManager
    ) public initializer {
        LibMiddleware.LayerStruct[] memory layers = new LibMiddleware.LayerStruct[](1);

        // Set the layer for the sender
        layers[0] = LibMiddleware.LayerStruct({layerAddess: accessManager, layerConfigData: ""});
        LibMiddleware.setLayers(layers);

        // Check mint settings
        if (_mintSettings.receivers.length != _mintSettings.amounts.length) {
            revert MintSettingsArrayLengthMismatch({
                receiversArrayLength: _mintSettings.receivers.length,
                amountsArrayLength: _mintSettings.amounts.length
            });
        }

        __ERC20_init(_name, _symbol);

        for (uint256 i; i < _mintSettings.receivers.length; ++i) {
            _mint(_mintSettings.receivers[i], _mintSettings.amounts[i]);
        }
    }

    /// @notice Checks if this or the parent contract supports an interface by its ID.
    /// @param interfaceId The ID of the interface.
    /// @return Returns `true` if the interface is supported.
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(ERC20Upgradeable).interfaceId ||
            // interfaceId == type(ERC20PermitUpgradeable).interfaceId ||
            interfaceId == type(IERC20Metadata).interfaceId ||
            interfaceId == type(VotesUpgradeable).interfaceId ||
            interfaceId == type(IERC20MintableUpgradeable).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @notice Mints tokens to an address.
    /// @param to The address receiving the tokens.
    /// @param amount The amount of tokens to be minted.
    function mint(
        address to,
        uint256 amount
    ) external override nonReentrant ERC7746C(msg.sig, msg.sender, msg.data, 0) {
        _mint(to, amount);
    }

    // https://forum.openzeppelin.com/t/self-delegation-in-erc20votes/17501/12?u=novaknole
    /// @inheritdoc ERC20VotesUpgradeable
    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);

        // Automatically turn on delegation on mint/transfer but only for the first time.
        if (to != address(0) && numCheckpoints(to) == 0 && delegates(to) == address(0)) {
            _delegate(to, to);
        }
    }
}
