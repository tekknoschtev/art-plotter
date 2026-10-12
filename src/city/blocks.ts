import { ClipperOffset, EndType, FillRule, JoinType, area as pathArea, difference, ellipse, intersect as clipIntersect, union, type Path64, type Paths64 } from 'clipper2-ts';
import type { Point, Polyline, Rect } from '../types';
import { simplify } from '../geometry/simplify';

// Clipper works in integers: 1 unit = 1 µm.
const S = 1000;
// Max deviation of rounded arcs, in Clipper units (0.05 mm: invisible at pen scale, far fewer points).
const ARC_TOL = 50;
// Input lines are simplified first: Clipper's cost grows quickly with point count.
const SIMPLIFY = 0.15;

export const toPath = (line: Polyline): Path64 => line.map(([x, y]) => ({ x: Math.round(x * S), y: Math.round(y * S) }));
const toPaths = (lines: Polyline[]): Paths64 => lines.map(toPath);

/** Clipper path → closed polyline in mm. */
export function toPolyline(path: Path64): Polyline {
  const pts: Point[] = path.map((p) => [p.x / S, p.y / S]);
  if (pts.length) pts.push(pts[0]);
  return pts;
}

function offset(paths: Paths64, delta: number, end: EndType): Paths64 {
  const co = new ClipperOffset(2, ARC_TOL);
  co.addPaths(paths, JoinType.Round, end);
  const out: Paths64 = [];
  co.execute(delta * S, out);
  return out;
}

/** Thickens open lines into strips `width` mm wide with round ends. */
export function strokeLines(lines: Polyline[], width: number): Paths64 {
  const open = lines.filter((l) => l.length > 1).map((l) => simplify(l, SIMPLIFY));
  return open.length && width > 0 ? offset(toPaths(open), width / 2, EndType.Round) : [];
}

/** Thickens closed loops (e.g. a park edge) into rings `width` mm wide. */
export function strokeLoops(loops: Polyline[], width: number): Paths64 {
  const closed = loops.map((l) => simplify(l, SIMPLIFY).slice(0, -1));
  return loops.length && width > 0 ? offset(toPaths(closed), width / 2, EndType.Joined) : [];
}

export function circle(x: number, y: number, r: number): Path64 {
  return ellipse({ x: x * S, y: y * S }, r * S, r * S, Math.max(24, Math.round(r * 6)));
}

export function rectPath(r: Rect): Path64 {
  return toPath([
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ]);
}

export interface BlockOptions {
  /** Corner rounding radius, mm. Also removes slivers narrower than twice this. */
  cornerRadius: number;
  /** Drop blocks smaller than this, mm². */
  minArea: number;
}

/**
 * The city blocks: everything inside `region` not covered by `cuts`, with
 * convex corners rounded. Returns Clipper paths (outer contours and holes).
 */
export function buildBlocks(region: Rect, cuts: Paths64[], opts: BlockOptions): Paths64 {
  const rect = rectPath(region);
  const allCuts = union(cuts.flat(), FillRule.NonZero);
  let blocks = difference([rect], allCuts, FillRule.NonZero);
  if (opts.cornerRadius > 0) {
    // Morphological opening: shrink then grow back rounds every convex corner.
    // Done block by block: blocks never interact, and offsetting them all at
    // once makes Clipper re-union everything, which is much slower.
    const rounded: Paths64 = [];
    for (const b of blocks) {
      rounded.push(...offset(offset([b], -opts.cornerRadius, EndType.Polygon), opts.cornerRadius, EndType.Polygon));
    }
    blocks = rounded;
  }
  const minArea = opts.minArea * S * S;
  return blocks.filter((p) => Math.abs(pathArea(p)) >= minArea);
}

/** Each block shrunk by `inset` mm (for inner outlines). Holes are ignored. */
export function insetBlock(block: Path64, inset: number): Paths64 {
  return offset([block], -inset, EndType.Polygon);
}

export const area = (p: Path64) => pathArea(p) / (S * S);

export function intersect(a: Paths64, b: Paths64): Paths64 {
  return clipIntersect(a, b, FillRule.NonZero);
}
