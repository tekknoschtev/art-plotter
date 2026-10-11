/**
 * A regular grid of heights covering the artwork. Grid point (i, j) is at
 * (i * cellSize, j * cellSize) mm, with j = 0 at the bottom edge.
 */
export interface HeightField {
  cols: number;
  rows: number;
  cellSize: number;
  /** Row-major heights, data[j * cols + i]. Normalised to [0, 1] by `normalize`. */
  data: Float32Array;
}

/** Builds a grid that covers a width × height mm area, sampling `fn(x, y)` at each point. */
export function sampleField(width: number, height: number, cellSize: number, fn: (x: number, y: number) => number): HeightField {
  const cs = Math.max(0.1, cellSize);
  const cols = Math.ceil(width / cs) + 1;
  const rows = Math.ceil(height / cs) + 1;
  const data = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) data[j * cols + i] = fn(i * cs, j * cs);
  }
  return { cols, rows, cellSize: cs, data };
}

/** Rescales heights in place to span [0, 1]. A flat field becomes all zeros. */
export function normalize(field: HeightField): HeightField {
  let min = Infinity;
  let max = -Infinity;
  for (const v of field.data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  for (let k = 0; k < field.data.length; k++) field.data[k] = range > 0 ? (field.data[k] - min) / range : 0;
  return field;
}

/** Bilinear height at (x, y) mm. Clamps to the grid edges. */
export function sampleHeight(field: HeightField, x: number, y: number): number {
  const { cols, rows, cellSize, data } = field;
  const fx = Math.min(cols - 1, Math.max(0, x / cellSize));
  const fy = Math.min(rows - 1, Math.max(0, y / cellSize));
  const i = Math.min(cols - 2, Math.floor(fx));
  const j = Math.min(rows - 2, Math.floor(fy));
  const tx = fx - i;
  const ty = fy - j;
  const a = data[j * cols + i];
  const b = data[j * cols + i + 1];
  const c = data[(j + 1) * cols + i];
  const d = data[(j + 1) * cols + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
