import type { Point, Polyline } from '../types';

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Greedy nearest-neighbour ordering to reduce pen-up travel. Starting from
 * `start`, repeatedly picks the closest unvisited path end (either end — paths
 * may be reversed).
 */
export function orderPaths(paths: Polyline[], start: Point = [0, 0]): Polyline[] {
  const remaining = paths.slice();
  const result: Polyline[] = [];
  let pos = start;
  while (remaining.length) {
    let best = 0;
    let bestDist = Infinity;
    let reverse = false;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      const dStart = dist(pos, p[0]);
      if (dStart < bestDist) {
        bestDist = dStart;
        best = i;
        reverse = false;
      }
      const dEnd = dist(pos, p[p.length - 1]);
      if (dEnd < bestDist) {
        bestDist = dEnd;
        best = i;
        reverse = true;
      }
    }
    const [chosen] = remaining.splice(best, 1);
    const path = reverse ? chosen.slice().reverse() : chosen;
    result.push(path);
    pos = path[path.length - 1];
  }
  return result;
}

export function pathLength(p: Polyline): number {
  let len = 0;
  for (let i = 1; i < p.length; i++) len += dist(p[i - 1], p[i]);
  return len;
}

/** Total pen-up travel, starting and ending at `origin`. */
export function travelLength(paths: Polyline[], origin: Point = [0, 0]): number {
  let len = 0;
  let pos = origin;
  for (const p of paths) {
    len += dist(pos, p[0]);
    pos = p[p.length - 1];
  }
  return len + dist(pos, origin);
}
