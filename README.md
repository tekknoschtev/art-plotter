# Art Plotter

A browser app that generates line art and exports **Marlin G-code** for a pen/brush plotter
(built for a Mostly Printed CNC with Z-axis pen lift). The intended workflow is to plot lines with a
pen, spread paint across them, then re-run the same path with a brush. See [PLAN.md](PLAN.md).

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build   # static site in dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.
In the repo, set **Settings → Pages → Source** to "GitHub Actions" once.

## Running a plot

1. Fix the substrate to the bed. A corner jig keeps the brush pass lined up.
2. Optional: run **Boundary check**, which traces the margins with the tool raised.
3. Jog the pen tip to just touch the artwork's bottom-left corner. Every file runs
   `G92 X0 Y0 Z0` there.
4. Run the **Pen** G-code.
5. Spread paint, swap to the brush, re-zero Z on the same corner without moving X/Y, and run the **Brush** G-code.

## Code layout

- `src/generators/`: pattern generators, which output polylines in mm (origin bottom-left, Y up)
- `src/geometry/`: clipping, simplification, path ordering
- `src/pipeline.ts`: generator output → plot-ready paths
- `src/output/`: G-code and SVG writers
- `src/main.ts`: UI wiring (Tweakpane)
