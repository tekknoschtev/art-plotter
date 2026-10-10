import type { CanvasSettings, Polyline } from '../types';

/** SVG at true size (mm). Y is flipped because SVG's origin is top-left. */
export function toSvg(paths: Polyline[], canvas: CanvasSettings, strokeWidth = 0.4): string {
  const { width: w, height: h } = canvas;
  const lines = paths.map((p) => {
    const pts = p.map(([x, y]) => `${x.toFixed(2)},${(h - y).toFixed(2)}`).join(' ');
    return `  <polyline points="${pts}"/>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    `<g fill="none" stroke="#000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
    ...lines,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
