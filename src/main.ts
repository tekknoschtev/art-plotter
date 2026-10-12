import { Pane, type FolderApi } from 'tweakpane';
import './style.css';
import { generators, getGenerator } from './generators';
import { processPaths } from './pipeline';
import { renderPreview } from './preview';
import { boundaryGcode, estimate, formatDuration, toGcode, type ToolProfile } from './output/gcode';
import { toSvg } from './output/svg';
import { clearState, defaultState, loadState, parseState, saveState } from './state';
import { drawableRect, type Polyline } from './types';
import { randomSeed } from './noise';
import { terrainMissingImage, type TerrainParams } from './terrain/terrain';
import { onImageChange, restoreImage } from './terrain/imageSource';

const MM_PER_IN = 25.4;
const SIZE_PRESETS: Record<string, [number, number]> = {
  'Letter (8.5×11 in)': [8.5 * MM_PER_IN, 11 * MM_PER_IN],
  'A4': [210, 297],
  'A3': [297, 420],
  '11×14 in': [11 * MM_PER_IN, 14 * MM_PER_IN],
  '16×20 in': [16 * MM_PER_IN, 20 * MM_PER_IN],
  '18×24 in': [18 * MM_PER_IN, 24 * MM_PER_IN],
  '24×36 in': [24 * MM_PER_IN, 36 * MM_PER_IN],
  'Full bed (24×48 in)': [24 * MM_PER_IN, 48 * MM_PER_IN],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = loadState();
let paths: Polyline[] = [];

// ---------- Controls ----------

const pane = new Pane({ container: $('controls') });

const canvasFolder = pane.addFolder({ title: 'Canvas (mm)' });
const sizeChoice = { preset: '' };
canvasFolder
  .addBinding(sizeChoice, 'preset', {
    label: 'size',
    options: { 'Custom': '', ...Object.fromEntries(Object.keys(SIZE_PRESETS).map((k) => [k, k])) },
  })
  .on('change', (ev) => {
    const size = SIZE_PRESETS[ev.value];
    if (!size) return;
    [state.canvas.width, state.canvas.height] = size.map((n) => Math.round(n * 10) / 10);
    pane.refresh();
  });
canvasFolder.addBinding(state.canvas, 'width', { min: 10, max: 2000, step: 0.1 });
canvasFolder.addBinding(state.canvas, 'height', { min: 10, max: 2000, step: 0.1 });
canvasFolder.addBinding(state.canvas, 'margin', { min: 0, max: 200, step: 0.5 });
canvasFolder.addButton({ title: 'Swap orientation' }).on('click', () => {
  [state.canvas.width, state.canvas.height] = [state.canvas.height, state.canvas.width];
  pane.refresh();
});

const patternFolder = pane.addFolder({ title: 'Pattern' });
patternFolder
  .addBinding(state, 'generatorId', {
    label: 'type',
    options: Object.fromEntries(generators.map((g) => [g.name, g.id])),
  })
  .on('change', () => buildGeneratorUI());
patternFolder.addButton({ title: 'Random seed' }).on('click', () => {
  const holder = seedHolder(currentParams());
  if (holder) {
    holder.seed = randomSeed();
    pane.refresh();
  }
});
let generatorFolder: FolderApi | null = null;

/** The params object holding `seed`: top level, or one level down (e.g. `terrain.seed`). */
function seedHolder(params: Record<string, unknown>): { seed: number } | null {
  if (typeof params.seed === 'number') return params as { seed: number };
  for (const v of Object.values(params)) {
    if (v && typeof v === 'object' && typeof (v as { seed?: unknown }).seed === 'number') return v as { seed: number };
  }
  return null;
}

function currentParams(): Record<string, unknown> {
  const gen = getGenerator(state.generatorId);
  state.params[gen.id] ??= gen.defaults();
  return state.params[gen.id];
}

function buildGeneratorUI() {
  generatorFolder?.dispose();
  const gen = getGenerator(state.generatorId);
  generatorFolder = patternFolder.addFolder({ title: gen.name });
  for (const [name, make] of Object.entries(gen.presets ?? {})) {
    generatorFolder.addButton({ title: name, label: 'style' }).on('click', () => {
      // Keep the current seed (and image source) so a style change reshapes the same terrain.
      const prev = currentParams();
      const seed = seedHolder(prev)?.seed;
      const next = make() as Record<string, unknown>;
      const holder = seedHolder(next);
      if (holder && seed !== undefined) holder.seed = seed;
      const prevTerrain = prev.terrain as TerrainParams | undefined;
      const nextTerrain = next.terrain as TerrainParams | undefined;
      if (prevTerrain && nextTerrain) {
        nextTerrain.source = prevTerrain.source;
        nextTerrain.image = { ...prevTerrain.image };
      }
      state.params[gen.id] = next;
      buildGeneratorUI();
      scheduleUpdate();
    });
  }
  gen.bindUI(generatorFolder, currentParams());
  generatorFolder.addButton({ title: 'Reset pattern' }).on('click', () => {
    state.params[gen.id] = gen.defaults();
    buildGeneratorUI();
    scheduleUpdate();
  });
}
buildGeneratorUI();

const processFolder = pane.addFolder({ title: 'Processing', expanded: false });
processFolder.addBinding(state.process, 'simplify', { label: 'simplify mm', min: 0, max: 2, step: 0.01 });
processFolder.addBinding(state.process, 'minLength', { label: 'min length mm', min: 0, max: 20, step: 0.1 });
processFolder.addBinding(state.process, 'staggerSeams', { label: 'stagger seams' });
processFolder.addBinding(state, 'showTravel', { label: 'show travel' });

function bindProfile(title: string, profile: ToolProfile) {
  const f = pane.addFolder({ title, expanded: false });
  f.addBinding(profile, 'drawZ', { label: 'draw Z', min: -10, max: 5, step: 0.05 });
  f.addBinding(profile, 'travelZ', { label: 'travel Z', min: 0, max: 50, step: 0.5 });
  f.addBinding(profile, 'drawFeed', { label: 'draw mm/min', min: 50, max: 10000, step: 10 });
  f.addBinding(profile, 'travelFeed', { label: 'travel mm/min', min: 50, max: 10000, step: 10 });
  f.addBinding(profile, 'zFeed', { label: 'Z mm/min', min: 10, max: 3000, step: 10 });
  f.addBinding(profile, 'dwellMs', { label: 'dwell ms', min: 0, max: 5000, step: 10 });
  f.addBinding(profile, 'reverse', { label: 'reverse path' });
}
bindProfile('Pen pass', state.pen);
bindProfile('Brush pass', state.brush);

const machineFolder = pane.addFolder({ title: 'Machine', expanded: false });
machineFolder.addBinding(state.bed, 'width', { label: 'bed X mm', min: 50, max: 3000, step: 1 });
machineFolder.addBinding(state.bed, 'height', { label: 'bed Y mm', min: 50, max: 3000, step: 1 });

pane.on('change', () => scheduleUpdate());

// Custom G-code
const startArea = $<HTMLTextAreaElement>('start-gcode');
const endArea = $<HTMLTextAreaElement>('end-gcode');
startArea.value = state.startGcode;
endArea.value = state.endGcode;
startArea.addEventListener('input', () => {
  state.startGcode = startArea.value;
  saveState(state);
});
endArea.addEventListener('input', () => {
  state.endGcode = endArea.value;
  saveState(state);
});

// ---------- Update loop ----------

const previewEl = $<HTMLCanvasElement>('preview');
let pending = false;

function scheduleUpdate() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    update();
  });
}

function update() {
  const gen = getGenerator(state.generatorId);
  const t0 = performance.now();
  paths = processPaths(gen.generate(currentParams(), state.canvas), state.canvas, state.process);
  const ms = performance.now() - t0;
  draw();
  updateStats(ms);
  saveState(state);
}

function draw() {
  renderPreview(previewEl, paths, state.canvas, { showTravel: state.showTravel });
}

function updateStats(ms: number) {
  const pen = estimate(paths, state.pen);
  const brush = estimate(paths, state.brush);
  const points = paths.reduce((n, p) => n + p.length, 0);
  $('stats').innerHTML = [
    `<span><b>${pen.paths}</b> paths</span>`,
    `<span><b>${points.toLocaleString()}</b> points</span>`,
    `<span>draw <b>${(pen.drawLength / 1000).toFixed(1)} m</b></span>`,
    `<span>travel <b>${(pen.travelLength / 1000).toFixed(1)} m</b></span>`,
    `<span>pen ≈ <b>${formatDuration(pen.seconds)}</b></span>`,
    `<span>brush ≈ <b>${formatDuration(brush.seconds)}</b></span>`,
    `<span class="muted">${ms.toFixed(0)} ms</span>`,
  ].join('');

  const warnings: string[] = [];
  const { canvas, bed } = state;
  if (canvas.width > bed.width || canvas.height > bed.height) {
    const rotatedFits = canvas.height <= bed.width && canvas.width <= bed.height;
    warnings.push(
      `Artwork (${canvas.width}×${canvas.height} mm) is larger than the bed (${bed.width}×${bed.height} mm)` +
        (rotatedFits ? ' — it would fit rotated (use “Swap orientation”).' : '.'),
    );
  }
  if (points > 200_000) warnings.push('Very high point count — raise “simplify” or “sample mm” for smoother Marlin motion.');
  if (state.pen.drawZ >= 0) warnings.push('Pen draw Z is ≥ 0; the pen may not touch the surface.');
  const terrain = currentParams().terrain as TerrainParams | undefined;
  if (terrain && terrainMissingImage(terrain)) warnings.push('Terrain source is Image — use “Load image…” in the Terrain → Image panel.');
  $('warnings').innerHTML = warnings.map((w) => `<div>${w}</div>`).join('');
}

new ResizeObserver(() => draw()).observe(previewEl);

// ---------- Export ----------

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function baseName(): string {
  const seed = seedHolder(currentParams())?.seed;
  return `${state.generatorId}${seed !== undefined ? `-${seed}` : ''}`;
}

function exportGcode(label: 'Pen' | 'Brush', profile: ToolProfile) {
  const gen = getGenerator(state.generatorId);
  const gcode = toGcode(paths, {
    profile,
    label,
    startGcode: state.startGcode,
    endGcode: state.endGcode,
    comments: [
      `Pattern: ${gen.name}`,
      `Artwork: ${state.canvas.width} x ${state.canvas.height} mm, margin ${state.canvas.margin} mm`,
      `Params: ${JSON.stringify(currentParams())}`,
    ],
  });
  download(`${baseName()}-${label.toLowerCase()}.gcode`, gcode, 'text/plain');
}

$('export-pen').addEventListener('click', () => exportGcode('Pen', state.pen));
$('export-brush').addEventListener('click', () => exportGcode('Brush', state.brush));
$('export-svg').addEventListener('click', () => download(`${baseName()}.svg`, toSvg(paths, state.canvas), 'image/svg+xml'));
$('export-boundary').addEventListener('click', () =>
  download('boundary-check.gcode', boundaryGcode(drawableRect(state.canvas), state.pen), 'text/plain'),
);

$('save-preset').addEventListener('click', () =>
  download(`${baseName()}-preset.json`, JSON.stringify(state, null, 2), 'application/json'),
);
const presetInput = $<HTMLInputElement>('preset-file');
$('load-preset').addEventListener('click', () => presetInput.click());
presetInput.addEventListener('change', async () => {
  const file = presetInput.files?.[0];
  if (!file) return;
  try {
    saveState(parseState(JSON.parse(await file.text())));
    location.reload();
  } catch (err) {
    alert(`Could not load preset: ${(err as Error).message}`);
  }
});
$('reset-all').addEventListener('click', () => {
  if (!confirm('Reset all settings to defaults?')) return;
  clearState();
  saveState(defaultState());
  location.reload();
});

onImageChange(() => scheduleUpdate());
update();
void restoreImage();
