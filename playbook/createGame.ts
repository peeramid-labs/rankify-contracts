import { task } from 'hardhat/config';
import { RankifyDiamondInstance, Rankify } from '../types';
import { IRankifyInstance } from '../types/src/facets/RankifyInstanceMainFacet';

task('createGame', 'Create new game')
  .addOptionalParam('gameCreatorPK', 'Player private key who will create game')
  .addOptionalParam('gameMaster', 'Game master address')
  .addOptionalParam('gameRank', 'Game rank', '1')
  .addOptionalParam('maxPlayerCnt', 'Max player count', '9')
  .addOptionalParam('minPlayerCnt', 'Min player count', '5')
  .addOptionalParam('minGameTime', 'Minimum game time in seconds', '3600')
  .addOptionalParam('nTurns', 'Number of turns', '10')
  .addOptionalParam('timePerTurn', 'Time per turn in seconds', '1800')
  .addOptionalParam('voteCredits', 'Vote credits per player', '14')
  .addOptionalParam('timeToJoin', 'Time to join in seconds', '1800')
  .addParam('rankifyInstanceAddress', 'Rankify instance address')
  .setAction(
    async (
      {
        gameCreatorPK,
        gameMaster,
        gameRank,
        rankifyInstanceAddress,
        maxPlayerCnt,
        minPlayerCnt,
        minGameTime,
        nTurns,
        timePerTurn,
        voteCredits,
        timeToJoin,
      }: {
        gameCreatorPK: string;
        gameMaster: string;
        gameRank: string;
        rankifyInstanceAddress: string;
        maxPlayerCnt: string;
        minPlayerCnt: string;
        minGameTime: string;
        nTurns: string;
        timePerTurn: string;
        voteCredits: string;
        timeToJoin: string;
      },
      hre,
    ) => {
      const { ethers, getNamedAccounts } = hre;
      const { owner, gameMaster: defaultGameMaster, defaultPlayer } = await getNamedAccounts();

      const gameCreatorSigner = gameCreatorPK
        ? new hre.ethers.Wallet(gameCreatorPK, hre.ethers.provider)
        : await hre.ethers.getSigner(defaultPlayer);

      // Get game price
      const gameInstance = new ethers.Contract(
        rankifyInstanceAddress,
        [
          {
            inputs: [
              {
                internalType: 'uint128',
                name: 'minGameTime',
                type: 'uint128',
              },
            ],
            name: 'estimateGamePrice',
            outputs: [
              {
                internalType: 'uint256',
                name: '',
                type: 'uint256',
              },
            ],
            stateMutability: 'pure',
            type: 'function',
          },
          {
            inputs: [
              {
                components: [
                  {
                    internalType: 'uint256',
                    name: 'gameRank',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'minPlayerCnt',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'maxPlayerCnt',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint96',
                    name: 'nTurns',
                    type: 'uint96',
                  },
                  {
                    internalType: 'uint256',
                    name: 'voteCredits',
                    type: 'uint256',
                  },
                  {
                    internalType: 'address',
                    name: 'gameMaster',
                    type: 'address',
                  },
                  {
                    internalType: 'uint128',
                    name: 'minGameTime',
                    type: 'uint128',
                  },
                  {
                    internalType: 'uint128',
                    name: 'timePerTurn',
                    type: 'uint128',
                  },
                  {
                    internalType: 'uint128',
                    name: 'timeToJoin',
                    type: 'uint128',
                  },
                ],
                internalType: 'struct IRankifyInstance.NewGameParamsInput',
                name: 'params',
                type: 'tuple',
              },
            ],
            name: 'createGame',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
          {
            inputs: [
              {
                internalType: 'uint256',
                name: 'gameId',
                type: 'uint256',
              },
            ],
            name: 'getGameState',
            outputs: [
              {
                components: [
                  {
                    internalType: 'uint256',
                    name: 'rank',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'minGameTime',
                    type: 'uint256',
                  },
                  {
                    internalType: 'address',
                    name: 'createdBy',
                    type: 'address',
                  },
                  {
                    internalType: 'uint256',
                    name: 'numOngoingProposals',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'numPrevProposals',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'numCommitments',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'numVotesThisTurn',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'numVotesPrevTurn',
                    type: 'uint256',
                  },
                  {
                    components: [
                      {
                        internalType: 'uint256',
                        name: 'voteCredits',
                        type: 'uint256',
                      },
                      {
                        internalType: 'uint256',
                        name: 'maxQuadraticPoints',
                        type: 'uint256',
                      },
                      {
                        internalType: 'uint256',
                        name: 'minQuadraticPositions',
                        type: 'uint256',
                      },
                    ],
                    internalType: 'struct LibQuadraticVoting.qVotingStruct',
                    name: 'voting',
                    type: 'tuple',
                  },
                  {
                    internalType: 'uint256',
                    name: 'currentTurn',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'turnStartedAt',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'registrationOpenAt',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'startedAt',
                    type: 'uint256',
                  },
                  {
                    internalType: 'bool',
                    name: 'hasStarted',
                    type: 'bool',
                  },
                  {
                    internalType: 'bool',
                    name: 'hasEnded',
                    type: 'bool',
                  },
                  {
                    internalType: 'uint256',
                    name: 'numPlayersMadeMove',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'numActivePlayers',
                    type: 'uint256',
                  },
                  {
                    internalType: 'bool',
                    name: 'isOvertime',
                    type: 'bool',
                  },
                  {
                    internalType: 'uint256',
                    name: 'timePerTurn',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'maxPlayerCnt',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'minPlayerCnt',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'timeToJoin',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'maxTurns',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'voteCredits',
                    type: 'uint256',
                  },
                  {
                    internalType: 'address',
                    name: 'gameMaster',
                    type: 'address',
                  },
                ],
                internalType: 'struct IRankifyInstance.GameStateOutput',
                name: 'state',
                type: 'tuple',
              },
            ],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        gameCreatorSigner,
      ) as RankifyDiamondInstance;

      const gamePrice = await gameInstance.estimateGamePrice(minGameTime);
      console.log('Estimated game price:', ethers.utils.formatEther(gamePrice), 'tokens');

      // Mint tokens if needed
      const rankifyDeployment = await hre.deployments.get('Rankify');
      const rankifyContract = new hre.ethers.Contract(
        rankifyDeployment.address,
        rankifyDeployment.abi,
        await hre.ethers.getSigner(owner),
      ) as Rankify;

      const gameCreatorBalance = await rankifyContract.balanceOf(gameCreatorSigner.address);
      if (gameCreatorBalance.lt(gamePrice)) {
        console.log('Minting tokens for game creator...');
        const tx = await rankifyContract.mint(gameCreatorSigner.address, gamePrice);
        await tx.wait();
      }

      // Approve tokens
      const allowance = await rankifyContract.allowance(gameCreatorSigner.address, gameInstance.address);
      if (allowance.lt(gamePrice)) {
        console.log('Approving tokens for game instance...');
        const approveTx = await rankifyContract
          .connect(gameCreatorSigner)
          .approve(gameInstance.address, ethers.constants.MaxUint256);
        await approveTx.wait();
      }

      // Create game
      const params: IRankifyInstance.NewGameParamsInputStruct = {
        gameMaster: gameMaster || defaultGameMaster,
        gameRank: gameRank,
        maxPlayerCnt: maxPlayerCnt,
        minPlayerCnt: minPlayerCnt,
        minGameTime: minGameTime,
        nTurns: nTurns,
        timePerTurn: timePerTurn,
        voteCredits: voteCredits,
        timeToJoin: timeToJoin,
      };

      console.log('Creating game with params:', params);
      const tx = await gameInstance.createGame(params);
      const receipt = await tx.wait(1);

      const gameId = await gameInstance
        .connect(gameCreatorSigner)
        .getContractState()
        .then(state => state.numGames);
      console.log('Game with id ' + gameId.toNumber() + ' created!');
      return { gameId: gameId, receipt };
    },
  );

export default {};
