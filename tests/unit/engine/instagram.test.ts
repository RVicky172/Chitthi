import { describe, expect, it } from 'vitest';
import { clampBatch, IG_FORMATS, IG_MAX_BATCH } from '@/data/instagram';
import { DEFAULT_ADJUST } from '@/engine/adjust';
import { adjustPixels, DEFAULT_EDIT, mergeEdit, placement, showsBackground } from '@/engine/instagram';

describe('Instagram formats', () => {
  it('are 1080 px wide, with the ratio in their label', () => {
    for (const format of IG_FORMATS) {
      expect(format.w).toBe(1080);
      const [ratioWidth, ratioHeight] = format.ratio.split(':').map(Number);
      expect(format.w / format.h).toBeCloseTo(ratioWidth / ratioHeight, 2);
    }
  });

  it('keep feed formats between 1.91:1 and 3:4, and only the story at 9:16', () => {
    for (const format of IG_FORMATS.filter((x) => x.feed)) {
      expect(format.w / format.h).toBeGreaterThanOrEqual(0.75 - 1e-9);
      expect(format.w / format.h).toBeLessThanOrEqual(1.91 + 0.01);
    }
    expect(IG_FORMATS.filter((x) => !x.feed).map((x) => x.id)).toEqual(['story']);
  });
});

describe('clampBatch', () => {
  it('keeps the batch size between 1 and 20', () => {
    expect(clampBatch(0)).toBe(1);
    expect(clampBatch(4)).toBe(4);
    expect(clampBatch(10.6)).toBe(11);
    expect(clampBatch(50)).toBe(IG_MAX_BATCH);
    expect(clampBatch(NaN)).toBe(1);
  });
});

describe('placement', () => {
  const width = 1080,
    height = 1350;
  it('fills the frame from a landscape photo, centred', () => {
    const placed = placement(1600, 1000, DEFAULT_EDIT, width, height);
    expect(placed.dh).toBeCloseTo(height);
    expect(placed.dw).toBeGreaterThan(width);
    expect([placed.cx, placed.cy]).toEqual([width / 2, height / 2]);
    expect(showsBackground(1600, 1000, DEFAULT_EDIT, width, height)).toBe(false);
  });

  it('moves within the overflow only, from one edge to the other', () => {
    const left = placement(1600, 1000, { ...DEFAULT_EDIT, px: 1 }, width, height);
    expect(left.cx - left.dw / 2).toBeCloseTo(0);
    const right = placement(1600, 1000, { ...DEFAULT_EDIT, px: -1 }, width, height);
    expect(right.cx + right.dw / 2).toBeCloseTo(width);
    // Out-of-range positions are clamped.
    expect(placement(1600, 1000, { ...DEFAULT_EDIT, px: 9 }, width, height).cx).toBeCloseTo(left.cx);
  });

  it('fits the whole photo and shows the background around it', () => {
    const edit = { ...DEFAULT_EDIT, fit: 'fit' as const };
    const placed = placement(1600, 1000, edit, width, height);
    expect(placed.dw).toBeCloseTo(width);
    expect(placed.dh).toBeLessThan(height);
    expect(showsBackground(1600, 1000, edit, width, height)).toBe(true);
  });

  it('swaps width and height when the photo is turned a quarter', () => {
    const placed = placement(1600, 1000, { ...DEFAULT_EDIT, rot: 90 }, width, height);
    // Turned, the photo is 1000 × 1600: portrait, so the width is the side that fills.
    expect(placed.dw).toBeCloseTo(width);
    expect(placed.dh).toBeCloseTo(1728);
  });

  it('zooms between 1 and 4 times', () => {
    const one = placement(1000, 1000, DEFAULT_EDIT, width, width);
    expect(placement(1000, 1000, { ...DEFAULT_EDIT, zoom: 2 }, width, width).dw).toBeCloseTo(one.dw * 2);
    expect(placement(1000, 1000, { ...DEFAULT_EDIT, zoom: 10 }, width, width).dw).toBeCloseTo(one.dw * 4);
    expect(placement(1000, 1000, { ...DEFAULT_EDIT, zoom: 0.2 }, width, width).dw).toBeCloseTo(one.dw);
  });
});

describe('adjustPixels', () => {
  const px = (red: number, green: number, blue: number, alpha = 255) =>
    new Uint8ClampedArray([red, green, blue, alpha]);
  it('leaves pixels alone with no edits', () => {
    const pixels = px(10, 120, 240);
    adjustPixels(pixels, DEFAULT_ADJUST);
    expect([...pixels]).toEqual([10, 120, 240, 255]);
  });
  it('brightens, and turns grey with saturation at -100', () => {
    const pixels = px(100, 100, 100);
    adjustPixels(pixels, { ...DEFAULT_ADJUST, brightness: 50 });
    expect(pixels[0]).toBeGreaterThan(100);
    const pixel = px(200, 50, 50);
    adjustPixels(pixel, { ...DEFAULT_ADJUST, saturation: -100 });
    expect(pixel[0]).toBe(pixel[1]);
    expect(pixel[1]).toBe(pixel[2]);
  });
  it('warms by adding red and taking blue', () => {
    const pixels = px(120, 120, 120);
    adjustPixels(pixels, { ...DEFAULT_ADJUST, warmth: 100 });
    expect(pixels[0]).toBeGreaterThan(120);
    expect(pixels[2]).toBeLessThan(120);
  });
  it('skips transparent pixels', () => {
    const pixels = px(0, 0, 0, 0);
    adjustPixels(pixels, { ...DEFAULT_ADJUST, brightness: 100 });
    expect([...pixels]).toEqual([0, 0, 0, 0]);
  });
});

describe('mergeEdit', () => {
  it('fills in a complete edit from nothing', () => {
    expect(mergeEdit(undefined)).toEqual(DEFAULT_EDIT);
    expect(mergeEdit('junk')).toEqual(DEFAULT_EDIT);
  });
  it('round-trips a valid edit unchanged', () => {
    const entry = {
      ...DEFAULT_EDIT,
      fit: 'fit' as const,
      bg: 'blur',
      zoom: 2,
      px: -0.5,
      rot: 90 as const,
      flip: true,
      adjust: { ...DEFAULT_ADJUST, look: 'tinted' as const, warmth: 30, vignette: 40 },
    };
    expect(mergeEdit(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
  });
  it('reads a 2.x edit, whose colour settings sat in the edit and the look was called filter', () => {
    const old = {
      fit: 'fill',
      bg: '#ffffff',
      zoom: 1.5,
      px: 0,
      py: 0.2,
      rot: 0,
      flip: false,
      filter: 'vintage',
      brightness: 10,
      contrast: -5,
      saturation: 0,
      warmth: 20,
      vignette: 30,
    };
    expect(mergeEdit(old)).toEqual({
      fit: 'fill',
      bg: '#ffffff',
      zoom: 1.5,
      px: 0,
      py: 0.2,
      rot: 0,
      flip: false,
      adjust: {
        ...DEFAULT_ADJUST,
        look: 'vintage',
        brightness: 10,
        contrast: -5,
        saturation: 0,
        warmth: 20,
        vignette: 30,
      },
      masks: [],
    });
  });
  it('clamps numbers, drops unknown values and fields', () => {
    const edit = mergeEdit({
      zoom: 99,
      px: -7,
      rot: 45,
      bg: 'red',
      fit: 'stretch',
      flip: 'yes',
      extra: 1,
      adjust: { look: 'neon', brightness: 500, vignette: -3, contrast: NaN, hue: 9 },
    });
    expect(edit).toEqual({ ...DEFAULT_EDIT, zoom: 4, px: -1, adjust: { ...DEFAULT_ADJUST, brightness: 100 } });
  });
});
