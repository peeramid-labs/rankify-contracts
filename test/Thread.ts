import FellowshipManager, { MockVote, ProposalSubmission } from '../scripts/ThreadAgent';
import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { BranchToken, Rankify, Fellowship, Thread } from '../types';

import { deployments, ethers as ethersDirect } from 'hardhat';
import { BigNumber, BigNumberish } from 'ethers';
import { assert } from 'console';
import addDistribution from '../scripts/addDistribution';
import hre from 'hardhat';
const path = require('path');

const scriptName = path.basename(__filename);

import { getCodeIdFromArtifact } from '../scripts/getCodeId';
import { MAODistribution } from '../types/src/distributions/MAODistribution';
import { generateDistributorData } from '../scripts/libraries/generateDistributorData';
import { generateDeterministicPermutation } from '../scripts/proofs';
import { HardhatEthersHelpers } from 'hardhat/types';
import { EnvSetupResult, setupAddresses } from '../scripts/setupMockEnvironment';
import { AdrSetupResult } from '../scripts/setupMockEnvironment';
import { setupTest } from './utils';
import ThreatAgent from '../scripts/ThreadAgent';

let votersAddresses: string[];
let thread: Thread;
let fellowship: Fellowship;
let govtToken: BranchToken;

const setupMainTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }, options) => {
  //   const setup = await setupTest();
  const adr = await setupAddresses(hre);
  const ThreadDeployment = await deployments.deploy('Thread', {
    from: adr.contractDeployer.wallet.address,
    skipIfAlreadyDeployed: true,
  });
  const FellowshipDeployment = await deployments.deploy('Fellowship', {
    from: adr.contractDeployer.wallet.address,
    skipIfAlreadyDeployed: true,
  });
  //   const env = setup.env;

  //   await addDistribution(hre)({
  //     distrId: await getCodeIdFromArtifact(hre)('MAODistribution'),
  //     signer: adr.gameOwner.wallet,
  //   });
  //   const { owner } = await getNamedAccounts();
  const oSigner = await ethers.getSigner(owner);
  //   const distributorArguments: MAODistribution.DistributorArgumentsStruct = {
  //     tokenSettings: {
  //       tokenName: 'tokenName',
  //       tokenSymbol: 'tokenSymbol',
  //     },
  //     rankifySettings: {
  //       FellowshipContractURI: 'https://example.com/rank',
  //       FellowshipURI: 'https://example.com/rank',
  //       principalCost: constantParams.PRINCIPAL_COST,
  //       principalTimeConstant: constantParams.PRINCIPAL_TIME_CONSTANT,
  //       owner,
  //     },
  //   };
  //   const data = generateDistributorData(distributorArguments);
  //   const maoCode = await ethers.provider.getCode(env.maoDistribution.address);
  //   const maoId = ethers.utils.keccak256(maoCode);
  //   const distributorsDistId = await hre.run('defaultDistributionId');
  //   if (!distributorsDistId) throw new Error('Distribution name not found');
  //   if (typeof distributorsDistId !== 'string') throw new Error('Distribution name must be a string');

  const token = await deployments.get('Rankify');

  const tokenContract = new ethers.Contract(token.address, token.abi, oSigner) as Rankify;
  await tokenContract.mint(oSigner.address, ethers.utils.parseUnits('100', 9));
  //   await tokenContract.approve(env.distributor.address, ethers.constants.MaxUint256);
  //   await env.distributor.connect(oSigner).instantiate(distributorsDistId, data);

  //   const filter = env.distributor.filters.Instantiated();
  //   const evts = await env.distributor.queryFilter(filter);
  this.thread = (await ethers.getContractAt('Thread', ThreadDeployment.address)) as Thread;
  this.fellowship = (await ethers.getContractAt('Fellowship', FellowshipDeployment.address)) as Fellowship;
  //   govtToken = (await ethers.getContractAt(
  //     'BranchToken',
  //     evts[0].args.instances[0],
  //   )) as BranchToken;

  const simulator = new ThreatAgent(hre, env, adr, thread, Fellowship);

  return { ethers, getNamedAccounts, adr, env, simulator, thread, govtToken, Fellowship };
});
const setupFirstRankTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    let initialCreatorBalance: BigNumber;
    let initialBeneficiaryBalance: BigNumber;
    let initialTotalSupply: BigNumber;
    let gamePrice: BigNumber;
    // Get initial balances
    initialCreatorBalance = await simulator.env.rankifyToken.balanceOf(simulator.adr.gameCreator1.wallet.address);
    initialBeneficiaryBalance = await simulator.env.rankifyToken.balanceOf(
      await simulator.thread.getContractState().then(s => s.commonParams.beneficiary),
    );
    initialTotalSupply = await simulator.env.rankifyToken.totalSupply();

    // Get common params for price calculation
    const { commonParams } = await thread.getContractState();
    const { principalTimeConstant } = commonParams;
    const minGameTime = principalTimeConstant; // Using same value for simplicity
    gamePrice = commonParams.principalCost.mul(principalTimeConstant).div(minGameTime);

    // Create the game
    await simulator.createGame({
      minGameTime,
      signer: simulator.adr.gameCreator1.wallet,
      gameMaster: simulator.adr.gameMaster1.address,
      gameRank: 1,
      metadata: 'test metadata',
    });
    return { initialCreatorBalance, initialBeneficiaryBalance, initialTotalSupply, gamePrice };
  });

const setupOpenRegistrationTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    await simulator.thread.connect(simulator.adr.gameCreator1.wallet).openRegistration(1);
  });

const filledPartyTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    await simulator.fillParty({
      players: simulator.getPlayers(simulator.adr, RInstance_MIN_PLAYERS),
      gameId: 1,
      shiftTime: false,
      gameMaster: simulator.adr.gameMaster1,
    });
  });

const startedGameTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    await simulator.startGame(1);
  });

const proposalsReceivedTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    const playersCnt = await simulator.thread.getPlayers(1).then(players => players.length);
    const proposals = await simulator.mockProposals({
      players: simulator.getPlayers(simulator.adr, playersCnt),
      gameMaster: simulator.adr.gameMaster1,
      gameId: 1,
      submitNow: true,
    });
    return { proposals };
  });

const gameOverTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    await simulator.runToTheEnd(1);
  });

const proposalsMissingTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    await simulator.endTurn({ gameId: 1 });

    const playersCnt = await simulator.thread.getPlayers(1).then(players => players.length);
    const players = simulator.getPlayers(simulator.adr, playersCnt);
    const votes = await simulator.mockValidVotes(players, 1, simulator.adr.gameMaster1, true);
    return { votes };
  });

const firstTurnMadeTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    const playersCnt = await simulator.thread.getPlayers(1).then(players => players.length);
    const players = simulator.getPlayers(simulator.adr, playersCnt);
    const proposals = await simulator.mockProposals({
      players,
      gameMaster: simulator.adr.gameMaster1,
      gameId: 1,
      submitNow: true,
    });
    await simulator.endWithIntegrity({
      gameId: 1,
      players,
      votes: [],
      gm: simulator.adr.gameMaster1,
      idlers: [0],
      proposals,
    });
  });

const allPlayersVotedTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    const playersCnt = await simulator.thread.getPlayers(1).then(players => players.length);
    const players = simulator.getPlayers(simulator.adr, playersCnt);
    const votes = await simulator.mockValidVotes(players, 1, simulator.adr.gameMaster1, true);
    return { votes };
  });
const notEnoughPlayersTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    await simulator.fillParty({
      players: simulator.getPlayers(simulator.adr, RInstance_MIN_PLAYERS - 1),
      gameId: 1,
      shiftTime: true,
      gameMaster: simulator.adr.gameMaster1,
    });
  });

const lastTurnEqualScoresTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    await simulator.thread.connect(simulator.adr.gameCreator1.wallet).openRegistration(1);
    await simulator.fillParty({
      players: simulator.getPlayers(simulator.adr, RInstance_MAX_PLAYERS),
      gameId: 1,
      shiftTime: true,
      gameMaster: simulator.adr.gameMaster1,
      startGame: true,
    });
    await simulator.runToLastTurn(1, simulator.adr.gameMaster1, 'equal');
  });
const inOvertimeTest = (simulator: FellowshipManager) =>
  deployments.createFixture(async () => {
    const playerCnt = await thread.getPlayers(1).then(players => players.length);
    const votes = await simulator.mockValidVotes(
      simulator.getPlayers(simulator.adr, playerCnt),
      1,
      simulator.adr.gameMaster1,
      true,
      'equal',
    );
    const proposals = await simulator.mockProposals({
      players: simulator.getPlayers(simulator.adr, playerCnt),
      gameMaster: simulator.adr.gameMaster1,
      gameId: 1,
      submitNow: true,
    });

    const receipt = await simulator.endWithIntegrity({
      gameId: 1,
      players: simulator.getPlayers(simulator.adr, playerCnt),
      proposals,
      votes: votes.map(vote => vote.vote),
      gm: simulator.adr.gameMaster1,
    });
    return { receipt, votes, proposals };
  });

describe(scriptName, () => {
  let requirement: LibCoinVending.ConfigPositionStruct = {
    ethValues: {
      have: ethersDirect.utils.parseEther('0.1'),
      burn: ethersDirect.utils.parseEther('0.1'),
      pay: ethersDirect.utils.parseEther('0.1'),
      bet: ethersDirect.utils.parseEther('0.1'),
      lock: ethersDirect.utils.parseEther('0.1'),
    },
    contracts: [],
  };

  let adr: AdrSetupResult;
  let env: EnvSetupResult;
  let simulator: FellowshipManager;
  let eth: typeof ethersDirect & HardhatEthersHelpers;
  let mockProposals: typeof simulator.mockProposals;
  let getPlayers: typeof simulator.getPlayers;
  let endWithIntegrity: typeof simulator.endWithIntegrity;
  let signJoiningGame: typeof simulator.signJoiningGame;
  let getNamedAccounts: typeof hre.getNamedAccounts;

  beforeEach(async () => {
    const setup = await setupMainTest();
    adr = setup.adr;
    env = setup.env;
    simulator = setup.simulator;
    mockProposals = simulator.mockProposals;
    getPlayers = simulator.getPlayers;
    endWithIntegrity = simulator.endWithIntegrity;
    signJoiningGame = simulator.signJoiningGame;
    getNamedAccounts = hre.getNamedAccounts;
    eth = setup.ethers;
  });
  it('Has correct initial settings', async () => {
    const { DAO } = await hre.getNamedAccounts();
    const {
      rank,
      startedAt,
      currentTurn,
      turnStartedAt,
      numCommitments,
      numVotesThisTurn,
      numVotesPrevTurn,
      numPrevProposals,
      registrationOpenAt,
      numOngoingProposals,
      permutationCommitment,
      numActiveParticipants,
      numParticipantsMadeMove,
      createdBy,
      winner,
      hasStarted,
      hasEnded,
      isOvertime,
      metadata,
      settings,
    } = await thread.connect(adr.gameCreator1.wallet).getContractState();
    expect;
    // expect(state.commonParams.principalTimeConstant).to.be.equal(PRINCIPAL_TIME_CONSTANT);
    // expect(state.commonParams.principalCost).to.be.equal(PRINCIPAL_COST);
    // expect(state.commonParams.beneficiary).to.be.equal(DAO);
    // expect(state.commonParams.FellowshipAddress).to.be.equal(Fellowship.address);
  });
  it('Ownership is renounced', async () => {
    expect(await thread.owner()).to.be.equal(eth.constants.AddressZero);
    await expect(
      thread.connect(adr.maliciousActor1.wallet).transferOwnership(adr.gameCreator1.wallet.address),
    ).to.revertedWith('LibDiamond: Must be contract owner');
  });
  it('has rank token assigned', async () => {
    const state = await thread.getContractState();
    expect(state.commonParams.FellowshipAddress).to.be.equal(Fellowship.address);
  });
  it('Can create game only with valid payments', async () => {
    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(thread.address, 0);
    const params: Ithread.NewGameParamsInputStruct = simulator.getCreateGameParams(1);

    await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).to.be.revertedWithCustomError(
      env.rankifyToken,
      'ERC20InsufficientAllowance',
    );
    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(thread.address, eth.constants.MaxUint256);
    await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).to.emit(thread, 'gameCreated');
    await env.rankifyToken
      .connect(adr.gameCreator1.wallet)
      .burn(await env.rankifyToken.balanceOf(adr.gameCreator1.wallet.address));
    await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).to.revertedWithCustomError(
      env.rankifyToken,
      'ERC20InsufficientBalance',
    );
  });

  it('Cannot perform actions on games that do not exist', async () => {
    const s1 = await simulator.signJoiningGame({
      gameId: 1,
      participant: adr.gameCreator1.wallet,
      signer: adr.gameMaster1,
    });
    await expect(
      thread
        .connect(adr.gameCreator1.wallet)
        .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
    ).to.be.revertedWith('game not found');
    let proposals = await simulator.mockProposals({
      players: simulator.getPlayers(adr, RInstance_MAX_PLAYERS),
      gameId: 1,
      turn: 1,
      gameMaster: adr.gameMaster1,
    });
    await expect(thread.connect(adr.gameMaster1).submitProposal(proposals[0].params)).to.be.revertedWith(
      'game not found',
    );
    votersAddresses = simulator.getPlayers(adr, RInstance_MAX_PLAYERS).map(player => player.wallet.address);
    const votes = await simulator.mockVotes({
      gameId: 1,
      turn: 1,
      verifier: thread,
      players: simulator.getPlayers(adr, RInstance_MAX_PLAYERS),
      gm: adr.gameMaster1,
      distribution: 'semiUniform',
    });
    await expect(
      thread
        .connect(adr.gameMaster1)
        .submitVote(
          1,
          votes[0].ballotId,
          adr.players[0].wallet.address,
          votes[0].gmSignature,
          votes[0].voterSignature,
          votes[0].ballotHash,
        ),
    ).to.be.revertedWith('game not found');
    await expect(thread.connect(adr.gameMaster1).openRegistration(1)).to.be.revertedWith('game not found');

    const s2 = await simulator.signJoiningGame({ gameId: 1, participant: adr.gameMaster1, signer: adr.gameMaster1 });

    await expect(
      thread.connect(adr.gameMaster1).joinGame(0, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
    ).to.be.revertedWith('game not found');
    await expect(
      thread.connect(adr.gameMaster1).startGame(
        0,
        await generateDeterministicPermutation({
          gameId: 1,
          turn: 1,
          verifierAddress: thread.address,
          chainId: await hre.getChainId(),
          gm: adr.gameMaster1,
          size: await thread.getPlayers(0).then(players => players.length),
        }).then(perm => perm.commitment),
      ),
    ).to.be.revertedWith('game not found');
    proposals = await mockProposals({
      players: getPlayers(adr, RInstance_MAX_PLAYERS),
      gameId: 1,
      turn: 1,
      gameMaster: adr.gameMaster1,
    });
    await expect(
      endWithIntegrity({
        gameId: 1,
        players: getPlayers(adr, RInstance_MAX_PLAYERS),
        proposals,
        votes: votes.map(vote => vote.vote),
        gm: adr.gameMaster1,
      }),
    ).to.be.revertedWith('game not found');
    await expect(thread.connect(adr.gameMaster1).submitProposal(proposals[0].params)).to.be.revertedWith(
      'game not found',
    );
  });
  describe('When a game of first rank was created', () => {
    let initialCreatorBalance: BigNumber;
    let initialBeneficiaryBalance: BigNumber;
    let initialTotalSupply: BigNumber;
    let gamePrice: BigNumber;

    beforeEach(async () => {
      const setup = await setupFirstRankTest(simulator)();
      initialCreatorBalance = setup.initialCreatorBalance;
      initialBeneficiaryBalance = setup.initialBeneficiaryBalance;
      initialTotalSupply = setup.initialTotalSupply;
      gamePrice = setup.gamePrice;
    });

    it('can read game metadata', async () => {
      const { metadata } = await thread.getGameState(1);
      expect(metadata).to.be.equal('test metadata');
    });

    it('Should handle game creation costs and token distribution correctly', async () => {
      const finalCreatorBalance = await env.rankifyToken.balanceOf(adr.gameCreator1.wallet.address);
      const finalBeneficiaryBalance = await env.rankifyToken.balanceOf(
        await thread.getContractState().then(s => s.commonParams.beneficiary),
      );
      const finalTotalSupply = await env.rankifyToken.totalSupply();

      // Check creator's balance is reduced by game cost
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance.sub(gamePrice),
        "Creator's balance should be reduced by game cost",
      );

      // Check beneficiary receives 10% of game cost
      const beneficiaryShare = gamePrice.mul(10).div(100);
      expect(finalBeneficiaryBalance).to.equal(
        initialBeneficiaryBalance.add(beneficiaryShare),
        'Beneficiary should receive 10% of game cost',
      );

      // Check 90% of game cost is burned
      const burnedAmount = gamePrice.mul(90).div(100);
      expect(finalTotalSupply).to.equal(initialTotalSupply.sub(burnedAmount), '90% of game cost should be burned');
    });
    it('can get game state', async () => {
      const state = await thread.getGameState(1);
      expect(state.rank).to.be.equal(1);
      expect(state.minGameTime).to.be.equal(PRINCIPAL_TIME_CONSTANT);
      expect(state.createdBy).to.be.equal(adr.gameCreator1.wallet.address);
      expect(state.numOngoingProposals).to.be.equal(0);
      expect(state.numPrevProposals).to.be.equal(0);
      expect(state.numCommitments).to.be.equal(0);
      expect(state.numVotesPrevTurn).to.be.equal(0);
      expect(state.currentTurn).to.be.equal(0);
      expect(state.turnStartedAt).to.be.equal(0);
      expect(state.registrationOpenAt).to.be.equal(0);
      expect(state.startedAt).to.be.equal(0);
      expect(state.hasStarted).to.be.equal(false);
      expect(state.hasEnded).to.be.equal(false);
      expect(state.numPlayersMadeMove).to.be.equal(0);
      expect(state.numActivePlayers).to.be.equal(0);
      expect(state.isOvertime).to.be.equal(false);
    });

    it('Should calculate game price correctly for different time parameters', async () => {
      const { commonParams } = await thread.getContractState();

      // Test cases with different time parameters
      const testCases = [
        { minGameTime: commonParams.principalTimeConstant },
        { minGameTime: commonParams.principalTimeConstant.mul(2) },
        { minGameTime: commonParams.principalTimeConstant.div(2) },
      ];

      for (const testCase of testCases) {
        const expectedPrice = commonParams.principalCost
          .mul(commonParams.principalTimeConstant)
          .div(testCase.minGameTime);

        const params: Ithread.NewGameParamsInputStruct = {
          gameMaster: adr.gameMaster1.address,
          gameRank: 1,
          maxPlayerCnt: RInstance_MAX_PLAYERS,
          minPlayerCnt: RInstance_MIN_PLAYERS,
          timePerTurn: RInstance_TIME_PER_TURN,
          timeToJoin: RInstance_TIME_TO_JOIN,
          nTurns: RInstance_MAX_TURNS,
          voteCredits: RInstance_VOTE_CREDITS,
          minGameTime: testCase.minGameTime,
          metadata: 'test metadata',
        };
        const { DAO } = await getNamedAccounts();
        const totalSupplyBefore = await env.rankifyToken.totalSupply();
        await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).changeTokenBalances(
          env.rankifyToken,
          [adr.gameCreator1.wallet.address, DAO],
          [expectedPrice.mul(-1), expectedPrice.mul(10).div(100)],
        );
        expect(await env.rankifyToken.totalSupply()).to.be.equal(totalSupplyBefore.sub(expectedPrice.mul(90).div(100)));
        // Get actual game price
        const actualPrice = await thread.estimateGamePrice(testCase.minGameTime);

        // Allow for small rounding differences due to division
        const difference = expectedPrice.sub(actualPrice).abs();
        expect(difference.lte(1)).to.be.true;
      }
    });

    it('GM is correct', async () => {
      expect(await thread.getGM(1)).to.be.equal(adr.gameMaster1.address);
    });
    it('Incremented number of games correctly', async () => {
      const state = await thread.connect(adr.gameCreator1.wallet).getContractState();
      expect(state.numGames).to.be.equal(1);
    });
    it('Players cannot join until registration is open', async () => {
      await env.rankifyToken.connect(adr.players[0].wallet).approve(thread.address, eth.constants.MaxUint256);
      const gameId = await thread.getContractState().then(s => s.numGames);
      const s1 = await simulator.signJoiningGame({
        gameId: 1,
        participant: adr.players[0].wallet,
        signer: adr.gameMaster1,
      });
      await expect(
        thread
          .connect(adr.players[0].wallet)
          .joinGame(gameId, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
      ).to.be.revertedWith('addPlayer->cant join now');
    });
    it('Allows only game creator to add join requirements', async () => {
      await expect(thread.connect(adr.gameCreator1.wallet).setJoinRequirements(1, requirement)).to.be.emit(
        thread,
        'RequirementsConfigured',
      );
      await expect(thread.connect(adr.maliciousActor1.wallet).setJoinRequirements(1, requirement)).to.be.revertedWith(
        'Only game creator',
      );
      await expect(thread.connect(adr.maliciousActor1.wallet).setJoinRequirements(11, requirement)).to.be.revertedWith(
        'game not found',
      );
    });
    it('Only game creator can open registration', async () => {
      await expect(thread.connect(adr.gameCreator1.wallet).openRegistration(1)).to.be.emit(thread, 'RegistrationOpen');
      await expect(thread.connect(adr.maliciousActor1.wallet).openRegistration(1)).to.be.revertedWith(
        'Only game creator',
      );
    });
    describe('When registration was open without any additional requirements', () => {
      beforeEach(async () => {
        await setupOpenRegistrationTest(simulator)();
      });
      it('Should reject join attempt with invalid signature', async () => {
        // Try with wrong signer
        const s1 = await simulator.signJoiningGame({
          gameId: 1,
          participant: adr.players[0].wallet,
          signer: adr.gameMaster2,
        }); // Using wrong game master
        await expect(
          thread
            .connect(adr.players[0].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        ).to.be.revertedWithCustomError(thread, 'invalidECDSARecoverSigner');

        // Try with wrong gameId
        const s2 = await simulator.signJoiningGame({
          gameId: 2,
          participant: adr.players[0].wallet,
          signer: adr.gameMaster1,
        }); // Wrong gameId
        await expect(
          thread
            .connect(adr.players[0].wallet)
            .joinGame(1, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
        ).to.be.revertedWithCustomError(thread, 'invalidECDSARecoverSigner');

        // Try with wrong participant
        const s3 = await signJoiningGame({ gameId: 1, participant: adr.players[1].wallet, signer: adr.gameMaster1 }); // Wrong participant
        await expect(
          thread
            .connect(adr.players[0].wallet)
            .joinGame(1, s3.signature, s3.gmCommitment, s3.deadline, s3.participantPubKey),
        ).to.be.revertedWithCustomError(thread, 'invalidECDSARecoverSigner');

        const s4 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        const tamperedSalt = eth.utils.hexZeroPad('0xdeadbeef', 32); // Different salt than what was signed
        await expect(
          thread
            .connect(adr.players[0].wallet)
            .joinGame(1, s4.signature, tamperedSalt, s4.deadline, s4.participantPubKey),
        ).to.be.revertedWithCustomError(thread, 'invalidECDSARecoverSigner');
      });

      it('Should accept valid signature from correct game master', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await expect(
          thread
            .connect(adr.players[0].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        )
          .to.emit(thread, 'PlayerJoined')
          .withArgs(1, adr.players[0].wallet.address, s1.gmCommitment, s1.participantPubKey);
      });

      it('Mutating join requirements is no longer possible', async () => {
        await expect(thread.connect(adr.gameCreator1.wallet).setJoinRequirements(1, requirement)).to.be.revertedWith(
          'Cannot do when registration is open',
        );
      });
      it('Qualified players can join', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await expect(
          thread
            .connect(adr.players[0].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        ).to.be.emit(thread, 'PlayerJoined');
      });
      it('Game cannot be started until join block time has passed unless game is full', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await thread
          .connect(adr.players[0].wallet)
          .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
        await expect(
          thread.connect(adr.players[0].wallet).startGame(
            1,
            await generateDeterministicPermutation({
              gameId: 1,
              turn: 0,
              verifierAddress: thread.address,
              chainId: await hre.getChainId(),
              gm: adr.gameMaster1,
              size: await thread.getPlayers(1).then(players => players.length),
            }).then(perm => perm.commitment),
          ),
        ).to.be.revertedWith('startGame->Not enough players');
        const s2 = await signJoiningGame({ gameId: 1, participant: adr.players[1].wallet, signer: adr.gameMaster1 });
        await thread
          .connect(adr.players[1].wallet)
          .joinGame(1, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey);
        const s3 = await signJoiningGame({ gameId: 1, participant: adr.players[2].wallet, signer: adr.gameMaster1 });
        await thread
          .connect(adr.players[2].wallet)
          .joinGame(1, s3.signature, s3.gmCommitment, s3.deadline, s3.participantPubKey);
        const s4 = await signJoiningGame({ gameId: 1, participant: adr.players[3].wallet, signer: adr.gameMaster1 });
        await thread
          .connect(adr.players[3].wallet)
          .joinGame(1, s4.signature, s4.gmCommitment, s4.deadline, s4.participantPubKey);
        const s5 = await signJoiningGame({ gameId: 1, participant: adr.players[4].wallet, signer: adr.gameMaster1 });
        await thread
          .connect(adr.players[4].wallet)
          .joinGame(1, s5.signature, s5.gmCommitment, s5.deadline, s5.participantPubKey);
        const s6 = await signJoiningGame({ gameId: 1, participant: adr.players[5].wallet, signer: adr.gameMaster1 });
        await thread
          .connect(adr.players[5].wallet)
          .joinGame(1, s6.signature, s6.gmCommitment, s6.deadline, s6.participantPubKey);
        await expect(
          thread.connect(adr.players[0].wallet).startGame(
            1,
            await generateDeterministicPermutation({
              gameId: 1,
              turn: 0,
              verifierAddress: thread.address,
              chainId: await hre.getChainId(),
              gm: adr.gameMaster1,
              size: await thread.getPlayers(1).then(players => players.length),
            }).then(perm => perm.commitment),
          ),
        ).to.be.emit(thread, 'GameStarted');
      });
      it('No more than max players can join', async () => {
        for (let i = 1; i < RInstance_MAX_PLAYERS + 1; i++) {
          const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[i].wallet, signer: adr.gameMaster1 });
          await thread
            .connect(adr.players[i].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
        }
        await env.rankifyToken.connect(adr.maliciousActor1.wallet).approve(thread.address, eth.constants.MaxUint256);
        const s1 = await signJoiningGame({
          gameId: 1,
          participant: adr.maliciousActor1.wallet,
          signer: adr.gameMaster1,
        });
        await expect(
          thread
            .connect(adr.maliciousActor1.wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        ).to.be.revertedWith('addPlayer->party full');
      });
      it('Game methods beside join and start are inactive', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await thread
          .connect(adr.players[0].wallet)
          .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
        const proposals = await mockProposals({
          players: getPlayers(adr, RInstance_MAX_PLAYERS),
          gameId: 1,
          turn: 1,
          gameMaster: adr.gameMaster1,
        });

        // const playerCnt = await thread.getPlayers(1).then(players => players.length);
        const players = getPlayers(adr, RInstance_MAX_PLAYERS);
        // const turnSalt = await getTestShuffleSalt(1, 1, adr.gameMaster1);
        await expect(
          endWithIntegrity({
            gameId: 1,
            players,
            proposals,
            votes: players.map(() => players.map(() => 0)),
            gm: adr.gameMaster1,
          }),
        ).to.be.revertedWith('Game has not yet started');
        const lastVotes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, false);
        await expect(
          thread
            .connect(adr.gameMaster1)
            .submitVote(
              1,
              lastVotes[0].ballotId,
              adr.players[0].wallet.address,
              lastVotes[0].gmSignature,
              lastVotes[0].voterSignature,
              lastVotes[0].ballotHash,
            ),
        ).to.be.revertedWith('Game has not yet started');
        await expect(thread.connect(adr.gameCreator1.wallet).openRegistration(1)).to.be.revertedWith(
          'Cannot do when registration is open',
        );
        await expect(thread.connect(adr.gameCreator1.wallet).setJoinRequirements(1, requirement)).to.be.revertedWith(
          'Cannot do when registration is open',
        );

        await expect(
          endWithIntegrity({
            gameId: 1,
            players,
            proposals,
            votes: players.map(() => players.map(() => 0)),
            gm: adr.gameMaster1,
          }),
        ).to.be.revertedWith('Game has not yet started');
      });
      it('Cannot be started if not enough players', async () => {
        await simulator.mineBlocks(RInstance_TIME_TO_JOIN + 1);
        await expect(
          thread.connect(adr.gameMaster1).startGame(
            1,
            await generateDeterministicPermutation({
              gameId: 1,
              turn: 0,
              verifierAddress: thread.address,
              chainId: await hre.getChainId(),
              gm: adr.gameMaster1,
              size: await thread.getPlayers(1).then(players => players.length),
            }).then(perm => perm.commitment),
          ),
        ).to.be.revertedWith('startGame->Not enough players');
      });
      describe('When there is minimal number and below maximum players in game', () => {
        beforeEach(async () => {
          await filledPartyTest(simulator)();
        });
        it('Can start game after joining period is over', async () => {
          await expect(
            thread.connect(adr.gameMaster1).startGame(
              1,
              await generateDeterministicPermutation({
                gameId: 1,
                turn: 0,
                verifierAddress: thread.address,
                chainId: await hre.getChainId(),
                gm: adr.gameMaster1,
                size: await thread.getPlayers(1).then(players => players.length),
              }).then(perm => perm.commitment),
            ),
          ).to.be.revertedWith('startGame->Not enough players');
          const currentT = await time.latest();
          await time.setNextBlockTimestamp(currentT + Number(RInstance_TIME_TO_JOIN) + 1);
          await simulator.mineBlocks(1);
          await expect(
            thread.connect(adr.gameMaster1).startGame(
              1,
              await generateDeterministicPermutation({
                gameId: 1,
                turn: 0,
                verifierAddress: thread.address,
                chainId: await hre.getChainId(),
                gm: adr.gameMaster1,
                size: await thread.getPlayers(1).then(players => players.length),
              }).then(perm => perm.commitment),
            ),
          ).to.be.emit(thread, 'GameStarted');
        });
        it('Game methods beside start are inactive', async () => {
          const proposals = await mockProposals({
            players: getPlayers(adr, RInstance_MAX_PLAYERS),
            gameId: 1,
            turn: 1,
            gameMaster: adr.gameMaster1,
          });
          await expect(thread.connect(adr.gameMaster1).submitProposal(proposals[0].params)).to.be.revertedWith(
            'Game has not yet started',
          );
          const votes = await simulator.mockVotes({
            gameId: 1,
            turn: 1,
            verifier: thread,
            players: getPlayers(adr, RInstance_MAX_PLAYERS),
            gm: adr.gameMaster1,
            distribution: 'semiUniform',
          });
          votersAddresses = getPlayers(adr, RInstance_MAX_PLAYERS).map(player => player.wallet.address);
          // const turnSalt = await getTestShuffleSalt(1, 1, adr.gameMaster1);
          const integrity = await simulator.getProposalsIntegrity({
            players: getPlayers(adr, RInstance_MAX_PLAYERS),
            gameId: 1,
            turn: 1,
            gm: adr.gameMaster1,
          });
          await expect(
            endWithIntegrity({
              gameId: 1,
              players: getPlayers(adr, RInstance_MAX_PLAYERS),
              proposals,
              votes: votes.map(vote => vote.vote),
              gm: adr.gameMaster1,
            }),
          ).to.be.revertedWith('Game has not yet started');
          await expect(
            thread
              .connect(adr.gameMaster1)
              .submitVote(
                1,
                votes[0].ballotId,
                adr.players[0].wallet.address,
                votes[0].gmSignature,
                votes[0].voterSignature,
                votes[0].ballotHash,
              ),
          ).to.be.revertedWith('Game has not yet started');
        });
        describe('When game has started', () => {
          beforeEach(async () => {
            await startedGameTest(simulator)();
          });
          it('Can finish turn early if previous turn participant did not made a move', async () => {
            const playersCnt = await thread.getPlayers(1).then(players => players.length);
            const players = getPlayers(adr, playersCnt);
            const proposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
              idlers: [0],
            });

            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
            const votes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, false);
            const turn = await thread.getTurn(1);
            assert(turn.eq(1));
            await simulator.endWithIntegrity({
              gameId: 1,
              players,
              proposals,
              votes: votes.map(vote => vote.ballot.vote),
              gm: adr.gameMaster1,
              idlers: [0],
            });

            const newProposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
              idlers: [0],
            });

            const newVotes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, false);

            for (let i = 0; i < newVotes.length; i++) {
              if (i !== 0) {
                await thread
                  .connect(adr.gameMaster1)
                  .submitVote(
                    1,
                    newVotes[i].ballotId,
                    players[i].wallet.address,
                    newVotes[i].gmSignature,
                    newVotes[i].voterSignature,
                    newVotes[i].ballotHash,
                  );
              }
            }

            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
            await expect(
              endWithIntegrity({
                gameId: 1,
                players,
                proposals: newProposals,
                votes: newVotes.map(vote => vote.ballot.vote),
                gm: adr.gameMaster1,
                idlers: [0],
              }),
            ).to.emit(thread, 'TurnEnded');
            const newestVotes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, true);
            expect(await thread.isActive(1, proposals[0].params.proposer)).to.be.false;
            const newestProposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
              idlers: [1],
            });
            expect(await thread.isActive(1, newestProposals[0].params.proposer)).to.be.true;
            await expect(
              endWithIntegrity({
                gameId: 1,
                players,
                proposals: newestProposals,
                votes: newestVotes.map(vote => vote.ballot.vote),
                gm: adr.gameMaster1,
                idlers: [1],
              }),
            ).to.be.revertedWith('nextTurn->CanEndEarly');
          });
          it('First turn has started', async () => {
            expect(await thread.connect(adr.players[0].wallet).getTurn(1)).to.be.equal(1);
          });
          it('Cannot end game before minimum game time', async () => {
            const playerCnt = await thread.getPlayers(1).then(players => players.length);
            const players = simulator.getPlayers(simulator.adr, playerCnt);
            await simulator.runToLastTurn(1, adr.gameMaster1, 'ftw');
            const votes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, true, 'ftw');
            const canEnd = await thread.canEndTurn(1);
            expect(canEnd).to.be.equal(false);
            const proposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
            });

            await expect(simulator.endTurn({ gameId: 1, votes, proposals })).to.be.revertedWith(
              'Game duration less than minimum required time',
            );
            await time.setNextBlockTimestamp((await time.latest()) + RInstance_MIN_GAME_TIME - 100);
            await expect(simulator.endTurn({ gameId: 1, votes, proposals })).to.be.revertedWith(
              'Game duration less than minimum required time',
            );
            await time.increase(await thread.getGameState(1).then(state => state.minGameTime));
            await expect(simulator.endTurn({ gameId: 1, votes, proposals })).to.not.be.reverted;
          });
          it('Accepts only proposals and no votes', async () => {
            const proposals = await simulator.mockProposals({
              players: getPlayers(adr, RInstance_MIN_PLAYERS),
              gameId: 1,
              turn: 1,
              gameMaster: adr.gameMaster1,
            });
            await expect(thread.connect(adr.gameMaster1).submitProposal(proposals[0].params)).to.be.emit(
              thread,
              'ProposalSubmitted',
            );
            const votes = await simulator.mockVotes({
              gameId: 1,
              turn: 1,
              verifier: thread,
              players: getPlayers(adr, RInstance_MIN_PLAYERS),
              gm: adr.gameMaster1,
              distribution: 'semiUniform',
            });
            votersAddresses = getPlayers(adr, RInstance_MAX_PLAYERS).map(player => player.wallet.address);

            await expect(
              thread
                .connect(adr.gameMaster1)
                .submitVote(
                  1,
                  votes[0].ballotId,
                  votersAddresses[0],
                  votes[0].gmSignature,
                  votes[0].voterSignature,
                  votes[0].ballotHash,
                ),
            ).to.be.revertedWith('No proposals exist at turn 1: cannot vote');
          });
          it('Can end turn if timeout reached with zero scores', async () => {
            const playerCnt = await thread.getPlayers(1).then(players => players.length);
            const proposals = await simulator.mockProposals({
              players: getPlayers(adr, playerCnt),
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
            });
            await time.increase(RInstance_TIME_PER_TURN + 1);
            await expect(
              endWithIntegrity({
                gameId: 1,
                players: getPlayers(adr, playerCnt),
                proposals,
                votes: await simulator
                  .mockValidVotes(getPlayers(adr, playerCnt), 1, adr.gameMaster1, false, 'ftw')
                  .then(votes => votes.map(vote => vote.vote.map(v => 0))),
                gm: adr.gameMaster1,
              }),
            )
              .to.be.emit(thread, 'TurnEnded')
              .withArgs(
                1,
                1,
                getPlayers(adr, RInstance_MIN_PLAYERS).map(identity => identity.wallet.address),
                getPlayers(adr, RInstance_MIN_PLAYERS).map(() => '0'),
                [],
                [],
                [],
              );
          });
          describe('When all proposals received', () => {
            let proposals: ProposalSubmission[] = [];
            beforeEach(async () => {
              const setupResult = await proposalsReceivedTest(simulator)();
              proposals = setupResult.proposals;
            });
            it('Can end turn', async () => {
              const playersCnt = await thread.getPlayers(1).then(players => players.length);
              await expect(
                endWithIntegrity({
                  gameId: 1,
                  players: getPlayers(adr, playersCnt),
                  proposals,
                  votes: [],
                  gm: adr.gameMaster1,
                }),
              ).to.be.emit(thread, 'TurnEnded');
            });
            describe('When turn is over and there is one proposal missing', async () => {
              let votes: MockVote[] = [];
              beforeEach(async () => {
                const setupResult = await proposalsMissingTest(simulator)();
                votes = setupResult.votes;
                proposals = [];
              });
              it('Can end next turn ', async () => {
                // ToDo: add "with correct scores" to the end of the test
                const playersCnt = await thread.getPlayers(1).then(players => players.length);
                const players = getPlayers(adr, playersCnt);
                const turn = await thread.getTurn(1);
                // const turnSalt = await getTestShuffleSalt(1, turn, adr.gameMaster1);
                const integrity = await simulator.getProposalsIntegrity({
                  players,
                  gameId: 1,
                  turn: turn,
                  gm: adr.gameMaster1,
                  proposalSubmissionData: await simulator.mockProposals({
                    players,
                    gameMaster: adr.gameMaster1,
                    gameId: 1,
                    submitNow: true,
                    idlers: [0],
                  }),
                  idlers: [0],
                });
                await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
                await expect(
                  thread.connect(adr.gameMaster1).endTurn(
                    1,
                    votes.map(v => v.vote),
                    integrity.newProposals,
                    integrity.permutation,
                    integrity.nullifier,
                  ),
                ).to.be.emit(thread, 'TurnEnded');
              });
            });
            describe('When first turn was made', () => {
              beforeEach(async () => {
                await firstTurnMadeTest(simulator)();
              });

              it('throws if player votes twice', async () => {
                const votes = await simulator.mockValidVotes(
                  getPlayers(adr, RInstance_MIN_PLAYERS),
                  1,
                  adr.gameMaster1,
                  true,
                );
                const proposals = await simulator.mockProposals({
                  players: getPlayers(adr, RInstance_MIN_PLAYERS),
                  gameMaster: adr.gameMaster1,
                  gameId: 1,
                  submitNow: true,
                });

                await expect(
                  thread
                    .connect(adr.gameMaster1)
                    .submitVote(
                      1,
                      votes[0].ballotId,
                      adr.players[0].wallet.address,
                      votes[0].gmSignature,
                      votes[0].voterSignature,
                      votes[0].ballotHash,
                    ),
                ).to.be.revertedWith('Already voted');
              });
              it('shows no players made a turn', async () => {
                expect(await thread.getPlayersMoved(1)).to.deep.equal([
                  getPlayers(adr, RInstance_MIN_PLAYERS).map(() => false),
                  eth.BigNumber.from('0'),
                ]);
              });
              it('shows no players made a turn even after player send proposal', async () => {
                const proposals = await simulator.mockProposals({
                  players: getPlayers(adr, RInstance_MIN_PLAYERS),
                  gameMaster: adr.gameMaster1,
                  gameId: 1,
                  submitNow: false,
                });
                await thread.connect(adr.gameMaster1).submitProposal(proposals[0].params);
                await thread.connect(adr.gameMaster1).submitProposal(proposals[1].params);
                expect(await thread.getPlayersMoved(1)).to.deep.equal([
                  getPlayers(adr, RInstance_MIN_PLAYERS).map(() => false),
                  eth.BigNumber.from('0'),
                ]);
              });
              describe('When all players voted', () => {
                let votes: MockVote[] = [];
                beforeEach(async () => {
                  const setupResult = await allPlayersVotedTest(simulator)();
                  votes = setupResult.votes;
                });
                it('cannot end turn because players still have time to propose', async () => {
                  const playersCnt = await thread.getPlayers(1).then(players => players.length);
                  const players = getPlayers(adr, playersCnt);
                  await expect(
                    endWithIntegrity({
                      gameId: 1,
                      players,
                      proposals: await simulator.mockProposals({
                        players,
                        gameMaster: adr.gameMaster1,
                        gameId: 1,
                        submitNow: false,
                        idlers: players.map((_, i) => i),
                      }),
                      votes: votes.map(vote => vote.vote),
                      gm: adr.gameMaster1,
                      idlers: players.map((_, i) => i),
                    }),
                  ).to.be.revertedWith('nextTurn->CanEndEarly');
                });
                it('Can end turn if timeout reached', async () => {
                  const currentT = await time.latest();

                  const playersCnt = await thread.getPlayers(1).then(players => players.length);
                  const players = getPlayers(adr, playersCnt);
                  const expectedScores: number[] = players.map(v => 0);

                  const turn = await thread.getTurn(1);
                  // const turnSalt = await getTestShuffleSalt(1, turn, adr.gameMaster1);

                  const integrity = await simulator.getProposalsIntegrity({
                    players,
                    gameId: 1,
                    turn,
                    gm: adr.gameMaster1,
                    proposalSubmissionData: await simulator.mockProposals({
                      players,
                      gameMaster: adr.gameMaster1,
                      gameId: 1,
                      submitNow: true,
                      idlers: players.map((_, i) => i),
                    }),
                    idlers: players.map((_, i) => i),
                  });
                  for (let participant = 0; participant < players.length; participant++) {
                    if (votes.length > participant) {
                      for (let candidate = 0; candidate < players.length; candidate++) {
                        expectedScores[candidate] += Number(
                          votes[participant].vote[Number(integrity.permutation[candidate])],
                        );
                      }
                    } else {
                      //somebody did not vote at all
                    }
                  }
                  await time.setNextBlockTimestamp(currentT + Number(RInstance_TIME_PER_TURN) + 1);
                  expect(await thread.getTurn(1)).to.be.equal(2);
                  await expect(
                    await thread.connect(adr.gameMaster1).endTurn(
                      1,
                      votes.map(vote => vote.vote),
                      integrity.newProposals,
                      integrity.permutation,
                      integrity.nullifier,
                    ),
                  ).to.be.emit(thread, 'TurnEnded');
                });
                it('Rejects attempts to shuffle votes due to ballot integrity check', async () => {
                  const playerCnt = await thread.getPlayers(1).then(players => players.length);
                  const currentT = await time.latest();
                  await time.setNextBlockTimestamp(currentT + Number(RInstance_TIME_PER_TURN) + 1);
                  expect(await thread.getTurn(1)).to.be.equal(2);
                  const players = getPlayers(adr, playerCnt);
                  const expectedScores: number[] = players.map(v => 0);
                  for (let i = 0; i < players.length; i++) {
                    if (votes.length > i) {
                      votes[i].vote.forEach((vote, idx) => {
                        expectedScores[idx] += Number(vote);
                      });
                    } else {
                      //somebody did not vote at all
                    }
                  }
                  const shuffle = <T>(array: T[]): T[] => {
                    let currentIndex = array.length,
                      randomIndex;

                    // While there remain elements to shuffle.
                    while (currentIndex > 0) {
                      // Pick a remaining element.
                      randomIndex = Math.floor(Math.random() * currentIndex);
                      currentIndex--;

                      // And swap it with the current element.
                      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
                    }

                    return array;
                  };
                  votersAddresses = await thread.getPlayers(1);
                  const proposerIndex = shuffle(votersAddresses.map((p, idx) => idx));
                  const votesShuffled: BigNumberish[][] = [];
                  votes.forEach(({ vote }, i) => {
                    votesShuffled.push(Array(votersAddresses.length).fill(0));
                    vote.forEach((points, votedForIdx) => {
                      votesShuffled[i][proposerIndex[votedForIdx]] = points;
                    });
                  });

                  await expect(
                    endWithIntegrity({
                      gameId: 1,
                      players,
                      proposals,
                      votes: votesShuffled,
                      gm: adr.gameMaster1,
                    }),
                  ).to.be.revertedWithCustomError(thread, 'ballotIntegrityCheckFailed');
                });
                it('Emits correct ProposalScore event values', async () => {
                  const currentT = await time.latest();
                  //   await time.setNextBlockTimestamp(currentT + Number(RInstance_TIME_PER_TURN) + 1);
                  expect(await thread.getTurn(1)).to.be.equal(2);
                  const playerCnt = await thread.getPlayers(1).then(players => players.length);
                  const players = getPlayers(adr, playerCnt);

                  const turn = await thread.getTurn(1);
                  // const turnSalt = await getTestShuffleSalt(1, turn, adr.gameMaster1);
                  const mockProposals = await simulator.mockProposals({
                    players: players,
                    gameMaster: adr.gameMaster1,
                    gameId: 1,
                    submitNow: true,
                    // idlers: players.map((_, i) => i),
                    // idlers: players.map((_, i) => i),
                  });
                  const integrity = await simulator.getProposalsIntegrity({
                    players: players,
                    gameId: 1,
                    turn,
                    gm: adr.gameMaster1,
                    proposalSubmissionData: mockProposals,
                    // idlers: players.map((_, i) => i),
                  });

                  const sortedVotes: BigNumberish[][] = [];
                  for (let i = 0; i < players.length; i++) {
                    sortedVotes.push(Array(players.length).fill(0));
                    for (let j = 0; j < players.length; j++) {
                      sortedVotes[i][j] = votes[i].vote[Number(integrity.permutation[j])];
                    }
                  }
                  //   console.log(sortedVotes);

                  const expectedScores: number[] = players.map(v => 0);
                  for (let participant = 0; participant < players.length; participant++) {
                    if (votes.length > participant) {
                      for (let candidate = 0; candidate < players.length; candidate++) {
                        expectedScores[candidate] += Number(sortedVotes[participant][candidate]);
                      }
                    } else {
                      //somebody did not vote at all
                    }
                  }
                  await thread.connect(adr.gameMaster1).endTurn(
                    1,
                    votes.map(vote => vote.vote),
                    integrity.newProposals,
                    integrity.permutation,
                    integrity.nullifier,
                  );
                  const turnEndedEvts = await thread.queryFilter(thread.filters.TurnEnded(1, turn));

                  expect(turnEndedEvts[0].args.scores.map(s => s.toString())).to.deep.equal(
                    expectedScores.map(s => s.toString()),
                  );

                  const evts = (await thread.queryFilter(thread.filters.ProposalScore(1, turn))).map(e => e.args);
                  const { proposalsNotPermuted: prevProposalsNotPermuted } = await simulator.getProposalsIntegrity({
                    players: players,
                    gameId: 1,
                    turn: Number(turn) - 1,
                    gm: adr.gameMaster1,
                    proposalSubmissionData: await simulator.mockProposals({
                      players,
                      gameMaster: adr.gameMaster1,
                      gameId: 1,
                      submitNow: false,
                      turn: Number(turn) - 1,
                    }),
                  });

                  //   expect(evts[0].proposal).to.be.equal(prevProposals[0].proposal);
                  const firstPlayerProposal = prevProposalsNotPermuted[0];
                  const evt = evts.find(p => p.proposal == firstPlayerProposal);
                  expect(evt).to.not.be.undefined;
                  expect(evt && evt.score.toString()).to.be.equal(expectedScores[0].toString());
                });
              });
            });
          });
        });
        describe('When another game  of first rank is created', () => {
          beforeEach(async () => {
            await simulator.createGame({
              minGameTime: RInstance_MIN_GAME_TIME,
              signer: adr.gameCreator1.wallet,
              gameMaster: adr.gameMaster2.address,
              gameRank: 1,
              openNow: true,
              metadata: 'test metadata',
            });
          });
          it('Reverts if players from another game tries to join', async () => {
            const s1 = await simulator.signJoiningGame({
              gameId: 2,
              participant: adr.players[0].wallet,
              signer: adr.gameMaster1,
            });
            await expect(
              thread
                .connect(adr.players[0].wallet)
                .joinGame(2, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
            ).to.be.revertedWith('addPlayer->Player in game');
          });
        });
      });
      describe('When there is not enough players and join time is out', () => {
        beforeEach(async () => {
          await notEnoughPlayersTest(simulator)();
        });
        it('It throws on game start', async () => {
          await expect(
            thread.connect(adr.gameCreator1.wallet).startGame(
              1,
              await generateDeterministicPermutation({
                gameId: 1,
                turn: 0,
                verifierAddress: thread.address,
                chainId: await hre.getChainId(),
                gm: adr.gameMaster1,
                size: 15,
              }).then(perm => perm.commitment),
            ),
          ).to.be.revertedWith('startGame->Not enough players');
        });
        it('Allows creator can close the game', async () => {
          await expect(thread.connect(adr.gameCreator1.wallet).cancelGame(1)).to.emit(thread, 'GameClosed');
        });
        it('Allows player to leave the game', async () => {
          await expect(thread.connect(adr.players[0].wallet).leaveGame(1)).to.emit(thread, 'PlayerLeft');
        });
      });
    });
    describe('When it is last turn and equal scores', () => {
      beforeEach(async () => {
        await lastTurnEqualScoresTest(simulator)();
      });
      it('Next turn without winner brings Game is in overtime conditions', async () => {
        const playerCnt = await thread.getPlayers(1).then(players => players.length);
        let isGameOver = await thread.isGameOver(1);
        expect(isGameOver).to.be.false;
        const proposals = await simulator.mockProposals({
          players: getPlayers(adr, playerCnt),
          gameMaster: adr.gameMaster1,
          gameId: 1,
          submitNow: true,
        });
        const votes = await simulator.mockValidVotes(getPlayers(adr, playerCnt), 1, adr.gameMaster1, true, 'equal');

        // const turnSalt = await getTestShuffleSalt(1, await thread.getTurn(1), adr.gameMaster1);
        await endWithIntegrity({
          gameId: 1,
          players: getPlayers(adr, playerCnt),
          votes: votes.map(vote => vote.vote),
          gm: adr.gameMaster1,
          proposals,
        });

        expect(await thread.isOvertime(1)).to.be.true;
      });
      describe('when is overtime', () => {
        let votes: MockVote[] = [];
        let proposals: ProposalSubmission[] = [];
        beforeEach(async () => {
          const setupResult = await inOvertimeTest(simulator)();
          votes = setupResult.votes;
          proposals = setupResult.proposals;
          const isOvertime = await thread.isOvertime(1);
          assert(isOvertime, 'game is not overtime');
        });
        it('emits game Over when submitted votes result unique leaders', async () => {
          const playerCnt = await thread.getPlayers(1).then(players => players.length);
          const votes = await simulator.mockValidVotes(getPlayers(adr, playerCnt), 1, adr.gameMaster1, true, 'ftw');
          const proposals = await simulator.mockProposals({
            players: getPlayers(adr, playerCnt),
            gameMaster: adr.gameMaster1,
            gameId: 1,
            submitNow: true,
          });
          const timeToEnd = await thread.getGameState(1).then(state => state.minGameTime);
          await time.increase(timeToEnd.toNumber() + 1);
          // const turnSalt = await getTestShuffleSalt(1, await thread.getTurn(1), adr.gameMaster1);
          expect(
            await simulator.endWithIntegrity({
              gameId: 1,
              players: getPlayers(adr, playerCnt),
              votes: votes.map(vote => vote.vote),
              gm: adr.gameMaster1,
              proposals,
            }),
          ).to.emit(thread, 'GameOver');
        });
        it("Keeps game in overtime when submitted votes don't result unique leaders", async () => {
          const playerCnt = await thread.getPlayers(1).then(players => players.length);
          await simulator.mockValidVotes(getPlayers(adr, playerCnt), 1, adr.gameMaster1, true, 'equal');
          await simulator.mockProposals({
            players: getPlayers(adr, playerCnt),
            gameMaster: adr.gameMaster1,
            gameId: 1,
            submitNow: true,
          });
          expect(await thread.connect(adr.gameMaster1).isOvertime(1)).to.be.true;
          expect(await thread.connect(adr.gameMaster1).isGameOver(1)).to.be.false;
        });
      });

      describe('When game is over', () => {
        beforeEach(async () => {
          await gameOverTest(simulator)();
        });
        it('Throws on attempt to make another turn', async () => {
          const currentTurn = await thread.getTurn(1);
          const votes = await simulator.mockVotes({
            gameId: 1,
            turn: currentTurn,
            verifier: thread,
            players: getPlayers(adr, RInstance_MAX_PLAYERS),
            gm: adr.gameMaster1,
            distribution: 'ftw',
          });
          const proposals = await simulator.mockProposals({
            players: getPlayers(adr, RInstance_MAX_PLAYERS),
            gameId: 1,
            turn: currentTurn.toNumber(),
            gameMaster: adr.gameMaster1,
          });

          for (let i = 0; i < RInstance_MAX_PLAYERS; i++) {
            await expect(thread.connect(adr.gameMaster1).submitProposal(proposals[i].params)).to.be.revertedWith(
              'Game over',
            );

            await expect(
              thread
                .connect(adr.gameMaster1)
                .submitVote(
                  1,
                  votes[i].ballotId,
                  getPlayers(adr, RInstance_MAX_PLAYERS)[i].wallet.address,
                  votes[i].gmSignature,
                  votes[i].voterSignature,
                  votes[i].ballotHash,
                ),
            ).to.be.revertedWith('Game over');
          }
          // const turnSalt = await getTestShuffleSalt(1, await thread.getTurn(1), adr.gameMaster1);
          const integrity = await simulator.getProposalsIntegrity({
            players: simulator.getPlayers(simulator.adr, RInstance_MAX_PLAYERS),
            gameId: 1,
            turn: await thread.getTurn(1),
            gm: adr.gameMaster1,
            proposalSubmissionData: proposals,
          });
          await expect(
            thread.connect(adr.gameMaster1).endTurn(
              1,
              votes.map(vote => vote.vote),
              integrity.newProposals,
              integrity.permutation,
              integrity.nullifier,
            ),
          ).to.be.revertedWith('Game over');
        });
        it('Gave rewards to winner', async () => {
          const gameWinner = await thread.gameWinner(1);
          for (let i = 0; i < RInstance_MAX_PLAYERS; i++) {
            const player = getPlayers(adr, RInstance_MAX_PLAYERS)[i];
            if (player.wallet.address == gameWinner) {
              expect(await Fellowship.balanceOf(player.wallet.address, 2)).to.be.equal(1);
            } else {
              expect(await Fellowship.balanceOf(player.wallet.address, 2)).to.be.equal(0);
            }
          }
        });
        it('Allows winner to create game of next rank', async () => {
          const params: Ithread.NewGameParamsInputStruct = {
            gameMaster: adr.gameMaster1.address,
            gameRank: 2,
            maxPlayerCnt: RInstance_MAX_PLAYERS,
            minPlayerCnt: RInstance_MIN_PLAYERS,
            timeToJoin: RInstance_TIME_TO_JOIN,
            minGameTime: RInstance_MIN_GAME_TIME,
            voteCredits: RInstance_VOTE_CREDITS,
            nTurns: RInstance_MAX_TURNS,
            timePerTurn: RInstance_TIME_PER_TURN,
            metadata: 'test metadata',
          };
          await expect(thread.connect(adr.players[0].wallet).createGame(params)).to.emit(thread, 'gameCreated');
        });

        it('should allow burning rank tokens for derived tokens', async () => {
          const rankId = 2;
          const amount = 1;
          const player = adr.players[0];

          // Get initial balances
          const initialRankBalance = await Fellowship.balanceOf(player.wallet.address, rankId);
          const initialDerivedBalance = await govtToken.balanceOf(player.wallet.address);

          // Calculate expected derived tokens
          const commonParams = await thread.getCommonParams();
          const expectedDerivedTokens: BigNumber = commonParams.principalCost
            .mul(commonParams.minimumParticipantsInCircle.pow(rankId))
            .mul(amount);

          // Exit rank token
          await thread.connect(player.wallet).exitFellowship(rankId, amount);

          // Check balances after exit
          const finalRankBalance = await Fellowship.balanceOf(player.wallet.address, rankId);
          const finalDerivedBalance = await govtToken.balanceOf(player.wallet.address);
          expect(finalRankBalance).to.equal(initialRankBalance.sub(amount));
          expect(finalDerivedBalance).to.equal(initialDerivedBalance.add(expectedDerivedTokens));
        });

        it('should revert when trying to burn more tokens than owned', async () => {
          const rankId = 2;
          const player = adr.players[0];
          const balance = await Fellowship.balanceOf(player.wallet.address, rankId);
          await expect(
            thread.connect(player.wallet).exitFellowship(rankId, balance.add(1)),
          ).to.be.revertedWithCustomError(Fellowship, 'insufficient');
        });
        it('should not revert when trying to burn equal tokens owned', async () => {
          const rankId = 2;
          const player = adr.players[0];
          const balance = await Fellowship.balanceOf(player.wallet.address, rankId);
          await expect(thread.connect(player.wallet).exitFellowship(rankId, balance)).to.not.be.revertedWithCustomError(
            Fellowship,
            'insufficient',
          );
          const newBalance = await Fellowship.balanceOf(player.wallet.address, rankId);
          expect(newBalance).to.equal(0);
          await expect(thread.connect(player.wallet).exitFellowship(rankId, 1)).to.be.revertedWithCustomError(
            Fellowship,
            'insufficient',
          );
        });

        it('should emit FellowshipExited event', async () => {
          const rankId = 2;
          const amount = 1;
          const player = adr.players[0];

          const commonParams = await thread.getCommonParams();
          const expectedDerivedTokens: BigNumber = commonParams.principalCost
            .mul(commonParams.minimumParticipantsInCircle.pow(rankId))
            .mul(amount);

          await expect(thread.connect(player.wallet).exitFellowship(rankId, amount))
            .to.emit(thread, 'FellowshipExited')
            .withArgs(player.wallet.address, rankId, amount, expectedDerivedTokens);
        });

        describe('When game of next rank is created and opened', () => {
          beforeEach(async () => {
            const params: Ithread.NewGameParamsInputStruct = {
              gameMaster: adr.gameMaster1.address,
              gameRank: 2,
              maxPlayerCnt: RInstance_MAX_PLAYERS,
              minPlayerCnt: RInstance_MIN_PLAYERS,
              timeToJoin: RInstance_TIME_TO_JOIN,
              minGameTime: RInstance_MIN_GAME_TIME,
              voteCredits: RInstance_VOTE_CREDITS,
              nTurns: RInstance_MAX_TURNS,
              timePerTurn: RInstance_TIME_PER_TURN,
              metadata: 'test metadata',
            };
            await thread.connect(adr.players[0].wallet).createGame(params);
            await thread.connect(adr.players[0].wallet).openRegistration(2);
          });
          it('Can be joined only by rank token bearers', async () => {
            expect(await Fellowship.balanceOf(adr.players[0].wallet.address, 2)).to.be.equal(1);
            await Fellowship.connect(adr.players[0].wallet).setApprovalForAll(thread.address, true);
            await Fellowship.connect(adr.players[1].wallet).setApprovalForAll(thread.address, true);
            const s1 = await simulator.signJoiningGame({
              gameId: 2,
              participant: adr.players[0].wallet,
              signer: adr.gameMaster1,
            });
            const s2 = await simulator.signJoiningGame({
              gameId: 2,
              participant: adr.players[1].wallet,
              signer: adr.gameMaster1,
            });
            await expect(
              thread
                .connect(adr.players[0].wallet)
                .joinGame(2, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
            )
              .to.emit(thread, 'PlayerJoined')
              .withArgs(2, adr.players[0].wallet.address, s1.gmCommitment, s1.participantPubKey);
            await expect(
              thread
                .connect(adr.players[1].wallet)
                .joinGame(2, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
            ).to.be.revertedWithCustomError(Fellowship, 'insufficient');
          });
        });
      });
    });
    describe('When a game was played till end', () => {
      beforeEach(async () => {
        const state = await thread.getContractState();
        await thread.connect(adr.gameCreator1.wallet).openRegistration(state.numGames);
        await simulator.fillParty({
          players: simulator.getPlayers(simulator.adr, RInstance_MAX_PLAYERS),
          gameId: state.numGames,
          shiftTime: true,
          gameMaster: simulator.adr.gameMaster1,
          startGame: true,
        });
        await simulator.runToTheEnd(state.numGames);
      });
      it('Allows players to join another game of same rank if they have rank token', async () => {
        const params: Ithread.NewGameParamsInputStruct = {
          gameMaster: adr.gameMaster1.address,
          gameRank: 2,
          maxPlayerCnt: RInstance_MAX_PLAYERS,
          minPlayerCnt: RInstance_MIN_PLAYERS,
          timeToJoin: RInstance_TIME_TO_JOIN,
          minGameTime: RInstance_MIN_GAME_TIME,
          voteCredits: RInstance_VOTE_CREDITS,
          nTurns: RInstance_MAX_TURNS,
          timePerTurn: RInstance_TIME_PER_TURN,
          metadata: 'test metadata',
        };
        const players = getPlayers(adr, RInstance_MAX_PLAYERS);
        const winner = await thread['gameWinner(uint256)'](1);
        const winnerPlayer = players.find(p => p.wallet.address == winner);
        if (!winnerPlayer) {
          throw new Error('Winner player not found');
        }
        await thread.connect(winnerPlayer.wallet).createGame(params);
        const state = await thread.getContractState();
        await thread.connect(winnerPlayer.wallet).openRegistration(state.numGames);
        const s1 = await simulator.signJoiningGame({
          gameId: state.numGames,
          participant: winnerPlayer.wallet,
          signer: simulator.adr.gameMaster1,
        });
        await thread
          .connect(winnerPlayer.wallet)
          .joinGame(state.numGames, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
        const currentT = await time.latest();
        await time.setNextBlockTimestamp(currentT + Number(RInstance_TIME_TO_JOIN) + 1);
        const loser = players.find(p => p.wallet.address != winnerPlayer.wallet.address);
        if (!loser) {
          throw new Error('Loser player not found');
        }
        await Fellowship.connect(loser.wallet).setApprovalForAll(thread.address, true);

        const s2 = await simulator.signJoiningGame({
          gameId: state.numGames,
          participant: loser.wallet,
          signer: simulator.adr.gameMaster1,
        });
        await expect(
          thread
            .connect(loser.wallet)
            .joinGame(state.numGames, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
        ).to.be.revertedWithCustomError(Fellowship, 'insufficient');
      });
    });
  });
  it('should reject game creation with zero minimum time', async () => {
    const params: Ithread.NewGameParamsInputStruct = {
      gameMaster: adr.gameMaster1.address,
      gameRank: 1,
      maxPlayerCnt: RInstance_MAX_PLAYERS,
      minPlayerCnt: RInstance_MIN_PLAYERS,
      voteCredits: RInstance_VOTE_CREDITS,
      nTurns: RInstance_MAX_TURNS,
      minGameTime: 0,
      timePerTurn: RInstance_TIME_PER_TURN,
      timeToJoin: RInstance_TIME_TO_JOIN,
      metadata: 'test metadata',
    };

    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(thread.address, eth.constants.MaxUint256);
    await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).to.be.revertedWith(
      'LibRankify::newGame->Min game time zero',
    );
  });
  it('should validate minGameTime is divisible by number of turns', async () => {
    const params: Ithread.NewGameParamsInputStruct = {
      gameMaster: adr.gameMaster1.address,
      gameRank: 1,
      maxPlayerCnt: RInstance_MAX_PLAYERS,
      minPlayerCnt: RInstance_MIN_PLAYERS,
      voteCredits: RInstance_VOTE_CREDITS,
      nTurns: 5,
      minGameTime: 3601, // Not divisible by 5
      timePerTurn: RInstance_TIME_PER_TURN,
      metadata: 'test metadata',
      timeToJoin: RInstance_TIME_TO_JOIN,
    };

    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(thread.address, eth.constants.MaxUint256);
    await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).to.be.revertedWithCustomError(
      thread,
      'NoDivisionReminderAllowed',
    );
  });

  it('should validate turn count is greater than 2', async () => {
    const params: Ithread.NewGameParamsInputStruct = {
      gameMaster: adr.gameMaster1.address,
      gameRank: 1,
      maxPlayerCnt: RInstance_MAX_PLAYERS,
      minPlayerCnt: RInstance_MIN_PLAYERS,
      voteCredits: RInstance_VOTE_CREDITS,
      nTurns: 2,
      minGameTime: RInstance_MIN_GAME_TIME,
      timePerTurn: RInstance_TIME_PER_TURN,
      metadata: 'test metadata',
      timeToJoin: RInstance_TIME_TO_JOIN,
    };

    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(thread.address, eth.constants.MaxUint256);
    await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).to.be.revertedWithCustomError(
      thread,
      'invalidTurnCount',
    );
  });

  describe('Game creation with minimum participants', () => {
    it('should revert when minPlayerCnt is less than minimumParticipantsInCircle', async () => {
      const commonParams = await thread.getCommonParams();
      const invalidMinPlayers = commonParams.minimumParticipantsInCircle.sub(1);

      const params = {
        gameMaster: adr.gameMaster1.address,
        gameRank: 1,
        maxPlayerCnt: RInstance_MAX_PLAYERS,
        minPlayerCnt: invalidMinPlayers,
        minGameTime: 1000,
        maxGameTime: 2000,
        registrationTime: 1000,
        nTurns: 10,
        voteCredits: RInstance_VOTE_CREDITS,
        timePerTurn: RInstance_TIME_PER_TURN,
        timeToJoin: RInstance_TIME_TO_JOIN,
        votingTime: 1000,
        proposalTime: 1000,
        gameDescription: 'Test Game',
        metadata: 'test metadata',
      };

      await expect(thread.connect(adr.gameCreator1.wallet).createGame(params)).to.be.revertedWith(
        'Min player count too low',
      );
    });
  });

  // Add this test to the existing describe block
  describe('EIP712 Domain', () => {
    it('should have consistent domain separator parameters', async () => {
      const {
        _HASHED_NAME,
        _HASHED_VERSION,
        _CACHED_CHAIN_ID,
        _CACHED_THIS,
        _TYPE_HASH,
        _CACHED_DOMAIN_SEPARATOR,
        _NAME,
        _VERSION,
      } = await thread.inspectEIP712Hashes();
      // Verify name and version
      expect(_NAME).to.equal(RANKIFY_INSTANCE_CONTRACT_NAME);
      expect(_VERSION).to.equal(RANKIFY_INSTANCE_CONTRACT_VERSION);

      // Verify hashed components
      expect(_HASHED_NAME).to.equal(eth.utils.solidityKeccak256(['string'], [_NAME]));
      expect(_HASHED_VERSION).to.equal(eth.utils.solidityKeccak256(['string'], [_VERSION]));
      expect(_CACHED_CHAIN_ID).to.equal(await thread.currentChainId());
      expect(_CACHED_THIS.toLowerCase()).to.equal(thread.address.toLowerCase());

      // Verify domain separator construction
      const domainSeparator = eth.utils.keccak256(
        eth.utils.defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [_TYPE_HASH, _HASHED_NAME, _HASHED_VERSION, _CACHED_CHAIN_ID, _CACHED_THIS],
        ),
      );
      expect(_CACHED_DOMAIN_SEPARATOR).to.equal(domainSeparator);
    });
  });
});
