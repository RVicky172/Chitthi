import type { Adjustments } from './adjust';

/*
 * Light and white balance (specs/vision/editor-implementation.md, P1.1): temperature and tint, exposure, then
 * highlights, shadows, whites and blacks. Unlike the looks and the older sliders (kept in 0–255 sRGB maths so their
 * output never changes), these work in linear light, the way a camera's sensor counts it, so exposure behaves like
 * opening the aperture and white balance like changing the light.
 *
 * This file is the reference: lightPixel() is what the unit tests check, and chain.ts chainPixels() runs the same maths
 * per pixel on the Canvas 2D path. The GPU program (gpu/colour.ts LIGHT_PROGRAM) mirrors it line for line and the
 * self-test compares the two.
 */

/** sRGB (0–1) to linear light, the exact piecewise curve. */
export const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** Linear light to sRGB (0–1, not clamped above). */
export const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);

/*
 * Fast versions for the per-pixel loop: lookup tables with linear interpolation, far cheaper than pow() and well inside
 * half an 8-bit level. Linear to sRGB is indexed by the square root, which spreads the steps into the dark tones where
 * that curve is steepest. Values outside the tables use the exact functions.
 */
export const STEPS = 4096;
const LIN = new Float64Array(STEPS + 2),
  SRGB = new Float64Array(STEPS + 2);
let built = false;
/** Fills the tables on first use (not at import, so loading the module stays free). */
export function tables(): void {
  if (built) return;
  for (let i = 0; i <= STEPS + 1; i++) {
    const u = Math.min(1, i / STEPS);
    LIN[i] = toLinear(u);
    SRGB[i] = toSrgb(u * u);
  }
  built = true;
}
/** toLinear() of an sRGB value given in 0–255, clamped to that range first. */
export function linFast(v: number): number {
  const t = LIN;
  if (v <= 0) return 0;
  if (v >= 255) return 1; // the look may overshoot; like the GPU, light starts from the clamped value
  const x = (v / 255) * STEPS,
    i = x | 0;
  return t[i] + (t[i + 1] - t[i]) * (x - i);
}
/** toSrgb() of a linear value, in 0–1 (not clamped above). */
export function srgbFast(v: number): number {
  const t = SRGB;
  if (v <= 0) return 0;
  if (v >= 1) return toSrgb(v);
  const x = Math.sqrt(v) * STEPS,
    i = x | 0;
  return t[i] + (t[i + 1] - t[i]) * (x - i);
}

/** Rec. 709 weights: how bright each linear channel looks. */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * Stops per full slider: temperature ±100 moves red and blue 0.75 stop each way (1.5 stops between them, enough for
 * tungsten light), tint ±100 moves green 0.6 stop.
 */
const TEMP_STOPS = 0.75,
  TINT_STOPS = 0.6;

/**
 * Channel gains for a white balance, scaled so a grey keeps its brightness. Warmer (temperature > 0) raises red and
 * lowers blue; magenta (tint > 0) lowers green and raises red and blue half as much.
 */
export function wbGains(temperature: number, tint: number): [number, number, number] {
  const t = Math.max(-1, Math.min(1, temperature / 100)) * TEMP_STOPS,
    g = Math.max(-1, Math.min(1, tint / 100)) * TINT_STOPS;
  const r = 2 ** (t + g / 2),
    gr = 2 ** -g,
    b = 2 ** (-t + g / 2);
  const k = LUMA[0] * r + LUMA[1] * gr + LUMA[2] * b;
  return [r / k, gr / k, b / k];
}

/**
 * The temperature and tint that make a sampled colour (sRGB 0–255, before white balance) neutral grey: the eyedropper.
 * Solves the gains above in closed form; clamps to the slider ranges.
 */
export function neutralise(r: number, g: number, b: number): { temperature: number; tint: number } {
  const lr = Math.log2(Math.max(1e-4, toLinear(r / 255))),
    lg = Math.log2(Math.max(1e-4, toLinear(g / 255))),
    lb = Math.log2(Math.max(1e-4, toLinear(b / 255)));
  // With t and m the temperature and tint in stops: red and blue level when lr + t + m/2 = lb - t + m/2, and green
  // meets them when lg - m = (lr + lb)/2 + m/2.
  const t = (lb - lr) / 2,
    m = (lg - (lr + lb) / 2) / 1.5;
  const c = (v: number) => Math.round(Math.max(-100, Math.min(100, v)));
  return { temperature: c((t / TEMP_STOPS) * 100), tint: c((m / TINT_STOPS) * 100) };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The tone change for a pixel of perceptual brightness p (0–1, sRGB-encoded luma): each slider moves its own range,
 * shadows and highlights broadly, blacks and whites only near the ends. Returns the new p.
 */
export function toneAt(p: number, a: Pick<Adjustments, 'highlights' | 'shadows' | 'whites' | 'blacks'>): number {
  const hi = smooth(0.25, 1, p),
    sh = 1 - smooth(0, 0.75, p),
    wh = smooth(0.6, 1, p),
    bl = 1 - smooth(0, 0.4, p);
  const d =
    (a.highlights / 100) * 0.3 * hi * (1 - p * 0.5) +
    (a.shadows / 100) * 0.3 * sh * (0.5 + p) +
    (a.whites / 100) * 0.2 * wh +
    (a.blacks / 100) * 0.2 * bl;
  return Math.max(0, p + d);
}

/** True when the light settings change nothing. */
export const lightNeutral = (a: Adjustments): boolean =>
  !a.exposure && !a.highlights && !a.shadows && !a.whites && !a.blacks && !a.temperature && !a.tint;

/**
 * One pixel (sRGB 0–255 in, sRGB 0–255 out, not rounded): white balance and exposure as channel gains (wbGains() times
 * 2^exposure, computed once per picture) in linear light,
 * then the tone sliders on its brightness, scaling the three channels together so the hue stays.
 */
export function lightInto(
  r: number,
  g: number,
  b: number,
  gains: readonly [number, number, number],
  a: Adjustments,
  out: number[],
): void {
  // Callers fill the lookup tables first (tables()).
  let lr = linFast(r) * gains[0],
    lg = linFast(g) * gains[1],
    lb = linFast(b) * gains[2];
  if (a.highlights || a.shadows || a.whites || a.blacks) {
    const y = LUMA[0] * lr + LUMA[1] * lg + LUMA[2] * lb;
    if (y > 1e-6) {
      const k = linFast(toneAt(srgbFast(y), a) * 255) / y;
      lr *= k;
      lg *= k;
      lb *= k;
    }
  }
  out[0] = srgbFast(lr) * 255;
  out[1] = srgbFast(lg) * 255;
  out[2] = srgbFast(lb) * 255;
}

/** lightInto() returning a new array, with the exposure given in stops: for tests and single pixels. */
export function lightPixel(
  r: number,
  g: number,
  b: number,
  gains: readonly [number, number, number],
  exposure: number,
  a: Adjustments,
): [number, number, number] {
  const o = [0, 0, 0],
    ex = 2 ** exposure;
  tables();
  lightInto(r, g, b, [gains[0] * ex, gains[1] * ex, gains[2] * ex], a, o);
  return [o[0], o[1], o[2]];
}

/** New linear brightness for each linear brightness y, indexed by sqrt(y) (0–1), for the tone sliders. */
export function toneTable(a: Adjustments): Float64Array {
  const t = new Float64Array(STEPS + 2);
  for (let i = 0; i <= STEPS + 1; i++) {
    const u = Math.min(1, i / STEPS);
    t[i] = toLinear(toneAt(toSrgb(u * u), a));
  }
  return t;
}
