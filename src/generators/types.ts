import type { FolderApi } from 'tweakpane';
import type { CanvasSettings, Polyline } from '../types';

/**
 * A pattern generator. Produces polylines in artwork coordinates (mm, origin
 * bottom-left, Y up). It does not need to clip to the margins; the pipeline does that.
 */
export interface Generator<P extends object = any> {
  id: string;
  name: string;
  defaults(): P;
  /** Adds this generator's controls to a Tweakpane folder, bound to `params`. */
  bindUI(folder: FolderApi, params: P): void;
  generate(params: P, canvas: CanvasSettings): Polyline[];
}
