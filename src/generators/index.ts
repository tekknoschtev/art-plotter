import type { Generator } from './types';
import { ringsGenerator } from './rings';
import { contoursGenerator } from './contours';
import { ridgelinesGenerator } from './ridgelines';

export const generators: Generator[] = [ringsGenerator, contoursGenerator, ridgelinesGenerator];

export function getGenerator(id: string): Generator {
  return generators.find((g) => g.id === id) ?? generators[0];
}
