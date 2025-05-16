import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import aes from 'crypto-js/aes';
import { Fellowship, Thread, IThread } from '../types';
import cryptoJs from 'crypto-js';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumberish, BytesLike, TypedDataField, BigNumber, constants, utils, Wallet, ethers } from 'ethers';
// @ts-ignore
import { assert } from 'console';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDiscussionForTurn } from './discussionTopics';
import { buildPoseidon } from 'circomlibjs';
import { AdrSetupResult } from './setupMockEnvironment';
import { SignerIdentity } from './setupMockEnvironment';
import { IRankifyInstance } from '../types/src/facets/RankifyInstanceMainFacet';
import { log } from './utils';
import { PrivateProposalsIntegrity15Groth16, ProofProposalsIntegrity15Groth16 } from '@zkit';
import * as fs from 'fs';
import * as path from 'path';
import { keccak256 } from 'ethers/lib/utils';
import { getSharedSecret } from '@noble/secp256k1';
// Derives a private key from the signer's private key, gameId, turn, and contract address
export const privateKeyDerivationFunction = ({
  chainId,
  privateKey,
  turn,
  contractAddress,
  scope = 'default',
}: {
  chainId: BigNumberish;
  privateKey: string;
  turn: BigNumberish;
  contractAddress: string;
  scope?: 'default' | 'turnSalt';
}) => {
  log(`Deriving private key for scope: ${scope}`, 3);
  log(
    {
      chainId: chainId,
      privateKey,
      turn,
      contractAddress,
      scope: ethers.utils.solidityPack(['string'], [scope]),
    },
    3,
  );
  const derivedPrivateKey = keccak256(
    ethers.utils.solidityPack(
      ['bytes32', 'uint256', 'uint256', 'address', 'uint256', 'bytes32'],
      [privateKey, turn, contractAddress, chainId, ethers.utils.solidityKeccak256(['string'], [scope])],
    ),
  );
  log(`Derived private key: ${derivedPrivateKey}`, 3);
  return derivedPrivateKey;
};

export const sharedSigner = ({
  publicKey,
  signer,
  turn,
  contractAddress,
  chainId,
}: {
  publicKey: string;
  signer: Wallet;
  turn: BigNumberish;
  contractAddress: string;
  chainId: string;
}) => {
  log(`Signing key: ${signer.privateKey}, public key: ${publicKey}`, 3);
  const signingKey = new ethers.utils.SigningKey(signer.privateKey);
  log(`signingKey.computeSharedSecret(publicKey): ${signingKey.computeSharedSecret(publicKey)}`, 3);
  const privKeyHex = signer.privateKey.startsWith('0x') ? signer.privateKey.slice(2) : signer.privateKey;
  const pubKeyHex = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
  const sharedKey = keccak256(getSharedSecret(privKeyHex, pubKeyHex, true));
  log(`Shared key: ${sharedKey}`, 3);
  const derivedPrivateKey = privateKeyDerivationFunction({
    privateKey: sharedKey,
    turn,
    contractAddress,
    chainId,
  });
  return derivedPrivateKey;
};

/**
 * Returns a shared signer for a game
 * @param publicKey - Public key of the player
 * @param gameMaster - Game master
 * @param turn - Turn number
 * @param contractAddress - Address of the contract
 * @param chainId - Chain ID
 * @returns Shared signer
 */
export const sharedGameKeySigner = async ({
  publicKey,
  gameMaster,
  turn,
  contractAddress,
  chainId,
}: {
  publicKey: string;
  gameMaster: Wallet;
  turn: BigNumberish;
  contractAddress: string;
  chainId: string;
}) => {
  return sharedSigner({
    publicKey,
    signer: new ethers.Wallet(
      await gameKey({
        contractAddress,
        gameMaster,
      }),
    ),
    turn,
    contractAddress,
    chainId,
  });
};

/**
 * Returns the game key for a game
 * @param contractAddress - Address of the contract
 * @param gameMaster - Game master
 * @returns Game key
 */
export const gameKey = async ({
  contractAddress,
  gameMaster,
}: {
  contractAddress: string;
  gameMaster: Wallet;
}): Promise<string> => {
  const message = ethers.utils.solidityPack(['address', 'string'], [contractAddress, 'gameKey']);
  log(`Signing message: ${message}`, 3);
  const gameKey = await gameMaster.signMessage(message).then(sig => keccak256(sig));
  log(`Game key: ${gameKey}`, 3);
  return gameKey;
};

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
  turn,
  verifierAddress,
  chainId,
  gm,
}: {
  numActive: number;
  proposals: bigint[];
  commitmentRandomnesses: bigint[];
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
  turn,
  verifierAddress,
  chainId,
  gm,
  size = 15,
  proposals,
  hre,
}: {
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
    turn: Number(turn) - 1,
    verifierAddress,
    chainId,
    gm,
    size,
  });

  const inputs = await createInputs({
    numActive: size,
    proposals: proposals.map(proposal => proposal.proposalValue),
    commitmentRandomnesses: proposals.map(proposal => proposal.randomnessValue),
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
  turn,
  verifierAddress,
  chainId,
  gm,
}: {
  turn: BigNumberish;
  verifierAddress: string;
  chainId: BigNumberish;
  gm: Wallet;
}): Promise<BigNumberish> => {
  const _gameKey = await gameKey({ contractAddress: verifierAddress, gameMaster: gm });

  const seed = privateKeyDerivationFunction({
    privateKey: _gameKey,
    turn,
    contractAddress: verifierAddress,
    chainId: chainId.toString(),
    scope: 'turnSalt',
  });
  return ethers.BigNumber.from(seed);
};

/**
 * Generates a deterministic permutation for a specific game turn
 * @param turn - Turn number
 * @param size - Size of the permutation
 * @param verifierAddress - Address of the verifier
 * @returns The generated permutation, secret, and commitment
 */
export const getPermutation = async ({
  turn,
  size,
  verifierAddress,
  chainId,
  gm,
}: {
  turn: BigNumberish;
  size: number;
  verifierAddress: string;
  chainId: BigNumberish;
  gm: Wallet;
}) => {
  const maxSize = 15;
  const turnSalt = await getTurnSalt({ turn, verifierAddress, chainId, gm });
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
  turn,
  verifierAddress,
  chainId,
  gm,
  size = 15,
}: {
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

  const { permutation, turnSalt: secret } = await getPermutation({ turn, verifierAddress, chainId, gm, size });

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

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString();
};

/**
 * Represents a signer's identity in the game
 */

/**
 * Result of setting up addresses for testing/deployment
 * Contains all player, admin and special role identities
 */

export interface MockVote {
  vote: BigNumberish[];
  ballotHash: string;
  ballot: {
    vote: BigNumberish[];
    salt: string;
  };
  ballotId: string;
  gmSignature: string;
  voterSignature: string;
}

interface ReferrerMessage {
  referrerAddress: string;
}
interface RegisterMessage {
  name: BytesLike;
  id: BytesLike;
  domainName: BytesLike;
  deadline: BigNumber;
  nonce: BigNumber;
}

interface ProposalParams {
  encryptedProposal: string;
  commitment: BigNumberish;
  proposer: string;
  gmSignature: BytesLike;
  proposerSignature: BytesLike;
}

export interface ProposalSubmission {
  params: ProposalParams;
  proposal: string;
  proposerSignerId?: SignerIdentity;
  proposalValue: bigint;
  randomnessValue: bigint;
}

export interface ProposalsIntegrity {
  newProposals: IThread.BatchProposalRevealStruct;
  permutation: BigNumberish[];
  proposalsNotPermuted: string[];
  nullifier: bigint;
}

interface VoteMessage {
  vote1: BigNumberish;
  vote2: BigNumberish;
  vote3: BigNumberish;

  turn: BigNumberish;
  salt: BytesLike;
}
interface PublicVoteMessage {
  vote1: BytesLike;
  vote2: BytesLike;
  vote3: BytesLike;

  turn: BigNumberish;
}
const VoteTypes = {
  signVote: [
    {
      type: 'uint256',
      name: 'vote1',
    },
    {
      type: 'uint256',
      name: 'vote2',
    },
    {
      type: 'uint256',
      name: 'vote3',
    },
    {
      type: 'uint256',
      name: 'gameId',
    },
    {
      type: 'uint256',
      name: 'turn',
    },
    {
      type: 'bytes32',
      name: 'salt',
    },
  ],
};

const publicVoteTypes = {
  publicSignVote: [
    {
      type: 'uint256',
      name: 'gameId',
    },
    {
      type: 'uint256',
      name: 'turn',
    },
    {
      type: 'uint256',
      name: 'vote1',
    },
    {
      type: 'uint256',
      name: 'vote2',
    },
    {
      type: 'uint256',
      name: 'vote3',
    },
  ],
};

export const constantParams = {
  RANKIFY_INSTANCE_CONTRACT_NAME: 'RANKIFY_INSTANCE_NAME',
  RANKIFY_INSTANCE_CONTRACT_VERSION: '0.0.1',
  RInstance_TIME_PER_TURN: 2500,
  RInstance_MAX_PLAYERS: 6,
  RInstance_MIN_PLAYERS: 5,
  RInstance_MAX_TURNS: 3,
  RInstance_TIME_TO_JOIN: '200',
  RInstance_GAME_PRICE: utils.parseUnits('0.001', 9),
  RInstance_JOIN_GAME_PRICE: utils.parseUnits('0.001', 9),
  RInstance_NUM_WINNERS: 3,
  RInstance_VOTE_CREDITS: 14,
  RInstance_SUBJECT: 'Best Music on youtube',
  PRINCIPAL_TIME_CONSTANT: 3600,
  RInstance_MIN_GAME_TIME: 360,
  PRINCIPAL_COST: utils.parseUnits('1', 9),
};
class ThreatAgent {
  hre: HardhatRuntimeEnvironment;
  maxSize: number;
  adr: AdrSetupResult;
  votersAddresses: string[] = [];
  gameMaster: Wallet;
  fellowship: Fellowship;
  thread: Thread;
  publicKeys: Record<string, string> = {};
  constructor(hre: HardhatRuntimeEnvironment, gm: Wallet, adr: AdrSetupResult, fellowship: Fellowship, thread: Thread) {
    log('Initializing ThreatAgent');
    this.maxSize = 15;
    this.hre = hre;
    this.adr = adr;
    this.fellowship = fellowship;
    this.gameMaster = gm;
    this.thread = thread;
    this.mockProposalSecrets = this.mockProposalSecrets.bind(this);
    this.mockProposals = this.mockProposals.bind(this);
    this.mockVotes = this.mockVotes.bind(this);
    this.attestVote = this.attestVote.bind(this);
    this.getPlayers = this.getPlayers.bind(this);
    this.getCreateGameParams = this.getCreateGameParams.bind(this);
    this.getPlayerVoteSalt = this.getPlayerVoteSalt.bind(this);
    log('ThreatAgent initialized');
  }

  baseFee = 1 * 10 ** 18;

  /**
   * Game settings and configuration values
   */
  RInstanceSettings = () => ({
    RInstance_TIME_PER_TURN: constantParams.RInstance_TIME_PER_TURN,
    RInstance_MAX_PLAYERS: constantParams.RInstance_MAX_PLAYERS,
    RInstance_MIN_PLAYERS: constantParams.RInstance_MIN_PLAYERS,
    RInstance_MAX_TURNS: constantParams.RInstance_MAX_TURNS,
    RInstance_TIME_TO_JOIN: constantParams.RInstance_TIME_TO_JOIN,
    RInstance_GAME_PRICE: constantParams.RInstance_GAME_PRICE,
    RInstance_JOIN_GAME_PRICE: constantParams.RInstance_JOIN_GAME_PRICE,
    RInstance_NUM_WINNERS: constantParams.RInstance_NUM_WINNERS,
    RInstance_VOTE_CREDITS: constantParams.RInstance_VOTE_CREDITS,
    RInstance_SUBJECT: constantParams.RInstance_SUBJECT,
    PRINCIPAL_TIME_CONSTANT: constantParams.PRINCIPAL_TIME_CONSTANT,
    RInstance_MIN_GAME_TIME: constantParams.RInstance_MIN_GAME_TIME,
    PRINCIPAL_COST: constantParams.PRINCIPAL_COST,
  });

  getCreateGameParams = (gameId: BigNumberish, gameMaster?: Wallet): IRankifyInstance.NewGameParamsInputStruct => ({
    metadata: 'default metadata',
    gameMaster: gameMaster?.address ?? this.adr.gameMaster1.address,
    gameRank: gameId,
    maxPlayerCnt: constantParams.RInstance_MAX_PLAYERS,
    minPlayerCnt: constantParams.RInstance_MIN_PLAYERS,
    timePerTurn: constantParams.RInstance_TIME_PER_TURN,
    timeToJoin: constantParams.RInstance_TIME_TO_JOIN,
    nTurns: constantParams.RInstance_MAX_TURNS,
    voteCredits: constantParams.RInstance_VOTE_CREDITS,
    minGameTime: constantParams.RInstance_MIN_GAME_TIME,
  });

  /**
   * Mines a specified number of blocks for testing purposes
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

  /**
   * Signs a vote message using EIP-712 typed data
   * @param message - The vote message to sign
   * @param verifierAddress - Address of the contract that will verify the signature
   * @param signer - The signer's identity
   * @param hre - Hardhat Runtime Environment
   * @returns The signature
   */
  signVoteMessage = async (
    message: VoteMessage,
    verifierAddress: string,
    signer: SignerIdentity,
    hre: HardhatRuntimeEnvironment,
    eip712: {
      name: string;
      version: string;
    },
  ) => {
    log(`Signing vote message for turn ${message.turn}`, 2);
    const { ethers } = hre;
    let { chainId } = await ethers.provider.getNetwork();

    const domain = {
      name: eip712.name,
      version: eip712.version,
      chainId,
      verifyingContract: verifierAddress,
    };
    const s = await signer.wallet._signTypedData(domain, VoteTypes, {
      ...message,
    });
    log(`Vote signed, turn ${message.turn}`, 2);
    return s;
  };

  /**
   * Signs a public vote message using EIP-712 typed data
   * @param message - The public vote message to sign
   * @param verifierAddress - Address of the contract that will verify the signature
   * @param signer - The signer's identity
   * @param hre - Hardhat Runtime Environment
   * @returns The signature
   */
  signPublicVoteMessage = async ({
    message,
    verifierAddress,
    signer,
    hre,
    eip712,
  }: {
    message: PublicVoteMessage;
    verifierAddress: string;
    signer: SignerIdentity;
    hre: HardhatRuntimeEnvironment;
    eip712: {
      name: string;
      version: string;
    };
  }) => {
    log(`Signing public vote message, turn ${message.turn}`, 2);
    const { ethers } = hre;
    let { chainId } = await ethers.provider.getNetwork();

    const domain = {
      name: eip712.name,
      version: eip712.version,
      chainId,
      verifyingContract: verifierAddress,
    };
    const s = await signer.wallet._signTypedData(domain, publicVoteTypes, {
      ...message,
    });
    log(`Public vote signed, turn ${message.turn}`, 2);
    return s;
  };

  /**
   * Generates a deterministic salt for a player's vote
   * @param params - Parameters including gameId, turn, player address, and other configuration
   * @returns The generated salt as a hex string
   */
  getPlayerVoteSalt = async ({
    turn,
    player,
    verifierAddress,
    chainId,
    gm,
    size,
  }: {
    turn: BigNumberish;
    player: string;
    verifierAddress: string;
    chainId: BigNumberish;
    gm: Wallet;
    size: number;
  }) => {
    log(`Generating vote salt for player ${player}, turn ${turn}`, 3);
    const result = await generateDeterministicPermutation({
      turn: Number(turn) - 1,
      verifierAddress,
      chainId,
      gm,
      size,
    }).then(perm => {
      return utils.solidityKeccak256(['address', 'uint256'], [player, perm.secret]);
    });
    log(`Generated vote salt for player ${player}`, 3);
    return result;
  };

  // Add new function to sign votes
  signVote = async (params: {
    verifierAddress: string;
    voter: string;
    sealedBallotId: string;
    signer: Wallet | SignerWithAddress;
    ballotHash: string;
    isGM: boolean;
    name: string;
    version: string;
  }): Promise<string> => {
    const { voter, isGM, verifierAddress, sealedBallotId, signer, ballotHash, name, version } = params;
    log(`Signing ${isGM ? 'GM' : 'voter'} vote for player ${voter}`, 2);
    const domain = {
      name,
      version,
      chainId: await this.hre.getChainId(),
      verifyingContract: verifierAddress,
    };

    const types: Record<string, TypedDataField[]> = isGM
      ? {
          SubmitVote: [
            { name: 'gameId', type: 'uint256' },
            { name: 'voter', type: 'address' },
            { name: 'sealedBallotId', type: 'string' },
            { name: 'ballotHash', type: 'bytes32' },
          ],
        }
      : {
          AuthorizeVoteSubmission: [
            { name: 'gameId', type: 'uint256' },
            { name: 'sealedBallotId', type: 'string' },
            { name: 'ballotHash', type: 'bytes32' },
          ],
        };

    const value = isGM
      ? {
          voter: voter,
          sealedBallotId: sealedBallotId,
          ballotHash: ballotHash,
        }
      : {
          sealedBallotId: sealedBallotId,
          ballotHash: ballotHash,
        };

    const signature = await signer._signTypedData(domain, types, value);
    log(`Vote signed for player ${voter}`, 2);
    return signature;
  };

  /**
   * Creates and signs a vote for testing purposes
   * @param params - Parameters including voter, game info, and vote configuration
   * @returns A complete mock vote with signatures
   */
  attestVote = async ({
    voter,
    turn,
    vote,
    verifierAddress,
    gameSize,
    name,
    version,
  }: {
    voter: SignerIdentity;
    turn: BigNumberish;
    vote: BigNumberish[];
    verifierAddress: string;
    gameSize: number;
    name: string;
    version: string;
  }): Promise<MockVote> => {
    log(`Attesting vote for player ${voter.wallet.address}, turn ${turn}`, 2);
    const chainId = await this.hre.getChainId();

    const playerSalt = await this.getPlayerVoteSalt({
      turn,
      player: voter.wallet.address,
      verifierAddress,
      chainId,
      gm: this.gameMaster,
      size: gameSize,
    });

    const ballot = {
      vote: vote,
      salt: playerSalt,
    };
    const ballotHash: string = utils.solidityKeccak256(['uint256[]', 'bytes32'], [vote, playerSalt]);
    const playerPubKey = utils.recoverPublicKey(
      utils.hashMessage('mock_message'),
      await voter.wallet.signMessage('mock_message'),
    );

    const { encryptedVote } = await this.encryptVote({
      vote: JSON.stringify(ballot.vote.map(v => v.toString())),
      turn,
      instanceAddress: verifierAddress,
      playerPubKey,
    });

    const gmSignature = await this.signVote({
      verifierAddress,
      voter: voter.wallet.address,
      sealedBallotId: encryptedVote,
      signer: this.gameMaster,
      ballotHash,
      isGM: true,
      name,
      version,
    });
    const voterSignature = await this.signVote({
      verifierAddress,
      voter: voter.wallet.address,
      sealedBallotId: encryptedVote,
      signer: voter.wallet,
      ballotHash,
      isGM: false,
      name,
      version,
    });
    const result = { vote, ballotHash, ballot, ballotId: encryptedVote, gmSignature, voterSignature };
    log(`Vote attested for player ${voter.wallet.address}`, 2);
    return result;
  };

  /**
   * Gets a list of players for testing
   * @param adr - Address setup result containing all identities
   * @param numPlayers - Number of players to return
   * @param offset - Optional offset to start player selection from
   * @returns Array of player identities
   * @throws Error if requested players exceed available players
   */
  getPlayers = (
    adr: AdrSetupResult,
    numPlayers: number,
    offset?: number,
  ): [SignerIdentity, SignerIdentity, ...SignerIdentity[]] => {
    const _offset = offset ?? 0;
    let players: SignerIdentity[] = [];
    for (let i = 0; i < numPlayers; i++) {
      assert(i + _offset < adr.players.length, 'Such player does not exist in adr generation');
      players.push(adr.players[i + _offset]);
    }
    return players as any as [SignerIdentity, SignerIdentity, ...SignerIdentity[]];
  };

  shuffle = (array: any[]) => {
    let currentIndex = array.length,
      randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex > 0) {
      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
  };

  /**
   * Generates mock votes for testing
   * @param params - Parameters including game info and player configuration
   * @returns Array of mock votes
   */
  mockVotes = async ({
    turn,
    verifier,
    players,
    distribution,
  }: {
    turn: BigNumberish;
    verifier: Thread;
    players: SignerIdentity[];
    distribution: 'ftw' | 'semiUniform' | 'equal' | 'zeros';
  }): Promise<MockVote[]> => {
    const chainId = await this.hre.getChainId();
    const eip712 = await verifier.eip712Domain();
    const { permutation } = await generateDeterministicPermutation({
      turn: Number(turn) - 1,
      verifierAddress: verifier.address,
      chainId,
      gm: this.gameMaster,
      size: players.length,
    });
    const votes: MockVote[] = [];
    for (let k = 0; k < players.length; k++) {
      let creditsLeft = constantParams.RInstance_VOTE_CREDITS;
      let playerVote: BigNumberish[] = [];
      if (distribution == 'zeros') {
        playerVote = players.map(() => 0);
      }
      if (distribution == 'ftw') {
        //   this is on smart contract -> votesSorted[proposer][permutation[candidate]] = votes[proposer][candidate];
        //   We need to prepare votes to be permuted so that sorting produces winner at minimal index k (skipping voting for himself)
        const votesToPermute = players.map((proposer, idx) => {
          if (k !== idx) {
            const voteWeight = Math.floor(Math.sqrt(creditsLeft));
            creditsLeft -= voteWeight * voteWeight;
            return voteWeight;
          } else {
            return 0;
          }
        });
        playerVote = this.permuteVotes(votesToPermute, permutation);
      } else if (distribution == 'semiUniform') {
        const votesToDistribute = players.map(() => {
          const voteWeight = Math.floor(Math.sqrt(creditsLeft));
          creditsLeft -= voteWeight * voteWeight;
          return voteWeight;
        });
        let votesDistributed = [];
        do {
          votesDistributed = this.shuffle(votesToDistribute);
        } while (votesDistributed[k] !== 0);
        playerVote = this.permuteVotes(votesDistributed, permutation);
      } else if (distribution == 'equal') {
        // Determine if player is in the first or second half
        const lowSide = k < players.length / 2;
        const middleIndex = Math.floor(players.length / 2);
        const isOddLength = players.length % 2 !== 0;

        // Initialize votes array
        let _votes: number[] = new Array(players.length).fill(0);

        // Skip voting if player is in middle position for odd length arrays
        if (!isOddLength || k !== middleIndex) {
          if (lowSide) {
            // Players in first half vote for second half
            for (let i = players.length - 1; i > 0; i--) {
              if (i !== k) {
                // Don't vote for self
                const voteWeight = Math.floor(Math.sqrt(creditsLeft));
                if (voteWeight > 0) {
                  _votes[i] = voteWeight;
                  creditsLeft -= voteWeight * voteWeight;
                } else {
                  break;
                }
              }
            }
          } else {
            // Players in second half vote for first half (including middle)
            for (let i = 0; i < players.length; i++) {
              if (i !== k) {
                // Don't vote for self
                const voteWeight = Math.floor(Math.sqrt(creditsLeft));
                if (voteWeight > 0) {
                  _votes[i] = voteWeight;
                  creditsLeft -= voteWeight * voteWeight;
                } else {
                  break;
                }
              }
            }
          }
        }

        playerVote = this.permuteVotes(_votes, permutation);
      }

      votes.push(
        await this.attestVote({
          voter: players[k],
          turn,
          verifierAddress: verifier.address,
          vote: playerVote,
          gameSize: players.length,
          name: eip712.name,
          version: eip712.version,
        }),
      );
    }
    return votes;
  };

  permuteVotes = (votes: any[], permutation: number[]) => {
    // now apply permutation to votesToPermute so that
    // on smart contract -> votesSorted[proposer][candidate] = votes[proposer][permutation[candidate]];
    // form [3,2,1,0,0] (skipping K==player)
    const playerVote: any[] = Array.from({ length: votes.length }, () => 0);
    votes.forEach((vote, idx) => {
      playerVote[permutation[idx]] = vote;
    });
    return playerVote;
  };

  proposalTypes = {
    SubmitProposal: [
      { type: 'uint256', name: 'gameId' },
      { type: 'address', name: 'proposer' },
      { type: 'string', name: 'encryptedProposal' },
      { type: 'uint256', name: 'commitment' },
    ],
    AuthorizeProposalSubmission: [
      { type: 'uint256', name: 'gameId' },
      { type: 'string', name: 'encryptedProposal' },
      { type: 'uint256', name: 'commitment' },
    ],
  };

  signProposal = async (
    verifierAddress: string,
    proposer: string,
    encryptedProposal: string,
    commitment: BigNumberish,
    signer: Wallet | SignerWithAddress,
    isGM: boolean,
    eip712: {
      name: string;
      version: string;
    },
  ): Promise<string> => {
    const { chainId } = await this.hre.ethers.provider.getNetwork();

    const domain = {
      name: eip712.name,
      version: eip712.version,
      chainId,
      verifyingContract: verifierAddress,
    };

    // Match the exact types from the Solidity contract
    const type = isGM ? 'SubmitProposal' : 'AuthorizeProposalSubmission';
    const value = isGM
      ? {
          proposer,
          encryptedProposal,
          commitment,
        }
      : {
          encryptedProposal,
          commitment,
        };

    // Generate typed data hash matching Solidity's keccak256(abi.encode(...))
    const typedDataHash = await signer._signTypedData(domain, { [type]: this.proposalTypes[type] }, value);

    return typedDataHash;
  };

  private calculateAndCachePubKey = async (player: SignerIdentity['wallet']) => {
    const playerPubKey = utils.recoverPublicKey(
      utils.hashMessage('mock_message'),
      await player.signMessage('mock_message'),
    );
    this.publicKeys[player.address] = playerPubKey;
    return playerPubKey;
  };

  private getCachedPubKey = (address: string, player?: SignerIdentity['wallet']) => {
    if (!this.publicKeys[address]) {
      if (!player) {
        throw new Error(`Public key for address ${address} not found`);
      }
      return this.calculateAndCachePubKey(player);
    }
    return this.publicKeys[address];
  };

  /**
   * Generates mock proposal secrets for testing
   * @param params - Parameters including game info and proposer details
   * @returns A complete proposal submission with signatures and commitments
   */
  mockProposalSecrets = async ({
    proposer,
    turn,
    verifier,
    proposal = JSON.stringify(getDiscussionForTurn(Number(turn), proposer.id)),
  }: {
    proposer: SignerIdentity;
    turn: BigNumberish;
    verifier: Thread;
    proposal?: string;
  }): Promise<ProposalSubmission> => {
    log(`Creating proposal secrets for player ${proposer.wallet.address}, turn ${turn}`, 2);
    const poseidon = await buildPoseidon();

    const playerPubKey = utils.recoverPublicKey(
      utils.hashMessage(proposal),
      await proposer.wallet.signMessage(proposal),
    );
    assert(utils.computeAddress(playerPubKey) === proposer.wallet.address, 'Proposer public key does not match');

    this.publicKeys[proposer.wallet.address] = playerPubKey;
    const { encryptedProposal, sharedKey } = await this.encryptProposal({
      proposal,
      turn,
      instanceAddress: verifier.address,
      playerPubKey,
    });
    // Convert proposal to numeric value using keccak256
    const proposalValue = BigInt(utils.solidityKeccak256(['string'], [proposal]));
    const randomnessValue = BigInt(utils.solidityKeccak256(['string'], [sharedKey]));

    // Calculate commitment using poseidon
    const hash = poseidon([proposalValue, randomnessValue]);
    const poseidonCommitment = BigInt(poseidon.F.toObject(hash));
    const eip712 = await verifier.eip712Domain();
    // Get both GM and proposer signatures
    const gmSignature = await this.signProposal(
      verifier.address,
      proposer.wallet.address,
      encryptedProposal,
      poseidonCommitment,
      this.gameMaster,
      true,
      {
        name: eip712.name,
        version: eip712.version,
      },
    );

    const proposerSignature = await this.signProposal(
      verifier.address,
      proposer.wallet.address,
      encryptedProposal,
      poseidonCommitment,
      proposer.wallet,
      false,
      {
        name: eip712.name,
        version: eip712.version,
      },
    );

    const params: ProposalParams = {
      encryptedProposal,
      commitment: poseidonCommitment,
      proposer: proposer.wallet.address,
      gmSignature,
      proposerSignature,
    };

    log(`Generated proposal secrets with commitment ${poseidonCommitment}`, 2);
    return {
      params,
      proposal,
      proposerSignerId: proposer,
      proposalValue,
      randomnessValue,
    };
  };

  /**
   * Gets proposal integrity data for testing
   * @param params - Parameters including game info and proposal data
   * @returns Proposal integrity information including permutations and proofs
   */
  async getProposalsIntegrity({
    players,
    turn,
    idlers,
    proposalSubmissionData,
  }: {
    players: SignerIdentity[];

    turn: BigNumberish;
    idlers?: number[];
    proposalSubmissionData?: ProposalSubmission[];
  }): Promise<ProposalsIntegrity> {
    log(
      `Generating proposals integrity, turn ${turn} with ${players.length} players. Proposal data was ${
        proposalSubmissionData ? 'in' : 'not in'
      } args`,
      2,
    );
    const proposals =
      proposalSubmissionData ||
      (await this.mockProposals({
        players,
        turn: Number(turn),
        idlers,
      }));

    const { commitment, nullifier, permutation, permutedProposals, a, b, c } = await generateEndTurnIntegrity({
      turn,
      verifierAddress: this.thread.address,
      chainId: await this.hre.getChainId(),
      size: players.length,
      proposals,
      gm: this.gameMaster,
      hre: this.hre,
    });

    log(`Generated proposals integrity with commitment ${commitment}`, 2);
    return {
      newProposals: {
        a: a as [BigNumberish, BigNumberish],
        b: b as [[BigNumberish, BigNumberish], [BigNumberish, BigNumberish]],
        c: c as [BigNumberish, BigNumberish],
        proposals: permutedProposals,
        permutationCommitment: commitment,
      },
      permutation,
      proposalsNotPermuted: proposals.map(proposal => proposal.proposal),
      nullifier,
    };
  }

  joinTypes = {
    AttestJoiningGame: [
      { type: 'address', name: 'participant' },
      { type: 'bytes32', name: 'gmCommitment' },
      { type: 'uint256', name: 'deadline' },
      { type: 'bytes32', name: 'participantPubKeyHash' },
    ],
  };
  /**
   * Signs a message for joining a game
   * @param hre - Hardhat Runtime Environment
   * @param verifier - Address of the contract that will verify the signature
   * @param participant - Address of the participant joining
   * @param signer - The signer's identity
   * @returns Object containing signature and hidden salt
   */
  signJoiningGame = async ({ participant, signer }: { participant: Wallet | SignerWithAddress; signer: Wallet }) => {
    const { ethers } = this.hre;
    const eip712 = await this.thread.eip712Domain();
    let { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: eip712.name,
      version: eip712.version,
      chainId,
      verifyingContract: this.thread.address,
    };
    const gmCommitment = ethers.utils.formatBytes32String('0x123131231311'); // Pad to 32 bytes
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 100000);
    const participantPubKey = utils.recoverPublicKey(
      utils.hashMessage(participant.address),
      await participant.signMessage(participant.address),
    );

    const signature = await signer._signTypedData(domain, this.joinTypes, {
      participant: participant.address,
      gmCommitment, // Hash the padded value
      deadline,
      participantPubKeyHash: utils.solidityKeccak256(['string'], [participantPubKey]),
    });
    return { signature, gmCommitment, deadline, participant, participantPubKey: participantPubKey };
  };

  async endTurn({
    idlers,
    votes,
    proposals,
  }: {
    idlers?: number[];
    votes?: MockVote[];
    proposals?: ProposalSubmission[];
  }) {
    log(`Ending turn `, 2);
    const turn = await this.thread.getTurn();
    const players = await this.thread.getParticipants();
    log(`Current turn: ${turn}, Players count: ${players.length}`, 2);

    const { newProposals, permutation, nullifier } = await this.getProposalsIntegrity({
      players: this.getPlayers(this.adr, players.length),
      turn: Number(turn),
      idlers,
      proposalSubmissionData: proposals,
    });
    const v = (
      votes ?? (await this.mockValidVotes(this.getPlayers(this.adr, players.length), turn.eq(1) ? false : true, 'ftw'))
    ).map(vote => {
      return vote.vote;
    });
    log(
      JSON.stringify(
        {
          votes: v,
          newProposals,
          permutation,
          nullifier,
        },
        null,
        2,
      ),
    );
    const tx = await this.thread
      .connect(this.gameMaster)
      .endTurn(v, newProposals, permutation, nullifier)
      .then(r => r.wait(1));
    log(tx, 3);
  }

  public async runToTheEnd(distribution: 'ftw' | 'semiUniform' | 'equal' = 'ftw') {
    log(`Running to the end with distribution ${distribution}`, 2);
    let lastVotes: MockVote[] = [];
    let isGameOver = await this.thread.isOver();

    while (!isGameOver) {
      log(`turn: ${await this.thread.getTurn()}`, 2);
      await this.makeTurn({ distribution });

      // const shuffleSalt = await getTestShuffleSalt(gameId, turn, gameMaster);

      isGameOver = await this.thread.isOver();
    }
    const winner = await this.thread.winner();
    if (distribution == 'ftw') {
      const players = await this.thread.getParticipants();
      assert(winner == players[0], 'winner is not the first player');
    }
    log(`ended. Winner: ${winner}`, 2);
    return {
      winner,
      lastVotes,
    };
  }

  endWithIntegrity = async ({
    players,
    proposals,
    votes,
    gm,
    idlers,
  }: {
    players: [SignerIdentity, SignerIdentity, ...SignerIdentity[]];
    proposals?: ProposalSubmission[];
    votes: BigNumberish[][];
    gm: Wallet;
    idlers?: number[];
  }) => {
    let turn = await this.thread.getTurn();
    if (turn.eq(0) && process.env.NODE_ENV == 'TEST') {
      turn = ethers.BigNumber.from(2); // Just for testing
    }
    const { newProposals, permutation, nullifier } = await this.getProposalsIntegrity({
      players,
      turn,
      proposalSubmissionData: proposals,
      idlers,
    });
    return this.thread.connect(gm).endTurn(votes, newProposals, permutation, nullifier);
  };

  async mockProposals({
    players,
    submitNow,
    idlers,
    turn,
  }: {
    players: SignerIdentity[];
    submitNow?: boolean;
    idlers?: number[];
    turn?: number;
  }): Promise<ProposalSubmission[]> {
    const _turn = turn ?? (await this.thread.getTurn()).toNumber();
    log(`Mocking proposals, turn ${_turn}`, 2);

    const proposals: ProposalSubmission[] = [];

    for (let i = 0; i < this.maxSize; i++) {
      let proposal: ProposalSubmission;
      if (i < players.length && !idlers?.includes(i)) {
        proposal = await this.mockProposalSecrets({
          proposer: players[i],
          turn: _turn,
          verifier: this.thread,
        });
      } else {
        proposal = {
          params: {
            encryptedProposal: '0x',
            commitment: 0,
            proposer: constants.AddressZero,
            gmSignature: '0x',
            proposerSignature: '0x',
          },
          proposal: '',
          proposalValue: 0n,
          randomnessValue: 0n,
        };
      }
      proposals.push(proposal);
      log(`Proposal ${i} secrets data`, 3);
      log(proposal, 3);
    }

    if (submitNow) {
      log(`Submitting ${players.length - (idlers?.length ?? 0)} proposals`, 2);
      for (let i = 0; i < players.length; i++) {
        if (!idlers?.includes(i)) {
          const proposedFilter = this.thread.filters.ProposalSubmitted(await this.thread.getTurn());
          const proposed = await this.thread.queryFilter(proposedFilter);
          const alreadyExistingProposal = proposed.find(evt => evt.args.proposer === players[i].wallet.address);
          if (!alreadyExistingProposal) {
            log(`Submitting proposal for player ${players[i].wallet.address}`, 2);
            await this.thread.connect(this.gameMaster).submitProposal(proposals[i].params);
          } else {
            log(`Player ${players[i].wallet.address} already proposed! Replacing mock with real one`, 2);
            proposals[i].params.encryptedProposal = alreadyExistingProposal.args.encryptedProposal;
            proposals[i].params.commitment = alreadyExistingProposal.args.commitment;
            proposals[i].params.proposer = alreadyExistingProposal.args.proposer;
            proposals[i].params.gmSignature = alreadyExistingProposal.args.gmSignature;
            proposals[i].params.proposerSignature = alreadyExistingProposal.args.proposerSignature;

            try {
              const decryptedProposal = await this.decryptProposal({
                proposal: alreadyExistingProposal.args.encryptedProposal,
                playerPubKey: await this.getCachedPubKey(players[i].wallet.address),
                instanceAddress: this.thread.address,
                signer: this.gameMaster,
                turn: await this.thread.getTurn(),
              });
              log(`decryptedProposal`, 3);
              log(decryptedProposal, 3);
              const decrypted = decryptedProposal.startsWith('ipfs://')
                ? this.decryptProposal
                : (JSON.parse(decryptedProposal) as { title: string; body: string });
              const turn = await this.thread.getTurn();
              const proposalParams = await this.mockProposalSecrets({
                proposer: players[i],
                turn,
                verifier: this.thread,
                proposal: decryptedProposal.startsWith('ipfs://') ? decryptedProposal : JSON.stringify(decrypted),
              });
              proposals[i].proposal = proposalParams.proposal;
              proposals[i].proposalValue = proposalParams.proposalValue;
              proposals[i].randomnessValue = proposalParams.randomnessValue;
              log(`proposal parameters`, 3);
              log(proposals[i], 3);
            } catch (e) {
              console.error('MockProposals: Failed to decrypt already existing proposal.', e);
            }
          }
        }
      }
    }
    return proposals;
  }

  async runToLastTurn(
    distribution?: 'ftw' | 'semiUniform' | 'equal',
  ): Promise<{ lastVotes: MockVote[]; lastProposals: ProposalSubmission[] }> {
    let lastVotes: MockVote[] = [];
    let lastProposals: ProposalSubmission[] = [];
    log(`distribution: ${distribution}`, 2);
    while (!(await this.thread.isLastTurn())) {
      const lastVotesAndProposals = await this.makeTurn({
        distribution: distribution ?? 'equal',
      });
      lastVotes = lastVotesAndProposals.lastVotes;
      lastProposals = lastVotesAndProposals.lastProposals;
    }
    const isLastTurn = await this.thread.isLastTurn();
    assert(isLastTurn, 'should be last turn');
    return {
      lastVotes,
      lastProposals,
    };
  }

  async makeTurn({
    distribution = 'ftw',
    increaseFinalTime = 0,
  }: {
    distribution?: 'ftw' | 'semiUniform' | 'equal';
    increaseFinalTime?: number;
  }): Promise<{ lastVotes: MockVote[]; lastProposals: ProposalSubmission[] }> {
    let lastVotes: MockVote[] = [];
    let lastProposals: ProposalSubmission[] = [];
    const gameEnded = await this.thread.isOver();

    log(`Distribution: ${distribution} increaseFinalTime: ${increaseFinalTime} gameEnded: ${gameEnded}`, 2);
    if (!gameEnded) {
      log(`Making move `, 2);
      const turn = await this.thread.getTurn();
      log(`Current turn: ${turn}`, 2);

      const gamePlayerAddresses = await this.thread.getParticipants();
      const playersPossible = this.getPlayers(this.adr, 15);
      const players = [...new Map(playersPossible.map(p => [p.wallet.address, p])).values()].filter(player =>
        gamePlayerAddresses.includes(player.wallet.address),
      );
      // Submit votes if not first turn
      if (turn.toNumber() !== 1) {
        log(`Submitting votes for turn: ${turn}`, 2);
        lastVotes = await this.mockValidVotes(players, true, distribution);
        log(`Votes submitted: ${lastVotes.length}`, 2);
      }

      // Submit proposals
      log('Submitting proposals...', 2);
      lastProposals = await this.mockProposals({
        players,
        submitNow: true,
      });
      log(`Proposals submitted: ${lastProposals.length}`, 2);
      if (distribution == 'equal' && players.length % 2 !== 0) {
        log('Increasing time for equal distribution and odd number of players', 2);
        await time.increase(constantParams.RInstance_TIME_PER_TURN + 1);
      }

      if (increaseFinalTime) {
        log('Increasing time for final turn');
        let isLastTurn = await this.thread.isLastTurn();
        if (isLastTurn) {
          log('Increasing time for final turn (is last turn)');
          await time.increase(increaseFinalTime);
        }
      }
      log(
        {
          idlers: [],
          players,
          proposals: lastProposals,
          votes: lastVotes.map(vote => vote.vote),
          gm: this.gameMaster,
        },
        3,
      );
      await this.endTurn({ votes: lastVotes, proposals: lastProposals });
    }
    return { lastVotes, lastProposals };
  }

  async mockValidVotes(players: SignerIdentity[], submitNow?: boolean, distribution?: 'ftw' | 'semiUniform' | 'equal') {
    let votes: MockVote[] = [];
    let turn = await this.thread.getTurn();
    if (process.env.NODE_ENV == 'TEST' && turn.eq(0)) {
      turn = ethers.BigNumber.from(2); // Just for testing
    }

    log(`Mocking votes, turn ${turn.toString()} with distribution ${distribution}, submitNow: ${submitNow}`, 2);
    log(`node env: ${process.env.NODE_ENV}`, 2);
    if (!turn.eq(1)) {
      votes = await this.mockVotes({
        turn: turn,
        verifier: this.thread,
        players: players,
        distribution: distribution ?? 'semiUniform',
      });
      if (submitNow) {
        this.votersAddresses = players.map(player => player.wallet.address);
        const voted = await this.thread.getVotedArray();
        for (let i = 0; i < players.length; i++) {
          if (!voted[i]) {
            log(`submitting vote for player ${players[i].wallet.address}`, 2);
            log(votes[i].vote, 2);
            if (votes[i].vote.some(v => v != 0)) {
              await this.thread
                .connect(this.gameMaster)
                .submitVote(
                  votes[i].ballotId,
                  players[i].wallet.address,
                  votes[i].gmSignature,
                  votes[i].voterSignature,
                  votes[i].ballotHash,
                );
            } else {
              log(`zero vote for player ${players[i].wallet.address}`, 1);
            }
          } else {
            log(`player ${players[i].wallet.address} already voted! Substituting mock with real one`, 2);
            const playerVotedEvents = await this.thread.queryFilter(
              this.thread.filters.VoteSubmitted(turn, players[i].wallet.address),
            );
            assert(playerVotedEvents.length > 0, 'Player should have voted');
            votes[i].ballotHash = playerVotedEvents[0].args.ballotHash;
            votes[i].gmSignature = playerVotedEvents[0].args.gmSignature;
            votes[i].voterSignature = playerVotedEvents[0].args.voterSignature;
            votes[i].ballotId = playerVotedEvents[0].args.sealedBallotId;
            try {
              votes[i].vote = await this.decryptVote({
                vote: playerVotedEvents[0].args.sealedBallotId,
                playerPubKey: await this.getCachedPubKey(players[i].wallet.address),
                instanceAddress: this.thread.address,
                signer: this.gameMaster,
                turn,
              });
              log(`Decrypted vote:`, 3);
              log(votes[i].vote, 3);
            } catch (e) {
              console.error('Failed to decrypt vote');
            }
          }
        }
      }
      log(`Mocked ${votes.length} votes`, 2);
      return votes;
    } else {
      return [];
    }
  }

  async startGame() {
    log(`Starting game`, 2);
    const currentT = await time.latest();
    const isRegistrationOpen = await this.thread.isRegistrationOpen();
    const state = await this.thread.getContractState();
    if (isRegistrationOpen && !state.hasStarted) {
      await time.setNextBlockTimestamp(currentT + Number(constantParams.RInstance_TIME_TO_JOIN) + 1);
      await this.mineBlocks(constantParams.RInstance_TIME_TO_JOIN + 1);
      await this.thread
        .connect(this.gameMaster)
        .startThread(
          await generateDeterministicPermutation({
            turn: 0,
            verifierAddress: this.thread.address,
            chainId: await this.hre.getChainId(),
            gm: this.gameMaster,
            size: await this.thread.getParticipants().then(players => players.length),
          }).then(perm => perm.commitment),
        )
        .then(tx => tx.wait(1));
    } else {
      log('Game already started, skipping start game');
    }
  }

  async fillParty({
    players,
    shiftTime,
    startGame,
  }: {
    players: SignerIdentity[];

    shiftTime: boolean;
    gameMaster: Wallet;
    startGame?: boolean;
  }) {
    log(`Filling party for game with ${players.length} players`, 2);
    const promises = [];

    for (let i = 0; i < players.length; i++) {
      if (!this.fellowship.address) throw new Error('Fellowship undefined or unemployed');
      const pubKey = utils.recoverPublicKey(
        utils.hashMessage(players[i].wallet.address),
        await players[i].wallet.signMessage(players[i].wallet.address),
      );
      await this.fellowship
        .connect(players[i].wallet)
        .setApprovalForAll(this.thread.address, true)
        .then(tx => tx.wait(1));
      const { signature, gmCommitment, deadline } = await this.signJoiningGame({
        participant: players[i].wallet,
        signer: this.gameMaster,
      });
      promises.push(await this.thread.connect(players[i].wallet).joinThread(signature, gmCommitment, deadline, pubKey));
    }
    if (shiftTime) {
      const currentT = await time.latest();
      await time.setNextBlockTimestamp(currentT + Number(constantParams.RInstance_TIME_TO_JOIN) + 1);
      await this.mineBlocks(1);
    }
    if (startGame && this.gameMaster) {
      log('Starting game after filling party');
      await this.thread
        .connect(this.gameMaster)
        .startThread(
          await generateDeterministicPermutation({
            turn: 0,
            verifierAddress: this.thread.address,
            chainId: await this.hre.getChainId(),
            gm: this.gameMaster,
            size: await this.thread.getParticipants().then(players => players.length),
          }).then(perm => perm.commitment),
        )
        .then(tx => tx.wait(1));
    }
    return Promise.all(promises.map(p => p.wait(1)));
  }

  /**
   * Encrypts a vote
   * @param vote - Vote to encrypt
   * @param turn - Turn number
   * @param instanceAddress - Address of the game instance
   * @param gameId - ID of the game
   * @param playerPubKey - Public key of the player
   * @param gameMaster - Game master
   * @returns Encrypted vote and shared key
   */
  private encryptVote = async ({
    vote,
    turn,
    instanceAddress,
    playerPubKey,
  }: {
    vote: string;
    turn: BigNumberish;
    instanceAddress: string;
    playerPubKey: string;
  }) => {
    log(`Encrypting vote ${vote}...`, 3);
    log({ playerPubKey, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      gameMaster: this.gameMaster,
      turn,
      contractAddress: instanceAddress,
      chainId: await this.hre.getChainId(),
    });
    log(`encrypting vote with shared key (hashed value: ${ethers.utils.keccak256(sharedKey)})`, 3);
    const encryptedVote = aes.encrypt(vote, sharedKey).toString();
    log(`encrypted vote: ${encryptedVote}`, 3);
    return { encryptedVote, sharedKey };
  };

  /**
   * Encrypts a proposal
   * @param proposal - Proposal to encrypt
   * @param turn - Turn number
   * @param instanceAddress - Address of the game instance
   * @param gameId - ID of the game
   * @param proposerPubKey - Public key of the proposer
   * @returns Encrypted proposal and shared key
   */
  private encryptProposal = async ({
    proposal,
    turn,
    instanceAddress,
    playerPubKey,
  }: {
    proposal: string;
    turn: BigNumberish;
    instanceAddress: string;
    playerPubKey: string;
  }) => {
    log(`Encrypting proposal ${proposal}...`, 2);
    log({ playerPubKey, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      turn,
      gameMaster: this.gameMaster,
      contractAddress: instanceAddress,
      chainId: await this.hre.getChainId(),
    });
    log(`Encrypting proposal ${proposal} with shared key (hashed value: ${ethers.utils.keccak256(sharedKey)})`, 3);
    const encryptedProposal = aes.encrypt(proposal, sharedKey).toString();
    log(`Encrypted proposal ${encryptedProposal}`, 3);
    return { encryptedProposal, sharedKey };
  };

  /**
   * Decrypts a proposal
   * @param proposal - Proposal to decrypt
   * @param playerPubKey - Public key of the player
   * @param gameId - ID of the game
   * @param instanceAddress - Address of the game instance
   * @param signer - Signer
   * @param turn - Turn number
   * @returns Decrypted proposal
   */
  private decryptProposal = async ({
    proposal,
    playerPubKey,
    instanceAddress,
    signer,
    turn,
  }: {
    proposal: string;
    playerPubKey: string;
    instanceAddress: string;
    signer: Wallet;
    turn: BigNumberish;
  }): Promise<string> => {
    log(`Decrypting proposal ${proposal}...`, 3);
    log({ playerPubKey, signer, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      gameMaster: signer,
      turn,
      contractAddress: instanceAddress,
      chainId: await this.hre.getChainId(),
    });
    const decrypted = aes.decrypt(proposal, sharedKey).toString(cryptoJs.enc.Utf8);
    if (!decrypted) {
      throw new Error('Failed to decrypt proposal');
    }
    return decrypted;
  };

  /**
   * Decrypts a vote
   * @param vote - Vote to decrypt
   * @param playerPubKey - Public key of the player
   * @param gameId - ID of the game
   * @param instanceAddress - Address of the game instance
   * @param signer - Signer
   * @param turn - Turn number
   * @returns Decrypted vote
   */
  private decryptVote = async ({
    vote,
    playerPubKey,
    instanceAddress,
    signer,
    turn,
  }: {
    vote: string;
    playerPubKey: string;
    instanceAddress: string;
    signer: Wallet;
    turn: BigNumberish;
  }): Promise<BigNumberish[]> => {
    log(`Decrypting vote ${vote}...`, 3);
    log({ playerPubKey, signer, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      gameMaster: signer,
      turn,
      contractAddress: instanceAddress,
      chainId: await this.hre.getChainId(),
    });

    const decrypted = aes.decrypt(vote, sharedKey).toString(cryptoJs.enc.Utf8);
    if (!decrypted) {
      throw new Error('Failed to decrypt vote');
    }

    try {
      const parsed = JSON.parse(decrypted) as string[];
      log(`Decrypted vote:`, 3);
      log(parsed, 3);
      return parsed.map(v => BigInt(v));
    } catch (e: any) {
      throw new Error('Unexpected token');
    }
  };

  async claimReward(player: Wallet) {
    await this.thread.connect(player).claimReward();
  }
}

export default ThreatAgent;
