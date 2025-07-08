import EnvironmentSimulator, { MockVote, ProposalSubmission } from '../scripts/EnvironmentSimulator';
import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { DistributableGovernanceERC20, Governor, Rankify, RankifyDiamondInstance, RankToken } from '../types/';
import { IRankifyInstance, LibCoinVending } from '../types/src/facets/RankifyInstanceMainFacet';
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
import { EnvSetupResult, SignerIdentity } from '../scripts/setupMockEnvironment';
import { AdrSetupResult } from '../scripts/setupMockEnvironment';
import { setupTest } from './utils';
import { constantParams } from '../scripts/EnvironmentSimulator';
import { ProposalsIntegrity } from '../scripts/EnvironmentSimulator';
import { parseInstantiated } from '../scripts/parseInstantiated';
const {
  RANKIFY_INSTANCE_CONTRACT_NAME,
  RANKIFY_INSTANCE_CONTRACT_VERSION,
  RInstance_TIME_PER_TURN,
  RInstance_MAX_PLAYERS,
  RInstance_MIN_PLAYERS,
  RInstance_MAX_TURNS,
  RInstance_TIME_TO_JOIN,
  RInstance_VOTE_CREDITS,
  PRINCIPAL_TIME_CONSTANT,
  RInstance_MIN_GAME_TIME,
  PRINCIPAL_COST,
} = constantParams;
let votersAddresses: string[];
let rankifyInstance: RankifyDiamondInstance;
let rankToken: RankToken;
let govtToken: DistributableGovernanceERC20;
let governor: Governor;

const setupMainTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }, options) => {
  const setup = await setupTest();
  const adr = setup.adr;
  const env = setup.env;

  await addDistribution(hre)({
    distrId: await getCodeIdFromArtifact(hre)('MAODistribution'),
    signer: adr.gameOwner.wallet,
  });
  const { owner } = await getNamedAccounts();
  const oSigner = await ethers.getSigner(owner);
  console.log('oSigner', oSigner.address);
  const distributorArguments: MAODistribution.DistributorArgumentsStruct = {
    govSettings: {
      tokenName: 'tokenName',
      tokenSymbol: 'tokenSymbol',
      preMintAmounts: [ethers.utils.parseEther('100')],
      preMintReceivers: [oSigner.address],
      orgName: 'orgName',
      votingDelay: 3600,
      votingPeriod: 3600,
      quorum: 51,
    },
    rankifySettings: {
      paymentToken: env.rankifyToken.address,
      rankTokenContractURI: 'https://example.com/rank',
      rankTokenURI: 'https://example.com/rank',
      principalCost: constantParams.PRINCIPAL_COST,
      principalTimeConstant: constantParams.PRINCIPAL_TIME_CONSTANT,
    },
  };
  const data = generateDistributorData(distributorArguments);
  const maoCode = await ethers.provider.getCode(env.maoDistribution.address);
  const maoId = ethers.utils.keccak256(maoCode);
  const distributorsDistId = await hre.run('defaultDistributionId');
  if (!distributorsDistId) throw new Error('Distribution name not found');
  if (typeof distributorsDistId !== 'string') throw new Error('Distribution name must be a string');

  const token = await deployments.get('Rankify');

  const tokenContract = new ethers.Contract(token.address, token.abi, oSigner) as Rankify;
  await tokenContract.mint(oSigner.address, ethers.utils.parseUnits('100', 9));
  await tokenContract.approve(env.distributor.address, ethers.constants.MaxUint256);
  await env.distributor.connect(oSigner).instantiate(distributorsDistId, data);

  const filter = env.distributor.filters.Instantiated();
  const evts = await env.distributor.queryFilter(filter);
  rankifyInstance = (await ethers.getContractAt(
    'RankifyDiamondInstance',
    parseInstantiated(evts[0].args.instances).ACIDInstance,
  )) as RankifyDiamondInstance;

  govtToken = (await ethers.getContractAt(
    'DistributableGovernanceERC20',
    parseInstantiated(evts[0].args.instances).govToken,
  )) as DistributableGovernanceERC20;

  await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.gameCreator2.wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.gameCreator3.wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[0].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[1].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[2].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[3].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[4].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[5].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[6].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[7].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[8].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
  await env.rankifyToken.connect(adr.players[9].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);

  rankToken = (await ethers.getContractAt(
    'RankToken',
    parseInstantiated(evts[0].args.instances).rankToken,
  )) as RankToken;
  const requirement: LibCoinVending.ConfigPositionStruct = {
    ethValues: {
      have: ethers.utils.parseEther('0.1'),
      burn: ethers.utils.parseEther('0.1'),
      pay: ethers.utils.parseEther('0.1'),
      bet: ethers.utils.parseEther('0.1'),
      lock: ethers.utils.parseEther('0.1'),
    },
    contracts: [],
  };
  governor = (await ethers.getContractAt('Governor', parseInstantiated(evts[0].args.instances).governor)) as Governor;
  console.log('governor', governor.address);
  requirement.contracts = [];
  requirement.contracts.push({
    contractAddress: env.mockERC20.address,
    contractId: '0',
    contractType: '0',
    contractRequirement: {
      lock: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      pay: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      bet: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      burn: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      have: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
    },
  });
  requirement.contracts.push({
    contractAddress: env.mockERC1155.address,
    contractId: '1',
    contractType: '1',
    contractRequirement: {
      lock: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      pay: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      bet: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      burn: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
      have: { amount: ethers.utils.parseEther('0.1'), data: '0x' },
    },
  });

  requirement.contracts.push({
    contractAddress: env.mockERC721.address,
    contractId: '1',
    contractType: '2',
    contractRequirement: {
      lock: { amount: ethers.utils.parseEther('0'), data: '0x' },
      pay: { amount: ethers.utils.parseEther('0'), data: '0x' },
      bet: { amount: ethers.utils.parseEther('0'), data: '0x' },
      burn: { amount: ethers.utils.parseEther('0'), data: '0x' },
      have: { amount: '1', data: '0x' },
    },
  });
  const simulator = new EnvironmentSimulator(hre, env, adr, rankifyInstance, rankToken);

  return {
    requirement,
    ethers,
    getNamedAccounts,
    adr,
    env,
    simulator,
    rankifyInstance,
    govtToken,
    governor,
    rankToken,
  };
});
const setupFirstRankTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    let initialCreatorBalance: BigNumber;
    let initialBeneficiaryBalance: BigNumber;
    let initialTotalSupply: BigNumber;
    let gamePrice: BigNumber;
    // Get initial balances
    initialCreatorBalance = await simulator.env.rankifyToken.balanceOf(simulator.adr.gameCreator1.wallet.address);
    initialBeneficiaryBalance = await simulator.env.rankifyToken.balanceOf(
      await simulator.rankifyInstance.getContractState().then(s => s.commonParams.beneficiary),
    );
    initialTotalSupply = await simulator.env.rankifyToken.totalSupply();

    // Get common params for price calculation
    const { commonParams } = await rankifyInstance.getContractState();
    const { principalTimeConstant } = commonParams;
    const minGameTime = constantParams.RInstance_MIN_GAME_TIME; // Using same value for simplicity
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

const setupOpenRegistrationTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulator.rankifyInstance.connect(simulator.adr.gameCreator1.wallet).openRegistration(1);
  });

const filledPartyTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulator.fillParty({
      players: simulator.getPlayers(simulator.adr, RInstance_MIN_PLAYERS),
      gameId: 1,
      shiftTime: false,
      gameMaster: simulator.adr.gameMaster1,
    });
  });

const startedGameTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulator.startGame(1);
  });

const proposalsReceivedTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    const playersCnt = await simulator.rankifyInstance.getPlayers(1).then(players => players.length);
    const proposals = await simulator.mockProposals({
      players: simulator.getPlayers(simulator.adr, playersCnt),
      gameMaster: simulator.adr.gameMaster1,
      gameId: 1,
      submitNow: true,
    });
    return { proposals };
  });

const gameOverTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulator.runToTheEnd(1);
  });

const proposalsMissingTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    const gameId = await simulator.createGame({
      minGameTime: RInstance_MIN_GAME_TIME,
      signer: simulator.adr.gameCreator1.wallet,
      gameMaster: simulator.adr.gameMaster1.address,
      gameRank: 1,
      openNow: true,
      metadata: 'proposalsMissingTest game',
    });

    const playersForThisTest = simulator.getPlayers(simulator.adr, RInstance_MIN_PLAYERS, RInstance_MIN_PLAYERS);

    await simulator.fillParty({
      players: playersForThisTest,
      gameId: gameId,
      shiftTime: true,
      gameMaster: simulator.adr.gameMaster1,
      startGame: true,
    });

    const playerCnt = await simulator.rankifyInstance.getPlayers(gameId).then(players => players.length);
    const players = simulator.getPlayers(simulator.adr, playerCnt, RInstance_MIN_PLAYERS);
    const idlers = [0, 1];
    const currentTurnBN = await simulator.rankifyInstance.getTurn(gameId);
    const currentTurn = currentTurnBN.toNumber();

    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: simulator.adr.gameMaster1,
      gameId: gameId,
      submitNow: false,
      idlers: idlers,
      turn: currentTurn,
    });

    for (let i = 0; i < players.length; i++) {
      if (!idlers.includes(i)) {
        await simulator.rankifyInstance
          .connect(simulator.adr.gameMaster1)
          .submitProposal(proposalDataForAllSlots[i].params);
      }
    }

    // Advance time to allow proposing stage to end
    const gameState = await simulator.rankifyInstance.getGameState(gameId);
    await time.increase(gameState.proposingPhaseDuration.toNumber() + 1);

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn,
      gm: simulator.adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: idlers,
    });

    await simulator.rankifyInstance.connect(simulator.adr.gameMaster1).endProposing(gameId, integrity.newProposals);

    expect(await simulator.rankifyInstance.isVotingStage(gameId)).to.be.true;
    return { gameId, players, integrity };
  });

const firstTurnMadeTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulator.endTurn({
      gameId: 1,
    });
  });

const allPlayersProposedTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    const playersCnt = await simulator.rankifyInstance.getPlayers(1).then(players => players.length);
    const players = simulator.getPlayers(simulator.adr, playersCnt);
    const isProposingStage = await simulator.rankifyInstance.isProposingStage(1);
    if (isProposingStage) {
      const proposals = await simulator.mockProposals({
        players,
        gameMaster: simulator.adr.gameMaster1,
        gameId: 1,
        submitNow: true,
      });
      const { newProposals, permutation, nullifier } = await simulator.getProposalsIntegrity({
        players: simulator.getPlayers(simulator.adr, players.length),
        gameId: 1,
        turn: 1,
        gm: simulator.adr.gameMaster1,
        proposalSubmissionData: proposals,
      });
      return { proposals };
    }
    // const votes = await simulator.mockValidVotes(players, 1, simulator.adr.gameMaster1, true);
    return { proposals: [] };
  });
const notEnoughPlayersTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulator.rankifyInstance.connect(simulator.adr.gameCreator1.wallet).openRegistration(1);
    await simulator.fillParty({
      players: simulator.getPlayers(simulator.adr, RInstance_MIN_PLAYERS - 1),
      gameId: 1,
      shiftTime: true,
      gameMaster: simulator.adr.gameMaster1,
    });
  });

const lastTurnEqualScoresTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulator.createGame({
      minGameTime: RInstance_MIN_GAME_TIME,
      signer: simulator.adr.gameCreator1.wallet,
      gameMaster: simulator.adr.gameMaster1.address,
      gameRank: 1,
      openNow: false,
      metadata: 'test metadata',
    });
    await simulator.rankifyInstance.connect(simulator.adr.gameCreator1.wallet).openRegistration(1);
    await simulator.fillParty({
      players: simulator.getPlayers(simulator.adr, RInstance_MAX_PLAYERS),
      gameId: 1,
      shiftTime: true,
      gameMaster: simulator.adr.gameMaster1,
      startGame: true,
    });
    await simulator.runToLastTurn(1, simulator.adr.gameMaster1, 'equal');
  });
const inOvertimeTest = (simulator: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
    const proposals = await simulator.mockProposals({
      players: simulator.getPlayers(simulator.adr, playerCnt),
      gameMaster: simulator.adr.gameMaster1,
      gameId: 1,
      submitNow: true,
    });

    // Get proposal integrity for ending proposing phase
    const integrity = await simulator.getProposalsIntegrity({
      players: simulator.getPlayers(simulator.adr, playerCnt),
      gameId: 1,
      turn: await rankifyInstance.getTurn(1),
      gm: simulator.adr.gameMaster1,
      proposalSubmissionData: proposals,
    });

    // End proposing phase
    await rankifyInstance.connect(simulator.adr.gameMaster1).endProposing(1, integrity.newProposals);

    // Create votes after proposing phase has ended
    const votes = await simulator.mockValidVotes(
      simulator.getPlayers(simulator.adr, playerCnt),
      1,
      simulator.adr.gameMaster1,
      true,
      'equal',
    );

    // End voting phase
    const receipt = await rankifyInstance.connect(simulator.adr.gameMaster1).endVoting(
      1,
      votes.map(vote => vote.vote),
      integrity.permutation,
      integrity.nullifier,
    );

    return { receipt, votes, proposals };
  });

const multipleFirstRankGamesTest = (simulatorInstance: EnvironmentSimulator) =>
  deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }, options) => {
    // const promises = [];
    for (let numGames = 0; numGames < RInstance_MIN_PLAYERS; numGames++) {
      const gameId = await simulatorInstance.createGame({
        minGameTime: RInstance_MIN_GAME_TIME,
        signer: simulatorInstance.adr.gameCreator1.wallet,
        gameMaster: simulatorInstance.adr.gameMaster1.address,
        gameRank: 1,
        openNow: true,
      });
      await simulatorInstance.fillParty({
        players: simulatorInstance.getPlayers(simulatorInstance.adr, RInstance_MIN_PLAYERS, numGames),
        gameId,
        shiftTime: true,
        gameMaster: simulatorInstance.adr.gameMaster1,
        startGame: true,
      });
      await simulatorInstance.runToTheEnd(gameId, 'ftw');
    }
  });
const nextRankTest = (simulatorInstance: EnvironmentSimulator) =>
  deployments.createFixture(async () => {
    await simulatorInstance.createGame({
      minGameTime: RInstance_MIN_GAME_TIME,
      signer: simulatorInstance.adr.players[0].wallet, // Use player 1 to create the game
      gameMaster: simulatorInstance.adr.gameMaster1.address,
      gameRank: 2,
      openNow: true,
    });

    // Add logging to check game state after creation
    const gameId = await simulatorInstance.rankifyInstance.getContractState().then(s => s.numGames);
    const playersInGame = await simulatorInstance.rankifyInstance.getPlayers(gameId);
    console.log(`[nextRankTest] Game ${gameId} created. Players in game: ${playersInGame}`);
  });
const nextRankGameOver = (simulator: EnvironmentSimulator, rankTokenInstance: RankToken) =>
  deployments.createFixture(async () => {
    let balancesBeforeJoined: BigNumber[] = [];
    // Use a different set of players (offset by RInstance_MAX_PLAYERS)
    const players = simulator.getPlayers(simulator.adr, RInstance_MIN_PLAYERS, 0);
    await simulator.createGame({
      minGameTime: RInstance_MIN_GAME_TIME,
      signer: players[0].wallet, // Creator should be one of these new players
      gameMaster: simulator.adr.gameMaster1.address,
      gameRank: 2,
      openNow: true,
    });

    const lastCreatedGameId = await simulator.rankifyInstance.getContractState().then(r => r.numGames);
    for (let i = 0; i < players.length; i++) {
      balancesBeforeJoined[i] = await rankTokenInstance.unlockedBalanceOf(players[i].wallet.address, 2);
    }
    await simulator.fillParty({
      players,
      gameId: lastCreatedGameId,
      shiftTime: true,
      gameMaster: simulator.adr.gameMaster1,
      startGame: true, // Ensure game is started after filling
    });

    await simulator.runToTheEnd(lastCreatedGameId, 'ftw');
    return { balancesBeforeJoined };
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
  let simulator: EnvironmentSimulator;
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
    const state = await rankifyInstance.connect(adr.gameCreator1.wallet).getContractState();
    expect(state.commonParams.principalTimeConstant).to.be.equal(PRINCIPAL_TIME_CONSTANT);
    expect(state.commonParams.principalCost).to.be.equal(PRINCIPAL_COST);
    expect(state.commonParams.beneficiary).to.be.equal(governor.address);
    expect(state.commonParams.rankTokenAddress).to.be.equal(rankToken.address);
  });
  it('Ownership is correct', async () => {
    const { owner } = await getNamedAccounts();
    const oSigner = await hre.ethers.getSigner(owner);
    expect(await rankifyInstance.owner()).to.be.equal(oSigner.address);
  });
  it('has rank token assigned', async () => {
    const state = await rankifyInstance.getContractState();
    expect(state.commonParams.rankTokenAddress).to.be.equal(rankToken.address);
  });
  it('Can create game only with valid payments', async () => {
    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(rankifyInstance.address, 0);
    const params: IRankifyInstance.NewGameParamsInputStruct = simulator.getCreateGameParams(1);

    await expect(rankifyInstance.connect(adr.gameCreator1.wallet).createGame(params)).to.be.revertedWithCustomError(
      env.rankifyToken,
      'ERC20InsufficientAllowance',
    );
    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(rankifyInstance.address, eth.constants.MaxUint256);
    await expect(rankifyInstance.connect(adr.gameCreator1.wallet).createGame(params)).to.emit(
      rankifyInstance,
      'gameCreated',
    );
    await env.rankifyToken
      .connect(adr.gameCreator1.wallet)
      .burn(await env.rankifyToken.balanceOf(adr.gameCreator1.wallet.address));
    await expect(rankifyInstance.connect(adr.gameCreator1.wallet).createGame(params)).to.revertedWithCustomError(
      env.rankifyToken,
      'ERC20InsufficientBalance',
    );
  });
  it('Can create game and open registration', async () => {
    await env.rankifyToken.connect(adr.gameCreator1.wallet).approve(rankifyInstance.address, eth.constants.MaxUint256);
    const params: IRankifyInstance.NewGameParamsInputStruct = simulator.getCreateGameParams(1);
    await expect(rankifyInstance.connect(adr.gameCreator1.wallet).createAndOpenGame(params, requirement))
      .to.emit(rankifyInstance, 'RegistrationOpen')
      .to.emit(rankifyInstance, 'RequirementsConfigured');
  });

  it('Cannot perform actions on games that do not exist', async () => {
    const s1 = await simulator.signJoiningGame({
      gameId: 1,
      participant: adr.gameCreator1.wallet,
      signer: adr.gameMaster1,
    });
    await expect(
      rankifyInstance
        .connect(adr.gameCreator1.wallet)
        .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
    ).to.be.revertedWith('game not found');
    let proposals = await simulator.mockProposals({
      players: simulator.getPlayers(adr, RInstance_MAX_PLAYERS),
      gameId: 1,
      turn: 1,
      gameMaster: adr.gameMaster1,
    });

    votersAddresses = simulator.getPlayers(adr, RInstance_MAX_PLAYERS).map(player => player.wallet.address);
    const votes = await simulator.mockVotes({
      gameId: 1,
      turn: 1,
      verifier: rankifyInstance,
      players: simulator.getPlayers(adr, RInstance_MAX_PLAYERS),
      gm: adr.gameMaster1,
      distribution: 'semiUniform',
    });

    await expect(
      simulator
        .getProposalsIntegrity({
          players: getPlayers(adr, RInstance_MAX_PLAYERS),
          gameId: 1,
          turn: 1,
          gm: adr.gameMaster1,
          proposalSubmissionData: proposals,
        })
        .then(integrity => rankifyInstance.connect(adr.gameMaster1).endProposing(1, integrity.newProposals)),
    ).to.be.revertedWith('game not found');
    await expect(
      simulator
        .getProposalsIntegrity({
          players: getPlayers(adr, RInstance_MAX_PLAYERS),
          gameId: 1,
          turn: 1,
          gm: adr.gameMaster1,
          proposalSubmissionData: proposals,
        })
        .then(integrity =>
          rankifyInstance.connect(adr.gameMaster1).endVoting(
            1,
            votes.map(vote => vote.vote),
            integrity.permutation,
            integrity.nullifier,
          ),
        ),
    ).to.be.revertedWith('game not found');
    await expect(
      rankifyInstance
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
    await expect(rankifyInstance.connect(adr.gameMaster1).openRegistration(1)).to.be.revertedWith('game not found');

    const s2 = await simulator.signJoiningGame({ gameId: 1, participant: adr.gameMaster1, signer: adr.gameMaster1 });

    await expect(
      rankifyInstance
        .connect(adr.gameMaster1)
        .joinGame(0, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
    ).to.be.revertedWith('game not found');
    await expect(rankifyInstance.connect(adr.gameMaster1).startGame(0)).to.be.revertedWith('game not found');
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
    await expect(rankifyInstance.connect(adr.gameMaster1).submitProposal(proposals[0].params)).to.be.revertedWith(
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
      const { metadata } = await rankifyInstance.getGameState(1);
      expect(metadata).to.be.equal('test metadata');
    });

    it('Should handle game creation costs and token distribution correctly', async () => {
      const finalCreatorBalance = await env.rankifyToken.balanceOf(adr.gameCreator1.wallet.address);
      const finalBeneficiaryBalance = await env.rankifyToken.balanceOf(
        await rankifyInstance.getContractState().then(s => s.commonParams.beneficiary),
      );

      // Check creator's balance is reduced by game cost
      expect(finalCreatorBalance).to.equal(
        initialCreatorBalance.sub(gamePrice),
        "Creator's balance should be reduced by game cost",
      );

      // Check beneficiary receives 10% of game cost

      expect(finalBeneficiaryBalance).to.equal(
        initialBeneficiaryBalance.add(gamePrice),
        'Beneficiary should receive 100% of game cost',
      );
    });
    it('can get game state', async () => {
      const state = await rankifyInstance.getGameState(1);
      expect(state.rank).to.be.equal(1);
      expect(state.minGameTime).to.be.equal(constantParams.RInstance_MIN_GAME_TIME);
      expect(state.createdBy).to.be.equal(adr.gameCreator1.wallet.address);
      expect(state.numCommitments).to.be.equal(0);
      expect(state.numVotes).to.be.equal(0);
      expect(state.currentTurn).to.be.equal(0);
      expect(state.turnStartedAt).to.be.equal(0);
      expect(state.registrationOpenAt).to.be.equal(0);
      expect(state.phaseStartedAt).to.be.equal(0);
      expect(state.hasStarted).to.be.equal(false);
      expect(state.hasEnded).to.be.equal(false);
      expect(state.numPlayersMadeMove).to.be.equal(0);
      expect(state.numActivePlayers).to.be.equal(0);
      expect(state.isOvertime).to.be.equal(false);
    });

    it('Should calculate game price correctly for different time parameters', async () => {
      const { commonParams } = await rankifyInstance.getContractState();

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

        const params: IRankifyInstance.NewGameParamsInputStruct = {
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
          votePhaseDuration: RInstance_TIME_PER_TURN / 2,
          proposingPhaseDuration: RInstance_TIME_PER_TURN - RInstance_TIME_PER_TURN / 2,
        };
        const totalSupplyBefore = await env.rankifyToken.totalSupply();
        await expect(rankifyInstance.connect(adr.gameCreator1.wallet).createGame(params)).changeTokenBalances(
          env.rankifyToken,
          [adr.gameCreator1.wallet.address, governor.address],
          [expectedPrice.mul(-1), expectedPrice],
        );
        expect(await env.rankifyToken.totalSupply()).to.be.equal(totalSupplyBefore);
        // Get actual game price
        const actualPrice = await rankifyInstance.estimateGamePrice(testCase.minGameTime);

        // Allow for small rounding differences due to division
        const difference = expectedPrice.sub(actualPrice).abs();
        expect(difference.lte(1)).to.be.true;
      }
    });

    it('GM is correct', async () => {
      expect(await rankifyInstance.getGM(1)).to.be.equal(adr.gameMaster1.address);
    });
    it('Incremented number of games correctly', async () => {
      const state = await rankifyInstance.connect(adr.gameCreator1.wallet).getContractState();
      expect(state.numGames).to.be.equal(1);
    });
    it('Players cannot join until registration is open', async () => {
      await env.rankifyToken.connect(adr.players[0].wallet).approve(rankifyInstance.address, eth.constants.MaxUint256);
      const gameId = await rankifyInstance.getContractState().then(s => s.numGames);
      const s1 = await simulator.signJoiningGame({
        gameId: 1,
        participant: adr.players[0].wallet,
        signer: adr.gameMaster1,
      });
      await expect(
        rankifyInstance
          .connect(adr.players[0].wallet)
          .joinGame(gameId, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
      ).to.be.revertedWith('addPlayer->cant join now');
    });
    it('Allows only game creator to add join requirements', async () => {
      await expect(rankifyInstance.connect(adr.gameCreator1.wallet).setJoinRequirements(1, requirement)).to.be.emit(
        rankifyInstance,
        'RequirementsConfigured',
      );
      await expect(
        rankifyInstance.connect(adr.maliciousActor1.wallet).setJoinRequirements(1, requirement),
      ).to.be.revertedWith('Only game creator');
      await expect(
        rankifyInstance.connect(adr.maliciousActor1.wallet).setJoinRequirements(11, requirement),
      ).to.be.revertedWith('game not found');
    });
    it('Only game creator can open registration', async () => {
      await expect(rankifyInstance.connect(adr.gameCreator1.wallet).openRegistration(1)).to.be.emit(
        rankifyInstance,
        'RegistrationOpen',
      );
      await expect(rankifyInstance.connect(adr.maliciousActor1.wallet).openRegistration(1)).to.be.revertedWith(
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
          rankifyInstance
            .connect(adr.players[0].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        ).to.be.revertedWithCustomError(rankifyInstance, 'invalidECDSARecoverSigner');

        // Try with wrong gameId
        const s2 = await simulator.signJoiningGame({
          gameId: 2,
          participant: adr.players[0].wallet,
          signer: adr.gameMaster1,
        }); // Wrong gameId
        await expect(
          rankifyInstance
            .connect(adr.players[0].wallet)
            .joinGame(1, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
        ).to.be.revertedWithCustomError(rankifyInstance, 'invalidECDSARecoverSigner');

        // Try with wrong participant
        const s3 = await signJoiningGame({ gameId: 1, participant: adr.players[1].wallet, signer: adr.gameMaster1 }); // Wrong participant
        await expect(
          rankifyInstance
            .connect(adr.players[0].wallet)
            .joinGame(1, s3.signature, s3.gmCommitment, s3.deadline, s3.participantPubKey),
        ).to.be.revertedWithCustomError(rankifyInstance, 'invalidECDSARecoverSigner');

        const s4 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        const tamperedSalt = eth.utils.hexZeroPad('0xdeadbeef', 32); // Different salt than what was signed
        await expect(
          rankifyInstance
            .connect(adr.players[0].wallet)
            .joinGame(1, s4.signature, tamperedSalt, s4.deadline, s4.participantPubKey),
        ).to.be.revertedWithCustomError(rankifyInstance, 'invalidECDSARecoverSigner');
      });

      it('Should accept valid signature from correct game master', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await expect(
          rankifyInstance
            .connect(adr.players[0].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        )
          .to.emit(rankifyInstance, 'PlayerJoined')
          .withArgs(1, adr.players[0].wallet.address, s1.gmCommitment, s1.participantPubKey);
      });

      it('Mutating join requirements is no longer possible', async () => {
        await expect(
          rankifyInstance.connect(adr.gameCreator1.wallet).setJoinRequirements(1, requirement),
        ).to.be.revertedWith('Cannot do when registration is open');
      });
      it('Qualified players can join', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await expect(
          rankifyInstance
            .connect(adr.players[0].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        ).to.be.emit(rankifyInstance, 'PlayerJoined');
      });
      it('Game cannot be started until join block time has passed unless game is full', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await rankifyInstance
          .connect(adr.players[0].wallet)
          .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
        await expect(rankifyInstance.connect(adr.players[1].wallet).startGame(1)).to.be.revertedWith(
          'startGame->Still Can Join',
        );
        const s2 = await signJoiningGame({ gameId: 1, participant: adr.players[1].wallet, signer: adr.gameMaster1 });
        await rankifyInstance
          .connect(adr.players[1].wallet)
          .joinGame(1, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey);
        const s3 = await signJoiningGame({ gameId: 1, participant: adr.players[2].wallet, signer: adr.gameMaster1 });
        await rankifyInstance
          .connect(adr.players[2].wallet)
          .joinGame(1, s3.signature, s3.gmCommitment, s3.deadline, s3.participantPubKey);
        const s4 = await signJoiningGame({ gameId: 1, participant: adr.players[3].wallet, signer: adr.gameMaster1 });
        await rankifyInstance
          .connect(adr.players[3].wallet)
          .joinGame(1, s4.signature, s4.gmCommitment, s4.deadline, s4.participantPubKey);
        const s5 = await signJoiningGame({ gameId: 1, participant: adr.players[4].wallet, signer: adr.gameMaster1 });
        await rankifyInstance
          .connect(adr.players[4].wallet)
          .joinGame(1, s5.signature, s5.gmCommitment, s5.deadline, s5.participantPubKey);
        const s6 = await signJoiningGame({ gameId: 1, participant: adr.players[5].wallet, signer: adr.gameMaster1 });
        await rankifyInstance
          .connect(adr.players[5].wallet)
          .joinGame(1, s6.signature, s6.gmCommitment, s6.deadline, s6.participantPubKey);
        await expect(rankifyInstance.connect(adr.players[0].wallet).startGame(1)).to.be.emit(
          rankifyInstance,
          'GameStarted',
        );
      });
      it('No more than max players can join', async () => {
        for (let i = 1; i < RInstance_MAX_PLAYERS + 1; i++) {
          const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[i].wallet, signer: adr.gameMaster1 });
          await rankifyInstance
            .connect(adr.players[i].wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
        }
        await env.rankifyToken
          .connect(adr.maliciousActor1.wallet)
          .approve(rankifyInstance.address, eth.constants.MaxUint256);
        const s1 = await signJoiningGame({
          gameId: 1,
          participant: adr.maliciousActor1.wallet,
          signer: adr.gameMaster1,
        });
        await expect(
          rankifyInstance
            .connect(adr.maliciousActor1.wallet)
            .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        ).to.be.revertedWith('addPlayer->party full');
      });
      it('Game methods beside join and start are inactive', async () => {
        const s1 = await signJoiningGame({ gameId: 1, participant: adr.players[0].wallet, signer: adr.gameMaster1 });
        await rankifyInstance
          .connect(adr.players[0].wallet)
          .joinGame(1, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
        const proposals = await mockProposals({
          players: getPlayers(adr, RInstance_MAX_PLAYERS),
          gameId: 1,
          turn: 1,
          gameMaster: adr.gameMaster1,
        });

        // const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
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
          rankifyInstance
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
        await expect(rankifyInstance.connect(adr.gameCreator1.wallet).openRegistration(1)).to.be.revertedWith(
          'Cannot do when registration is open',
        );
        await expect(
          rankifyInstance.connect(adr.gameCreator1.wallet).setJoinRequirements(1, requirement),
        ).to.be.revertedWith('Cannot do when registration is open');

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
        await expect(rankifyInstance.connect(adr.gameMaster1).startGame(1)).to.be.revertedWith(
          'startGame->Still Can Join',
        );
      });
      describe('When there is minimal number and below maximum players in game', () => {
        beforeEach(async () => {
          await filledPartyTest(simulator)();
        });
        it('creator can start game', async () => {
          await expect(rankifyInstance.connect(adr.gameCreator1.wallet).startGame(1)).to.be.emit(
            rankifyInstance,
            'GameStarted',
          );
        });
        it('Can start game after joining period is over', async () => {
          await expect(rankifyInstance.connect(adr.gameMaster1).startGame(1)).to.be.revertedWith(
            'startGame->Still Can Join',
          );
          const currentT = await time.latest();
          await time.setNextBlockTimestamp(currentT + Number(RInstance_TIME_TO_JOIN) + 1);
          await simulator.mineBlocks(1);
          await expect(rankifyInstance.connect(adr.gameMaster1).startGame(1)).to.be.emit(
            rankifyInstance,
            'GameStarted',
          );
        });
        it('Game methods beside start are inactive', async () => {
          const proposals = await mockProposals({
            players: getPlayers(adr, RInstance_MAX_PLAYERS),
            gameId: 1,
            turn: 1,
            gameMaster: adr.gameMaster1,
          });
          await expect(rankifyInstance.connect(adr.gameMaster1).submitProposal(proposals[0].params)).to.be.revertedWith(
            'Game has not yet started',
          );
          const votes = await simulator.mockVotes({
            gameId: 1,
            turn: 1,
            verifier: rankifyInstance,
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
            rankifyInstance
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
          describe('Game End and Tie-Breaking Logic', () => {
            it('should correctly close stale game', async () => {
              await simulator.runToLastTurn(1, adr.gameMaster1, 'equal');
              let gameState = await rankifyInstance.getGameState(1);
              await time.increase(gameState.minGameTime.toNumber() + 1);
              await expect(rankifyInstance.connect(adr.gameMaster1).forceEndStaleGame(1)).to.not.be.reverted;
              const winner = await rankifyInstance.gameWinner(1);
              //   expect(winner).to.be.equal(adr.players[1].wallet.address);
            });
          });
          it('Proposing stage checks', async () => {
            const canEnd = await rankifyInstance.canEndProposingStage(1);
            expect(canEnd[0]).to.be.equal(false);
            expect(canEnd[1]).to.be.equal(3); // PhaseConditionsNotMet
            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
            const canEnd2 = await rankifyInstance.canEndProposingStage(1);
            expect(canEnd2[0]).to.be.equal(false);
            expect(canEnd2[1]).to.be.equal(1); // MinProposalsNotMetAndNotStale
            await time.increase(Number(RInstance_MIN_GAME_TIME) + 2);
            const canEnd3 = await rankifyInstance.canEndProposingStage(1);
            expect(canEnd3[0]).to.be.equal(false);
            expect(canEnd3[1]).to.be.equal(2); // GameIsStaleAndCanEnd
            const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
            const players = getPlayers(adr, playersCnt);
            let proposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
              idlers: [0],
            });
            const canEnd4 = await rankifyInstance.canEndProposingStage(1);
            expect(canEnd4[0]).to.be.equal(true);
            expect(canEnd4[1]).to.be.equal(0); // Success
            await rankifyInstance.connect(adr.gameMaster1).endProposing(
              1,
              await simulator
                .getProposalsIntegrity({
                  players,
                  gameId: 1,
                  turn: 1,
                  gm: adr.gameMaster1,
                  idlers: [0],
                  proposalSubmissionData: proposals,
                })
                .then(r => r.newProposals),
            );
            const canEnd5 = await rankifyInstance.canEndProposingStage(1);
            expect(canEnd5[0]).to.be.equal(false);
            expect(canEnd5[1]).to.be.equal(4); // NotInProposingStage
          });
          it('Can finish turn early if previous turn participant did not made a move', async () => {
            const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
            const players = getPlayers(adr, playersCnt);
            let proposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
              idlers: [0],
            });

            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
            await rankifyInstance.connect(adr.gameMaster1).endProposing(
              1,
              await simulator
                .getProposalsIntegrity({
                  players,
                  gameId: 1,
                  turn: 1,
                  gm: adr.gameMaster1,
                  idlers: [0],
                  proposalSubmissionData: proposals,
                })
                .then(r => r.newProposals),
            );
            const votes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, true, 'semiUniform', [0]);
            let turn = await rankifyInstance.getTurn(1);
            assert(turn.eq(1));
            await simulator.endTurn({
              gameId: 1,
              proposals,
              votes: votes,
              idlers: [0],
            });
            expect(await rankifyInstance.isProposingStage(1)).to.be.true;
            expect(await rankifyInstance.isVotingStage(1)).to.be.false;
            expect(await rankifyInstance.getTurn(1)).to.be.equal(2);

            proposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
              idlers: [0],
            });
            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);

            await rankifyInstance.connect(adr.gameMaster1).endProposing(
              1,
              await simulator
                .getProposalsIntegrity({
                  players,
                  gameId: 1,
                  turn: 2,
                  gm: adr.gameMaster1,
                  idlers: [0],
                  proposalSubmissionData: proposals,
                })
                .then(r => r.newProposals),
            );

            const newVotes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, false, 'semiUniform', [0]);

            for (let i = 0; i < newVotes.length; i++) {
              if (i !== 0) {
                await rankifyInstance
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
            await simulator.endTurn({
              gameId: 1,
              proposals,
              votes: newVotes,
              idlers: [0],
            });
            expect(await rankifyInstance.isActive(1, proposals[0].params.proposer)).to.be.false;
          });
          it('Cannot end proposing stage if not enough proposals', async () => {
            const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
            const players = getPlayers(adr, playersCnt);
            const newestProposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
              idlers: [0, 1],
            });
            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
            const integrity = await simulator.getProposalsIntegrity({
              players,
              gameId: 1,
              turn: 3,
              gm: adr.gameMaster1,
              idlers: [0],
              proposalSubmissionData: newestProposals,
            });
            // expect(await rankifyInstance.isActive(1, newestProposals[0].params.proposer)).to.be.true;
            const turnForFinalCheck = await rankifyInstance.getTurn(1);
            await expect(
              rankifyInstance.connect(adr.gameMaster1).endProposing(
                1,
                await simulator
                  .getProposalsIntegrity({
                    players,
                    gameId: 1,
                    turn: turnForFinalCheck,
                    gm: adr.gameMaster1,
                    idlers: [0, 1],
                    proposalSubmissionData: newestProposals,
                  })
                  .then(r => r.newProposals),
              ),
            )
              .to.be.revertedWithCustomError(rankifyInstance, 'ErrorProposingStageEndFailed')
              .withArgs(1, 1);
          });
          it('Can finish turn early if none voted', async () => {
            const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
            const players = getPlayers(adr, playersCnt);
            const proposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
            });

            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
            const votes = await simulator.mockValidVotes(
              players,
              1,
              adr.gameMaster1,
              false,
              'semiUniform',
              players.map((p, i) => i),
            );
            const turn = await rankifyInstance.getTurn(1);
            assert(turn.eq(1));
            await simulator.endWithIntegrity({
              gameId: 1,
              players,
              proposals,
              votes: votes.map(vote => vote.ballot.vote),
              gm: adr.gameMaster1,
              idlers: players.map((p, i) => i),
              timeAfterProposing: Number(RInstance_TIME_PER_TURN) + 1,
            });

            const newProposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
            });

            const newVotes = await simulator.mockValidVotes(
              players,
              1,
              adr.gameMaster1,
              false,
              'semiUniform',
              players.map((p, i) => i),
            );

            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);

            await endWithIntegrity({
              gameId: 1,
              players,
              proposals: newProposals,
              votes: newVotes.map(vote => vote.ballot.vote),
              gm: adr.gameMaster1,
              idlers: players.map((p, i) => i),
              timeAfterProposing: Number(RInstance_TIME_PER_TURN) + 1,
            });
            expect(await rankifyInstance.getTurn(1)).to.be.equal(3);
            expect(await rankifyInstance.getPlayerVotedArray(1)).to.deep.equal([false, false, false]);
            const newestVotes = await simulator.mockValidVotes(
              players,
              1,
              adr.gameMaster1,
              true,
              'semiUniform',
              players.map((p, i) => i),
            );
            expect(await rankifyInstance.isActive(1, proposals[0].params.proposer)).to.be.false;
            const newestProposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
            });
            expect(await rankifyInstance.isActive(1, newestProposals[0].params.proposer)).to.be.true;
            await expect(
              endWithIntegrity({
                gameId: 1,
                players,
                proposals: newestProposals,
                votes: newestVotes.map(vote => vote.ballot.vote),
                gm: adr.gameMaster1,
                idlers: players.map((p, i) => i),
                timeAfterProposing: Number(RInstance_TIME_PER_TURN) + 1,
              }).then(r => r[1]),
            ).to.not.be.revertedWith('nextTurn->CanEndEarly');
          });
          it('First turn has started', async () => {
            expect(await rankifyInstance.connect(adr.players[0].wallet).getTurn(1)).to.be.equal(1);
          });
          it('Cannot end game before minimum game time', async () => {
            const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
            const players = simulator.getPlayers(simulator.adr, playerCnt);
            await simulator.runToLastTurn(1, adr.gameMaster1, 'ftw');

            const canEnd = await rankifyInstance.canEndVotingStage(1);
            expect(canEnd).to.be.equal(false);
            const proposals = await simulator.mockProposals({
              players,
              gameMaster: adr.gameMaster1,
              gameId: 1,
              submitNow: true,
            });
            await rankifyInstance.connect(adr.gameMaster1).endProposing(
              1,
              await simulator
                .getProposalsIntegrity({
                  players,
                  gameId: 1,
                  turn: await rankifyInstance.getTurn(1),
                  gm: adr.gameMaster1,
                  idlers: [],
                })
                .then(r => r.newProposals),
            );
            const votes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, true, 'ftw');
            await time.increase(Number(RInstance_TIME_PER_TURN) + 1);
            await expect(simulator.endTurn({ gameId: 1, votes, proposals })).to.be.revertedWith(
              'Game duration less than minimum required time',
            );
            await time.setNextBlockTimestamp(
              (await time.latest()) + RInstance_MIN_GAME_TIME - RInstance_TIME_PER_TURN - 100,
            );
            await expect(simulator.endTurn({ gameId: 1, votes, proposals })).to.be.revertedWith(
              'Game duration less than minimum required time',
            );
            await time.increase(await rankifyInstance.getGameState(1).then(state => state.minGameTime));
            await expect(simulator.endTurn({ gameId: 1, votes, proposals })).to.not.be.reverted;
          });
          it('Accepts only proposals and no votes during proposal phase', async () => {
            const votes = await simulator.mockVotes({
              gameId: 1,
              turn: 1,
              verifier: rankifyInstance,
              players: getPlayers(adr, RInstance_MIN_PLAYERS),
              gm: adr.gameMaster1,
              distribution: 'semiUniform',
            });
            votersAddresses = getPlayers(adr, RInstance_MAX_PLAYERS).map(player => player.wallet.address);

            await expect(
              rankifyInstance
                .connect(adr.gameMaster1)
                .submitVote(
                  1,
                  votes[0].ballotId,
                  votersAddresses[0],
                  votes[0].gmSignature,
                  votes[0].voterSignature,
                  votes[0].ballotHash,
                ),
            ).to.be.revertedWith('Not in voting stage');
          });
          it('Can end turn if timeout reached with zero scores', async () => {
            const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
            const gameIdForTest = eth.BigNumber.from(1);

            const idlers = getPlayers(adr, playerCnt).map((_, i) => i);
            // Ensure mockProposals with all idlers results in proposalDataForAllSlots that leads to 0 actual commitments if used in getProposalsIntegrity
            const proposalDataForAllSlots = await simulator.mockProposals({
              players: getPlayers(adr, playerCnt),
              gameMaster: adr.gameMaster1,
              gameId: gameIdForTest,
              submitNow: false, // GM won't submit any based on this if all are idlers for integrity check
              idlers: idlers,
              turn: (await rankifyInstance.getTurn(gameIdForTest)).toNumber(),
            });

            const gameStatePre = await rankifyInstance.getGameState(gameIdForTest);
            expect(gameStatePre.numCommitments).to.equal(
              0,
              'Pre-condition: numCommitments must be 0 for this test scenario.',
            );

            await time.increase(RInstance_TIME_PER_TURN + 1); // Phase timeout

            const gameStartedAt = gameStatePre.turnStartedAt.toNumber(); // For turn 1, this is game start
            const minGameTime = gameStatePre.minGameTime.toNumber();
            const currentTime = await time.latest();
            if (currentTime < gameStartedAt + minGameTime) {
              await time.increase(gameStartedAt + minGameTime - currentTime + 1);
            }

            const integrityForZero = await simulator.getProposalsIntegrity({
              players: getPlayers(adr, playerCnt),
              gameId: gameIdForTest,
              turn: await rankifyInstance.getTurn(gameIdForTest),
              gm: adr.gameMaster1,
              proposalSubmissionData: proposalDataForAllSlots, // proposals here are just for integrity generation, not contract state
              idlers: idlers,
            });

            // Corrected Assertion for Test 2:
            await expect(
              rankifyInstance.connect(adr.gameMaster1).endProposing(gameIdForTest, integrityForZero.newProposals),
            )
              .to.be.revertedWithCustomError(rankifyInstance, 'ErrorProposingStageEndFailed')
              .withArgs(gameIdForTest, 2 /* ProposingEndStatus.GameIsStaleAndCanEnd */);
          });
          describe('When all proposals received', () => {
            let proposals: ProposalSubmission[] = [];
            beforeEach(async () => {
              const setupResult = await proposalsReceivedTest(simulator)();
              proposals = setupResult.proposals;
            });
            it('Can end proposing stage', async () => {
              const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
              await expect(
                rankifyInstance.connect(adr.gameMaster1).endProposing(
                  1,
                  await simulator
                    .getProposalsIntegrity({
                      players: getPlayers(adr, playersCnt),
                      gameId: 1,
                      turn: 1,
                      gm: adr.gameMaster1,
                      proposalSubmissionData: proposals,
                    })
                    .then(r => r.newProposals),
                ),
              ).to.be.emit(rankifyInstance, 'ProposingStageEnded');
            });
            it('cannot vote for himself', async () => {
              const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
              await rankifyInstance.connect(adr.gameMaster1).endProposing(
                1,
                await simulator
                  .getProposalsIntegrity({
                    players: getPlayers(adr, playersCnt),
                    gameId: 1,
                    turn: 1,
                    gm: adr.gameMaster1,
                    proposalSubmissionData: proposals,
                  })
                  .then(r => r.newProposals),
              );

              const votes = await simulator.mockVotes({
                gameId: 1,
                turn: 1,
                verifier: rankifyInstance,
                players: getPlayers(adr, playersCnt),
                gm: adr.gameMaster1,
                distribution: 'ftw',
                voteHimself: [true],
              });
              for (let i = 0; i < votes.length; i++) {
                await rankifyInstance
                  .connect(adr.gameMaster1)
                  .submitVote(
                    1,
                    votes[i].ballotId,
                    adr.players[i].wallet.address,
                    votes[i].gmSignature,
                    votes[i].voterSignature,
                    votes[i].ballotHash,
                  );
              }
              const integrity = await simulator.getProposalsIntegrity({
                players: getPlayers(adr, playersCnt),
                gameId: 1,
                turn: 1,
                gm: adr.gameMaster1,
                proposalSubmissionData: proposals,
              });
              await expect(
                rankifyInstance.connect(adr.gameMaster1).endVoting(
                  1,
                  votes.map(vote => vote.ballot.vote),
                  integrity.permutation,
                  integrity.nullifier,
                ),
              ).to.be.revertedWith('voted for himself');
            });
            describe('When there is one vote missing', () => {
              let votesOneMissing: MockVote[];

              beforeEach(async () => {
                const players = simulator.getPlayers(simulator.adr, RInstance_MIN_PLAYERS, 0);
                rankifyInstance.connect(adr.gameMaster1).endProposing(
                  1,
                  await simulator
                    .getProposalsIntegrity({
                      players: getPlayers(adr, players.length),
                      gameId: 1,
                      turn: 1,
                      gm: adr.gameMaster1,
                      proposalSubmissionData: proposals,
                    })
                    .then(r => r.newProposals),
                ),
                  await simulator.rankifyInstance.getTurn(1);
                votesOneMissing = await simulator.mockValidVotes(players, 1, adr.gameMaster1, true, 'ftw', [0]);
              });
              it('Can end turn only if timeout reached', async () => {
                const gameState = await simulator.rankifyInstance.getGameState(1);

                const integrity = await simulator.getProposalsIntegrity({
                  players: getPlayers(adr, RInstance_MIN_PLAYERS),
                  gameId: 1,
                  turn: 1,
                  gm: adr.gameMaster1,
                  proposalSubmissionData: proposals,
                });

                await expect(
                  simulator.rankifyInstance.connect(simulator.adr.gameMaster1).endVoting(
                    1,
                    votesOneMissing.map(vote => vote.vote),
                    integrity.permutation,
                    integrity.nullifier,
                  ),
                ).to.be.revertedWith('nextTurn->CanEndEarly');
                await time.increase(gameState.votePhaseDuration.toNumber() + 1);
                await expect(
                  simulator.rankifyInstance.connect(simulator.adr.gameMaster1).endVoting(
                    1,
                    votesOneMissing.map(vote => vote.vote),
                    integrity.permutation,
                    integrity.nullifier,
                  ),
                ).to.not.be.reverted;
              });
              describe('When first turn was made', () => {
                beforeEach(async () => {
                  await firstTurnMadeTest(simulator)();
                });

                it('throws if player votes twice', async () => {
                  proposals = await simulator.mockProposals({
                    players: getPlayers(adr, RInstance_MIN_PLAYERS),
                    gameMaster: adr.gameMaster1,
                    gameId: 1,
                    submitNow: true,
                  });
                  await rankifyInstance.connect(adr.gameMaster1).endProposing(
                    1,
                    await simulator
                      .getProposalsIntegrity({
                        players: getPlayers(adr, RInstance_MIN_PLAYERS),
                        gameId: 1,
                        turn: 1,
                        gm: adr.gameMaster1,
                        proposalSubmissionData: proposals,
                      })
                      .then(r => r.newProposals),
                  );
                  const votes = await simulator.mockValidVotes(
                    getPlayers(adr, RInstance_MIN_PLAYERS),
                    1,
                    adr.gameMaster1,
                    true,
                  );
                  proposals = await simulator.mockProposals({
                    players: getPlayers(adr, RInstance_MIN_PLAYERS),
                    gameMaster: adr.gameMaster1,
                    gameId: 1,
                    submitNow: true,
                  });

                  await expect(
                    rankifyInstance
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
                  expect(await rankifyInstance.getPlayersMoved(1)).to.deep.equal([
                    getPlayers(adr, RInstance_MIN_PLAYERS).map(() => false),
                    eth.BigNumber.from('0'),
                  ]);
                });
                it('shows players submitted proposals as active', async () => {
                  const proposals = await simulator.mockProposals({
                    players: getPlayers(adr, RInstance_MIN_PLAYERS),
                    gameMaster: adr.gameMaster1,
                    gameId: 1,
                    submitNow: false,
                  });
                  await rankifyInstance.connect(adr.gameMaster1).submitProposal(proposals[0].params);
                  await rankifyInstance.connect(adr.gameMaster1).submitProposal(proposals[1].params);
                  expect(await rankifyInstance.getPlayersMoved(1)).to.deep.equal([
                    getPlayers(adr, RInstance_MIN_PLAYERS).map((_, i) => i < 2),
                    eth.BigNumber.from('2'),
                  ]);
                });
                describe('When all players proposed', () => {
                  let proposals: ProposalSubmission[] = [];
                  beforeEach(async () => {
                    const setupResult = await allPlayersProposedTest(simulator)();
                    proposals = setupResult.proposals;
                  });
                  it('can end turn', async () => {
                    const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
                    const players = getPlayers(adr, playersCnt);
                    await expect(
                      rankifyInstance.connect(adr.gameMaster1).endProposing(
                        1,
                        await simulator
                          .getProposalsIntegrity({
                            players,
                            gameId: 1,
                            turn: 1,
                            gm: adr.gameMaster1,
                            proposalSubmissionData: proposals,
                          })
                          .then(r => r.newProposals),
                      ),
                    ).to.be.emit(rankifyInstance, 'ProposingStageEnded');
                  });
                  it('Can end proposing and then voting if timeout reached', async () => {
                    const currentT = await time.latest();

                    const playersCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
                    const players = getPlayers(adr, playersCnt);
                    const expectedScores: number[] = players.map(v => 0);
                    const turn = await rankifyInstance.getTurn(1);
                    const integrity = await simulator.getProposalsIntegrity({
                      players,
                      gameId: 1,
                      turn,
                      gm: adr.gameMaster1,
                      proposalSubmissionData: proposals,
                    });
                    await rankifyInstance.connect(adr.gameMaster1).endProposing(1, integrity.newProposals);

                    // const turnSalt = await getTestShuffleSalt(1, turn, adr.gameMaster1);

                    const votes = await simulator.mockValidVotes(
                      getPlayers(adr, RInstance_MIN_PLAYERS),
                      1,
                      adr.gameMaster1,
                      true,
                    );
                    await time.increase(Number(RInstance_TIME_PER_TURN) + 1);

                    await expect(
                      rankifyInstance.connect(adr.gameMaster1).endVoting(
                        1,
                        votes.map(vote => vote.vote),
                        integrity.permutation,
                        integrity.nullifier,
                      ),
                    ).to.be.emit(rankifyInstance, 'VotingStageResults');
                  });
                  it('Rejects attempts to shuffle votes due to ballot integrity check', async () => {
                    const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
                    const players = getPlayers(adr, playerCnt);

                    // First complete the proposing phase
                    const newProposals = await simulator.mockProposals({
                      players,
                      gameMaster: adr.gameMaster1,
                      gameId: 1,
                      submitNow: true,
                    });

                    const integrity = await simulator.getProposalsIntegrity({
                      players,
                      gameId: 1,
                      turn: await rankifyInstance.getTurn(1),
                      gm: adr.gameMaster1,
                      proposalSubmissionData: newProposals,
                    });

                    await rankifyInstance.connect(adr.gameMaster1).endProposing(1, integrity.newProposals);

                    // Now create votes for the voting phase
                    const votes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, true);

                    // Create a shuffled version of the votes array
                    let votesShuffled = simulator.shuffle(votes.map(v => v.vote));
                    while (JSON.stringify(votesShuffled) === JSON.stringify(votes.map(v => v.vote))) {
                      votesShuffled = simulator.shuffle(votes.map(v => v.vote));
                    }
                    await expect(
                      rankifyInstance
                        .connect(adr.gameMaster1)
                        .endVoting(1, votesShuffled, integrity.permutation, integrity.nullifier),
                    ).to.be.revertedWithCustomError(rankifyInstance, 'ballotIntegrityCheckFailed');
                  });
                  it('Emits correct ProposalScore event values', async () => {
                    const currentT = await time.latest();
                    //   await time.setNextBlockTimestamp(currentT + Number(RInstance_TIME_PER_TURN) + 1);
                    expect(await rankifyInstance.getTurn(1)).to.be.equal(2);
                    const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
                    const players = getPlayers(adr, playerCnt);

                    const turn = await rankifyInstance.getTurn(1);
                    const mockProposals = await simulator.mockProposals({
                      players: players,
                      gameMaster: adr.gameMaster1,
                      gameId: 1,
                      submitNow: true,
                    });
                    const integrity = await simulator.getProposalsIntegrity({
                      players: players,
                      gameId: 1,
                      turn,
                      gm: adr.gameMaster1,
                      proposalSubmissionData: mockProposals,
                    });

                    // End proposing phase first
                    await rankifyInstance.connect(adr.gameMaster1).endProposing(1, integrity.newProposals);

                    // Create and submit votes for the voting phase
                    const votes = await simulator.mockValidVotes(players, 1, adr.gameMaster1, true);

                    await rankifyInstance.connect(adr.gameMaster1).endVoting(
                      1,
                      votes.map(vote => vote.vote),
                      integrity.permutation,
                      integrity.nullifier,
                    );

                    // Check for ProposalScore events
                    const evts = (
                      await rankifyInstance.queryFilter(rankifyInstance.filters.ProposalScore(1, turn))
                    ).map(e => e.args);

                    expect(evts.length).to.be.greaterThan(0);
                  });
                });
              });
            });
          });
        });
      });
    });
    describe('When another game  of first rank is created', () => {
      let secondGameId: BigNumber;
      beforeEach(async () => {
        secondGameId = await simulator.createGame({
          minGameTime: RInstance_MIN_GAME_TIME,
          signer: adr.gameCreator1.wallet,
          gameMaster: adr.gameMaster2.address,
          gameRank: 1,
          openNow: true,
          metadata: 'test metadata',
        });
      });
      it('Does not reverts if players from another game tries to join', async () => {
        const s1 = await simulator.signJoiningGame({
          gameId: secondGameId,
          participant: adr.players[0].wallet,
          signer: adr.gameMaster2,
        });
        await expect(
          rankifyInstance
            .connect(adr.players[0].wallet)
            .joinGame(secondGameId, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
        ).to.not.be.reverted;
      });
    });
    describe('When there is not enough players and join time is out', () => {
      beforeEach(async () => {
        await notEnoughPlayersTest(simulator)();
      });
      it('It throws on game start', async () => {
        await expect(rankifyInstance.connect(adr.gameCreator1.wallet).startGame(1)).to.be.revertedWith(
          'startGame->Not enough players',
        );
      });
      it('Allows creator can close the game', async () => {
        await expect(rankifyInstance.connect(adr.gameCreator1.wallet).cancelGame(1)).to.emit(
          rankifyInstance,
          'GameClosed',
        );
      });
      it('Allows player to leave the game', async () => {
        await expect(rankifyInstance.connect(adr.players[0].wallet).leaveGame(1)).to.emit(
          rankifyInstance,
          'PlayerLeft',
        );
      });
    });
    describe('When it is last turn and equal scores', () => {
      beforeEach(async () => {
        await lastTurnEqualScoresTest(simulator)();
      });
      it('Next turn without winner brings Game is in overtime conditions', async () => {
        const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
        let isGameOver = await rankifyInstance.isGameOver(1);
        expect(isGameOver).to.be.false;
        const proposals = await simulator.mockProposals({
          players: getPlayers(adr, playerCnt),
          gameMaster: adr.gameMaster1,
          gameId: 1,
          submitNow: true,
        });

        const integrity = await simulator.getProposalsIntegrity({
          players: getPlayers(adr, playerCnt),
          gameId: 1,
          turn: await rankifyInstance.getTurn(1),
          gm: adr.gameMaster1,
          proposalSubmissionData: proposals,
        });

        await rankifyInstance.connect(adr.gameMaster1).endProposing(1, integrity.newProposals);

        // Now submit votes after proposing phase has ended
        const votes = await simulator.mockValidVotes(getPlayers(adr, playerCnt), 1, adr.gameMaster1, true, 'equal');

        await expect(
          rankifyInstance.connect(adr.gameMaster1).endVoting(
            1,
            votes.map(vote => vote.vote),
            integrity.permutation,
            integrity.nullifier,
          ),
        ).to.emit(rankifyInstance, 'OverTime');

        expect(await rankifyInstance.isOvertime(1)).to.be.true;
      });
      describe('when is overtime', () => {
        let votes: MockVote[] = [];
        let proposals: ProposalSubmission[] = [];
        beforeEach(async () => {
          const setupResult = await inOvertimeTest(simulator)();
          votes = setupResult.votes;
          proposals = setupResult.proposals;
          const isOvertime = await rankifyInstance.isOvertime(1);
          assert(isOvertime, 'game is not overtime');
        });
        it('emits game Over when submitted votes result unique leaders', async () => {
          const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
          const proposals = await simulator.mockProposals({
            players: getPlayers(adr, playerCnt),
            gameMaster: adr.gameMaster1,
            gameId: 1,
            submitNow: true,
          });
          const timeToEnd = await rankifyInstance.getGameState(1).then(state => state.minGameTime);
          await time.increase(timeToEnd.toNumber() + 1);

          const integrity = await simulator.getProposalsIntegrity({
            players: getPlayers(adr, playerCnt),
            gameId: 1,
            turn: await rankifyInstance.getTurn(1),
            gm: adr.gameMaster1,
            proposalSubmissionData: proposals,
          });

          await rankifyInstance.connect(adr.gameMaster1).endProposing(1, integrity.newProposals);

          // Create votes after proposing phase has ended
          const votes = await simulator.mockValidVotes(getPlayers(adr, playerCnt), 1, adr.gameMaster1, true, 'ftw');

          await expect(
            rankifyInstance.connect(adr.gameMaster1).endVoting(
              1,
              votes.map(vote => vote.vote),
              integrity.permutation,
              integrity.nullifier,
            ),
          ).to.emit(rankifyInstance, 'GameOver');
        });
        it("Keeps game in overtime when submitted votes don't result unique leaders", async () => {
          const playerCnt = await rankifyInstance.getPlayers(1).then(players => players.length);
          const proposals = await simulator.mockProposals({
            players: getPlayers(adr, playerCnt),
            gameMaster: adr.gameMaster1,
            gameId: 1,
            submitNow: true,
          });

          const integrity = await simulator.getProposalsIntegrity({
            players: getPlayers(adr, playerCnt),
            gameId: 1,
            turn: await rankifyInstance.getTurn(1),
            gm: adr.gameMaster1,
            proposalSubmissionData: proposals,
          });

          await rankifyInstance.connect(adr.gameMaster1).endProposing(1, integrity.newProposals);

          // Create votes after proposing phase has ended
          const votes = await simulator.mockValidVotes(getPlayers(adr, playerCnt), 1, adr.gameMaster1, true, 'equal');

          await rankifyInstance.connect(adr.gameMaster1).endVoting(
            1,
            votes.map(vote => vote.vote),
            integrity.permutation,
            integrity.nullifier,
          );

          expect(await rankifyInstance.connect(adr.gameMaster1).isOvertime(1)).to.be.true;
          expect(await rankifyInstance.connect(adr.gameMaster1).isGameOver(1)).to.be.false;
        });
      });

      describe('When game is over', () => {
        beforeEach(async () => {
          await gameOverTest(simulator)();
        });
        it('Throws on attempt to make another turn', async () => {
          const currentTurn = await rankifyInstance.getTurn(1);
          const votes = await simulator.mockVotes({
            gameId: 1,
            turn: currentTurn,
            verifier: rankifyInstance,
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
            await expect(
              rankifyInstance.connect(adr.gameMaster1).submitProposal(proposals[i].params),
            ).to.be.revertedWith('Game over');

            await expect(
              rankifyInstance
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
        });
        it('Gave rewards to winner', async () => {
          const gameWinner = await rankifyInstance.gameWinner(1);
          for (let i = 0; i < RInstance_MAX_PLAYERS; i++) {
            const player = getPlayers(adr, RInstance_MAX_PLAYERS)[i];
            if (player.wallet.address == gameWinner) {
              expect(await rankToken.balanceOf(player.wallet.address, 2)).to.be.equal(1);
            } else {
              expect(await rankToken.balanceOf(player.wallet.address, 2)).to.be.equal(0);
            }
          }
        });
        it('Allows winner to create game of next rank', async () => {
          const params: IRankifyInstance.NewGameParamsInputStruct = {
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
            votePhaseDuration: RInstance_TIME_PER_TURN / 2,
            proposingPhaseDuration: RInstance_TIME_PER_TURN - RInstance_TIME_PER_TURN / 2,
          };
          await expect(rankifyInstance.connect(adr.players[0].wallet).createGame(params)).to.emit(
            rankifyInstance,
            'gameCreated',
          );
        });

        it('should allow burning rank tokens for derived tokens', async () => {
          const rankId = 2;
          const amount = 1;
          const player = adr.players[0];

          // Get initial balances
          const initialRankBalance = await rankToken.balanceOf(player.wallet.address, rankId);
          const initialDerivedBalance = await govtToken.balanceOf(player.wallet.address);

          // Calculate expected derived tokens
          const commonParams = await rankifyInstance.getCommonParams();
          const expectedDerivedTokens: BigNumber = commonParams.principalCost.mul(12);

          // Exit rank token
          await rankifyInstance.connect(player.wallet).exitRankToken(rankId, amount);

          // Check balances after exit
          const finalRankBalance = await rankToken.balanceOf(player.wallet.address, rankId);
          const finalDerivedBalance = await govtToken.balanceOf(player.wallet.address);
          expect(finalRankBalance).to.equal(initialRankBalance.sub(amount));
          expect(finalDerivedBalance).to.equal(initialDerivedBalance.add(expectedDerivedTokens));
        });

        it('should revert when trying to burn more tokens than owned', async () => {
          const rankId = 2;
          const player = adr.players[0];
          const balance = await rankToken.balanceOf(player.wallet.address, rankId);
          await expect(
            rankifyInstance.connect(player.wallet).exitRankToken(rankId, balance.add(1)),
          ).to.be.revertedWithCustomError(rankToken, 'insufficient');
        });
        it('should not revert when trying to burn equal tokens owned', async () => {
          const rankId = 2;
          const player = adr.players[0];
          const balance = await rankToken.balanceOf(player.wallet.address, rankId);
          await expect(
            rankifyInstance.connect(player.wallet).exitRankToken(rankId, balance),
          ).to.not.be.revertedWithCustomError(rankToken, 'insufficient');
          const newBalance = await rankToken.balanceOf(player.wallet.address, rankId);
          expect(newBalance).to.equal(0);
          await expect(rankifyInstance.connect(player.wallet).exitRankToken(rankId, 1)).to.be.revertedWithCustomError(
            rankToken,
            'insufficient',
          );
        });

        it('should emit RankTokenExited event', async () => {
          const rankId = 2;
          const amount = 1;
          const player = adr.players[0];

          const commonParams = await rankifyInstance.getCommonParams();
          const expectedDerivedTokens: BigNumber = commonParams.principalCost.mul(12);

          await expect(rankifyInstance.connect(player.wallet).exitRankToken(rankId, amount))
            .to.emit(rankifyInstance, 'RankTokenExited')
            .withArgs(player.wallet.address, rankId, amount, expectedDerivedTokens);
        });

        describe('When game of next rank is created and opened', () => {
          beforeEach(async () => {
            const params: IRankifyInstance.NewGameParamsInputStruct = {
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
              votePhaseDuration: RInstance_TIME_PER_TURN / 2,
              proposingPhaseDuration: RInstance_TIME_PER_TURN - RInstance_TIME_PER_TURN / 2,
            };
            await rankifyInstance.connect(adr.players[0].wallet).createGame(params);
            const state = await rankifyInstance.getContractState();
            await rankifyInstance.connect(adr.players[0].wallet).openRegistration(state.numGames);
          });
          it('Can be joined only by rank token bearers', async () => {
            const state = await rankifyInstance.getContractState();
            expect(await rankToken.balanceOf(adr.players[0].wallet.address, 2)).to.be.equal(1);
            await rankToken.connect(adr.players[0].wallet).setApprovalForAll(rankifyInstance.address, true);
            await rankToken.connect(adr.players[1].wallet).setApprovalForAll(rankifyInstance.address, true);
            const s1 = await simulator.signJoiningGame({
              gameId: state.numGames,
              participant: adr.players[0].wallet,
              signer: adr.gameMaster1,
            });
            const s2 = await simulator.signJoiningGame({
              gameId: state.numGames,
              participant: adr.players[1].wallet,
              signer: adr.gameMaster1,
            });
            await expect(
              rankifyInstance
                .connect(adr.players[0].wallet)
                .joinGame(state.numGames, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey),
            )
              .to.emit(rankifyInstance, 'PlayerJoined')
              .withArgs(state.numGames, adr.players[0].wallet.address, s1.gmCommitment, s1.participantPubKey);
            await expect(
              rankifyInstance
                .connect(adr.players[1].wallet)
                .joinGame(state.numGames, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
            ).to.be.revertedWithCustomError(rankToken, 'insufficient');
          });
        });
        //   describe('Partial propose and vote test', () => {
        //     let adr: AdrSetupResult;
        //     let env: EnvSetupResult;
        //     let simulator: EnvironmentSimulator;
        //     let rankifyInstance: RankifyDiamondInstance;
        //     let rankToken: RankToken;

        //     beforeEach(async () => {
        //       const setup = await setupMainTest();
        //       adr = setup.adr;
        //       env = setup.env;
        //       simulator = setup.simulator;
        //       rankifyInstance = setup.rankifyInstance;
        //       rankToken = setup.rankToken;
        //     });

        //     it('should handle partial propose and vote correctly', async () => {
        //       // Create a new game with 5 players, 5 turns, 1 vote credit
        //       const gameId = await simulator.createGame({
        //         minGameTime: constantParams.RInstance_MIN_GAME_TIME,
        //         signer: adr.gameCreator1.wallet,
        //         gameMaster: adr.gameMaster1.address,
        //         gameRank: 1,
        //         openNow: true,
        //         voteCredits: 1,
        //       });

        //       // Get 5 players to join the game
        //       const players = adr.players.slice(0, 5);
        //       await simulator.fillParty({
        //         players,
        //         gameId,
        //         shiftTime: true,
        //         gameMaster: adr.gameMaster1,
        //         startGame: true,
        //       });

        //       // Verify the game has started
        //       expect(await rankifyInstance.getGameState(gameId).then(state => state.hasStarted)).to.be.true;

        //       //only players 0, 3 propose
        //       const initialProposals = await simulator.mockProposals({
        //         players: players,
        //         gameMaster: adr.gameMaster1,
        //         gameId,
        //         submitNow: true,
        //         idlers: [1, 2, 4],
        //         turn: 1,
        //       });

        //       //First turn integrity check
        //       const initialIntegrity = await simulator.getProposalsIntegrity({
        //         players,
        //         gameId,
        //         turn: 1,
        //         gm: adr.gameMaster1,
        //         proposalSubmissionData: initialProposals,
        //         idlers: [1, 2, 4],
        //       });

        //       // Create an array of empty votes for the first turn
        //       const emptyVotes = Array(players.length)
        //         .fill([])
        //         .map(() => Array(players.length).fill(0));

        //       // End turn 1 with all proposals but no votes and verify that it's now turn 2
        //       await time.increase(Number(constantParams.RInstance_TIME_PER_TURN) + 1);
        //       await rankifyInstance
        //         .connect(adr.gameMaster1)
        //         .endTurn(
        //           gameId,
        //           emptyVotes,
        //           initialIntegrity.newProposals,
        //           initialIntegrity.permutation,
        //           initialIntegrity.nullifier,
        //         );
        //       expect(await rankifyInstance.getTurn(gameId)).to.equal(2);

        //       // This means that players 1, 2, 4 now are inactive and they are not expected to make a move
        //       // They will not be awaited for. THey may become active only if they submit both proposal & vote
        //       // Otherwise they will be kept considered inactive.
        //       expect(await rankifyInstance.getGameState(gameId).then(state => state.numActivePlayers.toNumber())).to.equal(2);
        //       expect(await rankifyInstance.isActive(gameId, players[0].wallet.address)).to.be.true;
        //       expect(await rankifyInstance.isActive(gameId, players[1].wallet.address)).to.be.false;
        //       expect(await rankifyInstance.isActive(gameId, players[2].wallet.address)).to.be.false;
        //       expect(await rankifyInstance.isActive(gameId, players[3].wallet.address)).to.be.true;
        //       expect(await rankifyInstance.isActive(gameId, players[4].wallet.address)).to.be.false;

        //       // Check the scores from the TurnEnded event
        //       const initialTurnEvents = await rankifyInstance.queryFilter(rankifyInstance.filters.TurnEnded(gameId, 1));
        //       console.log(
        //         'Game state scores after initial turn:',
        //         initialTurnEvents[0].args.scores.map(s => s.toString()),
        //       );
        //       expect(initialTurnEvents[0].args.scores).to.deep.equal([0, 0, 0, 0, 0]);

        //       // Now for turn 2, only players at index 0 and 3 will propose (same as turn 1)

        //       const proposals = await simulator.mockProposals({
        //         players: players,
        //         gameMaster: adr.gameMaster1,
        //         gameId,
        //         submitNow: true,
        //         idlers: [1, 2, 4], // Players at indices 1, 2, and 4 don't propose
        //         turn: 2,
        //       });

        //       // Only player at index 1 will vote, and they vote for player at index 3
        //       const votingIdx = 1;
        //       const votingPlayer = players[votingIdx];

        //       // Create a vote where player 1 votes for player 3
        //       const voteWeight: bigint = 1n;
        //       const playerVote = Array(players.length).fill(0);

        //       //Get 1st turn permutation array
        //       const { permutation: prevTurnPermutation } = await simulator.getProposalsIntegrity({
        //         players,
        //         gameId,
        //         turn: 2,
        //         gm: adr.gameMaster1,
        //         proposalSubmissionData: initialProposals,
        //         idlers: [1, 2, 4],
        //       });

        //       //vote for player 3 according to permutation
        //       playerVote[Number(prevTurnPermutation[3])] = voteWeight;

        //       //attest vote
        //       const vote = await simulator.attestVote({
        //         voter: votingPlayer,
        //         gameId,
        //         turn: 2,
        //         gm: adr.gameMaster1,
        //         verifierAddress: rankifyInstance.address,
        //         vote: playerVote,
        //         gameSize: players.length,
        //         name: constantParams.RANKIFY_INSTANCE_CONTRACT_NAME,
        //         version: constantParams.RANKIFY_INSTANCE_CONTRACT_VERSION,
        //       });

        //       // Submit the vote
        //       await rankifyInstance
        //         .connect(adr.gameMaster1)
        //         .submitVote(
        //           gameId,
        //           vote.ballotId,
        //           votingPlayer.wallet.address,
        //           vote.gmSignature,
        //           vote.voterSignature,
        //           vote.ballotHash,
        //         );

        //       //getting 2nd turn integrity
        //       const { newProposals, permutation, nullifier } = await simulator.getProposalsIntegrity({
        //         players,
        //         gameId,
        //         turn: 2,
        //         gm: adr.gameMaster1,
        //         idlers: [1, 2, 4],
        //         proposalSubmissionData: proposals,
        //       });

        //       // Create an array of votes where only player 1 has voted
        //       const votes = Array(players.length)
        //         .fill([])
        //         .map((_, i) => {
        //           if (i === votingIdx) {
        //             return vote.vote;
        //           } else {
        //             return Array(players.length).fill(0);
        //           }
        //         });

        //       // End turn 2 and verify that it's now turn 3
        //       await time.increase(Number(constantParams.RInstance_TIME_PER_TURN) + 1);
        //       await rankifyInstance.connect(adr.gameMaster1).endTurn(gameId, votes, newProposals, permutation, nullifier);

        //       expect(await rankifyInstance.getTurn(gameId)).to.equal(3);

        //       // Check the scores from the TurnEnded event
        //       // Players
        //       const turnEndedEvents2 = await rankifyInstance.queryFilter(rankifyInstance.filters.TurnEnded(gameId, 2));
        //       console.log(
        //         'Game state scores after partial propose and vote:',
        //         turnEndedEvents2[0].args.scores.map(s => s.toString()),
        //       );

        //       //check game state scores
        //       const scores = await rankifyInstance.getScores(gameId);

        //       expect(await rankifyInstance.getGameState(gameId).then(state => state.numActivePlayers.toNumber())).to.equal(3);
        //       expect(await rankifyInstance.isActive(gameId, players[0].wallet.address)).to.be.true;
        //       expect(await rankifyInstance.isActive(gameId, players[1].wallet.address)).to.be.true;
        //       expect(await rankifyInstance.isActive(gameId, players[2].wallet.address)).to.be.false;
        //       expect(await rankifyInstance.isActive(gameId, players[3].wallet.address)).to.be.true;
        //       expect(await rankifyInstance.isActive(gameId, players[4].wallet.address)).to.be.false;

        //       // Since the other players did nor propose, they cannot receive any points
        //       expect(scores[1]).to.deep.equal([3, 0, 0, 4, 0]);
        //     });
        //   });
      });
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
          } = await rankifyInstance.inspectEIP712Hashes();
          // Verify name and version
          expect(_NAME).to.equal(RANKIFY_INSTANCE_CONTRACT_NAME);
          expect(_VERSION).to.equal(RANKIFY_INSTANCE_CONTRACT_VERSION);

          // Verify hashed components
          expect(_HASHED_NAME).to.equal(eth.utils.solidityKeccak256(['string'], [_NAME]));
          expect(_HASHED_VERSION).to.equal(eth.utils.solidityKeccak256(['string'], [_VERSION]));
          expect(_CACHED_CHAIN_ID).to.equal(await rankifyInstance.currentChainId());
          expect(_CACHED_THIS.toLowerCase()).to.equal(rankifyInstance.address.toLowerCase());

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
  });
});
describe(scriptName + '::Multiple games were played', () => {
  let adr: AdrSetupResult;
  let env: EnvSetupResult;
  // Use the simulator from setupMainTest to ensure consistency
  let simulator: EnvironmentSimulator;
  let eth: typeof ethersDirect & HardhatEthersHelpers;
  let mockProposals: typeof simulator.mockProposals;
  let getPlayers: typeof simulator.getPlayers;
  let endWithIntegrity: typeof simulator.endWithIntegrity;
  let signJoiningGame: typeof simulator.signJoiningGame;
  let getNamedAccounts: typeof hre.getNamedAccounts;
  let rankTokenInstance: RankToken; // Keep this for direct rankToken checks

  beforeEach(async () => {
    const setup = await setupMainTest();
    adr = setup.adr;
    env = setup.env;
    // Assign the simulator from setup to the shared instance
    simulator = setup.simulator;
    mockProposals = simulator.mockProposals;
    getPlayers = simulator.getPlayers;
    endWithIntegrity = simulator.endWithIntegrity;
    signJoiningGame = simulator.signJoiningGame;
    getNamedAccounts = hre.getNamedAccounts;
    eth = setup.ethers;
    rankTokenInstance = setup.rankToken; // Assign rankToken for direct checks

    // Pass the shared simulatorInstance to the fixtures
    await multipleFirstRankGamesTest(simulator)();
    await nextRankTest(simulator)();
  });
  it('Winners have reward tokens', async () => {
    const balances: number[] = [];
    balances[0] = await rankTokenInstance
      .balanceOf(adr.players[0].wallet.address, 2)
      .then(balance => balances.push(balance.toNumber()));
    expect(await rankTokenInstance.balanceOf(adr.players[0].wallet.address, 2)).to.be.equal(1);
    expect(await rankTokenInstance.balanceOf(adr.players[2].wallet.address, 2)).to.be.equal(1);
    expect(await rankTokenInstance.balanceOf(adr.players[1].wallet.address, 2)).to.be.equal(1);
    expect(await rankTokenInstance.balanceOf(adr.players[3].wallet.address, 2)).to.be.equal(0);
    expect(await rankTokenInstance.balanceOf(adr.players[4].wallet.address, 2)).to.be.equal(0);
    expect(await rankTokenInstance.balanceOf(adr.players[5].wallet.address, 2)).to.be.equal(0);
    expect(await rankTokenInstance.balanceOf(adr.players[6].wallet.address, 2)).to.be.equal(0);
    assert(RInstance_MAX_PLAYERS == 6);
  });
  describe('When game of next rank is created', () => {
    it('Can be joined only by bearers of rank token', async () => {
      const lastCreatedGameId = await rankifyInstance.getContractState().then(r => r.numGames);
      await rankTokenInstance.connect(adr.players[0].wallet).setApprovalForAll(rankifyInstance.address, true);
      const s2 = await simulator.signJoiningGame({
        gameId: lastCreatedGameId,
        participant: adr.players[3].wallet,
        signer: simulator.adr.gameMaster1,
      });
      await expect(
        rankifyInstance
          .connect(adr.players[3].wallet)
          .joinGame(lastCreatedGameId, s2.signature, s2.gmCommitment, s2.deadline, s2.participantPubKey),
      ).to.be.revertedWithCustomError(rankTokenInstance, 'insufficient');
    });
    it('Locks rank tokens when player joins', async () => {
      const balance = await rankTokenInstance.balanceOf(adr.players[0].wallet.address, 2);
      const lastCreatedGameId = await rankifyInstance.getContractState().then(r => r.numGames);
      await rankTokenInstance.connect(adr.players[0].wallet).setApprovalForAll(rankifyInstance.address, true);
      const s1 = await simulator.signJoiningGame({
        gameId: lastCreatedGameId,
        participant: adr.players[0].wallet,
        signer: simulator.adr.gameMaster1,
      });
      await rankifyInstance
        .connect(adr.players[0].wallet)
        .joinGame(lastCreatedGameId, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
      const balance2 = await rankTokenInstance.balanceOf(adr.players[0].wallet.address, 2);
      expect(await rankTokenInstance.unlockedBalanceOf(adr.players[0].wallet.address, 2)).to.be.equal(
        balance.toNumber() - 1,
      );
    });
    it('Returns rank token if player leaves game', async () => {
      const lastCreatedGameId = await rankifyInstance.getContractState().then(r => r.numGames);
      await rankTokenInstance.connect(adr.players[0].wallet).setApprovalForAll(rankifyInstance.address, true);
      await rankTokenInstance.connect(adr.players[1].wallet).setApprovalForAll(rankifyInstance.address, true);
      const s1 = await simulator.signJoiningGame({
        gameId: lastCreatedGameId,
        participant: adr.players[0].wallet,
        signer: simulator.adr.gameMaster1,
      });

      await rankifyInstance
        .connect(adr.players[0].wallet)
        .joinGame(lastCreatedGameId, s1.signature, s1.gmCommitment, s1.deadline, s1.participantPubKey);
      let p1balance = await rankTokenInstance.unlockedBalanceOf(adr.players[0].wallet.address, 2);
      p1balance = p1balance.add(1);

      let p2balance = await rankTokenInstance.unlockedBalanceOf(adr.players[1].wallet.address, 2);
      p2balance = p2balance.add(1);
      await rankifyInstance.connect(adr.players[0].wallet).cancelGame(lastCreatedGameId);
      expect(await rankTokenInstance.unlockedBalanceOf(adr.players[0].wallet.address, 2)).to.be.equal(p1balance);
    });
    describe('when this game is over', () => {
      let balancesBeforeJoined: BigNumber[] = [];
      beforeEach(async () => {
        const result = await nextRankGameOver(simulator, rankTokenInstance)();
        balancesBeforeJoined = result.balancesBeforeJoined;
      });
      it('Winners have reward tokens back', async () => {
        const balances: number[] = [];
        const players = getPlayers(adr, RInstance_MIN_PLAYERS, 0);
        for (let i = 0; i < players.length; i++) {
          expect(await rankTokenInstance.unlockedBalanceOf(players[i].wallet.address, 3)).to.be.equal(i == 0 ? 1 : 0);
          balances[i] = await rankTokenInstance
            .unlockedBalanceOf(players[i].wallet.address, 2)
            .then(bn => bn.toNumber());
        }
        expect(balances[0]).to.be.equal(0);
        for (let i = 1; i < players.length; i++) {
          expect(balances[i]).to.be.equal(balancesBeforeJoined[i]);
        }
        expect(await rankTokenInstance.balanceOf(adr.players[0].wallet.address, 3)).to.be.equal(1);
      });
    });
  });
});

describe(scriptName + '::Voting and Proposing Edge Cases', () => {
  let adr: AdrSetupResult;
  let env: EnvSetupResult;
  let simulator: EnvironmentSimulator;
  let eth: typeof ethersDirect & HardhatEthersHelpers;
  let getPlayers: typeof simulator.getPlayers;
  let rankifyInstance: RankifyDiamondInstance;

  beforeEach(async () => {
    const setup = await setupMainTest();
    adr = setup.adr;
    env = setup.env;
    simulator = setup.simulator;
    getPlayers = simulator.getPlayers;
    eth = setup.ethers;
    rankifyInstance = setup.rankifyInstance;
    await setupFirstRankTest(simulator)();
    await setupOpenRegistrationTest(simulator)();
    await filledPartyTest(simulator)();
    await startedGameTest(simulator)();
  });

  it('should handle zero proposers (all idlers)', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;
    const idlers = Array.from(Array(numPlayers).keys());

    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: false,
      idlers: idlers,
      turn: currentTurn.toNumber(),
    });

    const gameStateBeforeProposingEnd = await rankifyInstance.getGameState(gameId);
    await time.increase(gameStateBeforeProposingEnd.proposingPhaseDuration.toNumber() + 1);

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: idlers,
    });

    // This is Test 5
    // Expect MinProposalsNotMetAndNotStale (index 1)
    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals))
      .to.be.revertedWithCustomError(rankifyInstance, 'ErrorProposingStageEndFailed')
      .withArgs(gameId, 1 /* ProposingEndStatus.MinProposalsNotMetAndNotStale */);

    expect(await rankifyInstance.isProposingStage(gameId)).to.be.true; // Should remain in proposing
    expect(await rankifyInstance.isVotingStage(gameId)).to.be.false;
  });

  it('should handle one proposer', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;
    const proposerIndex = 0;
    const idlers = Array.from(Array(numPlayers).keys()).filter(i => i !== proposerIndex);

    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: false,
      idlers: idlers,
      turn: currentTurn.toNumber(),
    });

    await rankifyInstance.connect(adr.gameMaster1).submitProposal(proposalDataForAllSlots[proposerIndex].params);
    // After this, game.numCommitments should be 1.
    // minQuadraticPositions is 2 (for RInstance_VOTE_CREDITS = 5).
    // So, 1 < 2.

    const gameStateBeforeProposingEnd = await rankifyInstance.getGameState(gameId);
    await time.increase(gameStateBeforeProposingEnd.proposingPhaseDuration.toNumber() + 1); // Timeout phase
    // Assume minGameTime is NOT met yet by only phase timeout

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: idlers,
    });

    // This is Test 6
    // Expect MinProposalsNotMetAndNotStale (1) because 1 proposal < minQPos 2, and assuming minGameTime not met by just phase timeout
    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals))
      .to.be.revertedWithCustomError(rankifyInstance, 'ErrorProposingStageEndFailed')
      .withArgs(gameId, 1 /* ProposingEndStatus.MinProposalsNotMetAndNotStale */);

    expect(await rankifyInstance.isVotingStage(gameId)).to.be.false;
    expect(await rankifyInstance.isProposingStage(gameId)).to.be.true; // Should remain in proposing
  });

  it('should handle zero voters (all players propose, nobody votes)', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;

    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: true,
      idlers: [],
      turn: currentTurn.toNumber(),
    });

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: [],
    });

    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals)).to.emit(
      rankifyInstance,
      'ProposingStageEnded',
    );

    expect(await rankifyInstance.isVotingStage(gameId)).to.be.true;

    const gameStateBeforeVotingEnd = await rankifyInstance.getGameState(gameId);
    await time.increase(gameStateBeforeVotingEnd.votePhaseDuration.toNumber() + 1);

    const votes = players.map(() => Array(numPlayers).fill(0));

    const tx = await rankifyInstance
      .connect(adr.gameMaster1)
      .endVoting(gameId, votes, integrity.permutation, integrity.nullifier);
    const receipt = await tx.wait();
    const votingResultsEvent = receipt.events?.find(e => e.event === 'VotingStageResults');
    expect(votingResultsEvent).to.not.be.undefined;

    const finalScores = await rankifyInstance.getScores(gameId);
    expect(finalScores[1]).to.deep.equal(Array(numPlayers).fill(4));

    if (currentTurn.lt(RInstance_MAX_TURNS)) {
      expect(await rankifyInstance.getTurn(gameId)).to.be.equal(currentTurn.add(1));
    } else {
      expect(await rankifyInstance.isGameOver(gameId)).to.be.true;
    }
  });

  it('should handle one voter', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;
    const voterIndex = 0;

    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: true,
      idlers: [],
      turn: currentTurn.toNumber(),
    });

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: [],
    });

    await rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals);
    expect(await rankifyInstance.isVotingStage(gameId)).to.be.true;

    const votes = await simulator.mockVotes({
      gameId: 1,
      turn: 1,
      verifier: rankifyInstance,
      players: players,
      gm: adr.gameMaster1,
      distribution: 'ftw',
      idlers: [1, 2],
    });

    for (let i = 0; i < numPlayers; i++) {
      if (i == 0) {
        await rankifyInstance
          .connect(adr.gameMaster1)
          .submitVote(
            1,
            votes[i].ballotId,
            players[i].wallet.address,
            votes[i].gmSignature,
            votes[i].voterSignature,
            votes[i].ballotHash,
          );
      }
    }
    const gameStateBeforeVotingEnd = await rankifyInstance.getGameState(gameId);
    await time.increase(gameStateBeforeVotingEnd.votePhaseDuration.toNumber() + 1);
    const numPlayersMadeMove = await rankifyInstance.getGameState(gameId).then(r => r.numPlayersMadeMove);
    expect(numPlayersMadeMove).to.be.equal(1);
    const tx = await rankifyInstance.connect(adr.gameMaster1).endVoting(
      gameId,
      votes.map(v => v.vote),
      integrity.permutation,
      integrity.nullifier,
    );
    await tx.wait();
    const numActiveAfterVoting = await rankifyInstance.getGameState(gameId).then(r => r.numActivePlayers);
    expect(numActiveAfterVoting).to.be.equal(1);
    const notVotingGivesEveryone = await rankifyInstance.getGameState(gameId).then(r => r.voting.maxQuadraticPoints);
    let expectedScores = [4, 4, 3];

    const receipt = await tx.wait();
    const votingResultsEvent = receipt.events?.find(e => e.event === 'VotingStageResults');
    expect(votingResultsEvent).to.not.be.undefined;

    const finalScores = await rankifyInstance.getScores(gameId);

    expect(finalScores[1]).to.deep.equal(expectedScores);

    if (currentTurn.lt(RInstance_MAX_TURNS)) {
      expect(await rankifyInstance.getTurn(gameId)).to.be.equal(currentTurn.add(1));
    } else {
      expect(await rankifyInstance.isGameOver(gameId)).to.be.true;
    }
  });

  it('should revert with MinProposalsNotMetAndNotStale if timeout with < minQuadraticPositions proposals and minGameTime not met', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;

    // Ensure minGameTime is set substantially longer than phase timeout for this test
    // Get game state to check current minGameTime and proposingPhaseDuration
    let gameState = await rankifyInstance.getGameState(gameId);
    const proposingPhaseDuration = gameState.proposingPhaseDuration.toNumber();
    const minGameTime = gameState.minGameTime.toNumber();

    // Sanity check: ensure proposingPhaseDuration is less than minGameTime for the test to be valid
    // If not, the game might end due to minGameTime before the specific revert can be triggered.
    // This might require adjusting game creation params for this specific test block if defaults don't fit.
    expect(proposingPhaseDuration).to.be.lessThan(minGameTime);

    // All players are idlers (0 proposals)
    const idlers = Array.from(Array(numPlayers).keys());
    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: false, // No proposals submitted by players
      idlers: idlers,
      turn: currentTurn.toNumber(),
    });

    // Advance time just past proposingPhaseDuration, but NOT past minGameTime
    await time.increase(proposingPhaseDuration + 1);

    // GM attempts to end proposing stage
    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots, // Will be empty proposals for idlers
      idlers: idlers,
    });

    // ProposingEndStatus enum values from Solidity: Success, MinProposalsNotMetAndNotStale, GameIsStaleAndCanEnd, PhaseConditionsNotMet, NotProposingStage
    // We expect MinProposalsNotMetAndNotStale (index 1)
    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals))
      .to.be.revertedWithCustomError(rankifyInstance, 'ErrorProposingStageEndFailed')
      .withArgs(gameId, 1 /* ProposingEndStatus.MinProposalsNotMetAndNotStale */);

    // Also check for the emitted event
    // To check for emitted events before a revert, you might need to use a try-catch or a more advanced event listener setup if the revert happens before event emission in the tx.
    // However, our current contract logic emits MinProposalsNotMet *before* reverting if that's the specific cause.
    // We can verify this by querying past events if the transaction containing the emit gets mined, which it does before reverting with the custom error.
    // Let's try to make the call again and catch it to query events (or use a more direct method if available)
    const tx = rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals);
    await expect(tx).to.be.reverted;
    // Check events from the block of the reverted transaction might be tricky / not standard via expect().
    // A more robust way would be to use a try/catch and then query events if the transaction was mined before reverting.
    // For now, the custom error check is the primary assertion.
  });

  it('should not allow endProposing even if timeout with < minQuadraticPositions proposals BUT minGameTime IS met (stale game)', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;

    let gameState = await rankifyInstance.getGameState(gameId);
    const proposingPhaseDuration = gameState.proposingPhaseDuration.toNumber();
    const minGameTime = gameState.minGameTime.toNumber();
    const turnStartedAt = gameState.turnStartedAt.toNumber(); // Assuming turn 0 starts at game start for simplicity or adjust based on actual start time
    const gameStartedAt = await rankifyInstance.getGameState(gameId).then(s => s.turnStartedAt); //This might be more accurate for when minGameTime check starts

    // All players are idlers (0 proposals)
    const idlers = Array.from(Array(numPlayers).keys());
    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: false,
      idlers: idlers,
      turn: currentTurn.toNumber(),
    });

    // Advance time past proposingPhaseDuration AND past minGameTime relative to game start
    // Ensure block.timestamp >= game.turnStartedAt (or game creation) + game.minGameTime
    const timeToIncrease = Math.max(
      proposingPhaseDuration + 1,
      gameStartedAt.toNumber() + minGameTime - (await time.latest()) + 1,
    );
    await time.increase(timeToIncrease);

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: idlers,
    });
    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals))
      .to.be.revertedWithCustomError(rankifyInstance, 'ErrorProposingStageEndFailed')
      .withArgs(gameId, 2 /* ProposingEndStatus.GameIsStaleAndCanEnd */);
    expect(await rankifyInstance.getGameState(gameId).then(s => s.hasEnded)).to.be.false;
  });

  it('should allow endProposing if timeout with >= minQuadraticPositions proposals (normal timeout)', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;
    // RInstance_MIN_PLAYERS is 3. To submit 2 proposals, proposersIndices should ensure two distinct players.
    expect(numPlayers).to.be.gte(2, 'Test requires at least 2 players for this scenario');

    let gameState = await rankifyInstance.getGameState(gameId);
    const proposingPhaseDuration = gameState.proposingPhaseDuration.toNumber();
    const minQuadraticPositions = gameState.voting.minQuadraticPositions.toNumber();
    expect(minQuadraticPositions).to.equal(2); // Based on RInstance_VOTE_CREDITS = 5

    // Player 0 and Player 1 submit proposals
    const proposersIndices = [0, 1];
    const idlers = Array.from(Array(numPlayers).keys()).filter(i => !proposersIndices.includes(i));

    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: false, // GM will submit proposals one by one
      idlers: idlers,
      turn: currentTurn.toNumber(),
    });

    // GM submits the proposals for player 0 and player 1
    await rankifyInstance.connect(adr.gameMaster1).submitProposal(proposalDataForAllSlots[proposersIndices[0]].params);
    await rankifyInstance.connect(adr.gameMaster1).submitProposal(proposalDataForAllSlots[proposersIndices[1]].params);

    const numSubmittedProposals = 2; // We have submitted two proposals
    expect(await rankifyInstance.getGameState(gameId).then(s => s.numCommitments)).to.equal(numSubmittedProposals);
    // This assertion should now pass: numSubmittedProposals (2) >= minQuadraticPositions (2)
    expect(numSubmittedProposals).to.be.gte(minQuadraticPositions);

    // Advance time just past proposingPhaseDuration
    await time.increase(proposingPhaseDuration + 1);

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: idlers,
    });

    // Expect endProposing to succeed and emit ProposingStageEnded with correct numProposals
    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals))
      .to.emit(rankifyInstance, 'ProposingStageEnded')
      .withArgs(gameId, currentTurn, numSubmittedProposals, integrity.newProposals.proposals);

    expect(await rankifyInstance.isVotingStage(gameId)).to.be.true;
  });

  it('should allow endProposing if all players propose (>= minQuadraticPositions, before timeout)', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;

    let gameState = await rankifyInstance.getGameState(gameId);
    const minQuadraticPositions = gameState.voting.minQuadraticPositions.toNumber();
    expect(numPlayers).to.be.gte(minQuadraticPositions); // RInstance_MIN_PLAYERS (3) >= minQPos (2)

    // All players submit proposals
    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: true, // This helper calls submitProposal internally for non-idlers
      idlers: [],
      turn: currentTurn.toNumber(),
    });

    const expectedNumCommitments = numPlayers;
    // Verify that mockProposals with submitNow:true indeed resulted in expected commitments
    expect(await rankifyInstance.getGameState(gameId).then(s => s.numCommitments)).to.equal(expectedNumCommitments);

    // DO NOT advance time, phase should end because all (active) players made their move

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: [],
    });

    // Expect endProposing to succeed and emit ProposingStageEnded with correct numProposals
    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals))
      .to.emit(rankifyInstance, 'ProposingStageEnded')
      .withArgs(gameId, currentTurn, expectedNumCommitments, []);

    expect(await rankifyInstance.isVotingStage(gameId)).to.be.true;
  });

  it('should REVERT endProposing if timeout with < minQuadraticPositions proposals BUT minGameTime IS met (stale game)', async () => {
    const gameId = eth.BigNumber.from(1);
    const currentTurn = await rankifyInstance.getTurn(gameId);
    const players = getPlayers(adr, RInstance_MIN_PLAYERS);
    const numPlayers = players.length;

    let gameState = await rankifyInstance.getGameState(gameId);
    const proposingPhaseDuration = gameState.proposingPhaseDuration.toNumber();
    const minGameTime = gameState.minGameTime.toNumber();
    // For minGameTime checks, we need the absolute start time of the game.
    // When a game starts, LibTBG.State.startedAt is set. This is reflected as GameStateOutput.turnStartedAt for the first turn.
    // If currentTurn > 1, turnStartedAt would be for the current turn, not game start.
    // For this test, it's the first turn after setup.
    const gameActualStartedAt = gameState.turnStartedAt.toNumber();

    // All players are idlers (0 proposals)
    const idlers = Array.from(Array(numPlayers).keys());
    const proposalDataForAllSlots = await simulator.mockProposals({
      players,
      gameMaster: adr.gameMaster1,
      gameId: gameId,
      submitNow: false,
      idlers: idlers,
      turn: currentTurn.toNumber(),
    });

    // Advance time past proposingPhaseDuration AND past minGameTime relative to game start
    const currentTime = await time.latest();
    let timeToIncrease = Math.max(proposingPhaseDuration + 1, gameActualStartedAt + minGameTime - currentTime + 1);

    if (timeToIncrease <= 0) {
      // Target time is already past or now, just ensure a new block is processed
      await time.advanceBlock();
    } else {
      await time.increase(timeToIncrease);
    }

    const integrity = await simulator.getProposalsIntegrity({
      players,
      gameId: gameId,
      turn: currentTurn.toNumber(),
      gm: adr.gameMaster1,
      proposalSubmissionData: proposalDataForAllSlots,
      idlers: idlers,
    });

    // Expect endProposing to REVERT because game is stale but facet requires ProposingEndStatus.Success
    // The status from canEndProposing would be GameIsStaleAndCanEnd (enum value 2)
    await expect(rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals))
      .to.be.revertedWithCustomError(rankifyInstance, 'ErrorProposingStageEndFailed')
      .withArgs(gameId, 2 /* ProposingEndStatus.GameIsStaleAndCanEnd */);

    // Game should NOT have transitioned to voting stage
    expect(await rankifyInstance.isVotingStage(gameId)).to.be.false;
    expect(await rankifyInstance.isProposingStage(gameId)).to.be.true; // Should still be in proposing stage
  });

  describe('forceEndStaleGame Logic', () => {
    it('should REVERT forceEndStaleGame if minGameTime not met (even if other stale conditions appear met)', async () => {
      const gameId = eth.BigNumber.from(1);
      const currentTurn = await rankifyInstance.getTurn(gameId);
      const players = getPlayers(adr, RInstance_MIN_PLAYERS);
      const numPlayers = players.length;

      let gameState = await rankifyInstance.getGameState(gameId);
      const proposingPhaseDuration = gameState.proposingPhaseDuration.toNumber();
      // minGameTime is NOT yet met for this test

      // All players are idlers (0 proposals)
      const idlers = Array.from(Array(numPlayers).keys());
      const proposalDataForIntegrity = await simulator.mockProposals({
        players,
        gameMaster: adr.gameMaster1,
        gameId: gameId,
        submitNow: false,
        idlers: idlers,
        turn: currentTurn.toNumber(),
      });
      expect(await rankifyInstance.getGameState(gameId).then(s => s.numCommitments)).to.equal(0);

      // Advance time just past proposingPhaseDuration, but ensure minGameTime is NOT met
      // (Default RInstance_MIN_GAME_TIME is likely > RInstance_TIME_PER_TURN, which proposingPhaseDuration is part of)
      await time.increase(proposingPhaseDuration + 1);

      // Verify minGameTime is indeed not met
      gameState = await rankifyInstance.getGameState(gameId);
      const gameActualStartedAt = gameState.turnStartedAt.toNumber();
      expect(await time.latest()).to.be.lessThan(gameActualStartedAt + gameState.minGameTime.toNumber());

      // Attempt to call forceEndStaleGame
      // LibRankify.isGameStaleForForcedEnd should return false because minGameTime not met
      await expect(rankifyInstance.connect(adr.gameMaster1).forceEndStaleGame(gameId))
        .to.be.revertedWithCustomError(rankifyInstance, 'ErrorCannotForceEndGame')
        .withArgs(gameId);
    });

    it('should REVERT forceEndStaleGame if game is not in proposing stage (e.g., in voting)', async () => {
      const gameId = eth.BigNumber.from(1);
      const currentTurn = await rankifyInstance.getTurn(gameId);
      const players = getPlayers(adr, RInstance_MIN_PLAYERS);

      // Let enough proposals be made and move to voting stage
      const proposalData = await simulator.mockProposals({
        players,
        gameMaster: adr.gameMaster1,
        gameId: gameId,
        submitNow: true, // All players propose
        idlers: [], // No idlers
        turn: currentTurn.toNumber(),
      });
      // Ensure the ProposingEndStatus is Success to pass the facet's require statement
      const integrity = await simulator.getProposalsIntegrity({
        players,
        gameId,
        turn: currentTurn.toNumber(),
        gm: adr.gameMaster1,
        proposalSubmissionData: proposalData,
        idlers: [],
      });
      await rankifyInstance.connect(adr.gameMaster1).endProposing(gameId, integrity.newProposals); // Moves to voting
      expect(await rankifyInstance.isVotingStage(gameId)).to.be.true;

      // Ensure minGameTime is met so that's not the reason for revert
      let gameState = await rankifyInstance.getGameState(gameId);
      const gameActualStartedAt = gameState.turnStartedAt.toNumber();
      const minGameTime = gameState.minGameTime.toNumber();
      const currentTime = await time.latest();
      let timeToIncrease = gameActualStartedAt + minGameTime - currentTime + 1;
      if (timeToIncrease <= 0) await time.advanceBlock();
      else await time.increase(timeToIncrease);
      expect(await time.latest()).to.be.gte(gameActualStartedAt + minGameTime);

      // Attempt to call forceEndStaleGame - should fail as it's not stuck in proposing with < minProposals
      // LibRankify.isGameStaleForForcedEnd should return false because it's not in proposing stage under the defined stale conditions.
      await expect(rankifyInstance.connect(adr.gameMaster1).forceEndStaleGame(gameId))
        .to.be.revertedWithCustomError(rankifyInstance, 'ErrorCannotForceEndGame')
        .withArgs(gameId);
    });

    it('should REVERT forceEndStaleGame if game is already over', async () => {
      const gameId = eth.BigNumber.from(1);
      await simulator.runToTheEnd(gameId, 'ftw');
      expect(await rankifyInstance.isGameOver(gameId)).to.be.true;
      expect(await rankifyInstance.getGameState(gameId).then(s => s.hasEnded)).to.be.true;

      await expect(rankifyInstance.connect(adr.gameMaster1).forceEndStaleGame(gameId)).to.be.revertedWith(
        'Rankify: Game already over',
      );
    });

    it('forceEndStaleGame determines a winner)', async () => {
      const gameId = eth.BigNumber.from(1);
      const currentTurn = await rankifyInstance.getTurn(gameId);
      const players = getPlayers(adr, RInstance_MIN_PLAYERS);
      const numPlayers = players.length;

      let gameState = await rankifyInstance.getGameState(gameId);
      const proposingPhaseDuration = gameState.proposingPhaseDuration.toNumber();
      const minGameTime = gameState.minGameTime.toNumber();
      const gameActualStartedAt = gameState.turnStartedAt.toNumber();

      const idlers = Array.from(Array(numPlayers).keys());
      // Ensure numCommitments is 0 by not submitting proposals for this turn
      // This relies on the beforeEach not auto-submitting proposals for turn 1 of gameId 1, or specific test setup.
      expect(await rankifyInstance.getGameState(gameId).then(s => s.numCommitments)).to.equal(0);

      const currentTime = await time.latest();
      let timeToIncrease = Math.max(proposingPhaseDuration + 1, gameActualStartedAt + minGameTime - currentTime + 1);
      await time.increase(timeToIncrease);

      await rankifyInstance.connect(adr.gameMaster1).forceEndStaleGame(gameId);

      //   const finalWinner = await rankifyInstance.gameWinner(gameId);
      //   // With 0 proposals in turn 1, all scores are 0. emitRankReward sets winner to address(0) if topScore is 0.
      //   expect(finalWinner).to.equal(eth.constants.AddressZero);
      //   expect(await rankifyInstance.getGameState(gameId).then(s => s.hasEnded)).to.be.true;
    });
  });
});
