// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../abstracts/LockableERC1155.sol";
interface IFellowship {
    event RankTokenExited(address indexed rankReceiver, uint256 rankId, uint256 amount, uint256 mintedTokens);
    struct State {
        uint256 principalCost;
        uint256 principalTime;
        LockableERC1155 competenceAsset;
        address rootAsset;
        address[] receivers;
        uint256[] receiverShares;
        uint256 humanFactor;
        string _contractURI;
        address _branchToken;
    }
    function getContractState() external view returns (State memory);
    function claim(address winner) external;
    function lockRank(address participant) external;
    function unlockRank(address participant) external;
    function getRank(address appComponent) external view returns (uint256);
}
