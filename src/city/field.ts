import type { Point, Polyline, Rect } from '../types';
import { simplify } from '../geometry/simplify';

/**
 * One influence on street direction. Each contributes an orientation tensor,
 * weighted by distance. Streets follow the blended result (Chen et al. 2008,
 * "Interactive Procedural Street Modeling").
 */
export type Basis =
  /** Straight grid at `angle` (radians), centred on (x, y). `size` = radius of influence, mm (Infinity = everywhere). */
  | { kind: 'grid'; x: number; y: number; angle: number; size: number; weight: number }
  /** Radial pattern: avenues radiate from (x, y), ring roads circle it. */
  | { kind: 'radial'; x: number; y: number; size: number; weight: number }
  /** Grid aligned to a polyline (e.g. a river), fading with distance from it. */
  | { kind: 'line'; line: Polyline; size: number; weight: number };

/**
 * A street-direction field sampled on a grid. At each point there are two
 * perpendicular street directions: the "major" family (angle θ) and the "minor" family (θ + 90°).
 */
export interface DirectionField {
  /** Major-family angle at (x, y), or null where the field is degenerate (no clear direction). */
  angle(x: number, y: number): number | null;
}

function nearestOnLine(line: Polyline, x: number, y: number): { dist: number; angle: number } {
  let best = Infinity;
  let angle = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) {
      best = d;
      angle = Math.atan2(dy, dx);
    }
  }
  return { dist: best, angle };
}

/**
 * Builds the field over `bounds`, sampled every `cellSize` mm. `rotate(x, y)`
 * adds an angle (radians), used for the organic noise bend.
 */
export function buildField(bases: Basis[], bounds: Rect, cellSize: number, rotate?: (x: number, y: number) => number): DirectionField {
  const cols = Math.ceil((bounds.x1 - bounds.x0) / cellSize) + 1;
  const rows = Math.ceil((bounds.y1 - bounds.y0) / cellSize) + 1;
  const A = new Float32Array(cols * rows);
  const B = new Float32Array(cols * rows);
  const W = new Float32Array(cols * rows);
  // Line influences only need their rough shape; far fewer points makes the distance search cheap.
  bases = bases.map((b) => (b.kind === 'line' ? { ...b, line: simplify(b.line, 0.5) } : b));

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = bounds.x0 + i * cellSize;
      const y = bounds.y0 + j * cellSize;
      let a = 0;
      let b = 0;
      let wsum = 0;
      for (const basis of bases) {
        let theta: number;
        let d: number;
        if (basis.kind === 'grid') {
          theta = basis.angle;
          d = Math.hypot(x - basis.x, y - basis.y);
        } else if (basis.kind === 'radial') {
          theta = Math.atan2(y - basis.y, x - basis.x);
          d = Math.hypot(x - basis.x, y - basis.y);
        } else {
          const n = nearestOnLine(basis.line, x, y);
          theta = n.angle;
          d = n.dist;
        }
        const w = basis.weight * (Number.isFinite(basis.size) ? Math.exp(-((d / basis.size) ** 2)) : 1);
        // Tensors are compared in "double-angle" space so θ and θ + 180° are the same street direction.
        a += w * Math.cos(2 * theta);
        b += w * Math.sin(2 * theta);
        wsum += w;
      }
      if (rotate) {
        const r = 2 * rotate(x, y);
        const c = Math.cos(r);
        const s = Math.sin(r);
        [a, b] = [a * c - b * s, a * s + b * c];
      }
      const k = j * cols + i;
      A[k] = a;
      B[k] = b;
      W[k] = wsum;
    }
  }

  return {
    angle(x, y) {
      const fx = Math.min(cols - 1, Math.max(0, (x - bounds.x0) / cellSize));
      const fy = Math.min(rows - 1, Math.max(0, (y - bounds.y0) / cellSize));
      const i = Math.min(cols - 2, Math.floor(fx));
      const j = Math.min(rows - 2, Math.floor(fy));
      const tx = fx - i;
      const ty = fy - j;
      const lerp = (arr: Float32Array) => {
        const k = j * cols + i;
        return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - ty) + (arr[k + cols] * (1 - tx) + arr[k + cols + 1] * tx) * ty;
      };
      const a = lerp(A);
      const b = lerp(B);
      // Degenerate where opposing influences cancel out.
      if (Math.hypot(a, b) < 0.02 * Math.max(1e-9, lerp(W))) return null;
      return Math.atan2(b, a) / 2;
    },
  };
}

export const unit = (angle: number): Point => [Math.cos(angle), Math.sin(angle)];
