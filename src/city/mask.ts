import type { Polyline, Rect } from '../types';
import { createFbm3D } from '../noise';
import { traceContour } from '../geometry/contours';
import { chaikin } from '../geometry/smooth';
import { imageSampler } from '../terrain/imageTerrain';
import { getImageHeights } from '../terrain/imageSource';

export type MaskShape = 'none' | 'blob' | 'island' | 'image';

export interface MaskSettings {
  maskShape: MaskShape;
  /** Size relative to the drawable area (1 ≈ touches the shorter side). */
  maskSize: number;
  /** Width:height stretch of the blob/island (1 = round). */
  maskStretch: number;
  /** Wobble of the blob edge / strength of the island's coastline noise, 0–1. */
  maskIrregularity: number;
  /** Centre as a fraction of the drawable area. */
  maskX: number;
  maskY: number;
  /** Size of coastline features (bays, peninsulas), mm. */
  islandScale: number;
  /** Raise to shrink the island and break it into more pieces, −0.5…0.5. */
  islandLevel: number;
  /** Image silhouettes: dark = city by default; invert to use the light area. */
  maskInvert: boolean;
}

export interface CityMask {
  inside(x: number, y: number): boolean;
  /** Signed distance to the mask edge, mm: positive inside, negative outside (approximate). */
  distance(x: number, y: number): number;
  /** The mask edge as closed loops (outer shores and lake holes). */
  outline: Polyline[];
}

/**
 * Builds the city's outline shape. Every shape is expressed as a scalar field
 * that is ≥ 0 inside, sampled on a grid; the edge is its zero contour.
 */
export function buildMask(p: MaskSettings, drawable: Rect, seed: number): CityMask | null {
  if (p.maskShape === 'none') return null;
  const w = drawable.x1 - drawable.x0;
  const h = drawable.y1 - drawable.y0;
  const cx = drawable.x0 + p.maskX * w;
  const cy = drawable.y0 + p.maskY * h;
  const stretch = Math.max(0.1, p.maskStretch);
  const a = (p.maskSize * Math.min(w, h) * Math.sqrt(stretch)) / 2;
  const b = (p.maskSize * Math.min(w, h)) / Math.sqrt(stretch) / 2;
  const noise = createFbm3D(seed + 31, 3);

  let field: (x: number, y: number) => number;
  if (p.maskShape === 'blob') {
    field = (x, y) => {
      const dx = (x - cx) / a;
      const dy = (y - cy) / b;
      const r = Math.hypot(dx, dy);
      const t = Math.atan2(dy, dx);
      // Wobble the radius by noise sampled around a circle (seamless all the way round).
      return 1 + p.maskIrregularity * 0.6 * noise(Math.cos(t) * 1.2, Math.sin(t) * 1.2, 0) - r;
    };
  } else if (p.maskShape === 'island') {
    field = (x, y) => {
      const r = Math.hypot((x - cx) / a, (y - cy) / b);
      return 1 - r + p.maskIrregularity * 1.2 * noise(x / p.islandScale, y / p.islandScale, 5) - p.islandLevel;
    };
  } else {
    const img = getImageHeights('luminance');
    if (!img) return null;
    // Background outside the image counts as "not city".
    const sample = imageSampler(img, w, h, 'contain', p.maskInvert ? 0 : 1);
    field = (x, y) => {
      const v = sample(x - drawable.x0, y - drawable.y0);
      return p.maskInvert ? v - 0.5 : 0.5 - v;
    };
  }

  // Sample on a grid a little larger than the drawable area; the outer ring is
  // forced outside so every contour closes.
  const pad = 6;
  const cell = Math.max(0.4, Math.min(w, h) / 250);
  const gx0 = drawable.x0 - pad;
  const gy0 = drawable.y0 - pad;
  const cols = Math.ceil((w + 2 * pad) / cell) + 1;
  const rows = Math.ceil((h + 2 * pad) / cell) + 1;
  const data = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const border = i === 0 || j === 0 || i === cols - 1 || j === rows - 1;
      data[j * cols + i] = border ? -1 : field(gx0 + i * cell, gy0 + j * cell);
    }
  }

  const outline = traceContour({ cols, rows, cellSize: cell, data }, 0)
    .map((loop) => chaikin(loop.map(([x, y]) => [x + gx0, y + gy0] as [number, number]), 2))
    .filter((loop) => loop.length > 3);

  const dist = signedDistance(data, cols, rows, cell);
  const lookup = (arr: Float32Array, x: number, y: number) => {
    const fx = Math.min(cols - 1, Math.max(0, (x - gx0) / cell));
    const fy = Math.min(rows - 1, Math.max(0, (y - gy0) / cell));
    const i = Math.min(cols - 2, Math.floor(fx));
    const j = Math.min(rows - 2, Math.floor(fy));
    const tx = fx - i;
    const ty = fy - j;
    const k = j * cols + i;
    return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - ty) + (arr[k + cols] * (1 - tx) + arr[k + cols + 1] * tx) * ty;
  };

  return {
    inside: (x, y) => lookup(data, x, y) >= 0,
    distance: (x, y) => lookup(dist, x, y),
    outline,
  };
}

/**
 * Approximate signed distance (mm) from each grid cell to the inside/outside
 * boundary, via a two-pass chamfer transform (within a few % of Euclidean).
 */
function signedDistance(field: Float32Array, cols: number, rows: number, cell: number): Float32Array {
  const n = cols * rows;
  const toEdge = (insideWanted: boolean) => {
    // Distance from each cell to the nearest cell on the other side.
    const d = new Float32Array(n);
    for (let k = 0; k < n; k++) d[k] = (field[k] >= 0) === insideWanted ? Infinity : 0;
    const D = 1;
    const DD = Math.SQRT2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + D);
        if (j > 0) {
          v = Math.min(v, d[k - cols] + D);
          if (i > 0) v = Math.min(v, d[k - cols - 1] + DD);
          if (i < cols - 1) v = Math.min(v, d[k - cols + 1] + DD);
        }
        d[k] = v;
      }
    }
    for (let j = rows - 1; j >= 0; j--) {
      for (let i = cols - 1; i >= 0; i--) {
        const k = j * cols + i;
        let v = d[k];
        if (i < cols - 1) v = Math.min(v, d[k + 1] + D);
        if (j < rows - 1) {
          v = Math.min(v, d[k + cols] + D);
          if (i < cols - 1) v = Math.min(v, d[k + cols + 1] + DD);
          if (i > 0) v = Math.min(v, d[k + cols - 1] + DD);
        }
        d[k] = v;
      }
    }
    return d;
  };
  const inDist = toEdge(true);
  const outDist = toEdge(false);
  const out = new Float32Array(n);
  // Half a cell puts the zero crossing between the last inside and first outside cell.
  for (let k = 0; k < n; k++) out[k] = field[k] >= 0 ? (inDist[k] - 0.5) * cell : -(outDist[k] - 0.5) * cell;
  return out;
}

/** Splits polylines into the runs whose points lie inside the mask. */
export function keepInside(lines: Polyline[], mask: CityMask): Polyline[] {
  const out: Polyline[] = [];
  for (const line of lines) {
    let run: Polyline = [];
    for (const pt of line) {
      if (mask.inside(pt[0], pt[1])) run.push(pt);
      else {
        if (run.length > 1) out.push(run);
        run = [];
      }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}
