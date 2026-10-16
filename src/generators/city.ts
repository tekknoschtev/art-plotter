import type { Generator } from './types';
import type { Polyline } from '../types';
import { drawableRect } from '../types';
import { createFbm3D, mulberry32 } from '../noise';
import { layoutCity, type CitySettings } from '../city/city';
import {
  area,
  buildBlocks,
  circle,
  grow,
  insetBlock,
  intersect,
  loopsToRegion,
  rectPath,
  strokeLines,
  strokeLoops,
  toPolyline,
} from '../city/blocks';
import { buildMask, keepInside, type MaskSettings } from '../city/mask';
import type { Path64, Paths64 } from 'clipper2-ts';

export type EdgeStyle = 'crisp' | 'ragged' | 'fade';

export interface CityParams extends CitySettings, MaskSettings {
  /** What happens to blocks at the city outline (when a shape mask is on). */
  edgeStyle: EdgeStyle;
  /** Fade: width of the band where blocks thin out, mm (inward from the edge). */
  fadeWidth: number;
  /** Fade: how much blocks shrink as they near the edge, mm. */
  fadeShrink: number;
  /** Draw the city outline (a coastline) around the blocks. */
  maskOutline: boolean;
  /** Gap between the blocks and the drawn outline, mm. */
  outlineGap: number;
  output: 'blocks' | 'streets' | 'both';
  /** Gap left for each road class, mm. */
  majorWidth: number;
  mainWidth: number;
  minorWidth: number;
  railWidth: number;
  pathWidth: number;
  cornerRadius: number;
  minBlockArea: number;
  /** Fraction of blocks that get a second, inset outline. */
  innerChance: number;
  innerInset: number;
  /** Draw a small round monument in each plaza. */
  monuments: boolean;
}

export const cityGenerator: Generator<CityParams> = {
  id: 'city',
  name: 'City map',

  defaults: () => ({
    seed: 2024,
    output: 'blocks',
    majorSpacing: 110,
    mainSpacing: 42,
    minorSpacing: 13,
    districts: 3,
    organic: 0.25,
    organicScale: 300,
    majorWidth: 6,
    mainWidth: 3.5,
    minorWidth: 1.8,
    cornerRadius: 1.2,
    minBlockArea: 8,
    innerChance: 0.15,
    innerInset: 1.3,

    river: true,
    riverWidth: 22,
    riverAngle: 20,
    riverOffset: -0.1,
    riverMeander: 0.5,
    riverPull: 90,
    bridges: true,

    plazas: 2,
    plazaRadius: 10,
    plazaReach: 120,
    monuments: true,

    parks: 1,
    parkSize: 40,
    parkPaths: 2,
    pathWidth: 1.2,

    railway: false,
    railAngle: 110,
    railOffset: 0.35,
    railWidth: 4,

    maskShape: 'none',
    maskSize: 0.85,
    maskStretch: 1,
    maskIrregularity: 0.4,
    maskX: 0.5,
    maskY: 0.5,
    islandScale: 90,
    islandLevel: 0,
    maskInvert: false,
    edgeStyle: 'fade',
    fadeWidth: 40,
    fadeShrink: 1,
    maskOutline: false,
    outlineGap: 2,
  }),

  presets: {
    'Riverside': () => cityGenerator.defaults(),
    'Old town': () => ({
      ...cityGenerator.defaults(),
      districts: 5,
      organic: 0.7,
      organicScale: 160,
      minorSpacing: 10,
      mainSpacing: 34,
      cornerRadius: 1.6,
      riverMeander: 0.9,
      plazas: 1,
      parks: 0,
      innerChance: 0.25,
    }),
    'Planned grid': () => ({
      ...cityGenerator.defaults(),
      districts: 1,
      organic: 0,
      minorSpacing: 15,
      mainSpacing: 60,
      majorSpacing: 180,
      cornerRadius: 0.8,
      riverMeander: 0.25,
      riverPull: 40,
      plazas: 0,
      parks: 2,
      parkSize: 45,
      innerChance: 0.05,
    }),
    'Étoiles': () => ({
      ...cityGenerator.defaults(),
      districts: 2,
      organic: 0.15,
      plazas: 4,
      plazaRadius: 9,
      plazaReach: 150,
      majorSpacing: 90,
      parks: 1,
      railway: true,
    }),
    'Fading city': () => ({
      ...cityGenerator.defaults(),
      maskShape: 'blob',
      maskSize: 0.8,
      edgeStyle: 'fade',
      fadeWidth: 45,
    }),
    'Island': () => ({
      ...cityGenerator.defaults(),
      maskShape: 'island',
      maskSize: 0.85,
      maskIrregularity: 0.5,
      edgeStyle: 'crisp',
      maskOutline: true,
      river: false,
      parks: 1,
    }),
  },

  bindUI(f, p) {
    f.addBinding(p, 'seed', { step: 1, min: 0 });
    f.addBinding(p, 'output', { options: { Blocks: 'blocks', Streets: 'streets', Both: 'both' } });

    const streets = f.addFolder({ title: 'Streets' });
    streets.addBinding(p, 'majorSpacing', { label: 'major spacing', min: 30, max: 400, step: 1 });
    streets.addBinding(p, 'mainSpacing', { label: 'main spacing', min: 10, max: 200, step: 1 });
    streets.addBinding(p, 'minorSpacing', { label: 'minor spacing', min: 4, max: 80, step: 0.5 });
    streets.addBinding(p, 'districts', { min: 0, max: 10, step: 1 });
    streets.addBinding(p, 'organic', { min: 0, max: 1, step: 0.01 });
    streets.addBinding(p, 'organicScale', { label: 'organic scale', min: 30, max: 1000, step: 5 });

    const blocks = f.addFolder({ title: 'Blocks' });
    blocks.addBinding(p, 'majorWidth', { label: 'major gap', min: 0.5, max: 20, step: 0.1 });
    blocks.addBinding(p, 'mainWidth', { label: 'main gap', min: 0.5, max: 15, step: 0.1 });
    blocks.addBinding(p, 'minorWidth', { label: 'minor gap', min: 0.3, max: 10, step: 0.1 });
    blocks.addBinding(p, 'cornerRadius', { label: 'corner radius', min: 0, max: 8, step: 0.1 });
    blocks.addBinding(p, 'minBlockArea', { label: 'min area mm²', min: 0, max: 200, step: 1 });
    blocks.addBinding(p, 'innerChance', { label: 'inner outlines', min: 0, max: 1, step: 0.01 });
    blocks.addBinding(p, 'innerInset', { label: 'inner inset', min: 0.3, max: 5, step: 0.1 });

    const shape = f.addFolder({ title: 'Shape & edge', expanded: false });
    shape.addBinding(p, 'maskShape', {
      label: 'shape',
      options: { 'Full canvas': 'none', Blob: 'blob', 'Noise island': 'island', 'Image silhouette': 'image' },
    });
    shape.addBinding(p, 'edgeStyle', { label: 'edge', options: { Fade: 'fade', 'Ragged (whole blocks)': 'ragged', Crisp: 'crisp' } });
    shape.addBinding(p, 'fadeWidth', { label: 'fade mm', min: 1, max: 300, step: 1 });
    shape.addBinding(p, 'fadeShrink', { label: 'fade shrink', min: 0, max: 5, step: 0.1 });
    shape.addBinding(p, 'maskSize', { label: 'size', min: 0.1, max: 2, step: 0.01 });
    shape.addBinding(p, 'maskStretch', { label: 'stretch', min: 0.2, max: 5, step: 0.01 });
    shape.addBinding(p, 'maskIrregularity', { label: 'irregularity', min: 0, max: 1.5, step: 0.01 });
    shape.addBinding(p, 'maskX', { label: 'centre x', min: 0, max: 1, step: 0.01 });
    shape.addBinding(p, 'maskY', { label: 'centre y', min: 0, max: 1, step: 0.01 });
    shape.addBinding(p, 'islandScale', { label: 'coast scale', min: 10, max: 600, step: 1 });
    shape.addBinding(p, 'islandLevel', { label: 'sea level', min: -0.5, max: 0.8, step: 0.01 });
    shape.addBinding(p, 'maskInvert', { label: 'invert image' });
    shape.addBinding(p, 'maskOutline', { label: 'draw outline' });
    shape.addBinding(p, 'outlineGap', { label: 'outline gap', min: 0, max: 20, step: 0.1 });

    const river = f.addFolder({ title: 'River', expanded: false });
    river.addBinding(p, 'river', { label: 'enabled' });
    river.addBinding(p, 'riverWidth', { label: 'width', min: 3, max: 120, step: 0.5 });
    river.addBinding(p, 'riverAngle', { label: 'angle°', min: 0, max: 180, step: 1 });
    river.addBinding(p, 'riverOffset', { label: 'offset', min: -1, max: 1, step: 0.01 });
    river.addBinding(p, 'riverMeander', { label: 'meander', min: 0, max: 1.5, step: 0.01 });
    river.addBinding(p, 'riverPull', { label: 'grid pull mm', min: 0, max: 400, step: 1 });
    river.addBinding(p, 'bridges');

    const plazas = f.addFolder({ title: 'Plazas', expanded: false });
    plazas.addBinding(p, 'plazas', { label: 'count', min: 0, max: 8, step: 1 });
    plazas.addBinding(p, 'plazaRadius', { label: 'radius', min: 2, max: 40, step: 0.5 });
    plazas.addBinding(p, 'plazaReach', { label: 'reach mm', min: 20, max: 400, step: 1 });
    plazas.addBinding(p, 'monuments');

    const parks = f.addFolder({ title: 'Parks', expanded: false });
    parks.addBinding(p, 'parks', { label: 'count', min: 0, max: 8, step: 1 });
    parks.addBinding(p, 'parkSize', { label: 'size mm', min: 10, max: 200, step: 1 });
    parks.addBinding(p, 'parkPaths', { label: 'paths', min: 0, max: 6, step: 1 });
    parks.addBinding(p, 'pathWidth', { label: 'path gap', min: 0.3, max: 5, step: 0.1 });

    const rail = f.addFolder({ title: 'Railway', expanded: false });
    rail.addBinding(p, 'railway', { label: 'enabled' });
    rail.addBinding(p, 'railAngle', { label: 'angle°', min: 0, max: 180, step: 1 });
    rail.addBinding(p, 'railOffset', { label: 'offset', min: -1, max: 1, step: 0.01 });
    rail.addBinding(p, 'railWidth', { label: 'gap', min: 1, max: 15, step: 0.1 });
  },

  generate(p, canvas) {
    const drawable = drawableRect(canvas);
    const shape = buildMask(p, drawable, p.seed);
    const city = layoutCity(p, drawable, p.minorWidth, shape);
    const out: Polyline[] = [];
    // Clipper region of the city shape, clipped to the canvas.
    const region: Paths64 = shape ? intersect(loopsToRegion(shape.outline), [rectPath(drawable)]) : [rectPath(drawable)];

    if (p.output !== 'blocks') {
      const lines: Polyline[] = city.roads.map((r) => r.pts);
      if (city.river) lines.push(...strokeLines([city.river], p.riverWidth).map(toPolyline));
      if (city.rail) lines.push(city.rail);
      lines.push(...city.parks, ...city.parkPaths);
      for (const pl of city.plazas) lines.push(toPolyline(circle(pl.x, pl.y, p.plazaRadius)));
      out.push(...(shape ? keepInside(lines, shape) : lines));
    }

    if (p.output !== 'streets') {
      const widths = [p.majorWidth, p.mainWidth, p.minorWidth];
      const cuts: Paths64[] = widths.map((w, cls) => strokeLines(city.roads.filter((r) => r.cls === cls).map((r) => r.pts), w));
      if (city.river) cuts.push(strokeLines([city.river], p.riverWidth));
      if (city.rail) cuts.push(strokeLines([city.rail], p.railWidth));
      // A street around each park makes it its own block; paths split it into lawns.
      cuts.push(strokeLoops(city.parks, p.minorWidth), strokeLines(city.parkPaths, p.pathWidth));
      cuts.push(city.plazas.map((pl) => circle(pl.x, pl.y, p.plazaRadius)));

      // Crisp edges cut blocks along the outline; the other styles pick whole blocks afterwards.
      const crisp = shape !== null && p.edgeStyle === 'crisp';
      let blocks = buildBlocks(crisp ? region : drawable, cuts, { cornerRadius: p.cornerRadius, minArea: p.minBlockArea });
      if (shape && !crisp) blocks = selectEdgeBlocks(blocks, p, shape.distance);

      // Clipper returns outer contours and holes with opposite winding; the largest is an outer.
      const outerSign = Math.sign(blocks.reduce((best, b) => (Math.abs(area(b)) > Math.abs(best) ? area(b) : best), 0));
      const random = mulberry32(p.seed + 5);
      for (const b of blocks) {
        out.push(toPolyline(b));
        if (Math.sign(area(b)) === outerSign && random() < p.innerChance) {
          out.push(...insetBlock(b, p.innerInset).map(toPolyline));
        }
      }

      if (p.monuments) {
        for (const pl of city.plazas) out.push(toPolyline(circle(pl.x, pl.y, p.plazaRadius * 0.35)));
      }
      if (city.river && p.bridges) {
        // Bridge decks: major roads where they cross the water, only where there's city around them.
        const majors = strokeLines(city.roads.filter((r) => r.cls === 0).map((r) => r.pts), p.majorWidth * 0.8);
        const water = strokeLines([city.river], p.riverWidth + p.cornerRadius);
        let bridges = intersect(intersect(majors, water), region);
        if (shape && p.edgeStyle !== 'crisp') {
          // Keep whole bridges only, and only where the city is still solid around them.
          const solid = p.edgeStyle === 'fade' ? p.fadeWidth / 2 : 0;
          bridges = bridges.filter((b) => b.every((pt) => shape.distance(pt.x / 1000, pt.y / 1000) >= solid));
        }
        out.push(...bridges.map(toPolyline));
      }
    }

    if (shape && p.maskOutline) {
      out.push(...intersect(grow(region, p.outlineGap), [rectPath(drawable)]).map(toPolyline));
    }
    return out;
  },
};

const centroid = (b: Path64): [number, number] => {
  let x = 0;
  let y = 0;
  for (const pt of b) {
    x += pt.x;
    y += pt.y;
  }
  return [x / b.length / 1000, y / b.length / 1000];
};

/**
 * Ragged: keep only blocks entirely inside the city shape.
 * Fade: across a band inside the edge, blocks thin out in noisy patches (so
 * the city dissolves in clumps rather than evenly) and shrink toward the edge.
 */
function selectEdgeBlocks(blocks: Paths64, p: CityParams, distance: (x: number, y: number) => number): Paths64 {
  if (p.edgeStyle === 'ragged') {
    return blocks.filter((b) => b.every((pt) => distance(pt.x / 1000, pt.y / 1000) >= -0.3));
  }
  const random = mulberry32(p.seed + 17);
  const patches = createFbm3D(p.seed + 41, 2);
  const out: Paths64 = [];
  // Blocks may poke a little past the edge, but not much: outside the shape no
  // streets are traced, so the land beyond is one huge leftover "block".
  const overhang = p.minorSpacing / 2;
  for (const b of blocks) {
    const [cx, cy] = centroid(b);
    const d = distance(cx, cy);
    if (d <= 0) continue;
    if (b.some((pt) => distance(pt.x / 1000, pt.y / 1000) < -overhang)) continue;
    const t = Math.min(1, d / Math.max(1, p.fadeWidth));
    const keep = t * t * (3 - 2 * t);
    if (keep < 1) {
      const patch = (patches(cx / (p.fadeWidth * 0.6), cy / (p.fadeWidth * 0.6), 0) + 1) / 2;
      if (keep < 0.55 * patch + 0.45 * random()) continue;
    }
    const shrink = p.fadeShrink * (1 - keep);
    if (shrink > 0.05) out.push(...insetBlock(b, shrink));
    else out.push(b);
  }
  return out;
}
