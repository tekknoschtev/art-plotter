/** A 2D point in millimetres. Origin is the artwork's bottom-left corner, Y up. */
export type Point = [number, number];

/** An open or closed (first point === last point) sequence of points. */
export type Polyline = Point[];

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CanvasSettings {
  /** Artwork width in mm. */
  width: number;
  /** Artwork height in mm. */
  height: number;
  /** Blank border inside the artwork, in mm. Lines are clipped to it. */
  margin: number;
}

export function drawableRect(c: CanvasSettings): Rect {
  return { x0: c.margin, y0: c.margin, x1: c.width - c.margin, y1: c.height - c.margin };
}
