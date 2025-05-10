import { PublicSignals } from "@solarity/zkit";

export function normalizePublicSignals(
  publicSignals: any[],
  signalNames: string[],
  getSignalDimensions: (name: string) => number[],
): any {
  let index = 0;
  return signalNames.reduce((acc: any, signalName) => {
    const dimensions: number[] = getSignalDimensions(signalName);
    const size: number = dimensions.reduce((a, b) => a * b, 1);

    acc[signalName] = reshape(publicSignals.slice(index, index + size), dimensions);
    index += size;

    return acc;
  }, {});
}

export function denormalizePublicSignals(publicSignals: any, signalNames: string[]): PublicSignals {
  return signalNames.reduce((acc: any[], signalName) => {
    return acc.concat(flatten(publicSignals[signalName]));
  }, []);
}

function reshape(array: number[], dimensions: number[]): any {
  if (dimensions.length === 0) {
    return array[0];
  }

  const [first, ...rest] = dimensions;
  const size: number = rest.reduce((a, b) => a * b, 1);

  const result: any[] = [];
  for (let i = 0; i < first; i++) {
    result.push(reshape(array.slice(i * size, (i + 1) * size), rest));
  }

  return result;
}

function flatten(array: any): number[] {
  return Array.isArray(array) ? array.flatMap((array) => flatten(array)) : array;
}
