import { task } from 'hardhat/config';

import addDistribution from '../scripts/addDistribution';
import { getCodeIdFromArtifact } from '../scripts/getCodeId';

task('addDistribution', 'Adds new distribution').setAction(async (_, hre) => {
  const { getNamedAccounts } = hre;
  const { DAO } = await getNamedAccounts();
  const distributorsID = await hre.run('defaultDistributionId');
  if (!distributorsID) {
    throw new Error('Distribution name not found');
  }
  if (typeof distributorsID !== 'string') {
    throw new Error('Distribution name must be a string');
  }
  const oSigner = await hre.ethers.getSigner(DAO);
  const result = await addDistribution(hre)({
    distrId: await getCodeIdFromArtifact(hre)('MAODistribution'),
    signer: oSigner,
    name: distributorsID,
  });
  console.log('Distribution added, Distributors Id:', result.distributorsId);
  return result;
});
