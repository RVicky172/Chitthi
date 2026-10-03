import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST, mergeAdjust, type Adjustments } from './adjust';
import { blurImage, detailNeutral, detailPixels, gaussKernel, grainAt, hash2, MAX_TAPS } from './detail';

const A = (p: Partial<Adjustments>): Adjustments => ({ ...DEFAULT_ADJUST, ...p });
const N = 32;
/** An N×N image from a function of (x, y) giving a grey level, fully opaque unless alpha says otherwise. */
const img = (f: (x: number, y: number) => number, alpha: (x: number, y: number) => number = () => 255) => {
  const a = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = f(x, y);
      a.set([v, v, v, alpha(x, y)], (y * N + x) * 4);
    }
  return a;
};
const at = (a: Uint8ClampedArray, x: number, y: number) => a[(y * N + x) * 4];
const run = (a: Uint8ClampedArray, p: Partial<Adjustments>, scale = 1 / 8) => {
  const b = a.slice();
  detailPixels(b, N, N, A(p), scale);
  return b;
};
const variance = (a: Uint8ClampedArray) => {
  const v: number[] = [];
  for (let i = 0; i < a.length; i += 4) v.push(a[i]);
  const m = v.reduce((s, x) => s + x, 0) / v.length;
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length;
};
// A vertical edge: dark left half, light right half. And a noisy mid-grey.
const edge = img((x) => (x < N / 2 ? 60 : 190));
const noisy = img((x, y) => 128 + (hash2(x, y) - 0.5) * 40);

describe('gaussKernel', () => {
  it('sums to 1, is symmetric, and never has more than 2×MAX_TAPS+1 taps', () => {
    for (const s of [0.5, 1, 3, 12, 40, 120]) {
      const k = gaussKernel(s);
      expect(k.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(k.weights.length).toBeLessThanOrEqual(2 * MAX_TAPS + 1);
      k.weights.forEach((w, i) => expect(w).toBeCloseTo(k.weights[k.weights.length - 1 - i], 12));
    }
    expect(gaussKernel(40).step).toBeGreaterThan(1);
  });
});

describe('blurImage', () => {
  it('keeps a flat image flat', () => {
    const f = new Float32Array(N * N * 4).map((_, i) => (i % 4 === 3 ? 1 : 0.4));
    const b = blurImage(f, N, N, gaussKernel(3));
    for (let i = 0; i < b.length; i += 4) expect(b[i]).toBeCloseTo(0.4, 5);
  });
  it('never darkens a photo where it meets a transparent surround', () => {
    // A light photo in the middle, transparent black around it (a "whole photo" frame).
    const f = new Float32Array(N * N * 4);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const inside = x >= 8 && x < 24 && y >= 8 && y < 24,
          i = (y * N + x) * 4;
        f.set(inside ? [0.8, 0.8, 0.8, 1] : [0, 0, 0, 0], i);
      }
    const b = blurImage(f, N, N, gaussKernel(3));
    expect(b[(8 * N + 8) * 4]).toBeCloseTo(0.8, 5);
  });
});

describe('detailPixels', () => {
  it('changes nothing at the defaults', () => {
    expect(detailNeutral(DEFAULT_ADJUST)).toBe(true);
    expect([...run(noisy, {})]).toEqual([...noisy]);
  });
  it('sharpening raises the contrast across an edge, and leaves flat areas alone', () => {
    const s = run(edge, { sharpen: 80 }, 1);
    expect(at(s, N / 2 - 1, 5)).toBeLessThan(60);
    expect(at(s, N / 2, 5)).toBeGreaterThan(190);
    expect(at(s, 3, 5)).toBe(60);
  });
  it('sharpening with masking skips fine low-contrast texture but still sharpens strong edges', () => {
    const plain = run(noisy, { sharpen: 80 }, 1),
      masked = run(noisy, { sharpen: 80, sharpenMask: 100 }, 1);
    expect(variance(plain)).toBeGreaterThan(variance(noisy) * 1.3);
    expect(variance(masked)).toBeLessThan(variance(noisy) * 1.1);
    expect(at(run(edge, { sharpen: 80, sharpenMask: 100 }, 1), N / 2, 5)).toBeGreaterThan(190);
  });
  it('noise reduction smooths noise but keeps a strong edge', () => {
    expect(variance(run(noisy, { noise: 100 }, 1))).toBeLessThan(variance(noisy) * 0.5);
    const e = run(edge, { noise: 100 }, 1);
    expect(at(e, N / 2, 5) - at(e, N / 2 - 1, 5)).toBeGreaterThan(110);
  });
  it('clarity adds local contrast in the mid-tones; negative clarity softens it', () => {
    const mid = img((x) => (x < N / 2 ? 110 : 150));
    const up = run(mid, { clarity: 100 }, 1),
      down = run(mid, { clarity: -100 }, 1);
    expect(at(up, N / 2, 5) - at(up, N / 2 - 1, 5)).toBeGreaterThan(40);
    expect(at(down, N / 2, 5) - at(down, N / 2 - 1, 5)).toBeLessThan(40);
  });
  it('dehaze deepens a hazy picture; negative dehaze makes it hazier', () => {
    const hazy = img((x) => (x < N / 2 ? 170 : 210));
    const clear = run(hazy, { dehaze: 80 }),
      foggy = run(hazy, { dehaze: -80 });
    expect(at(clear, 3, 5)).toBeLessThan(170);
    expect(at(clear, N - 3, 5) - at(clear, 3, 5)).toBeGreaterThan(40);
    expect(at(foggy, N - 3, 5) - at(foggy, 3, 5)).toBeLessThan(40);
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
      n = 0,
      changed = 0;
    for (let i = 0; i < g1.length; i += 4)
      if (g1[i + 3]) {
        sum += g1[i] - 128;
        n++;
        if (g1[i] !== 128) changed++;
      }
    expect(Math.abs(sum / n)).toBeLessThan(2);
    expect(changed / n).toBeGreaterThan(0.5);
    expect(at(g1, 0, 3)).toBe(128);
  });
  it('the noise grain is smooth between cells and stays within 0–1', () => {
    for (let x = 0; x < 6; x += 0.25) {
      const v = grainAt(x, 1.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(grainAt(x + 0.01, 1.3) - v)).toBeLessThan(0.05);
    }
  });
});

describe('detail settings in mergeAdjust', () => {
  it('fall back to their own defaults, not 0 (sharpen radius is 1 px)', () => {
    const m = mergeAdjust({ sharpen: 40, sharpenRadius: 'big', clarity: 500 });
    expect([m.sharpen, m.sharpenRadius, m.clarity, m.grain]).toEqual([40, 1, 100, 0]);
  });
});
