import { describe, expect, it } from 'vitest';
import { cityGenerator } from '../generators/city';
import { layoutCity } from './city';
import { buildField } from './field';
import { pathLength } from '../geometry/order';

const canvas = { width: 200, height: 260, margin: 10 };
const drawable = { x0: 10, y0: 10, x1: 190, y1: 250 };

describe('city generator', () => {
  it('is deterministic for a given seed', () => {
    const p = cityGenerator.defaults();
    expect(cityGenerator.generate(p, canvas)).toEqual(cityGenerator.generate(p, canvas));
  });

  it('produces closed block outlines inside the drawable area', () => {
    const blocks = cityGenerator.generate(cityGenerator.defaults(), canvas);
    expect(blocks.length).toBeGreaterThan(20);
    for (const b of blocks) {
      expect(b[0]).toEqual(b[b.length - 1]);
      for (const [x, y] of b) {
        expect(x).toBeGreaterThanOrEqual(drawable.x0 - 0.01);
        expect(x).toBeLessThanOrEqual(drawable.x1 + 0.01);
        expect(y).toBeGreaterThanOrEqual(drawable.y0 - 0.01);
        expect(y).toBeLessThanOrEqual(drawable.y1 + 0.01);
      }
    }
  });

  it('keeps blocks out of the river', () => {
    const p = { ...cityGenerator.defaults(), bridges: false, plazas: 0, parks: 0 };
    const city = layoutCity(p, drawable, p.minorWidth);
    const river = city.river!;
    const blocks = cityGenerator.generate(p, canvas);
    let worst = Infinity;
    for (const b of blocks) {
      for (const [x, y] of b) {
        for (const [rx, ry] of river) worst = Math.min(worst, Math.hypot(rx - x, ry - y));
      }
    }
    // Centreline points are a few mm apart, so allow a little slack.
    expect(worst).toBeGreaterThan(p.riverWidth / 2 - 2);
  });

  it('never traces runaway streets (e.g. spiralling round a plaza)', () => {
    for (const seed of [1, 2, 3]) {
      const p = { ...cityGenerator.presets!['Old town'](), seed };
      const { roads } = layoutCity(p, drawable, p.minorWidth);
      const limit = 2 * (drawable.x1 - drawable.x0 + drawable.y1 - drawable.y0) + 20;
      for (const r of roads) expect(pathLength(r.pts)).toBeLessThan(limit);
    }
  });
});

describe('direction field', () => {
  it('follows a grid basis and radiates from a radial one', () => {
    const bounds = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const grid = buildField([{ kind: 'grid', x: 0, y: 0, angle: 0.3, size: Infinity, weight: 1 }], bounds, 2);
    expect(grid.angle(50, 50)).toBeCloseTo(0.3, 2);
    const radial = buildField([{ kind: 'radial', x: 50, y: 50, size: Infinity, weight: 1 }], bounds, 1);
    // Directly right of the centre, the major direction points along the radius (angle 0 or π).
    expect(Math.abs(Math.sin(radial.angle(80, 50.5)!))).toBeLessThan(0.05);
  });
});
