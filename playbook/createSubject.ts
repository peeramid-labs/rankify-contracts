import { task } from 'hardhat/config';
import { DAODistributor, MAODistribution, Rankify } from '../types';
import { generateDistributorData } from '../scripts/libraries/generateDistributorData';
import { parseInstantiated } from '../scripts/parseInstantiated';
import { ethers } from 'ethers';

task('createSubject', 'Creates a new subject with MAO distribution')
  .addOptionalParam('metadata', 'Metadata for the rankify contract', 'metadata')
  .addOptionalParam('tokenName', 'Name of the token', 'tokenName')
  .addOptionalParam('tokenSymbol', 'Symbol of the token', 'tokenSymbol')
  .addOptionalParam('rankTokenUri', 'URI for the rank token', 'https://example.com/rank')
  .addOptionalParam(
    'rankTokenContractUri',
    'URI for the rank token contract',
    'ipfs://QmTyThvjSqoW96mVjRSon1gJhtiK2kVpUTLLmuMf4LPEaU',
  )
  // QmTyThvjSqoW96mVjRSon1gJhtiK2kVpUTLLmuMf4LPEaU - peeramid fellowship council
  // QmeSK57MRsJXS1bKZ2m6Sdi7TWQBECn5CxZSiXZDudSGtJ - audius foundation
  // QmXiiiSuWP7UDVh7FR6yXNisPgJW75GgauDPD92LHoGTnG - eip fun discussions
  .addOptionalParam('principalCost', 'Principal cost for ranking', '1')
  .addOptionalParam('principalTimeConstant', 'Time constant for principal', '3600')
  .addOptionalParam(
    'distributorsId',
    'Distributors ID to create game from, defaults to hardhat task defaultDistributionId',
  )
  .addFlag('useFixture', 'Use fixture hardhat-deploy to speedup tests')
  .setAction(async (taskArgs, hre) => {
    const { getNamedAccounts } = hre;
    const distributorDeployment = await hre.deployments.get('DAODistributor');

    const distributorArguments: MAODistribution.DistributorArgumentsStruct = {
      tokenSettings: {
        tokenName: taskArgs.tokenName,
        tokenSymbol: taskArgs.tokenSymbol,
      },
      rankifySettings: {
        rankTokenContractURI: taskArgs.rankTokenContractUri,
        rankTokenURI: taskArgs.rankTokenUri,
        principalCost: ethers.utils.formatUnits(taskArgs.principalCost, 9),
        principalTimeConstant: taskArgs.principalTimeConstant,
      },
    };

    const { DAO } = await getNamedAccounts();

    const distributorContract = new hre.ethers.Contract(
      distributorDeployment.address,
      distributorDeployment.abi,
      await hre.ethers.getSigner(DAO),
    ) as DAODistributor;

    const data = generateDistributorData(distributorArguments);

    const distributorsID = taskArgs.distributorsId ?? (await hre.run('defaultDistributionId'));
    if (!distributorsID) {
      throw new Error('Distribution name not found');
    }

    const token = await hre.deployments.get('Rankify');
    const { DAO: owner } = await hre.getNamedAccounts();
    const oSigner = await hre.ethers.getSigner(owner);
    const tokenContract = new hre.ethers.Contract(token.address, token.abi, oSigner) as Rankify;
    (await tokenContract.mint(oSigner.address, hre.ethers.utils.parseUnits('100', 9))).wait(1);
    (await tokenContract.approve(distributorContract.address, hre.ethers.constants.MaxUint256)).wait(1);
    const tx = await distributorContract.connect(oSigner).instantiate(distributorsID, data);
    const receipt = await tx.wait(1);
    const filter = distributorContract.filters.Instantiated(distributorsID);
    const t = filter.topics && filter.topics[0];
    if (!t) throw new Error('Filter not found');
    const logs = receipt.logs.filter(log => log.topics[0] === t);
    const parsedLog = distributorContract.interface.parseLog(logs[0]);

    console.log('Subject created successfully!');
    console.log('Transaction hash:', tx.hash);
    console.log('DAO URI:', taskArgs.daoUri);
    console.log('Token Name:', taskArgs.tokenName);
    console.log('Token Symbol:', taskArgs.tokenSymbol);
    console.log('instances created', parsedLog.args.instances);
    console.log('instance id', parsedLog.args.newInstanceId);
    // console.log('Receipt:', receipt);
    return {
      instances: parsedLog.args.instances,
      newInstanceId: parsedLog.args.newInstanceId,
      receipt,
      instancesParsed: parseInstantiated(parsedLog.args.instances),
    };
  });

task('makeDemoSubjects', 'Creates 4 demo subjects with different configurations').setAction(async (_, { run }) => {
  console.log('Creating demo subjects...');

  await run('createSubject', {
    tokenName: 'EIP fun discussions token',
    tokenSymbol: 'EIPFD',
    rankTokenContractUri: 'ipfs://QmWJXEhEnNXBtshVR1kR2vfHqU9vCNdcQKQipVAkHHAoU5',
    useFixture: false,
  });

  await run('createSubject', {
    tokenName: 'Rankify inner discussions token',
    tokenSymbol: 'RKFD',
    rankTokenContractUri: 'ipfs://QmVzSvWjysUfVHzGMQ4y2EduXrVYLApZ3KHQb2gUTR4x6P',
    useFixture: false,
  });

  await run('createSubject', {
    tokenName: 'Arbitrum foundation token',
    tokenSymbol: 'ARB',
    rankTokenContractUri: 'ipfs://QmQ2jQj5LXKuTzTcy4ANc57WbABurejbs9hRi4F18tKJWf',
  });

  await run('createSubject', {
    tokenName: 'Optimism Collective token',
    tokenSymbol: 'OP',
    rankTokenContractUri: 'ipfs://QmTDdnzRee6G5My4TDhaffWjCYp2d6rssmPQP4GMW5LuBd',
    useFixture: false,
  });

  await run('createSubject', {
    tokenName: 'Open audius foundation token',
    tokenSymbol: 'AUDIO',
    rankTokenContractUri: 'ipfs://QmWDUV8Eq1VewZsVGZWVzJMNXT8PrZnQqwy6SJfWFzVzBM',
    useFixture: false,
  });

  await run('createSubject', {
    tokenName: 'Rankify music challenge token',
    tokenSymbol: 'RKFM',
    rankTokenContractUri: 'ipfs://QmXnEA3WAn9VNyG2AgvR3a5GR68qD1ZLYRaDWQc66rou5M',
  });

  await run('createSubject', {
    tokenName: 'Rankify kids content token',
    tokenSymbol: 'RKFK',
    rankTokenContractUri: 'ipfs://QmfKRxEM8QM355PvDaGoocgJiM629PBsUW8i2oBWsV4NJh',
    useFixture: false,
  });

  await run('createSubject', {
    tokenName: 'Rankify book writers token',
    tokenSymbol: 'RKFBW',
    rankTokenContractUri: 'ipfs://QmadNd9e2qPqoL9u8qqkfP2253yUMB7R3hfXibx4LKwnvn',
    useFixture: false,
  });

  await run('createSubject', {
    tokenName: 'Peeramid fellowship council token',
    tokenSymbol: 'PFC',
    rankTokenContractUri: 'ipfs://QmaUXPY7TTx9rGS8sgSvZvHRpi6eC8LkfTj1fBRsGBBEjh',
    useFixture: false,
  });

  console.log('Successfully created 8 demo subjects!');
});
