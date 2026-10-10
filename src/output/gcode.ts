import type { Polyline, Rect } from '../types';
import { pathLength, travelLength } from '../geometry/order';

export interface ToolProfile {
  /** Z height (mm) while drawing. Negative = pressed into the surface. */
  drawZ: number;
  /** Z height (mm) for pen-up travel moves. */
  travelZ: number;
  /** XY feed while drawing, mm/min. */
  drawFeed: number;
  /** XY feed while travelling, mm/min. */
  travelFeed: number;
  /** Z feed for lifting and lowering, mm/min. The MPCNC Z is slow. */
  zFeed: number;
  /** Pause after lowering, ms. Lets a brush settle and load the surface. */
  dwellMs: number;
  /** Draw the paths in reverse order and direction. */
  reverse: boolean;
}

export interface GcodeOptions {
  profile: ToolProfile;
  /** Name shown in the header comment, e.g. "Pen". */
  label: string;
  startGcode: string;
  endGcode: string;
  /** Extra lines written as comments at the top of the file. */
  comments?: string[];
}

export interface PlotStats {
  paths: number;
  drawLength: number;
  travelLength: number;
  /** Rough time in seconds. Ignores acceleration, so treat it as a lower bound. */
  seconds: number;
}

const fmt = (n: number) => {
  const s = n.toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

function applyDirection(paths: Polyline[], reverse: boolean): Polyline[] {
  return reverse ? paths.slice().reverse().map((p) => p.slice().reverse()) : paths;
}

export function estimate(paths: Polyline[], profile: ToolProfile): PlotStats {
  const drawLength = paths.reduce((sum, p) => sum + pathLength(p), 0);
  const travel = travelLength(paths);
  const zTravel = Math.abs(profile.travelZ - profile.drawZ) * 2 * paths.length;
  const minutes = drawLength / profile.drawFeed + travel / profile.travelFeed + zTravel / profile.zFeed;
  const seconds = minutes * 60 + (profile.dwellMs / 1000) * paths.length;
  return { paths: paths.length, drawLength, travelLength: travel, seconds };
}

export function toGcode(input: Polyline[], opts: GcodeOptions): string {
  const { profile: p } = opts;
  const paths = applyDirection(input, p.reverse);
  const stats = estimate(paths, p);
  const out: string[] = [];
  const comment = (s: string) => out.push(`; ${s}`);

  comment(`Art Plotter — ${opts.label} pass`);
  for (const c of opts.comments ?? []) comment(c);
  comment(`Paths: ${stats.paths}, draw ${(stats.drawLength / 1000).toFixed(2)} m, travel ${(stats.travelLength / 1000).toFixed(2)} m`);
  comment(`Estimated time: ${formatDuration(stats.seconds)} (excludes acceleration)`);
  comment('Before running: jog the tool tip to touch the artwork bottom-left corner.');
  out.push('G21 ; millimetres');
  out.push('G90 ; absolute positioning');
  out.push('G92 X0 Y0 Z0 ; current position is the origin');
  if (opts.startGcode.trim()) out.push(opts.startGcode.trim());
  out.push(`G1 Z${fmt(p.travelZ)} F${fmt(p.zFeed)} ; lift`);

  for (const path of paths) {
    const [x0, y0] = path[0];
    out.push(`G0 X${fmt(x0)} Y${fmt(y0)} F${fmt(p.travelFeed)}`);
    out.push(`G1 Z${fmt(p.drawZ)} F${fmt(p.zFeed)}`);
    if (p.dwellMs > 0) out.push(`G4 P${Math.round(p.dwellMs)}`);
    for (let i = 1; i < path.length; i++) {
      const [x, y] = path[i];
      out.push(i === 1 ? `G1 X${fmt(x)} Y${fmt(y)} F${fmt(p.drawFeed)}` : `G1 X${fmt(x)} Y${fmt(y)}`);
    }
    out.push(`G1 Z${fmt(p.travelZ)} F${fmt(p.zFeed)}`);
  }

  out.push(`G0 X0 Y0 F${fmt(p.travelFeed)} ; return to origin`);
  if (opts.endGcode.trim()) out.push(opts.endGcode.trim());
  out.push('M400 ; wait for moves to finish');
  return out.join('\n') + '\n';
}

/** Traces the drawable area at travel height so placement can be checked without drawing. */
export function boundaryGcode(rect: Rect, profile: ToolProfile): string {
  const f = fmt(profile.travelFeed);
  return [
    '; Art Plotter — boundary check (tool stays raised)',
    'G21',
    'G90',
    'G92 X0 Y0 Z0',
    `G1 Z${fmt(profile.travelZ)} F${fmt(profile.zFeed)}`,
    `G0 X${fmt(rect.x0)} Y${fmt(rect.y0)} F${f}`,
    `G0 X${fmt(rect.x1)} Y${fmt(rect.y0)}`,
    `G0 X${fmt(rect.x1)} Y${fmt(rect.y1)}`,
    `G0 X${fmt(rect.x0)} Y${fmt(rect.y1)}`,
    `G0 X${fmt(rect.x0)} Y${fmt(rect.y0)}`,
    'G0 X0 Y0',
    'M400',
    '',
  ].join('\n');
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}
