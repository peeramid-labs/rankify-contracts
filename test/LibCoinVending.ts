import { deployments, ethers } from 'hardhat';
import { expect } from 'chai';
import { MockERC1155, MockVendingMachine, MockERC20, MockERC721 } from '../types/src/mocks';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { LibCoinVending } from '../types/src/mocks/MockVendingMachine';
import { Wallet } from 'ethers';

const eth0 = ethers.utils.parseEther('0');
const eth1 = ethers.utils.parseEther('0.1');
const eth2 = ethers.utils.parseEther('0.2');
const eth3 = ethers.utils.parseEther('0.3');
const eth4 = ethers.utils.parseEther('0.4');
const eth5 = ethers.utils.parseEther('0.5');
const eth10 = ethers.utils.parseEther('1');
const eth100 = ethers.utils.parseEther('1000');
const valueToHave = eth5;
const valueToLock = eth1;
const valueToBurn = eth2;
const valueToAward = eth3;
const valueToAccept = eth4;

describe('LibCoinVending Test', async function () {
  let mockCoinVending: MockVendingMachine;
  let signer: SignerWithAddress | Wallet;
  let payee: SignerWithAddress | Wallet;
  let maliciousActor: SignerWithAddress | Wallet;
  let beneficiary: SignerWithAddress | Wallet;
  let mockERC1155: MockERC1155;
  let mockERC20: MockERC20;
  let mockERC721: MockERC721;
  let ReqTokens: LibCoinVending.ConfigSmartRequirementStruct[] = [];

  beforeEach(async function () {
    const setupTest = deployments.createFixture(async ({ deployments, getNamedAccounts, ethers }, options) => {
      await deployments.fixture(); // ensure you start from a fresh deployments
      const signers = await ethers.getSigners();
      signer = signers[0];
      payee = signers[1];
      beneficiary = signers[2];
      maliciousActor = signers[3];

      const MockCoinVending = await ethers.getContractFactory('MockVendingMachine');
      const _mockCoinVending = (await MockCoinVending.deploy()) as MockVendingMachine;
      await _mockCoinVending.deployed();

      const MockERC20 = await ethers.getContractFactory('MockERC20');
      const _mockERC20 = (await MockERC20.deploy('ERC20', 'ERC20', signer.address)) as MockERC20;
      await _mockERC20.deployed();
      await _mockERC20.mint(signer.address, eth100);
      await _mockERC20.approve(_mockCoinVending.address, eth100);
      await _mockERC20.connect(maliciousActor).approve(_mockCoinVending.address, eth100);

      const MockERC721 = await ethers.getContractFactory('MockERC721');
      const _mockERC721 = (await MockERC721.deploy('ERC721', 'ERC721', signer.address)) as MockERC721;
      await _mockERC721.deployed();

      for (let i = 1; i < 100; i++) {
        await _mockERC721.mintNext(signer.address);
      }
      await _mockERC721.setApprovalForAll(_mockCoinVending.address, true);
      await _mockERC721.connect(maliciousActor).setApprovalForAll(_mockCoinVending.address, true);

      const MockERC1155 = await ethers.getContractFactory('MockERC1155');
      const _mockERC1155 = (await MockERC1155.deploy(' ', signer.address)) as MockERC1155;
      await _mockERC1155.deployed();
      await _mockERC1155.setApprovalForAll(_mockCoinVending.address, true);
      await _mockERC1155.connect(maliciousActor).setApprovalForAll(_mockCoinVending.address, true);

      await _mockERC1155.batchMint(
        signer.address,
        ['1', '2', '3', '4', '5', '6'],
        [eth100, eth100, eth100, eth100, eth100, eth100],
        '0x',
      );
      ReqTokens = [];
      //ERC20
      ReqTokens.push({
        contractAddress: _mockERC20.address,
        contractId: '0',
        contractType: '0',
        contractRequirement: {
          have: { amount: valueToHave, data: '0x' },
          lock: { amount: valueToLock, data: '0x' },
          burn: { amount: valueToBurn, data: '0x' },
          bet: { amount: valueToAward, data: '0x' },
          pay: { amount: valueToAccept, data: '0x' },
        },
      });

      //ERC1155
      ReqTokens.push({
        contractAddress: _mockERC1155.address,
        contractId: '1',
        contractType: '1',
        contractRequirement: {
          have: { amount: valueToHave, data: '0x' },
          lock: { amount: valueToLock, data: '0x' },
          burn: { amount: valueToBurn, data: '0x' },
          bet: { amount: valueToAward, data: '0x' },
          pay: { amount: valueToAccept, data: '0x' },
        },
      });

      //ERC721 have (balance)
      ReqTokens.push({
        contractAddress: _mockERC721.address,
        contractId: '1',
        contractType: '2',
        contractRequirement: {
          have: { amount: '1', data: '0x' },
          lock: { amount: '0', data: '0x' },
          burn: { amount: '0', data: '0x' },
          bet: { amount: '0', data: '0x' },
          pay: { amount: '0', data: '0x' },
        },
      });

      mockERC20 = _mockERC20;
      mockERC721 = _mockERC721;
      mockERC1155 = _mockERC1155;
      mockCoinVending = _mockCoinVending;
    });
    await setupTest();
  });

  it('Should be able to create new position without tokens', async () => {
    await expect(
      mockCoinVending.createPosition(ethers.utils.formatBytes32String('test position'), {
        ethValues: {
          have: valueToHave,
          lock: valueToLock,
          burn: valueToBurn,
          bet: valueToAward,
          pay: valueToAccept,
        },
        contracts: [],
      }),
    ).not.to.be.reverted;
  });
  it('Should revert on interaction with non existent positions', async () => {
    await expect(
      mockCoinVending.fund(ethers.utils.formatBytes32String('nonExistentPosition'), { value: eth1 }),
    ).to.be.revertedWith('Position does not exist');
    await expect(
      mockCoinVending.refund(ethers.utils.formatBytes32String('nonExistentPosition'), signer.address),
    ).to.be.revertedWith('Not enough balance to refund');
    await expect(
      mockCoinVending.release(
        ethers.utils.formatBytes32String('nonExistentPosition'),
        payee.address,
        beneficiary.address,
      ),
    ).to.be.revertedWith('Not enough balance to release');
  });
  describe('When position without tokens created', () => {
    beforeEach(async () => {
      const _req: LibCoinVending.ConfigPositionStruct = {
        ethValues: {
          have: valueToHave,
          lock: valueToLock,
          burn: valueToBurn,
          bet: valueToAward,
          pay: valueToAccept,
        },
        contracts: [],
      };
      await mockCoinVending.createPosition(ethers.utils.formatBytes32String('test position1'), _req);
    });
    it('Allows to fund with correct value', async () => {
      await expect(mockCoinVending.fund(ethers.utils.formatBytes32String('test position1'), { value: eth10 })).not.to.be
        .reverted;
    });
    it('Reverts attempt to fund with not enough value', async () => {
      await expect(
        mockCoinVending.fund(ethers.utils.formatBytes32String('test position1'), { value: eth5 }),
      ).to.be.revertedWith('msg.value too low');
    });
    it('Reverts attempt to refund', async () => {
      await expect(
        mockCoinVending.refund(ethers.utils.formatBytes32String('test position1'), signer.address),
      ).to.be.revertedWith('Not enough balance to refund');
    });
    it('Reverts attempt to release', async () => {
      await expect(
        mockCoinVending.release(ethers.utils.formatBytes32String('test position1'), signer.address, signer.address),
      ).to.be.revertedWith('Not enough balance to release');
    });
    it('Funding takes away proper value and Refunded address gets same balance as before funding', async () => {
      const initialBalance = await ethers.provider.getBalance(signer.address);

      let tx = await mockCoinVending.fund(ethers.utils.formatBytes32String('test position1'), { value: eth10 });
      let txReceipt = await tx.wait();
      let gasSpent = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
      let updatedBalance = await ethers.provider.getBalance(signer.address);
      expect(initialBalance).to.be.equal(updatedBalance.add(gasSpent).add(eth10));
      tx = await mockCoinVending.refund(ethers.utils.formatBytes32String('test position1'), signer.address);
      txReceipt = await tx.wait();
      let gasSpent2 = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
      updatedBalance = await ethers.provider.getBalance(signer.address);
      expect(initialBalance).to.be.equal(updatedBalance.add(gasSpent).add(gasSpent2));
    });
    it('Release brings correct values back to founder, beneficiary and payee', async () => {
      const initialBalance = await ethers.provider.getBalance(signer.address);
      const initialPayeeBalance = await ethers.provider.getBalance(payee.address);
      const initialBeneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);

      let tx = await mockCoinVending.fund(ethers.utils.formatBytes32String('test position1'), { value: eth10 });
      let txReceipt = await tx.wait();
      let gasSpent = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
      let updatedBalance = await ethers.provider.getBalance(signer.address);
      expect(initialBalance).to.be.equal(updatedBalance.add(gasSpent).add(eth10));
      tx = await mockCoinVending.release(
        ethers.utils.formatBytes32String('test position1'),
        payee.address,
        beneficiary.address,
      );
      txReceipt = await tx.wait();
      let gasSpent2 = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
      updatedBalance = await ethers.provider.getBalance(signer.address);
      const payeeBalance = await ethers.provider.getBalance(payee.address);
      const beneficiaryBalance = await ethers.provider.getBalance(beneficiary.address);
      expect(initialBalance.sub(valueToAccept).sub(valueToAward).sub(valueToBurn)).to.be.equal(
        updatedBalance.add(gasSpent).add(gasSpent2),
      );
      expect(beneficiaryBalance).to.be.equal(initialBeneficiaryBalance.add(valueToAward));
      expect(payeeBalance).to.be.equal(initialPayeeBalance.add(valueToAccept));
    });
  });
  describe('When position with custom tokens is implemented', () => {
    beforeEach(async () => {
      const _req: LibCoinVending.ConfigPositionStruct = {
        ethValues: {
          have: '0',
          lock: '0',
          burn: '0',
          bet: '0',
          pay: '0',
        },
        contracts: ReqTokens,
      };
      await mockCoinVending.createPosition(ethers.utils.formatBytes32String('tokens'), _req);
    });
    it('Takes all required tokens in fund stage', async () => {
      await mockCoinVending.fund(ethers.utils.formatBytes32String('tokens'));
    });
    it('Reverts attempt to fund with not enough tokens', async () => {
      await expect(
        mockCoinVending.connect(maliciousActor).fund(ethers.utils.formatBytes32String('tokens')),
      ).to.be.revertedWithCustomError(mockERC20, 'ERC20InsufficientBalance');
      const balanceERC20 = await mockERC20.balanceOf(signer.address);
      await mockERC20.transfer(maliciousActor.address, balanceERC20);
      await expect(
        mockCoinVending.connect(maliciousActor).fund(ethers.utils.formatBytes32String('tokens')),
      ).to.be.revertedWith('ERC1155 balance is not valid');
      const balanceERC1155 = await mockERC1155.balanceOf(signer.address, '1');
      await mockERC1155.safeTransferFrom(signer.address, maliciousActor.address, '1', balanceERC1155, '0x');
      await expect(
        mockCoinVending.connect(maliciousActor).fund(ethers.utils.formatBytes32String('tokens')),
      ).to.be.revertedWith('Not enough ERC721 balance');
      await mockERC721['safeTransferFrom(address,address,uint256)'](signer.address, maliciousActor.address, '1');
      await expect(mockCoinVending.connect(maliciousActor).fund(ethers.utils.formatBytes32String('tokens'))).to.not.be
        .reverted;
    });
    it('Reverts attempt to refund', async () => {
      await expect(
        mockCoinVending.refund(ethers.utils.formatBytes32String('tokens'), signer.address),
      ).to.be.revertedWith('Not enough balance to refund');
    });
    it('Reverts attempt to release', async () => {
      await expect(
        mockCoinVending.release(ethers.utils.formatBytes32String('tokens'), signer.address, signer.address),
      ).to.be.revertedWith('Not enough balance to release');
    });
    it('Funding takes away proper tokens and Refunded address gets tokens back as before funding', async () => {
      const erc20initialBalance = await mockERC20.balanceOf(signer.address);
      const erc1155initialBalance = await mockERC1155.balanceOf(signer.address, '1');
      await mockCoinVending.fund(ethers.utils.formatBytes32String('tokens'));

      expect(await mockERC20.balanceOf(mockCoinVending.address)).to.be.equal(eth10);
      expect(await mockERC1155.balanceOf(mockCoinVending.address, '1')).to.be.equal(eth10);
      expect(await mockERC721.ownerOf('1')).to.be.equal(signer.address);

      await mockCoinVending.refund(ethers.utils.formatBytes32String('tokens'), signer.address);
      expect(await mockERC20.balanceOf(signer.address)).to.be.equal(erc20initialBalance);
      expect(await mockERC1155.balanceOf(signer.address, '1')).to.be.equal(erc1155initialBalance);
      expect(await mockERC721.ownerOf('1')).to.be.equal(signer.address);
    });
    it('brings correct values upon Fund & Release back to founder, beneficiary and payee', async () => {
      await mockCoinVending.fund(ethers.utils.formatBytes32String('tokens'));
      const balanceBefore1155 = await mockERC1155.balanceOf(signer.address, '1');
      const balanceBefore20 = await mockERC20.balanceOf(signer.address);
      await mockCoinVending.release(ethers.utils.formatBytes32String('tokens'), payee.address, beneficiary.address);
      expect(await mockERC20.balanceOf(beneficiary.address)).to.be.equal(valueToAward);
      expect(await mockERC20.balanceOf(payee.address)).to.be.equal(valueToAccept);
      expect(await mockERC20.balanceOf(signer.address)).to.be.equal(valueToLock.add(balanceBefore20));
      expect(await mockERC1155.balanceOf(mockCoinVending.address, '1')).to.be.equal('0');
      expect(await mockERC1155.balanceOf(beneficiary.address, '1')).to.be.equal(valueToAward);
      expect(await mockERC1155.balanceOf(payee.address, '1')).to.be.equal(valueToAccept);
      expect(await mockERC1155.balanceOf(signer.address, '1')).to.be.equal(valueToLock.add(balanceBefore1155));
      expect(await mockERC1155.balanceOf(mockCoinVending.address, '1')).to.be.equal('0');
    });
  });
  describe('Bank functionality', () => {
    beforeEach(async () => {
      const _req: LibCoinVending.ConfigPositionStruct = {
        ethValues: {
          have: valueToHave,
          lock: valueToLock,
          burn: valueToBurn,
          bet: valueToAward,
          pay: valueToAccept,
        },
        contracts: [],
      };
      await mockCoinVending.createPosition(ethers.utils.formatBytes32String('bank test'), _req);
    });

    it('Excess ETH from funding should go to the funders bank and be withdrawable', async () => {
      const requiredEth = valueToLock.add(valueToBurn).add(valueToAward).add(valueToAccept);
      const excessEth = ethers.utils.parseEther('1');
      const initialFunderBalance = await ethers.provider.getBalance(signer.address);

      // Fund with excess value
      const fundTx = await mockCoinVending.fund(ethers.utils.formatBytes32String('bank test'), {
        value: requiredEth.add(excessEth),
      });
      const fundTxReceipt = await fundTx.wait();
      const fundGas = fundTxReceipt.gasUsed.mul(fundTxReceipt.effectiveGasPrice);

      // Check bank has excess ETH
      expect(await mockCoinVending.getPullableEth(signer.address)).to.be.equal(excessEth);

      const afterFundBalance = await ethers.provider.getBalance(signer.address);
      expect(initialFunderBalance).to.be.equal(afterFundBalance.add(fundGas).add(requiredEth).add(excessEth));

      // Pull ETH from bank
      const pullTx = await mockCoinVending.pullEth(signer.address, excessEth);
      const pullTxReceipt = await pullTx.wait();
      const pullGas = pullTxReceipt.gasUsed.mul(pullTxReceipt.effectiveGasPrice);

      // Check final balance and that bank is empty
      const finalFunderBalance = await ethers.provider.getBalance(signer.address);
      expect(afterFundBalance.add(excessEth)).to.be.equal(finalFunderBalance.add(pullGas));
      expect(await mockCoinVending.getPullableEth(signer.address)).to.be.equal(0);
    });

    it("Failed ETH transfer on release should go to recipient's bank", async () => {
      const requiredEth = valueToLock.add(valueToBurn).add(valueToAward).add(valueToAccept);

      // Fund position
      await mockCoinVending.fund(ethers.utils.formatBytes32String('bank test'), { value: requiredEth });
      const initialPayeeBalance = await ethers.provider.getBalance(mockERC20.address);

      // Release to a contract that cannot receive ETH
      await mockCoinVending.release(
        ethers.utils.formatBytes32String('bank test'),
        mockERC20.address, // payee
        beneficiary.address,
      );

      // Check that payee's bank has the funds
      expect(await mockCoinVending.getPullableEth(mockERC20.address)).to.be.equal(valueToAccept);

      // Check that payee's ETH balance has not changed
      const finalPayeeBalance = await ethers.provider.getBalance(mockERC20.address);
      expect(initialPayeeBalance).to.be.equal(finalPayeeBalance);

      // Check other recipients' banks are empty
      expect(await mockCoinVending.getPullableEth(beneficiary.address)).to.be.equal(0);
      expect(await mockCoinVending.getPullableEth(signer.address)).to.be.equal(0);
    });
  });
});
