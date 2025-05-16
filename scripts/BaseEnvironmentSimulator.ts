// @ts-ignore
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { AdrSetupResult } from './setupMockEnvironment';
import { log } from './utils';
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString();
};

class BaseEnvironmentSimulator {
  hre: HardhatRuntimeEnvironment;
  adr: AdrSetupResult;

  //   threads: Thread[];
  constructor(hre: HardhatRuntimeEnvironment, adr: AdrSetupResult) {
    log('Initializing BaseEnvironmentSimulator');
    this.hre = hre;
    this.adr = adr;
    log('BaseEnvironmentSimulator initialized');
  }

  /**
   * Mines a specified number of blocks for testing purposes
   * @param count - Number of blocks to mine
   * @param hre - Hardhat Runtime Environment
   */
  mineBlocks = async (count: any) => {
    log(`Mining ${count} blocks`, 2);
    const { ethers } = this.hre;
    for (let i = 0; i < count; i += 1) {
      await ethers.provider.send('evm_mine', []);
    }
    log(`Finished mining ${count} blocks`, 2);
  };
}

export default BaseEnvironmentSimulator;
