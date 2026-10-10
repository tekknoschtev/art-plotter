# Art Plotter — Plan

A static web app (GitHub Pages) that generates line art and exports Marlin
G-code for an MPCNC used as a pen/brush plotter.

## Workflow this supports

1. Fix the substrate (paper, canvas or panel) to the bed. Use a corner jig so it
   can't shift.
2. Jog the **pen** tip until it just touches the artwork's **bottom-left corner**.
   That point is X0 Y0 Z0, and every file runs `G92 X0 Y0 Z0`.
3. Run the **pen pass**.
4. Spread paint across the lines by hand.
5. Swap in the **brush**, re-zero on the same corner (X/Y must not move), and
   run the **brush pass**. It follows the same path with different Z and feed settings.

Zeroing is manual because there is no Z endstop or probe.

## Architecture

- Vite and TypeScript with no framework. Tweakpane for parameter panels, and a canvas preview.
- Deployed to GitHub Pages by a GitHub Action (`.github/workflows/deploy.yml`).
- Pattern generators output **polylines in mm** (origin at the bottom-left, Y up).
  They know nothing about G-code.

```
Generator → polylines (mm)
  → clip to margins → simplify → drop tiny paths → order (cut travel)
  → preview · SVG · G-code (Pen profile / Brush profile)
```

### G-code (Marlin)
- `G21`, `G90`, `G92 X0 Y0 Z0`, then `G0`/`G1` only. Curves become line segments, no arcs.
- Each tool profile has its own draw Z, travel Z, drawing feed, travel feed, a separate (slow) Z feed,
  dwell after lowering, and a reverse-direction option.
- Editable start and end G-code.
- Stats: drawn length, travel length, pen lifts, and estimated time.
- A "boundary check" file traces the margin rectangle at travel height, so you can
  confirm placement without drawing.
- **Paint-dip hook (later):** the code that writes G-code tracks distance drawn, so it can
  insert "go to the paint well and dip" moves every N mm.

## Phases

1. **Foundation and concentric rings.** Project setup, Pages deploy, preview, post-processing
   pipeline, Marlin export with pen and brush profiles, presets (JSON + localStorage), seeded randomness.
   Generator: noisy concentric rings with a minimum gap, so lines bunch up but never cross.
   → *Run a small test plot on paper.*
2. **Topographic contours.** A noise heightfield (octaves, ridging) traced into contour lines with
   marching squares, with the segments joined into continuous lines.
3. **Ridgelines.** Stacked lines displaced by height, with hidden-line removal and
   perspective/tilt.
4. **Image/heightmap input.** Upload a grayscale image or elevation PNG and use it as the
   terrain for phases 2 and 3.
5. **Later.** Paint-well dipping, multiple layers or colours, combining patterns (masks),
   inch units, and possibly sending G-code to the machine from the browser over USB (Web Serial).

## Notes
- Marlin stutters on thousands of tiny moves, especially over USB. Simplify to about 0.1–0.2 mm
  and print from the SD card where possible.
- The MPCNC Z axis is slow, so keep Z moves on their own feed rate.
- Substrates vary (paper, canvas, wood), so draw Z and pressure stay adjustable per profile.
