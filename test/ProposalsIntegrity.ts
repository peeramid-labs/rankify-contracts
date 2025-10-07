// file location: ./test/multiplier.test.ts

// @ts-ignore
import { buildPoseidon } from 'circomlibjs';
import { zkit } from 'hardhat'; // hardhat-zkit plugin
import { expect } from 'chai'; // chai-zkit extension
import { ProposalsIntegrity15 } from '@zkit';
import { createInputs } from '../scripts/proofs';
import { ethers } from 'hardhat';

describe('ProposalsIntegrity', () => {
  let poseidon: any;
  let circuit: ProposalsIntegrity15;
  const maxSize = 15;
  const verifierAddress = '0x120E00225C4a43B6c55474Db44a4a44199b4c3eE';

  before(async () => {
    poseidon = await buildPoseidon();
    circuit = await zkit.getCircuit('ProposalsIntegrity15');
  });

  it('should verify proof if all players are active', async () => {
    const inputs = await createInputs({
      numActive: 15,
      proposals: Array(maxSize).fill(1n),
      commitmentRandomnesses: Array(maxSize).fill(1n),
      gameId: 1,
      turn: 1,
      verifierAddress,
      chainId: 1,
      gm: ethers.Wallet.createRandom(),
    });
    const proof = await circuit.generateProof(inputs);
    await expect(circuit).to.verifyProof(proof);
  });

  it('should verify proof if only some players are active', async () => {
    const inputs = await createInputs({
      numActive: 5,
      proposals: Array(maxSize).fill(1n),
      commitmentRandomnesses: Array(maxSize).fill(1n),
      gameId: 1,
      turn: 1,
      verifierAddress,
      chainId: 1,
      gm: ethers.Wallet.createRandom(),
    });
    const proof = await circuit.generateProof(inputs);
    await expect(circuit).to.verifyProof(proof);
  });

  it('should verify proof with single active player', async () => {
    const inputs = await createInputs({
      numActive: 1,
      proposals: Array(maxSize).fill(0n),
      commitmentRandomnesses: Array(maxSize).fill(1n),
      gameId: 1,
      turn: 1,
      verifierAddress,
      chainId: 1,
      gm: ethers.Wallet.createRandom(),
    });
    const proof = await circuit.generateProof(inputs);
    await expect(circuit).to.verifyProof(proof);
  });

  it('should verify proof with custom proposal values', async () => {
    // This test runs in cycles to ensure we cover boundary cases

    const numActives = [0, 5, 15];
    for (const numActive of numActives) {
      const proposals = Array(maxSize)
        .fill(0n)
        .map((_, i) => (i < numActive ? BigInt(1000 + i) : 0n));

      // Use different randomness values for each active slot
      const commitmentRandomnesses = Array(maxSize)
        .fill(0n)
        .map((_, i) => (i < numActive ? BigInt(i + 100) : 0n));

      const results = [];
      for (let i = 0; i < 5; i++) {
        // Since game master wallet is defining permutation logic, we add runs to ensure we fuzz permutation logic
        const inputs = await createInputs({
          numActive,
          proposals,
          commitmentRandomnesses,
          gameId: 1,
          turn: 1,
          verifierAddress,
          chainId: 1,
          gm: new ethers.Wallet(ethers.utils.solidityKeccak256(['uint256'], [i])),
        });
        try {
          const proof = await circuit.generateProof(inputs);
          results.push(await circuit.verifyProof(proof));
        } catch (e) {
          results.push(false);
        }
      }
      expect(results.every(r => r)).to.be.true;
    }
  });

  it('should verify proof with all zeros', async () => {
    const inputs = await createInputs({
      numActive: 0,
      proposals: Array(maxSize).fill(0n),
      commitmentRandomnesses: Array(maxSize).fill(1n),
      gameId: 1,
      turn: 1,
      verifierAddress,
      chainId: 1,
      gm: ethers.Wallet.createRandom(),
    });
    const proof = await circuit.generateProof(inputs);
    await expect(circuit).to.verifyProof(proof);
  });

  it('should fail with invalid commitment', async () => {
    const inputs = await createInputs({
      numActive: 1,
      proposals: Array(maxSize).fill(0n),
      commitmentRandomnesses: Array(maxSize).fill(1n),
      gameId: 1,
      turn: 1,
      verifierAddress,
      chainId: 1,
      gm: ethers.Wallet.createRandom(),
    });
    // Modify commitment to make it invalid
    inputs.commitments[0] = 0n;

    try {
      await circuit.generateProof(inputs);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Assert Failed');
    }
  });

  it('should fail with invalid permutation', async () => {
    const inputs = await createInputs({
      numActive: maxSize,
      proposals: Array(maxSize).fill(0n),
      commitmentRandomnesses: Array(maxSize).fill(1n),
      gameId: 1,
      turn: 1,
      verifierAddress,
      chainId: 1,
      gm: ethers.Wallet.createRandom(),
    });
    // Modify permutation to make it invalid (duplicate index)
    inputs.permutation[0] = inputs.permutation[1];

    try {
      await circuit.generateProof(inputs);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Assert Failed');
    }
  });

  it('should fail with mismatched randomness', async () => {
    const inputs = await createInputs({
      numActive: 1,
      proposals: Array(maxSize).fill(1n),
      commitmentRandomnesses: Array(maxSize).fill(1n),
      gameId: 1,
      turn: 1,
      verifierAddress,
      chainId: 1,
      gm: ethers.Wallet.createRandom(),
    });
    // Modify randomness to not match commitment
    inputs.randomnesses[0] = 12345n;

    try {
      await circuit.generateProof(inputs);
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Assert Failed');
    }
  });
});
