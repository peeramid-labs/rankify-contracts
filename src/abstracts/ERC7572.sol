// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

abstract contract ERC7572 {
    /// @custom:storage-location erc7201:contract.uri.position
    struct ContractURI {
        string name;
    }
    bytes32 constant CONTRACT_URI_STORAGE_POSITION = keccak256(abi.encode(uint256(keccak256("contract.uri.position")) - 1)) &
            ~bytes32(uint256(0xff));
    function getContractURI() private pure returns (ContractURI storage storageSlot) {
        bytes32 position = CONTRACT_URI_STORAGE_POSITION;
        assembly {
            storageSlot.slot := position
        }
    }
    function contractURI() external view returns (string memory) {
        return getContractURI().name;
    }

    function _setContractURI(string memory newURI) internal {
        getContractURI().name = newURI;
    }
}
