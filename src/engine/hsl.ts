import { isObjectLike } from './guards';

/*
 * The colour mixer (specs/vision/editor-implementation.md, P1.2): hue, saturation and luminance for eight colour
 * bands, like a camera app's HSL panel. A pixel's adjustment is blended from the two bands its hue falls between, so
 * colours change smoothly and nothing jumps at a band edge. Greys have no hue and are left alone: every change is
 * weighted by how coloured the pixel is. Works on display values (sRGB 0–1), like the tone curve.
 *
 * hslPixel() is the reference for the Canvas 2D path; gpu/colour.ts HSL_PROGRAM mirrors it line for line.
 */

/** The eight colour bands, in hue order. */
export const HSL_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;

/** One colour band. */
export type HslBand = (typeof HSL_BANDS)[number];

/** Each band's centre hue, degrees. */
export const BAND_HUES = [0, 30, 60, 120, 180, 240, 270, 300] as const;

/** The mixer's settings. */
export interface ColourMixer {
  /** Per band, -100 to 100: hue shift (±30° at the ends), saturation, luminance. */
  hue: readonly number[];
  sat: readonly number[];
  lum: readonly number[];
}

const ZERO = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]);

/** The mixer that changes nothing. */
export const FLAT_MIXER: Readonly<ColourMixer> = Object.freeze({ hue: ZERO, sat: ZERO, lum: ZERO });

/**
 * Whether a mixer changes nothing.
 * @param mixer the mixer
 * @returns true when every setting is 0
 */
export const mixerNeutral = (mixer: ColourMixer): boolean => [...mixer.hue, ...mixer.sat, ...mixer.lum].every((value) => value === 0);

/**
 * Eight band settings from outside.
 * @param raw anything
 * @returns eight numbers, -100 to 100 (0 where missing)
 */
const band = (raw: unknown): number[] =>
  Array.from({ length: 8 }, (_, index) => {
    const value: unknown = Array.isArray(raw) ? raw[index] : 0;
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(-100, value)) : 0;
  });

/**
 * The gate for a mixer from outside the running app.
 * @param raw anything
 * @returns a valid mixer
 */
export function mergeMixer(raw: unknown): ColourMixer {
  const fields = isObjectLike(raw) ? raw : {};
  return { hue: band(fields.hue), sat: band(fields.sat), lum: band(fields.lum) };
}

/**
 * The two bands around a hue and how far between them.
 * @param hue degrees, 0–360
 * @returns [band, next band, the eased share of the way to it]
 */
export function bandsAt(hue: number): [number, number, number] {
  let lower = 7;
  for (let index = 0; index < 7; index++) {
    if (hue < (BAND_HUES[index + 1] ?? 360)) {
      lower = index;
      break;
    }
  }
  const from = BAND_HUES[lower] ?? 0;
  const to = lower === 7 ? 360 : (BAND_HUES[lower + 1] ?? 360);
  const along = Math.min(1, Math.max(0, (hue - from) / (to - from)));
  return [lower, (lower + 1) % 8, along * along * (3 - 2 * along)];
}

/**
 * One channel of an HSL colour (the standard conversion).
 * @param low the lower bound
 * @param high the upper bound
 * @param hue the channel's hue, a share of the circle (wrapped once)
 * @returns the channel, 0–1
 */
const hueToChannel = (low: number, high: number, hue: number): number => {
  let turn = hue;
  if (turn < 0) turn += 1;
  if (turn > 1) turn -= 1;
  if (turn < 1 / 6) return low + (high - low) * 6 * turn;
  if (turn < 1 / 2) return high;
  if (turn < 2 / 3) return low + (high - low) * (2 / 3 - turn) * 6;
  return low;
};

/**
 * A colour's hue.
 * @param red 0–1
 * @param green 0–1
 * @param blue 0–1
 * @param highest the largest channel
 * @param range the largest less the smallest (more than 0)
 * @returns degrees, 0–360
 */
function hueOf(red: number, green: number, blue: number, highest: number, range: number): number {
  if (highest === red) return ((green - blue) / range + (green < blue ? 6 : 0)) * 60;
  if (highest === green) return ((blue - red) / range + 2) * 60;
  return ((red - green) / range + 4) * 60;
}

/**
 * One pixel through the mixer, in display values 0–1.
 * @param red 0–1
 * @param green 0–1
 * @param blue 0–1
 * @param settings the mixer as fractions (-1 to 1): hue, saturation, luminance, eight each (mixerParams)
 * @param out where the pixel is written, [red, green, blue]
 */
export function hslPixel(red: number, green: number, blue: number, settings: Float32Array | readonly number[], out: number[]): void {
  const highest = Math.max(red, green, blue);
  const lowest = Math.min(red, green, blue);
  const range = highest - lowest;
  const lightness = (highest + lowest) / 2;
  if (range <= 1e-6) {
    out[0] = red;
    out[1] = green;
    out[2] = blue;
    return;
  }
  const saturation = range / (1 - Math.abs(2 * lightness - 1));
  const hue = hueOf(red, green, blue, highest, range);
  const [lower, upper, along] = bandsAt(hue);
  const blended = (offset: number) => (settings[offset + lower] ?? 0) * (1 - along) + (settings[offset + upper] ?? 0) * along;
  const hueShift = blended(0);
  const saturationShift = blended(8);
  const lightnessShift = blended(16);
  const newHue = ((((hue + hueShift * 30) % 360) + 360) % 360) / 360;
  const newSaturation = Math.min(1, Math.max(0, saturation * (1 + saturationShift)));
  const newLightness = Math.min(1, Math.max(0, lightness + lightnessShift * 0.25 * saturation * (1 - Math.abs(2 * lightness - 1))));
  const high = newLightness < 0.5 ? newLightness * (1 + newSaturation) : newLightness + newSaturation - newLightness * newSaturation;
  const low = 2 * newLightness - high;
  out[0] = hueToChannel(low, high, newHue + 1 / 3);
  out[1] = hueToChannel(low, high, newHue);
  out[2] = hueToChannel(low, high, newHue - 1 / 3);
}

/**
 * The mixer as 24 fractions: hue, saturation, luminance for the eight bands. For hslPixel() and the GPU.
 * @param mixer the mixer
 * @returns the fractions
 */
export function mixerParams(mixer: ColourMixer): Float32Array {
  return new Float32Array([...mixer.hue, ...mixer.sat, ...mixer.lum].map((value) => value / 100));
}
