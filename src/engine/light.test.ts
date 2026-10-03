import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST, mergeAdjust, type Adjustments } from './adjust';
import {
  LUMA,
  lightNeutral,
  lightPixel,
  lookLightPixels,
  neutralise,
  toLinear,
  toneAt,
  toSrgb,
  wbGains,
} from './light';

const A = (p: Partial<Adjustments>): Adjustments => ({ ...DEFAULT_ADJUST, ...p });
const px = (r: number, g: number, b: number, a: Partial<Adjustments>) =>
  lightPixel(r, g, b, wbGains(a.temperature ?? 0, a.tint ?? 0), a.exposure ?? 0, A(a));

describe('sRGB transfer', () => {
  it('round-trips every 8-bit level', () => {
    for (let v = 0; v <= 255; v++) expect(toSrgb(toLinear(v / 255)) * 255).toBeCloseTo(v, 6);
  });
  it('puts middle grey (sRGB 118) near 18% linear', () => {
    expect(toLinear(118 / 255)).toBeCloseTo(0.18, 2);
  });
});

describe('white balance', () => {
  it('changes nothing at zero', () => {
    expect(wbGains(0, 0).map((g) => +g.toFixed(9))).toEqual([1, 1, 1]);
    expect(px(10, 200, 90, {}).map(Math.round)).toEqual([10, 200, 90]);
  });
  it('keeps a grey just as bright, whatever the temperature and tint', () => {
    for (const [t, m] of [
      [100, 0],
      [-100, 0],
      [0, 100],
      [0, -100],
      [60, -40],
    ]) {
      const g = wbGains(t, m);
      expect(LUMA[0] * g[0] + LUMA[1] * g[1] + LUMA[2] * g[2]).toBeCloseTo(1, 9);
    }
  });
  it('warms by raising red over blue, and tints magenta by lowering green', () => {
    const [r, , b] = px(128, 128, 128, { temperature: 60 });
    expect(r).toBeGreaterThan(b + 20);
    const [r2, g2, b2] = px(128, 128, 128, { tint: 60 });
    expect(g2).toBeLessThan(r2);
    expect(g2).toBeLessThan(b2);
  });
  it('the eyedropper turns the colour it picks into a neutral grey', () => {
    for (const [r, g, b] of [
      [180, 160, 130],
      [120, 140, 170],
      [150, 120, 150],
      [200, 200, 190],
    ]) {
      const wb = neutralise(r, g, b);
      const out = px(r, g, b, wb);
      expect(Math.max(...out) - Math.min(...out)).toBeLessThan(3);
    }
  });
  it('the eyedropper leaves a grey alone and stays within the sliders', () => {
    expect(neutralise(128, 128, 128)).toEqual({ temperature: 0, tint: 0 });
    const w = neutralise(255, 0, 0);
    expect(Math.abs(w.temperature)).toBeLessThanOrEqual(100);
    expect(Math.abs(w.tint)).toBeLessThanOrEqual(100);
  });
});

describe('exposure', () => {
  it('+1 stop doubles the light, -1 halves it', () => {
    const lin = (v: number) => toLinear(v / 255);
    expect(lin(px(60, 60, 60, { exposure: 1 })[0])).toBeCloseTo(lin(60) * 2, 4);
    expect(lin(px(60, 60, 60, { exposure: -1 })[0])).toBeCloseTo(lin(60) / 2, 4);
  });
});

describe('tone sliders', () => {
  const ps = Array.from({ length: 101 }, (_, i) => i / 100);
  it('change nothing at zero', () => {
    for (const p of ps) expect(toneAt(p, A({}))).toBeCloseTo(p, 12);
  });
  it('each works on its own range: shadows on the dark end, highlights on the bright end', () => {
    const sh = A({ shadows: 100 }),
      hi = A({ highlights: -100 });
    expect(toneAt(0.15, sh) - 0.15).toBeGreaterThan(0.08);
    expect(toneAt(0.95, sh) - 0.95).toBeLessThan(0.02);
    expect(0.9 - toneAt(0.9, hi)).toBeGreaterThan(0.08);
    expect(0.1 - toneAt(0.1, hi)).toBeLessThan(0.01);
    expect(toneAt(0.97, A({ whites: 100 }))).toBeGreaterThan(0.97 + 0.1);
    expect(toneAt(0.05, A({ blacks: -100 }))).toBeLessThan(0.05 - 0.03);
  });
  it('never swap two tones, even at the ends of every slider', () => {
    for (const k of ['highlights', 'shadows', 'whites', 'blacks'] as const)
      for (const v of [-100, 100]) {
        const a = A({ [k]: v });
        for (let i = 1; i < ps.length; i++)
          expect(toneAt(ps[i], a)).toBeGreaterThanOrEqual(toneAt(ps[i - 1], a) - 1e-9);
      }
  });
  it('keep the hue: all three channels scale together in linear light', () => {
    const [r, g, b] = px(200, 120, 60, { shadows: 80, highlights: -50 });
    const ratio = (x: number, y: number) => toLinear(x / 255) / toLinear(y / 255);
    expect(ratio(r, b)).toBeCloseTo(ratio(200, 60), 2);
    expect(ratio(g, b)).toBeCloseTo(ratio(120, 60), 2);
  });
});

describe('lookLightPixels', () => {
  it('does nothing when every light setting is zero, and skips transparent pixels', () => {
    expect(lightNeutral(A({ brightness: 50 }))).toBe(true);
    const a = new Uint8ClampedArray([50, 60, 70, 255, 50, 60, 70, 0]);
    lookLightPixels(a, A({ exposure: 1 }));
    expect(a[0]).toBeGreaterThan(50);
    expect([...a.slice(4)]).toEqual([50, 60, 70, 0]);
  });
  it('reads the new settings through mergeAdjust, with exposure clamped to ±4 stops', () => {
    const m = mergeAdjust({ exposure: 9, temperature: -300, shadows: 40 });
    expect([m.exposure, m.temperature, m.shadows, m.tint]).toEqual([4, -100, 40, 0]);
  });
});

describe('look overshoot', () => {
  it('starts the light step from the clamped look, as the GPU does', () => {
    // Vivid pushes strong colours past 255; the light step must treat them as 255, not brighter.
    const a = new Uint8ClampedArray([250, 40, 30, 255]);
    lookLightPixels(a, A({ look: 'vivid', exposure: -1 }));
    const b = new Uint8ClampedArray([255, 0, 0, 255]);
    lookLightPixels(b, A({ exposure: -1 }));
    expect(a[0]).toBeLessThanOrEqual(b[0] + 1);
  });
});
