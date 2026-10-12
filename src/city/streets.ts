import type { Point, Polyline, Rect } from '../types';
import { unit, type DirectionField } from './field';

export interface RoadClass {
  /** Distance between parallel streets of this class, mm. */
  spacing: number;
}

export interface Road {
  pts: Polyline;
  /** Index into the road classes (0 = major). */
  cls: number;
  /** 0 = major direction family, 1 = the perpendicular family. */
  family: 0 | 1;
  closed: boolean;
}

export interface TraceOptions {
  bounds: Rect;
  /** Integration step, mm. */
  step: number;
  /** True where roads of class `cls` may not go (water, parks…). */
  blocked: (x: number, y: number, cls: number) => boolean;
  random: () => number;
}

/** Uniform grid of points for fast "anything within r?" queries. */
class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  constructor(private size: number) {}
  private key(ix: number, iy: number) {
    return ix * 1_000_003 + iy;
  }
  add(item: T) {
    const k = this.key(Math.floor(item.x / this.size), Math.floor(item.y / this.size));
    const list = this.cells.get(k);
    if (list) list.push(item);
    else this.cells.set(k, [item]);
  }
  *near(x: number, y: number, r: number): Generator<T> {
    const x0 = Math.floor((x - r) / this.size);
    const x1 = Math.floor((x + r) / this.size);
    const y0 = Math.floor((y - r) / this.size);
    const y1 = Math.floor((y + r) / this.size);
    const r2 = r * r;
    for (let ix = x0; ix <= x1; ix++) {
      for (let iy = y0; iy <= y1; iy++) {
        const list = this.cells.get(this.key(ix, iy));
        if (!list) continue;
        for (const it of list) if ((it.x - x) ** 2 + (it.y - y) ** 2 <= r2) yield it;
      }
    }
  }
}

interface Sample {
  x: number;
  y: number;
  family: 0 | 1;
  road: number;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

/**
 * Traces road classes in order (major first). Each class fills the space left
 * by the classes before it with streets `spacing` mm apart, alternating
 * between the two perpendicular direction families.
 */
export function traceRoads(field: DirectionField, classes: RoadClass[], opts: TraceOptions): Road[] {
  const roads: Road[] = [];
  classes.forEach((c, cls) => traceClass(field, cls, c.spacing, roads, opts));
  joinDanglingEnds(roads, classes, opts);
  // Trimming one road can leave another dangling, so repeat a few times.
  let current = roads;
  for (let pass = 0; pass < 3; pass++) current = trimDeadEnds(current, opts);
  return current;
}

/**
 * Cuts each open road back to its outermost junctions. Ends that leave the
 * page or run into water/parks count as connected. Dead-end stubs would cut
 * slots into blocks, so they're removed; roads with < 2 connections vanish.
 */
function trimDeadEnds(roads: Road[], opts: TraceOptions): Road[] {
  const { step, bounds, blocked } = opts;
  const hash = new SpatialHash<Sample>(Math.max(2, step * 2));
  roads.forEach((r, id) => r.pts.forEach(([x, y]) => hash.add({ x, y, family: r.family, road: id })));
  const junctionRadius = step * 1.2;
  const isJunction = (x: number, y: number, id: number) => {
    for (const s of hash.near(x, y, junctionRadius)) if (s.road !== id) return true;
    return false;
  };
  const edge = step * 2.5;
  const exits = (p: Point, prev: Point, cls: number) => {
    if (p[0] - bounds.x0 < edge || bounds.x1 - p[0] < edge || p[1] - bounds.y0 < edge || bounds.y1 - p[1] < edge) return true;
    const len = Math.hypot(p[0] - prev[0], p[1] - prev[1]) || 1;
    const ahead: Point = [p[0] + ((p[0] - prev[0]) / len) * step * 3, p[1] + ((p[1] - prev[1]) / len) * step * 3];
    return blocked(ahead[0], ahead[1], cls);
  };

  const out: Road[] = [];
  roads.forEach((road, id) => {
    const pts = road.pts;
    if (road.closed || pts.length < 2) {
      out.push(road);
      return;
    }
    let start = exits(pts[0], pts[1], road.cls) ? 0 : -1;
    let end = exits(pts[pts.length - 1], pts[pts.length - 2], road.cls) ? pts.length - 1 : -1;
    if (start < 0) for (let i = 0; i < pts.length && start < 0; i++) if (isJunction(pts[i][0], pts[i][1], id)) start = i;
    if (end < 0) for (let i = pts.length - 1; i >= 0 && end < 0; i--) if (isJunction(pts[i][0], pts[i][1], id)) end = i;
    if (start < 0 || end < 0 || end - start < 1) return;
    out.push({ ...road, pts: pts.slice(start, end + 1) });
  });
  return out;
}

function traceClass(field: DirectionField, cls: number, dsep: number, roads: Road[], opts: TraceOptions) {
  const { bounds, step, blocked, random } = opts;
  const dtest = dsep * 0.5;
  const hash = new SpatialHash<Sample>(dsep);
  const queues: [Point[], Point[]] = [[], []];

  const direction = (p: Point, family: 0 | 1, prev: Point | null): Point | null => {
    const a = field.angle(p[0], p[1]);
    if (a === null) return null;
    const d = unit(a + (family ? Math.PI / 2 : 0));
    // Eigenvectors have no sign: keep heading the way we were going.
    if (prev && d[0] * prev[0] + d[1] * prev[1] < 0) return [-d[0], -d[1]];
    return d;
  };

  const tooClose = (x: number, y: number, family: 0 | 1, r: number) => {
    for (const s of hash.near(x, y, r)) if (s.family === family) return true;
    return false;
  };

  const addSeeds = (road: Road) => {
    const pts = road.pts;
    const every = Math.max(1, Math.round(dsep / 2 / step));
    for (let i = 0; i < pts.length; i += every) {
      const p = pts[i];
      const q = pts[Math.min(pts.length - 1, i + 1)];
      const o = pts[Math.max(0, i - 1)];
      const len = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1;
      const nx = -(q[1] - o[1]) / len;
      const ny = (q[0] - o[0]) / len;
      // Parallel neighbours (same family) one spacing to either side…
      queues[road.family].push([p[0] + nx * dsep, p[1] + ny * dsep], [p[0] - nx * dsep, p[1] - ny * dsep]);
      // …and cross streets (other family) starting from the road itself.
      if (i % (every * 2) === 0) queues[1 - road.family].push([p[0], p[1]]);
    }
  };

  // Roads from earlier (larger) classes: keep clear of them and seed new streets off them.
  roads.forEach((road, id) => {
    for (const [x, y] of road.pts) hash.add({ x, y, family: road.family, road: id });
    addSeeds(road);
  });

  const validSeed = (p: Point, family: 0 | 1) =>
    inRect(bounds, p[0], p[1]) && !blocked(p[0], p[1], cls) && field.angle(p[0], p[1]) !== null && !tooClose(p[0], p[1], family, dsep * 0.9);

  // A street must not run back over itself (spiralling round a plaza, say).
  // Points are tagged with their distance along the street from the seed.
  const selfRadius = step * 3;
  const longest = 2 * (bounds.x1 - bounds.x0 + bounds.y1 - bounds.y0);

  const integrate = (
    seed: Point,
    family: 0 | 1,
    sign: 1 | -1,
    own: SpatialHash<{ x: number; y: number; s: number }>,
  ): { pts: Point[]; closed: boolean } => {
    const pts: Point[] = [];
    const d0 = direction(seed, family, null);
    if (!d0) return { pts, closed: false };
    let prev: Point = [d0[0] * sign, d0[1] * sign];
    let p = seed;
    let length = 0;
    while (length < longest) {
      // RK4 along the direction field.
      const k1 = direction(p, family, prev);
      if (!k1) break;
      const k2 = direction([p[0] + (k1[0] * step) / 2, p[1] + (k1[1] * step) / 2], family, k1);
      if (!k2) break;
      const k3 = direction([p[0] + (k2[0] * step) / 2, p[1] + (k2[1] * step) / 2], family, k2);
      if (!k3) break;
      const k4 = direction([p[0] + k3[0] * step, p[1] + k3[1] * step], family, k3);
      if (!k4) break;
      let dx = k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0];
      let dy = k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) break;
      dx /= len;
      dy /= len;
      const next: Point = [p[0] + dx * step, p[1] + dy * step];
      if (!inRect(bounds, next[0], next[1]) || blocked(next[0], next[1], cls)) break;
      if (tooClose(next[0], next[1], family, dtest)) break;
      length += step;
      const s = sign * length;
      // Met an earlier stretch of this same street (not the bit just behind us)?
      let hitSelf: number | null = null;
      for (const q of own.near(next[0], next[1], selfRadius)) {
        if (Math.abs(q.s - s) > selfRadius * 4) {
          hitSelf = q.s;
          break;
        }
      }
      if (hitSelf !== null) {
        // Back where it started: a ring road. Anywhere else: stop before overlapping.
        if (sign === 1 && Math.abs(hitSelf) < selfRadius * 2) return { pts, closed: true };
        break;
      }
      own.add({ x: next[0], y: next[1], s });
      pts.push(next);
      prev = [dx, dy];
      p = next;
    }
    return { pts, closed: false };
  };

  let family: 0 | 1 = 0;
  let failures = 0;
  while (failures < 2 && roads.length < 5000) {
    let seed: Point | null = null;
    const queue = queues[family];
    while (queue.length) {
      const candidate = queue.shift()!;
      if (validSeed(candidate, family)) {
        seed = candidate;
        break;
      }
    }
    for (let attempt = 0; !seed && attempt < 40; attempt++) {
      const candidate: Point = [
        bounds.x0 + random() * (bounds.x1 - bounds.x0),
        bounds.y0 + random() * (bounds.y1 - bounds.y0),
      ];
      if (validSeed(candidate, family)) seed = candidate;
    }
    if (!seed) {
      failures++;
      family = family ? 0 : 1;
      continue;
    }

    const own = new SpatialHash<{ x: number; y: number; s: number }>(selfRadius * 2);
    own.add({ x: seed[0], y: seed[1], s: 0 });
    const fwd = integrate(seed, family, 1, own);
    const pts: Point[] = fwd.closed ? [seed, ...fwd.pts, seed] : [...integrate(seed, family, -1, own).pts.reverse(), seed, ...fwd.pts];
    if (pts.length * step >= dsep * 0.6) {
      failures = 0;
      const road: Road = { pts, cls, family, closed: fwd.closed };
      roads.push(road);
      for (const [x, y] of pts) hash.add({ x, y, family, road: roads.length - 1 });
      addSeeds(road);
    } else {
      // Too short to keep; mark the spot so we don't keep retrying it.
      hash.add({ x: seed[0], y: seed[1], family, road: -1 });
    }
    family = family ? 0 : 1;
  }
}

/**
 * Extends open road ends to the nearest road ahead of them (within ~0.7 of
 * the road's spacing), so streets form T-junctions instead of dead ends.
 */
function joinDanglingEnds(roads: Road[], classes: RoadClass[], opts: TraceOptions) {
  const maxJoin = Math.max(...classes.map((c) => c.spacing)) * 0.7;
  const hash = new SpatialHash<Sample & { i: number }>(Math.max(5, maxJoin / 2));
  roads.forEach((r, id) => r.pts.forEach(([x, y], i) => hash.add({ x, y, family: r.family, road: id, i })));

  roads.forEach((road, id) => {
    if (road.closed || road.pts.length < 3) return;
    const reach = classes[road.cls].spacing * 0.7;
    for (const atEnd of [false, true]) {
      const pts = road.pts;
      const end = atEnd ? pts[pts.length - 1] : pts[0];
      const before = atEnd ? pts[pts.length - 3] : pts[2];
      const hl = Math.hypot(end[0] - before[0], end[1] - before[1]) || 1;
      const hx = (end[0] - before[0]) / hl;
      const hy = (end[1] - before[1]) / hl;
      let best: Point | null = null;
      let bestD = Infinity;
      for (const s of hash.near(end[0], end[1], reach)) {
        if (s.road === id) continue;
        const dx = s.x - end[0];
        const dy = s.y - end[1];
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          bestD = 0;
          best = null;
          break;
        }
        // Only join roads roughly ahead, so streets don't kink backwards.
        if ((dx * hx + dy * hy) / d < 0.5) continue;
        if (opts.blocked((end[0] + s.x) / 2, (end[1] + s.y) / 2, road.cls)) continue;
        if (d < bestD) {
          bestD = d;
          best = [s.x, s.y];
        }
      }
      if (best) {
        if (atEnd) pts.push(best);
        else pts.unshift(best);
      }
    }
  });
}
