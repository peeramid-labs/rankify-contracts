import { ethers } from 'ethers';
import { MAODistribution } from '../../types/src/distributions/MAODistribution';

export function generateDistributorData(args: MAODistribution.DistributorArgumentsStruct): string {
  const data = ethers.utils.defaultAbiCoder.encode(
    [
      'tuple(tuple(string tokenName, string tokenSymbol) tokenSettings, tuple(uint256 principalCost, uint256 principalTimeConstant, string rankTokenURI, string rankTokenContractURI, address owner) rankifySettings)',
    ],
    [args],
  );
  return data;
}
