import { RankifyDiamondInstance, RankToken } from '../../types';
import { BigNumber, BigNumberish, Wallet } from 'ethers';

import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { AdrSetupResult, SignerIdentity } from '../../scripts/setupMockEnvironment';
import { MockVote, ProposalsIntegrity, ProposalSubmission } from '../../scripts/EnvironmentSimulator';
import EnvironmentSimulator from '../../scripts/EnvironmentSimulator';
import { EnvSetupResult } from '../../scripts/EnvironmentSimulator';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

export enum GameState {
  Created,
  RegistrationOpened,
  PartyFilled,
  Started,
  NextMove,
  LastMove,
  Overtime,
  Ended,
}

export class InstanceBase extends EnvironmentSimulator {
  ongoingVotes: MockVote[] = [];
  proposalsData: ProposalsIntegrity = {
    newProposals: {
      proposals: [],
      a: [0n, 0n],
      b: [
        [0n, 0n],
        [0n, 0n],
      ],
      c: [0n, 0n],
      permutationCommitment: 0n,
    },
    permutation: [],
    proposalsNotPermuted: [],
    nullifier: 0n,
  };

  private gameStates: Map<number, GameState> = new Map();
  private proposalShuffling: Map<number, number[]> = new Map(); // gameId -> shuffled indices

  constructor(props: {
    hre: HardhatRuntimeEnvironment;
    env: EnvSetupResult;
    adr: AdrSetupResult;
    rankifyInstance: RankifyDiamondInstance;
    rankToken: RankToken;
  }) {
    super(props.hre, props.env, props.adr, props.rankifyInstance, props.rankToken);
  }

  increaseTime = async (time: number) => {
    await this.hre.network.provider.send('evm_increaseTime', [time]);
    await this.hre.network.provider.send('evm_mine');
  };

  createGame = async ({
    minGameTime,
    signer,
    gameMaster,
    gameRank,
    openNow,
    metadata,
  }: {
    minGameTime: BigNumberish;
    signer: Wallet | SignerWithAddress;
    gameMaster: string;
    gameRank: BigNumberish;
    openNow?: boolean;
    metadata?: string;
  }) => {
    const gameId = await super.createGame({ minGameTime, signer, gameMaster, gameRank, openNow, metadata });
    this.updateGameState(gameId, GameState.Created);
    return gameId;
  };
  runToTheEnd = async (gameId: BigNumberish, distribution?: 'ftw' | 'semiUniform' | 'equal') => {
    const result = await super.runToTheEnd(gameId, distribution);
    this.updateGameState(gameId, GameState.Ended);
    return result;
  };

  runToLastTurn = async (
    gameId: BigNumberish,
    gameMaster: Wallet,
    distribution?: 'ftw' | 'semiUniform' | 'equal',
  ): Promise<{ lastVotes: MockVote[]; lastProposals: ProposalSubmission[] }> => {
    const { lastVotes, lastProposals } = await super.runToLastTurn(gameId, gameMaster, distribution);
    this.updateGameState(gameId, GameState.LastMove);
    return { lastVotes, lastProposals };
  };

  async endTurn({
    gameId,
    votes,
    proposals,
  }: {
    gameId: BigNumberish;
    votes?: MockVote[];
    proposals?: ProposalSubmission[];
  }): Promise<void> {
    const turn = await this.rankifyInstance.getTurn(gameId);
    const turnNumber = turn.toNumber();
    const isLastTurn = await this.rankifyInstance.isLastTurn(gameId);
    const playersLength = await this.rankifyInstance.getPlayers(gameId).then(players => players.length);

    console.log('Turn number:', turnNumber);
    console.log('Is last turn:', isLastTurn);
    console.log('Number of players:', playersLength);

    await super.endTurn({ gameId, votes, proposals });
    console.log('Turn ended successfully');
    const scores = await this.rankifyInstance.getScores(gameId);
    console.log('Scores:', scores);
  }

  runToOvertime = async (gameId: BigNumberish, gameMaster: Wallet) => {
    await this.runToLastTurn(gameId, gameMaster, 'equal');
    await this.makeTurn({ gameId, distribution: 'equal', increaseFinalTime: true });
    this.updateGameState(gameId, GameState.Overtime);
  };

  mockValidVotes = async (
    players: SignerIdentity[],
    gameId: BigNumberish,
    gameMaster: Wallet,
    submitNow?: boolean,
    distribution?: 'ftw' | 'semiUniform' | 'equal',
  ) => {
    const votes = await super.mockValidVotes(players, gameId, gameMaster, submitNow, distribution);
    return votes;
  };

  startGame = async (gameId: BigNumberish) => {
    await super.startGame(gameId);
    this.updateGameState(gameId, GameState.Started);
  };

  fillParty = async ({
    players,
    gameId,
    shiftTime,
    gameMaster,
    startGame,
  }: {
    players: SignerIdentity[];
    gameId: BigNumberish;
    shiftTime: boolean;
    gameMaster: Wallet;
    startGame?: boolean;
  }) => {
    const result = await super.fillParty({ players, gameId, shiftTime, gameMaster, startGame });
    this.updateGameState(gameId, GameState.PartyFilled);
    return result;
  };

  async getActiveGames(): Promise<number[]> {
    const state = await this.rankifyInstance.getContractState();
    const totalGames = state.numGames.toNumber();
    const activeGames: number[] = [];

    for (let i = 1; i <= totalGames; i++) {
      const isOver = await this.rankifyInstance.isGameOver(i);
      if (!isOver) {
        activeGames.push(i);
      }
    }

    return activeGames;
  }

  async makeTurn({
    gameId,
    distribution = 'ftw',
    increaseFinalTime = false,
  }: {
    gameId: BigNumberish;
    distribution: 'ftw' | 'semiUniform' | 'equal';
    increaseFinalTime: boolean;
  }): Promise<{ lastVotes: MockVote[]; lastProposals: ProposalSubmission[] }> {
    const { lastVotes, lastProposals } = await super.makeTurn({ gameId, distribution, increaseFinalTime });

    const isLastTurn = await this.rankifyInstance.isLastTurn(gameId);
    const isOvertime = await this.rankifyInstance.isOvertime(gameId);
    const isGameOver = await this.rankifyInstance.isGameOver(gameId);
    if (isOvertime) {
      this.updateGameState(gameId, GameState.Overtime);
    } else if (isLastTurn) {
      this.updateGameState(gameId, GameState.LastMove);
    } else if (isGameOver) {
      this.updateGameState(gameId, GameState.Ended);
    } else {
      this.updateGameState(gameId, GameState.NextMove);
    }
    return { lastVotes, lastProposals };
  }

  async handleOvertime(gameId: number): Promise<void> {
    await this.runToOvertime(gameId, this.adr.gameMaster1);
    this.updateGameState(gameId, GameState.Overtime);
  }

  async endGame(gameId: number): Promise<void> {
    const gameEnded = await this.rankifyInstance.isGameOver(gameId);
    if (!gameEnded) {
      console.log('Running to the end for game:', gameId.toString());
      await this.runToTheEnd(gameId, 'ftw');
      console.log('Game ended');
      const GameOverF = this.rankifyInstance.filters.GameOver(gameId);
      console.log('Getting game over event for game:', gameId.toString());
      const evts = await this.rankifyInstance.queryFilter(GameOverF);
      const playerAddresses = evts[0].args.players;
      const playerScores = evts[0].args.scores;
      console.log('Game over event args:', evts[0].args);
      console.log(
        'Scores:',
        playerAddresses.map((addr, i) => ({
          address: addr,
          score: playerScores[i].toString(),
        })),
      );

      // Find winner by highest score
      const winnerIndex = playerScores.reduce((maxIndex, score, i) => {
        return BigNumber.from(score).gt(BigNumber.from(playerScores[maxIndex])) ? i : maxIndex;
      }, 0);
      const winner = playerAddresses[winnerIndex];

      const gameRank = await this.rankifyInstance.getGameRank(gameId);
      const rewardBalance = await this.rankToken.balanceOf(winner, gameRank.add(1));
      console.log(`Game ${gameId} ended. Winner ${winner} received ${rewardBalance.toString()} rank tokens.`);
    }
    this.updateGameState(gameId, GameState.Ended);
  }

  async getGameState(gameId: BigNumberish): Promise<GameState> {
    return this.gameStates.get(Number(gameId)) || GameState.Created;
  }

  private updateGameState(gameId: BigNumberish, state: GameState): void {
    this.gameStates.set(Number(gameId), state);
  }

  async openRegistration(gameId: BigNumberish): Promise<void> {
    const registrationOpened = await this.rankifyInstance.isRegistrationOpen(gameId);
    if (!registrationOpened) {
      await this.rankifyInstance
        .connect(this.adr.gameCreator1.wallet)
        .openRegistration(gameId)
        .then(r => r.wait(1));
    }
    this.updateGameState(gameId, GameState.RegistrationOpened);
  }

  async runTillLastTurn(gameId: number): Promise<void> {
    const isLastTurn = await this.rankifyInstance.isLastTurn(gameId);
    if (!isLastTurn) {
      await this.runToLastTurn(gameId, this.adr.gameMaster1, 'equal');
    }
  }
}
