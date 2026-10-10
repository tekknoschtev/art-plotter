import { describe, expect, it } from 'vitest';
import { toGcode, type ToolProfile } from './gcode';

const profile: ToolProfile = {
  drawZ: -0.5,
  travelZ: 4,
  drawFeed: 1500,
  travelFeed: 3000,
  zFeed: 300,
  dwellMs: 0,
  reverse: false,
};

const code = (lines: string) => lines.split('\n').filter((l) => l && !l.startsWith(';'));

describe('toGcode', () => {
  it('emits setup, lift/lower around each path, and returns home', () => {
    const lines = code(toGcode([[[10, 10], [20, 10], [20, 20]]], { profile, label: 'Pen', startGcode: '', endGcode: '' }));
    expect(lines.slice(0, 3).map((l) => l.split(' ')[0])).toEqual(['G21', 'G90', 'G92']);
    expect(lines).toContain('G0 X10 Y10 F3000');
    expect(lines).toContain('G1 Z-0.5 F300');
    expect(lines).toContain('G1 X20 Y10 F1500');
    expect(lines).toContain('G1 X20 Y20');
    expect(lines.at(-1)).toMatch(/^M400/);
    // Never moves XY while the tool is down except via drawing moves.
    let down = false;
    for (const l of lines) {
      if (/^G1 Z-/.test(l)) down = true;
      else if (/^G1 Z\d/.test(l)) down = false;
      if (down) expect(l.startsWith('G0')).toBe(false);
    }
  });

  it('reverses order and direction for a reversed profile', () => {
    const gcode = toGcode(
      [
        [[0, 0], [1, 0]],
        [[5, 5], [6, 5]],
      ],
      { profile: { ...profile, reverse: true }, label: 'Brush', startGcode: '', endGcode: '' },
    );
    const firstTravel = code(gcode).find((l) => l.startsWith('G0 X'));
    expect(firstTravel).toBe('G0 X6 Y5 F3000');
  });

  it('adds dwell after lowering when configured', () => {
    const gcode = toGcode([[[0, 0], [1, 1]]], { profile: { ...profile, dwellMs: 200 }, label: 'Brush', startGcode: '', endGcode: '' });
    expect(gcode).toContain('G4 P200');
  });
});
