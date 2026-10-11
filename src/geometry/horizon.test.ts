import { describe, expect, it } from 'vitest';
import { removeHiddenLines } from './horizon';
import type { Polyline } from '../types';

const flat = (y: number, x0 = 0, x1 = 10): Polyline => [[x0, y], [x1, y]];

describe('removeHiddenLines', () => {
  it('hides a back line that never rises above the front line', () => {
    const out = removeHiddenLines([flat(5), flat(3)], 0.5);
    expect(out).toHaveLength(1);
    expect(out[0][0][1]).toBe(5);
  });

  it('keeps a back line that is entirely above the front line', () => {
    expect(removeHiddenLines([flat(5), flat(8)], 0.5)).toHaveLength(2);
  });

  it('shows only the part of a back line that pokes over a front ridge', () => {
    // Back line is flat at y=5; front line is a peak reaching y=10 in the middle.
    const front: Polyline = [[0, 0], [5, 10], [10, 0]];
    const out = removeHiddenLines([front, flat(5)], 0.1);
    // The back line is split around the peak: visible at both ends, hidden in the middle.
    expect(out).toHaveLength(3);
    const [left, right] = out.slice(1).sort((a, b) => a[0][0] - b[0][0]);
    expect(left[left.length - 1][0]).toBeCloseTo(2.5, 1);
    expect(right[0][0]).toBeCloseTo(7.5, 1);
  });

  it('lets a back line show beyond the front line’s x range', () => {
    const out = removeHiddenLines([flat(5, 3, 7), flat(1, 0, 10)], 0.5);
    // Front line plus the two uncovered ends of the back line.
    expect(out).toHaveLength(3);
  });
});
