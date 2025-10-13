/* global  ethers */

import { deployments, ethers, getNamedAccounts } from 'hardhat';
import hre from 'hardhat';
import { expect } from 'chai';
import { MAODistribution, DAODistributor, Rankify, RankifyDiamondInstance, RankToken, Governor } from '../types';
import { setupTest } from './utils';

import { getCodeIdFromArtifact } from '../scripts/getCodeId';
import addDistribution from '../scripts/addDistribution';
import { generateDistributorData } from '../scripts/libraries/generateDistributorData';
import { AdrSetupResult } from '../scripts/setupMockEnvironment';
import { parseInstantiated } from '../scripts/parseInstantiated';

describe('MAODistribution', async function () {
  let contract: MAODistribution;
  let distributorContract: DAODistributor;
  let maoId: string;
  let rankify: Rankify;
  let addr: AdrSetupResult;
  let distrId: string;
  beforeEach(async function () {
    const setup = await setupTest();
    addr = setup.adr;
    console.log('setup complete');
    contract = setup.env.maoDistribution;
    const maoCode = await hre.ethers.provider.getCode(contract.address);
    maoId = ethers.utils.keccak256(maoCode);
    distributorContract = setup.env.distributor;

    rankify = setup.env.rankifyToken;

    distrId = await hre.run('defaultDistributionId');
    if (!distrId) throw new Error('Distribution name not found');
    if (typeof distrId !== 'string') throw new Error('Distribution name must be a string');
  });
  it('only owner can add distribution', async () => {
    await expect(
      distributorContract.addNamedDistribution(distrId, maoId, ethers.constants.AddressZero),
    ).to.revertedWithCustomError(distributorContract, 'AccessControlUnauthorizedAccount');
    await expect(
      distributorContract
        .connect(addr.gameOwner.wallet)
        .addNamedDistribution(distrId, maoId, ethers.constants.AddressZero),
    ).to.emit(distributorContract, 'DistributionAdded');
  });
  describe('when distribution was added', async () => {
    beforeEach(async () => {
      const { owner } = await hre.getNamedAccounts();
      const signer = await hre.ethers.getSigner(owner);
      await addDistribution(hre)({
        distrId: await getCodeIdFromArtifact(hre)('MAODistribution'),
        signer,
        name: distrId,
      });
    });
    it('Can instantiate a distribution', async () => {
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
          rankTokenContractURI: 'https://example.com/rank',
          rankTokenURI: 'https://example.com/rank',
          principalCost: 1,
          principalTimeConstant: 1,
          paymentToken: rankify.address,
        },
      };
      // Encode the arguments using generateDistributorData
      const data = generateDistributorData(distributorArguments);
      const token = await deployments.get('Rankify');

      const tokenContract = new ethers.Contract(token.address, token.abi, oSigner) as Rankify;
      await tokenContract.mint(oSigner.address, ethers.utils.parseUnits('100', 9));
      await tokenContract.approve(distributorContract.address, ethers.constants.MaxUint256);

      const tx = distributorContract.connect(oSigner).instantiate(distrId, data);
      await expect(tx).not.reverted;
      expect((await distributorContract.functions.getDistributions()).length).to.equal(1);
      const filter = distributorContract.filters.Instantiated();
      const evts = await distributorContract.queryFilter(filter);
      expect(evts.length).to.equal(1);

      const ACIDContract = (await ethers.getContractAt(
        'RankifyDiamondInstance',
        parseInstantiated(evts[0].args.instances).ACIDInstance,
      )) as RankifyDiamondInstance;
      expect((await ACIDContract.functions['getGM(uint256)'](0))[0]).to.equal(ethers.constants.AddressZero);
      const filter2 = ACIDContract.filters.RankifyInstanceInitialized();
      const evts2 = await ACIDContract.queryFilter(filter2);
      expect(evts2.length).to.equal(1);
    });
    it('Can allows DAO to set contractURI', async () => {
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
          rankTokenContractURI: 'https://example.com/rank',
          rankTokenURI: 'https://example.com/rank',
          principalCost: 1,
          principalTimeConstant: 1,
          paymentToken: rankify.address,
        },
      };
      // Encode the arguments using generateDistributorData
      const data = generateDistributorData(distributorArguments);

      const token = await deployments.get('Rankify');
      const tokenContract = new ethers.Contract(token.address, token.abi, oSigner) as Rankify;
      await tokenContract.mint(oSigner.address, ethers.utils.parseUnits('100', 9));
      await tokenContract.approve(distributorContract.address, ethers.constants.MaxUint256);

      const tx = await distributorContract.connect(oSigner).instantiate(distrId, data);
      await expect(tx).not.reverted;
      expect((await distributorContract.functions.getDistributions()).length).to.equal(1);
      const filter = distributorContract.filters.Instantiated();
      const evts = await distributorContract.queryFilter(filter);
      expect(evts.length).to.equal(1);

      const RankTokenContract = (await ethers.getContractAt(
        'RankToken',
        parseInstantiated(evts[0].args.instances).rankToken,
      )) as RankToken;
      const governor = (await ethers.getContractAt(
        'Governor',
        parseInstantiated(evts[0].args.instances).governor,
      )) as Governor;
      const DAOSigner = await ethers.getImpersonatedSigner(governor.address);
      await oSigner.sendTransaction({
        to: governor.address,
        value: ethers.utils.parseEther('0.1'),
      });
      await RankTokenContract.connect(DAOSigner).setContractURI('foo');
      await RankTokenContract.connect(DAOSigner).setURI('Uri_foo');
      expect(await RankTokenContract.contractURI()).to.equal('foo');
      expect(await RankTokenContract.uri(1)).to.equal('Uri_foo');
      expect(await RankTokenContract.owner()).to.be.equal(governor.address);
    });
  });
});
