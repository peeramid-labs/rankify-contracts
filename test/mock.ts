/* global  ethers */

import { deployments, ethers } from 'hardhat';

import { expect } from 'chai';
import { RankifyInstanceEventMock } from '../types';

const setupTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers: _eth }, options) => {
  await deployments.fixture(['mockups']);
  const c = await deployments.get('RankifyInstanceEventMock');
  return (await ethers.getContractAt(c.abi, c.address)) as RankifyInstanceEventMock;
});

describe('DiamondTest', async function () {
  let contract: any;
  beforeEach(async function () {
    contract = await setupTest();
  });
  it('emits fire all events', async () => {
    console.log(contract.methods);
    await expect(contract.fireAll()).to.emit(contract, 'GameOver');
  });
});
