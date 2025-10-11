import { ethers, getNamedAccounts } from 'hardhat';
import { expect } from 'chai';
import hre from 'hardhat';
import { setupTest } from './utils';
import { RankifyDiamondInstance, UBI, Multipass } from '../types';
import { AdrSetupResult, EnvSetupResult, SignerIdentity } from '../scripts/setupMockEnvironment';
import { MockERC20 } from '@peeramid-labs/eds/types';
import { BigNumber, BytesLike, Wallet } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { LibMultipass } from '../types/artifacts/@peeramid-labs/multipass/src/interfaces/IMultipass';
import { solidityKeccak256 } from 'ethers/lib/utils';
import { time } from '@nomicfoundation/hardhat-network-helpers';

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
const registerOnMultipass = async (player: SignerIdentity, registrar: Wallet, mp: Multipass) => {
  const blockTimestamp = await ethers.provider.getBlock('latest').then(block => block.timestamp);
  const registrarMessage = {
    name: ethers.utils.formatBytes32String(player.name),
    id: ethers.utils.formatBytes32String(player.id),
    domainName: ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1),
    validUntil: ethers.BigNumber.from(blockTimestamp + 24 * 3600 * 28),
    nonce: ethers.BigNumber.from(0),
  };
  const sig = await signRegistrarMessage(hre, registrarMessage, mp.address, registrar);
  const emptyUserQuery: LibMultipass.NameQueryStruct = {
    name: ethers.utils.formatBytes32String(''),
    id: ethers.utils.formatBytes32String(''),
    domainName: ethers.utils.formatBytes32String(''),
    wallet: ethers.constants.AddressZero,
    targetDomain: ethers.utils.formatBytes32String(''),
  };
  return mp.register(
    { ...registrarMessage, wallet: player.wallet.address },
    sig,
    emptyUserQuery,
    ethers.constants.HashZero,
  );
};
describe('UBI contract', async function () {
  let ubi: UBI;
  let mp: Multipass;
  let defaultPlayerA: string;

  beforeEach(async function () {
    const setup = await setupTest();
    adr = setup.adr;
    env = setup.env;
    const factory = await hre.ethers.getContractFactory('UBI');
    const mpd = await hre.deployments.deploy('Multipass', { from: adr.contractDeployer.wallet.address, args: [true] });
    let registrarSignatureP0;
    mp = new hre.ethers.Contract(
      mpd.address,
      mpd.abi,
      await hre.ethers.getSigner(adr.gameMaster1.address),
    ) as Multipass;
    await mp.initialize('MultipassDNS', '0.0.1', adr.gameMaster3.address);
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
    // const { owner } = await getNamedAccounts();
    const ownerIs = adr.gameMaster3;
    await mp
      .connect(ownerIs)
      .initializeDomain(
        adr.gameMaster1.address,
        ethers.utils.parseEther('0'),
        ethers.utils.parseEther('0'),
        ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1),
        ethers.utils.parseEther('0'),
        ethers.utils.parseEther('0'),
      );
    await mp.connect(ownerIs).activateDomain(ethers.utils.formatBytes32String(NEW_DOMAIN_NAME1));
    await registerOnMultipass(adr.players[0], adr.gameMaster1, mp);
    await registerOnMultipass(adr.players[1], adr.gameMaster1, mp);
    const owner20 = await env.mockERC20.owner();
    const o20signer = await hre.ethers.getSigner(owner20);
    await env.mockERC20.connect(o20signer).transferOwnership(ubi.address);
    defaultPlayerA = adr.players[0].wallet.address;
    // secondPlayerA = adr.players[1].wallet.address;
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
        const player0BalanceBefore = await env.mockERC20.balanceOf(adr.players[0].wallet.address);
        // 1. Player 0 calls claim() with "gm"
        // Expect Claimed and ProposingByAddress events to be emitted
        await expect(ubi.connect(adr.players[0].wallet).claim('gm'))
          .to.emit(ubi, 'Claimed')
          .to.emit(ubi, 'ProposingByAddress');
        // 2. Expect Player 0's token balance to increase by dailyClaimAmount
        expect(await env.mockERC20.balanceOf(adr.players[0].wallet.address)).to.be.equal(
          player0BalanceBefore.add(ethers.utils.parseEther('1')),
        );
        // 3. Expect lastClaimedAt for Player 0 to be the current day
        expect(await ubi.lastClaimedAt(adr.players[0].wallet.address)).to.be.equal(await ubi.getCurrentDay());
        // 4. Expect supportSpent for Player 0 to be reset to 0
        const { claimedToday, supportSpent } = await ubi.getUserState(defaultPlayerA);
        expect(claimedToday).to.be.false;
        expect(supportSpent.toString()).to.be.equal('0');
        // 5. Expect a new proposal to be created for the hash of "gm"
        expect((await ubi.getProposalsCnt(await ubi.getCurrentDay())).toString()).to.be.eq('1');
        const stats = await ubi.proposalLifetimeStats(solidityKeccak256(['string'], ['gm']));
        expect(stats.aggregateScore.toString()).to.be.equal('0');
        expect(stats.proposedTimes.toString()).to.be.equal('1');
        expect(stats.repostedTimes.toString()).to.be.equal('0');
      });

      it('should allow a user to claim again on the next day', async () => {
        const player0BalanceBefore = await env.mockERC20.balanceOf(adr.players[0].wallet.address);
        // 1. Player 0 claims successfully
        await expect(ubi.connect(adr.players[0].wallet).claim('gm'))
          .to.emit(ubi, 'Claimed')
          .to.emit(ubi, 'ProposingByAddress');
        // 2. Advance time by 24 hours
        await time.increase(24 * 3600);
        // 3. Player 0 claims again successfully
        await expect(ubi.connect(adr.players[0].wallet).claim('gm'))
          .to.emit(ubi, 'Claimed')
          .to.emit(ubi, 'ProposingByAddress');
        // 4. Check that their token balance has increased again
        expect(await env.mockERC20.balanceOf(adr.players[0].wallet.address)).to.be.equal(
          player0BalanceBefore.add(ethers.utils.parseEther('1').mul(2)),
        );
      });

      it('should handle "re posting" when another user claims with the same data on the same day', async () => {
        // 1. Player 0 claims with "I love UBI"
        await expect(ubi.connect(adr.players[0].wallet).claim('I love UBI'))
          .to.emit(ubi, 'Claimed')
          .to.emit(ubi, 'ProposingByAddress');
        // 2. Player 1 claims with "I love UBI"
        // Expect RepostByReposter and RepostByProposer events to be emitted
        await expect(ubi.connect(adr.players[1].wallet).claim('I love UBI'))
          .to.emit(ubi, 'RepostByReposter')
          .to.emit(ubi, 'RepostByProposer');
        // 3. Expect Player 1 to receive tokens
        const p1b = await env.mockERC20.balanceOf(defaultPlayerA);
        const p2b = await env.mockERC20.balanceOf(adr.players[1].wallet.address);
        expect(p1b.toString()).to.be.equal(ethers.utils.parseEther('1'));
        expect(p2b.toString()).to.be.equal(ethers.utils.parseEther('1'));
        // 4. Expect proposalCnt for the day to remain 1
        expect((await ubi.getProposalsCnt(await ubi.getCurrentDay())).toString()).to.be.equal('1');
        const hash = solidityKeccak256(['string'], ['I love UBI']);
        const proposalStat = await ubi.getProposalDailyScore(hash, await ubi.getCurrentDay());
        expect(proposalStat.proposer).to.be.equal(defaultPlayerA);
      });
    });

    describe('Failure and Edge Cases', () => {
      it('should revert if a user tries to claim twice on the same day', async () => {
        // 1. Player 0 claims successfully
        await expect(ubi.connect(adr.players[0].wallet).claim('gm'))
          .to.emit(ubi, 'Claimed')
          .to.emit(ubi, 'ProposingByAddress');
        // 2. Player 0 tries to claim again without time passing
        // 3. Expect the transaction to revert with "Already claimed today"
        await expect(ubi.connect(adr.players[0].wallet).claim('gm')).to.revertedWith('Already claimed today');
      });

      it('should revert if a user without a valid Multipass record tries to claim', async () => {
        // (Assuming the Multipass check is active in your UBI contract)
        await expect(ubi.connect(adr.maliciousActor1.wallet).claim('gm')).to.be.revertedWithCustomError(
          ubi,
          'InvalidSender',
        );
        // 1. Use a signer (e.g., Player 1) who has not been registered on Multipass
        // 2. Expect their claim() call to revert with your InvalidSender error
      });

      it('should revert if the proposal data string is longer than 1337 bytes', async () => {
        // 1. Create a string that is 1338 bytes long
        // 2. Expect the claim() call to revert with "Max Data size 1337..."\
        await expect(ubi.connect(adr.players[0].wallet).claim('gm'.repeat(1337))).to.be.revertedWith(
          'Max Data size 1337, use IPFS link',
        );
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
      it.skip('should allow an active claimer to support a proposal from the previous day', async () => {
        // SETUP: P0 claims with "Prop A" on Day 1. Advance to Day 2. P1 claims to become active.
        // 1. P1 supports "Prop A" with a score of 1.
        // 2. Expect P0's (the proposer) token balance to increase by 1.
        // 3. Expect P1's (the voter) supportSpent to increase by 1 (1*1).
        // 4. Expect proposalScores for "Prop A" to increase by 1.
        // 5. Expect VotingByAddress and ProposalScoreUpdated events.
      });

      it.skip('should correctly calculate quadratic cost for supportSpent', async () => {
        // SETUP: As above.
        // 1. P1 supports "Prop A" with a score of 3.
        // 2. Expect P0's token balance to increase by 3.
        // 3. Expect P1's supportSpent to increase by 9 (3*3).
      });

      it.skip('should allow a user to support multiple different proposals in one transaction', async () => {
        // SETUP: P0 claims "Prop A", P2 claims "Prop B" on Day 1. Advance to Day 2. P1 claims.
        // 1. P1 supports "Prop A" (score 2) and "Prop B" (score 3) in one call.
        // 2. Expect P0 balance +2, P2 balance +3.
        // 3. Expect P1 supportSpent to be 13 (2*2 + 3*3).
      });

      it.skip('should update and respect supportSpent across multiple transactions within the same day', async () => {
        // SETUP: As above.
        // 1. P1 supports "Prop A" (score 2), spending 4 credits.
        // 2. In a separate transaction on the same day, P1 supports "Prop B" (score 3).
        // 3. Expect the second transaction to succeed and total supportSpent for P1 to be 13.
      });
    });

    describe('Failure and Edge Cases', () => {
      it.skip('should revert if a user tries to support without having claimed on the current day', async () => {
        // SETUP: P0 claims "Prop A" on Day 1. Advance to Day 2.
        // 1. P1 (who has not claimed on Day 2) tries to support "Prop A".
        // 2. Expect revert with "Can support only active claimers".
      });

      it.skip('should revert if a user tries to support their own proposal', async () => {
        // SETUP: P0 claims "Prop A" on Day 1. Advance to Day 2. P0 claims again.
        // 1. P0 tries to support their own "Prop A".
        // 2. Expect revert with "Cannot support yourself".
      });

      it.skip('should revert if a user tries to support a non-existent proposal', async () => {
        // SETUP: P1 is an active claimer on Day 2.
        // 1. P1 tries to support a random bytes32 hash.
        // 2. Expect revert with "Proposal is not in daily menu :(".
      });

      it.skip('should revert if the cumulative quadratic cost exceeds the daily limit', async () => {
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
    it.skip('should allow the pauser to pause and unpause the contract', async () => {
      // 1. Call pause() from the pauser address (gameMaster2).
      // 2. Check contract is paused.
      // 3. Call unpause() from the pauser address.
      // 4. Check contract is not paused.
    });

    it.skip('should prevent non-pausers from pausing or unpausing', async () => {
      // 1. Call pause() from a non-pauser address.
      // 2. Expect revert with "not a pauser".
    });

    it.skip('should block claim() and support() when paused', async () => {
      // 1. Pause the contract.
      // 2. Expect calls to claim() and support() to revert because of 'whenNotPaused' modifier.
    });
  });
});
