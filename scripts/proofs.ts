import { buildPoseidon } from 'circomlibjs';
import { BigNumberish, ethers, utils, Wallet } from 'ethers';
import { PrivateProposalsIntegrity15Groth16, ProofProposalsIntegrity15Groth16 } from '@zkit';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import * as fs from 'fs';
import * as path from 'path';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ProposalSubmission } from './EnvironmentSimulator';
import { log } from './utils';
import { gameKey, privateKeyDerivationFunction } from './sharedKey';

// Persistent cache helpers
const CACHE_DIR = '.zkproofs-cache';

function getCacheFilePath(key: string): string {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  return path.join(CACHE_DIR, `${key}.json`);
}

function saveToCache(key: string, proof: ProofProposalsIntegrity15Groth16) {
  try {
    fs.writeFileSync(getCacheFilePath(key), JSON.stringify(proof));
  } catch (error) {
    console.warn('Failed to save proof to cache:', error);
  }
}

function loadFromCache(key: string): ProofProposalsIntegrity15Groth16 | null {
  try {
    const filePath = getCacheFilePath(key);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.warn('Failed to load proof from cache:', error);
  }
  return null;
}

// Helper to create test inputs
export const createInputs = async ({
  numActive,
  proposals,
  commitmentRandomnesses,
  gameId,
  turn,
  verifierAddress,
  chainId,
  gm,
}: {
  numActive: number;
  proposals: bigint[];
  commitmentRandomnesses: bigint[];
  gameId: BigNumberish;
  turn: BigNumberish;
  verifierAddress: string;
  chainId: BigNumberish;
  gm: Wallet;
}): Promise<PrivateProposalsIntegrity15Groth16> => {
  const poseidon = await buildPoseidon();
  const maxSize = 15;

  // Initialize arrays with zeros
  const commitments: bigint[] = Array(maxSize).fill(0n);
  const randomnesses: bigint[] = Array(maxSize).fill(0n);
  const permutedProposals: bigint[] = Array(maxSize).fill(0n);

  // Generate deterministic permutation
  const { permutation, secret, commitment } = await generateDeterministicPermutation({
    gameId,
    turn,
    verifierAddress,
    chainId,
    gm,
    size: numActive,
  });

  // Fill arrays with values
  for (let i = 0; i < maxSize; i++) {
    if (i < numActive) {
      // Active slots
      const proposal = proposals[i];
      const randomness = commitmentRandomnesses[i];
      const hash = poseidon([proposal, randomness]);
      commitments[i] = BigInt(poseidon.F.toObject(hash));
      randomnesses[i] = randomness;
      // Store proposal in permuted position
      permutedProposals[permutation[i]] = proposal;
    } else {
      // Inactive slots
      const hash = poseidon([0n, 0n]);
      commitments[i] = BigInt(poseidon.F.toObject(hash));
      randomnesses[i] = 0n;
      // permutedProposals already 0n
    }
  }

  return {
    numActive: BigInt(numActive),
    commitments,
    permutedProposals,
    permutationCommitment: commitment,
    permutation,
    randomnesses,
    permutationRandomness: secret,
  };
};

export const generateEndTurnIntegrity = async ({
  gameId,
  turn,
  verifierAddress,
  chainId,
  gm,
  size = 15,
  proposals,
  hre,
}: {
  gameId: BigNumberish;
  turn: BigNumberish;
  verifierAddress: string;
  chainId: BigNumberish;
  gm: Wallet;
  size?: number;
  proposals: ProposalSubmission[];
  hre: HardhatRuntimeEnvironment;
}) => {
  const maxSize = 15;

  const { permutation, secret: nullifier } = await generateDeterministicPermutation({
    gameId,
    turn: Number(turn),
    verifierAddress,
    chainId,
    gm,
    size,
  });

  const inputs = await createInputs({
    numActive: size,
    proposals: proposals.map(proposal => proposal.proposalValue),
    commitmentRandomnesses: proposals.map(proposal => proposal.randomnessValue),
    gameId,
    turn,
    verifierAddress,
    chainId: await hre.getChainId(),
    gm,
  });
  log(inputs, 3);

  // Apply permutation to proposals array
  const permutedProposals = [...proposals];
  for (let i = 0; i < maxSize; i++) {
    if (i < size) {
      permutedProposals[inputs.permutation[i]] = proposals[i];
    }
  }

  const circuit = await hre.zkit.getCircuit('ProposalsIntegrity15');
  const inputsKey = ethers.utils.solidityKeccak256(
    ['string'],
    [
      JSON.stringify(inputs) +
        'groth16' +
        gameId.toString() +
        turn.toString() +
        verifierAddress +
        chainId.toString() +
        gm.address +
        size.toString() +
        JSON.stringify(proposals),
    ],
  );

  let cached = loadFromCache(inputsKey);
  if (cached) {
    log(`Loaded proof from cache for inputsKey ${inputsKey}`, 3);
  } else {
    log(`Generating proof for inputsKey ${inputsKey}`, 3);
    const proof = await circuit.generateProof(inputs);
    saveToCache(inputsKey, proof);
    cached = proof;
  }

  const proof = cached;
  if (!proof) {
    throw new Error('Proof not found');
  }
  log('proof:', 3);
  log(JSON.stringify(proof, null, 2), 3);
  const callData = await circuit.generateCalldata(proof);

  return {
    commitment: inputs.permutationCommitment,
    nullifier,
    permutation: permutation.slice(0, size),
    permutedProposals: permutedProposals.map(proposal => proposal.proposal),
    a: callData[0],
    b: callData[1],
    c: callData[2],
  };
};

export const getTurnSalt = async ({
  gameId,
  turn,
  verifierAddress,
  chainId,
  gm,
}: {
  gameId: BigNumberish;
  turn: BigNumberish;
  verifierAddress: string;
  chainId: BigNumberish;
  gm: Wallet;
}): Promise<BigNumberish> => {
  const _gameKey = await gameKey({ gameId, contractAddress: verifierAddress, gameMaster: gm });

  const seed = privateKeyDerivationFunction({
    privateKey: _gameKey,
    turn,
    gameId,
    contractAddress: verifierAddress,
    chainId: chainId.toString(),
    scope: 'turnSalt',
  });
  return ethers.BigNumber.from(seed);
};

/**
 * Generates a deterministic permutation for a specific game turn
 * @param gameId - ID of the game
 * @param turn - Turn number
 * @param size - Size of the permutation
 * @param verifierAddress - Address of the verifier
 * @returns The generated permutation, secret, and commitment
 */
export const getPermutation = async ({
  gameId,
  turn,
  size,
  verifierAddress,
  chainId,
  gm,
}: {
  gameId: BigNumberish;
  turn: BigNumberish;
  size: number;
  verifierAddress: string;
  chainId: BigNumberish;
  gm: Wallet;
}) => {
  const maxSize = 15;
  const turnSalt = await getTurnSalt({ gameId, turn, verifierAddress, chainId, gm });
  // Create deterministic seed from game parameters and GM's signature

  // Use the seed to generate permutation
  const permutation: number[] = Array.from({ length: maxSize }, (_, i) => i);

  // Fisher-Yates shuffle with deterministic randomness
  for (let i = size - 1; i >= 0; i--) {
    // Generate deterministic random number for this position
    const randHash = utils.solidityKeccak256(['uint256', 'uint256'], [turnSalt, i]);
    const rand = BigInt(randHash);
    const j = Number(rand % BigInt(i + 1));

    // Swap elements
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }

  // Ensure inactive slots map to themselves
  for (let i = size; i < maxSize; i++) {
    permutation[i] = i;
  }

  return { permutation, turnSalt };
};

// Generate deterministic permutation based on game parameters and GM's secret
export const generateDeterministicPermutation = async ({
  gameId,
  turn,
  verifierAddress,
  chainId,
  gm,
  size = 15,
}: {
  gameId: BigNumberish;
  turn: BigNumberish;
  verifierAddress: string;
  chainId: BigNumberish;
  gm: Wallet;
  size?: number;
}): Promise<{
  permutation: number[];
  secret: bigint;
  commitment: bigint;
}> => {
  // Create deterministic seed from game parameters and GM's signature

  const { permutation, turnSalt: secret } = await getPermutation({ gameId, turn, verifierAddress, chainId, gm, size });

  // Generate commitment
  const poseidon = await buildPoseidon();
  const PoseidonFirst = BigInt(
    poseidon.F.toObject(poseidon([permutation[0], permutation[1], permutation[2], permutation[3], permutation[4]])),
  );
  const PoseidonSecond = BigInt(
    poseidon.F.toObject(
      poseidon([PoseidonFirst, permutation[5], permutation[6], permutation[7], permutation[8], permutation[9]]),
    ),
  );
  const PoseidonThird = BigInt(
    poseidon.F.toObject(
      poseidon([PoseidonSecond, permutation[10], permutation[11], permutation[12], permutation[13], permutation[14]]),
    ),
  );

  const commitment = BigInt(poseidon.F.toObject(poseidon([PoseidonThird, secret.toString()])));

  return {
    permutation,
    secret: BigInt(secret.toString()),
    commitment,
  };
};
