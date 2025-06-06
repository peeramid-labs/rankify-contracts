import { ethers } from 'ethers';
import { MAODistribution } from '../../types/src/distributions/MAODistribution';

export function generateDistributorData(args: MAODistribution.DistributorArgumentsStruct): string {
  const data = ethers.utils.defaultAbiCoder.encode(
    [
      'tuple(tuple(string tokenName, string tokenSymbol, uint256[] preMintAmounts, address[] preMintReceivers, string orgName, uint48 votingDelay, uint32 votingPeriod, uint256 quorum) govSettings, tuple(uint256 principalCost, uint256 principalTimeConstant, string rankTokenURI, string rankTokenContractURI, address paymentToken) rankifySettings)',
    ],
    [args],
  );
  return data;
}
