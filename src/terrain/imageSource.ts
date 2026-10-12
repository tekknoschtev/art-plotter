import { convertIndexedToRgb, decode as decodePng, hasPngSignature } from 'fast-png';

/**
 * How pixel values become heights.
 * - luminance: brightness = height (grayscale heightmaps, photos). 16-bit PNGs keep full precision.
 * - terrarium: (R·256 + G + B/256) − 32768 metres (AWS/Mapzen terrain tiles).
 * - terrain-rgb: −10000 + (R·65536 + G·256 + B) · 0.1 metres (Mapbox/MapTiler tiles).
 */
export type HeightEncoding = 'luminance' | 'terrarium' | 'terrain-rgb';

/** A decoded source image, kept as raw samples so the encoding can change without reloading. */
export interface SourceImage {
  name: string;
  width: number;
  height: number;
  /** Interleaved samples, `channels` per pixel. 8-bit (0–255) or 16-bit (0–65535). */
  samples: Uint8Array | Uint8ClampedArray | Uint16Array;
  channels: number;
  bitDepth: 8 | 16;
}

/** Heights in [0, 1], row-major with row 0 at the top of the image. */
export interface ImageHeights {
  width: number;
  height: number;
  data: Float32Array;
}

// ---------- Decoding ----------

export async function decodeImageFile(file: Blob, name: string): Promise<SourceImage> {
  const buffer = await file.arrayBuffer();
  if (hasPngSignature(new Uint8Array(buffer))) {
    // Decode PNGs directly: exact values (no colour management) and 16-bit support.
    try {
      const png = decodePng(buffer);
      if (png.palette) {
        const rgb = convertIndexedToRgb(png);
        return { name, width: png.width, height: png.height, samples: rgb, channels: png.palette[0].length, bitDepth: 8 };
      }
      if (png.depth === 8 || png.depth === 16) {
        return { name, width: png.width, height: png.height, samples: png.data, channels: png.channels, bitDepth: png.depth };
      }
    } catch {
      // Fall through to the browser decoder.
    }
  }
  return decodeWithBrowser(file, name);
}

async function decodeWithBrowser(file: Blob, name: string): Promise<SourceImage> {
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { name, width: canvas.width, height: canvas.height, samples: data, channels: 4, bitDepth: 8 };
}

/** Converts raw samples to heights in [0, 1] (rescaled so the lowest pixel is 0 and the highest 1). */
export function computeHeights(img: SourceImage, encoding: HeightEncoding): ImageHeights {
  const { width, height, samples, channels, bitDepth } = img;
  const n = width * height;
  const data = new Float32Array(n);
  const max = bitDepth === 16 ? 65535 : 255;
  const colour = channels >= 3;
  for (let i = 0; i < n; i++) {
    const o = i * channels;
    if (encoding === 'luminance' || !colour) {
      data[i] = colour
        ? (0.2126 * samples[o] + 0.7152 * samples[o + 1] + 0.0722 * samples[o + 2]) / max
        : samples[o] / max;
    } else {
      // Elevation encodings are defined on 8-bit channels.
      const k = bitDepth === 16 ? 1 / 257 : 1;
      const r = Math.round(samples[o] * k);
      const g = Math.round(samples[o + 1] * k);
      const b = Math.round(samples[o + 2] * k);
      data[i] = encoding === 'terrarium' ? r * 256 + g + b / 256 - 32768 : -10000 + (r * 65536 + g * 256 + b) * 0.1;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  for (let i = 0; i < n; i++) data[i] = range > 0 ? (data[i] - lo) / range : 0;
  return { width, height, data };
}

// ---------- Current image (shared by all generators) ----------

let current: SourceImage | null = null;
const heightCache = new Map<HeightEncoding, ImageHeights>();
const listeners = new Set<() => void>();

/** Live description of the loaded image, for a read-only UI field. */
export const imageInfo = { file: 'none loaded' };

export function getImageHeights(encoding: HeightEncoding): ImageHeights | null {
  if (!current) return null;
  let h = heightCache.get(encoding);
  if (!h) {
    h = computeHeights(current, encoding);
    heightCache.set(encoding, h);
  }
  return h;
}

export function hasImage(): boolean {
  return current !== null;
}

export function onImageChange(fn: () => void): void {
  listeners.add(fn);
}

function setImage(img: SourceImage | null) {
  current = img;
  heightCache.clear();
  imageInfo.file = img ? `${img.name} (${img.width}×${img.height}${img.bitDepth === 16 ? ', 16-bit' : ''})` : 'none loaded';
  listeners.forEach((fn) => fn());
}

export async function loadImageFile(file: File): Promise<void> {
  setImage(await decodeImageFile(file, file.name));
  void persistImage(file);
}

/** Restores the last loaded image from browser storage, if any. */
export async function restoreImage(): Promise<void> {
  try {
    const saved = await idb<{ name: string; blob: Blob } | undefined>('readonly', (s) => s.get('image'));
    if (saved) setImage(await decodeImageFile(saved.blob, saved.name));
  } catch {
    // Storage unavailable or image unreadable — start without one.
  }
}

async function persistImage(file: File): Promise<void> {
  try {
    await idb('readwrite', (s) => s.put({ name: file.name, blob: file }, 'image'));
  } catch {
    // Persistence is a convenience only.
  }
}

function idb<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('art-plotter', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = op(db.transaction('files', mode).objectStore('files'));
      req.onsuccess = () => {
        resolve(req.result as T);
        db.close();
      };
      req.onerror = () => {
        reject(req.error);
        db.close();
      };
    };
  });
}
