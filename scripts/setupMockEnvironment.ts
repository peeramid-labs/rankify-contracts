import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { HardhatEthersHelpers, HardhatRuntimeEnvironment, HttpNetworkHDAccountsConfig } from 'hardhat/types';
import { Wallet } from 'ethers';
import { MockERC20 } from '../types/src/mocks/MockERC20';
import { MockERC1155 } from '../types/src/mocks/MockERC1155';
import { MockERC721 } from '../types/src/mocks/MockERC721';
import { MAODistribution } from '../types/src/distributions/MAODistribution';
import { RankToken } from '../types/src/tokens/RankToken';
import { Deployment } from 'hardhat-deploy/types';
import { Rankify } from '../types/src/tokens/Rankify';
import { DAODistributor } from '../types/src/DAODistributor';
import { ArguableVotingTournament } from '../types/src/distributions/ArguableVotingTournament';
import { log } from './utils';

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

export interface SignerIdentity {
  /** Display name of the signer */
  name: string;
  /** Unique identifier for the signer */
  id: string;
  /** Ethereum wallet associated with the signer */
  wallet: SignerWithAddress | Wallet;
}

export interface AdrSetupResult {
  contractDeployer: SignerIdentity;
  players: SignerIdentity[];
  maliciousActor1: SignerIdentity;
  maliciousActor2: SignerIdentity;
  maliciousActor3: SignerIdentity;
  gameCreator1: SignerIdentity;
  gameCreator2: SignerIdentity;
  gameCreator3: SignerIdentity;
  gameOwner: SignerIdentity;
  gameMaster1: Wallet;
  gameMaster2: Wallet;
  gameMaster3: Wallet;
}

/**
 * Sets up the game environment with all required contract instances
 * @param setup - Setup configuration including contract deployments and addresses
 * @returns Initialized contract instances needed for the game
 */
const setupEnvironment = async (setup: {
  distributor: Deployment;
  mao: Deployment;
  RankifyToken: Deployment;
  RankTokenBase: Deployment;
  mockERC20: MockERC20;
  mockERC721: MockERC721;
  mockERC1155: MockERC1155;
  adr: AdrSetupResult;
  arguableVotingTournamentDistribution: Deployment;
  hre: HardhatRuntimeEnvironment;
}): Promise<EnvSetupResult> => {
  const { ethers } = setup.hre;
  const rankTokenBase = (await ethers.getContractAt(setup.RankTokenBase.abi, setup.RankTokenBase.address)) as RankToken;
  const rankifyToken = (await ethers.getContractAt(setup.RankifyToken.abi, setup.RankifyToken.address)) as Rankify;
  //   const rankifyInstance = (await ethers.getContractAt(
  //     setup.RankifyInstance.abi,
  //     setup.RankifyInstance.address,
  //   )) as RankifyDiamondInstance;

  const maoDistribution = (await ethers.getContractAt(setup.mao.abi, setup.mao.address)) as MAODistribution;
  const distributor = (await ethers.getContractAt(setup.distributor.abi, setup.distributor.address)) as DAODistributor;

  const arguableVotingTournamentDistribution = (await ethers.getContractAt(
    setup.arguableVotingTournamentDistribution.abi,
    setup.arguableVotingTournamentDistribution.address,
  )) as ArguableVotingTournament;

  return {
    maoDistribution,
    distributor,
    rankifyToken,
    // rankifyInstance,
    rankTokenBase,
    mockERC1155: setup.mockERC1155,
    mockERC20: setup.mockERC20,
    mockERC721: setup.mockERC721,
    arguableVotingTournamentDistribution,
  };
};

/**
 * Sets up all addresses needed for testing and deployment
 * Creates wallets for contract deployer, players, game masters, and other roles
 * @param hre - Hardhat Runtime Environment
 * @returns A function that takes named accounts and ethers instance to complete setup
 */
export const setupAddresses = async (hre: HardhatRuntimeEnvironment): Promise<AdrSetupResult> => {
  const { ethers } = hre;
  const [
    ,
    ,
    ,
    //Using first ones in hardhat deploy scripts
    _player1,
    _player2,
    _player3,
    _player4,
    _player5,
    _player6,
    _player7,
    _player8,
    _player9,
    _player10,
    _player11,
    _player12,
    _player13,
    _player14,
    _player15,
    _player16,
    _player17,
  ] = await ethers.getSigners();

  /**
   * Creates a random wallet identity and funds it with ETH
   * @param name - Name for the new identity
   * @returns A SignerIdentity with a funded wallet
   */
  const createRandomIdentityAndSeedEth = async (name: string) => {
    let newWallet = new ethers.Wallet(ethers.utils.solidityKeccak256(['string'], [name]));
    newWallet = newWallet.connect(ethers.provider);
    await _player1.sendTransaction({
      to: newWallet.address,
      value: ethers.utils.parseEther('10'),
    });

    const newIdentity: SignerIdentity = {
      wallet: newWallet,
      name: name,
      id: name + '-id',
    };
    return newIdentity;
  };

  const gameCreator1 = await createRandomIdentityAndSeedEth('gameCreator1');
  const gameCreator2 = await createRandomIdentityAndSeedEth('gameCreator2');
  const gameCreator3 = await createRandomIdentityAndSeedEth('gameCreator3');
  const maliciousActor1 = await createRandomIdentityAndSeedEth('maliciousActor');
  const maliciousActor2 = await createRandomIdentityAndSeedEth('MaliciousActor2');
  const maliciousActor3 = await createRandomIdentityAndSeedEth('MaliciousActor3');
  const player18 = await createRandomIdentityAndSeedEth('player18');

  const m = (hre.config.networks[hre.network.name].accounts as HttpNetworkHDAccountsConfig)['mnemonic'];
  // const keychain = ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/100`);

  const contractDeployer: SignerIdentity = {
    wallet: ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/${0}`).connect(hre.ethers.provider),
    name: 'contractDeployer',
    id: 'contractDeployer-id',
  };

  const gameOwner: SignerIdentity = {
    wallet: ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/${1}`).connect(hre.ethers.provider),
    name: 'gameOwner',
    id: 'gameOwner-id',
  };
  const player1: SignerIdentity = {
    wallet: _player1,
    name: 'player1',
    id: 'player1-id',
  };
  const player2: SignerIdentity = {
    wallet: _player2,
    name: 'player2',
    id: 'player2-id',
  };
  const player3: SignerIdentity = {
    wallet: _player3,
    name: 'player3',
    id: 'player3-id',
  };
  const player4: SignerIdentity = {
    wallet: _player4,
    name: 'player4',
    id: 'player4-id',
  };
  const player5: SignerIdentity = {
    wallet: _player5,
    name: 'player5',
    id: 'player5-id',
  };
  const player6: SignerIdentity = {
    wallet: _player6,
    name: 'player6',
    id: 'player6-id',
  };
  const player7: SignerIdentity = {
    wallet: _player7,
    name: 'player7',
    id: 'player7-id',
  };
  const player8: SignerIdentity = {
    wallet: _player8,
    name: 'player8',
    id: 'player8-id',
  };
  const player9: SignerIdentity = {
    wallet: _player9,
    name: 'player9',
    id: 'player9-id',
  };
  const player10: SignerIdentity = {
    wallet: _player10,
    name: 'player10',
    id: 'player10-id',
  };
  const player11: SignerIdentity = {
    wallet: _player11,
    name: 'player11',
    id: 'player11-id',
  };
  const player12: SignerIdentity = {
    wallet: _player12,
    name: 'player12',
    id: 'player12-id',
  };
  const player13: SignerIdentity = {
    wallet: _player13,
    name: 'player13',
    id: 'player13-id',
  };
  const player14: SignerIdentity = {
    wallet: _player14,
    name: 'player14',
    id: 'player14-id',
  };
  const player15: SignerIdentity = {
    wallet: _player15,
    name: 'player15',
    id: 'player15-id',
  };
  const player16: SignerIdentity = {
    wallet: _player16,
    name: 'player16',
    id: 'player16-id',
  };
  const player17: SignerIdentity = {
    wallet: _player17,
    name: 'player17',
    id: 'player17-id',
  };

  const gm1 = ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/9`).connect(hre.ethers.provider);
  await _player1.sendTransaction({
    to: gm1.address,
    value: ethers.utils.parseEther('10'),
  });
  const gm2 = ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/101`).connect(hre.ethers.provider);
  await _player1.sendTransaction({
    to: gm2.address,
    value: ethers.utils.parseEther('10'),
  });
  const gm3 = ethers.Wallet.fromMnemonic(m, `m/44'/60'/0'/0/102`).connect(hre.ethers.provider);
  await _player1.sendTransaction({
    to: gm3.address,
    value: ethers.utils.parseEther('10'),
  });

  return {
    contractDeployer,
    players: [
      player1,
      player2,
      player3,
      player4,
      player5,
      player6,
      player7,
      player8,
      player9,
      player10,
      player11,
      player12,
      player13,
      player14,
      player15,
      player16,
      player17,
      player18,
    ],
    maliciousActor1,
    gameCreator1,
    gameCreator2,
    gameCreator3,
    gameMaster1: gm1,
    gameMaster2: gm2,
    gameMaster3: gm3,
    maliciousActor2,
    maliciousActor3,
    gameOwner,
  };
};
export const setupMockedEnvironment = async (
  hre: HardhatRuntimeEnvironment,
  useFixture: boolean = true,
  withDeploy = true,
) => {
  const { deployments, getNamedAccounts, ethers: _eth } = hre;
  const { deployer, owner } = await hre.getNamedAccounts();

  if (useFixture) {
    log('Using fixture');
    await deployments.fixture(['ERC7744', 'MAO']);
  } else if (withDeploy) {
    log('Running ERC7744 and MAO deployments');
    await deployments.run(['ERC7744', 'MAO'], { writeDeploymentsToFiles: true });
  }
  const adr = await setupAddresses(hre);

  await adr.contractDeployer.wallet.sendTransaction({
    to: deployer,
    value: _eth.utils.parseEther('1'),
  });
  await adr.contractDeployer.wallet.sendTransaction({
    to: owner,
    value: _eth.utils.parseEther('1'),
  });
  const MockERC20F = await _eth.getContractFactory('MockERC20', adr.contractDeployer.wallet);
  const mockERC20 = (await MockERC20F.deploy('Mock ERC20', 'MCK20', adr.contractDeployer.wallet.address)) as MockERC20;
  await mockERC20.deployed();

  const MockERC1155F = await _eth.getContractFactory('MockERC1155', adr.contractDeployer.wallet);
  const mockERC1155 = (await MockERC1155F.deploy('MOCKURI', adr.contractDeployer.wallet.address)) as MockERC1155;
  await mockERC1155.deployed();

  const MockERC721F = await _eth.getContractFactory('MockERC721', adr.contractDeployer.wallet);
  const mockERC721 = (await MockERC721F.deploy(
    'Mock ERC721',
    'MCK721',
    adr.contractDeployer.wallet.address,
  )) as MockERC721;
  await mockERC721.deployed();
  const env = await setupEnvironment({
    distributor: await deployments.get('DAODistributor'),
    mao: await deployments.get('MAODistribution'),
    RankifyToken: await deployments.get('Rankify'),
    RankTokenBase: await deployments.get('RankToken'),
    // RankifyInstance: await deployments.get('RankifyInstance'),
    arguableVotingTournamentDistribution: await deployments.get('ArguableVotingTournament'),
    mockERC20: mockERC20,
    mockERC721: mockERC721,
    mockERC1155: mockERC1155,
    adr,
    hre,
  });
  const { ethers } = hre;
  await env.rankifyToken
    .connect(adr.gameOwner.wallet)
    .mint(adr.gameCreator1.wallet.address, ethers.utils.parseUnits('100', 9));
  await env.rankifyToken
    .connect(adr.gameOwner.wallet)
    .mint(adr.gameCreator2.wallet.address, ethers.utils.parseUnits('100', 9));
  await env.rankifyToken
    .connect(adr.gameOwner.wallet)
    .mint(adr.gameCreator3.wallet.address, ethers.utils.parseUnits('100', 9));
  for (const player of adr.players) {
    await env.rankifyToken.connect(adr.gameOwner.wallet).mint(player.wallet.address, ethers.utils.parseUnits('100', 9));
  }
  await env.rankifyToken
    .connect(adr.gameOwner.wallet)
    .mint(adr.maliciousActor1.wallet.address, ethers.utils.parseUnits('100', 9));
  await env.rankifyToken
    .connect(adr.gameOwner.wallet)
    .mint(adr.maliciousActor2.wallet.address, ethers.utils.parseUnits('100', 9));
  await env.rankifyToken
    .connect(adr.gameOwner.wallet)
    .mint(adr.maliciousActor3.wallet.address, ethers.utils.parseUnits('100', 9));
  return {
    env,
    adr,
  };
};
