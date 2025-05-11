import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { RankToken, RankToken__factory } from '../types';
import { AdrSetupResult, setupAddresses } from '../scripts/setupMockEnvironment';

let adr: AdrSetupResult;
let rankToken: RankToken;

describe('Rank Token State management logic', async function () {
  beforeEach(async function () {
    adr = await setupAddresses(hre);
    const RankToken = (await ethers.getContractFactory('RankToken')) as RankToken__factory;
    rankToken = await RankToken.deploy('https://example.com/fellowship', 'https://example.com/fellowship');
  });

  describe('when ranking instance set and tokens are minted to player', async () => {
    beforeEach(async () => {
      const signer = adr.gameMaster1;
      await rankToken.connect(signer).mint(adr.players[0].wallet.address, 3, 1, '0x');
    });
    it.skip('Can be locked only by instance', async () => {
      //   const signer = adr.gameMaster1;
      //   await expect(rankToken.connect(signer).lock(adr.players[0].wallet.address, 1, 1))
      //     .to.emit(rankToken, 'TokensLocked')
      //     .withArgs(adr.players[0].wallet.address, 1, 1);
      //   await expect(
      //     rankToken.connect(adr.maliciousActor1.wallet).lock(adr.players[0].wallet.address, 1, 1),
      //   ).to.be.revertedWithCustomError(env.distributor, 'InvalidInstance');
    });
    it('Cannot lock more then user has', async () => {
      const signer = adr.gameMaster1;
      await expect(rankToken.connect(signer).lock(adr.players[0].wallet.address, 1, 4)).to.be.revertedWithCustomError(
        rankToken,
        'insufficient',
      );
    });

    describe('When tokens locked', async () => {
      beforeEach(async () => {
        await rankToken.connect(adr.gameMaster1).lock(adr.players[0].wallet.address, 1, 1);
      });
      it('reports correct balance of unlocked', async () => {
        expect(
          (
            await rankToken.connect(adr.maliciousActor1.wallet).unlockedBalanceOf(adr.players[0].wallet.address, 1)
          ).toNumber(),
        ).to.be.equal(2);
      });
      it.skip('Can be unlocked only by a rankingInstance', async () => {
        // await expect(rankToken.connect(adr.gameMaster1).unlock(adr.players[0].wallet.address, 1, 1))
        //   .to.emit(rankToken, 'TokensUnlocked')
        //   .withArgs(adr.players[0].wallet.address, 1, 1);
        // await expect(
        //   rankToken.connect(adr.maliciousActor1.wallet).unlock(adr.players[0].wallet.address, 1, 1),
        // ).to.be.revertedWithCustomError(env.distributor, 'InvalidInstance');
      });
      it('Can only unlock a locked amount tokens', async () => {
        await expect(rankToken.connect(adr.gameMaster1).unlock(adr.players[0].wallet.address, 1, 1))
          .to.emit(rankToken, 'TokensUnlocked')
          .withArgs(adr.players[0].wallet.address, 1, 1);
        await expect(
          rankToken.connect(adr.gameMaster1).unlock(adr.players[0].wallet.address, 2, 1),
        ).to.be.revertedWithCustomError(rankToken, 'insufficient');
      });
      it('Can transfer only unlocked tokens', async () => {
        await expect(
          rankToken
            .connect(adr.players[0].wallet)
            .safeTransferFrom(adr.players[0].wallet.address, adr.players[1].wallet.address, 1, 3, '0x'),
        ).to.be.revertedWithCustomError(rankToken, 'insufficient');
        await expect(
          rankToken
            .connect(adr.players[0].wallet)
            .safeTransferFrom(adr.players[0].wallet.address, adr.players[1].wallet.address, 1, 2, '0x'),
        ).to.be.emit(rankToken, 'TransferSingle');
      });
      it('Can transfer previously locked tokens', async () => {
        await rankToken.connect(adr.gameMaster1).unlock(adr.players[0].wallet.address, 1, 1);
        await expect(
          rankToken
            .connect(adr.players[0].wallet)
            .safeTransferFrom(adr.players[0].wallet.address, adr.players[1].wallet.address, 1, 3, '0x'),
        ).to.be.emit(rankToken, 'TransferSingle');
      });
      it('Balance still shows same', async () => {
        expect(
          (await rankToken.connect(adr.gameMaster1).balanceOf(adr.players[0].wallet.address, 1)).toNumber(),
        ).to.be.equal(3);
      });
      it('Cannot lock more then balance tokens', async () => {
        await expect(
          rankToken
            .connect(adr.players[0].wallet)
            .safeTransferFrom(adr.players[0].wallet.address, adr.players[1].wallet.address, 1, 4, '0x'),
        ).to.be.revertedWithCustomError(rankToken, 'insufficient');
      });
    });
  });
});
