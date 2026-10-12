import type { Generator } from './types';
import type { Polyline } from '../types';
import { drawableRect } from '../types';
import { removeHiddenLines } from '../geometry/horizon';
import { sampleHeight } from '../terrain/heightfield';
import { bindTerrainUI, buildTerrain, terrainDefaults, type TerrainParams } from '../terrain/terrain';

export interface RidgelinesParams {
  terrain: TerrainParams;
  /** Number of stacked lines. */
  lines: number;
  /** Height of the tallest peak on the front line, mm. */
  amplitude: number;
  /** How deep the terrain extends from the front line to the back line, mm (world units). */
  depth: number;
  /** 0 = flat, stacked view; higher = rows shrink and bunch up toward the back. */
  perspective: number;
  /** Widen the terrain so the back row still spans the page (front rows get clipped). */
  fillWidth: boolean;
  /** Heights below this become flat "water", 0–1. */
  seaLevel: number;
  /** Flattens the left and right edges, Joy Division style, 0–1. */
  flattenEdges: number;
  /** Remove line segments hidden behind nearer ridges. */
  hideHidden: boolean;
  /** Spacing between samples along each line, mm. */
  resolution: number;
  /** Height-grid spacing, mm. */
  cellSize: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const ridgelinesGenerator: Generator<RidgelinesParams> = {
  id: 'ridgelines',
  name: 'Ridgelines',

  defaults: () => ({
    terrain: { ...terrainDefaults(), scale: 260, island: 0.6, ridged: 0.3 },
    lines: 70,
    amplitude: 70,
    depth: 500,
    perspective: 0.3,
    fillWidth: true,
    seaLevel: 0.15,
    flattenEdges: 0,
    hideHidden: true,
    resolution: 1,
    cellSize: 2,
  }),

  presets: {
    'Mountain': () => ridgelinesGenerator.defaults(),
    'Joy Division': () => ({
      ...ridgelinesGenerator.defaults(),
      terrain: { ...terrainDefaults(), scale: 45, octaves: 3, warp: 0.2 },
      lines: 60,
      amplitude: 45,
      perspective: 0,
      fillWidth: false,
      seaLevel: 0.35,
      flattenEdges: 1,
    }),
    'Rolling hills': () => ({
      ...ridgelinesGenerator.defaults(),
      terrain: { ...terrainDefaults(), scale: 400, octaves: 3, warp: 0.4 },
      lines: 90,
      amplitude: 35,
      perspective: 0.4,
      seaLevel: 0,
    }),
  },

  bindUI(f, p) {
    f.addBinding(p, 'lines', { min: 2, max: 400, step: 1 });
    f.addBinding(p, 'amplitude', { label: 'height mm', min: 0, max: 400, step: 1 });
    f.addBinding(p, 'depth', { label: 'depth mm', min: 50, max: 3000, step: 10 });
    f.addBinding(p, 'perspective', { min: 0, max: 2, step: 0.01 });
    f.addBinding(p, 'fillWidth', { label: 'fill width' });
    f.addBinding(p, 'seaLevel', { label: 'sea level', min: 0, max: 0.95, step: 0.01 });
    f.addBinding(p, 'flattenEdges', { label: 'flatten edges', min: 0, max: 1, step: 0.01 });
    f.addBinding(p, 'hideHidden', { label: 'hide hidden' });
    f.addBinding(p, 'resolution', { label: 'sample mm', min: 0.2, max: 5, step: 0.1 });
    f.addBinding(p, 'cellSize', { label: 'grid mm', min: 0.5, max: 10, step: 0.1 });
    bindTerrainUI(f.addFolder({ title: 'Terrain' }), p.terrain);
  },

  generate(p, canvas) {
    const rect = drawableRect(canvas);
    const drawW = rect.x1 - rect.x0;
    const count = Math.max(2, Math.round(p.lines));
    // Row scale with depth d ∈ [0, 1] (0 = front): a simple pinhole-style falloff.
    const scaleAt = (d: number) => 1 / (1 + p.perspective * 3 * d);
    const backScale = scaleAt(1);

    const worldW = p.fillWidth ? drawW / backScale : drawW;
    const field = buildTerrain(p.terrain, worldW, p.depth, p.cellSize);

    // Front row sits on the bottom margin; the back row leaves room for its peaks.
    const yFront = rect.y0;
    const yBack = Math.max(yFront, rect.y1 - p.amplitude * backScale * 0.6);
    // Baseline position: with perspective, rows bunch up toward the back.
    const baseAt = (d: number) => {
      const f = p.perspective > 0 ? (1 - scaleAt(d)) / (1 - backScale) : d;
      return yFront + (yBack - yFront) * f;
    };

    const cx = (rect.x0 + rect.x1) / 2;
    const samples = Math.max(2, Math.ceil(worldW / p.resolution));
    const sea = Math.min(0.95, Math.max(0, p.seaLevel));

    const rows: Polyline[] = [];
    for (let r = 0; r < count; r++) {
      const d = r / (count - 1);
      const s = scaleAt(d);
      const base = baseAt(d);
      const wz = d * p.depth;
      const row: Polyline = [];
      for (let k = 0; k <= samples; k++) {
        const wx = (k / samples) * worldW;
        let h = sampleHeight(field, wx, wz);
        h = Math.max(0, h - sea) / (1 - sea);
        if (p.flattenEdges > 0) {
          // Bell-shaped window across the row, measured in screen space.
          const u = Math.abs(wx - worldW / 2) / (worldW / 2);
          h *= 1 - p.flattenEdges * smoothstep(0.25, 0.85, u * s * (worldW / drawW));
        }
        row.push([cx + (wx - worldW / 2) * s, base + h * p.amplitude * s]);
      }
      rows.push(row);
    }

    return p.hideHidden ? removeHiddenLines(rows) : rows;
  },
};
