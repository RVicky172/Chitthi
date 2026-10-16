import { brushRaster, type BrushRaster } from './maskBrush';
import { usesPhoto, type BrushPart, type ColourRangePart, type LinearPart, type LumaRangePart, type Mask, type MaskCombine, type MaskPart, type RadialPart } from './masks';
import { AI_TARGETS, segmentAt, segmentOf, segmentVersion, type AiTarget, type Segment } from './segments';

/*
 * Masks as rasters: coverage 0–1 at a raster size with the photo's proportions. Gradients are worked out at each
 * pixel's centre; ranges read the photo at the same size; AI parts read the model's map; brush parts are maskBrush.ts's.
 * Parts and whole masks are cached per size, so moving a slider of the mask's settings costs nothing here.
 */

/**
 * Raster sizes, by the photo's longer side: a mask is drawn at the smallest that is at least two thirds of the size the
 * photo is shown at (thumbnails, the stage, an export), up to the largest. Masks are soft, so 1.5× enlargement doesn't
 * show. Few sizes mean few cached rasters.
 */
export const MASK_SIZES = [256, 512, 1024, 2048] as const;

/**
 * The raster size for a photo shown at a size.
 * @param shown the photo's longer side as shown, pixels
 * @returns the raster's longer side, pixels
 */
export const rasterSize = (shown: number): number => MASK_SIZES.find((size) => size * 1.5 >= shown) ?? MASK_SIZES[3];

/**
 * A raster's pixel size with the photo's proportions.
 * @param photoWidth the photo's width, pixels
 * @param photoHeight its height, pixels
 * @param long the raster's longer side, pixels
 * @returns the raster's width and height
 */
export function rasterDims(photoWidth: number, photoHeight: number, long: number): [number, number] {
  const scale = long / Math.max(photoWidth, photoHeight, 1);
  return [Math.max(1, Math.round(photoWidth * scale)), Math.max(1, Math.round(photoHeight * scale))];
}

/** The photo at raster size, RGBA, for range parts, and its segmentations for AI parts; `token` tells samples apart in cache keys. */
export interface PhotoSample {
  data: Uint8ClampedArray;
  token: number;
  segs?: Partial<Record<AiTarget, Segment>>;
}

/**
 * Smoothstep, clamped.
 * @param value anything
 * @returns 0 at or below 0, 1 at or above 1, eased between
 */
function smooth(value: number): number {
  if (value <= 0) return 0;
  return value >= 1 ? 1 : value * value * (3 - 2 * value);
}

/** sRGB 8-bit to linear, made once. */
let linearValues: Float32Array | null = null;

/**
 * The table of sRGB 8-bit values as linear light.
 * @returns 256 values
 */
function linearTable(): Float32Array {
  if (!linearValues) {
    linearValues = new Float32Array(256);
    for (let value = 0; value < 256; value++) {
      const share = value / 255;
      linearValues[value] = share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
    }
  }
  return linearValues;
}

/**
 * OKLab (L, a, b) of an 8-bit sRGB colour: a space where distance follows how different colours look.
 * @param red 0–255
 * @param green 0–255
 * @param blue 0–255
 * @param out where to write it (reused in loops)
 * @returns `out`, [L, a, b]
 */
export function oklab(red: number, green: number, blue: number, out: number[] = [0, 0, 0]): number[] {
  const table = linearTable();
  const linearRed = table[red] ?? 0;
  const linearGreen = table[green] ?? 0;
  const linearBlue = table[blue] ?? 0;
  const long = Math.cbrt(0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue);
  const medium = Math.cbrt(0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue);
  const short = Math.cbrt(0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue);
  out[0] = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  out[1] = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  out[2] = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return out;
}

/** OKLab of every pixel of a photo sample, worked out once per sample. */
const labCache = new WeakMap<Uint8ClampedArray, Float32Array>();

/**
 * OKLab of every pixel of a photo sample.
 * @param pixels the sample, RGBA
 * @returns L, a, b per pixel
 */
function labOf(pixels: Uint8ClampedArray): Float32Array {
  let lab = labCache.get(pixels);
  if (!lab) {
    lab = new Float32Array((pixels.length / 4) * 3);
    const colour = [0, 0, 0];
    for (let index = 0, labIndex = 0; index < pixels.length; index += 4, labIndex += 3) {
      oklab(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0, colour);
      lab[labIndex] = colour[0] ?? 0;
      lab[labIndex + 1] = colour[1] ?? 0;
      lab[labIndex + 2] = colour[2] ?? 0;
    }
    labCache.set(pixels, lab);
  }
  return lab;
}

/**
 * A linear gradient: along a row its value changes by a constant step, so only the band where it fades is worked out;
 * either side of it the row is all full or all empty.
 * @param mask the raster, written
 * @param part the gradient
 * @param width the raster's width, pixels
 * @param height its height, pixels
 */
function linearRaster(mask: Float32Array, part: LinearPart, width: number, height: number): void {
  const angle = (part.angle * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const fade = Math.max(1, part.width * width);
  const centreX = part.x * width;
  const centreY = part.y * height;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const first = ((0.5 - centreX) * cos + (y + 0.5 - centreY) * sin) / fade + 0.5;
    const step = cos / fade;
    let x0 = 0;
    let x1 = width;
    if (Math.abs(step) > 1e-12) {
      // Pixels whose value lies strictly between 0 and 1, plus one either side for safety.
      const atZero = -first / step;
      const atOne = (1 - first) / step;
      x0 = Math.min(width, Math.max(0, Math.floor(Math.min(atZero, atOne)) - 1));
      x1 = Math.min(width, Math.max(x0, Math.ceil(Math.max(atZero, atOne)) + 1));
      // Before x0 and after x1 the row is all full or all empty; which, by the side of the band.
      if (first + step * (x0 - 1) <= 0 && x0 > 0) mask.fill(1, row, row + x0);
      if (first + step * x1 <= 0) mask.fill(1, row + x1, row + width);
    }
    for (let x = x0; x < x1; x++) mask[row + x] = 1 - smooth(first + step * x);
  }
}

/**
 * A radial gradient: 0 outside the ellipse's bounding box (as the array starts), 1 inside its core without a root.
 * @param mask the raster, written
 * @param part the gradient
 * @param width the raster's width, pixels
 * @param height its height, pixels
 */
function radialRaster(mask: Float32Array, part: RadialPart, width: number, height: number): void {
  const angle = (part.angle * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const radiusX = Math.max(1, part.rx * width);
  const radiusY = Math.max(1, part.ry * width);
  const centreX = part.x * width;
  const centreY = part.y * height;
  // A feather of 0 still gets a pixel and a half of softening, so the edge isn't jagged.
  const band = Math.min(1, Math.max(part.feather / 100, 1.5 / Math.min(radiusX, radiusY)));
  const inner = 1 - band;
  const inner2 = inner * inner;
  const extentX = Math.hypot(radiusX * cos, radiusY * sin);
  const extentY = Math.hypot(radiusX * sin, radiusY * cos);
  const y0 = Math.max(0, Math.floor(centreY - extentY));
  const y1 = Math.min(height - 1, Math.ceil(centreY + extentY));
  const x0 = Math.max(0, Math.floor(centreX - extentX));
  const x1 = Math.min(width - 1, Math.ceil(centreX + extentX));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - centreX;
      const dy = y + 0.5 - centreY;
      const along = (dx * cos + dy * sin) / radiusX;
      const across = (dy * cos - dx * sin) / radiusY;
      const distance2 = along * along + across * across;
      if (distance2 >= 1) continue;
      mask[y * width + x] = distance2 <= inner2 ? 1 : 1 - smooth((Math.sqrt(distance2) - inner) / band);
    }
  }
}

/**
 * A tone range: the photo's luminance between `lo` and `hi`, with soft edges.
 * @param mask the raster, written
 * @param part the range
 * @param pixels the photo at raster size, RGBA
 */
function lumaRaster(mask: Float32Array, part: LumaRangePart, pixels: Uint8ClampedArray): void {
  const low = part.lo / 100;
  const high = part.hi / 100;
  const soft = Math.max(0.01, (part.smooth / 100) * 0.5);
  for (let index = 0; index < mask.length; index++) {
    const luma = (0.2126 * (pixels[index * 4] ?? 0) + 0.7152 * (pixels[index * 4 + 1] ?? 0) + 0.0722 * (pixels[index * 4 + 2] ?? 0)) / 255;
    mask[index] = smooth((luma - low + soft) / soft) * (1 - smooth((luma - high) / soft));
  }
}

/**
 * A colour range: near the picked colour in OKLab, lightness counting half as much as hue and saturation, so a colour
 * in light and in shade is still picked.
 * @param mask the raster, written
 * @param part the range
 * @param pixels the photo at raster size, RGBA
 */
function colourRaster(mask: Float32Array, part: ColourRangePart, pixels: Uint8ClampedArray): void {
  const lab = labOf(pixels);
  const [pickedL = 0, pickedA = 0, pickedB = 0] = oklab(part.r, part.g, part.b);
  const tolerance = 0.02 + (part.range / 100) * 0.25;
  const half = tolerance / 2;
  for (let index = 0, labIndex = 0; index < mask.length; index++, labIndex += 3) {
    const dl = ((lab[labIndex] ?? 0) - pickedL) * 0.5;
    const da = (lab[labIndex + 1] ?? 0) - pickedA;
    const db = (lab[labIndex + 2] ?? 0) - pickedB;
    mask[index] = 1 - smooth((Math.sqrt(dl * dl + da * da + db * db) - half) / half);
  }
}

/**
 * A gradient, range or AI part at a raster size, 0–1. Ranges need the photo at the same size (without it, a range
 * covers everything); an AI part without its map yet (still working, or no model) is empty.
 * @param part the part
 * @param width the raster's width, pixels
 * @param height its height, pixels
 * @param photo the photo at raster size, for ranges and AI parts
 * @returns the raster
 */
export function rasterShape(part: Exclude<MaskPart, BrushPart>, width: number, height: number, photo?: PhotoSample): Float32Array {
  const mask = new Float32Array(width * height);
  if (part.kind === 'linear') linearRaster(mask, part, width, height);
  else if (part.kind === 'radial') radialRaster(mask, part, width, height);
  else if (part.kind === 'ai') {
    // The model's map, read at each raster pixel's centre.
    const segment = photo?.segs?.[part.target];
    if (segment) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask[y * width + x] = segmentAt(segment, (x + 0.5) / width, (y + 0.5) / height);
    }
  } else if (photo?.data.length !== width * height * 4) mask.fill(1);
  else if (part.kind === 'luma') lumaRaster(mask, part, photo.data);
  else colourRaster(mask, part, photo.data);
  return mask;
}

/** Each part's rasters, by size (and photo sample). */
const partCache = new WeakMap<MaskPart, Map<string, BrushRaster>>();

/** The most recent raster per part id and size: a part changed by one stroke starts from it. */
const lastById = new Map<string, BrushRaster>();

/**
 * Keeps a part's raster in the cache under a key.
 * @param part the part
 * @param key its size key
 * @param raster the raster
 * @param limit clear the part's sizes once it has more than this (none: keep all)
 */
function remember(part: MaskPart, key: string, raster: BrushRaster, limit = Infinity): void {
  const sizes = partCache.get(part) ?? new Map<string, BrushRaster>();
  if (sizes.size > limit) sizes.clear();
  sizes.set(key, raster);
  partCache.set(part, sizes);
}

/**
 * A part's coverage at a raster size, before its own invert. Cached per part and size. A brush part that differs from
 * the last one drawn only by strokes added at the end, or by its last stroke drawn further (painting), paints only that.
 * @param part the part
 * @param width the raster's width, pixels
 * @param height its height, pixels
 * @param photo the photo at raster size, for ranges and AI parts
 * @returns the raster (cached: don't change it)
 */
export function rasterPart(part: MaskPart, width: number, height: number, photo?: PhotoSample): Float32Array {
  const sampleKey = usesPhoto(part) ? `:${String(photo?.token ?? 0)}` : '';
  const key = `${String(width)}x${String(height)}${sampleKey}`;
  const hit = partCache.get(part)?.get(key);
  if (hit) return hit.full;
  if (part.kind !== 'brush') {
    const full = rasterShape(part, width, height, photo);
    remember(part, key, { strokes: [], upto: null, full, live: null }, 3);
    return full;
  }
  const id = `${part.id}:${key}`;
  const raster = brushRaster(lastById.get(id), part.strokes, width, height);
  remember(part, key, raster);
  lastById.delete(id);
  lastById.set(id, raster);
  // Rasters of parts that no longer exist would otherwise stay; a few dozen is plenty for any batch.
  if (lastById.size > 48) {
    const oldest = lastById.keys().next();
    if (!oldest.done) lastById.delete(oldest.value);
  }
  return raster.full;
}

/**
 * Combines a part's coverage into the mask so far.
 * @param out the mask so far, combined in place
 * @param coverage the part's coverage
 * @param invert whether the part is inverted
 * @param combine how it joins (the first part is added)
 */
function combineInto(out: Float32Array, coverage: Float32Array, invert: boolean, combine: MaskCombine): void {
  for (let index = 0; index < out.length; index++) {
    const own = coverage[index] ?? 0;
    const value = invert ? 1 - own : own;
    const before = out[index] ?? 0;
    if (combine === 'add') out[index] = Math.max(before, value);
    else if (combine === 'subtract') out[index] = before * (1 - value);
    else out[index] = before * value;
  }
}

/** Combined masks, by their parts (not the mask: its settings changing doesn't change its shape). */
const maskCache = new WeakMap<MaskPart[], Map<string, Float32Array>>();

/**
 * The whole mask at a raster size, 0–1: its parts combined in order, then its own invert.
 * @param mask the mask's parts and invert
 * @param width the raster's width, pixels
 * @param height its height, pixels
 * @param photo the photo at raster size, for ranges and AI parts
 * @returns the raster (cached: don't change it)
 */
export function rasterMask(mask: Pick<Mask, 'parts' | 'invert'>, width: number, height: number, photo?: PhotoSample): Float32Array {
  const sampleKey = mask.parts.some(usesPhoto) ? `:${String(photo?.token ?? 0)}` : '';
  const key = `${String(mask.invert)}:${String(width)}x${String(height)}${sampleKey}`;
  const hit = maskCache.get(mask.parts)?.get(key);
  if (hit) return hit;
  let out: Float32Array;
  const only = mask.parts.length === 1 ? mask.parts[0] : undefined;
  if (only && !only.invert && !mask.invert) out = rasterPart(only, width, height, photo);
  else {
    const combined = new Float32Array(width * height);
    mask.parts.forEach((part, index) => {
      combineInto(combined, rasterPart(part, width, height, photo), part.invert, index === 0 ? 'add' : part.combine);
    });
    if (mask.invert) for (let index = 0; index < combined.length; index++) combined[index] = 1 - (combined[index] ?? 0);
    out = combined;
  }
  const sizes = maskCache.get(mask.parts) ?? new Map<string, Float32Array>();
  if (sizes.size > 3) sizes.clear();
  sizes.set(key, out);
  maskCache.set(mask.parts, sizes);
  return out;
}

/* ---------- the photo, for range parts (needs a DOM) ---------- */

let sampleCount = 0;
const samples = new WeakMap<object, Map<string, PhotoSample>>();

/**
 * The photo drawn at a raster size (as it is, not turned or adjusted), with its segmentations so far, cached per photo,
 * size and segmentation version (a new segmentation makes a new sample, so rasters that use it are drawn again).
 * @param src the photo
 * @param width the raster's width, pixels
 * @param height its height, pixels
 * @returns the sample, or undefined when no canvas can be made
 */
export function photoSample(src: CanvasImageSource, width: number, height: number): PhotoSample | undefined {
  const key = `${String(width)}x${String(height)}:${String(segmentVersion(src))}`;
  const hit = samples.get(src)?.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, width, height);
  const segs: Partial<Record<AiTarget, Segment>> = {};
  for (const target of AI_TARGETS) {
    const segment = segmentOf(src, target);
    if (segment) segs[target] = segment;
  }
  const sample = { data: ctx.getImageData(0, 0, width, height).data, token: ++sampleCount, segs };
  const sizes = samples.get(src) ?? new Map<string, PhotoSample>();
  if (sizes.size > 3) sizes.clear();
  sizes.set(key, sample);
  samples.set(src, sizes);
  return sample;
}
