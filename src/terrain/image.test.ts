import { describe, expect, it } from 'vitest';
import { computeHeights, type SourceImage } from './imageSource';
import { blurField, imageSampler } from './imageTerrain';
import { sampleField } from './heightfield';

const gray = (width: number, height: number, values: number[], bitDepth: 8 | 16 = 8): SourceImage => ({
  name: 'test',
  width,
  height,
  samples: bitDepth === 16 ? Uint16Array.from(values) : Uint8Array.from(values),
  channels: 1,
  bitDepth,
});

describe('computeHeights', () => {
  it('normalises 16-bit grayscale using its full range', () => {
    const h = computeHeights(gray(3, 1, [1000, 1001, 1002], 16), 'luminance');
    expect(h.data[0]).toBe(0);
    expect(h.data[1]).toBeCloseTo(0.5, 4);
    expect(h.data[2]).toBe(1);
  });

  it('decodes Terrarium RGB elevations', () => {
    // 32768 + 100 m → R=128, G=100; 32768 + 300 m → R=129, G=44.
    const img: SourceImage = { name: 't', width: 2, height: 1, samples: Uint8Array.from([128, 100, 0, 129, 44, 0]), channels: 3, bitDepth: 8 };
    const h = computeHeights(img, 'terrarium');
    expect(Array.from(h.data)).toEqual([0, 1]);
    // Midpoint check with a third pixel at 200 m.
    const img3: SourceImage = { ...img, width: 3, samples: Uint8Array.from([128, 100, 0, 128, 200, 0, 129, 44, 0]) };
    expect(computeHeights(img3, 'terrarium').data[1]).toBeCloseTo(0.5);
  });

  it('decodes Mapbox Terrain-RGB elevations', () => {
    // value = (h + 10000) * 10: 0 m → 100000 = (1, 134, 160); 10 m → 100100 = (1, 135, 4)
    const img: SourceImage = { name: 't', width: 2, height: 1, samples: Uint8Array.from([1, 134, 160, 1, 135, 4]), channels: 3, bitDepth: 8 };
    expect(Array.from(computeHeights(img, 'terrain-rgb').data)).toEqual([0, 1]);
  });
});

describe('imageSampler', () => {
  // 2×2 image: top row bright, bottom row dark.
  const img = { width: 2, height: 2, data: Float32Array.from([1, 1, 0, 0]) };

  it('puts the top of the image at high y', () => {
    const s = imageSampler(img, 100, 100, 'stretch');
    expect(s(50, 95)).toBeCloseTo(1);
    expect(s(50, 5)).toBeCloseTo(0);
  });

  it('contain leaves uncovered areas at 0; cover fills the area', () => {
    // A 200×100 mm area with a square image: contain leaves side bands empty.
    const contain = imageSampler(img, 200, 100, 'contain');
    const cover = imageSampler(img, 200, 100, 'cover');
    expect(contain(10, 95)).toBe(0);
    expect(cover(10, 95)).toBeGreaterThan(0.9);
  });
});

describe('blurField', () => {
  it('keeps a constant field constant', () => {
    const f = blurField(sampleField(20, 20, 1, () => 0.4), 3);
    for (const v of f.data) expect(v).toBeCloseTo(0.4);
  });

  it('softens a step', () => {
    const f = blurField(sampleField(20, 2, 1, (x) => (x < 10 ? 0 : 1)), 2);
    const mid = f.data[10];
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });
});
