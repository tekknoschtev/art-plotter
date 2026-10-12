import type { FolderApi } from 'tweakpane';
import { createFbm3D } from '../noise';
import { normalize, sampleField, type HeightField } from './heightfield';
import { blurField, imageSampler, type ImageFit } from './imageTerrain';
import { getImageHeights, hasImage, imageInfo, loadImageFile, type HeightEncoding } from './imageSource';

export type TerrainSource = 'noise' | 'image';

export interface ImageTerrainParams {
  encoding: HeightEncoding;
  fit: ImageFit;
  invert: boolean;
  /** Blur radius, mm. Smooths 8-bit stepping and pixel noise. */
  blur: number;
  /** Heights below `low` become 0 and above `high` become 1 (levels / contrast). */
  low: number;
  high: number;
  /** Blend in procedural noise for extra texture, 0–1. */
  noiseMix: number;
}

/** Terrain settings shared by the contour and ridgeline generators. */
export interface TerrainParams {
  source: TerrainSource;
  image: ImageTerrainParams;
  seed: number;
  /** Size of the largest landforms, mm. */
  scale: number;
  octaves: number;
  /** How much each finer octave contributes (roughness). */
  gain: number;
  /** 0 = rolling hills, 1 = sharp mountain ridges. */
  ridged: number;
  /** Domain warp strength: bends landforms into flowing, swirling shapes. */
  warp: number;
  /** Fades height toward the edges so the terrain becomes an island/peak. */
  island: number;
  /** Island centre as a fraction of width/height. */
  centerX: number;
  centerY: number;
  /** Reshapes heights as h^gamma: >1 packs contours near peaks, <1 near valleys. */
  gamma: number;
}

export function terrainDefaults(): TerrainParams {
  return {
    source: 'noise',
    image: { encoding: 'luminance', fit: 'cover', invert: false, blur: 1, low: 0, high: 1, noiseMix: 0 },
    seed: 4242,
    scale: 320,
    octaves: 4,
    gain: 0.5,
    ridged: 0,
    warp: 0.3,
    island: 0,
    centerX: 0.5,
    centerY: 0.5,
    gamma: 1,
  };
}

export function bindTerrainUI(f: FolderApi, p: TerrainParams): void {
  f.addBinding(p, 'source', { options: { Noise: 'noise', Image: 'image' } }).on('change', updateVisibility);

  const img = f.addFolder({ title: 'Image' });
  img.addButton({ title: 'Load image…' }).on('click', pickImage);
  img.addBinding(imageInfo, 'file', { readonly: true });
  img.addBinding(p.image, 'encoding', {
    options: { 'Brightness (grayscale)': 'luminance', 'Terrarium RGB': 'terrarium', 'Terrain-RGB (Mapbox)': 'terrain-rgb' },
  });
  img.addBinding(p.image, 'fit', { options: { Cover: 'cover', Contain: 'contain', Stretch: 'stretch' } });
  img.addBinding(p.image, 'invert');
  img.addBinding(p.image, 'blur', { label: 'blur mm', min: 0, max: 30, step: 0.5 });
  img.addBinding(p.image, 'low', { label: 'black point', min: 0, max: 1, step: 0.01 });
  img.addBinding(p.image, 'high', { label: 'white point', min: 0, max: 1, step: 0.01 });
  img.addBinding(p.image, 'noiseMix', { label: 'noise mix', min: 0, max: 1, step: 0.01 }).on('change', updateVisibility);

  const noise = f.addFolder({ title: 'Noise' });
  noise.addBinding(p, 'seed', { step: 1, min: 0 });
  noise.addBinding(p, 'scale', { label: 'scale mm', min: 10, max: 1500, step: 1 });
  noise.addBinding(p, 'octaves', { min: 1, max: 8, step: 1 });
  noise.addBinding(p, 'gain', { label: 'roughness', min: 0.1, max: 0.9, step: 0.01 });
  noise.addBinding(p, 'ridged', { min: 0, max: 1, step: 0.01 });
  noise.addBinding(p, 'warp', { min: 0, max: 3, step: 0.01 });
  noise.addBinding(p, 'island', { min: 0, max: 1, step: 0.01 });
  noise.addBinding(p, 'centerX', { label: 'island x', min: 0, max: 1, step: 0.01 });
  noise.addBinding(p, 'centerY', { label: 'island y', min: 0, max: 1, step: 0.01 });

  f.addBinding(p, 'gamma', { min: 0.2, max: 4, step: 0.01 });

  function updateVisibility() {
    img.hidden = p.source !== 'image';
    noise.hidden = p.source === 'image' && p.image.noiseMix === 0;
  }
  updateVisibility();
}

function pickImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.png';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await loadImageFile(file);
    } catch (err) {
      alert(`Could not read that image: ${(err as Error).message}`);
    }
  });
  input.click();
}

/** True when the terrain needs an image but none is loaded. */
export function terrainMissingImage(p: TerrainParams): boolean {
  return p.source === 'image' && !hasImage();
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Height function for the procedural noise terrain, roughly in [0, 1]. */
function noiseHeight(p: TerrainParams, width: number, height: number): (x: number, y: number) => number {
  const smooth = createFbm3D(p.seed, p.octaves, p.gain, false);
  const sharp = p.ridged > 0 ? createFbm3D(p.seed, p.octaves, p.gain, true) : null;
  const warpField = p.warp > 0 ? createFbm3D(p.seed + 1, 2) : null;
  const s = p.scale;
  const cx = p.centerX * width;
  const cy = p.centerY * height;
  const radius = Math.min(width, height) / 2;
  return (x, y) => {
    let nx = x / s;
    let ny = y / s;
    if (warpField) {
      // Offset the lookup by another noise field (z offsets give independent fields).
      nx += p.warp * warpField(nx, ny, 11.3);
      ny += p.warp * warpField(nx, ny, 47.9);
    }
    let h = smooth(nx, ny, 0);
    if (sharp) h = h * (1 - p.ridged) + sharp(nx, ny, 0) * p.ridged;
    h = (h + 1) / 2;
    if (p.island > 0) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      h *= 1 - p.island * smoothstep(0.2, 1.1, d);
    }
    return h;
  };
}

/** Builds the terrain over a width × height mm area as a [0, 1] height field. */
export function buildTerrain(p: TerrainParams, width: number, height: number, cellSize: number): HeightField {
  let field: HeightField;
  const heights = p.source === 'image' ? getImageHeights(p.image.encoding) : null;

  if (p.source === 'image') {
    if (!heights) return sampleField(width, height, cellSize, () => 0);
    const sample = imageSampler(heights, width, height, p.image.fit);
    const { invert, low, high } = p.image;
    const span = Math.max(1e-6, high - low);
    field = sampleField(width, height, cellSize, (x, y) => {
      let h = sample(x, y);
      if (invert) h = 1 - h;
      return Math.min(1, Math.max(0, (h - low) / span));
    });
    blurField(field, p.image.blur / field.cellSize);
    if (p.image.noiseMix > 0) {
      const noise = noiseHeight(p, width, height);
      const m = p.image.noiseMix;
      const cs = field.cellSize;
      for (let j = 0; j < field.rows; j++) {
        for (let i = 0; i < field.cols; i++) {
          const k = j * field.cols + i;
          field.data[k] = field.data[k] * (1 - m) + noise(i * cs, j * cs) * m;
        }
      }
    }
  } else {
    field = sampleField(width, height, cellSize, noiseHeight(p, width, height));
  }

  normalize(field);
  if (p.gamma !== 1) {
    for (let k = 0; k < field.data.length; k++) field.data[k] = Math.pow(field.data[k], p.gamma);
  }
  return field;
}
