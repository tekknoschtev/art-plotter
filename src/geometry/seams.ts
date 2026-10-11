import type { Point, Polyline } from '../types';

const GOLDEN = 0.6180339887498949;

export function isClosed(p: Polyline): boolean {
  if (p.length < 3) return false;
  const a = p[0];
  const b = p[p.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Moves a closed loop's start/end point to `fraction` (0–1) of the way around
 * it, measured by length. The shape is unchanged; only where the pen lands moves.
 */
export function rotateLoop(loop: Polyline, fraction: number): Polyline {
  if (!isClosed(loop)) return loop;
  const pts = loop.slice(0, -1);
  const n = pts.length;
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(d);
    total += d;
  }
  let target = (((fraction % 1) + 1) % 1) * total;
  if (target === 0 || total === 0) return loop;
  for (let i = 0; i < n; i++) {
    if (target <= seg[i]) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const t = seg[i] === 0 ? 0 : target / seg[i];
      const start: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      // start → b → … → a → start
      const rest: Point[] = [];
      for (let k = 1; k <= n; k++) rest.push(pts[(i + k) % n]);
      if (t === 1) return [...rest, rest[0]];
      return [start, ...rest, start];
    }
    target -= seg[i];
  }
  return loop;
}

/**
 * Spreads closed-loop start points around their loops (golden-ratio steps), so
 * pen-down/pen-up marks don't line up into a visible seam.
 */
export function staggerSeams(paths: Polyline[]): Polyline[] {
  let k = 0;
  return paths.map((p) => (isClosed(p) ? rotateLoop(p, ++k * GOLDEN) : p));
}
