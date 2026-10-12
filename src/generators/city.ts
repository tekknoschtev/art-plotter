import type { Generator } from './types';
import type { Polyline } from '../types';
import { drawableRect } from '../types';
import { mulberry32 } from '../noise';
import { layoutCity, type CitySettings } from '../city/city';
import { area, buildBlocks, circle, insetBlock, intersect, rectPath, strokeLines, strokeLoops, toPolyline } from '../city/blocks';
import type { Paths64 } from 'clipper2-ts';

export interface CityParams extends CitySettings {
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
    const city = layoutCity(p, drawable, p.minorWidth);
    const out: Polyline[] = [];

    if (p.output !== 'blocks') {
      out.push(...city.roads.map((r) => r.pts));
      if (city.river) out.push(...strokeLines([city.river], p.riverWidth).map(toPolyline));
      if (city.rail) out.push(city.rail);
      out.push(...city.parks, ...city.parkPaths);
      for (const pl of city.plazas) out.push(toPolyline(circle(pl.x, pl.y, p.plazaRadius)));
    }

    if (p.output !== 'streets') {
      const widths = [p.majorWidth, p.mainWidth, p.minorWidth];
      const cuts: Paths64[] = widths.map((w, cls) => strokeLines(city.roads.filter((r) => r.cls === cls).map((r) => r.pts), w));
      if (city.river) cuts.push(strokeLines([city.river], p.riverWidth));
      if (city.rail) cuts.push(strokeLines([city.rail], p.railWidth));
      // A street around each park makes it its own block; paths split it into lawns.
      cuts.push(strokeLoops(city.parks, p.minorWidth), strokeLines(city.parkPaths, p.pathWidth));
      cuts.push(city.plazas.map((pl) => circle(pl.x, pl.y, p.plazaRadius)));

      const blocks = buildBlocks(drawable, cuts, { cornerRadius: p.cornerRadius, minArea: p.minBlockArea });
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
        // Bridge decks: major roads where they cross the water.
        const majors = strokeLines(city.roads.filter((r) => r.cls === 0).map((r) => r.pts), p.majorWidth * 0.8);
        const water = strokeLines([city.river], p.riverWidth + p.cornerRadius);
        out.push(...intersect(intersect(majors, water), [rectPath(drawable)]).map(toPolyline));
      }
    }
    return out;
  },
};

