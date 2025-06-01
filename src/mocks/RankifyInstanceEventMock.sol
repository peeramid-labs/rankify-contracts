// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RankifyInstanceEventMock {
    event OverTime(uint256 indexed gameId);
    event LastTurn(uint256 indexed gameId);
    event ProposalScore(
        uint256 indexed gameId,
        uint256 indexed turn,
        string indexed proposalHash,
        string proposal,
        uint256 score
    );

    event GameOver(uint256 indexed gameId, address[] indexed players, uint256[] indexed scores);

    event ProposalSubmitted(
        uint256 indexed gameId,
        uint256 indexed turn,
        address indexed proposer,
        bytes32 commitment,
        string proposalEncryptedByGM
    );
    event VoteSubmitted(uint256 indexed gameId, uint256 indexed turn, address indexed player, string votesHidden);

    event RegistrationOpen(uint256 indexed gameid);
    event PlayerJoined(uint256 indexed gameId, address participant);
    event GameStarted(uint256 indexed gameId);
    event gameCreated(uint256 gameId, address indexed gm, address indexed creator, uint256 indexed rank);
    event GameClosed(uint256 indexed gameId);
    event PlayerLeft(uint256 indexed gameId, address indexed player);
    uint256[][] votes = [[0, 0, 1, 2, 3], [0, 0, 1, 2, 3], [1, 0, 0, 2, 3], [1, 2, 3, 0, 0], [1, 2, 3, 0, 0]];

    constructor() {
        address[] memory players = new address[](5);
        for (uint160 i = 0; i < 5; ++i) {
            players[i] = (address(i));
        }
        uint256[] memory scores = new uint256[](5);
        for (uint160 i = 0; i < 5; ++i) {
            scores[i] = i;
        }
        string[] memory newProposals = new string[](5);
        for (uint160 i = 0; i < 5; ++i) {
            newProposals[i] = "https://www.youtube.com/watch?v=KaOC9danxNo";
        }
    }

    function fireAll() public {
        address[] memory players = new address[](5);
        for (uint160 i = 0; i < 5; ++i) {
            players[i] = (address(i));
        }
        uint256[] memory scores = new uint256[](5);
        for (uint160 i = 0; i < 5; ++i) {
            scores[i] = i;
        }
        string[] memory newProposals = new string[](5);
        for (uint160 i = 0; i < 5; ++i) {
            newProposals[i] = "https://www.youtube.com/watch?v=KaOC9danxNo";
        }

        emit OverTime(1);
        emit LastTurn(1);
        emit ProposalScore(1, 2, "0x1233123131", "Some kind of proposal", 0);
        emit GameOver(1, players, new uint256[](0));
        emit ProposalSubmitted(1, 2, address(12), bytes32(0), "0x1289031301");
        emit VoteSubmitted(1, 2, address(12), "0x123131");
        emit RegistrationOpen(1);
        emit PlayerJoined(1, address(12));
        emit GameStarted(1);
        emit gameCreated(1, address(11), address(14), 0);
        emit GameClosed(1);
        emit PlayerLeft(1, address(12));
    }
}
