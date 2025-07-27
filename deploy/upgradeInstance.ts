import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { Rankify } from '../types';
import { ethers } from 'hardhat';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer, owner } = await getNamedAccounts();
  const { diamond } = deployments;
  const libRankifyDeployment = await deploy('LibRankify', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  const rankifyInstanceMainFacetDeployment = await deploy('RankifyInstanceMainFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    libraries: {
      LibRankify: libRankifyDeployment.address,
    },
  });
  const rankifyInstanceRequirementsFacetDeployment = await deploy('RankifyInstanceRequirementsFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    libraries: {
      LibRankify: libRankifyDeployment.address,
    },
  });
  const rankifyInstanceGameMastersFacetDeployment = await deploy('RankifyInstanceGameMastersFacet', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    libraries: {
      LibRankify: libRankifyDeployment.address,
    },
  });

  // In order to upgrade, put instance address in deployment dir of UpgradableInstance
  const tx = await diamond.deploy('UpgradableInstance', {
    from: owner, // this need to be the diamondAdmin for upgrade
    owner: owner,
    facets: [
      {
        name: 'EIP712InspectorFacet',
        contract: 'EIP712InspectorFacet',
      },
      {
        name: 'RankifyInstanceMainFacet',
        contract: 'RankifyInstanceMainFacet',
        libraries: {
          LibRankify: libRankifyDeployment.address,
        },
      },
      {
        name: 'RankifyInstanceRequirementsFacet',
        contract: 'RankifyInstanceRequirementsFacet',
        libraries: {
          LibRankify: libRankifyDeployment.address,
        },
      },
      {
        name: 'RankifyInstanceGameMastersFacet',
        contract: 'RankifyInstanceGameMastersFacet',
        libraries: {
          LibRankify: libRankifyDeployment.address,
        },
      },
      {
        name: 'RankifyInstanceInit',
        contract: 'RankifyInstanceInit',
      },
    ],
  });
};
export default func;
func.tags = ['upgradeInstance'];
