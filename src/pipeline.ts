import type { CanvasSettings, Polyline } from './types';
import { drawableRect } from './types';
import { clipPolylines } from './geometry/clip';
import { simplify } from './geometry/simplify';
import { orderPaths, pathLength } from './geometry/order';
import { staggerSeams } from './geometry/seams';

export interface ProcessSettings {
  /** RDP tolerance in mm. Fewer points = smoother motion on Marlin. */
  simplify: number;
  /** Drop paths shorter than this, mm. */
  minLength: number;
  /** Spread closed loops' start points around so pen-down marks don't line up. */
  staggerSeams: boolean;
}

/** Turns raw generator output into plot-ready paths: clipped, simplified and ordered. */
export function processPaths(raw: Polyline[], canvas: CanvasSettings, settings: ProcessSettings): Polyline[] {
  const clipped = clipPolylines(raw, drawableRect(canvas));
  const simplified = clipped
    .map((p) => simplify(p, settings.simplify))
    .filter((p) => p.length > 1 && pathLength(p) >= settings.minLength);
  return orderPaths(settings.staggerSeams ? staggerSeams(simplified) : simplified, [0, 0]);
}
