import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';

/** Small, fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/**
 * Fractal (multi-octave) simplex noise. Output is roughly in [-1, 1].
 * Each octave doubles the frequency and halves the amplitude.
 */
export function createFbm3D(seed: number, octaves: number): (x: number, y: number, z: number) => number {
  const noise: NoiseFunction3D = createNoise3D(mulberry32(seed));
  const n = Math.max(1, Math.round(octaves));
  let norm = 0;
  for (let i = 0, amp = 1; i < n; i++, amp *= 0.5) norm += amp;
  return (x, y, z) => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    for (let i = 0; i < n; i++) {
      sum += amp * noise(x * freq, y * freq, z * freq);
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}
