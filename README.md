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

## Using images and elevation data

Contours and Ridgelines can use an image as their terrain: set **Terrain → source** to *Image*, then **Load image…**.
Brightness becomes height. The last image you loaded is kept in your browser; it isn't included in preset files.

- **Photos and grayscale heightmaps** work directly. 8-bit images can show stepped bands in the contours;
  raise **blur** to smooth them out.
- **16-bit grayscale PNGs** keep full precision, which is best for real elevation data. To convert a GeoTIFF DEM
  with GDAL: `gdal_translate -of PNG -ot UInt16 -scale dem.tif dem.png`
- **Terrarium tiles** (e.g. AWS Terrain Tiles, `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`)
  and **Mapbox/MapTiler Terrain-RGB** tiles store elevation in the colour channels. Choose the matching **encoding**.
- **Fit** picks how the image maps onto the artwork (for ridgelines, the top of the image is the back row).
  **Black/white point** adjusts contrast, **invert** flips height, and **noise mix** adds procedural texture.

## Code layout

- `src/generators/`: pattern generators, which output polylines in mm (origin bottom-left, Y up)
- `src/geometry/`: clipping, simplification, path ordering, contours, hidden-line removal
- `src/terrain/`: height fields from noise or images
- `src/pipeline.ts`: generator output → plot-ready paths
- `src/output/`: G-code and SVG writers
- `src/main.ts`: UI wiring (Tweakpane)
