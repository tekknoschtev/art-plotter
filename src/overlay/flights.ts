import type { CanvasSettings, Point, Polyline } from '../types';
import { drawableRect } from '../types';
import { mulberry32 } from '../noise';

/** Straight lines / gentle arcs with direction chevrons, drawn over any pattern. */
export interface FlightSettings {
  enabled: boolean;
  seed: number;
  routes: number;
  /** Shared endpoints that several routes start or end at (0 = every route independent). */
  hubs: number;
  /** 0 = straight lines, 1 = strongly bowed arcs. */
  curve: number;
  /** Fraction of routes that run off the edge of the page. */
  offPage: number;
  /** Distance between chevrons along a route, mm. */
  arrowSpacing: number;
  /** Chevron arm length, mm. */
  arrowSize: number;
  endpoint: 'dot' | 'ring' | 'none';
  markerSize: number;
}

export function flightDefaults(): FlightSettings {
  return {
    enabled: false,
    seed: 77,
    routes: 14,
    hubs: 4,
    curve: 0.25,
    offPage: 0.35,
    arrowSpacing: 18,
    arrowSize: 1.6,
    endpoint: 'dot',
    markerSize: 1.2,
  };
}

const circle = (c: Point, r: number, n = 20): Polyline => {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return pts;
};

/** Endpoint marker: a ring, or a "dot" (ring plus a smaller ring inside, so it reads as solid). */
function marker(c: Point, s: FlightSettings): Polyline[] {
  if (s.endpoint === 'none') return [];
  const r = s.markerSize;
  return s.endpoint === 'ring' ? [circle(c, r)] : [circle(c, r), circle(c, r * 0.45, 12)];
}

/** Route path from a to b: a quadratic arc bowed sideways by `bow` (fraction of length, signed). */
function route(a: Point, b: Point, bow: number): Polyline {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / len;
  const ny = (b[0] - a[0]) / len;
  const c: Point = [(a[0] + b[0]) / 2 + nx * bow * len, (a[1] + b[1]) / 2 + ny * bow * len];
  const steps = Math.max(2, Math.ceil(len / 2));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return pts;
}

/** V-shaped chevrons pointing along the route, every `spacing` mm. */
function chevrons(path: Polyline, spacing: number, size: number): Polyline[] {
  const out: Polyline[] = [];
  const spread = Math.tan((28 * Math.PI) / 180);
  let next = spacing / 2;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1];
    const [bx, by] = path[i];
    const seg = Math.hypot(bx - ax, by - ay);
    while (seg > 0 && next <= walked + seg) {
      const t = (next - walked) / seg;
      const tip: Point = [ax + (bx - ax) * t, ay + (by - ay) * t];
      const dx = (bx - ax) / seg;
      const dy = (by - ay) / seg;
      // Arms trail back from the tip on either side.
      const back: Point = [tip[0] - dx * size, tip[1] - dy * size];
      const w = size * spread;
      out.push([[back[0] - dy * w, back[1] + dx * w], tip, [back[0] + dy * w, back[1] - dx * w]]);
      next += spacing;
    }
    walked += seg;
  }
  return out;
}

export function generateFlights(s: FlightSettings, canvas: CanvasSettings): Polyline[] {
  if (!s.enabled || s.routes <= 0) return [];
  const random = mulberry32(s.seed);
  const r = drawableRect(canvas);
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const diag = Math.hypot(w, h);
  const pick = (inset = 0.08): Point => [r.x0 + w * (inset + random() * (1 - 2 * inset)), r.y0 + h * (inset + random() * (1 - 2 * inset))];

  const hubs: Point[] = [];
  for (let i = 0; i < s.hubs; i++) hubs.push(pick(0.15));
  const endpoint = (): Point => (hubs.length && random() < 0.7 ? hubs[Math.floor(random() * hubs.length)] : pick());

  const out: Polyline[] = [];
  const marked = new Set<string>();
  const mark = (p: Point) => {
    const key = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
    if (marked.has(key)) return;
    marked.add(key);
    out.push(...marker(p, s));
  };

  for (let i = 0; i < s.routes; i++) {
    const a = endpoint();
    let b: Point;
    const offPage = random() < s.offPage;
    if (offPage) {
      // Head off in a random direction, far enough to leave the page (clipped at the margin).
      const ang = random() * Math.PI * 2;
      b = [a[0] + Math.cos(ang) * diag, a[1] + Math.sin(ang) * diag];
    } else {
      b = endpoint();
      for (let tries = 0; tries < 10 && Math.hypot(b[0] - a[0], b[1] - a[1]) < diag * 0.25; tries++) b = endpoint();
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
    }
    const bow = s.curve * 0.35 * (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5);
    const path = route(a, b, bow);
    out.push(path, ...chevrons(path, s.arrowSpacing, s.arrowSize));
    mark(a);
    if (!offPage) mark(b);
  }
  return out;
}
