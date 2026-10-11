import type { Point, Polyline } from '../types';
import type { HeightField } from '../terrain/heightfield';

// Cell edges: 0 bottom, 1 right, 2 top, 3 left.
// For each marching-squares case (corner bits: 1 bottom-left, 2 bottom-right,
// 4 top-right, 8 top-left set when the corner is at/above the level), the
// pairs of edges the contour crosses. Saddles (5, 10) are resolved separately.
const CASES: number[][] = [
  [], [3, 0], [0, 1], [3, 1], [1, 2], [], [0, 2], [3, 2],
  [2, 3], [0, 2], [], [1, 2], [3, 1], [0, 1], [3, 0], [],
];

/**
 * Traces the iso-line at `level` through a height field. Segments are joined
 * into continuous polylines; loops come back closed (first point === last).
 */
export function traceContour(field: HeightField, level: number): Polyline[] {
  const { cols, rows, cellSize: cs, data } = field;
  const v = (i: number, j: number) => data[j * cols + i];

  // Each crossing point is identified by the grid edge it lies on, so segments
  // from neighbouring cells share exact keys (and exact coordinates).
  const points = new Map<number, Point>();
  const hKey = (i: number, j: number) => (j * cols + i) * 2; // edge (i,j)→(i+1,j)
  const vKey = (i: number, j: number) => (j * cols + i) * 2 + 1; // edge (i,j)→(i,j+1)
  const crossing = (key: number, i: number, j: number, horizontal: boolean): number => {
    if (!points.has(key)) {
      const a = v(i, j);
      const b = horizontal ? v(i + 1, j) : v(i, j + 1);
      const t = (level - a) / (b - a);
      points.set(key, horizontal ? [(i + t) * cs, j * cs] : [i * cs, (j + t) * cs]);
    }
    return key;
  };
  const edgeKey = (edge: number, i: number, j: number): number => {
    switch (edge) {
      case 0: return crossing(hKey(i, j), i, j, true);
      case 1: return crossing(vKey(i + 1, j), i + 1, j, false);
      case 2: return crossing(hKey(i, j + 1), i, j + 1, true);
      default: return crossing(vKey(i, j), i, j, false);
    }
  };

  const segA: number[] = [];
  const segB: number[] = [];
  const addSegments = (edges: number[], i: number, j: number) => {
    for (let k = 0; k < edges.length; k += 2) {
      segA.push(edgeKey(edges[k], i, j));
      segB.push(edgeKey(edges[k + 1], i, j));
    }
  };

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const bl = v(i, j);
      const br = v(i + 1, j);
      const tr = v(i + 1, j + 1);
      const tl = v(i, j + 1);
      const c = (bl >= level ? 1 : 0) | (br >= level ? 2 : 0) | (tr >= level ? 4 : 0) | (tl >= level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      if (c === 5 || c === 10) {
        const centerAbove = (bl + br + tr + tl) / 4 >= level;
        // If the centre is above, the two "below" corners are cut off; otherwise the two "above" corners are.
        const cutBottomLeftAndTopRight = (c === 5) !== centerAbove;
        addSegments(cutBottomLeftAndTopRight ? [3, 0, 1, 2] : [0, 1, 2, 3], i, j);
      } else {
        addSegments(CASES[c], i, j);
      }
    }
  }

  return joinSegments(segA, segB, points);
}

/** Chains undirected segments that share endpoint keys into polylines. */
function joinSegments(segA: number[], segB: number[], points: Map<number, Point>): Polyline[] {
  const n = segA.length;
  // Each key belongs to at most two segments (a grid edge borders two cells).
  const byKey = new Map<number, number[]>();
  const link = (key: number, s: number) => {
    const list = byKey.get(key);
    if (list) list.push(s);
    else byKey.set(key, [s]);
  };
  for (let s = 0; s < n; s++) {
    link(segA[s], s);
    link(segB[s], s);
  }

  const used = new Uint8Array(n);
  // From segment `s` arriving at `key`, follow unused neighbours, collecting keys.
  const walk = (key: number, out: number[]) => {
    for (;;) {
      const next = byKey.get(key)?.find((t) => !used[t]);
      if (next === undefined) return;
      used[next] = 1;
      key = segA[next] === key ? segB[next] : segA[next];
      out.push(key);
    }
  };

  const lines: Polyline[] = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const forward = [segA[s], segB[s]];
    walk(segB[s], forward);
    const closed = forward.length > 2 && forward[forward.length - 1] === forward[0];
    let keys = forward;
    if (!closed) {
      const backward: number[] = [];
      walk(segA[s], backward);
      keys = backward.reverse().concat(forward);
    }
    lines.push(keys.map((k) => points.get(k)!));
  }
  return lines;
}

/** Contours at `levels` evenly spaced heights strictly between 0 and 1. */
export function traceContours(field: HeightField, levels: number): Polyline[] {
  const out: Polyline[] = [];
  const n = Math.max(1, Math.round(levels));
  for (let k = 1; k <= n; k++) out.push(...traceContour(field, k / (n + 1)));
  return out;
}
