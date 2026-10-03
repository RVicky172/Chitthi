/*
 * The colour mixer (docs/planning/EDITOR-IMPLEMENTATION.md, P1.2): hue, saturation and luminance for eight colour
 * bands, like a camera app's HSL panel. A pixel's adjustment is blended from the two bands its hue falls between, so
 * colours change smoothly and nothing jumps at a band edge. Greys have no hue and are left alone: every change is
 * weighted by how coloured the pixel is. Works on display values (sRGB 0–1), like the tone curve.
 *
 * hslPixel() is the reference for the Canvas 2D path; gpu/colour.ts HSL_PROGRAM mirrors it line for line.
 */

export const HSL_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;
export type HslBand = (typeof HSL_BANDS)[number];
/** Each band's centre hue, degrees. */
export const BAND_HUES = [0, 30, 60, 120, 180, 240, 270, 300] as const;

export interface ColourMixer {
  /** Per band, -100 to 100: hue shift (±30° at the ends), saturation, luminance. */
  hue: readonly number[];
  sat: readonly number[];
  lum: readonly number[];
}

const ZERO = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0]);
export const FLAT_MIXER: Readonly<ColourMixer> = Object.freeze({ hue: ZERO, sat: ZERO, lum: ZERO });

export const mixerNeutral = (m: ColourMixer): boolean => [...m.hue, ...m.sat, ...m.lum].every((v) => v === 0);

const band = (raw: unknown): number[] =>
  Array.from({ length: 8 }, (_, i) => {
    const v = Array.isArray(raw) ? raw[i] : 0;
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(-100, v)) : 0;
  });

export function mergeMixer(raw: unknown): ColourMixer {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { hue: band(o.hue), sat: band(o.sat), lum: band(o.lum) };
}

/** Hue (degrees, 0–360) to the two bands around it and how far between them (eased), as [band, next band, t]. */
export function bandsAt(h: number): [number, number, number] {
  let k = 7;
  for (let i = 0; i < 7; i++)
    if (h < BAND_HUES[i + 1]) {
      k = i;
      break;
    }
  const from = BAND_HUES[k],
    to = k === 7 ? 360 : BAND_HUES[k + 1],
    t = Math.min(1, Math.max(0, (h - from) / (to - from)));
  return [k, (k + 1) % 8, t * t * (3 - 2 * t)];
}

const hue2rgb = (p: number, q: number, t: number) => {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

/**
 * One pixel through the mixer, in display values 0–1 (written into out). The mixer settings are in m as fractions
 * (-1 to 1): hue, saturation, luminance, eight each.
 */
export function hslPixel(r: number, g: number, b: number, m: Float32Array | readonly number[], out: number[]): void {
  const hi = Math.max(r, g, b),
    lo = Math.min(r, g, b),
    d = hi - lo,
    l = (hi + lo) / 2;
  if (d <= 1e-6) {
    out[0] = r;
    out[1] = g;
    out[2] = b;
    return;
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = hi === r ? (g - b) / d + (g < b ? 6 : 0) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  const [k0, k1, t] = bandsAt(h);
  const mix = (o: number) => m[o + k0] * (1 - t) + m[o + k1] * t;
  const dh = mix(0),
    ds = mix(8),
    dl = mix(16);
  const h2 = ((((h + dh * 30) % 360) + 360) % 360) / 360,
    s2 = Math.min(1, Math.max(0, s * (1 + ds))),
    l2 = Math.min(1, Math.max(0, l + dl * 0.25 * s * (1 - Math.abs(2 * l - 1))));
  const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2,
    p = 2 * l2 - q;
  out[0] = hue2rgb(p, q, h2 + 1 / 3);
  out[1] = hue2rgb(p, q, h2);
  out[2] = hue2rgb(p, q, h2 - 1 / 3);
}

/** The mixer as 24 fractions: hue, saturation, luminance for the eight bands. For hslPixel() and the GPU. */
export function mixerParams(m: ColourMixer): Float32Array {
  return new Float32Array([...m.hue, ...m.sat, ...m.lum].map((v) => v / 100));
}
