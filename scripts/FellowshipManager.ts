import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import {
  Rankify,
  MockERC1155,
  MockERC20,
  MockERC721,
  RankToken,
  MAODistribution,
  DAODistributor,
  ArguableVotingTournament,
  RankifyDiamondInstance,
} from '../types';
import { BigNumberish, utils, Wallet } from 'ethers';
// @ts-ignore
import { assert } from 'console';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { AdrSetupResult } from './setupMockEnvironment';
import { IRankifyInstance } from '../types/src/facets/RankifyInstanceMainFacet';
import { log } from './utils';
import ThreadAgent from './ThreadAgent';
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString();
};

/**
 * Result of setting up the game environment
 * Contains all contract instances needed for the game
 */
export interface EnvSetupResult {
  rankifyToken: Rankify;
  arguableVotingTournamentDistribution: ArguableVotingTournament;
  rankTokenBase: RankToken;
  mockERC20: MockERC20;
  mockERC1155: MockERC1155;
  mockERC721: MockERC721;
  maoDistribution: MAODistribution;
  distributor: DAODistributor;
}

export const constantParams = {
  RANKIFY_INSTANCE_CONTRACT_NAME: 'RANKIFY_INSTANCE_NAME',
  RANKIFY_INSTANCE_CONTRACT_VERSION: '0.0.1',
  RInstance_TIME_PER_TURN: 2500,
  RInstance_MAX_PLAYERS: 6,
  RInstance_MIN_PLAYERS: 5,
  RInstance_MAX_TURNS: 3,
  RInstance_TIME_TO_JOIN: '200',
  RInstance_GAME_PRICE: utils.parseUnits('0.001', 9),
  RInstance_JOIN_GAME_PRICE: utils.parseUnits('0.001', 9),
  RInstance_NUM_WINNERS: 3,
  RInstance_VOTE_CREDITS: 14,
  RInstance_SUBJECT: 'Best Music on youtube',
  PRINCIPAL_TIME_CONSTANT: 3600,
  RInstance_MIN_GAME_TIME: 360,
  PRINCIPAL_COST: utils.parseUnits('1', 9),
};
class FellowshipManager {
  threads: ThreadAgent[] = [];
  hre: HardhatRuntimeEnvironment;
  env: EnvSetupResult;
  maxSize: number;
  adr: AdrSetupResult;
  votersAddresses: string[] = [];
  rankifyInstance: RankifyDiamondInstance;
  rankToken: RankToken;
  publicKeys: Record<string, string> = {};
  constructor(
    hre: HardhatRuntimeEnvironment,
    env: EnvSetupResult,
    adr: AdrSetupResult,
    rankifyInstance: RankifyDiamondInstance,
    rankToken: RankToken,
  ) {
    log('Initializing EnvironmentSimulator');
    this.maxSize = 15;
    this.hre = hre;
    this.env = env;
    this.adr = adr;
    this.rankifyInstance = rankifyInstance;
    this.rankToken = rankToken;
    this.mockProposalSecrets = this.mockProposalSecrets.bind(this);
    this.mockProposals = this.mockProposals.bind(this);
    this.mockVotes = this.mockVotes.bind(this);
    this.attestVote = this.attestVote.bind(this);
    this.getPlayers = this.getPlayers.bind(this);
    this.getCreateGameParams = this.getCreateGameParams.bind(this);
    this.getPlayerVoteSalt = this.getPlayerVoteSalt.bind(this);
    log('EnvironmentSimulator initialized');
  }

  baseFee = 1 * 10 ** 18;

  /**
   * Game settings and configuration values
   */
  RInstanceSettings = () => ({
    RInstance_TIME_PER_TURN: constantParams.RInstance_TIME_PER_TURN,
    RInstance_MAX_PLAYERS: constantParams.RInstance_MAX_PLAYERS,
    RInstance_MIN_PLAYERS: constantParams.RInstance_MIN_PLAYERS,
    RInstance_MAX_TURNS: constantParams.RInstance_MAX_TURNS,
    RInstance_TIME_TO_JOIN: constantParams.RInstance_TIME_TO_JOIN,
    RInstance_GAME_PRICE: constantParams.RInstance_GAME_PRICE,
    RInstance_JOIN_GAME_PRICE: constantParams.RInstance_JOIN_GAME_PRICE,
    RInstance_NUM_WINNERS: constantParams.RInstance_NUM_WINNERS,
    RInstance_VOTE_CREDITS: constantParams.RInstance_VOTE_CREDITS,
    RInstance_SUBJECT: constantParams.RInstance_SUBJECT,
    PRINCIPAL_TIME_CONSTANT: constantParams.PRINCIPAL_TIME_CONSTANT,
    RInstance_MIN_GAME_TIME: constantParams.RInstance_MIN_GAME_TIME,
    PRINCIPAL_COST: constantParams.PRINCIPAL_COST,
  });

  getCreateGameParams = (gameId: BigNumberish, gameMaster?: Wallet): IRankifyInstance.NewGameParamsInputStruct => ({
    metadata: 'default metadata',
    gameMaster: gameMaster?.address ?? this.adr.gameMaster1.address,
    gameRank: gameId,
    maxPlayerCnt: constantParams.RInstance_MAX_PLAYERS,
    minPlayerCnt: constantParams.RInstance_MIN_PLAYERS,
    timePerTurn: constantParams.RInstance_TIME_PER_TURN,
    timeToJoin: constantParams.RInstance_TIME_TO_JOIN,
    nTurns: constantParams.RInstance_MAX_TURNS,
    voteCredits: constantParams.RInstance_VOTE_CREDITS,
    minGameTime: constantParams.RInstance_MIN_GAME_TIME,
  });

  public async createGame({
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
  }) {
    log(`Creating game with rank ${gameRank} and minGameTime ${minGameTime}`, 2);
    await this.env.rankifyToken
      .connect(signer)
      .approve(this.rankifyInstance.address, this.hre.ethers.constants.MaxUint256)
      .then(r => r.wait(1));
    const expectedGameId = (await this.rankifyInstance.getContractState().then(state => state.numGames)).add(1);
    const params: IRankifyInstance.NewGameParamsInputStruct = {
      metadata: metadata ?? 'test metadata',
      gameMaster: gameMaster,
      gameRank: gameRank,
      maxPlayerCnt: constantParams.RInstance_MAX_PLAYERS,
      minPlayerCnt: constantParams.RInstance_MIN_PLAYERS,
      timePerTurn: constantParams.RInstance_TIME_PER_TURN,
      timeToJoin: constantParams.RInstance_TIME_TO_JOIN,
      nTurns: constantParams.RInstance_MAX_TURNS,
      voteCredits: constantParams.RInstance_VOTE_CREDITS,
      minGameTime: minGameTime,
    };
    await this.rankifyInstance
      .connect(signer)
      .createGame(params)
      .then(r => r.wait(1));
    const gameId = await this.rankifyInstance.getContractState().then(state => state.numGames);
    assert(gameId.eq(expectedGameId), 'Game ID mismatch');
    if (openNow)
      await this.rankifyInstance
        .connect(signer)
        .openRegistration(gameId)
        .then(r => r.wait(1));
    log(`Game created with ID ${gameId}`, 2);
    return gameId;
  }
}

export default FellowshipManager;
