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

export type DetailKey = 'noise' | 'dehaze' | 'clarity' | 'sharpen' | 'sharpenRadius' | 'sharpenMask' | 'grain';

/** True when no detail setting changes anything. */
export const detailNeutral = (a: Adjustments): boolean => !a.noise && !a.dehaze && !a.clarity && !a.sharpen && !a.grain;

/** Frame width the sizes below are given for. */
export const DETAIL_WIDTH = 1080;
/** Gaussian blur sizes (sigma, px at 1080 wide): the large ones for clarity and the dehaze haze map. */
export const CLARITY_SIGMA = 12,
  HAZE_SIGMA = 20;
/** At most this many taps either side of a blur; wider blurs take every k-th pixel instead. */
export const MAX_TAPS = 16;

export interface Kernel {
  /** Distance in pixels between taps. */
  step: number;
  /** Weights for taps -n … n, summing to 1. */
  weights: number[];
}

/** A Gaussian blur of the given sigma (px), as taps every `step` px, at most MAX_TAPS either side. */
export function gaussKernel(sigma: number): Kernel {
  const s = Math.max(0.3, sigma),
    step = Math.max(1, Math.ceil((3 * s) / MAX_TAPS)),
    n = Math.max(1, Math.ceil((3 * s) / step)),
    raw = Array.from({ length: 2 * n + 1 }, (_, i) => Math.exp(-(((i - n) * step) ** 2) / (2 * s * s))),
    sum = raw.reduce((a, b) => a + b, 0);
  return { step, weights: raw.map((w) => w / sum) };
}

/** Grain cell size (px at 1080 wide) and the integer hash both paths use for it. */
export const GRAIN_CELL = 1.6;
export function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in 0–1 at a point measured in grain cells. */
export function grainAt(gx: number, gy: number): number {
  const ix = Math.floor(gx),
    iy = Math.floor(gy),
    fx = gx - ix,
    fy = gy - iy,
    sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy) + (hash2(ix + 1, iy) - hash2(ix, iy)) * sx,
    b = hash2(ix, iy + 1) + (hash2(ix + 1, iy + 1) - hash2(ix, iy + 1)) * sx;
  return a + (b - a) * sy;
}

const LR = 0.299,
  LG = 0.587,
  LB = 0.114;
const clampI = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);

/**
 * Separable alpha-weighted blur of a straight-alpha image (W×H×4, 0–1). Returns straight colour with the blurred alpha.
 * Edges repeat the border pixel, as a GPU sampler set to clamp does.
 */
export function blurImage(src: Float32Array, W: number, H: number, k: Kernel): Float32Array {
  const n = (k.weights.length - 1) / 2,
    mid = new Float32Array(src.length),
    out = new Float32Array(src.length);
  // Horizontal: premultiplied sums.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let t = -n; t <= n; t++) {
        const j = (y * W + clampI(x + t * k.step, W - 1)) * 4,
          w = k.weights[t + n] * src[j + 3];
        r += w * src[j];
        g += w * src[j + 1];
        b += w * src[j + 2];
        a += w;
      }
      const i = (y * W + x) * 4;
      mid[i] = r;
      mid[i + 1] = g;
      mid[i + 2] = b;
      mid[i + 3] = a;
    }
  // Vertical, then back to straight colour.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let t = -n; t <= n; t++) {
        const j = (clampI(y + t * k.step, H - 1) * W + x) * 4,
          w = k.weights[t + n];
        r += w * mid[j];
        g += w * mid[j + 1];
        b += w * mid[j + 2];
        a += w * mid[j + 3];
      }
      const i = (y * W + x) * 4;
      out[i] = a > 0 ? r / a : 0;
      out[i + 1] = a > 0 ? g / a : 0;
      out[i + 2] = a > 0 ? b / a : 0;
      out[i + 3] = a;
    }
  return out;
}

/** Noise reduction: a 5×5 edge-preserving (bilateral) filter, taps `step` px apart. */
export const NOISE_SIGMA_S = 1.5;
export function noiseParams(amount: number, scale: number) {
  const step = Math.max(1, Math.round(scale));
  return { step, sigmaR: (amount / 100) * 0.12, spatial: 1 / (2 * ((NOISE_SIGMA_S * scale) / step) ** 2) };
}
function denoise(src: Float32Array, W: number, H: number, amount: number, scale: number): Float32Array {
  const { step, sigmaR, spatial } = noiseParams(amount, scale),
    range = 1 / (2 * sigmaR * sigmaR),
    out = new Float32Array(src.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (src[i + 3] === 0) {
        out.set(src.subarray(i, i + 4), i);
        continue;
      }
      const l0 = LR * src[i] + LG * src[i + 1] + LB * src[i + 2];
      let r = 0,
        g = 0,
        b = 0,
        s = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const j = (clampI(y + dy * step, H - 1) * W + clampI(x + dx * step, W - 1)) * 4,
            dl = LR * src[j] + LG * src[j + 1] + LB * src[j + 2] - l0,
            w = Math.exp(-(dx * dx + dy * dy) * spatial - dl * dl * range) * src[j + 3];
          r += w * src[j];
          g += w * src[j + 1];
          b += w * src[j + 2];
          s += w;
        }
      out[i] = r / s;
      out[i + 1] = g / s;
      out[i + 2] = b / s;
      out[i + 3] = src[i + 3];
    }
  return out;
}

/** The dark channel (darkest of red, green, blue), the haze estimate dehaze blurs. */
function darkChannel(src: Float32Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const d = Math.min(src[i], src[i + 1], src[i + 2]);
    out[i] = out[i + 1] = out[i + 2] = d;
    out[i + 3] = src[i + 3];
  }
  return out;
}

/** One pixel of dehaze, from its colour and the blurred dark channel h: positive removes haze, negative adds it. */
export function dehazeAt(c: number, h: number, k: number): number {
  if (k > 0) return (c - 1) / Math.max(1 - k * 0.95 * h, 0.1) + 1;
  return c + -k * 0.4 * (0.9 - c);
}

/**
 * Runs the detail settings over a straight-alpha RGBA image (0–255 in, 0–255 out, rounded once at the end). scale is
 * the frame width over DETAIL_WIDTH.
 */
export function detailPixels(px: Uint8ClampedArray, W: number, H: number, a: Adjustments, scale: number): void {
  if (detailNeutral(a)) return;
  let img: Float32Array = new Float32Array(px.length);
  for (let i = 0; i < px.length; i++) img[i] = px[i] / 255;

  if (a.noise > 0) img = denoise(img, W, H, a.noise, scale);
  if (a.dehaze) {
    const haze = blurImage(darkChannel(img), W, H, gaussKernel(HAZE_SIGMA * scale)),
      k = a.dehaze / 100;
    for (let i = 0; i < img.length; i += 4)
      if (img[i + 3] > 0) for (let c = 0; c < 3; c++) img[i + c] = dehazeAt(img[i + c], haze[i], k);
  }
  if (a.clarity) {
    const blur = blurImage(img, W, H, gaussKernel(CLARITY_SIGMA * scale)),
      k = (a.clarity / 100) * 0.7;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] === 0) continue;
      const l = LR * img[i] + LG * img[i + 1] + LB * img[i + 2],
        w = 1 - (2 * l - 1) ** 2;
      for (let c = 0; c < 3; c++) img[i + c] += (img[i + c] - blur[i + c]) * k * w;
    }
  }
  if (a.sharpen > 0) {
    const blur = blurImage(img, W, H, gaussKernel(a.sharpenRadius * scale)),
      amt = (a.sharpen / 100) * 1.5,
      th = (a.sharpenMask / 100) * 0.08;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] === 0) continue;
      const dr = img[i] - blur[i],
        dg = img[i + 1] - blur[i + 1],
        db = img[i + 2] - blur[i + 2],
        e = Math.abs(LR * dr + LG * dg + LB * db),
        t = th > 0 ? Math.min(1, Math.max(0, (e - th) / (th + 0.01))) : 1,
        m = amt * t * t * (3 - 2 * t);
      img[i] += dr * m;
      img[i + 1] += dg * m;
      img[i + 2] += db * m;
    }
  }
  if (a.grain > 0) {
    const amt = (a.grain / 100) * 0.12,
      cell = GRAIN_CELL * scale;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (img[i + 3] === 0) continue;
        const n = (grainAt((x + 0.5) / cell, (y + 0.5) / cell) - 0.5) * amt;
        img[i] += n;
        img[i + 1] += n;
        img[i + 2] += n;
      }
  }
  for (let i = 0; i < px.length; i += 4) {
    px[i] = img[i] * 255;
    px[i + 1] = img[i + 1] * 255;
    px[i + 2] = img[i + 2] * 255;
  }
}
