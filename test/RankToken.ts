import { ethers, getNamedAccounts, network } from 'hardhat';
import { expect } from 'chai';
import hre, { deployments } from 'hardhat';
import { setupTest } from './utils';
import { RankifyDiamondInstance, RankToken, Rankify } from '../types';
import addDistribution from '../scripts/addDistribution';
import { getCodeIdFromArtifact } from '../scripts/getCodeId';
import { MAODistribution } from '../types/src/distributions/MAODistribution';
import { generateDistributorData } from '../scripts/libraries/generateDistributorData';
import { AdrSetupResult, EnvSetupResult } from '../scripts/setupMockEnvironment';
import { constantParams } from '../scripts/EnvironmentSimulator';
import { parseInstantiated } from '../scripts/parseInstantiated';
let adr: AdrSetupResult;
let env: EnvSetupResult;
let rankifyInstance: RankifyDiamondInstance;
let rankToken: RankToken;

describe('Rank Token Test', async function () {
  beforeEach(async function () {
    const setup = await setupTest();
    adr = setup.adr;
    env = setup.env;

    await addDistribution(hre)({
      distrId: await getCodeIdFromArtifact(hre)('MAODistribution'),
      signer: adr.gameOwner.wallet,
    });
    const { owner } = await getNamedAccounts();
    const oSigner = await ethers.getSigner(owner);
    const distributorArguments: MAODistribution.DistributorArgumentsStruct = {
      govSettings: {
        tokenName: 'tokenName',
        tokenSymbol: 'tokenSymbol',
        preMintAmounts: [ethers.utils.parseEther('100')],
        preMintReceivers: [oSigner.address],
        orgName: 'orgName',
        votingDelay: 3600,
        votingPeriod: 3600,
        quorum: 51,
      },
      rankifySettings: {
        // beneficiary: oSigner.address,
        paymentToken: env.rankifyToken.address,
        rankTokenContractURI: 'https://example.com/rank',
        principalCost: constantParams.PRINCIPAL_COST,
        principalTimeConstant: constantParams.PRINCIPAL_TIME_CONSTANT,
        rankTokenURI: 'https://example.com/rank',
      },
    };
    // Use generateDistributorData to encode the arguments
    const data = generateDistributorData(distributorArguments);
    const maoCode = await hre.ethers.provider.getCode(env.maoDistribution.address);
    const maoId = ethers.utils.keccak256(maoCode);
    const token = await deployments.get('Rankify');

    const tokenContract = new ethers.Contract(token.address, token.abi, oSigner) as Rankify;
    await tokenContract.mint(oSigner.address, ethers.utils.parseUnits('100', 9));
    await tokenContract.approve(env.distributor.address, ethers.constants.MaxUint256);
    const distributorsDistId = await hre.run('defaultDistributionId');
    if (!distributorsDistId) throw new Error('Distribution name not found');
    if (typeof distributorsDistId !== 'string') throw new Error('Distribution name must be a string');
    await env.distributor.connect(oSigner).instantiate(distributorsDistId, data);
    const filter = env.distributor.filters.Instantiated();
    const evts = await env.distributor.queryFilter(filter);
    rankifyInstance = (await ethers.getContractAt(
      'RankifyDiamondInstance',
      parseInstantiated(evts[0].args.instances).ACIDInstance,
    )) as RankifyDiamondInstance;
    await network.provider.send('hardhat_setBalance', [rankifyInstance.address, '0x9000000000000000000']);
    await env.rankifyToken
      .connect(adr.gameCreator1.wallet)
      .approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken
      .connect(adr.gameCreator2.wallet)
      .approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken
      .connect(adr.gameCreator3.wallet)
      .approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[0].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[1].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[2].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[3].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[4].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[5].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[6].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[7].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[8].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);
    await env.rankifyToken.connect(adr.players[9].wallet).approve(rankifyInstance.address, ethers.constants.MaxUint256);

    rankToken = (await ethers.getContractAt(
      'RankToken',
      parseInstantiated(evts[0].args.instances).rankToken,
    )) as RankToken;
  });
  //   it('Allows only owner to set rankingInstance', async () => {
  //     await expect(rankToken.connect(deployer).updateRankingInstance(adr.gameCreator1.wallet.address))
  //       .to.emit(env, 'RankingInstanceUpdated')
  //       .withArgs(adr.gameCreator1.wallet.address);
  //     await expect(rankToken.connect(adr.maliciousActor1.wallet).updateRankingInstance(adr.gameCreator1.wallet.address))
  //       .to.emit(env, 'RankingInstanceUpdated')
  //       .revertedWithCustomError(env, 'OwnableUnauthorizedAccount');
  //   });
  describe('when ranking instance set and tokens are minted to player', async () => {
    beforeEach(async () => {
      //   await rankToken.connect(deployer).updateRankingInstance(rankingInstance.address);
      const impersonatedSigner = await ethers.getImpersonatedSigner(rankifyInstance.address);
      await rankToken.connect(impersonatedSigner).mint(adr.players[0].wallet.address, 3, 1, '0x');
    });
    it('Can be locked only by instance', async () => {
      const impersonatedSigner = await ethers.getImpersonatedSigner(rankifyInstance.address);
      await expect(rankToken.connect(impersonatedSigner).lock(adr.players[0].wallet.address, 1, 1))
        .to.emit(rankToken, 'TokensLocked')
        .withArgs(adr.players[0].wallet.address, 1, 1);
      await expect(
        rankToken.connect(adr.maliciousActor1.wallet).lock(adr.players[0].wallet.address, 1, 1),
      ).to.be.revertedWithCustomError(env.distributor, 'InvalidInstance');
    });
    it('Cannot lock more then user has', async () => {
      const impersonatedSigner = await ethers.getImpersonatedSigner(rankifyInstance.address);
      await expect(
        rankToken.connect(impersonatedSigner).lock(adr.players[0].wallet.address, 1, 4),
      ).to.be.revertedWithCustomError(rankToken, 'insufficient');
    });

    describe('When tokens locked', async () => {
      beforeEach(async () => {
        await rankToken
          .connect(await ethers.getImpersonatedSigner(rankifyInstance.address))
          .lock(adr.players[0].wallet.address, 1, 1);
      });
      it('reports correct balance of unlocked', async () => {
        expect(
          (
            await rankToken.connect(adr.maliciousActor1.wallet).unlockedBalanceOf(adr.players[0].wallet.address, 1)
          ).toNumber(),
        ).to.be.equal(2);
      });
      it('Can be unlocked only by a rankingInstance', async () => {
        await expect(
          rankToken
            .connect(await ethers.getImpersonatedSigner(rankifyInstance.address))
            .unlock(adr.players[0].wallet.address, 1, 1),
        )
          .to.emit(rankToken, 'TokensUnlocked')
          .withArgs(adr.players[0].wallet.address, 1, 1);
        await expect(
          rankToken.connect(adr.maliciousActor1.wallet).unlock(adr.players[0].wallet.address, 1, 1),
        ).to.be.revertedWithCustomError(env.distributor, 'InvalidInstance');
      });
      it('Can only unlock a locked amount tokens', async () => {
        await expect(
          rankToken
            .connect(await ethers.getImpersonatedSigner(rankifyInstance.address))
            .unlock(adr.players[0].wallet.address, 1, 1),
        )
          .to.emit(rankToken, 'TokensUnlocked')
          .withArgs(adr.players[0].wallet.address, 1, 1);
        await expect(
          rankToken
            .connect(await ethers.getImpersonatedSigner(rankifyInstance.address))
            .unlock(adr.players[0].wallet.address, 2, 1),
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
        await rankToken
          .connect(await ethers.getImpersonatedSigner(rankifyInstance.address))
          .unlock(adr.players[0].wallet.address, 1, 1);
        await expect(
          rankToken
            .connect(adr.players[0].wallet)
            .safeTransferFrom(adr.players[0].wallet.address, adr.players[1].wallet.address, 1, 3, '0x'),
        ).to.be.emit(rankToken, 'TransferSingle');
      });
      it('Balance still shows same', async () => {
        expect(
          (
            await rankToken
              .connect(await ethers.getImpersonatedSigner(rankifyInstance.address))
              .balanceOf(adr.players[0].wallet.address, 1)
          ).toNumber(),
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
