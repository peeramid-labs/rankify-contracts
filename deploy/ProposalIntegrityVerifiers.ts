import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { ethers } from 'hardhat';
import ERC7744Abi from '@peeramid-labs/eds/abi/src/ERC7744.sol/ERC7744.json';
import { ERC7744 } from '@peeramid-labs/eds/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const proposalIntegrity15Groth16VerifierDeployment = await deploy('ProposalsIntegrity15Groth16Verifier', {
    from: deployer,
    args: [],
    skipIfAlreadyDeployed: true,
  });

  const codeIndexContract = (await hre.ethers.getContractAt(
    ERC7744Abi,
    '0xC0dE1D2F7662c63796E544B2647b2A94EE658E07',
  )) as ERC7744;
  const code = await hre.ethers.provider.getCode(proposalIntegrity15Groth16VerifierDeployment.address);
  const codeId = ethers.utils.keccak256(code);
  const registerAddress = await codeIndexContract.get(codeId);
  if (registerAddress == ethers.constants.AddressZero) {
    if (process.env.NODE_ENV !== 'TEST') {
      console.warn(
        'registering contract',
        registerAddress,
        proposalIntegrity15Groth16VerifierDeployment.address,
        codeId,
      );
    }
    await codeIndexContract.register(proposalIntegrity15Groth16VerifierDeployment.address);
  }
};

export default func;
func.dependencies = ['ERC7744'];
func.tags = ['verifiers'];
