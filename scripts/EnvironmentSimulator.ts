import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import aes from 'crypto-js/aes';

import { Rankify, RankToken } from '../types/artifacts/src/tokens';
import { RankifyDiamondInstance } from '../types/artifacts/hardhat-diamond-abi/HardhatDiamondABI.sol';
import { IRankifyInstance } from '../types/artifacts/src/facets/RankifyInstanceMainFacet';
import { MAODistribution } from '../types/artifacts/src/distributions/MAODistribution';
import { DAODistributor } from '../types/artifacts/src/DAODistributor';
import { ArguableVotingTournament } from '../types/artifacts/src/distributions/ArguableVotingTournament';
import { MockERC1155, MockERC20, MockERC721 } from '../types/artifacts/src/mocks';
import { RankifyInstanceGameMastersFacet } from '../types/artifacts/src/facets/RankifyInstanceGameMastersFacet.sol';
import cryptoJs from 'crypto-js';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumberish, BytesLike, TypedDataField, BigNumber, constants, utils, Wallet, ethers } from 'ethers';
// @ts-ignore
import { assert } from 'console';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { getDiscussionForTurn } from './discussionTopics';
import { buildPoseidon } from 'circomlibjs';
import { sharedGameKeySigner } from './sharedKey';
import { generateDeterministicPermutation, generateEndTurnIntegrity } from './proofs';
import { AdrSetupResult } from './setupMockEnvironment';
import { SignerIdentity } from './setupMockEnvironment';
import { log } from './utils';
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

/**
 * Result of setting up the game environment
 * Contains all contract instances needed for the game
 */
export interface EnvSetupResult {
  rankifyToken: Rankify;
  arguableVotingTournamentDistribution: ArguableVotingTournament;
  rankTokenBase: RankToken;
  mockERC20: MockERC20;
  mockERC1155: MockERC1155;
  mockERC721: MockERC721;
  maoDistribution: MAODistribution;
  distributor: DAODistributor;
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
  gameId: BigNumberish;
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
  newProposals: RankifyInstanceGameMastersFacet.BatchProposalRevealStruct;
  permutation: BigNumberish[];
  proposalsNotPermuted: string[];
  nullifier: bigint;
}

interface VoteMessage {
  vote1: BigNumberish;
  vote2: BigNumberish;
  vote3: BigNumberish;
  gameId: BigNumberish;
  turn: BigNumberish;
  salt: BytesLike;
}
interface PublicVoteMessage {
  vote1: BytesLike;
  vote2: BytesLike;
  vote3: BytesLike;
  gameId: BigNumberish;
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
  RInstance_MIN_PLAYERS: 3,
  RInstance_MAX_TURNS: 3,
  RInstance_TIME_TO_JOIN: '200',
  RInstance_GAME_PRICE: utils.parseUnits('0.001', 9),
  RInstance_JOIN_GAME_PRICE: utils.parseUnits('0.001', 9),
  RInstance_NUM_WINNERS: 3,
  RInstance_VOTE_CREDITS: 5,
  RInstance_SUBJECT: 'Best Music on youtube',
  PRINCIPAL_TIME_CONSTANT: 3600,
  RInstance_MIN_GAME_TIME: 10000,
  PRINCIPAL_COST: utils.parseUnits('1', 9),
};
class EnvironmentSimulator {
  hre: HardhatRuntimeEnvironment;
  env: EnvSetupResult;
  maxSize: number;
  adr: AdrSetupResult;
  votersAddresses: string[] = [];
  rankifyInstance: RankifyDiamondInstance;
  rankToken: RankToken;
  publicKeys: Record<string, string> = {};
  constructor(
    hre: HardhatRuntimeEnvironment,
    env: EnvSetupResult,
    adr: AdrSetupResult,
    rankifyInstance: RankifyDiamondInstance,
    rankToken: RankToken,
  ) {
    log('Initializing EnvironmentSimulator');
    this.maxSize = 15;
    this.hre = hre;
    this.env = env;
    this.adr = adr;
    this.rankifyInstance = rankifyInstance;
    this.rankToken = rankToken;
    this.mockProposalSecrets = this.mockProposalSecrets.bind(this);
    this.mockProposals = this.mockProposals.bind(this);
    this.mockVotes = this.mockVotes.bind(this);
    this.attestVote = this.attestVote.bind(this);
    this.getPlayers = this.getPlayers.bind(this);
    this.getCreateGameParams = this.getCreateGameParams.bind(this);
    this.getPlayerVoteSalt = this.getPlayerVoteSalt.bind(this);
    log('EnvironmentSimulator initialized');
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
    proposingPhaseDuration: constantParams.RInstance_TIME_PER_TURN / 2,
    votePhaseDuration: constantParams.RInstance_TIME_PER_TURN - constantParams.RInstance_TIME_PER_TURN / 2,
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
    log(`Signing vote message for game ${message.gameId}, turn ${message.turn}`, 2);
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
    log(`Vote signed for game ${message.gameId}, turn ${message.turn}`, 2);
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
    log(`Signing public vote message for game ${message.gameId}, turn ${message.turn}`, 2);
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
    log(`Public vote signed for game ${message.gameId}, turn ${message.turn}`, 2);
    return s;
  };

  /**
   * Generates a deterministic salt for a player's vote
   * @param params - Parameters including gameId, turn, player address, and other configuration
   * @returns The generated salt as a hex string
   */
  getPlayerVoteSalt = async ({
    gameId,
    turn,
    player,
    verifierAddress,
    chainId,
    gm,
    size,
  }: {
    gameId: BigNumberish;
    turn: BigNumberish;
    player: string;
    verifierAddress: string;
    chainId: BigNumberish;
    gm: Wallet;
    size: number;
  }) => {
    log(`Generating vote salt for player ${player} in game ${gameId}, turn ${turn}`, 3);
    const result = await generateDeterministicPermutation({
      gameId,
      turn: Number(turn),
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
    gameId: BigNumberish;
    sealedBallotId: string;
    signer: Wallet | SignerWithAddress;
    ballotHash: string;
    isGM: boolean;
    name: string;
    version: string;
  }): Promise<string> => {
    const { voter, gameId, isGM, verifierAddress, sealedBallotId, signer, ballotHash, name, version } = params;
    log(`Signing ${isGM ? 'GM' : 'voter'} vote for player ${voter} in game ${gameId}`, 2);
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
          gameId: BigNumber.from(gameId),
          voter: voter,
          sealedBallotId: sealedBallotId,
          ballotHash: ballotHash,
        }
      : {
          gameId: BigNumber.from(gameId),
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
    gameId,
    turn,
    gm,
    vote,
    verifierAddress,
    gameSize,
    name,
    version,
  }: {
    voter: SignerIdentity;
    gameId: BigNumberish;
    turn: BigNumberish;
    gm: Wallet;
    vote: BigNumberish[];
    verifierAddress: string;
    gameSize: number;
    name: string;
    version: string;
  }): Promise<MockVote> => {
    log(`Attesting vote for player ${voter.wallet.address} in game ${gameId}, turn ${turn}`, 2);
    const chainId = await this.hre.getChainId();

    const playerSalt = await this.getPlayerVoteSalt({
      gameId,
      turn,
      player: voter.wallet.address,
      verifierAddress,
      chainId,
      gm,
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
      gameId,
      playerPubKey,
      gameMaster: gm,
    });

    const gmSignature = await this.signVote({
      verifierAddress,
      voter: voter.wallet.address,
      gameId,
      sealedBallotId: encryptedVote,
      signer: gm,
      ballotHash,
      isGM: true,
      name,
      version,
    });
    const voterSignature = await this.signVote({
      verifierAddress,
      voter: voter.wallet.address,
      gameId,
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
    gm,
    gameId,
    turn,
    verifier,
    players,
    distribution,
    idlers,
    voteHimself,
  }: {
    gameId: BigNumberish;
    turn: BigNumberish;
    gm: Wallet;
    verifier: RankifyDiamondInstance;
    players: SignerIdentity[];
    distribution: 'ftw' | 'semiUniform' | 'equal' | 'zeros';
    idlers?: number[];
    voteHimself?: boolean[];
  }): Promise<MockVote[]> => {
    const chainId = await this.hre.getChainId();
    const eip712 = await verifier.inspectEIP712Hashes();
    const { permutation } = await generateDeterministicPermutation({
      gameId,
      turn: Number(turn),
      verifierAddress: verifier.address,
      chainId,
      gm,
      size: players.length,
    });
    if (voteHimself && voteHimself.length > 0 && distribution !== 'ftw') {
      throw new Error('voteHimself is only supported for ftw distribution');
    }
    const votes: MockVote[] = [];
    for (let k = 0; k < players.length; k++) {
      if (!idlers || !idlers.includes(k)) {
        let creditsLeft = constantParams.RInstance_VOTE_CREDITS;
        let playerVote: BigNumberish[] = [];
        if (distribution == 'zeros') {
          playerVote = players.map(() => 0);
        }
        if (distribution == 'ftw') {
          //   this is on smart contract -> votesSorted[proposer][permutation[candidate]] = votes[proposer][candidate];
          //   We need to prepare votes to be permuted so that sorting produces winner at minimal index k (skipping voting for himself)
          const votesToPermute = players.map((proposer, idx) => {
            if (k !== idx || (voteHimself && voteHimself.length > idx && voteHimself[idx])) {
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
            gameId,
            turn,
            gm,
            verifierAddress: verifier.address,
            vote: playerVote,
            gameSize: players.length,
            name: eip712._NAME,
            version: eip712._VERSION,
          }),
        );
      } else {
        votes.push(
          await this.attestVote({
            voter: players[k],
            gameId,
            turn,
            gm,
            vote: Array(players.length).fill(0) as BigNumberish[],
            verifierAddress: verifier.address,
            gameSize: players.length,
            name: eip712._NAME,
            version: eip712._VERSION,
          }),
        );
      }
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
    gameId: BigNumberish,
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
          gameId,
          proposer,
          encryptedProposal,
          commitment,
        }
      : {
          gameId,
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
    gm,
    proposer,
    gameId,
    turn,
    verifier,
    proposal = JSON.stringify(getDiscussionForTurn(Number(turn), proposer.id)),
  }: {
    gm: Wallet;
    proposer: SignerIdentity;
    gameId: BigNumberish;
    turn: BigNumberish;
    verifier: RankifyDiamondInstance;
    proposal?: string;
  }): Promise<ProposalSubmission> => {
    log(`Creating proposal secrets for player ${proposer.wallet.address} in game ${gameId}, turn ${turn}`, 2);
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
      gameId,
      playerPubKey,
      signer: gm,
    });
    // Convert proposal to numeric value using keccak256
    const proposalValue = BigInt(utils.solidityKeccak256(['string'], [proposal]));
    const randomnessValue = BigInt(utils.solidityKeccak256(['string'], [sharedKey]));

    // Calculate commitment using poseidon
    const hash = poseidon([proposalValue, randomnessValue]);
    const poseidonCommitment = BigInt(poseidon.F.toObject(hash));
    const eip712 = await verifier.inspectEIP712Hashes();
    // Get both GM and proposer signatures
    const gmSignature = await this.signProposal(
      verifier.address,
      proposer.wallet.address,
      gameId,
      encryptedProposal,
      poseidonCommitment,
      gm,
      true,
      {
        name: eip712._NAME,
        version: eip712._VERSION,
      },
    );

    const proposerSignature = await this.signProposal(
      verifier.address,
      proposer.wallet.address,
      gameId,
      encryptedProposal,
      poseidonCommitment,
      proposer.wallet,
      false,
      {
        name: eip712._NAME,
        version: eip712._VERSION,
      },
    );

    const params: ProposalParams = {
      gameId,
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
    gameId,
    turn,
    gm,
    idlers,
    proposalSubmissionData,
  }: {
    players: SignerIdentity[];
    gameId: BigNumberish;
    turn: BigNumberish;
    gm: Wallet;
    idlers?: number[];
    proposalSubmissionData?: ProposalSubmission[];
  }): Promise<ProposalsIntegrity> {
    log(
      `Generating proposals integrity for game ${gameId}, turn ${turn} with ${players.length} players. Proposal data was ${
        proposalSubmissionData ? 'in' : 'not in'
      } args`,
      2,
    );
    const proposals =
      proposalSubmissionData ||
      (await this.mockProposals({
        players,
        gameId,
        turn: Number(turn),
        gameMaster: gm,
        idlers,
      }));

    const { commitment, nullifier, permutation, permutedProposals, a, b, c } = await generateEndTurnIntegrity({
      gameId,
      turn,
      verifierAddress: this.rankifyInstance.address,
      chainId: await this.hre.getChainId(),
      gm,
      size: players.length,
      proposals,
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
      { type: 'uint256', name: 'gameId' },
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
   * @param gameId - ID of the game to join
   * @param signer - The signer's identity
   * @returns Object containing signature and hidden salt
   */
  signJoiningGame = async ({
    gameId,
    participant,
    signer,
  }: {
    gameId: BigNumberish;
    participant: Wallet | SignerWithAddress;
    signer: Wallet;
  }) => {
    const { ethers } = this.hre;
    const eip712 = await this.rankifyInstance.inspectEIP712Hashes();
    let { chainId } = await ethers.provider.getNetwork();
    const domain = {
      name: eip712._NAME,
      version: eip712._VERSION,
      chainId,
      verifyingContract: this.rankifyInstance.address,
    };
    const gmCommitment = ethers.utils.formatBytes32String('0x123131231311'); // Pad to 32 bytes
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 100000);
    const participantPubKey = utils.recoverPublicKey(
      utils.hashMessage(participant.address),
      await participant.signMessage(participant.address),
    );

    const signature = await signer._signTypedData(domain, this.joinTypes, {
      participant: participant.address,
      gameId,
      gmCommitment, // Hash the padded value
      deadline,
      participantPubKeyHash: utils.solidityKeccak256(['string'], [participantPubKey]),
    });
    return { signature, gmCommitment, deadline, participant, participantPubKey: participantPubKey };
  };

  public async createGame({
    minGameTime,
    signer,
    gameMaster,
    gameRank,
    openNow,
    metadata,
    voteCredits = constantParams.RInstance_VOTE_CREDITS,
  }: {
    minGameTime: BigNumberish;
    signer: Wallet | SignerWithAddress;
    gameMaster: string;
    gameRank: BigNumberish;
    openNow?: boolean;
    metadata?: string;
    voteCredits?: BigNumberish;
  }) {
    log(`Creating game with rank ${gameRank} and minGameTime ${minGameTime}`, 2);
    await this.env.rankifyToken
      .connect(signer)
      .approve(this.rankifyInstance.address, this.hre.ethers.constants.MaxUint256)
      .then(r => r.wait(1));
    const expectedGameId = (await this.rankifyInstance.getContractState().then(state => state.numGames)).add(1);
    const params: IRankifyInstance.NewGameParamsInputStruct = {
      metadata: metadata ?? 'test metadata',
      gameMaster: gameMaster,
      gameRank: gameRank,
      maxPlayerCnt: constantParams.RInstance_MAX_PLAYERS,
      minPlayerCnt: constantParams.RInstance_MIN_PLAYERS,
      timePerTurn: constantParams.RInstance_TIME_PER_TURN,
      timeToJoin: constantParams.RInstance_TIME_TO_JOIN,
      nTurns: constantParams.RInstance_MAX_TURNS,
      voteCredits,
      minGameTime: minGameTime,
      proposingPhaseDuration: constantParams.RInstance_TIME_PER_TURN / 2,
      votePhaseDuration: constantParams.RInstance_TIME_PER_TURN - constantParams.RInstance_TIME_PER_TURN / 2,
    };
    await this.rankifyInstance
      .connect(signer)
      .createGame(params)
      .then(r => r.wait(1));
    const gameId = await this.rankifyInstance.getContractState().then(state => state.numGames);
    assert(gameId.eq(expectedGameId), 'Game ID mismatch');
    if (openNow)
      await this.rankifyInstance
        .connect(signer)
        .openRegistration(gameId)
        .then(r => r.wait(1));
    log(`Game created with ID ${gameId}`, 2);
    return gameId;
  }

  async endTurn({
    gameId,
    idlers,
    votes,
    proposals,
  }: {
    gameId: BigNumberish;
    idlers?: number[];
    votes?: MockVote[];
    proposals?: ProposalSubmission[];
  }) {
    log(`Ending turn for game ${gameId}`, 2);
    const turn = await this.rankifyInstance.getTurn(gameId);
    const players = await this.rankifyInstance.getPlayers(gameId);
    log(`Current turn: ${turn}, Players count: ${players.length}`, 2);

    const { newProposals, permutation, nullifier } = await this.getProposalsIntegrity({
      players: this.getPlayers(this.adr, players.length),
      gameId,
      turn: Number(turn),
      gm: this.adr.gameMaster1,
      idlers,
      proposalSubmissionData: proposals,
    });
    log(
      JSON.stringify(
        {
          gameId,
          newProposals,
          permutation,
          nullifier,
        },
        null,
        2,
      ),
    );
    const isProposingStage = await this.rankifyInstance.isProposingStage(gameId);
    if (isProposingStage) {
      const tx = await this.rankifyInstance
        .connect(this.adr.gameMaster1)
        .endProposing(gameId, newProposals)
        .then(r => r.wait(1));
      log(tx, 3);
    }
    const v = (
      votes ??
      (await this.mockValidVotes(this.getPlayers(this.adr, players.length), gameId, this.adr.gameMaster1, true, 'ftw'))
    ).map(vote => {
      return vote.vote;
    });
    log(JSON.stringify({ gameId, v, permutation, nullifier }, null, 2), 3);
    const tx2 = await this.rankifyInstance
      .connect(this.adr.gameMaster1)
      .endVoting(gameId, v, permutation, nullifier)
      .then(r => r.wait(1));
    log(tx2, 3);
  }

  public async runToTheEnd(gameId: BigNumberish, distribution: 'ftw' | 'semiUniform' | 'equal' = 'ftw') {
    log(`Running game ${gameId.toString()} to the end with distribution ${distribution}`, 2);
    let lastVotes: MockVote[] = [];
    let isGameOver = await this.rankifyInstance.isGameOver(gameId);

    while (!isGameOver) {
      log(`Game ${gameId.toString()} turn: ${await this.rankifyInstance.getTurn(gameId)}`, 2);
      await this.makeTurn({ gameId, distribution, increaseFinalTime: true });

      // const shuffleSalt = await getTestShuffleSalt(gameId, turn, gameMaster);

      isGameOver = await this.rankifyInstance.isGameOver(gameId);
    }
    const winner = await this.rankifyInstance['gameWinner(uint256)'](gameId);
    log(`Game ${gameId} ended. Winner: ${winner}`, 2);
    return {
      winner,
      lastVotes,
    };
  }

  endWithIntegrity = async ({
    gameId,
    players,
    proposals,
    votes,
    gm,
    idlers,
    timeAfterProposing,
  }: {
    gameId: BigNumberish;
    players: [SignerIdentity, SignerIdentity, ...SignerIdentity[]];
    proposals?: ProposalSubmission[];
    votes: BigNumberish[][];
    gm: Wallet;
    idlers?: number[];
    timeAfterProposing?: number;
  }) => {
    let turn = await this.rankifyInstance.getTurn(gameId);
    if (turn.eq(0) && process.env.NODE_ENV == 'TEST') {
      turn = ethers.BigNumber.from(2); // Just for testing
    }
    const { newProposals, permutation, nullifier } = await this.getProposalsIntegrity({
      players,
      gameId,
      turn,
      gm: gm,
      proposalSubmissionData: proposals,
      idlers,
    });
    const tx1 = this.rankifyInstance
      .connect(gm)
      .endProposing(gameId, newProposals)
      .then(async r => {
        if (timeAfterProposing) {
          await time.increase(timeAfterProposing);
        }
        const tx2 = this.rankifyInstance.connect(gm).endVoting(gameId, votes, permutation, nullifier);
        return Promise.all([r, tx2]);
      });
    return tx1;
  };

  async mockProposals({
    players,
    gameMaster,
    gameId,
    submitNow,
    idlers,
    turn,
  }: {
    players: SignerIdentity[];
    gameMaster: Wallet;
    gameId: BigNumberish;
    submitNow?: boolean;
    idlers?: number[];
    turn?: number;
  }): Promise<ProposalSubmission[]> {
    const _turn = turn ?? (await this.rankifyInstance.getTurn(gameId)).toNumber();
    log(`Mocking proposals for game ${gameId}, turn ${_turn}`, 2);

    const proposals: ProposalSubmission[] = [];

    for (let i = 0; i < this.maxSize; i++) {
      let proposal: ProposalSubmission;
      if (i < players.length && !idlers?.includes(i)) {
        proposal = await this.mockProposalSecrets({
          gm: gameMaster,
          proposer: players[i],
          gameId,
          turn: _turn,
          verifier: this.rankifyInstance,
        });
      } else {
        proposal = {
          params: {
            gameId,
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
          const proposedFilter = this.rankifyInstance.filters.ProposalSubmitted(
            gameId,
            await this.rankifyInstance.getTurn(gameId),
          );
          const proposed = await this.rankifyInstance.queryFilter(proposedFilter);
          const alreadyExistingProposal = proposed.find(evt => evt.args.proposer === players[i].wallet.address);
          if (!alreadyExistingProposal) {
            log(`Submitting proposal for player ${players[i].wallet.address}`, 2);
            await this.rankifyInstance.connect(gameMaster).submitProposal(proposals[i].params);
          } else {
            log(`Player ${players[i].wallet.address} already proposed! Replacing mock with real one`, 2);
            proposals[i].params.encryptedProposal = alreadyExistingProposal.args.encryptedProposal;
            proposals[i].params.commitment = alreadyExistingProposal.args.commitment;
            proposals[i].params.proposer = alreadyExistingProposal.args.proposer;
            proposals[i].params.gameId = alreadyExistingProposal.args.gameId;
            proposals[i].params.gmSignature = alreadyExistingProposal.args.gmSignature;
            proposals[i].params.proposerSignature = alreadyExistingProposal.args.proposerSignature;

            try {
              const decryptedProposal = await this.decryptProposal({
                proposal: alreadyExistingProposal.args.encryptedProposal,
                playerPubKey: await this.getCachedPubKey(players[i].wallet.address),
                gameId,
                instanceAddress: this.rankifyInstance.address,
                signer: gameMaster,
                turn: await this.rankifyInstance.getTurn(gameId),
              });
              log(`decryptedProposal`, 3);
              log(decryptedProposal, 3);
              const decrypted = decryptedProposal.startsWith('ipfs://')
                ? this.decryptProposal
                : (JSON.parse(decryptedProposal) as { title: string; body: string });
              const turn = await this.rankifyInstance.getTurn(gameId);
              const proposalParams = await this.mockProposalSecrets({
                gm: gameMaster,
                proposer: players[i],
                gameId,
                turn,
                verifier: this.rankifyInstance,
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
    gameId: BigNumberish,
    gm: Wallet,
    distribution?: 'ftw' | 'semiUniform' | 'equal',
  ): Promise<{ lastVotes: MockVote[]; lastProposals: ProposalSubmission[] }> {
    let lastVotes: MockVote[] = [];
    let lastProposals: ProposalSubmission[] = [];
    log(`Game ${gameId.toString()} distribution: ${distribution}`, 2);
    while (!(await this.rankifyInstance.isLastTurn(gameId))) {
      const lastVotesAndProposals = await this.makeTurn({
        gameId,
        distribution: distribution ?? 'equal',
        increaseFinalTime: false,
      });
      lastVotes = lastVotesAndProposals.lastVotes;
      lastProposals = lastVotesAndProposals.lastProposals;
    }
    const isLastTurn = await this.rankifyInstance.isLastTurn(gameId);
    assert(isLastTurn, 'should be last turn');
    return {
      lastVotes,
      lastProposals,
    };
  }

  async makeTurn({
    gameId,
    distribution = 'ftw',
    increaseFinalTime = false,
  }: {
    gameId: BigNumberish;
    distribution?: 'ftw' | 'semiUniform' | 'equal';
    increaseFinalTime?: boolean;
  }): Promise<{ lastVotes: MockVote[]; lastProposals: ProposalSubmission[] }> {
    let lastVotes: MockVote[] = [];
    let lastProposals: ProposalSubmission[] = [];
    const gameEnded = await this.rankifyInstance.isGameOver(gameId);

    log(
      `Game ${gameId} distribution: ${distribution} increaseFinalTime: ${increaseFinalTime} gameEnded: ${gameEnded}`,
      2,
    );
    if (!gameEnded) {
      log(`Making move for game: ${gameId}`, 2);
      const turn = await this.rankifyInstance.getTurn(gameId);
      log(`Current turn: ${turn}`, 2);

      const gamePlayerAddresses = await this.rankifyInstance.getPlayers(gameId);
      const playersPossible = this.getPlayers(this.adr, 15);
      const players = [...new Map(playersPossible.map(p => [p.wallet.address, p])).values()].filter(player =>
        gamePlayerAddresses.includes(player.wallet.address),
      );
      // Submit votes if not first turn

      // Submit proposals
      log('Submitting proposals...', 2);
      lastProposals = await this.mockProposals({
        players,
        gameMaster: this.adr.gameMaster1,
        gameId,
        submitNow: true,
      });

      const proposalsIntegrity = await this.getProposalsIntegrity({
        players,
        gameId,
        turn,
        gm: this.adr.gameMaster1,
        idlers: [],
      });
      await this.rankifyInstance.connect(this.adr.gameMaster1).endProposing(gameId, proposalsIntegrity.newProposals);

      log(`Submitting votes for turn: ${turn}`, 2);
      lastVotes = await this.mockValidVotes(players, gameId, this.adr.gameMaster1, true, distribution);
      log(`Votes submitted: ${lastVotes.length}`, 2);

      log(`Proposals submitted: ${lastProposals.length}`, 2);
      if (distribution == 'equal' && players.length % 2 !== 0) {
        log('Increasing time for equal distribution and odd number of players', 2);
        await time.increase(constantParams.RInstance_TIME_PER_TURN + 1);
      }

      if (increaseFinalTime) {
        log('Increasing time for final turn');
        let isLastTurn = await this.rankifyInstance.isLastTurn(gameId);
        if (isLastTurn) {
          log('Increasing time for final turn (is last turn)');
          const timeToEnd = await this.rankifyInstance.getGameState(gameId).then(state => state.minGameTime);
          await time.increase(timeToEnd.toNumber() + 1);
        }
      }
      log(
        {
          gameId,
          idlers: [],
          players,
          proposals: lastProposals,
          votes: lastVotes.map(vote => vote.vote),
          gm: this.adr.gameMaster1,
        },
        3,
      );
      await this.endTurn({ gameId, votes: lastVotes, proposals: lastProposals });
    }
    return { lastVotes, lastProposals };
  }

  async mockValidVotes(
    players: SignerIdentity[],
    gameId: BigNumberish,
    gm: Wallet,
    submitNow?: boolean,
    distribution?: 'ftw' | 'semiUniform' | 'equal',
    idlers?: number[],
  ) {
    let votes: MockVote[] = [];
    let turn = await this.rankifyInstance.getTurn(gameId);
    if (process.env.NODE_ENV == 'TEST' && turn.eq(0)) {
      turn = ethers.BigNumber.from(2); // Just for testing
    }

    log(
      `Mocking votes for game ${gameId}, turn ${turn.toString()} with distribution ${distribution}, submitNow: ${submitNow}`,
      2,
    );
    log(`node env: ${process.env.NODE_ENV}`, 2);
    votes = await this.mockVotes({
      gameId: gameId,
      turn: turn,
      verifier: this.rankifyInstance,
      players: players,
      gm: gm,
      distribution: distribution ?? 'semiUniform',
      idlers: idlers,
    });
    if (submitNow) {
      this.votersAddresses = players.map(player => player.wallet.address);
      const voted = await this.rankifyInstance.getPlayerVotedArray(gameId);
      for (let i = 0; i < players.length; i++) {
        if (!idlers?.includes(i)) {
          if (!voted[i]) {
            log(`submitting vote for player ${players[i].wallet.address}`, 2);
            log(votes[i].vote, 2);
            if (votes[i].vote.some(v => v != 0)) {
              await this.rankifyInstance
                .connect(gm)
                .submitVote(
                  gameId,
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
            const playerVotedEvents = await this.rankifyInstance.queryFilter(
              this.rankifyInstance.filters.VoteSubmitted(gameId, turn, players[i].wallet.address),
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
                gameId,
                instanceAddress: this.rankifyInstance.address,
                signer: gm,
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
    }
    log(`Mocked ${votes.length} votes`, 2);
    return votes;
  }

  async startGame(gameId: BigNumberish) {
    log(`Starting game ${gameId}`, 2);
    const currentT = await time.latest();
    const isRegistrationOpen = await this.rankifyInstance.isRegistrationOpen(gameId);
    const state = await this.rankifyInstance.getGameState(gameId);
    if (isRegistrationOpen && !state.hasStarted) {
      await time.setNextBlockTimestamp(currentT + Number(constantParams.RInstance_TIME_TO_JOIN) + 1);
      await this.mineBlocks(constantParams.RInstance_TIME_TO_JOIN + 1);
      await this.rankifyInstance.connect(this.adr.gameMaster1).startGame(gameId);
    } else {
      log('Game already started, skipping start game');
    }
  }

  async fillParty({
    players,
    gameId,
    shiftTime,
    gameMaster,
    startGame,
  }: {
    players: SignerIdentity[];
    gameId: BigNumberish;
    shiftTime: boolean;
    gameMaster: Wallet;
    startGame?: boolean;
  }) {
    log(`Filling party for game ${gameId} with ${players.length} players`, 2);
    const promises = [];

    for (let i = 0; i < players.length; i++) {
      const playerInGames = await this.rankifyInstance
        .getPlayersGames(players[i].wallet.address)
        .then(games => games.map(game => game.toNumber()));
      if (playerInGames.length > 0) {
        if (playerInGames.includes(Number(gameId))) {
          console.error('Player already in another game');
          throw new Error('Player already in another game');
        }
      } else {
        if (!this.rankToken.address) throw new Error('Rank token undefined or unemployed');
        const pubKey = utils.recoverPublicKey(
          utils.hashMessage(players[i].wallet.address),
          await players[i].wallet.signMessage(players[i].wallet.address),
        );
        await this.rankToken
          .connect(players[i].wallet)
          .setApprovalForAll(this.rankifyInstance.address, true)
          .then(tx => tx.wait(1));
        const { signature, gmCommitment, deadline } = await this.signJoiningGame({
          gameId,
          participant: players[i].wallet,
          signer: gameMaster,
        });
        promises.push(
          await this.rankifyInstance
            .connect(players[i].wallet)
            .joinGame(gameId, signature, gmCommitment, deadline, pubKey),
        );
      }
    }
    if (shiftTime) {
      const currentT = await time.latest();
      await time.setNextBlockTimestamp(currentT + Number(constantParams.RInstance_TIME_TO_JOIN) + 1);
      await this.mineBlocks(1);
    }
    if (startGame && gameMaster) {
      log('Starting game after filling party');
      await this.rankifyInstance
        .connect(gameMaster)
        .startGame(gameId)
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
    gameId,
    playerPubKey,
    gameMaster,
  }: {
    vote: string;
    turn: BigNumberish;
    instanceAddress: string;
    gameId: BigNumberish;
    playerPubKey: string;
    gameMaster: Wallet;
  }) => {
    log(`Encrypting vote ${vote}...`, 3);
    log({ playerPubKey, gameMaster, gameId, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      gameMaster,
      gameId,
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
    gameId,
    playerPubKey,
    signer,
  }: {
    proposal: string;
    turn: BigNumberish;
    instanceAddress: string;
    gameId: BigNumberish;
    playerPubKey: string;
    signer: Wallet;
  }) => {
    log(`Encrypting proposal ${proposal}...`, 2);
    log({ playerPubKey, signer, gameId, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      gameMaster: signer,
      gameId,
      turn,
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
    gameId,
    instanceAddress,
    signer,
    turn,
  }: {
    proposal: string;
    playerPubKey: string;
    gameId: BigNumberish;
    instanceAddress: string;
    signer: Wallet;
    turn: BigNumberish;
  }): Promise<string> => {
    log(`Decrypting proposal ${proposal}...`, 3);
    log({ playerPubKey, signer, gameId, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      gameMaster: signer,
      gameId,
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
    gameId,
    instanceAddress,
    signer,
    turn,
  }: {
    vote: string;
    playerPubKey: string;
    gameId: BigNumberish;
    instanceAddress: string;
    signer: Wallet;
    turn: BigNumberish;
  }): Promise<BigNumberish[]> => {
    log(`Decrypting vote ${vote}...`, 3);
    log({ playerPubKey, signer, gameId, turn, instanceAddress }, 3);
    const sharedKey = await sharedGameKeySigner({
      publicKey: playerPubKey,
      gameMaster: signer,
      gameId,
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
}

export default EnvironmentSimulator;
