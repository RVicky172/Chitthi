import { describe, expect, it } from 'vitest';
import {
  KEY_LIMITS,
  animate,
  clampValue,
  countKeys,
  isAnimated,
  layerAt,
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
} from './keyframes';
import { newSticker } from './layers';
import { IDENTITY, type ClipTransform, type TimedClip } from './timeline';

/** A video clip on the main track, 10 s long, starting at 2 s on the timeline. */
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

/** Two keys: `a` at 0 s and `b` at 1 s, the change between them eased by `ease`. */
const pair = (a: number, b: number, ease: Ease): Keyframe[] => [
  { t: 0, v: a, ease },
  { t: 1, v: b, ease: 'linear' },
];

describe('valueAt', () => {
  const keys: Keyframe[] = [
    { t: 1, v: 10, ease: 'linear' },
    { t: 2, v: 20, ease: 'hold' },
    { t: 4, v: 40, ease: 'ease-in-out' },
    { t: 5, v: 0, ease: 'linear' },
  ];

  it('is exact at every key', () => {
    for (const k of keys) expect(valueAt(keys, k.t)).toBe(k.v);
  });

  it('holds the first value before the first key and the last after the last', () => {
    expect(valueAt(keys, 0)).toBe(10);
    expect(valueAt(keys, -3)).toBe(10);
    expect(valueAt(keys, 5.5)).toBe(0);
    expect(valueAt(keys, 1e9)).toBe(0);
  });

  it('a single key is a constant', () => {
    const one: Keyframe[] = [{ t: 3, v: 0.4, ease: 'ease-in-out' }];
    for (const t of [0, 3, 7]) expect(valueAt(one, t)).toBe(0.4);
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
      at.forEach((p, i) => expect(Math.abs(valueAt(pair(0, 1, ease), p) - css[ease][i])).toBeLessThan(0.001));
      // Scaled and reversed: 100 → 0 over 2 s, starting at 3 s.
      const k: Keyframe[] = [
        { t: 3, v: 100, ease },
        { t: 5, v: 0, ease: 'hold' },
      ];
      at.forEach((p, i) => expect(Math.abs(valueAt(k, 3 + 2 * p) - (100 - 100 * css[ease][i]))).toBeLessThan(0.1));
    });
  }

  it('eases are monotonic and stay between their keys', () => {
    for (const ease of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      let last = -Infinity;
      for (let i = 0; i <= 1000; i++) {
        const v = valueAt(pair(0, 1, ease), i / 1000);
        expect(v).toBeGreaterThanOrEqual(last - 1e-12);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        last = v;
      }
    }
  });

  it('finds the right segment among many keys (binary search)', () => {
    const many: Keyframe[] = Array.from({ length: 100 }, (_, i) => ({ t: i, v: i * 2, ease: 'linear' as const }));
    for (const t of [0.5, 17.25, 63.5, 98.75]) expect(valueAt(many, t)).toBeCloseTo(t * 2, 10);
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
    for (const [prop, v, want] of cases) expect(clampValue(prop, v, 'clip')).toBe(want);
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
    for (const [prop, v, want] of cases) expect(clampValue(prop, v, 'layer')).toBe(want);
    expect(clampValue('rot', 270, 'layer')).toBe(270);
  });
});

describe('transformAt / volumeAt / layerAt', () => {
  it('return the stored values themselves when nothing is animated', () => {
    const tf: ClipTransform = { x: 0.2, y: 0.3, w: 0.4, rot: 10, opacity: 0.9, radius: 0.1 };
    const c = clip({ tf });
    expect(transformAt(c, 1)).toBe(tf);
    expect(transformAt(clip(), 1)).toBe(IDENTITY);
    expect(transformAt(clip({ tf, keys: {} }), 1)).toBe(tf);
    expect(transformAt(clip({ tf, keys: { x: [] } }), 1)).toBe(tf);
    expect(volumeAt(c, 1)).toBe(0.8);
    const layer = newSticker('⭐');
    expect(layerAt(layer, 3)).toBe(layer);
  });

  it('transformAt replaces only the animated fields, in clip time', () => {
    const tf: ClipTransform = { x: 0.2, y: 0.3, w: 0.4, rot: 10, opacity: 0.9, radius: 0.1 };
    const c = clip({
      tf,
      keys: {
        x: [
          { t: 0, v: 0, ease: 'linear' },
          { t: 2, v: 1, ease: 'linear' },
        ],
        opacity: [{ t: 1, v: 0.5, ease: 'hold' }],
      },
    });
    expect(transformAt(c, 1)).toEqual({ ...tf, x: 0.5, opacity: 0.5 });
    expect(transformAt(c, 3)).toEqual({ ...tf, x: 1, opacity: 0.5 });
    expect(c.tf).toEqual(tf);
  });

  it('transformAt animates from the identity when the clip has no box', () => {
    const c = clip({ keys: { w: pair(1, 0.5, 'linear') } });
    expect(transformAt(c, 0.5)).toEqual({ ...IDENTITY, w: 0.75 });
  });

  it('volumeAt follows the volume keys and ignores the box keys', () => {
    const c = clip({ keys: { volume: pair(1, 0, 'linear'), x: pair(0, 1, 'linear') } });
    expect(volumeAt(c, 0.25)).toBeCloseTo(0.75, 12);
    expect(volumeAt(c, 9)).toBe(0);
  });

  it('layerAt evaluates at timeline time minus the layer’s start', () => {
    const layer = { ...newSticker('⭐'), start: 4, end: 8, keys: { opacity: pair(1, 0, 'linear'), rot: pair(0, 90, 'hold') } };
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

  it('values out of range in keys are clamped when evaluated', () => {
    const c = clip({ keys: { opacity: [{ t: 0, v: 3, ease: 'linear' }] } });
    expect(transformAt(c, 0).opacity).toBe(1);
  });
});

describe('isAnimated', () => {
  it('is true only for a value with at least one key', () => {
    const c = clip({ keys: { x: pair(0, 1, 'linear'), y: [] } });
    expect(isAnimated(c, 'x')).toBe(true);
    expect(isAnimated(c, 'y')).toBe(false);
    expect(isAnimated(c, 'volume')).toBe(false);
    expect(isAnimated(clip(), 'x')).toBe(false);
    expect(isAnimated(newSticker('⭐'), 'opacity')).toBe(false);
  });
});

describe('pure edits', () => {
  const k = (t: number, v: number, ease: Ease = 'ease-in-out'): Keyframe => ({ t, v, ease });
  const clipEdit = { on: 'clip' as const };

  it('setKey adds a key in time order with Ease in and out, on empty keys too', () => {
    const one = setKey(undefined, 'x', 1, 0.2, clipEdit);
    expect(one).toEqual({ x: [k(1, 0.2)] });
    const two = setKey(one as Keyframes<ClipKeyProp>, 'x', 0.5, 0.4, clipEdit);
    expect(two).toEqual({ x: [k(0.5, 0.4), k(1, 0.2)] });
    const other = setKey(two as Keyframes<ClipKeyProp>, 'opacity', 0, 1, clipEdit);
    expect(other).toEqual({ x: [k(0.5, 0.4), k(1, 0.2)], opacity: [k(0, 1)] });
    // The input is not changed.
    expect(one).toEqual({ x: [k(1, 0.2)] });
  });

  it('setKey replaces the value of a key within half a frame, keeping its time and ease', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [k(1, 0.2, 'hold')] };
    expect(setKey(keys, 'x', 1 + 0.4 / 30, 0.9, clipEdit)).toEqual({ x: [k(1, 0.9, 'hold')] });
    expect(setKey(keys, 'x', 1 - 0.4 / 60, 0.9, { ...clipEdit, fps: 60 })).toEqual({ x: [k(1, 0.9, 'hold')] });
    // Just over half a frame: a new key.
    expect((setKey(keys, 'x', 1 + 0.6 / 30, 0.9, clipEdit) as Keyframes<ClipKeyProp>).x).toHaveLength(2);
  });

  it('setKey clamps the value to its range', () => {
    expect(setKey(undefined, 'opacity', 0, 4, clipEdit)).toEqual({ opacity: [k(0, 1)] });
    expect(setKey(undefined, 'w', 0, 0, clipEdit)).toEqual({ w: [k(0, 0.05)] });
    expect(setKey(undefined, 'w', 0, 0, { on: 'layer' })).toEqual({ w: [k(0, 0.01)] });
    expect(setKey(undefined, 'volume', 0, -1, clipEdit)).toEqual({ volume: [k(0, 0)] });
  });

  it('setKey refuses a 101st key on a value and a 5,001st in the project, with a message', () => {
    const full: Keyframes<ClipKeyProp> = { x: Array.from({ length: 100 }, (_, i) => k(i, 0.5)) };
    const refused = setKey(full, 'x', 200, 0.5, clipEdit);
    expect(refused).toEqual({ error: expect.stringContaining('100') });
    // Replacing a key on a full value is fine.
    expect(setKey(full, 'x', 3, 0.1, clipEdit)).not.toHaveProperty('error');
    const project = setKey({}, 'y', 0, 0.5, { ...clipEdit, projectKeys: 5000 });
    expect(project).toEqual({ error: expect.stringContaining('5,000') });
    expect(setKey({}, 'y', 0, 0.5, { ...clipEdit, projectKeys: 4999 })).toEqual({ y: [k(0, 0.5)] });
    expect(KEY_LIMITS).toEqual({ perValue: 100, perProject: 5000 });
  });

  it('removeKey removes the key within half a frame; no keys left gives undefined', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [k(0, 0), k(1, 1)], y: [k(1, 0.3)] };
    expect(removeKey(keys, 'x', 1.01)).toEqual({ x: [k(0, 0)], y: [k(1, 0.3)] });
    expect(removeKey(keys, 'x', 0.5)).toBe(keys);
    expect(removeKey(keys, 'y', 1)).toEqual({ x: [k(0, 0), k(1, 1)] });
    expect(removeKey({ y: [k(1, 0.3)] }, 'y', 1)).toBeUndefined();
  });

  it('moveKey moves one value’s key or every value’s key at a time, keeping order', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [k(0, 0), k(1, 1), k(2, 0)], y: [k(1, 0.3, 'hold'), k(3, 0.4)] };
    expect(moveKey(keys, 'x', 1, 2.5)).toEqual({ x: [k(0, 0), k(2, 0), k(2.5, 1)], y: keys.y });
    expect(moveKey(keys, 'all', 1, 0.5)).toEqual({
      x: [k(0, 0), k(0.5, 1), k(2, 0)],
      y: [k(0.5, 0.3, 'hold'), k(3, 0.4)],
    });
    // Nothing at `from`: unchanged.
    expect(moveKey(keys, 'all', 5, 1)).toBe(keys);
  });

  it('moveKey onto another key replaces it', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [k(0, 0), k(1, 1), k(2, 0.5)] };
    expect(moveKey(keys, 'x', 1, 2)).toEqual({ x: [k(0, 0), k(2, 1)] });
    expect(moveKey(keys, 'x', 0, 1.01)).toEqual({ x: [k(1.01, 0), k(2, 0.5)] });
  });

  it('setEase changes the ease of one value’s key or every value’s key at a time', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [k(0, 0), k(1, 1)], y: [k(1, 0.3)] };
    expect(setEase(keys, 'x', 0, 'hold')).toEqual({ x: [k(0, 0, 'hold'), k(1, 1)], y: keys.y });
    expect(setEase(keys, 'all', 1, 'linear')).toEqual({ x: [k(0, 0), k(1, 1, 'linear')], y: [k(1, 0.3, 'linear')] });
    expect(setEase(keys, 'all', 7, 'linear')).toBe(keys);
  });

  it('animate starts a value with a key at its current value', () => {
    const c = clip({ tf: { ...IDENTITY, x: 0.3 } });
    expect(animate(c, 'x', 1.5)).toEqual({ x: [k(1.5, 0.3)] });
    expect(animate(c, 'volume', 0)).toEqual({ volume: [k(0, 0.8)] });
    expect(animate(clip(), 'w', 0)).toEqual({ w: [k(0, 1)] });
    const layer = { ...newSticker('⭐'), rot: 45 };
    expect(animate(layer, 'rot', 2)).toEqual({ rot: [k(2, 45)] });
    // Already animated: a key at the animated value there.
    const moving = clip({ keys: { x: [k(0, 0, 'linear'), k(2, 1)] } });
    expect(animate(moving, 'x', 1)).toEqual({ x: [k(0, 0, 'linear'), k(1, 0.5), k(2, 1)] });
  });

  it('stopAnimating (Remove animation) keeps the value at the playhead as the stored one', () => {
    const c = clip({ tf: { ...IDENTITY, y: 0.2 }, keys: { x: [k(0, 0, 'linear'), k(2, 1)], volume: [k(0, 0.5)] } });
    expect(stopAnimating(c, 'x', 1)).toEqual({ tf: { ...IDENTITY, y: 0.2, x: 0.5 }, keys: { volume: [k(0, 0.5)] } });
    expect(stopAnimating(c, 'volume', 1)).toEqual({ volume: 0.5, keys: { x: c.keys!.x } });
    const only = clip({ keys: { opacity: [k(0, 0.25)] } });
    expect(stopAnimating(only, 'opacity', 0)).toEqual({ tf: { ...IDENTITY, opacity: 0.25 }, keys: undefined });
    const layer = { ...newSticker('⭐'), start: 1, keys: { opacity: [k(0, 1, 'linear'), k(1, 0)] } };
    expect(stopAnimating(layer, 'opacity', 0.5)).toEqual({ opacity: 0.5, keys: undefined });
  });

  it('countKeys counts every key of an item', () => {
    expect(countKeys(undefined)).toBe(0);
    expect(countKeys({ x: [k(0, 0), k(1, 1)], y: [k(1, 0.3)] })).toBe(3);
  });

  it('shiftKeys moves every key by the same time; by 0 it is the same object', () => {
    const keys: Keyframes<ClipKeyProp> = { x: [k(0, 0), k(1, 1)], y: [k(1, 0.3)] };
    expect(shiftKeys(keys, -0.5)).toEqual({ x: [k(-0.5, 0), k(0.5, 1)], y: [k(0.5, 0.3)] });
    expect(shiftKeys(keys, 0)).toBe(keys);
    expect(shiftKeys(undefined, 2)).toBeUndefined();
  });

  it('splitKeys gives each part its keys plus one at the cut holding the value there', () => {
    const keys: Keyframes<ClipKeyProp> = {
      x: [k(0, 0, 'linear'), k(2, 1, 'hold'), k(4, 0)],
      opacity: [k(3, 0.5)],
    };
    const [left, right] = splitKeys(keys, 1);
    expect(left).toEqual({ x: [k(0, 0, 'linear'), k(1, 0.5, 'linear')], opacity: [k(1, 0.5)] });
    expect(right).toEqual({ x: [k(0, 0.5, 'linear'), k(1, 1, 'hold'), k(3, 0)], opacity: [k(0, 0.5), k(2, 0.5)] });
    // The values on either side of the cut are unchanged at every time.
    for (let t = 0; t <= 5; t += 0.125) {
      const before = valueAt(keys.x!, t);
      expect(t <= 1 ? valueAt(left!.x!, t) : valueAt(right!.x!, t - 1)).toBeCloseTo(before, 12);
    }
    // A cut exactly on a key.
    const [l2, r2] = splitKeys(keys, 2);
    expect(l2!.x).toEqual([k(0, 0, 'linear'), k(2, 1, 'hold')]);
    expect(r2!.x).toEqual([k(0, 1, 'hold'), k(2, 0)]);
    expect(splitKeys(undefined, 1)).toEqual([undefined, undefined]);
  });
});
