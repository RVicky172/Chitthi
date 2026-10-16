import { lutNeutral, type Adjustments } from './adjust';
import { curveNeutral, curveTable, readTable } from './curve';
import { hslPixel, mixerNeutral, mixerParams } from './hsl';
import { LUMA, lightNeutral, linFast, srgbFast, STEPS, tables, toLinear, toneAt, toneTable, toSrgb, wbGains } from './light';
import { lutById, lutPixel, lutScale, type Lut, type LutScale } from './lut';
import { lookPixel } from './photo';

/*
 * The colour chain on the Canvas 2D path: look → light and white balance → tone curve → colour mixer → LUT, per pixel,
 * with one rounding to 8 bits at the end. Light can lift dark tones and curves can be steep, so rounding between the
 * steps would magnify small differences; the GPU programs (gpu/colour.ts) skip it too, and the self-test compares the
 * two. Each step runs only when it changes something. The older sliders (brightness, contrast, saturation, warmth)
 * follow in instagram.ts adjustPixels(), as before.
 */

/**
 * Whether only the look (or nothing) is set, so the plain lookPixels() loop will do.
 * @param adjust the settings
 * @returns true when light, curves, mixer and LUT change nothing
 */
export const chainNeutral = (adjust: Adjustments): boolean =>
  lightNeutral(adjust) && curveNeutral(adjust.curve) && mixerNeutral(adjust.mixer) && lutNeutral(adjust);

/** What the chain needs for a picture, worked out once: the steps to run and their tables. */
interface ChainSetup {
  adjust: Adjustments;
  look: boolean;
  light: boolean;
  /** White balance times exposure, per channel (three fields, not a tuple: read for every pixel). */
  gainRed: number;
  gainGreen: number;
  gainBlue: number;
  /**
   * The tone sliders depend only on a pixel's brightness, so their effect is one table per picture: linear brightness
   * (indexed by its square root) to the new linear brightness.
   */
  tone: Float64Array | null;
  curve: Float32Array | null;
  mixer: Float32Array | null;
  lut: { table: Lut; mapping: LutScale; amount: number } | null;
  /** Any step after light runs (curve, mixer or LUT). */
  later: boolean;
}

/**
 * The chain's steps and tables for a picture.
 * @param adjust the settings
 * @returns the setup
 */
function chainSetup(adjust: Adjustments): ChainSetup {
  const exposure = 2 ** adjust.exposure;
  const balance = wbGains(adjust.temperature, adjust.tint);
  const table = lutNeutral(adjust) ? undefined : lutById(adjust.lut);
  const curve = curveNeutral(adjust.curve) ? null : curveTable(adjust.curve);
  const mixer = mixerNeutral(adjust.mixer) ? null : mixerParams(adjust.mixer);
  return {
    adjust,
    look: adjust.look !== 'none',
    light: !lightNeutral(adjust),
    gainRed: balance[0] * exposure,
    gainGreen: balance[1] * exposure,
    gainBlue: balance[2] * exposure,
    tone: adjust.highlights || adjust.shadows || adjust.whites || adjust.blacks ? toneTable(adjust) : null,
    curve,
    mixer,
    lut: table ? { table, mapping: lutScale(table), amount: adjust.lutAmount / 100 } : null,
    later: !!curve || !!mixer || !!table,
  };
}

/**
 * The value clamped to 0–1.
 * @param value any number
 * @returns 0–1
 */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The steps after light, on a pixel in display values: curve, mixer and LUT, then the pixel written back. The colour
 * travels as numbers, not an array: this runs for every pixel.
 * @param pixels the picture, RGBA
 * @param index the pixel's first byte
 * @param setup the chain's setup
 * @param colour the pixel, display values 0–1 (red, green, blue)
 * @param colour.red red
 * @param colour.green green
 * @param colour.blue blue
 * @param work a scratch triple for the steps' output
 */
function finishPixel(pixels: Uint8ClampedArray, index: number, setup: ChainSetup, colour: { red: number; green: number; blue: number }, work: number[]): void {
  let { red, green, blue } = colour;
  if (setup.curve) {
    red = readTable(setup.curve, 0, red);
    green = readTable(setup.curve, 1, green);
    blue = readTable(setup.curve, 2, blue);
  }
  if (setup.mixer) {
    hslPixel(clamp01(red), clamp01(green), clamp01(blue), setup.mixer, work);
    red = work[0] ?? 0;
    green = work[1] ?? 0;
    blue = work[2] ?? 0;
  }
  if (setup.lut) {
    // Every earlier step leaves 0–1 on the GPU (its programs clamp as they write), so the LUT and its mix start from
    // there too; output outside 0–1 is kept until the final clamp.
    const { table, mapping, amount } = setup.lut;
    red = clamp01(red);
    green = clamp01(green);
    blue = clamp01(blue);
    lutPixel(table, red, green, blue, work, mapping);
    red += ((work[0] ?? 0) - red) * amount;
    green += ((work[1] ?? 0) - green) * amount;
    blue += ((work[2] ?? 0) - blue) * amount;
  }
  pixels[index] = red * 255;
  pixels[index + 1] = green * 255;
  pixels[index + 2] = blue * 255;
}

/** Reused for every pixel, so finishPixel's colour costs no allocation. */
const display = { red: 0, green: 0, blue: 0 };

/**
 * Light and white balance on a pixel: the gains in linear light, then the tone sliders on its brightness, scaling the
 * channels together so the hue stays. Kept in one function with the pixel's other light work: split further, the
 * per-pixel calls cost the Canvas 2D path 10–15 % (measured in 407 T035).
 * @param setup the chain's setup
 * @param red sRGB 0–255
 * @param green sRGB 0–255
 * @param blue sRGB 0–255
 */
function lightInto(setup: ChainSetup, red: number, green: number, blue: number): void {
  let linearRed = linFast(red) * setup.gainRed;
  let linearGreen = linFast(green) * setup.gainGreen;
  let linearBlue = linFast(blue) * setup.gainBlue;
  const tone = setup.tone;
  const brightness = LUMA[0] * linearRed + LUMA[1] * linearGreen + LUMA[2] * linearBlue;
  if (tone && brightness > 1e-6) {
    let toned: number;
    if (brightness < 1) {
      const position = Math.sqrt(brightness) * STEPS;
      const index = position | 0;
      const below = tone[index] ?? 0;
      toned = below + ((tone[index + 1] ?? 0) - below) * (position - index);
    } else toned = toLinear(toneAt(toSrgb(brightness), setup.adjust));
    const scale = toned / brightness;
    linearRed *= scale;
    linearGreen *= scale;
    linearBlue *= scale;
  }
  display.red = srgbFast(linearRed);
  display.green = srgbFast(linearGreen);
  display.blue = srgbFast(linearBlue);
}

/**
 * One pixel through the chain.
 * @param pixels the picture, RGBA, written in place
 * @param index the pixel's first byte
 * @param setup the chain's setup
 * @param work a scratch triple for each step's output
 */
function chainPixel(pixels: Uint8ClampedArray, index: number, setup: ChainSetup, work: number[]): void {
  let red = pixels[index] ?? 0;
  let green = pixels[index + 1] ?? 0;
  let blue = pixels[index + 2] ?? 0;
  if (setup.look) {
    lookPixel(red, green, blue, setup.adjust.look, work);
    red = work[0] ?? 0;
    green = work[1] ?? 0;
    blue = work[2] ?? 0;
  }
  // From here on, display values 0–1.
  if (setup.light) lightInto(setup, red, green, blue);
  else {
    display.red = red / 255;
    display.green = green / 255;
    display.blue = blue / 255;
  }
  if (setup.later) finishPixel(pixels, index, setup, display, work);
  else {
    pixels[index] = display.red * 255;
    pixels[index + 1] = display.green * 255;
    pixels[index + 2] = display.blue * 255;
  }
}

/**
 * Runs the colour chain over a picture's pixels; fully transparent pixels are left as they are.
 * @param pixels the picture, RGBA, written in place
 * @param adjust the settings
 */
export function chainPixels(pixels: Uint8ClampedArray, adjust: Adjustments): void {
  const setup = chainSetup(adjust);
  const work = [0, 0, 0];
  tables();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    chainPixel(pixels, index, setup, work);
  }
}
