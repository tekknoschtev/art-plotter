import type { Point, Polyline, Rect } from '../types';
import { createFbm3D } from '../noise';
import { chaikin } from '../geometry/smooth';

/**
 * A meandering centreline crossing the whole of `bounds` at roughly `angle`
 * (radians). `meander` (0–1) sets how far the heading wanders.
 */
export function meanderLine(bounds: Rect, angle: number, offset: number, meander: number, seed: number, step = 3): Polyline {
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  const diag = Math.hypot(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
  const dir: Point = [Math.cos(angle), Math.sin(angle)];
  const normal: Point = [-dir[1], dir[0]];
  // Start well outside the rect, shifted sideways by `offset` (fraction of the diagonal).
  const sx = cx - dir[0] * diag * 0.75 + normal[0] * offset * diag * 0.5;
  const sy = cy - dir[1] * diag * 0.75 + normal[1] * offset * diag * 0.5;
  const noise = createFbm3D(seed, 2);
  const pts: Point[] = [];
  let x = sx;
  let y = sy;
  for (let t = 0; t < diag * 1.5; t += step) {
    pts.push([x, y]);
    // Heading wanders around the base angle but always keeps moving forward.
    const heading = angle + meander * 1.2 * noise(t / (diag * 0.35), 0, 0);
    x += Math.cos(heading) * step;
    y += Math.sin(heading) * step;
  }
  return chaikin(pts, 2);
}

/** A rounded, slightly irregular blob (parks), `points` around. */
export function blob(cx: number, cy: number, radius: number, irregularity: number, seed: number, points = 64): Polyline {
  const noise = createFbm3D(seed, 2);
  const out: Point[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (1 + irregularity * noise(Math.cos(a), Math.sin(a), 0));
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  out.push(out[0]);
  return out;
}

export function pointInPolygon(poly: Polyline, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Raster mask over `bounds` for fast "is this point water/park?" lookups during tracing. */
export class Mask {
  private cols: number;
  private rows: number;
  private data: Uint8Array;
  constructor(private bounds: Rect, private cell: number) {
    this.cols = Math.ceil((bounds.x1 - bounds.x0) / cell) + 1;
    this.rows = Math.ceil((bounds.y1 - bounds.y0) / cell) + 1;
    this.data = new Uint8Array(this.cols * this.rows);
  }
  /** Marks every cell within `radius` of the polyline. */
  addBand(line: Polyline, radius: number, bit: number) {
    const { x0, y0 } = this.bounds;
    const r = Math.ceil(radius / this.cell) + 1;
    for (const [px, py] of line) {
      const ci = Math.round((px - x0) / this.cell);
      const cj = Math.round((py - y0) / this.cell);
      for (let j = cj - r; j <= cj + r; j++) {
        if (j < 0 || j >= this.rows) continue;
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || i >= this.cols) continue;
          const x = x0 + i * this.cell;
          const y = y0 + j * this.cell;
          if ((x - px) ** 2 + (y - py) ** 2 <= radius * radius) this.data[j * this.cols + i] |= bit;
        }
      }
    }
  }
  /** Marks every cell inside the closed polygon. */
  addPolygon(poly: Polyline, bit: number) {
    const { x0, y0 } = this.bounds;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        if (pointInPolygon(poly, x0 + i * this.cell, y0 + j * this.cell)) this.data[j * this.cols + i] |= bit;
      }
    }
  }
  get(x: number, y: number): number {
    const i = Math.round((x - this.bounds.x0) / this.cell);
    const j = Math.round((y - this.bounds.y0) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return 0;
    return this.data[j * this.cols + i];
  }
}
