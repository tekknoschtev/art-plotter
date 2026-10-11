import type { FolderApi } from 'tweakpane';
import { createFbm3D } from '../noise';
import { normalize, sampleField, type HeightField } from './heightfield';

/** Procedural terrain settings. Shared by the contour and (later) ridgeline generators. */
export interface TerrainParams {
  seed: number;
  /** Size of the largest landforms, mm. */
  scale: number;
  octaves: number;
  /** How much each finer octave contributes (roughness). */
  gain: number;
  /** 0 = rolling hills, 1 = sharp mountain ridges. */
  ridged: number;
  /** Domain warp strength: bends landforms into flowing, swirling shapes. */
  warp: number;
  /** Fades height toward the edges so the terrain becomes an island/peak. */
  island: number;
  /** Island centre as a fraction of width/height. */
  centerX: number;
  centerY: number;
  /** Reshapes heights as h^gamma: >1 packs contours near peaks, <1 near valleys. */
  gamma: number;
}

export function terrainDefaults(): TerrainParams {
  return {
    seed: 4242,
    scale: 320,
    octaves: 4,
    gain: 0.5,
    ridged: 0,
    warp: 0.3,
    island: 0,
    centerX: 0.5,
    centerY: 0.5,
    gamma: 1,
  };
}

export function bindTerrainUI(f: FolderApi, p: TerrainParams): void {
  f.addBinding(p, 'seed', { step: 1, min: 0 });
  f.addBinding(p, 'scale', { label: 'scale mm', min: 10, max: 1500, step: 1 });
  f.addBinding(p, 'octaves', { min: 1, max: 8, step: 1 });
  f.addBinding(p, 'gain', { label: 'roughness', min: 0.1, max: 0.9, step: 0.01 });
  f.addBinding(p, 'ridged', { min: 0, max: 1, step: 0.01 });
  f.addBinding(p, 'warp', { min: 0, max: 3, step: 0.01 });
  f.addBinding(p, 'island', { min: 0, max: 1, step: 0.01 });
  f.addBinding(p, 'centerX', { label: 'island x', min: 0, max: 1, step: 0.01 });
  f.addBinding(p, 'centerY', { label: 'island y', min: 0, max: 1, step: 0.01 });
  f.addBinding(p, 'gamma', { min: 0.2, max: 4, step: 0.01 });
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Samples the terrain over a width × height mm area and normalises it to [0, 1]. */
export function buildNoiseTerrain(p: TerrainParams, width: number, height: number, cellSize: number): HeightField {
  const smooth = createFbm3D(p.seed, p.octaves, p.gain, false);
  const sharp = p.ridged > 0 ? createFbm3D(p.seed, p.octaves, p.gain, true) : null;
  const warpField = p.warp > 0 ? createFbm3D(p.seed + 1, 2) : null;
  const s = p.scale;
  const cx = p.centerX * width;
  const cy = p.centerY * height;
  const radius = Math.min(width, height) / 2;

  const field = sampleField(width, height, cellSize, (x, y) => {
    let nx = x / s;
    let ny = y / s;
    if (warpField) {
      // Offset the lookup by another noise field (z offsets give independent fields).
      const wx = warpField(nx, ny, 11.3);
      const wy = warpField(nx, ny, 47.9);
      nx += p.warp * wx;
      ny += p.warp * wy;
    }
    let h = smooth(nx, ny, 0);
    if (sharp) h = h * (1 - p.ridged) + sharp(nx, ny, 0) * p.ridged;
    h = (h + 1) / 2;
    if (p.island > 0) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      const mask = 1 - smoothstep(0.2, 1.1, d);
      h = h * (1 - p.island) + h * mask * p.island;
    }
    return h;
  });

  normalize(field);
  if (p.gamma !== 1) {
    for (let k = 0; k < field.data.length; k++) field.data[k] = Math.pow(field.data[k], p.gamma);
  }
  return field;
}
