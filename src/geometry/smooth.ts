import type { Point, Polyline } from '../types';

/**
 * Chaikin corner-cutting. Each pass replaces every corner with two points at
 * 1/4 and 3/4 along its segments, rounding off grid facets. Open lines keep
 * their endpoints; closed loops stay closed.
 */
export function chaikin(line: Polyline, iterations: number): Polyline {
  let pts = line;
  for (let it = 0; it < iterations && pts.length > 2; it++) {
    const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const src = closed ? pts.slice(0, -1) : pts;
    const n = src.length;
    const out: Point[] = closed ? [] : [src[0]];
    const segments = closed ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      const a = src[i];
      const b = src[(i + 1) % n];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (closed) out.push(out[0]);
    else out.push(src[n - 1]);
    pts = out;
  }
  return pts;
}
