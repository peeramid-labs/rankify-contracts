/**
 * Utility functions and types for the Rankify game system
 */

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import aes from 'crypto-js/aes';
import { HttpNetworkHDAccountsConfig } from 'hardhat/types';
import {
  Rankify,
  MockERC1155,
  MockERC20,
  MockERC721,
  RankToken,
  MAODistribution,
  DAODistributor,
  ArguableVotingTournament,
  RankifyInstanceGameMastersFacet,
  RankifyDiamondInstance,
} from '../types';
import { BigNumberish, BytesLike, TypedDataField, BigNumber, constants, utils, Wallet, ethers } from 'ethers';
// @ts-ignore
import { assert } from 'console';
import { Deployment } from 'hardhat-deploy/types';
import { HardhatEthersHelpers } from '@nomiclabs/hardhat-ethers/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDiscussionForTurn } from './discussionTopics';
import { buildPoseidon } from 'circomlibjs';
import { sharedSigner } from './sharedKey';
import { generateDeterministicPermutation, generateEndTurnIntegrity } from './proofs';
import chalk from 'chalk';

/**
 * Calculates the interface ID for a contract by XORing all function selectors
 * @param contractInterface - The contract interface to calculate ID for
 * @returns The calculated interface ID as a BigNumber
 */
export function getInterfaceID(contractInterface: any) {
  let interfaceID: BigNumber = constants.Zero;
  const functions: string[] = Object.keys(contractInterface.functions);
  for (let i = 0; i < functions.length; i++) {
    interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]));
  }

  return interfaceID;
}

/**
 * Transfers ownership of a diamond contract to a new address
 * @param hre - Hardhat Runtime Environment
 * @param signer - The current owner's wallet
 * @param newOwnerAddress - Address of the new owner
 * @param diamondAddress - Address of the diamond contract
 * @throws Error if transfer fails
 */
export async function transferOwnership(
  hre: HardhatRuntimeEnvironment,
  signer: SignerWithAddress | Wallet,
  newOwnerAddress: string,
  diamondAddress: string,
) {
  const ownershipFacet = await hre.ethers.getContractAt('OwnershipFacet', diamondAddress);
  const tx = await ownershipFacet.connect(signer).transferOwnership(newOwnerAddress);
  // console.log("Diamond cut tx: ", tx.hash);
  const receipt = await tx.wait();
  if (!receipt.status) {
    throw Error(`Transfer ownership failed: ${tx.hash}`);
  }
}

/**
 * Safely retrieves an environment variable
 * @param print - If true, masks the value with 'X' characters
 * @param key - The environment variable key to retrieve
 * @returns The environment variable value or masked value
 * @throws Error if environment variable is not set
 */
export function getProcessEnv(print: boolean, key: string) {
  const ret = process.env[key];
  if (!ret) {
    throw new Error(key + ' must be exported in env');
  }
  return print ? 'X'.repeat(ret.length) : ret;
}

export function log(message: any, level: number = 0) {
  const printTimestamp = process.env.VERBOSE_TIMESTAMP;
  const printLevel = Number(process.env.VERBOSE_LEVEL ?? 0);
  const timestampMessage = printTimestamp ? chalk.greenBright(`[${new Date().toISOString()}]`) : '';
  if (process.env.VERBOSE && printLevel >= level) {
    const stack = new Error().stack;
    const stackTrace = stack?.split('\n')[2]?.trim()?.split(' ')[1]?.split('.');
    const caller = stackTrace?.slice(Math.max(0, stackTrace.length - level - 1)).join('.') || 'unknown';
    if (level == 3) console.log(`${timestampMessage}[${chalk.red(caller)}]`, message);
    else if (level == 2) console.log(`${timestampMessage}[${chalk.green(caller)}]`, message);
    else if (level == 1) console.log(`${timestampMessage}[${chalk.yellow(caller)}]`, message);
    else console.log(`${timestampMessage}[${chalk.blue(caller)}]`, message);
  }
}
