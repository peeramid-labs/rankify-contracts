import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DAODistributor } from '../types';
import { Signer } from 'ethers';
import { log } from './utils';

export const addDistribution =
  (hre: HardhatRuntimeEnvironment) =>
  async ({
    name,
    distrId,
    signer,
    initializer,
  }: {
    name?: string;
    distrId: string;
    signer: Signer;
    initializer?: string;
  }) => {
    const { deployments } = hre;
    const DAODistributor = await deployments.get('DAODistributor');
    log('DAODistributor address:' + ' ' + DAODistributor.address);
    const distributorContract = new hre.ethers.Contract(
      DAODistributor.address,
      DAODistributor.abi,
      signer,
    ) as DAODistributor;
    const distributionsLengthBefore = (await distributorContract.getDistributions()).length;
    let receipt;
    let _name = name;
    if (!_name) _name = await hre.run('defaultDistributionId');
    if (!_name) throw new Error('Distribution name not found');
    if (typeof _name !== 'string') throw new Error('Distribution name must be a string');
    receipt = await distributorContract
      .addNamedDistribution(_name, distrId, initializer ?? hre.ethers.constants.AddressZero)
      .then(tx => tx.wait(1));

    const distributorsId = await distributorContract.getDistributions();
    if (distributorsId.length !== distributionsLengthBefore + 1)
      throw new Error(
        `Unexpected distribution id increment: got ${distributorsId.length}, expected ${distributionsLengthBefore + 1}`,
      );
    return {
      receipt,
      distributor: distributorContract,
      distributorsId,
    };
  };

export default addDistribution;
