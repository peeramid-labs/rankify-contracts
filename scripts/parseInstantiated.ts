export interface MAOInstances {
  governor: string;
  govToken: string;
  govTokenAccessManager: string;
  ACIDInstance: string;
  ACIDAccessManager: string;
  rankToken: string;
  paymentToken: string;
}

export const parseInstantiated = (instances: string[]): MAOInstances => {
  return {
    govToken: instances[0],
    govTokenAccessManager: instances[1],
    governor: instances[2],
    ACIDInstance: instances[3],
    ACIDAccessManager: instances[4],
    rankToken: instances[5],
    paymentToken: instances[6],
  };
};
