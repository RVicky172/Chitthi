import { describe, expect, it } from 'vitest';
import { TEXT_STYLES } from '@/data/layers';
import { KEY_LIMITS } from '@/engine/keyframeGate';
import {
  adjacentKey,
  animate,
  clampValue,
  countKeys,
  edgeGain,
  sourceGainAt,
  gainCurve,
  isAnimated,
  keyState,
  layerAt,
  layersAt,
  moveKey,
  removeKey,
  setEase,
  setKey,
  shiftKeys,
  splitKeys,
  stopAnimating,
  transformAt,
  valueAt,
  volumeAt,
  type ClipKeyProp,
  type Ease,
  type Keyframe,
  type Keyframes,
} from '@/engine/keyframes';
import { newSticker, newText } from '@/engine/layers';
import { frameRange, IDENTITY, type ClipTransform, type TimedClip } from '@/engine/timeline';
import { type SoundSource } from '@/engine/soundPlan';
import { itemTransform, type StackDraw } from '@/engine/video';
import { defined } from '../../support/defined';

/**
 * A video clip on the main track, 10 s long, starting at 2 s on the timeline.
 * @param extra fields to change
 * @returns the clip
 */
const clip = (extra: Partial<TimedClip & { volume: number }> = {}): TimedClip & { volume: number } => ({
  id: 'c1',
  track: 'v1',
  start: 2,
  kind: 'video',
  dur: 0,
  in: 0,
  out: 10,
  volume: 0.8,
  ...extra,
});

/**
 * Two keys: `from` at 0 s and `to` at 1 s, the change between them eased by `ease`.
 * @param from the value at 0 s
 * @param to the value at 1 s
 * @param ease the ease of the first key
 * @returns the two keys
 */
const pair = (from: number, to: number, ease: Ease): Keyframe[] => [
  { t: 0, v: from, ease },
  { t: 1, v: to, ease: 'linear' },
];

describe('valueAt', () => {
  const keys: Keyframe[] = [
    { t: 1, v: 10, ease: 'linear' },
    { t: 2, v: 20, ease: 'hold' },
    { t: 4, v: 40, ease: 'ease-in-out' },
    { t: 5, v: 0, ease: 'linear' },
  ];

  it('is exact at every key', () => {
    for (const keyframe of keys) expect(valueAt(keys, keyframe.t)).toBe(keyframe.v);
  });

  it('holds the first value before the first key and the last after the last', () => {
    expect(valueAt(keys, 0)).toBe(10);
    expect(valueAt(keys, -3)).toBe(10);
    expect(valueAt(keys, 5.5)).toBe(0);
    expect(valueAt(keys, 1e9)).toBe(0);
  });

  it('a single key is a constant', () => {
    const one: Keyframe[] = [{ t: 3, v: 0.4, ease: 'ease-in-out' }];
    for (const time of [0, 3, 7]) expect(valueAt(one, time)).toBe(0.4);
  });

  it('linear is the straight line between two keys', () => {
    expect(valueAt(keys, 1.5)).toBeCloseTo(15, 12);
    expect(valueAt(keys, 1.25)).toBeCloseTo(12.5, 12);
  });

  it('hold keeps the value until the next key', () => {
    expect(valueAt(keys, 2.01)).toBe(20);
    expect(valueAt(keys, 3.999)).toBe(20);
    expect(valueAt(keys, 4)).toBe(40);
  });

  // Sampled from the browser's cubic-bezier curves (solved by bisection to 1e-15).
  const css: Record<'ease-in' | 'ease-out' | 'ease-in-out', number[]> = {
    'ease-in': [0.01703, 0.09346, 0.31536, 0.62186, 0.83943],
    'ease-out': [0.16057, 0.37814, 0.68464, 0.90654, 0.98297],
    'ease-in-out': [0.01972, 0.12916, 0.5, 0.87084, 0.98028],
  };
  const at = [0.1, 0.25, 0.5, 0.75, 0.9];
  for (const ease of Object.keys(css) as (keyof typeof css)[]) {
    it(`${ease} follows the CSS curve within 0.001`, () => {
      at.forEach((share, index) =>
        expect(Math.abs(valueAt(pair(0, 1, ease), share) - css[ease][index])).toBeLessThan(0.001),
      );
      // Scaled and reversed: 100 → 0 over 2 s, starting at 3 s.
      const keyframes: Keyframe[] = [
        { t: 3, v: 100, ease },
        { t: 5, v: 0, ease: 'hold' },
      ];
      at.forEach((share, index) =>
        expect(Math.abs(valueAt(keyframes, 3 + 2 * share) - (100 - 100 * css[ease][index]))).toBeLessThan(0.1),
      );
    });
  }

  it('eases are monotonic and stay between their keys', () => {
    for (const ease of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      let last = -Infinity;
      for (let index = 0; index <= 1000; index++) {
        const value = valueAt(pair(0, 1, ease), index / 1000);
        expect(value).toBeGreaterThanOrEqual(last - 1e-12);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
        last = value;
      }
    }
  });

  it('finds the right segment among many keys (binary search)', () => {
    const many: Keyframe[] = Array.from({ length: 100 }, (_, index) => ({
      t: index,
      v: index * 2,
      ease: 'linear' as const,
    }));
    for (const time of [0.5, 17.25, 63.5, 98.75]) expect(valueAt(many, time)).toBeCloseTo(time * 2, 10);
  });
});

describe('clampValue', () => {
  it('keeps a clip box inside 203’s ranges', () => {
    const cases: [Parameters<typeof clampValue>[0], number, number][] = [
      ['x', -9, -0.5],
      ['x', 9, 1.5],
      ['y', -9, -0.5],
      ['y', 9, 1.5],
      ['w', 0, 0.05],
      ['w', 9, 4],
      ['rot', -500, -180],
      ['rot', 500, 180],
      ['opacity', -1, 0],
      ['opacity', 2, 1],
      ['radius', -1, 0],
      ['radius', 1, 0.5],
      ['volume', -1, 0],
      ['volume', 1.5, 1],
    ];
    for (const [prop, value, want] of cases) expect(clampValue(prop, value, 'clip')).toBe(want);
    expect(clampValue('x', 0.3, 'clip')).toBe(0.3);
  });

  it('keeps a layer inside the layers’ ranges', () => {
    const cases: [Parameters<typeof clampValue>[0], number, number][] = [
      ['x', -9, -0.5],
      ['x', 9, 1.5],
      ['y', -9, -0.5],
      ['y', 9, 1.5],
      ['w', 0, 0.01],
      ['w', 9, 4],
      ['rot', -500, -360],
      ['rot', 500, 360],
      ['opacity', -1, 0],
      ['opacity', 2, 1],
    ];
    for (const [prop, value, want] of cases) expect(clampValue(prop, value, 'layer')).toBe(want);
    expect(clampValue('rot', 270, 'layer')).toBe(270);
  });
});

describe('transformAt / volumeAt / layerAt', () => {
  it('return the stored values themselves when nothing is animated', () => {
    const tf: ClipTransform = { x: 0.2, y: 0.3, w: 0.4, rot: 10, opacity: 0.9, radius: 0.1 };
    const timedClip = clip({ tf });
    expect(transformAt(timedClip, 1)).toBe(tf);
    expect(transformAt(clip(), 1)).toBe(IDENTITY);
    expect(transformAt(clip({ tf, keys: {} }), 1)).toBe(tf);
    expect(transformAt(clip({ tf, keys: { x: [] } }), 1)).toBe(tf);
    expect(volumeAt(timedClip, 1)).toBe(0.8);
    const layer = newSticker('⭐');
    expect(layerAt(layer, 3)).toBe(layer);
  });

  it('transformAt replaces only the animated fields, in clip time', () => {
    const tf: ClipTransform = { x: 0.2, y: 0.3, w: 0.4, rot: 10, opacity: 0.9, radius: 0.1 };
    const timedClip = clip({
      tf,
      keys: {
        x: [
          { t: 0, v: 0, ease: 'linear' },
          { t: 2, v: 1, ease: 'linear' },
        ],
        opacity: [{ t: 1, v: 0.5, ease: 'hold' }],
      },
    });
    expect(transformAt(timedClip, 1)).toEqual({ ...tf, x: 0.5, opacity: 0.5 });
    expect(transformAt(timedClip, 3)).toEqual({ ...tf, x: 1, opacity: 0.5 });
    expect(timedClip.tf).toEqual(tf);
  });

  it('transformAt animates from the identity when the clip has no box', () => {
    const timedClip = clip({ keys: { w: pair(1, 0.5, 'linear') } });
    expect(transformAt(timedClip, 0.5)).toEqual({ ...IDENTITY, w: 0.75 });
  });

  it('volumeAt follows the volume keys and ignores the box keys', () => {
    const timedClip = clip({ keys: { volume: pair(1, 0, 'linear'), x: pair(0, 1, 'linear') } });
    expect(volumeAt(timedClip, 0.25)).toBeCloseTo(0.75, 12);
    expect(volumeAt(timedClip, 9)).toBe(0);
  });

  it('layerAt evaluates at timeline time minus the layer’s start', () => {
    const layer = {
      ...newSticker('⭐'),
      start: 4,
      end: 8,
      keys: { opacity: pair(1, 0, 'linear'), rot: pair(0, 90, 'hold') },
    };
    const mid = layerAt(layer, 4.5);
    expect(mid).not.toBe(layer);
    expect(mid.opacity).toBeCloseTo(0.5, 12);
    expect(mid.rot).toBe(0);
    expect(mid.x).toBe(layer.x);
    expect(mid.emoji).toBe('⭐');
    expect(layerAt(layer, 5).rot).toBe(90);
    // A layer without a start counts from 0.
    const fromZero = { ...newSticker('⭐'), keys: { x: pair(0, 1, 'linear') } };
    expect(layerAt(fromZero, 0.25).x).toBeCloseTo(0.25, 12);
  });

  it('an animated size scales the whole layer, as the Size slider does (a title’s font size too)', () => {
    const title = { ...newText(TEXT_STYLES[0], 'Hello'), w: 0.4, keys: { w: pair(0.4, 0.8, 'linear') } };
    const grown = layerAt(title, 1);
    expect(grown.w).toBeCloseTo(0.8, 12);
    expect(grown.size).toBeCloseTo(title.size * 2, 12);
    expect(title.size).toBe(newText(TEXT_STYLES[0], 'Hello').size);
  });

  it('values out of range in keys are clamped when evaluated', () => {
    const timedClip = clip({ keys: { opacity: [{ t: 0, v: 3, ease: 'linear' }] } });
    expect(transformAt(timedClip, 0).opacity).toBe(1);
  });
});

describe('isAnimated', () => {
  it('is true only for a value with at least one key', () => {
    const timedClip = clip({ keys: { x: pair(0, 1, 'linear'), y: [] } });
    expect(isAnimated(timedClip, 'x')).toBe(true);
    expect(isAnimated(timedClip, 'y')).toBe(false);
    expect(isAnimated(timedClip, 'volume')).toBe(false);
    expect(isAnimated(clip(), 'x')).toBe(false);
    expect(isAnimated(newSticker('⭐'), 'opacity')).toBe(false);
  });
});

describe('pure edits', () => {
  const keyframe = (time: number, value: number, ease: Ease = 'ease-in-out'): Keyframe => ({ t: time, v: value, ease });
  const clipEdit = { on: 'clip' as const };

  it('setKey adds a key in time order with Ease in and out, on empty keys too', () => {
    const one = setKey(undefined, 'x', 1, 0.2, clipEdit);
    expect(one).toEqual({ x: [keyframe(1, 0.2)] });
    const two = setKey(one as Keyframes<ClipKeyProp>, 'x', 0.5, 0.4, clipEdit);
    expect(two).toEqual({ x: [keyframe(0.5, 0.4), keyframe(1, 0.2)] });
    const other = setKey(two as Keyframes<ClipKeyProp>, 'opacity', 0, 1, clipEdit);
    expect(other).toEqual({ x: [keyframe(0.5, 0.4), keyframe(1, 0.2)], opacity: [keyframe(0, 1)] });
    // The input is not changed.
    expect(one).toEqual({ x: [keyframe(1, 0.2)] });
  });

  it('setKey replaces the value of a key within half a frame, keeping its time and ease', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [keyframe(1, 0.2, 'hold')] };
    expect(setKey(keys, 'x', 1 + 0.4 / 30, 0.9, clipEdit)).toEqual({ x: [keyframe(1, 0.9, 'hold')] });
    expect(setKey(keys, 'x', 1 - 0.4 / 60, 0.9, { ...clipEdit, fps: 60 })).toEqual({ x: [keyframe(1, 0.9, 'hold')] });
    // Just over half a frame: a new key.
    expect((setKey(keys, 'x', 1 + 0.6 / 30, 0.9, clipEdit) as Keyframes<ClipKeyProp>).x).toHaveLength(2);
  });

  it('setKey clamps the value to its range', () => {
    expect(setKey(undefined, 'opacity', 0, 4, clipEdit)).toEqual({ opacity: [keyframe(0, 1)] });
    expect(setKey(undefined, 'w', 0, 0, clipEdit)).toEqual({ w: [keyframe(0, 0.05)] });
    expect(setKey(undefined, 'w', 0, 0, { on: 'layer' })).toEqual({ w: [keyframe(0, 0.01)] });
    expect(setKey(undefined, 'volume', 0, -1, clipEdit)).toEqual({ volume: [keyframe(0, 0)] });
  });

  it('setKey refuses a 101st key on a value and a 5,001st in the project, with a message', () => {
    const full: Keyframes<ClipKeyProp> = { x: Array.from({ length: 100 }, (_, index) => keyframe(index, 0.5)) };
    const refused = setKey(full, 'x', 200, 0.5, clipEdit);
    expect(refused).toEqual({ error: expect.stringContaining('100') as unknown });
    // Replacing a key on a full value is fine.
    expect(setKey(full, 'x', 3, 0.1, clipEdit)).not.toHaveProperty('error');
    const project = setKey({}, 'y', 0, 0.5, { ...clipEdit, projectKeys: 5000 });
    expect(project).toEqual({ error: expect.stringContaining('5,000') as unknown });
    expect(setKey({}, 'y', 0, 0.5, { ...clipEdit, projectKeys: 4999 })).toEqual({ y: [keyframe(0, 0.5)] });
    expect(KEY_LIMITS).toEqual({ perValue: 100, perProject: 5000 });
  });

  it('removeKey removes the key within half a frame; no keys left gives undefined', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [keyframe(0, 0), keyframe(1, 1)], y: [keyframe(1, 0.3)] };
    expect(removeKey(keys, 'x', 1.01)).toEqual({ x: [keyframe(0, 0)], y: [keyframe(1, 0.3)] });
    expect(removeKey(keys, 'x', 0.5)).toBe(keys);
    expect(removeKey(keys, 'y', 1)).toEqual({ x: [keyframe(0, 0), keyframe(1, 1)] });
    expect(removeKey({ y: [keyframe(1, 0.3)] }, 'y', 1)).toBeUndefined();
  });

  it('moveKey moves one value’s key or every value’s key at a time, keeping order', () => {
    const keys: Keyframes<ClipKeyProp> = {
      x: [keyframe(0, 0), keyframe(1, 1), keyframe(2, 0)],
      y: [keyframe(1, 0.3, 'hold'), keyframe(3, 0.4)],
    };
    expect(moveKey(keys, 'x', 1, 2.5)).toEqual({ x: [keyframe(0, 0), keyframe(2, 0), keyframe(2.5, 1)], y: keys.y });
    expect(moveKey(keys, 'all', 1, 0.5)).toEqual({
      x: [keyframe(0, 0), keyframe(0.5, 1), keyframe(2, 0)],
      y: [keyframe(0.5, 0.3, 'hold'), keyframe(3, 0.4)],
    });
    // Nothing at `from`: unchanged.
    expect(moveKey(keys, 'all', 5, 1)).toBe(keys);
  });

  it('moveKey onto another key replaces it', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [keyframe(0, 0), keyframe(1, 1), keyframe(2, 0.5)] };
    expect(moveKey(keys, 'x', 1, 2)).toEqual({ x: [keyframe(0, 0), keyframe(2, 1)] });
    expect(moveKey(keys, 'x', 0, 1.01)).toEqual({ x: [keyframe(1.01, 0), keyframe(2, 0.5)] });
  });

  it('setEase changes the ease of one value’s key or every value’s key at a time', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [keyframe(0, 0), keyframe(1, 1)], y: [keyframe(1, 0.3)] };
    expect(setEase(keys, 'x', 0, 'hold')).toEqual({ x: [keyframe(0, 0, 'hold'), keyframe(1, 1)], y: keys.y });
    expect(setEase(keys, 'all', 1, 'linear')).toEqual({
      x: [keyframe(0, 0), keyframe(1, 1, 'linear')],
      y: [keyframe(1, 0.3, 'linear')],
    });
    expect(setEase(keys, 'all', 7, 'linear')).toBe(keys);
  });

  it('animate starts a value with a key at its current value', () => {
    const timedClip = clip({ tf: { ...IDENTITY, x: 0.3 } });
    expect(animate(timedClip, 'x', 1.5)).toEqual({ x: [keyframe(1.5, 0.3)] });
    expect(animate(timedClip, 'volume', 0)).toEqual({ volume: [keyframe(0, 0.8)] });
    expect(animate(clip(), 'w', 0)).toEqual({ w: [keyframe(0, 1)] });
    const layer = { ...newSticker('⭐'), rot: 45 };
    expect(animate(layer, 'rot', 2)).toEqual({ rot: [keyframe(2, 45)] });
    // Already animated: a key at the animated value there.
    const moving = clip({ keys: { x: [keyframe(0, 0, 'linear'), keyframe(2, 1)] } });
    expect(animate(moving, 'x', 1)).toEqual({ x: [keyframe(0, 0, 'linear'), keyframe(1, 0.5), keyframe(2, 1)] });
  });

  it('stopAnimating (Remove animation) keeps the value at the playhead as the stored one', () => {
    const timedClip = clip({
      tf: { ...IDENTITY, y: 0.2 },
      keys: { x: [keyframe(0, 0, 'linear'), keyframe(2, 1)], volume: [keyframe(0, 0.5)] },
    });
    expect(stopAnimating(timedClip, 'x', 1)).toEqual({
      tf: { ...IDENTITY, y: 0.2, x: 0.5 },
      keys: { volume: [keyframe(0, 0.5)] },
    });
    expect(stopAnimating(timedClip, 'volume', 1)).toEqual({ volume: 0.5, keys: { x: defined(timedClip.keys).x } });
    const only = clip({ keys: { opacity: [keyframe(0, 0.25)] } });
    expect(stopAnimating(only, 'opacity', 0)).toEqual({ tf: { ...IDENTITY, opacity: 0.25 }, keys: undefined });
    const layer = { ...newSticker('⭐'), start: 1, keys: { opacity: [keyframe(0, 1, 'linear'), keyframe(1, 0)] } };
    expect(stopAnimating(layer, 'opacity', 0.5)).toEqual({ opacity: 0.5, keys: undefined });
  });

  it('countKeys counts every key of an item', () => {
    expect(countKeys(undefined)).toBe(0);
    expect(countKeys({ x: [keyframe(0, 0), keyframe(1, 1)], y: [keyframe(1, 0.3)] })).toBe(3);
  });

  it('shiftKeys moves every key by the same time; by 0 it is the same object', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [keyframe(0, 0), keyframe(1, 1)], y: [keyframe(1, 0.3)] };
    expect(shiftKeys(keys, -0.5)).toEqual({ x: [keyframe(-0.5, 0), keyframe(0.5, 1)], y: [keyframe(0.5, 0.3)] });
    expect(shiftKeys(keys, 0)).toBe(keys);
    expect(shiftKeys(undefined, 2)).toBeUndefined();
  });

  it('splitKeys gives each part its keys plus one at the cut holding the value there', () => {
    const keys: Keyframes<ClipKeyProp> = {
      x: [keyframe(0, 0, 'linear'), keyframe(2, 1, 'hold'), keyframe(4, 0)],
      opacity: [keyframe(3, 0.5)],
    };
    const [left, right] = splitKeys(keys, 1);
    expect(left).toEqual({ x: [keyframe(0, 0, 'linear'), keyframe(1, 0.5, 'linear')], opacity: [keyframe(1, 0.5)] });
    expect(right).toEqual({
      x: [keyframe(0, 0.5, 'linear'), keyframe(1, 1, 'hold'), keyframe(3, 0)],
      opacity: [keyframe(0, 0.5), keyframe(2, 0.5)],
    });
    // The values on either side of the cut are unchanged at every time.
    for (let time = 0; time <= 5; time += 0.125) {
      const before = valueAt(defined(keys.x), time);
      expect(
        time <= 1 ? valueAt(defined(defined(left).x), time) : valueAt(defined(defined(right).x), time - 1),
      ).toBeCloseTo(before, 12);
    }
    // A cut exactly on a key.
    const [l2, r2] = splitKeys(keys, 2);
    expect(defined(l2).x).toEqual([keyframe(0, 0, 'linear'), keyframe(2, 1, 'hold')]);
    expect(defined(r2).x).toEqual([keyframe(0, 1, 'hold'), keyframe(2, 0)]);
    expect(splitKeys(undefined, 1)).toEqual([undefined, undefined]);
  });
});

/* ---------- 205 T016: AC-8 (every frame of the export's grid) and AC-12 (timing) ---------- */

/**
 * The CSS curves solved by plain bisection (60 halvings): a reference independent of the module's solver.
 * @param ease the curve
 * @param progress linear progress, 0–1
 * @returns the eased progress
 */
function referenceEase(ease: Ease, progress: number): number {
  if (ease === 'linear') return progress;
  if (ease === 'hold') return 0;
  const [x1, y1, x2, y2] = {
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1],
  }[ease];
  const bezier = (first: number, second: number, share: number) =>
    3 * first * share * (1 - share) ** 2 + 3 * second * share * share * (1 - share) + share ** 3;
  let low = 0,
    high = 1;
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < progress) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}

/**
 * A change from `from` to `to` over [start, end] eased by `ease`, held before and after.
 * @param from the value before
 * @param to the value after
 * @param start when the change starts
 * @param end when it ends
 * @param ease its ease
 * @returns the value at a time
 */
const segment = (from: number, to: number, start: number, end: number, ease: Ease) => (time: number) => {
  if (time <= start) return from;
  if (time >= end) return to;
  return from + (to - from) * referenceEase(ease, (time - start) / (end - start));
};

describe('AC-8: the fixture’s values at every frame of the export’s grid', () => {
  // A clip on the timeline from 1 s to 4 s that moves from the top-left corner to the bottom-right one with Ease in
  // and out over its first 2 s while it turns 90°, and fades from 100 % to 0 (linearly) over its whole length.
  const movingClip = clip({
    start: 1,
    in: 0,
    out: 3,
    tf: { ...IDENTITY, w: 0.35 },
    keys: {
      x: [
        { t: 0, v: 0.2, ease: 'ease-in-out' },
        { t: 2, v: 0.8, ease: 'ease-in-out' },
      ],
      y: [
        { t: 0, v: 0.2, ease: 'ease-in-out' },
        { t: 2, v: 0.8, ease: 'ease-in-out' },
      ],
      rot: [
        { t: 0, v: 0, ease: 'ease-in-out' },
        { t: 2, v: 90, ease: 'ease-in-out' },
      ],
      opacity: [
        { t: 0, v: 1, ease: 'linear' },
        { t: 3, v: 0, ease: 'linear' },
      ],
    },
  });
  // A title from 0.5 s to 4.5 s that flies in from the left (Ease out, 0.5 s), holds, and fades out over its last
  // second (held at 100 % until then).
  const title = {
    ...newSticker('⭐'),
    start: 0.5,
    end: 4.5,
    keys: {
      x: [
        { t: 0, v: -0.3, ease: 'ease-out' as const },
        { t: 0.5, v: 0.5, ease: 'ease-in-out' as const },
      ],
      opacity: [
        { t: 0, v: 1, ease: 'hold' as const },
        { t: 3, v: 1, ease: 'linear' as const },
        { t: 4, v: 0, ease: 'linear' as const },
      ],
    },
  };
  const expectedClip = {
    x: segment(0.2, 0.8, 0, 2, 'ease-in-out'),
    y: segment(0.2, 0.8, 0, 2, 'ease-in-out'),
    rot: segment(0, 90, 0, 2, 'ease-in-out'),
    opacity: segment(1, 0, 0, 3, 'linear'),
  };
  const expectedTitle = {
    x: segment(-0.3, 0.5, 0, 0.5, 'ease-out'),
    opacity: (time: number) => (time < 3 ? 1 : segment(1, 0, 3, 4, 'linear')(time)),
  };

  for (const fps of [30, 60]) {
    it(`at ${fps} fps every frame the clip and the title show equals the expected list`, () => {
      const [first, last] = frameRange(0, 5, fps);
      let frames = 0;
      for (let frame = first; frame < last; frame++) {
        const time = frame / fps;
        if (time >= movingClip.start && time < movingClip.start + 3) {
          const local = time - movingClip.start;
          const box = transformAt(movingClip, local);
          for (const prop of ['x', 'y', 'rot', 'opacity'] as const)
            expect(box[prop], `clip ${prop} at frame ${frame}`).toBeCloseTo(expectedClip[prop](local), 9);
          expect([box.w, box.radius]).toEqual([0.35, 0]);
          // The same evaluation every time it is asked (the preview's and the export's are one).
          expect(transformAt(movingClip, local)).toEqual(box);
          frames++;
        }
        if (time >= title.start && time < title.end) {
          const shown = layerAt(title, time);
          expect(shown.x, `title x at frame ${frame}`).toBeCloseTo(expectedTitle.x(time - title.start), 9);
          expect(shown.opacity, `title opacity at frame ${frame}`).toBeCloseTo(
            expectedTitle.opacity(time - title.start),
            9,
          );
          expect([shown.y, shown.w, shown.rot]).toEqual([title.y, title.w, title.rot]);
        }
      }
      expect(frames).toBe(3 * fps);
    });
  }

  it('the keyframes’ own frames land exactly on their values', () => {
    expect(transformAt(movingClip, 0)).toEqual({ ...IDENTITY, w: 0.35, x: 0.2, y: 0.2, rot: 0, opacity: 1 });
    expect(transformAt(movingClip, 2)).toMatchObject({ x: 0.8, y: 0.8, rot: 90 });
    expect(layerAt(title, 1).x).toBe(0.5);
    expect(layerAt(title, 3.5).opacity).toBe(1);
  });
});

describe('AC-12: working out a frame’s animated values', () => {
  /**
   * 500 clips on four tracks, 0.5 s apart, 10 keys each (5,000 keys).
   * @param withKeys give each clip its keys
   * @returns the clips
   */
  const project = (withKeys: boolean) =>
    Array.from({ length: 500 }, (_, index) =>
      clip({
        id: `c${index}`,
        track: `v${index % 4}`,
        start: index * 0.5,
        in: 0,
        out: 2,
        tf: { ...IDENTITY, w: 0.5 },
        ...(withKeys
          ? {
              keys: {
                x: [0, 0.5, 1, 1.5].map((time, nth) => ({
                  t: time,
                  v: 0.2 + nth * 0.2,
                  ease: 'ease-in-out' as const,
                })),
                opacity: [0, 1, 2].map((time, nth) => ({ t: time, v: 1 - nth * 0.4, ease: 'linear' as const })),
                volume: [0, 1, 2].map((time, nth) => ({ t: time, v: 1 - nth * 0.3, ease: 'ease-out' as const })),
              },
            }
          : {}),
      }),
    );

  it('takes at most 0.05 ms (median of 200 frames) with 500 clips and 5,000 keys', () => {
    const clips = project(true);
    expect(clips.reduce((sum, timedClip) => sum + countKeys(timedClip.keys), 0)).toBe(5000);
    const runs: number[] = [];
    let sink = 0;
    for (let run = 0; run < 200; run++) {
      const time = 3 + ((run * 7.31) % 240);
      const started = performance.now();
      for (const timedClip of clips) {
        const local = time - timedClip.start;
        if (local < 0 || local >= 2) continue;
        sink += transformAt(timedClip, local).x + volumeAt(timedClip, local);
      }
      runs.push(performance.now() - started);
    }
    runs.sort((left, right) => left - right);
    expect(sink).toBeGreaterThan(0);
    expect(runs[100]).toBeLessThanOrEqual(0.05);
  });

  it('a project without keys gives back each clip’s own box and volume (nothing allocated)', () => {
    for (const timedClip of project(false)) {
      expect(transformAt(timedClip, 0.7)).toBe(timedClip.tf);
      expect(volumeAt(timedClip, 0.7)).toBe(timedClip.volume);
    }
  });
});

/* ---------- 205 T030: what renderStack and drawLayers draw ---------- */

describe('itemTransform and layersAt: one evaluation for the preview and the export (AC-8, AC-11)', () => {
  /**
   * A stack item as the preview and the export build it: the whole clip spread in, with `overlay`.
   * @param timedClip the clip
   * @param local the time inside it
   * @returns the stack item
   */
  const draw = (timedClip: TimedClip & { volume: number }, local: number): StackDraw => ({
    clip: { ...timedClip, edit: {} as StackDraw['clip']['edit'], motion: 'none', fade: false, overlay: true },
    src: null,
    sw: 0,
    sh: 0,
    local,
  });

  it('gives back the stored box itself when nothing is animated', () => {
    const tf: ClipTransform = { x: 0.2, y: 0.3, w: 0.4, rot: 10, opacity: 0.9, radius: 0.1 };
    const stored = draw(clip({ tf }), 1);
    expect(itemTransform(stored)).toBe(stored.clip.tf);
    expect(itemTransform(draw(clip(), 1))).toBe(IDENTITY);
  });

  it('gives the keyed values at the item’s own time', () => {
    const keyed = clip({ tf: { ...IDENTITY, w: 0.5 }, keys: { x: pair(0, 1, 'linear'), opacity: pair(1, 0, 'hold') } });
    expect(itemTransform(draw(keyed, 0.25))).toEqual({ ...IDENTITY, w: 0.5, x: 0.25, opacity: 1 });
    expect(itemTransform(draw(keyed, 1))).toEqual({ ...IDENTITY, w: 0.5, x: 1, opacity: 0 });
  });

  it('layersAt gives back the same layers without a time (the photo editor) or without keys', () => {
    const plain = [newSticker('⭐'), newSticker('🌙')];
    expect(layersAt(plain, 2)).toBe(plain);
    const keyed = [plain[0], { ...newSticker('⭐'), start: 1, keys: { opacity: pair(1, 0, 'linear') } }];
    expect(layersAt(keyed)).toBe(keyed);
  });

  it('layersAt evaluates only the keyed layers at timeline time', () => {
    const plain = newSticker('⭐');
    const keyed = { ...newSticker('🌙'), start: 1, keys: { opacity: pair(1, 0, 'linear') } };
    const shown = layersAt([plain, keyed], 1.5);
    expect(shown[0]).toBe(plain);
    expect(shown[1].opacity).toBeCloseTo(0.5, 12);
    expect(keyed.opacity).toBe(1);
  });
});

/* ---------- 205 T040: the export's gain curve (AC-10) ---------- */

describe('gainCurve: the volume the export sets for a source in one window (AC-10)', () => {
  const source = (extra: Partial<SoundSource> = {}): SoundSource => ({
    ref: 'c1',
    start: 2,
    end: 14,
    from: 0,
    volume: 0.8,
    fadeIn: 0.03,
    fadeOut: 0.03,
    ...extra,
  });
  /**
   * The exact volume at timeline time t: the keys (or the stored volume) times the end ramps, worked out here.
   * @param soundSource the sound
   * @param time the timeline time
   * @returns the volume
   */
  const exact = (soundSource: SoundSource, time: number) => {
    let value = soundSource.gain ? valueAt(soundSource.gain, time - soundSource.start) : soundSource.volume;
    if (time < soundSource.start + soundSource.fadeIn)
      value *= Math.max(0, (time - soundSource.start) / soundSource.fadeIn);
    if (time > soundSource.end - soundSource.fadeOut)
      value *= Math.max(0, (soundSource.end - time) / soundSource.fadeOut);
    return value;
  };
  /**
   * The curve as setValueCurveAtTime plays it: its points spread evenly over [from, from + length], linear between.
   * @param curve the curve's points
   * @param from when it starts
   * @param length how long it lasts
   * @param time the time asked
   * @returns the volume played
   */
  const played = (curve: Float32Array, from: number, length: number, time: number) => {
    const at = ((time - from) / length) * (curve.length - 1);
    const index = Math.min(curve.length - 2, Math.floor(at));
    return curve[index] + (curve[index + 1] - curve[index]) * (at - index);
  };
  /**
   * Played vs exact every 0.5 ms: within 0.5 dB where the sound is above −40 dB, within 0.001 below.
   * @param soundSource the sound
   * @param from the window's start
   * @param length the window's length
   * @returns the worst difference above −40 dB, in dB
   */
  const within = (soundSource: SoundSource, from: number, length: number) => {
    const curve = gainCurve(soundSource, from, length);
    expect(length / (curve.length - 1)).toBeLessThanOrEqual(0.005 + 1e-12);
    let worst = 0;
    for (let time = from; time <= from + length; time += 0.0005) {
      const want = exact(soundSource, time),
        got = played(curve, from, length, time);
      if (want >= 0.01) worst = Math.max(worst, Math.abs(20 * Math.log10(got / want)));
      else expect(Math.abs(got - want)).toBeLessThan(0.001);
    }
    expect(worst).toBeLessThanOrEqual(0.5);
    return worst;
  };

  it('a source without keys gives today’s ramp values at every point', () => {
    const soundSource = source();
    const curve = gainCurve(soundSource, 2, 10);
    curve.forEach((value, index) =>
      expect(value).toBeCloseTo(exact(soundSource, 2 + (index * 10) / (curve.length - 1)), 6),
    );
    expect(curve[0]).toBe(0);
    within(soundSource, 2, 10);
    within(soundSource, 10, 4);
  });

  it('volume keys (linear and eased, a dip to 0 and back) stay within 0.5 dB, ramps included', () => {
    const soundSource = source({
      volume: 0,
      gain: [
        { t: 0, v: 1, ease: 'ease-in-out' },
        { t: 1.5, v: 0.2, ease: 'linear' },
        { t: 3, v: 0.2, ease: 'ease-in' },
        { t: 3.4, v: 0, ease: 'ease-out' },
        { t: 5, v: 1, ease: 'ease-in-out' },
        { t: 11.98, v: 0.5, ease: 'linear' },
      ],
    });
    within(soundSource, 2, 10);
    within(soundSource, 12, 2);
  });

  it('two adjacent windows meet with equal values', () => {
    const soundSource = source({
      gain: [
        { t: 0, v: 0, ease: 'ease-in-out' },
        { t: 12, v: 1, ease: 'linear' },
      ],
    });
    for (const edge of [5, 10, 12.345]) {
      const left = gainCurve(soundSource, 2, edge - 2),
        right = gainCurve(soundSource, edge, 14 - edge);
      expect(left[left.length - 1]).toBeCloseTo(right[0], 6);
      expect(right[0]).toBeCloseTo(exact(soundSource, edge), 6);
    }
  });

  it('a Hold jump becomes one step’s ramp, not a click', () => {
    const soundSource = source({
      gain: [
        { t: 0, v: 1, ease: 'hold' },
        { t: 3, v: 0.25, ease: 'linear' },
      ],
    });
    const curve = gainCurve(soundSource, 2, 10);
    const step = 10 / (curve.length - 1);
    const changes = [...curve]
      .map((value, index) => (index ? Math.abs(value - curve[index - 1]) : 0))
      .filter((delta) => delta > 1e-6);
    // Only the fade-in's points and the one step across the jump change the value.
    expect(changes.filter((change) => change > 0.2)).toHaveLength(1);
    expect(step).toBeLessThanOrEqual(0.005 + 1e-12);
  });
});

/* ---------- 205 T060: the inspector's keyframe button and previous / next ---------- */

describe('keyState and adjacentKey (the inspector, AC-6)', () => {
  const keys: Keyframe[] = [
    { t: 1, v: 0, ease: 'linear' },
    { t: 3, v: 1, ease: 'linear' },
  ];

  it('keyState: not animated, at a key (within half a frame), or between keys', () => {
    expect(keyState(undefined, 1)).toBe('none');
    expect(keyState([], 1)).toBe('none');
    expect(keyState(keys, 1)).toBe('key');
    expect(keyState(keys, 3 + 0.4 / 30)).toBe('key');
    expect(keyState(keys, 2)).toBe('between');
    // Before the first key and after the last the value is animated too (held).
    expect(keyState(keys, 0)).toBe('between');
    expect(keyState(keys, 9, 60)).toBe('between');
  });

  it('adjacentKey: the previous / next key time of any animated value, skipping the one at the playhead', () => {
    const withKeys = { keys: { x: keys, opacity: [{ t: 2, v: 1, ease: 'hold' as const }] } };
    expect(adjacentKey(withKeys, 0, 1)).toBe(1);
    expect(adjacentKey(withKeys, 1, 1)).toBe(2);
    expect(adjacentKey(withKeys, 1 + 0.2 / 30, 1)).toBe(2);
    expect(adjacentKey(withKeys, 2.5, -1)).toBe(2);
    expect(adjacentKey(withKeys, 2, -1)).toBe(1);
    expect(adjacentKey(withKeys, 3, 1)).toBeNull();
    expect(adjacentKey(withKeys, 1, -1)).toBeNull();
    expect(adjacentKey({}, 1, 1)).toBeNull();
  });
});

/* ---------- 206 T040: sound across a transition (AC-6) ---------- */

describe('edgeGain: the clips’ sound across a transition (206 AC-6, Q6)', () => {
  /**
   * 205's Ease in and out at linear progress `share`: transitions ease their sound as their picture.
   * @param share linear progress, 0–1
   * @returns the eased progress
   */
  const eased = (share: number) =>
    valueAt(
      [
        { t: 0, v: 0, ease: 'ease-in-out' },
        { t: 1, v: 1, ease: 'ease-in-out' },
      ],
      share,
    );
  const sound = (extra: Partial<SoundSource>): SoundSource => ({
    ref: 'x',
    start: 0,
    end: 4,
    from: 0,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    ...extra,
  });
  // A plays 0–4 and goes on 0.5 s past its end; B plays 4–8 and starts 0.5 s before: a 1 s transition on the cut at 4.
  const outgoing = sound({ ref: 'a', trail: 0.5, edgeOut: 'power' }),
    incoming = sound({ ref: 'b', start: 4, end: 8, lead: 0.5, edgeIn: 'power' });

  it('equal power: the squares of the two gains sum to 1 within 1 % at every millisecond of the transition', () => {
    for (let time = 3.5; time <= 4.5; time += 0.001) {
      const sum = edgeGain(outgoing, time) ** 2 + edgeGain(incoming, time) ** 2;
      expect(Math.abs(sum - 1)).toBeLessThan(0.01);
    }
    expect([edgeGain(outgoing, 3.5), edgeGain(incoming, 3.5)]).toEqual([1, 0]);
    expect(edgeGain(outgoing, 4.5)).toBeCloseTo(0, 12);
    expect(edgeGain(incoming, 4.5)).toBeCloseTo(1, 12);
    // Follows the eased progress, as the picture does.
    expect(edgeGain(incoming, 3.75)).toBeCloseTo(Math.sin((Math.PI / 2) * eased(0.25)), 12);
  });

  it('a dip: the outgoing sound down to silence by the cut, the incoming up from it', () => {
    const out = sound({ trail: 0.5, edgeOut: 'dip' }),
      into = sound({ start: 4, end: 8, lead: 0.5, edgeIn: 'dip' });
    expect(edgeGain(out, 3.5)).toBe(1);
    expect(edgeGain(out, 4)).toBeCloseTo(0, 12);
    expect(edgeGain(out, 4.2)).toBe(0);
    expect(edgeGain(into, 3.8)).toBe(0);
    expect(edgeGain(into, 4)).toBeCloseTo(0, 12);
    expect(edgeGain(into, 4.5)).toBeCloseTo(1, 12);
    expect(edgeGain(out, 3.75)).toBeCloseTo(1 - 2 * eased(0.25), 12);
  });

  it('is 1 away from transitions and for sources without them', () => {
    expect(edgeGain(outgoing, 2)).toBe(1);
    expect(edgeGain(incoming, 6)).toBe(1);
    expect(edgeGain(sound({}), 3.99)).toBe(1);
  });

  it('sourceGainAt multiplies it in, over the clip’s volume or its volume keyframes; no 0.03 s ramp at a transition edge', () => {
    const keyed = { ...incoming, gain: [{ t: 0, v: 0.5, ease: 'hold' as const }] };
    expect(sourceGainAt(keyed, 3.75)).toBeCloseTo(0.5 * edgeGain(incoming, 3.75), 12);
    expect(sourceGainAt({ ...outgoing, volume: 0.8 }, 3.75)).toBeCloseTo(0.8 * edgeGain(outgoing, 3.75), 12);
  });

  it('gainCurve with transition edges stays within 0.5 dB of the exact curve (and with volume keyframes)', () => {
    const exact = (source: SoundSource, time: number) => {
      const easedFrom = (from: number) => eased(Math.min(1, Math.max(0, (time - from) / 1)));
      let value = source.gain ? valueAt(source.gain, time - source.start) : source.volume;
      if (source.lead) value *= Math.sin((Math.PI / 2) * easedFrom(source.start - source.lead));
      if (source.trail) value *= Math.cos((Math.PI / 2) * easedFrom(source.end - source.trail));
      return value;
    };
    for (const source of [
      incoming,
      outgoing,
      {
        ...incoming,
        gain: [
          { t: 0, v: 0.2, ease: 'linear' as const },
          { t: 2, v: 1, ease: 'linear' as const },
        ],
      },
    ]) {
      const from = 3.4,
        length = 1.2;
      const curve = gainCurve(source, from, length);
      for (let time = from; time <= from + length; time += 0.0005) {
        const at = ((time - from) / length) * (curve.length - 1);
        const index = Math.min(curve.length - 2, Math.floor(at));
        const got = curve[index] + (curve[index + 1] - curve[index]) * (at - index),
          want = exact(source, time);
        if (want >= 0.01) expect(Math.abs(20 * Math.log10(got / want))).toBeLessThanOrEqual(0.5);
        else expect(Math.abs(got - want)).toBeLessThan(0.001);
      }
    }
  });
});
