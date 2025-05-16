import { Fellowship } from '../types';
import { BigNumberish, utils, Wallet } from 'ethers';
// @ts-ignore
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { AdrSetupResult } from './setupMockEnvironment';
import { log } from './utils';
import BaseEnvironmentSimulator from './BaseEnvironmentSimulator';
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString();
};

/**
 * Represents a signer's identity in the game
 */

/**
 * Result of setting up addresses for testing/deployment
 * Contains all player, admin and special role identities
 */

export interface MockVote {
  vote: BigNumberish[];
  ballotHash: string;
  ballot: {
    vote: BigNumberish[];
    salt: string;
  };
  ballotId: string;
  gmSignature: string;
  voterSignature: string;
}

export const constantParams = {
  RANKIFY_INSTANCE_CONTRACT_NAME: 'RANKIFY_INSTANCE_NAME',
  RANKIFY_INSTANCE_CONTRACT_VERSION: '0.0.1',
  RInstance_MIN_PLAYERS: 5,
  PRINCIPAL_TIME_CONSTANT: 3600,
  PRINCIPAL_COST: utils.parseUnits('1', 9),
};
class FellowshipAgent extends BaseEnvironmentSimulator {
  fellowship: Fellowship;
  owner: Wallet;
  //   threads: Thread[];
  constructor(hre: HardhatRuntimeEnvironment, adr: AdrSetupResult, fellowship: Fellowship, owner: Wallet) {
    super(hre, adr);
    log('Initializing FellowshipAgent');
    this.fellowship = fellowship;
    this.owner = owner;
    // this.threads = [];
    log('FellowshipAgent initialized');
  }

  baseFee = 1 * 10 ** 18;

  getThreads = async () => {
    const { ethers } = this.hre;
    const installations = this.fellowship.queryFilter(this.fellowship.filters.InstalledByTag('round-robin-thread'));
    return installations.then(
      async i =>
        await Promise.all(
          i.map(async installation => {
            const contract = await ethers.getContractAt('Thread', installation.args.contracts[0]);
            return {
              contract,
              appId: installation.args.appId,
            };
          }),
        ),
    );
  };

  addDistribution = async (distributor: string, distributionId: string, tag: string) => {
    return await this.fellowship.connect(this.owner).allowDistribution(distributor, distributionId, tag);
  };

  removeDistribution = async (distributor: string, distributionId: string, tag: string) => {
    return await this.fellowship.connect(this.owner).disallowDistribution(distributor, distributionId, tag);
  };

  getDistributions = async () => {
    const allowedDistributions = await this.fellowship.queryFilter(
      this.fellowship.filters.DistributionAllowed(null, null),
    );
    const disallowedDistributions = await this.fellowship.queryFilter(
      this.fellowship.filters.DistributionDisallowed(null, null),
    );
    // If there is block number higher than current on same distributionId and Distributor, then it is disallowed
    const activeDistributions = allowedDistributions.filter(
      distribution =>
        !disallowedDistributions.some(
          disallowedDistribution =>
            disallowedDistribution.args.distributionId === distribution.args.distributionId &&
            disallowedDistribution.args.distributor === distribution.args.distributor &&
            disallowedDistribution.blockNumber > distribution.blockNumber,
        ),
    );
    return activeDistributions.map(distribution => ({
      distributionId: distribution.args.distributionId,
      distributor: distribution.args.distributor,
    }));
  };

  //   public async install({
  //     minGameTime,
  //     signer,
  //     gameMaster,
  //     gameRank,
  //     openNow,
  //     metadata,
  //   }: {
  //     minGameTime: BigNumberish;
  //     signer: Wallet | SignerWithAddress;
  //     gameMaster: string;
  //     gameRank: BigNumberish;
  //     openNow?: boolean;
  //     metadata?: string;
  //   }) {
  //     log(`Creating game with rank ${gameRank} and minGameTime ${minGameTime}`, 2);

  //     const thread =

  //     await this.env.rankifyToken
  //       .connect(signer)
  //       .approve(this.rankifyInstance.address, this.hre.ethers.constants.MaxUint256)
  //       .then(r => r.wait(1));
  //     const expectedGameId = (await this.rankifyInstance.getContractState().then(state => state.numGames)).add(1);
  //     const params: IRankifyInstance.NewGameParamsInputStruct = {
  //       metadata: metadata ?? 'test metadata',
  //       gameMaster: gameMaster,
  //       gameRank: gameRank,
  //       maxPlayerCnt: constantParams.RInstance_MAX_PLAYERS,
  //       minPlayerCnt: constantParams.RInstance_MIN_PLAYERS,
  //       timePerTurn: constantParams.RInstance_TIME_PER_TURN,
  //       timeToJoin: constantParams.RInstance_TIME_TO_JOIN,
  //       nTurns: constantParams.RInstance_MAX_TURNS,
  //       voteCredits: constantParams.RInstance_VOTE_CREDITS,
  //       minGameTime: minGameTime,
  //     };
  //     await this.rankifyInstance
  //       .connect(signer)
  //       .createGame(params)
  //       .then(r => r.wait(1));
  //     const gameId = await this.rankifyInstance.getContractState().then(state => state.numGames);
  //     assert(gameId.eq(expectedGameId), 'Game ID mismatch');
  //     if (openNow)
  //       await this.rankifyInstance
  //         .connect(signer)
  //         .openRegistration(gameId)
  //         .then(r => r.wait(1));
  //     log(`Game created with ID ${gameId}`, 2);
  //     return gameId;
  //   }
}

export default FellowshipAgent;
