import type { CanvasSettings, Polyline } from '../types';

export interface SvgLayer {
  /** Layer name (becomes the group id, e.g. for Inkscape layers). */
  name: string;
  paths: Polyline[];
  color?: string;
}

/** SVG at true size (mm), one group per layer. Y is flipped because SVG's origin is top-left. */
export function toSvg(layers: SvgLayer[], canvas: CanvasSettings, strokeWidth = 0.4): string {
  const { width: w, height: h } = canvas;
  const groups = layers
    .filter((l) => l.paths.length)
    .map((layer) => {
      const lines = layer.paths.map((p) => {
        const pts = p.map(([x, y]) => `${x.toFixed(2)},${(h - y).toFixed(2)}`).join(' ');
        return `  <polyline points="${pts}"/>`;
      });
      return [
        `<g id="${layer.name}" fill="none" stroke="${layer.color ?? '#000'}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
        ...lines,
        '</g>',
      ].join('\n');
    });
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`, ...groups, '</svg>', ''].join('\n');
}
