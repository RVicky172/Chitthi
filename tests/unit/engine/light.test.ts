import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST, mergeAdjust, type Adjustments } from '@/engine/adjust';
import { chainPixels } from '@/engine/chain';
import { LUMA, lightNeutral, lightPixel, neutralise, toLinear, toneAt, toSrgb, wbGains } from '@/engine/light';

const adjustments = (patch: Partial<Adjustments>): Adjustments => ({ ...DEFAULT_ADJUST, ...patch });
const px = (red: number, green: number, blue: number, alpha: Partial<Adjustments>) =>
  lightPixel(
    red,
    green,
    blue,
    wbGains(alpha.temperature ?? 0, alpha.tint ?? 0),
    alpha.exposure ?? 0,
    adjustments(alpha),
  );

describe('sRGB transfer', () => {
  it('round-trips every 8-bit level', () => {
    for (let value = 0; value <= 255; value++) expect(toSrgb(toLinear(value / 255)) * 255).toBeCloseTo(value, 6);
  });
  it('puts middle grey (sRGB 118) near 18% linear', () => {
    expect(toLinear(118 / 255)).toBeCloseTo(0.18, 2);
  });
});

describe('white balance', () => {
  it('changes nothing at zero', () => {
    expect(wbGains(0, 0).map((wbGain) => +wbGain.toFixed(9))).toEqual([1, 1, 1]);
    expect(px(10, 200, 90, {}).map(Math.round)).toEqual([10, 200, 90]);
  });
  it('keeps a grey just as bright, whatever the temperature and tint', () => {
    for (const [time, mean] of [
      [100, 0],
      [-100, 0],
      [0, 100],
      [0, -100],
      [60, -40],
    ]) {
      const gains = wbGains(time, mean);
      expect(LUMA[0] * gains[0] + LUMA[1] * gains[1] + LUMA[2] * gains[2]).toBeCloseTo(1, 9);
    }
  });
  it('warms by raising red over blue, and tints magenta by lowering green', () => {
    const [red, , blue] = px(128, 128, 128, { temperature: 60 });
    expect(red).toBeGreaterThan(blue + 20);
    const [r2, g2, b2] = px(128, 128, 128, { tint: 60 });
    expect(g2).toBeLessThan(r2);
    expect(g2).toBeLessThan(b2);
  });
  it('the eyedropper turns the colour it picks into a neutral grey', () => {
    for (const [red, green, blue] of [
      [180, 160, 130],
      [120, 140, 170],
      [150, 120, 150],
      [200, 200, 190],
    ]) {
      const wb = neutralise(red, green, blue);
      const out = px(red, green, blue, wb);
      expect(Math.max(...out) - Math.min(...out)).toBeLessThan(3);
    }
  });
  it('the eyedropper leaves a grey alone and stays within the sliders', () => {
    expect(neutralise(128, 128, 128)).toEqual({ temperature: 0, tint: 0 });
    const neutral = neutralise(255, 0, 0);
    expect(Math.abs(neutral.temperature)).toBeLessThanOrEqual(100);
    expect(Math.abs(neutral.tint)).toBeLessThanOrEqual(100);
  });
});

describe('exposure', () => {
  it('+1 stop doubles the light, -1 halves it', () => {
    const lin = (value: number) => toLinear(value / 255);
    expect(lin(px(60, 60, 60, { exposure: 1 })[0])).toBeCloseTo(lin(60) * 2, 4);
    expect(lin(px(60, 60, 60, { exposure: -1 })[0])).toBeCloseTo(lin(60) / 2, 4);
  });
});

describe('tone sliders', () => {
  const ps = Array.from({ length: 101 }, (_, index) => index / 100);
  it('change nothing at zero', () => {
    for (const share of ps) expect(toneAt(share, adjustments({}))).toBeCloseTo(share, 12);
  });
  it('each works on its own range: shadows on the dark end, highlights on the bright end', () => {
    const sh = adjustments({ shadows: 100 }),
      hi = adjustments({ highlights: -100 });
    expect(toneAt(0.15, sh) - 0.15).toBeGreaterThan(0.08);
    expect(toneAt(0.95, sh) - 0.95).toBeLessThan(0.02);
    expect(0.9 - toneAt(0.9, hi)).toBeGreaterThan(0.08);
    expect(0.1 - toneAt(0.1, hi)).toBeLessThan(0.01);
    expect(toneAt(0.97, adjustments({ whites: 100 }))).toBeGreaterThan(0.97 + 0.1);
    expect(toneAt(0.05, adjustments({ blacks: -100 }))).toBeLessThan(0.05 - 0.03);
  });
  it('never swap two tones, even at the ends of every slider', () => {
    for (const key of ['highlights', 'shadows', 'whites', 'blacks'] as const)
      for (const value of [-100, 100]) {
        const adjusted = adjustments({ [key]: value });
        for (let index = 1; index < ps.length; index++)
          expect(toneAt(ps[index], adjusted)).toBeGreaterThanOrEqual(toneAt(ps[index - 1], adjusted) - 1e-9);
      }
  });
  it('keep the hue: all three channels scale together in linear light', () => {
    const [red, green, blue] = px(200, 120, 60, { shadows: 80, highlights: -50 });
    const ratio = (x: number, y: number) => toLinear(x / 255) / toLinear(y / 255);
    expect(ratio(red, blue)).toBeCloseTo(ratio(200, 60), 2);
    expect(ratio(green, blue)).toBeCloseTo(ratio(120, 60), 2);
  });
});

describe('chainPixels (look and light)', () => {
  it('does nothing when every light setting is zero, and skips transparent pixels', () => {
    expect(lightNeutral(adjustments({ brightness: 50 }))).toBe(true);
    const pixels = new Uint8ClampedArray([50, 60, 70, 255, 50, 60, 70, 0]);
    chainPixels(pixels, adjustments({ exposure: 1 }));
    expect(pixels[0]).toBeGreaterThan(50);
    expect([...pixels.slice(4)]).toEqual([50, 60, 70, 0]);
  });
  it('reads the new settings through mergeAdjust, with exposure clamped to ±4 stops', () => {
    const adjust = mergeAdjust({ exposure: 9, temperature: -300, shadows: 40 });
    expect([adjust.exposure, adjust.temperature, adjust.shadows, adjust.tint]).toEqual([4, -100, 40, 0]);
  });
});

describe('look overshoot', () => {
  it('starts the light step from the clamped look, as the GPU does', () => {
    // Vivid pushes strong colours past 255; the light step must treat them as 255, not brighter.
    const pixels = new Uint8ClampedArray([250, 40, 30, 255]);
    chainPixels(pixels, adjustments({ look: 'vivid', exposure: -1 }));
    const uint8ClampedArray = new Uint8ClampedArray([255, 0, 0, 255]);
    chainPixels(uint8ClampedArray, adjustments({ exposure: -1 }));
    expect(pixels[0]).toBeLessThanOrEqual(uint8ClampedArray[0] + 1);
  });
});
