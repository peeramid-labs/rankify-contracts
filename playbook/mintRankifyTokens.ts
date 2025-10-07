import { task } from 'hardhat/config';
import { Rankify } from '../types';

task('mintTokensTo', 'Mints tokens to owner')
  .addOptionalParam('address', 'Address to mint tokens to', '0xFE87428cC8C72A3a79eD1cC7e2B5892c088d0af0')
  .setAction(async (taskArgs, hre) => {
    const { getNamedAccounts } = hre;
    const { owner } = await getNamedAccounts();
    const rankifyDeployment = await hre.deployments.get('Rankify');
    const rankifyContract = new hre.ethers.Contract(
      rankifyDeployment.address,
      rankifyDeployment.abi,
      await hre.ethers.getSigner(owner),
    ) as Rankify;

    const tx = await rankifyContract.mint(taskArgs.address, hre.ethers.utils.parseUnits('10000', 9));
    await tx.wait(1);

    const balance = await rankifyContract.balanceOf(taskArgs.address);
    console.log('Balance after minting:', hre.ethers.utils.formatEther(balance));
  });
