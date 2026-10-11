import type { CanvasSettings } from './types';
import type { ToolProfile } from './output/gcode';
import type { ProcessSettings } from './pipeline';
import { generators } from './generators';

export interface AppState {
  version: 1;
  canvas: CanvasSettings;
  /** Machine working area, mm. Used only to warn when the artwork won't fit. */
  bed: { width: number; height: number };
  generatorId: string;
  /** Parameters for each generator, keyed by generator id. */
  params: Record<string, Record<string, unknown>>;
  process: ProcessSettings;
  pen: ToolProfile;
  brush: ToolProfile;
  startGcode: string;
  endGcode: string;
  showTravel: boolean;
}

const STORAGE_KEY = 'art-plotter-state-v1';

export function defaultState(): AppState {
  return {
    version: 1,
    canvas: { width: 457.2, height: 609.6, margin: 20 },
    bed: { width: 609.6, height: 1219.2 },
    generatorId: generators[0].id,
    params: Object.fromEntries(generators.map((g) => [g.id, g.defaults()])),
    process: { simplify: 0.1, minLength: 0.5, staggerSeams: true },
    pen: { drawZ: -0.5, travelZ: 4, drawFeed: 1800, travelFeed: 3000, zFeed: 300, dwellMs: 0, reverse: false },
    brush: { drawZ: -1.5, travelZ: 8, drawFeed: 1200, travelFeed: 3000, zFeed: 300, dwellMs: 150, reverse: false },
    startGcode: '',
    endGcode: '',
    showTravel: false,
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Overlays `saved` onto `defaults`, keeping only keys that exist in defaults with matching types. */
function merge<T>(defaults: T, saved: unknown): T {
  if (!isObject(defaults) || !isObject(saved)) {
    return saved !== undefined && typeof saved === typeof defaults ? (saved as T) : defaults;
  }
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in saved) out[key] = merge((defaults as Record<string, unknown>)[key], saved[key]);
  }
  return out as T;
}

export function parseState(raw: unknown): AppState {
  return merge(defaultState(), raw);
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseState(JSON.parse(raw));
  } catch {
    // Storage blocked or corrupt — fall back to defaults.
  }
  return defaultState();
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: persistence is a convenience only.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
