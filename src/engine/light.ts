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

/**
 * sRGB to linear light, the exact piecewise curve.
 * @param value sRGB, 0–1
 * @returns linear light
 */
export const toLinear = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/**
 * Linear light to sRGB.
 * @param value linear light
 * @returns sRGB, 0–1 (not clamped above)
 */
export const toSrgb = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055);

/*
 * Fast versions for the per-pixel loop: lookup tables with linear interpolation, far cheaper than pow() and well inside
 * half an 8-bit level. Linear to sRGB is indexed by the square root, which spreads the steps into the dark tones where
 * that curve is steepest. Values outside the tables use the exact functions.
 */

/** The lookup tables' steps. */
export const STEPS = 4096;
const LINEAR_TABLE = new Float64Array(STEPS + 2);
const SRGB_TABLE = new Float64Array(STEPS + 2);
let built = false;

/** Fills the tables on first use (not at import, so loading the module stays free). */
export function tables(): void {
  if (built) return;
  for (let index = 0; index <= STEPS + 1; index++) {
    const share = Math.min(1, index / STEPS);
    LINEAR_TABLE[index] = toLinear(share);
    SRGB_TABLE[index] = toSrgb(share * share);
  }
  built = true;
}

/**
 * toLinear() of an sRGB value in 0–255, clamped to that range first. Callers fill the tables first (tables()).
 * @param value sRGB, 0–255
 * @returns linear light, 0–1
 */
export function linFast(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 1; // the look may overshoot; like the GPU, light starts from the clamped value
  // Read inline (no helper): this runs three times per pixel.
  const position = (value / 255) * STEPS;
  const index = position | 0;
  const below = LINEAR_TABLE[index] ?? 0;
  return below + ((LINEAR_TABLE[index + 1] ?? 0) - below) * (position - index);
}

/**
 * toSrgb() of a linear value. Callers fill the tables first (tables()).
 * @param value linear light
 * @returns sRGB, 0–1 (not clamped above)
 */
export function srgbFast(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return toSrgb(value);
  // Read inline (no helper): this runs three times per pixel.
  const position = Math.sqrt(value) * STEPS;
  const index = position | 0;
  const below = SRGB_TABLE[index] ?? 0;
  return below + ((SRGB_TABLE[index + 1] ?? 0) - below) * (position - index);
}

/** Rec. 709 weights: how bright each linear channel looks. */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * Stops per full slider: temperature ±100 moves red and blue 0.75 stop each way (1.5 stops between them, enough for
 * tungsten light), tint ±100 moves green 0.6 stop.
 */
const TEMP_STOPS = 0.75;
const TINT_STOPS = 0.6;

/** A gain per channel: red, green, blue. */
export type Gains = readonly [number, number, number];

/**
 * Channel gains for a white balance, scaled so a grey keeps its brightness. Warmer (temperature > 0) raises red and
 * lowers blue; magenta (tint > 0) lowers green and raises red and blue half as much.
 * @param temperature -100 to 100
 * @param tint -100 to 100
 * @returns the gains
 */
export function wbGains(temperature: number, tint: number): [number, number, number] {
  const warmth = Math.max(-1, Math.min(1, temperature / 100)) * TEMP_STOPS;
  const magenta = Math.max(-1, Math.min(1, tint / 100)) * TINT_STOPS;
  const red = 2 ** (warmth + magenta / 2);
  const green = 2 ** -magenta;
  const blue = 2 ** (-warmth + magenta / 2);
  const brightness = LUMA[0] * red + LUMA[1] * green + LUMA[2] * blue;
  return [red / brightness, green / brightness, blue / brightness];
}

/**
 * The temperature and tint that make a sampled colour neutral grey: the eyedropper. Solves the gains above in closed
 * form; clamps to the slider ranges.
 * @param red sRGB 0–255, before white balance
 * @param green sRGB 0–255
 * @param blue sRGB 0–255
 * @returns the settings
 */
export function neutralise(red: number, green: number, blue: number): { temperature: number; tint: number } {
  const logRed = Math.log2(Math.max(1e-4, toLinear(red / 255)));
  const logGreen = Math.log2(Math.max(1e-4, toLinear(green / 255)));
  const logBlue = Math.log2(Math.max(1e-4, toLinear(blue / 255)));
  // With t and m the temperature and tint in stops: red and blue level when lr + t + m/2 = lb - t + m/2, and green
  // meets them when lg - m = (lr + lb)/2 + m/2.
  const warmth = (logBlue - logRed) / 2;
  const magenta = (logGreen - (logRed + logBlue) / 2) / 1.5;
  const slider = (value: number) => Math.round(Math.max(-100, Math.min(100, value)));
  return { temperature: slider((warmth / TEMP_STOPS) * 100), tint: slider((magenta / TINT_STOPS) * 100) };
}

/**
 * Smoothstep between two edges.
 * @param from where it starts rising
 * @param to where it reaches 1
 * @param value the value
 * @returns 0–1
 */
const smooth = (from: number, to: number, value: number): number => {
  const along = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return along * along * (3 - 2 * along);
};

/**
 * The tone change for a pixel: each slider moves its own range, shadows and highlights broadly, blacks and whites only
 * near the ends.
 * @param brightness the pixel's perceptual brightness, 0–1 (sRGB-encoded luma)
 * @param adjust the tone sliders
 * @returns the new brightness
 */
export function toneAt(brightness: number, adjust: Pick<Adjustments, 'highlights' | 'shadows' | 'whites' | 'blacks'>): number {
  const highlights = smooth(0.25, 1, brightness);
  const shadows = 1 - smooth(0, 0.75, brightness);
  const whites = smooth(0.6, 1, brightness);
  const blacks = 1 - smooth(0, 0.4, brightness);
  const change =
    (adjust.highlights / 100) * 0.3 * highlights * (1 - brightness * 0.5) +
    (adjust.shadows / 100) * 0.3 * shadows * (0.5 + brightness) +
    (adjust.whites / 100) * 0.2 * whites +
    (adjust.blacks / 100) * 0.2 * blacks;
  return Math.max(0, brightness + change);
}

/**
 * Whether the light settings change nothing.
 * @param adjust the settings
 * @returns true when exposure, tone and white balance are all 0
 */
export const lightNeutral = (adjust: Adjustments): boolean =>
  !adjust.exposure && !adjust.highlights && !adjust.shadows && !adjust.whites && !adjust.blacks && !adjust.temperature && !adjust.tint;

/**
 * One pixel through light and white balance: the channel gains (wbGains() times 2^exposure, computed once per
 * picture) in linear light, then the tone sliders on its brightness, scaling the three channels together so the hue
 * stays. Callers fill the lookup tables first (tables()).
 * @param red sRGB 0–255
 * @param green sRGB 0–255
 * @param blue sRGB 0–255
 * @param gains the channel gains
 * @param adjust the settings
 * @param out where the pixel is written, sRGB 0–255 (not rounded)
 */
export function lightInto(red: number, green: number, blue: number, gains: Gains, adjust: Adjustments, out: number[]): void {
  let linearRed = linFast(red) * gains[0];
  let linearGreen = linFast(green) * gains[1];
  let linearBlue = linFast(blue) * gains[2];
  if (adjust.highlights || adjust.shadows || adjust.whites || adjust.blacks) {
    const brightness = LUMA[0] * linearRed + LUMA[1] * linearGreen + LUMA[2] * linearBlue;
    if (brightness > 1e-6) {
      const scale = linFast(toneAt(srgbFast(brightness), adjust) * 255) / brightness;
      linearRed *= scale;
      linearGreen *= scale;
      linearBlue *= scale;
    }
  }
  out[0] = srgbFast(linearRed) * 255;
  out[1] = srgbFast(linearGreen) * 255;
  out[2] = srgbFast(linearBlue) * 255;
}

/**
 * lightInto() for a single pixel, the exposure given in stops: for tests and single pixels.
 * @param red sRGB 0–255
 * @param green sRGB 0–255
 * @param blue sRGB 0–255
 * @param gains the white balance's gains
 * @param exposure stops
 * @param adjust the settings
 * @returns the pixel, sRGB 0–255
 */
export function lightPixel(red: number, green: number, blue: number, gains: Gains, exposure: number, adjust: Adjustments): [number, number, number] {
  const out = [0, 0, 0];
  const exposureGain = 2 ** exposure;
  tables();
  lightInto(red, green, blue, [gains[0] * exposureGain, gains[1] * exposureGain, gains[2] * exposureGain], adjust, out);
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
}

/**
 * The tone sliders as a table: new linear brightness for each linear brightness, indexed by its square root.
 * @param adjust the settings
 * @returns STEPS + 2 values
 */
export function toneTable(adjust: Adjustments): Float64Array {
  const table = new Float64Array(STEPS + 2);
  for (let index = 0; index <= STEPS + 1; index++) {
    const share = Math.min(1, index / STEPS);
    table[index] = toLinear(toneAt(toSrgb(share * share), adjust));
  }
  return table;
}
