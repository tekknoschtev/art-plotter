import type { Generator } from './types';
import { traceContours } from '../geometry/contours';
import { chaikin } from '../geometry/smooth';
import { bindTerrainUI, buildNoiseTerrain, terrainDefaults, type TerrainParams } from '../terrain/noiseTerrain';

export interface ContoursParams {
  terrain: TerrainParams;
  /** Number of contour lines between the lowest and highest point. */
  levels: number;
  /** Height-grid spacing, mm. Smaller = more detail, slower. */
  cellSize: number;
  /** Chaikin smoothing passes applied to each contour. */
  smoothing: number;
}

export const contoursGenerator: Generator<ContoursParams> = {
  id: 'contours',
  name: 'Topographic contours',

  defaults: () => ({
    terrain: terrainDefaults(),
    levels: 40,
    cellSize: 2,
    smoothing: 2,
  }),

  bindUI(f, p) {
    f.addBinding(p, 'levels', { min: 1, max: 300, step: 1 });
    f.addBinding(p, 'cellSize', { label: 'grid mm', min: 0.5, max: 10, step: 0.1 });
    f.addBinding(p, 'smoothing', { min: 0, max: 4, step: 1 });
    bindTerrainUI(f.addFolder({ title: 'Terrain' }), p.terrain);
  },

  generate(p, canvas) {
    const field = buildNoiseTerrain(p.terrain, canvas.width, canvas.height, p.cellSize);
    const smoothing = Math.round(p.smoothing);
    return traceContours(field, p.levels).map((line) => chaikin(line, smoothing));
  },
};
