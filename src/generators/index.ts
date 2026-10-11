import type { Generator } from './types';
import { ringsGenerator } from './rings';
import { contoursGenerator } from './contours';

export const generators: Generator[] = [ringsGenerator, contoursGenerator];

export function getGenerator(id: string): Generator {
  return generators.find((g) => g.id === id) ?? generators[0];
}
