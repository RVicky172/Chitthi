import type { Adjustments } from './adjust';

/*
 * Detail and effects (specs/vision/editor-implementation.md, P1.3): noise reduction, dehaze, clarity, sharpening and
 * grain, in that order, after the colour settings. Unlike the colour chain these look at neighbouring pixels, so their
 * sizes are given for a frame 1080 px wide and scaled to the frame being drawn: the small preview and the full-size
 * export look the same.
 *
 * This file is the reference and the Canvas 2D path: detailPixels() runs on straight-alpha RGBA in 0–1. The GPU
 * programs (gpu/detail.ts) use the same kernels, tap for tap, and the self-test compares the two. Blurs weight each
 * pixel by its alpha, so the transparent surround of a "whole photo" frame never darkens the photo's edge.
 */

/** The detail settings. */
export type DetailKey = 'noise' | 'dehaze' | 'clarity' | 'sharpen' | 'sharpenRadius' | 'sharpenMask' | 'grain';

/**
 * Whether no detail setting changes anything.
 * @param adjust the settings
 * @returns true when noise, dehaze, clarity, sharpening and grain are all 0
 */
export const detailNeutral = (adjust: Adjustments): boolean => !adjust.noise && !adjust.dehaze && !adjust.clarity && !adjust.sharpen && !adjust.grain;

/** Frame width the sizes below are given for. */
export const DETAIL_WIDTH = 1080;

/** Gaussian blur size (sigma, px at 1080 wide) for clarity. */
export const CLARITY_SIGMA = 12;

/** Gaussian blur size (sigma, px at 1080 wide) for the dehaze haze map. */
export const HAZE_SIGMA = 20;

/** At most this many taps either side of a blur; wider blurs take every k-th pixel instead. */
export const MAX_TAPS = 16;

/** A blur's taps. */
export interface Kernel {
  /** Distance in pixels between taps. */
  step: number;
  /** Weights for taps -n … n, summing to 1. */
  weights: number[];
}

/**
 * A Gaussian blur as taps every `step` px, at most MAX_TAPS either side.
 * @param sigma the blur's sigma, pixels
 * @returns the kernel
 */
export function gaussKernel(sigma: number): Kernel {
  const spread = Math.max(0.3, sigma);
  const step = Math.max(1, Math.ceil((3 * spread) / MAX_TAPS));
  const reach = Math.max(1, Math.ceil((3 * spread) / step));
  const raw = Array.from({ length: 2 * reach + 1 }, (_, index) => Math.exp(-(((index - reach) * step) ** 2) / (2 * spread * spread)));
  const sum = raw.reduce((total, weight) => total + weight, 0);
  return { step, weights: raw.map((weight) => weight / sum) };
}

/** Grain cell size (px at 1080 wide). */
export const GRAIN_CELL = 1.6;

/**
 * The integer hash both paths use for grain.
 * @param x a cell's column
 * @param y a cell's row
 * @returns 0–1
 */
export function hash2(x: number, y: number): number {
  let hash = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

/**
 * Smooth value noise.
 * @param cellX a point's x, in grain cells
 * @param cellY its y, in grain cells
 * @returns 0–1
 */
export function grainAt(cellX: number, cellY: number): number {
  const column = Math.floor(cellX);
  const row = Math.floor(cellY);
  const fractionX = cellX - column;
  const fractionY = cellY - row;
  const easeX = fractionX * fractionX * (3 - 2 * fractionX);
  const easeY = fractionY * fractionY * (3 - 2 * fractionY);
  const top = hash2(column, row) + (hash2(column + 1, row) - hash2(column, row)) * easeX;
  const bottom = hash2(column, row + 1) + (hash2(column + 1, row + 1) - hash2(column, row + 1)) * easeX;
  return top + (bottom - top) * easeY;
}

/** Rec. 601 luma weights. */
const LUMA_RED = 0.299;
const LUMA_GREEN = 0.587;
const LUMA_BLUE = 0.114;

/**
 * An index clamped to 0 – last (edges repeat the border pixel, as a GPU sampler set to clamp does).
 * @param index any index
 * @param last the last valid index
 * @returns the index, clamped
 */
const clampIndex = (index: number, last: number): number => {
  if (index < 0) return 0;
  return index > last ? last : index;
};

/**
 * A pixel's luma.
 * @param image RGBA, 0–1
 * @param offset the pixel's first value
 * @returns 0–1
 */
const lumaAt = (image: Float32Array, offset: number): number =>
  LUMA_RED * (image[offset] ?? 0) + LUMA_GREEN * (image[offset + 1] ?? 0) + LUMA_BLUE * (image[offset + 2] ?? 0);

/**
 * The blur's horizontal pass: alpha-weighted (premultiplied) sums.
 * @param src the image, straight alpha
 * @param width pixels
 * @param height pixels
 * @param kernel the blur
 * @returns premultiplied sums with the blurred alpha
 */
function blurRows(src: Float32Array, width: number, height: number, kernel: Kernel): Float32Array {
  const reach = (kernel.weights.length - 1) / 2;
  const sums = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let tap = -reach; tap <= reach; tap++) {
        const offset = (y * width + clampIndex(x + tap * kernel.step, width - 1)) * 4;
        const weight = (kernel.weights[tap + reach] ?? 0) * (src[offset + 3] ?? 0);
        red += weight * (src[offset] ?? 0);
        green += weight * (src[offset + 1] ?? 0);
        blue += weight * (src[offset + 2] ?? 0);
        alpha += weight;
      }
      const target = (y * width + x) * 4;
      sums[target] = red;
      sums[target + 1] = green;
      sums[target + 2] = blue;
      sums[target + 3] = alpha;
    }
  }
  return sums;
}

/**
 * The blur's vertical pass, then back to straight colour.
 * @param sums the horizontal pass's premultiplied sums
 * @param width pixels
 * @param height pixels
 * @param kernel the blur
 * @returns straight colour with the blurred alpha
 */
function blurColumns(sums: Float32Array, width: number, height: number, kernel: Kernel): Float32Array {
  const reach = (kernel.weights.length - 1) / 2;
  const out = new Float32Array(sums.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let tap = -reach; tap <= reach; tap++) {
        const offset = (clampIndex(y + tap * kernel.step, height - 1) * width + x) * 4;
        const weight = kernel.weights[tap + reach] ?? 0;
        red += weight * (sums[offset] ?? 0);
        green += weight * (sums[offset + 1] ?? 0);
        blue += weight * (sums[offset + 2] ?? 0);
        alpha += weight * (sums[offset + 3] ?? 0);
      }
      const target = (y * width + x) * 4;
      out[target] = alpha > 0 ? red / alpha : 0;
      out[target + 1] = alpha > 0 ? green / alpha : 0;
      out[target + 2] = alpha > 0 ? blue / alpha : 0;
      out[target + 3] = alpha;
    }
  }
  return out;
}

/**
 * A separable alpha-weighted blur of a straight-alpha image. Edges repeat the border pixel.
 * @param src the image, RGBA 0–1, width × height
 * @param width pixels
 * @param height pixels
 * @param kernel the blur
 * @returns straight colour with the blurred alpha
 */
export function blurImage(src: Float32Array, width: number, height: number, kernel: Kernel): Float32Array {
  return blurColumns(blurRows(src, width, height, kernel), width, height, kernel);
}

/** Noise reduction's spatial sigma, taps. */
export const NOISE_SIGMA_S = 1.5;

/** Noise reduction's settings at a frame size. */
export interface NoiseParams {
  /** Pixels between taps. */
  step: number;
  /** How different a neighbour's luma may be and still count. */
  sigmaR: number;
  /** The spatial falloff: 1 / (2σ²) in taps. */
  spatial: number;
}

/**
 * Noise reduction's settings: a 5×5 edge-preserving (bilateral) filter, taps `step` px apart.
 * @param amount the setting, 0–100
 * @param scale the frame width over DETAIL_WIDTH
 * @returns the filter's settings
 */
export function noiseParams(amount: number, scale: number): NoiseParams {
  const step = Math.max(1, Math.round(scale));
  return { step, sigmaR: (amount / 100) * 0.12, spatial: 1 / (2 * ((NOISE_SIGMA_S * scale) / step) ** 2) };
}

/** A bilateral filter at a frame size: its tap step and the two falloffs. */
interface Bilateral {
  step: number;
  spatial: number;
  /** The range falloff: 1 / (2σr²). */
  range: number;
}

/**
 * One pixel of the bilateral filter: its neighbours weighted by distance, by how near their luma is, and by alpha.
 * @param src the image
 * @param size the image's width and height
 * @param size.width pixels
 * @param size.height pixels
 * @param x the pixel's column
 * @param y its row
 * @param filter the filter
 * @param out the image written
 */
function bilateralAt(src: Float32Array, size: { width: number; height: number }, x: number, y: number, filter: Bilateral, out: Float32Array): void {
  const { width, height } = size;
  const offset = (y * width + x) * 4;
  const centre = lumaAt(src, offset);
  let red = 0;
  let green = 0;
  let blue = 0;
  let total = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tap = (clampIndex(y + dy * filter.step, height - 1) * width + clampIndex(x + dx * filter.step, width - 1)) * 4;
      const lumaDifference = lumaAt(src, tap) - centre;
      const weight = Math.exp(-(dx * dx + dy * dy) * filter.spatial - lumaDifference * lumaDifference * filter.range) * (src[tap + 3] ?? 0);
      red += weight * (src[tap] ?? 0);
      green += weight * (src[tap + 1] ?? 0);
      blue += weight * (src[tap + 2] ?? 0);
      total += weight;
    }
  }
  out[offset] = red / total;
  out[offset + 1] = green / total;
  out[offset + 2] = blue / total;
  out[offset + 3] = src[offset + 3] ?? 0;
}

/**
 * Noise reduction over an image; transparent pixels are kept as they are.
 * @param src the image, RGBA 0–1
 * @param width pixels
 * @param height pixels
 * @param amount the setting, 0–100
 * @param scale the frame width over DETAIL_WIDTH
 * @returns the filtered image
 */
function denoise(src: Float32Array, width: number, height: number, amount: number, scale: number): Float32Array {
  const { step, sigmaR, spatial } = noiseParams(amount, scale);
  const filter: Bilateral = { step, spatial, range: 1 / (2 * sigmaR * sigmaR) };
  const size = { width, height };
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (src[offset + 3] === 0) out.set(src.subarray(offset, offset + 4), offset);
      else bilateralAt(src, size, x, y, filter, out);
    }
  }
  return out;
}

/**
 * The dark channel (darkest of red, green, blue), the haze estimate dehaze blurs.
 * @param src the image, RGBA 0–1
 * @returns the dark channel as a grey image, with the image's alpha
 */
function darkChannel(src: Float32Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let offset = 0; offset < src.length; offset += 4) {
    const darkest = Math.min(src[offset] ?? 0, src[offset + 1] ?? 0, src[offset + 2] ?? 0);
    out[offset] = darkest;
    out[offset + 1] = darkest;
    out[offset + 2] = darkest;
    out[offset + 3] = src[offset + 3] ?? 0;
  }
  return out;
}

/**
 * One channel of dehaze: positive removes haze, negative adds it.
 * @param channel the colour channel, 0–1
 * @param haze the blurred dark channel there
 * @param strength the setting as a fraction, -1 to 1
 * @returns the new channel
 */
export function dehazeAt(channel: number, haze: number, strength: number): number {
  if (strength > 0) return (channel - 1) / Math.max(1 - strength * 0.95 * haze, 0.1) + 1;
  return channel + -strength * 0.4 * (0.9 - channel);
}

/**
 * Dehaze over an image, in place.
 * @param image the image, RGBA 0–1
 * @param size its width and height
 * @param size.width pixels
 * @param size.height pixels
 * @param amount the setting, -100 to 100
 * @param scale the frame width over DETAIL_WIDTH
 */
function dehazeImage(image: Float32Array, size: { width: number; height: number }, amount: number, scale: number): void {
  const haze = blurImage(darkChannel(image), size.width, size.height, gaussKernel(HAZE_SIGMA * scale));
  const strength = amount / 100;
  for (let offset = 0; offset < image.length; offset += 4) {
    if ((image[offset + 3] ?? 0) > 0) {
      for (let channel = 0; channel < 3; channel++) image[offset + channel] = dehazeAt(image[offset + channel] ?? 0, haze[offset] ?? 0, strength);
    }
  }
}

/**
 * Clarity over an image, in place: local contrast against a wide blur, strongest in the mid tones.
 * @param image the image, RGBA 0–1
 * @param size its width and height
 * @param size.width pixels
 * @param size.height pixels
 * @param amount the setting, -100 to 100
 * @param scale the frame width over DETAIL_WIDTH
 */
function clarityImage(image: Float32Array, size: { width: number; height: number }, amount: number, scale: number): void {
  const blur = blurImage(image, size.width, size.height, gaussKernel(CLARITY_SIGMA * scale));
  const strength = (amount / 100) * 0.7;
  for (let offset = 0; offset < image.length; offset += 4) {
    if (image[offset + 3] === 0) continue;
    const midTones = 1 - (2 * lumaAt(image, offset) - 1) ** 2;
    for (let channel = 0; channel < 3; channel++) {
      const value = image[offset + channel] ?? 0;
      image[offset + channel] = value + (value - (blur[offset + channel] ?? 0)) * strength * midTones;
    }
  }
}

/**
 * Sharpening over an image, in place: an unsharp mask, held back where the detail is below the edge mask.
 * @param image the image, RGBA 0–1
 * @param size its width and height
 * @param size.width pixels
 * @param size.height pixels
 * @param adjust the sharpening settings
 * @param scale the frame width over DETAIL_WIDTH
 */
function sharpenImage(image: Float32Array, size: { width: number; height: number }, adjust: Pick<Adjustments, 'sharpen' | 'sharpenRadius' | 'sharpenMask'>, scale: number): void {
  const blur = blurImage(image, size.width, size.height, gaussKernel(adjust.sharpenRadius * scale));
  const amount = (adjust.sharpen / 100) * 1.5;
  const threshold = (adjust.sharpenMask / 100) * 0.08;
  for (let offset = 0; offset < image.length; offset += 4) {
    if (image[offset + 3] === 0) continue;
    const red = image[offset] ?? 0;
    const green = image[offset + 1] ?? 0;
    const blue = image[offset + 2] ?? 0;
    const detailRed = red - (blur[offset] ?? 0);
    const detailGreen = green - (blur[offset + 1] ?? 0);
    const detailBlue = blue - (blur[offset + 2] ?? 0);
    const edge = Math.abs(LUMA_RED * detailRed + LUMA_GREEN * detailGreen + LUMA_BLUE * detailBlue);
    const masked = threshold > 0 ? Math.min(1, Math.max(0, (edge - threshold) / (threshold + 0.01))) : 1;
    const strength = amount * masked * masked * (3 - 2 * masked);
    image[offset] = red + detailRed * strength;
    image[offset + 1] = green + detailGreen * strength;
    image[offset + 2] = blue + detailBlue * strength;
  }
}

/**
 * Grain over an image, in place.
 * @param image the image, RGBA 0–1
 * @param size its width and height
 * @param size.width pixels
 * @param size.height pixels
 * @param amount the setting, 0–100
 * @param scale the frame width over DETAIL_WIDTH
 */
function grainImage(image: Float32Array, size: { width: number; height: number }, amount: number, scale: number): void {
  const strength = (amount / 100) * 0.12;
  const cell = GRAIN_CELL * scale;
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const offset = (y * size.width + x) * 4;
      if (image[offset + 3] === 0) continue;
      const noise = (grainAt((x + 0.5) / cell, (y + 0.5) / cell) - 0.5) * strength;
      image[offset] = (image[offset] ?? 0) + noise;
      image[offset + 1] = (image[offset + 1] ?? 0) + noise;
      image[offset + 2] = (image[offset + 2] ?? 0) + noise;
    }
  }
}

/**
 * Runs the detail settings over a straight-alpha RGBA image, rounded once at the end.
 * @param pixels the image, 0–255, written in place
 * @param width pixels
 * @param height pixels
 * @param adjust the settings
 * @param scale the frame width over DETAIL_WIDTH
 */
export function detailPixels(pixels: Uint8ClampedArray, width: number, height: number, adjust: Adjustments, scale: number): void {
  if (detailNeutral(adjust)) return;
  const size = { width, height };
  let image: Float32Array = new Float32Array(pixels.length);
  for (let index = 0; index < pixels.length; index++) image[index] = (pixels[index] ?? 0) / 255;
  if (adjust.noise > 0) image = denoise(image, width, height, adjust.noise, scale);
  if (adjust.dehaze) dehazeImage(image, size, adjust.dehaze, scale);
  if (adjust.clarity) clarityImage(image, size, adjust.clarity, scale);
  if (adjust.sharpen > 0) sharpenImage(image, size, adjust, scale);
  if (adjust.grain > 0) grainImage(image, size, adjust.grain, scale);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = (image[offset] ?? 0) * 255;
    pixels[offset + 1] = (image[offset + 1] ?? 0) * 255;
    pixels[offset + 2] = (image[offset + 2] ?? 0) * 255;
  }
}
