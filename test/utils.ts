import hre, { deployments } from 'hardhat';

import { setupMockedEnvironment } from '../scripts/setupMockEnvironment';

export const addPlayerNameId = (idx: any) => {
  return { name: `player-${idx}`, id: `player-${idx}-id` };
};

export const setupTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers: _eth }, options) => {
  return setupMockedEnvironment(hre);
});
// export const setupTest = () => setupTest();
