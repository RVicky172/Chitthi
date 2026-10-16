import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST, mergeAdjust, type Adjustments } from '@/engine/adjust';
import { blurImage, detailNeutral, detailPixels, gaussKernel, grainAt, hash2, MAX_TAPS } from '@/engine/detail';

const adjustments = (patch: Partial<Adjustments>): Adjustments => ({ ...DEFAULT_ADJUST, ...patch });
const size = 32;
/**
 * An N×N image from a function of (x, y) giving a grey level, fully opaque unless alpha says otherwise.
 * @param valueAt the grey level at (x, y)
 * @param alpha the alpha at (x, y)
 * @returns the RGBA pixels
 */
const img = (valueAt: (x: number, y: number) => number, alpha: (x: number, y: number) => number = () => 255) => {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const value = valueAt(x, y);
      pixels.set([value, value, value, alpha(x, y)], (y * size + x) * 4);
    }
  return pixels;
};
const at = (pixels: Uint8ClampedArray, x: number, y: number) => pixels[(y * size + x) * 4];
const run = (pixels: Uint8ClampedArray, patch: Partial<Adjustments>, scale = 1 / 8) => {
  const before = pixels.slice();
  detailPixels(before, size, size, adjustments(patch), scale);
  return before;
};
const variance = (pixels: Uint8ClampedArray) => {
  const value: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) value.push(pixels[index]);
  const mean = value.reduce((sum, x) => sum + x, 0) / value.length;
  return value.reduce((sum, x) => sum + (x - mean) ** 2, 0) / value.length;
};
// A vertical edge: dark left half, light right half. And a noisy mid-grey.
const edge = img((x) => (x < size / 2 ? 60 : 190));
const noisy = img((x, y) => 128 + (hash2(x, y) - 0.5) * 40);

describe('gaussKernel', () => {
  it('sums to 1, is symmetric, and never has more than 2×MAX_TAPS+1 taps', () => {
    for (const sigma of [0.5, 1, 3, 12, 40, 120]) {
      const kernel = gaussKernel(sigma);
      expect(kernel.weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 9);
      expect(kernel.weights.length).toBeLessThanOrEqual(2 * MAX_TAPS + 1);
      kernel.weights.forEach((weight, index) =>
        expect(weight).toBeCloseTo(kernel.weights[kernel.weights.length - 1 - index], 12),
      );
    }
    expect(gaussKernel(40).step).toBeGreaterThan(1);
  });
});

describe('blurImage', () => {
  it('keeps a flat image flat', () => {
    const values = new Float32Array(size * size * 4).map((_, index) => (index % 4 === 3 ? 1 : 0.4));
    const blurred = blurImage(values, size, size, gaussKernel(3));
    for (let index = 0; index < blurred.length; index += 4) expect(blurred[index]).toBeCloseTo(0.4, 5);
  });
  it('never darkens a photo where it meets a transparent surround', () => {
    // A light photo in the middle, transparent black around it (a "whole photo" frame).
    const values = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const inside = x >= 8 && x < 24 && y >= 8 && y < 24,
          index = (y * size + x) * 4;
        values.set(inside ? [0.8, 0.8, 0.8, 1] : [0, 0, 0, 0], index);
      }
    const blurred = blurImage(values, size, size, gaussKernel(3));
    expect(blurred[(8 * size + 8) * 4]).toBeCloseTo(0.8, 5);
  });
});

describe('detailPixels', () => {
  it('changes nothing at the defaults', () => {
    expect(detailNeutral(DEFAULT_ADJUST)).toBe(true);
    expect([...run(noisy, {})]).toEqual([...noisy]);
  });
  it('sharpening raises the contrast across an edge, and leaves flat areas alone', () => {
    const pixels = run(edge, { sharpen: 80 }, 1);
    expect(at(pixels, size / 2 - 1, 5)).toBeLessThan(60);
    expect(at(pixels, size / 2, 5)).toBeGreaterThan(190);
    expect(at(pixels, 3, 5)).toBe(60);
  });
  it('sharpening with masking skips fine low-contrast texture but still sharpens strong edges', () => {
    const plain = run(noisy, { sharpen: 80 }, 1),
      masked = run(noisy, { sharpen: 80, sharpenMask: 100 }, 1);
    expect(variance(plain)).toBeGreaterThan(variance(noisy) * 1.3);
    expect(variance(masked)).toBeLessThan(variance(noisy) * 1.1);
    expect(at(run(edge, { sharpen: 80, sharpenMask: 100 }, 1), size / 2, 5)).toBeGreaterThan(190);
  });
  it('noise reduction smooths noise but keeps a strong edge', () => {
    expect(variance(run(noisy, { noise: 100 }, 1))).toBeLessThan(variance(noisy) * 0.5);
    const pixels = run(edge, { noise: 100 }, 1);
    expect(at(pixels, size / 2, 5) - at(pixels, size / 2 - 1, 5)).toBeGreaterThan(110);
  });
  it('clarity adds local contrast in the mid-tones; negative clarity softens it', () => {
    const mid = img((x) => (x < size / 2 ? 110 : 150));
    const up = run(mid, { clarity: 100 }, 1),
      down = run(mid, { clarity: -100 }, 1);
    expect(at(up, size / 2, 5) - at(up, size / 2 - 1, 5)).toBeGreaterThan(40);
    expect(at(down, size / 2, 5) - at(down, size / 2 - 1, 5)).toBeLessThan(40);
  });
  it('dehaze deepens a hazy picture; negative dehaze makes it hazier', () => {
    const hazy = img((x) => (x < size / 2 ? 170 : 210));
    const clear = run(hazy, { dehaze: 80 }),
      foggy = run(hazy, { dehaze: -80 });
    expect(at(clear, 3, 5)).toBeLessThan(170);
    expect(at(clear, size - 3, 5) - at(clear, 3, 5)).toBeGreaterThan(40);
    expect(at(foggy, size - 3, 5) - at(foggy, 3, 5)).toBeLessThan(40);
  });
  it('grain is the same every time, roughly balanced, and leaves transparent pixels alone', () => {
    const grey = img(
      () => 128,
      (x) => (x < 2 ? 0 : 255),
    );
    const g1 = run(grey, { grain: 80 }, 1),
      g2 = run(grey, { grain: 80 }, 1);
    expect([...g1]).toEqual([...g2]);
    let sum = 0,
      total = 0,
      changed = 0;
    for (let index = 0; index < g1.length; index += 4)
      if (g1[index + 3]) {
        sum += g1[index] - 128;
        total++;
        if (g1[index] !== 128) changed++;
      }
    expect(Math.abs(sum / total)).toBeLessThan(2);
    expect(changed / total).toBeGreaterThan(0.5);
    expect(at(g1, 0, 3)).toBe(128);
  });
  it('the noise grain is smooth between cells and stays within 0–1', () => {
    for (let x = 0; x < 6; x += 0.25) {
      const value = grainAt(x, 1.3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Math.abs(grainAt(x + 0.01, 1.3) - value)).toBeLessThan(0.05);
    }
  });
});

describe('detail settings in mergeAdjust', () => {
  it('fall back to their own defaults, not 0 (sharpen radius is 1 px)', () => {
    const adjust = mergeAdjust({ sharpen: 40, sharpenRadius: 'big', clarity: 500 });
    expect([adjust.sharpen, adjust.sharpenRadius, adjust.clarity, adjust.grain]).toEqual([40, 1, 100, 0]);
  });
});
