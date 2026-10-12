import type { HeightField } from './heightfield';
import type { ImageHeights } from './imageSource';

export type ImageFit = 'cover' | 'contain' | 'stretch';

/**
 * Returns a height lookup (x, y in mm, y up) that maps the image onto a
 * width × height mm area. The top of the image is the high-y edge (the back
 * row for ridgelines). Areas the image doesn't cover ('contain') are height 0.
 */
export function imageSampler(img: ImageHeights, width: number, height: number, fit: ImageFit): (x: number, y: number) => number {
  const { width: iw, height: ih, data } = img;
  let toPx: (x: number, y: number) => [number, number];
  if (fit === 'stretch') {
    toPx = (x, y) => [(x / width) * iw, (1 - y / height) * ih];
  } else {
    // cover: the image fills the area (cropping overflow); contain: the whole image fits inside.
    const mmPerPx = fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
    toPx = (x, y) => [(x - width / 2) / mmPerPx + iw / 2, ih / 2 - (y - height / 2) / mmPerPx];
  }
  return (x, y) => {
    const [px, py] = toPx(x, y);
    if (px < 0 || py < 0 || px > iw || py > ih) return 0;
    // Bilinear between pixel centres.
    const fx = Math.min(iw - 1, Math.max(0, px - 0.5));
    const fy = Math.min(ih - 1, Math.max(0, py - 0.5));
    const i = Math.min(iw - 2, Math.floor(fx));
    const j = Math.min(ih - 2, Math.floor(fy));
    if (i < 0 || j < 0) return data[Math.round(fy) * iw + Math.round(fx)];
    const tx = fx - i;
    const ty = fy - j;
    const a = data[j * iw + i];
    const b = data[j * iw + i + 1];
    const c = data[(j + 1) * iw + i];
    const d = data[(j + 1) * iw + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
}

/** Approximate Gaussian blur (three box-blur passes) of radius `radius` grid cells, in place. */
export function blurField(field: HeightField, radius: number): HeightField {
  const r = Math.round(radius);
  if (r < 1) return field;
  const { cols, rows, data } = field;
  const tmp = new Float32Array(data.length);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const len = horizontal ? cols : rows;
    const lines = horizontal ? rows : cols;
    for (let l = 0; l < lines; l++) {
      const at = (k: number) => (horizontal ? l * cols + k : k * cols + l);
      let sum = 0;
      // Running window with clamped edges.
      for (let k = -r; k <= r; k++) sum += src[at(Math.min(len - 1, Math.max(0, k)))];
      for (let k = 0; k < len; k++) {
        dst[at(k)] = sum / (2 * r + 1);
        sum += src[at(Math.min(len - 1, k + r + 1))] - src[at(Math.max(0, k - r))];
      }
    }
  };
  for (let it = 0; it < 3; it++) {
    pass(data, tmp, true);
    pass(tmp, data, false);
  }
  return field;
}
