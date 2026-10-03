import { describe, expect, it } from 'vitest';
import {
  bandsAt,
  BAND_HUES,
  FLAT_MIXER,
  hslPixel,
  mergeMixer,
  mixerNeutral,
  mixerParams,
  type ColourMixer,
} from './hsl';

const run = (rgb: [number, number, number], m: Partial<ColourMixer>) => {
  const o = [0, 0, 0];
  hslPixel(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, mixerParams({ ...FLAT_MIXER, ...m }), o);
  return o.map((v) => v * 255);
};
const set = (i: number, v: number) => Array.from({ length: 8 }, (_, k) => (k === i ? v : 0));
const hueOf = ([r, g, b]: number[]) => {
  const hi = Math.max(r, g, b),
    d = hi - Math.min(r, g, b);
  const h = hi === r ? (g - b) / d + (g < b ? 6 : 0) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};
const satOf = ([r, g, b]: number[]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

describe('colour mixer', () => {
  it('changes nothing at zero', () => {
    for (const c of [
      [200, 40, 30],
      [30, 160, 90],
      [80, 90, 220],
      [255, 255, 0],
    ] as [number, number, number][])
      run(c, {}).forEach((v, i) => expect(v).toBeCloseTo(c[i], 6));
  });
  it('leaves greys alone whatever the settings', () => {
    const all = { hue: set(0, 100).map(() => 100), sat: set(0, 0).map(() => 100), lum: set(0, 0).map(() => -100) };
    for (const v of [0, 64, 128, 255]) run([v, v, v], all).forEach((x) => expect(x).toBeCloseTo(v, 6));
  });
  it('desaturates only the band it is told to: blue greyer, red sari untouched, sky blue partly', () => {
    const blueSky = [60, 60, 220] as [number, number, number],
      sari = [200, 30, 40] as [number, number, number];
    const m = { sat: set(5, -100) };
    expect(satOf(run(blueSky, m))).toBeLessThan(satOf(blueSky) * 0.1);
    run(sari, m).forEach((v, i) => expect(v).toBeCloseTo(sari[i], 4));
    // A sky blue (hue 218°) sits between aqua and blue, so it gets part of the change.
    const sky = [70, 130, 230] as [number, number, number],
      s = satOf(run(sky, m)) / satOf(sky);
    expect(s).toBeGreaterThan(0.15);
    expect(s).toBeLessThan(0.5);
  });
  it('shifts hue by up to 30 degrees, and darkens with luminance', () => {
    const orange = [230, 130, 30] as [number, number, number];
    const h0 = hueOf(orange);
    expect(hueOf(run(orange, { hue: set(1, 100) })) - h0).toBeGreaterThan(15);
    const darker = run(orange, { lum: set(1, -100) });
    expect(darker[0] + darker[1] + darker[2]).toBeLessThan(orange[0] + orange[1] + orange[2] - 20);
  });
  it('blends smoothly between bands: no jump at a band edge', () => {
    const m = mixerParams({ ...FLAT_MIXER, sat: set(3, -100) });
    let prev: number | null = null;
    for (let h = 90; h <= 150; h += 1) {
      // A fully saturated colour of hue h.
      const k = (n: number) => {
        const t = (n + h / 60) % 6;
        return 1 - Math.max(0, Math.min(t, 4 - t, 1));
      };
      const o = [0, 0, 0];
      hslPixel(k(5), k(3), k(1), m, o);
      const s = Math.max(...o) - Math.min(...o);
      if (prev !== null) expect(Math.abs(s - prev)).toBeLessThan(0.08);
      prev = s;
    }
  });
});

describe('bandsAt', () => {
  it('finds each band at its centre, and wraps from magenta back to red', () => {
    BAND_HUES.forEach((h, i) => expect(bandsAt(h)).toEqual([i, (i + 1) % 8, 0]));
    const [a, b, t] = bandsAt(330);
    expect([a, b]).toEqual([7, 0]);
    expect(t).toBeCloseTo(0.5, 6);
  });
});

describe('mergeMixer', () => {
  it('always gives eight values per setting, clamped, and drops junk', () => {
    const m = mergeMixer({ hue: [500, -500, 'x'], sat: 'no', lum: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(m.hue).toEqual([100, -100, 0, 0, 0, 0, 0, 0]);
    expect(m.sat).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(m.lum).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mixerNeutral(mergeMixer(undefined))).toBe(true);
  });
});
