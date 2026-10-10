import type { Point, Polyline, Rect } from '../types';

/** Liang–Barsky clip of segment a→b. Returns the visible parameter range, or null. */
function clipSegment(a: Point, b: Point, r: Rect): [number, number] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [t0, t1];
}

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function isClosed(line: Polyline): boolean {
  if (line.length < 3) return false;
  const a = line[0];
  const b = line[line.length - 1];
  return a[0] === b[0] && a[1] === b[1];
}

/** Clip a polyline to a rectangle, splitting it into the pieces that remain visible. */
export function clipPolyline(line: Polyline, rect: Rect): Polyline[] {
  const pieces: Polyline[] = [];
  let current: Polyline = [];
  // Whether `current` started at line[0] and ended at the line's last point, unclipped.
  let firstPieceStartsAtOrigin = false;

  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const range = clipSegment(a, b, rect);
    if (!range) {
      if (current.length > 1) pieces.push(current);
      current = [];
      continue;
    }
    const [t0, t1] = range;
    if (current.length === 0) {
      current.push(t0 === 0 ? a : lerp(a, b, t0));
      if (i === 0 && t0 === 0) firstPieceStartsAtOrigin = true;
    } else if (t0 > 0) {
      // Segment re-enters the rect: start a new piece.
      if (current.length > 1) pieces.push(current);
      current = [lerp(a, b, t0)];
    }
    current.push(t1 === 1 ? b : lerp(a, b, t1));
    if (t1 < 1) {
      if (current.length > 1) pieces.push(current);
      current = [];
    }
  }
  const lastPieceEndsAtEnd = current.length > 1;
  if (current.length > 1) pieces.push(current);

  // A closed loop cut by the rect: if it was visible across its start/end point,
  // the first and last pieces are really one continuous stroke.
  if (isClosed(line) && pieces.length > 1 && firstPieceStartsAtOrigin && lastPieceEndsAtEnd) {
    const first = pieces.shift()!;
    const last = pieces.pop()!;
    pieces.push([...last, ...first.slice(1)]);
  }
  return pieces;
}

export function clipPolylines(lines: Polyline[], rect: Rect): Polyline[] {
  return lines.flatMap((l) => clipPolyline(l, rect));
}
