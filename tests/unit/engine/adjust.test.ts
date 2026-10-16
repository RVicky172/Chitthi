import { describe, expect, it } from 'vitest';
import { LOOKS } from '@/data/layouts';
import { IG_FILTERS } from '@/data/instagram';
import { ADJUST_RANGES, colourNeutral, DEFAULT_ADJUST, LOOK_IDS, mergeAdjust } from '@/engine/adjust';

describe('Adjustments', () => {
  it('know every look the studios offer', () => {
    expect([...LOOK_IDS].sort()).toEqual(LOOKS.map(([id]) => id).sort());
    expect([...LOOK_IDS].sort()).toEqual(IG_FILTERS.map(([id]) => id).sort());
  });
  it('default to neutral colour, and every default is within its range', () => {
    expect(colourNeutral(DEFAULT_ADJUST)).toBe(true);
    for (const [key, [lo, hi]] of Object.entries(ADJUST_RANGES)) {
      const value = DEFAULT_ADJUST[key as keyof typeof ADJUST_RANGES];
      expect(value).toBeGreaterThanOrEqual(lo);
      expect(value).toBeLessThanOrEqual(hi);
    }
  });
  it('treat the vignette as drawn on top, not a colour change', () => {
    expect(colourNeutral({ ...DEFAULT_ADJUST, vignette: 50 })).toBe(true);
    expect(colourNeutral({ ...DEFAULT_ADJUST, look: 'bw' })).toBe(false);
    expect(colourNeutral({ ...DEFAULT_ADJUST, warmth: 1 })).toBe(false);
  });
});

describe('mergeAdjust', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const value of [undefined, null, 3, 'x', []]) expect(mergeAdjust(value)).toEqual(DEFAULT_ADJUST);
  });
  it('clamps to the ranges and drops non-numbers', () => {
    expect(mergeAdjust({ brightness: -300, contrast: 300, saturation: '50', warmth: Infinity, vignette: 101 })).toEqual(
      { ...DEFAULT_ADJUST, brightness: -100, contrast: 100, vignette: 100 },
    );
  });
  it('accepts the 2.x name filter for the look, and prefers look when both are set', () => {
    expect(mergeAdjust({ filter: 'cool' }).look).toBe('cool');
    expect(mergeAdjust({ filter: 'cool', look: 'warm' }).look).toBe('warm');
    expect(mergeAdjust({ look: 'sepia' }).look).toBe('none');
  });
  it('never returns the shared default object', () => {
    const adjustments = mergeAdjust({});
    adjustments.brightness = 5;
    expect(DEFAULT_ADJUST.brightness).toBe(0);
  });
});
