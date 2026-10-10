import type { Generator } from './types';
import { ringsGenerator } from './rings';

export const generators: Generator[] = [ringsGenerator];

export function getGenerator(id: string): Generator {
  return generators.find((g) => g.id === id) ?? generators[0];
}
