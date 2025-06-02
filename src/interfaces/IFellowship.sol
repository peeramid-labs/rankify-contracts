// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../abstracts/LockableERC1155.sol";
interface IFellowship {
    event RankTokenExited(address indexed rankReceiver, uint256 rankId, uint256 amount, uint256 mintedTokens);
    struct State {
        uint128 principalCost;
        uint256 principalTime;
        address competenceAsset;
        address rootAsset;
        address derivedAsset;
        uint32 minTournamentSize;
        uint64 exitRate;
        address[] receivers;
        uint256[] receiverShares;
    }
    function getContractState() external view returns (State memory);
    function claim(address winner) external;
    function lockRank(address participant) external;
    function unlockRank(address participant) external;
    function getRank(address appComponent) external view returns (uint256);
}
