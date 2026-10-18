import { describe, expect, it } from 'vitest';
import { RAMP_PRESETS, type RampPoint } from '@/engine/speed';
import {
  describePoint,
  rampKeyStep,
  sliderToSpeed,
  speedText,
  speedToSlider,
  speedToY,
  yToSpeed,
} from '@/components/studio/speedUi';
import { defined } from '../../../support/defined';

const hero: RampPoint[] = RAMP_PRESETS.hero.map((point) => ({ ...point }));

describe('speedText: a speed as the inspector and timeline show it', () => {
  it.each([
    [2, '2×'],
    [0.5, '0.5×'],
    [1.25, '1.25×'],
    [0.333333, '0.33×'],
    [10, '10×'],
  ])('%s → %s', (speed, text) => expect(speedText(speed)).toBe(text));
});

describe('the speed slider: a log scale from 0.1× to 10×, 1× in the middle (AC-11)', () => {
  it('maps the ends and the middle', () => {
    expect(speedToSlider(0.1)).toBe(0);
    expect(speedToSlider(1)).toBeCloseTo(0.5, 12);
    expect(speedToSlider(10)).toBe(1);
    expect(sliderToSpeed(0)).toBe(0.1);
    expect(sliderToSpeed(0.5)).toBe(1);
    expect(sliderToSpeed(1)).toBe(10);
  });

  it('round-trips the presets and rounds to 0.01×; stays within the limits', () => {
    for (const speed of [0.25, 0.5, 0.75, 1, 1.5, 2, 4]) expect(sliderToSpeed(speedToSlider(speed))).toBe(speed);
    expect(sliderToSpeed(0.6)).toBe(1.58);
    expect(sliderToSpeed(-1)).toBe(0.1);
    expect(sliderToSpeed(2)).toBe(10);
    expect(speedToSlider(50)).toBe(1);
  });
});

describe('the ramp editor’s keys (AC-12): ← / → along, ↑ / ↓ speed, Shift larger', () => {
  const step = (index: number, key: string, shift = false) => rampKeyStep(hero, index, key, shift);

  it('← / → move a point 0.01 along the clip, 0.1 with Shift', () => {
    expect(step(2, 'ArrowRight')).toEqual({ at: 0.51, v: 0.3 });
    expect(step(2, 'ArrowLeft')).toEqual({ at: 0.49, v: 0.3 });
    expect(step(2, 'ArrowRight', true)).toEqual({ at: 0.6, v: 0.3 });
  });

  it('↑ / ↓ change its speed by 0.1×, 1× with Shift', () => {
    expect(step(2, 'ArrowUp')).toEqual({ at: 0.5, v: 0.4 });
    expect(step(2, 'ArrowDown')).toEqual({ at: 0.5, v: 0.2 });
    expect(step(1, 'ArrowUp', true)).toEqual({ at: 0.35, v: 2 });
  });

  it('keeps a point between its neighbours, the ends in place, and its speed within 0.1–10×', () => {
    expect(defined(step(2, 'ArrowRight', true)).at).toBe(0.6);
    expect(defined(rampKeyStep([...hero.slice(0, 2), { at: 0.36, v: 1 }, ...hero.slice(3)], 2, 'ArrowLeft', false)).at).toBeCloseTo(0.36, 12);
    expect(step(0, 'ArrowRight')).toEqual({ at: 0, v: 1 });
    expect(step(4, 'ArrowLeft', true)).toEqual({ at: 1, v: 1 });
    expect(step(2, 'ArrowDown', true)).toEqual({ at: 0.5, v: 0.1 });
    const fast = rampKeyStep([{ at: 0, v: 9.5 }, { at: 1, v: 1 }], 0, 'ArrowUp', true);
    expect(fast).toEqual({ at: 0, v: 10 });
  });

  it('other keys and missing points do nothing', () => {
    expect(step(2, 'Enter')).toBeNull();
    expect(step(9, 'ArrowUp')).toBeNull();
  });
});

describe('the ramp editor’s speed axis: log scale, 10× at the top', () => {
  it('maps 10×, 1× and 0.1× to the top, the middle and the bottom, and back', () => {
    expect(speedToY(10, 200)).toBe(0);
    expect(speedToY(1, 200)).toBeCloseTo(100, 9);
    expect(speedToY(0.1, 200)).toBe(200);
    for (const speed of [0.1, 0.3, 1, 2.5, 10]) expect(yToSpeed(speedToY(speed, 200), 200)).toBeCloseTo(speed, 2);
    expect(yToSpeed(-50, 200)).toBe(10);
    expect(yToSpeed(400, 200)).toBe(0.1);
  });
});

describe('describePoint: what the ramp editor announces', () => {
  it('names the point, its place along the clip and its speed', () => {
    expect(describePoint(hero, 2)).toBe('Point 3 of 5: 50 % along, 0.3×');
    expect(describePoint(hero, 0)).toBe('Point 1 of 5 (start): 0 % along, 1×');
    expect(describePoint(hero, 4)).toBe('Point 5 of 5 (end): 100 % along, 1×');
  });
});
