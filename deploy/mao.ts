import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers, hardhatArguments } from 'hardhat';
import { LibSemver } from '../types/src/distributions/MAODistribution';
import { ERC7744 } from '@peeramid-labs/eds/types';
import ERC7744Abi from '@peeramid-labs/eds/abi/src/ERC7744.sol/ERC7744.json';
import { MintSettingsStruct } from '../types/src/tokens/DistributableGovernanceERC20.sol/DistributableGovernanceERC20';
import { ArguableVotingTournament } from '../types/src/distributions/ArguableVotingTournament';
import { constantParams } from '../scripts/EnvironmentSimulator';
import { poseidonContract } from 'circomlibjs';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer, DAO } = await getNamedAccounts();
  const codeIndexContract = (await hre.ethers.getContractAt(
    ERC7744Abi,
    '0xC0dE1D2F7662c63796E544B2647b2A94EE658E07',
  )) as ERC7744;

  let _trustedForwarder = ethers.constants.AddressZero;
  let _distributionName = process.env.MAO_INSTANCE_NAME ?? constantParams.RANKIFY_INSTANCE_CONTRACT_NAME;
  const versionString = process.env.MAO_INSTANCE_VERSION ?? constantParams.RANKIFY_INSTANCE_CONTRACT_VERSION;
  let _distributionVersion: LibSemver.VersionStruct = {
    major: versionString.split('.')[0],
    minor: versionString.split('.')[1],
    patch: versionString.split('.')[2],
  };

  const log = (message: string) => {
    if (process.env.NODE_ENV !== 'TEST') {
      console.log(`[MAO Deploy] ${message}`);
    }
  };

  const SACMDeployment = await deployments.get('SimpleAccessManager');
  const accessManagerCode = await hre.ethers.provider.getCode(SACMDeployment.address);
  const accessManagerId = ethers.utils.keccak256(accessManagerCode);
  log('Starting MAO deployment...');

  const rankTokenDeployment = await deployments.deploy('RankToken', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [
      'https://assets.vote4best.app/rank',
      'https://assets.vote4best.app/musicRankToken.json',
      ethers.constants.AddressZero,
      deployer,
    ],
  });

  log('RankToken deployed, registering code...');

  const rankTokenCode = await hre.ethers.provider.getCode(rankTokenDeployment.address);
  const rankTokenCodeId = ethers.utils.keccak256(rankTokenCode);
  const registerAddress = await codeIndexContract.get(rankTokenCodeId);
  if (registerAddress === ethers.constants.AddressZero) {
    log('Registering RankToken in CodeIndex...');
    await (await codeIndexContract.register(rankTokenDeployment.address)).wait(1);
  } else {
    log('RankToken already registered in CodeIndex');
  }

  const initializerDeployment = await deploy('RankifyInstanceInit', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  log('Deploying RankifyInstanceInit...');

  const initializerDeploymentCode = await hre.ethers.provider.getCode(initializerDeployment.address);
  const initializerDeploymentCodeId = ethers.utils.keccak256(initializerDeploymentCode);
  const initializerDeploymentCodeIdAddress = await codeIndexContract.get(initializerDeploymentCodeId);
  if (initializerDeploymentCodeIdAddress === ethers.constants.AddressZero) {
    await (await codeIndexContract.register(initializerDeployment.address)).wait(1);
  } else {
    log('Initializer already registered in CodeIndex');
  }

  const initializerAdr = initializerDeployment.address;
  const initializerSelector = '0x00000000';

  const loupeFacetDeployment = await deploy('DiamondLoupeFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    gasLimit: 8000000,
  });

  const inspectorFacetDeployment = await deploy('EIP712InspectorFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  const RankifyMainFacetDeployment = await deploy('RankifyInstanceMainFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  const RankifyReqsFacetDeployment = await deploy('RankifyInstanceRequirementsFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  const RankifyGMFacetDeployment = await deploy('RankifyInstanceGameMastersFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  const OwnershipFacetDeployment = await deploy('OwnershipFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  const addresses: ArguableVotingTournament.ArguableTournamentAddressesStruct = {
    loupeFacet: loupeFacetDeployment.address,
    inspectorFacet: inspectorFacetDeployment.address,
    RankifyMainFacet: RankifyMainFacetDeployment.address,
    RankifyReqsFacet: RankifyReqsFacetDeployment.address,
    RankifyGMFacet: RankifyGMFacetDeployment.address,
    OwnershipFacet: OwnershipFacetDeployment.address,
  };

  const arguableVotingTournamentDeployment = await deploy('ArguableVotingTournament', {
    from: deployer,
    gasLimit: 8000000,
    estimatedGasLimit: 8000000,
    skipIfAlreadyDeployed: true,
    args: [initializerAdr, initializerSelector, _distributionName, _distributionVersion, addresses],
  });

  log('Deploying ArguableVotingTournament...');

  const arguableVotingTournamentDeploymentCode = await hre.ethers.provider.getCode(
    arguableVotingTournamentDeployment.address,
  );
  const arguableVotingTournamentDeploymentCodeId = ethers.utils.keccak256(arguableVotingTournamentDeploymentCode);
  const arguableVotingTournamentDeploymentRegisterAddress = await codeIndexContract.get(
    arguableVotingTournamentDeploymentCodeId,
  );
  if (arguableVotingTournamentDeploymentRegisterAddress === ethers.constants.AddressZero) {
    log('Registering ArguableVotingTournament in CodeIndex...');
    await (await codeIndexContract.register(arguableVotingTournamentDeployment.address)).wait(1);
  } else {
    log('ArguableVotingTournament already registered in CodeIndex');
  }

  const arguableVotingTournamentCode = await hre.ethers.provider.getCode(arguableVotingTournamentDeployment.address);
  const arguableVotingTournamentCodeId = ethers.utils.keccak256(arguableVotingTournamentCode);
  const mintSettings: MintSettingsStruct = {
    amounts: [],
    receivers: [],
  };
  const govTokenDeployment = await deploy('DistributableGovernanceERC20', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: ['TokenName', 'tkn', mintSettings, ethers.constants.AddressZero],
  });

  log('Deploying GovernanceToken...');

  const govTokenDeploymentCode = await hre.ethers.provider.getCode(govTokenDeployment.address);
  const govTokenDeploymentCodeId = ethers.utils.keccak256(govTokenDeploymentCode);
  const govTokenDeploymentCodeIdAddress = await codeIndexContract.get(govTokenDeploymentCodeId);
  if (govTokenDeploymentCodeIdAddress === ethers.constants.AddressZero) {
    log('Registering GovernanceToken in CodeIndex...');
    await (await codeIndexContract.register(govTokenDeployment.address)).wait(1);
  } else {
    log('GovernanceToken already registered in CodeIndex');
  }

  const pc = poseidonContract;
  const ph5 = await deploy('Poseidon5', {
    from: deployer,
    contract: { abi: pc.generateABI(5), bytecode: pc.createCode(5) },
  });

  const ph6 = await deploy('Poseidon6', {
    from: deployer,
    contract: { abi: pc.generateABI(6), bytecode: pc.createCode(6) },
  });

  const ph2 = await deploy('Poseidon2', {
    from: deployer,
    contract: { abi: pc.generateABI(2), bytecode: pc.createCode(2) },
  });

  const rankifyToken = await deployments.get('Rankify');
  const proposalIntegrity18Groth16VerifierDeployment = await deployments.get('ProposalsIntegrity15Groth16Verifier');
  const result = await deploy('MAODistribution', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [
      _trustedForwarder,
      rankifyToken.address,
      DAO,
      [proposalIntegrity18Groth16VerifierDeployment.address, ph5.address, ph6.address, ph2.address],
      rankTokenCodeId,
      arguableVotingTournamentCodeId,
      accessManagerId,
      govTokenDeploymentCodeId,
      _distributionName, // These could be other, currently duplicates with dependency, good as long as not used
      _distributionVersion,
      constantParams.RInstance_MIN_PLAYERS,
    ],
  });

  log('Deploying MAODistribution...');

  const MaoDistrCode = await hre.ethers.provider.getCode(result.address);
  const MaoDistrCodeId = ethers.utils.keccak256(MaoDistrCode);
  const MaoDistrCodeIdAddress = await codeIndexContract.get(MaoDistrCodeId);
  if (MaoDistrCodeIdAddress === ethers.constants.AddressZero) {
    log('Registering MAODistribution in CodeIndex...');
    await (await codeIndexContract.register(result.address)).wait(1);
  } else {
    log('MAODistribution already registered in CodeIndex');
  }

  log('MAO deployment completed successfully!');

  return;
};

export default func;
func.dependencies = ['ERC7744', 'sacm', 'distributor', 'rankify', 'verifiers'];
func.tags = ['MAO'];
