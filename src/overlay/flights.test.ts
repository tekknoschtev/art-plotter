import { describe, expect, it } from 'vitest';
import { flightDefaults, generateFlights } from './flights';

const canvas = { width: 200, height: 150, margin: 10 };

describe('flight lines', () => {
  it('draws nothing when disabled and is deterministic when enabled', () => {
    expect(generateFlights(flightDefaults(), canvas)).toEqual([]);
    const s = { ...flightDefaults(), enabled: true };
    expect(generateFlights(s, canvas)).toEqual(generateFlights(s, canvas));
  });

  it('points chevrons along the direction of travel', () => {
    // One straight route with no markers: the first path is the route, the rest are chevrons.
    const s = { ...flightDefaults(), enabled: true, routes: 1, hubs: 0, curve: 0, offPage: 0, endpoint: 'none' as const };
    const [route, ...chevrons] = generateFlights(s, canvas);
    const a = route[0];
    const b = route[route.length - 1];
    const dir = [b[0] - a[0], b[1] - a[1]];
    expect(chevrons.length).toBeGreaterThan(2);
    for (const [left, tip, right] of chevrons) {
      // The tip sits ahead of the midpoint of the arms.
      const mid = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
      expect((tip[0] - mid[0]) * dir[0] + (tip[1] - mid[1]) * dir[1]).toBeGreaterThan(0);
    }
  });

  it('marks shared hubs only once', () => {
    const s = { ...flightDefaults(), enabled: true, routes: 20, hubs: 1, offPage: 0, endpoint: 'ring' as const };
    const rings = generateFlights(s, canvas).filter((p) => p.length === 21);
    const centres = new Set(rings.map((r) => r.map((q) => q.join()).sort().join('|')));
    expect(centres.size).toBe(rings.length);
  });
});
