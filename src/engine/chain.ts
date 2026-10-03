import type { Adjustments } from './adjust';
import { curveNeutral, curveTable, readTable } from './curve';
import { hslPixel, mixerNeutral, mixerParams } from './hsl';
import {
  LUMA,
  lightNeutral,
  linFast,
  srgbFast,
  STEPS,
  tables,
  toLinear,
  toneAt,
  toneTable,
  toSrgb,
  wbGains,
} from './light';
import { lookPixel } from './photo';

/*
 * The colour chain on the Canvas 2D path: look → light and white balance → tone curve → colour mixer, per pixel, with
 * one rounding to 8 bits at the end. Light can lift dark tones and curves can be steep, so rounding between the steps
 * would magnify small differences; the GPU programs (gpu/colour.ts) skip it too, and the self-test compares the two.
 * Each step runs only when it changes something. The older sliders (brightness, contrast, saturation, warmth) follow in
 * instagram.ts adjustPixels(), as before.
 */

/** True when only the look (or nothing) is set, so the plain lookPixels() loop will do. */
export const chainNeutral = (a: Adjustments): boolean =>
  lightNeutral(a) && curveNeutral(a.curve) && mixerNeutral(a.mixer);

export function chainPixels(px: Uint8ClampedArray, a: Adjustments): void {
  const look = a.look !== 'none',
    light = !lightNeutral(a),
    ex = 2 ** a.exposure,
    wb = wbGains(a.temperature, a.tint),
    g0 = wb[0] * ex,
    g1 = wb[1] * ex,
    g2 = wb[2] * ex,
    // The tone sliders depend only on a pixel's brightness, so their effect is one table per picture: linear
    // brightness y (indexed by its square root) to the new linear brightness.
    tone = a.highlights || a.shadows || a.whites || a.blacks ? toneTable(a) : null,
    curve = curveNeutral(a.curve) ? null : curveTable(a.curve),
    mixer = mixerNeutral(a.mixer) ? null : mixerParams(a.mixer),
    o = [0, 0, 0];
  tables();
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    if (look) lookPixel(px[i], px[i + 1], px[i + 2], a.look, o);
    else {
      o[0] = px[i];
      o[1] = px[i + 1];
      o[2] = px[i + 2];
    }
    // From here on, display values 0–1.
    let r: number, g: number, b: number;
    if (light) {
      let lr = linFast(o[0]) * g0,
        lg = linFast(o[1]) * g1,
        lb = linFast(o[2]) * g2;
      if (tone) {
        const y = LUMA[0] * lr + LUMA[1] * lg + LUMA[2] * lb;
        if (y > 1e-6) {
          let ny: number;
          if (y < 1) {
            const x = Math.sqrt(y) * STEPS,
              j = x | 0;
            ny = tone[j] + (tone[j + 1] - tone[j]) * (x - j);
          } else ny = toLinear(toneAt(toSrgb(y), a));
          const k = ny / y;
          lr *= k;
          lg *= k;
          lb *= k;
        }
      }
      r = srgbFast(lr);
      g = srgbFast(lg);
      b = srgbFast(lb);
    } else {
      r = o[0] / 255;
      g = o[1] / 255;
      b = o[2] / 255;
    }
    if (curve) {
      r = readTable(curve, 0, r);
      g = readTable(curve, 1, g);
      b = readTable(curve, 2, b);
    }
    if (mixer) {
      hslPixel(Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b)), mixer, o);
      r = o[0];
      g = o[1];
      b = o[2];
    }
    px[i] = r * 255;
    px[i + 1] = g * 255;
    px[i + 2] = b * 255;
  }
}
