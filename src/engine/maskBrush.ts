import type { BrushStroke } from './masks';

/*
 * Brush parts on a raster (rw × rh coverage, 0–1): each stroke's shape is the brush swept along its points, with a
 * feathered edge; a pass adds (m + c(1 − m)) or, erasing, takes away (m(1 − c)). A part being painted is drawn
 * incrementally: only the newest stroke's new points are painted on what was there.
 */

/** A pixel rectangle, inclusive: [x0, y0, x1, y1]; x0 > x1 when empty. */
type PixelBox = [number, number, number, number];

/** The empty rectangle. */
const EMPTY: PixelBox = [Infinity, Infinity, -Infinity, -Infinity];

/**
 * The smallest rectangle holding two.
 * @param first a rectangle
 * @param second another
 * @returns their union
 */
const union = (first: PixelBox, second: PixelBox): PixelBox => [
  Math.min(first[0], second[0]),
  Math.min(first[1], second[1]),
  Math.max(first[2], second[2]),
  Math.max(first[3], second[3]),
];

/**
 * A stroke's shape on one raster, built as it is drawn: the brush swept along its points. Points are thinned to at
 * most one per fifth of the radius (the shape is the same, the work far less); which points are kept depends only on
 * the points before, so a longer stroke keeps the same ones and only the new part is painted. The segment from the
 * last kept point to the newest point (the tail) is drawn separately, as it changes with every move.
 */
export interface StrokeShape {
  stroke: BrushStroke;
  /** The brush's radius, raster pixels. */
  radius: number;
  /** The feathered edge's width, raster pixels. */
  edge: number;
  /** The least distance between kept points, raster pixels. */
  gap: number;
  /** Kept points, raster pixels. */
  kept: number[];
  /** Raw numbers (x and y) of stroke.pts consumed so far. */
  used: number;
  /** Coverage of the kept segments, 0–1, rw × rh; nonzero only inside box. */
  cov: Float32Array;
  box: PixelBox;
}

/** A coverage drawn apart from a shape (its tail), with where it is nonzero. */
interface Coverage {
  cov: Float32Array;
  box: PixelBox;
}

/** A segment of a stroke, raster pixels: from (ax, ay) to (bx, by); reused while a stroke is painted. */
interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/** A raster's size, pixels. */
interface RasterSize {
  width: number;
  height: number;
}

/**
 * Paints the coverage of the segment a → b (a disk when they are the same point) into a buffer, keeping the larger of
 * what is there and the new coverage.
 * @param cov the coverage buffer, width × height
 * @param size the raster's size
 * @param segment the segment's start (ax, ay) and end (bx, by), raster pixels
 * @param brush the brush's radius and feathered edge, raster pixels
 * @returns the rectangle painted
 */
function sweep(cov: Float32Array, size: RasterSize, segment: Segment, brush: Pick<StrokeShape, 'radius' | 'edge'>): PixelBox {
  const { width } = size;
  const { ax, ay, bx, by } = segment;
  const { radius, edge } = brush;
  const bounds = segmentBounds(size, segment, radius);
  if (!bounds) return EMPTY;
  const [x0, y0, x1, y1] = bounds;
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const radius2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Distance from the pixel's centre to the segment.
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      const along = length2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / length2)) : 0;
      const qx = px - along * dx;
      const qy = py - along * dy;
      const distance2 = qx * qx + qy * qy;
      if (distance2 >= radius2) continue;
      const coverage = featheredCoverage(Math.sqrt(distance2), radius, edge);
      const index = y * width + x;
      if (coverage > (cov[index] ?? 0)) cov[index] = coverage;
    }
  }
  return bounds;
}

/**
 * A brush's coverage at a distance from its centre line: full inside, easing to 0 across the feathered edge.
 * @param distance pixels from the segment
 * @param radius the brush's radius, pixels
 * @param edge the feathered edge's width, pixels
 * @returns 0–1
 */
function featheredCoverage(distance: number, radius: number, edge: number): number {
  const linear = (radius - distance) / edge;
  return linear >= 1 ? 1 : linear * linear * (3 - 2 * linear);
}

/**
 * The pixels a segment's brush can reach, within the raster.
 * @param size the raster's size
 * @param segment the segment, raster pixels
 * @param radius the brush's radius, raster pixels
 * @returns the rectangle, or null when it is off the raster
 */
function segmentBounds(size: RasterSize, segment: Segment, radius: number): PixelBox | null {
  const { ax, ay, bx, by } = segment;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
  const x1 = Math.min(size.width - 1, Math.ceil(Math.max(ax, bx) + radius));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius));
  const y1 = Math.min(size.height - 1, Math.ceil(Math.max(ay, by) + radius));
  return x0 > x1 || y0 > y1 ? null : [x0, y0, x1, y1];
}

/**
 * A stroke's empty shape on a raster.
 * @param stroke the stroke
 * @param width the raster's width, pixels
 * @param height the raster's height, pixels
 * @returns the shape, nothing painted yet
 */
function newShape(stroke: BrushStroke, width: number, height: number): StrokeShape {
  const radius = Math.max(0.5, (stroke.size * width) / 2);
  return {
    stroke,
    radius,
    edge: Math.max(1, (radius * stroke.feather) / 100),
    gap: Math.max(0.5, radius * 0.2),
    kept: [],
    used: 0,
    cov: new Float32Array(width * height),
    box: EMPTY,
  };
}

/**
 * Takes in the stroke's points not yet used, painting a segment for each point kept.
 * @param shape the shape, extended in place
 * @param stroke the stroke (the shape's, or the same drawn further)
 * @param width the raster's width, pixels
 * @param height the raster's height, pixels
 */
function extendShape(shape: StrokeShape, stroke: BrushStroke, width: number, height: number): void {
  shape.stroke = stroke;
  const kept = shape.kept;
  const size = { width, height };
  const segment: Segment = { ax: 0, ay: 0, bx: 0, by: 0 };
  const points = stroke.pts;
  for (let index = shape.used; index + 1 < points.length; index += 2) {
    const x = (points[index] ?? 0) * width;
    const y = (points[index + 1] ?? 0) * height;
    const lastX = kept.at(-2);
    const lastY = kept.at(-1);
    if (lastX !== undefined && lastY !== undefined && Math.hypot(x - lastX, y - lastY) < shape.gap) continue;
    [segment.ax, segment.ay, segment.bx, segment.by] = [lastX ?? x, lastY ?? y, x, y];
    kept.push(x, y);
    shape.box = union(shape.box, sweep(shape.cov, size, segment, shape));
  }
  shape.used = points.length;
}

/** One reusable tail buffer per raster size (a tail is drawn and used straight away). */
const tailBuffers = new Map<number, Float32Array>();

/**
 * The reusable tail buffer for a raster size.
 * @param length the raster's pixel count
 * @returns the buffer (its contents are whatever the last tail left)
 */
function tailBuffer(length: number): Float32Array {
  let buffer = tailBuffers.get(length);
  if (!buffer) {
    if (tailBuffers.size > 4) tailBuffers.clear();
    buffer = new Float32Array(length);
    tailBuffers.set(length, buffer);
  }
  return buffer;
}

/**
 * The tail: the last kept point to the newest point, when that point wasn't kept.
 * @param shape the shape
 * @param width the raster's width, pixels
 * @param height the raster's height, pixels
 * @returns the tail's coverage, or null when there is none
 */
function tail(shape: StrokeShape, width: number, height: number): Coverage | null {
  const points = shape.stroke.pts;
  const lastX = shape.kept.at(-2);
  const lastY = shape.kept.at(-1);
  const x = (points.at(-2) ?? 0) * width;
  const y = (points.at(-1) ?? 0) * height;
  if (lastX === undefined || lastY === undefined || (lastX === x && lastY === y)) return null;
  const cov = tailBuffer(width * height);
  cov.fill(0);
  return { cov, box: sweep(cov, { width, height }, { ax: lastX, ay: lastY, bx: x, by: y }, shape) };
}

/**
 * A mask value after one pass of a brush.
 * @param under the value before
 * @param coverage the pass's coverage there, flow included
 * @param erase whether the brush erases
 * @returns the value after
 */
const afterPass = (under: number, coverage: number, erase: boolean): number => (erase ? under * (1 - coverage) : under + coverage * (1 - under));

/**
 * One pass of the stroke onto the mask: m = base + c(1 − base) where it paints, base(1 − c) where it erases, with c its
 * coverage times its flow. Only the stroke's box is touched; m and base may be the same array.
 * @param mask the mask written
 * @param base the mask before the pass
 * @param width the raster's width, pixels
 * @param shape the stroke's shape
 * @param tailCoverage its tail, if any
 */
function applyShape(mask: Float32Array, base: Float32Array, width: number, shape: StrokeShape, tailCoverage: Coverage | null): void {
  const box = tailCoverage ? union(shape.box, tailCoverage.box) : shape.box;
  const flow = shape.stroke.flow / 100;
  const erase = shape.stroke.erase;
  const tailCov = tailCoverage?.cov;
  for (let y = box[1]; y <= box[3]; y++) {
    for (let x = box[0]; x <= box[2]; x++) {
      const index = y * width + x;
      const own = shape.cov[index] ?? 0;
      const fromTail = tailCov ? (tailCov[index] ?? 0) : 0;
      const coverage = (fromTail > own ? fromTail : own) * flow;
      if (!coverage) continue;
      mask[index] = afterPass(base[index] ?? 0, coverage, erase);
    }
  }
}

/**
 * Paints one stroke into a mask. One pass is one pass: where a stroke crosses itself it doesn't build up.
 * @param mask the coverage, width × height, 0–1, painted in place
 * @param width the raster's width, pixels
 * @param height the raster's height, pixels
 * @param stroke the stroke
 */
export function paintStroke(mask: Float32Array, width: number, height: number, stroke: BrushStroke): void {
  const shape = newShape(stroke, width, height);
  extendShape(shape, stroke, width, height);
  applyShape(mask, mask, width, shape, tail(shape, width, height));
}

/**
 * Whether a stroke is another drawn further: the same brush, and the other's points followed by more.
 * @param earlier the stroke as it was
 * @param later the stroke now
 * @returns true when `later` continues `earlier`
 */
function continues(earlier: BrushStroke, later: BrushStroke): boolean {
  if (
    earlier.size !== later.size ||
    earlier.feather !== later.feather ||
    earlier.flow !== later.flow ||
    earlier.erase !== later.erase ||
    later.pts.length < earlier.pts.length
  ) {
    return false;
  }
  return earlier.pts.every((value, index) => value === later.pts[index]);
}

/** A brush part's raster at one size, with what painting it further needs. */
export interface BrushRaster {
  strokes: BrushStroke[];
  /** After every stroke but the last (null when unknown). */
  upto: Float32Array | null;
  full: Float32Array;
  /** The last stroke's shape, kept so that the same stroke drawn further paints only its new part. */
  live: StrokeShape | null;
}

/**
 * How many strokes from the start two lists share (the same stroke objects).
 * @param previous the strokes drawn before
 * @param strokes the strokes now
 * @returns the count
 */
function sharedStart(previous: readonly BrushStroke[], strokes: readonly BrushStroke[]): number {
  let same = 0;
  while (same < strokes.length && same < previous.length && strokes[same] === previous[same]) same++;
  return same;
}

/**
 * The stroke being drawn, drawn further: its new points added to its shape, laid on the raster before it.
 * @param previous the part's last raster
 * @param strokes the part's strokes now
 * @param width the raster's width, pixels
 * @param height the raster's height, pixels
 * @returns the new raster, or null when the strokes aren't the last one drawn further
 */
function continueStroke(previous: BrushRaster, strokes: BrushStroke[], width: number, height: number): BrushRaster | null {
  const known = previous.strokes.length;
  const lastBefore = previous.strokes.at(-1);
  const lastNow = strokes.at(-1);
  const { upto, live } = previous;
  if (!lastBefore || !lastNow || !upto || !live || strokes.length !== known) return null;
  if (sharedStart(previous.strokes, strokes) !== known - 1 || !continues(lastBefore, lastNow)) return null;
  previous.live = null;
  extendShape(live, lastNow, width, height);
  const full = upto.slice();
  applyShape(full, upto, width, live, tail(live, width, height));
  return { strokes, upto, full, live };
}

/** Where repainting starts: the stroke to paint first, the raster to paint on, and the raster it continues. */
interface StartingPoint {
  /** The previous raster, when the strokes only add to it. */
  reuse: BrushRaster | null;
  start: number;
  base: Float32Array | null;
}

/**
 * Where repainting starts: after the previous raster's strokes when the strokes only add to them; before its last
 * stroke when only that one changed; else from nothing.
 * @param previous the part's last raster at this size, if any
 * @param strokes the part's strokes now
 * @returns the starting point
 */
function startingPoint(previous: BrushRaster | undefined, strokes: BrushStroke[]): StartingPoint {
  if (!previous) return { reuse: null, start: 0, base: null };
  const known = previous.strokes.length;
  const same = sharedStart(previous.strokes, strokes);
  if (known > 0 && same === known) return { reuse: previous, start: known, base: previous.full };
  if (previous.upto && known > 1 && same === known - 1 && strokes.length >= known) return { reuse: null, start: known - 1, base: previous.upto };
  return { reuse: null, start: 0, base: null };
}

/**
 * Paints the strokes not yet on a raster: after the previous raster when the strokes only add to it (or change its
 * last stroke), else from nothing.
 * @param previous the part's last raster at this size, if any
 * @param strokes the part's strokes now
 * @param width the raster's width, pixels
 * @param height the raster's height, pixels
 * @returns the new raster
 */
function repaint(previous: BrushRaster | undefined, strokes: BrushStroke[], width: number, height: number): BrushRaster {
  const { reuse, start, base } = startingPoint(previous, strokes);
  const full = base ? base.slice() : new Float32Array(width * height);
  let upto: Float32Array | null = null;
  let live: StrokeShape | null = null;
  if (start === strokes.length) {
    if (reuse) [upto, live] = [reuse.upto, reuse.live];
    else upto = strokes.length ? null : full;
  }
  for (let index = start; index < strokes.length; index++) {
    const stroke = strokes.at(index);
    if (!stroke) continue;
    const shape = newShape(stroke, width, height);
    extendShape(shape, stroke, width, height);
    if (index === strokes.length - 1) {
      upto = full.slice();
      live = shape;
    }
    applyShape(full, full, width, shape, tail(shape, width, height));
  }
  const raster = { strokes, upto, full, live };
  if (previous?.live && previous.live === raster.live) previous.live = null;
  return raster;
}

/**
 * A brush part's raster: continuing the last one drawn when it can.
 * @param previous the part's last raster at this size, if any
 * @param strokes the part's strokes now
 * @param width the raster's width, pixels
 * @param height the raster's height, pixels
 * @returns the new raster
 */
export function brushRaster(previous: BrushRaster | undefined, strokes: BrushStroke[], width: number, height: number): BrushRaster {
  const continued = previous && previous.strokes.length > 0 ? continueStroke(previous, strokes, width, height) : null;
  return continued ?? repaint(previous, strokes, width, height);
}
