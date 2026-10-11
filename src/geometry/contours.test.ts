import { describe, expect, it } from 'vitest';
import { traceContour } from './contours';
import { chaikin } from './smooth';
import { sampleField } from '../terrain/heightfield';
import type { Polyline } from '../types';

const isClosed = (l: Polyline) => l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1];

describe('traceContour', () => {
  it('traces a cone as a single closed circle of the right radius', () => {
    // Height = distance from (50, 50); the 20 mm contour is a circle of radius 20.
    const field = sampleField(100, 100, 1, (x, y) => Math.hypot(x - 50, y - 50));
    const lines = traceContour(field, 20);
    expect(lines).toHaveLength(1);
    expect(isClosed(lines[0])).toBe(true);
    for (const [x, y] of lines[0]) expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(20, 0);
  });

  it('returns open lines that run edge to edge for a slope', () => {
    const field = sampleField(50, 30, 1, (x) => x);
    const lines = traceContour(field, 25.5);
    expect(lines).toHaveLength(1);
    expect(isClosed(lines[0])).toBe(false);
    const ys = lines[0].map((p) => p[1]).sort((a, b) => a - b);
    expect(ys[0]).toBe(0);
    expect(ys[ys.length - 1]).toBe(30);
    for (const [x] of lines[0]) expect(x).toBeCloseTo(25.5);
  });

  it('traces two separate peaks as two loops', () => {
    const field = sampleField(100, 50, 1, (x, y) =>
      Math.max(0, 20 - Math.hypot(x - 25, y - 25)) + Math.max(0, 20 - Math.hypot(x - 75, y - 25)),
    );
    const lines = traceContour(field, 10);
    expect(lines).toHaveLength(2);
    expect(lines.every(isClosed)).toBe(true);
  });
});

describe('chaikin', () => {
  it('keeps open endpoints and closed loops closed', () => {
    const open = chaikin([[0, 0], [10, 0], [10, 10]], 2);
    expect(open[0]).toEqual([0, 0]);
    expect(open[open.length - 1]).toEqual([10, 10]);
    const loop = chaikin([[0, 0], [10, 0], [10, 10], [0, 0]], 2);
    expect(isClosed(loop)).toBe(true);
  });
});
