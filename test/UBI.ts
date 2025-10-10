import { ethers, getNamedAccounts } from 'hardhat';
import { expect } from 'chai';
import hre from 'hardhat';
import { setupTest } from './utils';
import { RankifyDiamondInstance, UBI, Multipass } from '../types';
import { AdrSetupResult, EnvSetupResult } from '../scripts/setupMockEnvironment';
import { MockERC20 } from '@peeramid-labs/eds/types';
import { BigNumber, BytesLike, Wallet } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

let adr: AdrSetupResult;
let env: EnvSetupResult;
let rankifyInstance: RankifyDiamondInstance;
let rankToken: MockERC20;
const NEW_DOMAIN_NAME1 = 'invisible-garden.rankify';
export interface RegisterMessage {
  name: BytesLike;
  id: BytesLike;
  domainName: BytesLike;
  validUntil: BigNumber;
  nonce: BigNumber;
}

const signRegistrarMessage = async (
  hre: HardhatRuntimeEnvironment,
  message: RegisterMessage,
  verifierAddress: string,
  signer: Wallet,
) => {
  let chainId = hre.network.config.chainId;

  const domain = {
    name: 'MultipassDNS',
    version: '0.0.1',
    chainId,
    verifyingContract: verifierAddress,
  };

  const types = {
    registerName: [
      {
        type: 'bytes32',
        name: 'name',
      },
      {
        type: 'bytes32',
        name: 'id',
      },
      {
        type: 'bytes32',
        name: 'domainName',
      },
      {
        type: 'uint256',
        name: 'validUntil',
      },
      {
        type: 'uint96',
        name: 'nonce',
      },
    ],
  };

  const s = await signer._signTypedData(domain, types, { ...message });
  return s;
};

describe('UBI contract', async function () {
  let ubi: UBI;
  let mp: Multipass;

  beforeEach(async function () {
    const setup = await setupTest();
    adr = setup.adr;
    env = setup.env;
    const factory = await hre.ethers.getContractFactory('UBI');
    const mpd = await hre.deployments.deploy('Multipass', { from: adr.contractDeployer.wallet.address });
    let registrarSignatureP0;
    mp = new hre.ethers.Contract(
      mpd.address,
      mpd.abi,
      await hre.ethers.getSigner(adr.gameMaster1.address),
    ) as Multipass;
    ubi = await factory.deploy(true);

    ubi.initialize(
      mp.address,
      env.mockERC20.address,
      adr.gameMaster2.address,
      adr.gameMaster3.address,
      ethers.utils.parseEther('1'),
      ethers.utils.parseEther('1'),
      ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1),
    );
    const { owner } = await getNamedAccounts();
    mp.connect(await hre.ethers.getSigner(owner)).initializeDomain(
      adr.gameMaster1.address,
      ethers.utils.parseEther('0'),
      ethers.utils.parseEther('0'),
      ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1),
      ethers.utils.parseEther('0'),
      ethers.utils.parseEther('0'),
    );
    mp.activateDomain(ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1));
    const blockTimestamp = await ethers.provider.getBlock('latest').then(block => block.timestamp);
    const registrarMessage = {
      name: ethers.utils.formatBytes32String(adr.players[0].name),
      id: ethers.utils.formatBytes32String(adr.players[0].id),
      domainName: ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1),
      validUntil: ethers.BigNumber.from(blockTimestamp + 9999),
      nonce: ethers.BigNumber.from(0),
    };
    registrarSignatureP0 = await signRegistrarMessage(hre, registrarMessage, mp.address, adr.gameMaster1);
  });
  // =================================================================
  // Initial State and Configuration
  // =================================================================
  describe('Deployment and Initialization', () => {
    it('should correctly set the owner, pauser, and other initial parameters', async () => {
      // Check s.owner, s.pauser, s.token, s.multipass
      expect(await ubi.pauser()).to.be.equal(adr.gameMaster2.address);
      expect(await ubi.owner()).to.be.equal(adr.gameMaster3.address);
      expect(await ubi.token()).to.be.equal(env.mockERC20.address);
      expect(await ubi.connect(adr.gameMaster2).pause()).to.emit(ubi, 'Paused');
      // Check s.dailyClaimAmount and s.dailySupportAmount
      const { dailyClaimAmount, dailySupportAmount, domainName } = await ubi.getUBIParams();
      expect(dailyClaimAmount.toString()).to.be.equal(ethers.utils.parseEther('1'));
      expect(dailySupportAmount.toString()).to.be.equal(ethers.utils.parseEther('1'));
      // Check s.domainName
      expect(domainName).to.be.equal(ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1));
    });

    it('should revert if the initialize function is called a second time', async () => {
      // Expect the second initialize call to be reverted by the Initializable guard
      await expect(
        ubi.initialize(
          mp.address,
          env.mockERC20.address,
          adr.gameMaster2.address,
          adr.gameMaster3.address,
          ethers.utils.parseEther('1'),
          ethers.utils.parseEther('1'),
          ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1),
        ),
      ).to.be.revertedWithCustomError(ubi, 'InvalidInitialization');
    });
  });

  // =================================================================
  // Core Logic: Claiming UBI and Creating Proposals
  // =================================================================
  describe('claim() - UBI Distribution and Proposing', () => {
    describe('Happy Paths', () => {
      it('should allow a valid Multipass holder to claim for the first time on a given day', async () => {
        // 1. Player 0 calls claim() with "gm"
        // 2. Expect Player 0's token balance to increase by dailyClaimAmount
        // 3. Expect lastClaimedAt for Player 0 to be the current day
        // 4. Expect supportSpent for Player 0 to be reset to 0
        // 5. Expect a new proposal to be created for the hash of "gm"
        // 6. Expect Claimed and ProposingByAddress events to be emitted
      });

      it('should allow a user to claim again on the next day', async () => {
        // 1. Player 0 claims successfully
        // 2. Advance time by 24 hours
        // 3. Player 0 claims again successfully
        // 4. Check that their token balance has increased again
      });

      it('should handle "reposting" when another user claims with the same data on the same day', async () => {
        // 1. Player 0 claims with "I love UBI"
        // 2. Player 1 claims with "I love UBI"
        // 3. Expect Player 1 to receive tokens
        // 4. Expect proposalCnt for the day to remain 1
        // 5. Expect RepostByReposter and RepostByProposer events to be emitted
      });
    });

    describe('Failure and Edge Cases', () => {
      it('should revert if a user tries to claim twice on the same day', async () => {
        // 1. Player 0 claims successfully
        // 2. Player 0 tries to claim again without time passing
        // 3. Expect the transaction to revert with "Already claimed today"
      });

      it('should revert if a user without a valid Multipass record tries to claim', async () => {
        // (Assuming the Multipass check is active in your UBI contract)
        // 1. Use a signer (e.g., Player 1) who has not been registered on Multipass
        // 2. Expect their claim() call to revert with your InvalidSender error
      });

      it('should revert if the proposal data string is longer than 1337 bytes', async () => {
        // 1. Create a string that is 1338 bytes long
        // 2. Expect the claim() call to revert with "Max Data size 1337..."
      });
    });
  });

  // =================================================================
  // Core Logic: Supporting Proposals
  // =================================================================
  describe('support() - Quadratic Voting and Rewards', () => {
    // This will require more complex setup within a nested beforeEach or the tests themselves
    // e.g., create proposals on Day 1, advance time to Day 2, and then have users support them.
    describe('Happy Paths', () => {
      it('should allow an active claimer to support a proposal from the previous day', async () => {
        // SETUP: P0 claims with "Prop A" on Day 1. Advance to Day 2. P1 claims to become active.
        // 1. P1 supports "Prop A" with a score of 1.
        // 2. Expect P0's (the proposer) token balance to increase by 1.
        // 3. Expect P1's (the voter) supportSpent to increase by 1 (1*1).
        // 4. Expect proposalScores for "Prop A" to increase by 1.
        // 5. Expect VotingByAddress and ProposalScoreUpdated events.
      });

      it('should correctly calculate quadratic cost for supportSpent', async () => {
        // SETUP: As above.
        // 1. P1 supports "Prop A" with a score of 3.
        // 2. Expect P0's token balance to increase by 3.
        // 3. Expect P1's supportSpent to increase by 9 (3*3).
      });

      it('should allow a user to support multiple different proposals in one transaction', async () => {
        // SETUP: P0 claims "Prop A", P2 claims "Prop B" on Day 1. Advance to Day 2. P1 claims.
        // 1. P1 supports "Prop A" (score 2) and "Prop B" (score 3) in one call.
        // 2. Expect P0 balance +2, P2 balance +3.
        // 3. Expect P1 supportSpent to be 13 (2*2 + 3*3).
      });

      it('should update and respect supportSpent across multiple transactions within the same day', async () => {
        // SETUP: As above.
        // 1. P1 supports "Prop A" (score 2), spending 4 credits.
        // 2. In a separate transaction on the same day, P1 supports "Prop B" (score 3).
        // 3. Expect the second transaction to succeed and total supportSpent for P1 to be 13.
      });
    });

    describe('Failure and Edge Cases', () => {
      it('should revert if a user tries to support without having claimed on the current day', async () => {
        // SETUP: P0 claims "Prop A" on Day 1. Advance to Day 2.
        // 1. P1 (who has not claimed on Day 2) tries to support "Prop A".
        // 2. Expect revert with "Can support only active claimers".
      });

      it('should revert if a user tries to support their own proposal', async () => {
        // SETUP: P0 claims "Prop A" on Day 1. Advance to Day 2. P0 claims again.
        // 1. P0 tries to support their own "Prop A".
        // 2. Expect revert with "Cannot support yourself".
      });

      it('should revert if a user tries to support a non-existent proposal', async () => {
        // SETUP: P1 is an active claimer on Day 2.
        // 1. P1 tries to support a random bytes32 hash.
        // 2. Expect revert with "Proposal is not in daily menu :(".
      });

      it('should revert if the cumulative quadratic cost exceeds the daily limit', async () => {
        // Set dailySupportAmount to 100 for the test.
        // SETUP: P0, P2, P3 have proposals. P1 is active claimer.
        // 1. P1 supports with votes that cost 101 (e.g., one vote of 11, or votes of 8 and 5).
        // 2. Expect revert with "Daily support limit exceeded".
      });
    });
  });

  // =================================================================
  // Administrative Functions
  // =================================================================
  describe('Pausable Functionality', () => {
    it('should allow the pauser to pause and unpause the contract', async () => {
      // 1. Call pause() from the pauser address (gameMaster2).
      // 2. Check contract is paused.
      // 3. Call unpause() from the pauser address.
      // 4. Check contract is not paused.
    });

    it('should prevent non-pausers from pausing or unpausing', async () => {
      // 1. Call pause() from a non-pauser address.
      // 2. Expect revert with "not a pauser".
    });

    it('should block claim() and support() when paused', async () => {
      // 1. Pause the contract.
      // 2. Expect calls to claim() and support() to revert because of 'whenNotPaused' modifier.
    });
  });
});
