import type { Generator } from './types';
import type { Polyline } from '../types';
import { createFbm3D } from '../noise';

export interface RingsParams {
  seed: number;
  /** Centre as a fraction of artwork width/height. */
  centerX: number;
  centerY: number;
  rings: number;
  /** Base distance between rings, mm. */
  spacing: number;
  innerRadius: number;
  /** Maximum radial displacement, mm. */
  noiseAmount: number;
  /** Size of noise features, mm. Larger = broader, smoother waves. */
  noiseScale: number;
  octaves: number;
  /** How much the noise changes from ring to ring. 0 = every ring follows the same field. */
  evolution: number;
  /** Displacement grows outward as (i / rings) ^ growth. 0 = uniform. */
  growth: number;
  /** Keep rings from touching or crossing. */
  preventOverlap: boolean;
  /** Smallest allowed gap between neighbouring rings, mm (when preventOverlap is on). */
  minGap: number;
  /** Distance between sample points along a ring, mm. */
  resolution: number;
}

export const ringsGenerator: Generator<RingsParams> = {
  id: 'rings',
  name: 'Concentric rings',

  defaults: () => ({
    seed: 1234,
    centerX: 0.5,
    centerY: 0.5,
    rings: 60,
    spacing: 3,
    innerRadius: 4,
    noiseAmount: 25,
    noiseScale: 120,
    octaves: 2,
    evolution: 0.03,
    growth: 1,
    preventOverlap: true,
    minGap: 0.8,
    resolution: 1,
  }),

  bindUI(f, p) {
    f.addBinding(p, 'seed', { step: 1, min: 0 });
    f.addBinding(p, 'centerX', { label: 'center x', min: -0.5, max: 1.5, step: 0.01 });
    f.addBinding(p, 'centerY', { label: 'center y', min: -0.5, max: 1.5, step: 0.01 });
    f.addBinding(p, 'rings', { min: 1, max: 400, step: 1 });
    f.addBinding(p, 'spacing', { label: 'spacing mm', min: 0.5, max: 30, step: 0.1 });
    f.addBinding(p, 'innerRadius', { label: 'inner radius', min: 0, max: 300, step: 0.5 });
    f.addBinding(p, 'noiseAmount', { label: 'noise mm', min: 0, max: 200, step: 0.5 });
    f.addBinding(p, 'noiseScale', { label: 'noise scale', min: 5, max: 800, step: 1 });
    f.addBinding(p, 'octaves', { min: 1, max: 6, step: 1 });
    f.addBinding(p, 'evolution', { min: 0, max: 0.5, step: 0.005 });
    f.addBinding(p, 'growth', { min: 0, max: 4, step: 0.05 });
    f.addBinding(p, 'preventOverlap', { label: 'no overlap' });
    f.addBinding(p, 'minGap', { label: 'min gap mm', min: 0, max: 10, step: 0.1 });
    f.addBinding(p, 'resolution', { label: 'sample mm', min: 0.2, max: 5, step: 0.1 });
  },

  generate(p, canvas) {
    const fbm = createFbm3D(p.seed, p.octaves);
    const cx = p.centerX * canvas.width;
    const cy = p.centerY * canvas.height;
    const count = Math.max(1, Math.round(p.rings));
    const maxRadius = p.innerRadius + (count - 1) * p.spacing + p.noiseAmount;
    // All rings share the same angular samples so neighbours can be compared
    // point-by-point for the overlap check.
    const n = Math.min(20000, Math.max(32, Math.ceil((2 * Math.PI * maxRadius) / p.resolution)));
    const cos = new Float64Array(n);
    const sin = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      cos[k] = Math.cos((2 * Math.PI * k) / n);
      sin[k] = Math.sin((2 * Math.PI * k) / n);
    }

    const lines: Polyline[] = [];
    let prev: Float64Array | null = null;
    for (let i = 0; i < count; i++) {
      const base = p.innerRadius + i * p.spacing;
      const t = count > 1 ? i / (count - 1) : 1;
      const amp = p.noiseAmount * Math.pow(t, p.growth);
      const radii = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        // Sample noise on the undisplaced circle so nearby rings see similar noise.
        const nx = (cos[k] * base) / p.noiseScale;
        const ny = (sin[k] * base) / p.noiseScale;
        let r = base + amp * fbm(nx, ny, i * p.evolution);
        if (p.preventOverlap && prev) r = Math.max(r, prev[k] + p.minGap);
        radii[k] = Math.max(0, r);
      }
      const line: Polyline = [];
      for (let k = 0; k < n; k++) line.push([cx + cos[k] * radii[k], cy + sin[k] * radii[k]]);
      line.push(line[0]);
      lines.push(line);
      prev = radii;
    }
    return lines;
  },
};
