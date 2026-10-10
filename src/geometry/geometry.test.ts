import { describe, expect, it } from 'vitest';
import { clipPolyline } from './clip';
import { simplify } from './simplify';
import { orderPaths, travelLength } from './order';
import type { Polyline } from '../types';

const rect = { x0: 0, y0: 0, x1: 10, y1: 10 };

describe('clipPolyline', () => {
  it('keeps a line fully inside', () => {
    const line: Polyline = [[1, 1], [5, 5], [9, 1]];
    expect(clipPolyline(line, rect)).toEqual([line]);
  });

  it('drops a line fully outside', () => {
    expect(clipPolyline([[20, 20], [30, 30]], rect)).toEqual([]);
  });

  it('splits a line that leaves and re-enters', () => {
    const pieces = clipPolyline([[2, 5], [15, 5], [15, 8], [2, 8]], rect);
    expect(pieces).toEqual([
      [[2, 5], [10, 5]],
      [[10, 8], [2, 8]],
    ]);
  });

  it('rejoins a clipped closed loop across its seam', () => {
    // Square loop starting inside, poking out of the right edge.
    const loop: Polyline = [[5, 2], [12, 2], [12, 8], [5, 8], [5, 2]];
    // Without rejoining this would be two pieces split at the loop's start point.
    expect(clipPolyline(loop, rect)).toEqual([[[10, 8], [5, 8], [5, 2], [10, 2]]]);
  });
});

describe('simplify', () => {
  it('removes collinear points', () => {
    expect(simplify([[0, 0], [1, 0], [2, 0], [3, 0]], 0.01)).toEqual([[0, 0], [3, 0]]);
  });

  it('keeps corners beyond tolerance', () => {
    expect(simplify([[0, 0], [5, 5], [10, 0]], 0.5)).toHaveLength(3);
  });
});

describe('orderPaths', () => {
  it('reduces travel and reverses paths when closer', () => {
    const paths: Polyline[] = [
      [[100, 0], [90, 0]],
      [[0, 0], [10, 0]],
      [[50, 0], [11, 0]],
    ];
    const ordered = orderPaths(paths);
    expect(ordered[0][0]).toEqual([0, 0]);
    expect(ordered[1][0]).toEqual([11, 0]);
    expect(travelLength(ordered)).toBeLessThan(travelLength(paths));
  });
});
