import type { Point, Polyline } from '../types';

/**
 * Floating-horizon hidden-line removal.
 *
 * `lines` must be ordered front to back, and each line's x must be increasing.
 * A line is visible only where it rises above everything drawn before it (the
 * "horizon"). After it is processed, it raises the horizon. Works on a grid of
 * `binSize` mm columns; visibility changes are interpolated between columns.
 */
export function removeHiddenLines(lines: Polyline[], binSize = 0.2): Polyline[] {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const l of lines) {
    if (l.length < 2) continue;
    minX = Math.min(minX, l[0][0]);
    maxX = Math.max(maxX, l[l.length - 1][0]);
  }
  if (!(maxX > minX)) return [];

  const bins = Math.ceil((maxX - minX) / binSize) + 1;
  const horizon = new Float64Array(bins).fill(-Infinity);
  const out: Polyline[] = [];
  const xs = new Float64Array(bins);
  for (let b = 0; b < bins; b++) xs[b] = minX + b * binSize;

  for (const line of lines) {
    if (line.length < 2) continue;
    const b0 = Math.max(0, Math.ceil((line[0][0] - minX) / binSize - 1e-9));
    const b1 = Math.min(bins - 1, Math.floor((line[line.length - 1][0] - minX) / binSize + 1e-9));
    if (b1 < b0) continue;

    // The line's height at each bin column, walking its points in step.
    const ys = new Float64Array(b1 - b0 + 1);
    let k = 0;
    for (let b = b0; b <= b1; b++) {
      const x = xs[b];
      while (k < line.length - 2 && line[k + 1][0] < x) k++;
      const [ax, ay] = line[k];
      const [bx, by] = line[k + 1];
      const t = bx === ax ? 0 : Math.min(1, Math.max(0, (x - ax) / (bx - ax)));
      ys[b - b0] = ay + (by - ay) * t;
    }

    let run: Point[] | null = null;
    for (let b = b0; b <= b1; b++) {
      const y = ys[b - b0];
      const visible = y > horizon[b] + 1e-6;
      if (visible && !run) {
        run = [];
        // Entering view: start at the crossing with the horizon if it was finite.
        if (b > b0 && Number.isFinite(horizon[b - 1])) run.push(crossing(b - 1, ys[b - 1 - b0], y));
      } else if (!visible && run) {
        run.push(crossing(b - 1, ys[b - 1 - b0], y));
        if (run.length > 1) out.push(run);
        run = null;
      }
      if (run) run.push([xs[b], y]);
    }
    if (run && run.length > 1) out.push(run);

    for (let b = b0; b <= b1; b++) horizon[b] = Math.max(horizon[b], ys[b - b0]);
  }
  return out;

  /** Point between bins b and b+1 where the line (yA→yB) meets the horizon. */
  function crossing(b: number, yA: number, yB: number): Point {
    const hA = horizon[b];
    const hB = horizon[b + 1];
    const denom = yB - yA - (hB - hA);
    const t = denom === 0 || !Number.isFinite(denom) ? 0.5 : Math.min(1, Math.max(0, (hA - yA) / denom));
    return [xs[b] + t * binSize, yA + (yB - yA) * t];
  }
}
