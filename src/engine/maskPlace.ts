import { PART_RANGES, usesPhoto, type LinearPart, type Mask, type MaskPart, type RadialPart } from './masks';
import { photoSample, rasterDims, rasterMask, rasterSize } from './maskRaster';

/*
 * Masks on the frame: where the photo is drawn (its centre, size, turn and mirror), converting points between the frame
 * and the photo, the gradient parts' handles and their drags, and the mask laid on the frame pixel by pixel.
 */

/** Where the photo is drawn on the frame, as renderIg() draws it. */
export interface PhotoPlace {
  cx: number;
  cy: number;
  /** The photo's own width and height as drawn (before turning). */
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rot: number;
  flip: boolean;
}

/**
 * A frame point as a point on the photo.
 * @param place where the photo is drawn
 * @param x frame pixels
 * @param y frame pixels
 * @returns shares of the photo's own width and height
 */
export function frameToPhoto(place: PhotoPlace, x: number, y: number): [number, number] {
  const angle = (-place.rot * Math.PI) / 180;
  const dx = x - place.cx;
  const dy = y - place.cy;
  let localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  if (place.flip) localX = -localX;
  return [localX / place.w + 0.5, localY / place.h + 0.5];
}

/**
 * A point on the photo as frame pixels: frameToPhoto() the other way.
 * @param place where the photo is drawn
 * @param shareX a share of the photo's width
 * @param shareY a share of its height
 * @returns frame pixels
 */
export function photoToFrame(place: PhotoPlace, shareX: number, shareY: number): [number, number] {
  let localX = (shareX - 0.5) * place.w;
  const localY = (shareY - 0.5) * place.h;
  if (place.flip) localX = -localX;
  const angle = (place.rot * Math.PI) / 180;
  return [place.cx + localX * Math.cos(angle) - localY * Math.sin(angle), place.cy + localX * Math.sin(angle) + localY * Math.cos(angle)];
}

/* ---------- gradient handles ---------- */

/** A gradient's handles: its centre, a linear one's end, a radial one's radii. */
export type HandleId = 'move' | 'end' | 'rx' | 'ry';

/** A handle on the frame. */
export interface Handle {
  id: HandleId;
  /** Frame pixels. */
  x: number;
  y: number;
}

/**
 * A step along a direction on the photo.
 * @param place where the photo is drawn
 * @param degrees the direction
 * @param length display pixels
 * @returns the step in shares of the photo's width and height
 */
const stepAlong = (place: PhotoPlace, degrees: number, length: number): [number, number] => {
  const angle = (degrees * Math.PI) / 180;
  return [(Math.cos(angle) * length) / place.w, (Math.sin(angle) * length) / place.h];
};

/**
 * The handles of a gradient on the frame: its centre (move), and its end (linear) or its two radii (radial).
 * @param part the part
 * @param place where the photo is drawn
 * @returns the handles; none for other parts
 */
export function partHandles(part: MaskPart, place: PhotoPlace): Handle[] {
  if (part.kind !== 'linear' && part.kind !== 'radial') return [];
  const at = (id: HandleId, du = 0, dv = 0): Handle => {
    const [x, y] = photoToFrame(place, part.x + du, part.y + dv);
    return { id, x, y };
  };
  if (part.kind === 'linear') return [at('move'), at('end', ...stepAlong(place, part.angle, (part.width * place.w) / 2))];
  return [at('move'), at('rx', ...stepAlong(place, part.angle, part.rx * place.w)), at('ry', ...stepAlong(place, part.angle + 90, part.ry * place.w))];
}

/**
 * A setting within its range.
 * @param key the setting
 * @param value the value
 * @returns the value, clamped
 */
const limit = (key: keyof typeof PART_RANGES, value: number): number => Math.min(PART_RANGES[key][1], Math.max(PART_RANGES[key][0], value));

/** A point on the photo: shares of its width and height. */
type PhotoPoint = [number, number];

/**
 * A gradient dragged on the frame: by a handle, or 'draw' for a drag that wasn't on a handle (a linear gradient from
 * the press to the pointer, or a circle around the press).
 * @param orig the part as it was when the drag began
 * @param handle the handle dragged, or 'draw'
 * @param from where the drag began, on the photo
 * @param to where the pointer is, on the photo
 * @param place where the photo is drawn
 * @returns the part dragged
 */
export function dragPart<P extends LinearPart | RadialPart>(orig: P, handle: HandleId | 'draw', from: PhotoPoint, to: PhotoPoint, place: PhotoPlace): P {
  // Vectors in display pixels, where angles and lengths are true on the photo.
  const vector = (start: PhotoPoint, end: PhotoPoint) => [(end[0] - start[0]) * place.w, (end[1] - start[1]) * place.h] as const;
  const degrees = (vec: readonly [number, number]) => (Math.atan2(vec[1], vec[0]) * 180) / Math.PI;
  const length = (vec: readonly [number, number]) => Math.hypot(vec[0], vec[1]) / place.w;
  if (handle === 'move') return { ...orig, x: limit('x', orig.x + to[0] - from[0]), y: limit('y', orig.y + to[1] - from[1]) };
  const fromCentre = vector([orig.x, orig.y], to);
  if (orig.kind === 'linear') {
    if (handle === 'end') return { ...orig, angle: degrees(fromCentre), width: limit('width', 2 * length(fromCentre)) };
    const drawn = vector(from, to);
    return {
      ...orig,
      x: limit('x', (from[0] + to[0]) / 2),
      y: limit('y', (from[1] + to[1]) / 2),
      angle: degrees(drawn),
      width: limit('width', length(drawn)),
    };
  }
  if (handle === 'rx') return { ...orig, angle: degrees(fromCentre), rx: limit('rx', length(fromCentre)) };
  if (handle === 'ry') return { ...orig, ry: limit('ry', length(fromCentre)) };
  const radius = limit('rx', length(vector(from, to)));
  return { ...orig, x: limit('x', from[0]), y: limit('y', from[1]), rx: radius, ry: radius, angle: 0 };
}

/* ---------- the mask on the frame ---------- */

/** A mask laid on the frame. */
export interface FrameMask {
  /** The mask on the frame, one byte per pixel (0–255), row by row; 0 outside the photo. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Unique per contents: the GPU keeps the uploaded texture under it. */
  key: string;
}

let frameCount = 0;

/** Per shape, the last few placements (the stage and the strip's thumbnails draw the same photo at different sizes). */
const frameCache = new WeakMap<MaskPart[], Map<string, FrameMask>>();

/** How the raster position moves per frame pixel: the start at pixel (0, 0) and the steps along x and y. */
interface RasterWalk {
  startX: number;
  startY: number;
  /** Raster x and y per frame pixel to the right. */
  stepXx: number;
  stepYx: number;
  /** Raster x and y per frame pixel down. */
  stepXy: number;
  stepYy: number;
}

/**
 * Raster position X = u·rw − ½ for photo share u; u and v are linear in the frame pixel, so they step along rows.
 * @param place where the photo is drawn
 * @param width the raster's width, pixels
 * @param height its height, pixels
 * @returns the start and steps
 */
function rasterWalk(place: PhotoPlace, width: number, height: number): RasterWalk {
  const [u0, v0] = frameToPhoto(place, 0.5, 0.5);
  const [u1, v1] = frameToPhoto(place, 1.5, 0.5);
  const [u2, v2] = frameToPhoto(place, 0.5, 1.5);
  return {
    startX: u0 * width - 0.5,
    startY: v0 * height - 0.5,
    stepXx: (u1 - u0) * width,
    stepYx: (v1 - v0) * height,
    stepXy: (u2 - u0) * width,
    stepYy: (v2 - v0) * height,
  };
}

/**
 * The raster read at a position (bilinear), clamped to its edge.
 * @param raster the raster
 * @param width its width, pixels
 * @param height its height, pixels
 * @param x raster position
 * @param y raster position
 * @returns 0–1
 */
function sampleAt(raster: Float32Array, width: number, height: number, x: number, y: number): number {
  // Comparisons, not Math.min / max: this runs for every pixel of the frame.
  const clampedX = x < 0 ? 0 : Math.min(x, width - 1);
  const clampedY = y < 0 ? 0 : Math.min(y, height - 1);
  const left = clampedX | 0;
  const top = clampedY | 0;
  const right = left + 1 < width ? left + 1 : left;
  const bottom = top + 1 < height ? top + 1 : top;
  const fractionX = clampedX - left;
  const fractionY = clampedY - top;
  const topLeft = raster[top * width + left] ?? 0;
  const bottomLeft = raster[bottom * width + left] ?? 0;
  const upper = topLeft + ((raster[top * width + right] ?? 0) - topLeft) * fractionX;
  const lower = bottomLeft + ((raster[bottom * width + right] ?? 0) - bottomLeft) * fractionX;
  return upper + (lower - upper) * fractionY;
}

/**
 * The mask laid on a frame exactly where the photo is drawn, turned and mirrored with it: each frame pixel's centre is
 * taken back to the photo and the raster read there (bilinear). Cached by the mask's shape and the placement, so
 * changing a mask's settings costs nothing here.
 * @param mask the mask's parts and invert
 * @param photoWidth the photo's width, pixels
 * @param photoHeight its height, pixels
 * @param place where the photo is drawn
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @param src the photo, for range and AI parts
 * @returns the mask on the frame (cached: don't change it)
 */
export function frameMask(
  mask: Pick<Mask, 'parts' | 'invert'>,
  photoWidth: number,
  photoHeight: number,
  place: PhotoPlace,
  frameWidth: number,
  frameHeight: number,
  src?: CanvasImageSource,
): FrameMask {
  const [width, height] = rasterDims(photoWidth, photoHeight, rasterSize(Math.max(place.w, place.h)));
  const outWidth = Math.max(1, Math.round(frameWidth));
  const outHeight = Math.max(1, Math.round(frameHeight));
  const photo = src && mask.parts.some(usesPhoto) ? photoSample(src, width, height) : undefined;
  const placement = `${String(place.cx)},${String(place.cy)},${String(place.w)},${String(place.h)},${String(place.rot)},${String(place.flip)}`;
  const key = `${String(mask.invert)}:${String(outWidth)}x${String(outHeight)}:${placement}:${String(width)}x${String(height)}:${String(photo?.token ?? 0)}`;
  const hit = frameCache.get(mask.parts)?.get(key);
  if (hit) return hit;
  const raster = rasterMask(mask, width, height, photo);
  const data = new Uint8Array(outWidth * outHeight);
  const walk = rasterWalk(place, width, height);
  for (let y = 0; y < outHeight; y++) {
    let rasterX = walk.startX + y * walk.stepXy;
    let rasterY = walk.startY + y * walk.stepYy;
    for (let x = 0; x < outWidth; x++, rasterX += walk.stepXx, rasterY += walk.stepYx) {
      // Outside the photo (its edge is half a raster pixel beyond the outer centres): nothing.
      if (rasterX < -0.5 || rasterY < -0.5 || rasterX > width - 0.5 || rasterY > height - 0.5) continue;
      data[y * outWidth + x] = Math.round(sampleAt(raster, width, height, rasterX, rasterY) * 255);
    }
  }
  const placed = { data, width: outWidth, height: outHeight, key: `mask:${String(++frameCount)}` };
  const cached = frameCache.get(mask.parts) ?? new Map<string, FrameMask>();
  if (cached.size >= 3) {
    const oldest = cached.keys().next();
    if (!oldest.done) cached.delete(oldest.value);
  }
  cached.set(key, placed);
  frameCache.set(mask.parts, cached);
  return placed;
}
