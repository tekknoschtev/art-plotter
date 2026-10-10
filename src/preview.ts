import type { CanvasSettings, Polyline } from './types';
import { drawableRect } from './types';

export interface PreviewOptions {
  showTravel: boolean;
}

/** Draws the artwork to fit inside the canvas element, with the paper shown at true proportions. */
export function renderPreview(el: HTMLCanvasElement, paths: Polyline[], canvas: CanvasSettings, opts: PreviewOptions): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = el.clientWidth;
  const cssH = el.clientHeight;
  if (el.width !== Math.round(cssW * dpr) || el.height !== Math.round(cssH * dpr)) {
    el.width = Math.round(cssW * dpr);
    el.height = Math.round(cssH * dpr);
  }
  const ctx = el.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, el.width, el.height);

  const pad = 24;
  const scale = Math.min((cssW - pad * 2) / canvas.width, (cssH - pad * 2) / canvas.height);
  if (!(scale > 0)) return;
  const offX = (cssW - canvas.width * scale) / 2;
  const offY = (cssH - canvas.height * scale) / 2;
  // mm (Y up) → CSS pixels (Y down), then scaled for device pixels.
  ctx.setTransform(dpr * scale, 0, 0, -dpr * scale, dpr * offX, dpr * (offY + canvas.height * scale));
  const px = 1 / scale; // one CSS pixel, in mm

  ctx.fillStyle = '#fbf8f1';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 16 * dpr;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.shadowBlur = 0;

  const r = drawableRect(canvas);
  ctx.setLineDash([4 * px, 4 * px]);
  ctx.strokeStyle = 'rgba(40, 90, 200, 0.35)';
  ctx.lineWidth = px;
  ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  ctx.setLineDash([]);

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1b1b1f';
  ctx.lineWidth = Math.max(0.4, px * 0.8);
  ctx.beginPath();
  for (const p of paths) {
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
  }
  ctx.stroke();

  if (opts.showTravel) {
    ctx.strokeStyle = 'rgba(220, 50, 50, 0.6)';
    ctx.lineWidth = px;
    ctx.setLineDash([3 * px, 3 * px]);
    ctx.beginPath();
    let pos: [number, number] = [0, 0];
    for (const p of paths) {
      ctx.moveTo(pos[0], pos[1]);
      ctx.lineTo(p[0][0], p[0][1]);
      pos = p[p.length - 1];
    }
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Origin marker: where the tool tip is zeroed.
  ctx.fillStyle = '#e0457b';
  ctx.beginPath();
  ctx.arc(0, 0, 4 * px, 0, Math.PI * 2);
  ctx.fill();
}
