import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { Rankify } from '../types';
import { ethers } from 'hardhat';
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  const { deployer, owner } = await getNamedAccounts();
  const tokenArtifact = await deployments.getArtifact('Rankify');
  const deployment = await deploy('Rankify', {
    contract: tokenArtifact,
    from: deployer,
    args: [owner],
    skipIfAlreadyDeployed: true,
  });

  try {
    const rankifyContract = (await ethers.getContractAt(deployment.abi, deployment.address)) as Rankify;
    const signer = await ethers.getSigner(owner);
    // 100,000,000 as we are using 9 decimals precision
    await rankifyContract.connect(signer).mint(owner, ethers.utils.parseUnits('1', 17));
  } catch (error) {
    console.log('Minting failed');
    console.log('This could happen if token was already deployed');
  }
};
export default func;
func.tags = ['rankify'];
