import { BigNumberish, ethers, Wallet } from 'ethers';
import { keccak256 } from 'ethers/lib/utils';
import { log } from './utils';
import { getSharedSecret } from '@noble/secp256k1';
// Derives a private key from the signer's private key, gameId, turn, and contract address
export const privateKeyDerivationFunction = ({
  chainId,
  privateKey,
  gameId,
  turn,
  contractAddress,
  scope = 'default',
}: {
  chainId: BigNumberish;
  privateKey: string;
  gameId: BigNumberish;
  turn: BigNumberish;
  contractAddress: string;
  scope?: 'default' | 'turnSalt';
}) => {
  log(`Deriving private key for scope: ${scope}`, 3);
  log(
    {
      chainId: chainId,
      privateKey,
      gameId,
      turn,
      contractAddress,
      scope: ethers.utils.solidityPack(['string'], [scope]),
    },
    3,
  );
  const derivedPrivateKey = keccak256(
    ethers.utils.solidityPack(
      ['bytes32', 'uint256', 'uint256', 'address', 'uint256', 'bytes32'],
      [privateKey, gameId, turn, contractAddress, chainId, ethers.utils.solidityKeccak256(['string'], [scope])],
    ),
  );
  log(`Derived private key: ${derivedPrivateKey}`, 3);
  return derivedPrivateKey;
};

export const sharedSigner = ({
  publicKey,
  signer,
  gameId,
  turn,
  contractAddress,
  chainId,
}: {
  publicKey: string;
  signer: Wallet;
  gameId: BigNumberish;
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
    gameId,
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
 * @param gameId - ID of the game
 * @param turn - Turn number
 * @param contractAddress - Address of the contract
 * @param chainId - Chain ID
 * @returns Shared signer
 */
export const sharedGameKeySigner = async ({
  publicKey,
  gameMaster,
  gameId,
  turn,
  contractAddress,
  chainId,
}: {
  publicKey: string;
  gameMaster: Wallet;
  gameId: BigNumberish;
  turn: BigNumberish;
  contractAddress: string;
  chainId: string;
}) => {
  return sharedSigner({
    publicKey,
    signer: new ethers.Wallet(
      await gameKey({
        gameId,
        contractAddress,
        gameMaster,
      }),
    ),
    gameId,
    turn,
    contractAddress,
    chainId,
  });
};

/**
 * Returns the game key for a game
 * @param gameId - ID of the game
 * @param contractAddress - Address of the contract
 * @param gameMaster - Game master
 * @returns Game key
 */
export const gameKey = async ({
  gameId,
  contractAddress,
  gameMaster,
}: {
  gameId: BigNumberish;
  contractAddress: string;
  gameMaster: Wallet;
}): Promise<string> => {
  const message = ethers.utils.solidityPack(['uint256', 'address', 'string'], [gameId, contractAddress, 'gameKey']);
  log(`Signing message: ${message}`, 3);
  const gameKey = await gameMaster.signMessage(message).then(sig => keccak256(sig));
  log(`Game key: ${gameKey}`, 3);
  return gameKey;
};
