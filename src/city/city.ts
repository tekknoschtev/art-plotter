import type { Point, Polyline, Rect } from '../types';
import { createFbm3D, mulberry32 } from '../noise';
import { buildField, type Basis } from './field';
import { traceRoads, type Road } from './streets';
import { blob, Mask, meanderLine } from './features';
import type { CityMask } from './mask';

export interface CitySettings {
  seed: number;
  /** Spacing between parallel streets for major / main / minor roads, mm. */
  majorSpacing: number;
  mainSpacing: number;
  minorSpacing: number;
  /** Number of differently angled grid districts. */
  districts: number;
  /** How much streets bend organically, 0–1. */
  organic: number;
  /** Size of the organic bends, mm. */
  organicScale: number;

  river: boolean;
  riverWidth: number;
  /** Direction the river flows across the page, degrees. */
  riverAngle: number;
  /** Sideways position of the river, −1…1. */
  riverOffset: number;
  riverMeander: number;
  /** How far from the river streets are pulled parallel to it, mm. */
  riverPull: number;
  bridges: boolean;

  plazas: number;
  plazaRadius: number;
  /** Radius over which avenues radiate from each plaza, mm. */
  plazaReach: number;

  parks: number;
  parkSize: number;
  parkPaths: number;

  railway: boolean;
  railAngle: number;
  railOffset: number;
}

export interface CityLayout {
  bounds: Rect;
  roads: Road[];
  river: Polyline | null;
  rail: Polyline | null;
  parks: Polyline[];
  parkPaths: Polyline[];
  plazas: { x: number; y: number }[];
}

const WATER = 1;
const PARK = 2;

/** Places the features, builds the street-direction field and traces the roads. */
export function layoutCity(p: CitySettings, drawable: Rect, minorWidth: number, shape: CityMask | null = null): CityLayout {
  const random = mulberry32(p.seed);
  const pad = 4;
  const bounds: Rect = { x0: drawable.x0 - pad, y0: drawable.y0 - pad, x1: drawable.x1 + pad, y1: drawable.y1 + pad };
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  const diag = Math.hypot(w, h);
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const randomPoint = (inset = 0.1): Point => [
    bounds.x0 + w * (inset + random() * (1 - 2 * inset)),
    bounds.y0 + h * (inset + random() * (1 - 2 * inset)),
  ];

  const river = p.river ? meanderLine(bounds, rad(p.riverAngle), p.riverOffset, p.riverMeander, p.seed + 11) : null;
  const rail = p.railway ? meanderLine(bounds, rad(p.railAngle), p.railOffset, 0.15, p.seed + 23, 4) : null;
  const distToRiver = (x: number, y: number) =>
    river ? Math.min(...river.map(([rx, ry]) => Math.hypot(rx - x, ry - y))) : Infinity;

  // Features that need open ground: keep them off the river and apart from each other.
  const taken: { x: number; y: number; r: number }[] = [];
  const place = (radius: number): Point | null => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const [x, y] = randomPoint(0.12);
      if (distToRiver(x, y) < p.riverWidth / 2 + radius + 8) continue;
      if (shape && shape.distance(x, y) < radius + 5) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < t.r + radius + 15)) continue;
      taken.push({ x, y, r: radius });
      return [x, y];
    }
    return null;
  };

  const plazas: { x: number; y: number }[] = [];
  for (let i = 0; i < p.plazas; i++) {
    const at = place(p.plazaRadius * 3);
    if (at) plazas.push({ x: at[0], y: at[1] });
  }
  const parks: Polyline[] = [];
  const parkPaths: Polyline[] = [];
  for (let i = 0; i < p.parks; i++) {
    const r = p.parkSize * (0.7 + random() * 0.6);
    const at = place(r);
    if (!at) continue;
    const park = blob(at[0], at[1], r, 0.35, p.seed + 100 + i);
    parks.push(park);
    for (let k = 0; k < p.parkPaths; k++) parkPaths.push(parkPath(at[0], at[1], r, random));
  }

  // Street-direction field.
  const bases: Basis[] = [{ kind: 'grid', x: 0, y: 0, angle: random() * Math.PI, size: Infinity, weight: 0.15 }];
  for (let i = 0; i < p.districts; i++) {
    const [x, y] = randomPoint(0);
    bases.push({ kind: 'grid', x, y, angle: random() * Math.PI, size: diag * 0.3, weight: 1 });
  }
  for (const pl of plazas) bases.push({ kind: 'radial', x: pl.x, y: pl.y, size: p.plazaReach, weight: 3 });
  if (river) bases.push({ kind: 'line', line: river, size: p.riverPull, weight: 4 });
  const bend = p.organic > 0 ? createFbm3D(p.seed + 7, 2) : null;
  const field = buildField(bases, bounds, 4, bend ? (x, y) => p.organic * (Math.PI / 2) * bend(x / p.organicScale, y / p.organicScale, 0) : undefined);

  // Where roads may not go.
  const mask = new Mask(bounds, 1.5);
  if (river) mask.addBand(river, p.riverWidth / 2 + minorWidth, WATER);
  for (const park of parks) mask.addPolygon(park, PARK);
  // Streets overshoot the city shape slightly so edge blocks are still bounded by streets.
  const overshoot = p.minorSpacing;
  const blocked = (x: number, y: number, cls: number) => {
    if (shape && shape.distance(x, y) < -overshoot) return true;
    const m = mask.get(x, y);
    if (m & WATER) return cls !== 0 || !p.bridges;
    if (m & PARK) return cls !== 0;
    return false;
  };

  const roads = traceRoads(
    field,
    [{ spacing: p.majorSpacing }, { spacing: p.mainSpacing }, { spacing: p.minorSpacing }],
    {
      bounds,
      step: Math.min(1.5, p.minorSpacing / 8),
      blocked,
      random,
      // A straight-ish crossing is about one river width; allow some slant.
      water: river ? { test: (x, y) => (mask.get(x, y) & WATER) !== 0, maxRun: p.riverWidth * 1.8 } : undefined,
    },
  );

  return { bounds, roads, river, rail, parks, parkPaths, plazas };
}

/** A gently curving footpath crossing a park. */
function parkPath(cx: number, cy: number, r: number, random: () => number): Polyline {
  const a1 = random() * Math.PI * 2;
  const a2 = a1 + Math.PI * (0.6 + random() * 0.8);
  const p0: Point = [cx + Math.cos(a1) * r * 1.1, cy + Math.sin(a1) * r * 1.1];
  const p2: Point = [cx + Math.cos(a2) * r * 1.1, cy + Math.sin(a2) * r * 1.1];
  const c: Point = [cx + (random() - 0.5) * r * 0.8, cy + (random() - 0.5) * r * 0.8];
  const pts: Point[] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const u = 1 - t;
    pts.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  return pts;
}
