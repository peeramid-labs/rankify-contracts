// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {LibTBG} from "../libraries/LibTurnBasedGame.sol";
import {LibQuadraticVoting} from "../libraries/LibQuadraticVoting.sol";
import {IInstaller} from "@peeramid-labs/eds/interfaces/IInstaller.sol";

interface IRankifyInstance is IInstaller {
    error NoDivisionReminderAllowed(uint256 a, uint256 b);
    error invalidTurnCount(uint256 nTurns);
    error RankNotSpecified();

    event RankTokenExited(address indexed player, uint256 rankId, uint256 amount, uint256 _toMint);

    struct NewThreadParamsInput {
        uint256 gameRank;
        uint256 minPlayerCnt;
        uint256 maxPlayerCnt;
        uint96 nTurns;
        uint256 voteCredits;
        address gameMaster;
        uint128 minGameTime;
        uint128 timePerTurn;
        uint128 timeToJoin;
        string metadata;
    }
}
