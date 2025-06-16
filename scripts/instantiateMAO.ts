import { Distributor } from '../types';
import { BytesLike } from 'ethers';
import { Signer } from 'ethers';
import { parseInstantiated } from './parseInstantiated';

export const instantiateMAO = async ({
  distributor,
  distributorsId,
  args,
  signer,
}: {
  distributor: Distributor;
  distributorsId: string;
  signer: Signer;
  args: BytesLike;
}) => {
  (await distributor.connect(signer).instantiate(distributorsId, args)).wait();

  const filter = distributor.filters.Instantiated(distributorsId);
  const evts = await distributor.queryFilter(filter);
  if (evts.length === 0) throw new Error('No Instantiated event found');
  if (evts.length > 1) throw new Error('Multiple Instantiated events found');
  const instances = evts[0].args.instances;

  return parseInstantiated(instances);
};

export default instantiateMAO;
