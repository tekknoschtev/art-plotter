import { describe, expect, it } from 'vitest';
import { isClosed, rotateLoop, staggerSeams } from './seams';
import { pathLength } from './order';
import type { Polyline } from '../types';

const square: Polyline = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

describe('rotateLoop', () => {
  it('moves the start point by length and keeps the loop closed and the same length', () => {
    const r = rotateLoop(square, 0.125); // 5 mm along the 40 mm perimeter
    expect(r[0]).toEqual([5, 0]);
    expect(isClosed(r)).toBe(true);
    expect(pathLength(r)).toBeCloseTo(40);
  });

  it('starts on a vertex without duplicating it', () => {
    const r = rotateLoop(square, 0.5);
    expect(r).toEqual([[10, 10], [0, 10], [0, 0], [10, 0], [10, 10]]);
  });

  it('leaves open paths alone', () => {
    const open: Polyline = [[0, 0], [5, 5]];
    expect(rotateLoop(open, 0.3)).toBe(open);
  });
});

describe('staggerSeams', () => {
  it('gives successive loops different start points', () => {
    const starts = staggerSeams([square, square, square]).map((p) => p[0].join(','));
    expect(new Set(starts).size).toBe(3);
  });
});
