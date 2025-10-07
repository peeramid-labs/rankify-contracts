import { HardhatRuntimeEnvironment } from 'hardhat/types';

const getCodeIdFromAddress = (hre: HardhatRuntimeEnvironment) => async (address: string) => {
  return hre.ethers.utils.keccak256(await hre.ethers.provider.getCode(address));
};

export const getCodeIdFromArtifact = (hre: HardhatRuntimeEnvironment) => async (artifactName: string) => {
  const address = (await hre.deployments.get(artifactName)).address;
  const code = await hre.ethers.provider.getCode(address);
  return hre.ethers.utils.keccak256(code);
};

export const getCodeIdFromCode = (hre: HardhatRuntimeEnvironment) => (code: string) => hre.ethers.utils.keccak256(code);

export default { getCodeIdFromAddress, getCodeIdFromArtifact, getCodeIdFromCode };
