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
} from '@/engine/hsl';

const run = (rgb: [number, number, number], message: Partial<ColourMixer>) => {
  const out = [0, 0, 0];
  hslPixel(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, mixerParams({ ...FLAT_MIXER, ...message }), out);
  return out.map((value) => value * 255);
};
const set = (index: number, value: number) => Array.from({ length: 8 }, (_, step) => (step === index ? value : 0));
const hueOf = ([red, green, blue]: number[]) => {
  const hi = Math.max(red, green, blue),
    delta = hi - Math.min(red, green, blue);
  const height =
    hi === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : hi === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return height * 60;
};
const satOf = ([red, green, blue]: number[]) => (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;

describe('colour mixer', () => {
  it('changes nothing at zero', () => {
    for (const entry of [
      [200, 40, 30],
      [30, 160, 90],
      [80, 90, 220],
      [255, 255, 0],
    ] as [number, number, number][])
      run(entry, {}).forEach((value, index) => expect(value).toBeCloseTo(entry[index], 6));
  });
  it('leaves greys alone whatever the settings', () => {
    const all = { hue: set(0, 100).map(() => 100), sat: set(0, 0).map(() => 100), lum: set(0, 0).map(() => -100) };
    for (const value of [0, 64, 128, 255])
      run([value, value, value], all).forEach((x) => expect(x).toBeCloseTo(value, 6));
  });
  it('desaturates only the band it is told to: blue greyer, red sari untouched, sky blue partly', () => {
    const blueSky = [60, 60, 220] as [number, number, number],
      sari = [200, 30, 40] as [number, number, number];
    const message = { sat: set(5, -100) };
    expect(satOf(run(blueSky, message))).toBeLessThan(satOf(blueSky) * 0.1);
    run(sari, message).forEach((value, index) => expect(value).toBeCloseTo(sari[index], 4));
    // A sky blue (hue 218°) sits between aqua and blue, so it gets part of the change.
    const sky = [70, 130, 230] as [number, number, number],
      saturation = satOf(run(sky, message)) / satOf(sky);
    expect(saturation).toBeGreaterThan(0.15);
    expect(saturation).toBeLessThan(0.5);
  });
  it('shifts hue by up to 30 degrees, and darkens with luminance', () => {
    const orange = [230, 130, 30] as [number, number, number];
    const h0 = hueOf(orange);
    expect(hueOf(run(orange, { hue: set(1, 100) })) - h0).toBeGreaterThan(15);
    const darker = run(orange, { lum: set(1, -100) });
    expect(darker[0] + darker[1] + darker[2]).toBeLessThan(orange[0] + orange[1] + orange[2] - 20);
  });
  it('blends smoothly between bands: no jump at a band edge', () => {
    const values = mixerParams({ ...FLAT_MIXER, sat: set(3, -100) });
    let prev: number | null = null;
    for (let height = 90; height <= 150; height += 1) {
      // A fully saturated colour of hue h.
      const channel = (count: number) => {
        const time = (count + height / 60) % 6;
        return 1 - Math.max(0, Math.min(time, 4 - time, 1));
      };
      const out = [0, 0, 0];
      hslPixel(channel(5), channel(3), channel(1), values, out);
      const spread = Math.max(...out) - Math.min(...out);
      if (prev !== null) expect(Math.abs(spread - prev)).toBeLessThan(0.08);
      prev = spread;
    }
  });
});

describe('bandsAt', () => {
  it('finds each band at its centre, and wraps from magenta back to red', () => {
    BAND_HUES.forEach((hue, index) => expect(bandsAt(hue)).toEqual([index, (index + 1) % 8, 0]));
    const [band, nextBand, mix] = bandsAt(330);
    expect([band, nextBand]).toEqual([7, 0]);
    expect(mix).toBeCloseTo(0.5, 6);
  });
});

describe('mergeMixer', () => {
  it('always gives eight values per setting, clamped, and drops junk', () => {
    const mixer = mergeMixer({ hue: [500, -500, 'x'], sat: 'no', lum: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect(mixer.hue).toEqual([100, -100, 0, 0, 0, 0, 0, 0]);
    expect(mixer.sat).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(mixer.lum).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mixerNeutral(mergeMixer(undefined))).toBe(true);
  });
});
