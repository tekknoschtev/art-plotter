import { expect, it } from 'vitest';
import { ClipperOffset, EndType, JoinType, area, getBounds, type Paths64 } from 'clipper2-ts';

const off = (ps: Paths64, d: number, end: EndType, tol = 50) => { const co = new ClipperOffset(2, tol); co.addPaths(ps, JoinType.Round, end); const o: Paths64 = []; co.execute(d, o); return o; };

// Guards against Clipper ports with broken offsetting (clipper2-js 1.2.4 returned wrong widths and leaked state).
it('clipper offsets strips and rounds corners correctly', () => {
  const strip = off([[{ x: 0, y: 0 }, { x: 10000, y: 0 }]], 1000, EndType.Round);
  expect(strip).toHaveLength(1);
  const b = getBounds(strip[0]);
  // Round ends are polygonal, so allow a little slack at the tips.
  for (const [got, want] of [[b.left, -1000], [b.top, -1000], [b.right, 11000], [b.bottom, 1000]]) expect(Math.abs(got - want)).toBeLessThan(60);
  expect(Math.abs(area(strip[0]))).toBeCloseTo(20_000_000 + Math.PI * 1e6, -6);
  const sq: Paths64 = [[{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 10000 }, { x: 0, y: 10000 }]];
  const shrunk = off(sq, -1000, EndType.Polygon);
  expect(getBounds(shrunk[0])).toMatchObject({ left: 1000, top: 1000, right: 9000, bottom: 9000 });
  const opened = off(shrunk, 1000, EndType.Polygon);
  // Back to the full square, but with rounded corners (area short by (4 − π)·r²).
  expect(Math.abs(area(opened[0]))).toBeCloseTo(1e8 - (4 - Math.PI) * 1e6, -6);
});
