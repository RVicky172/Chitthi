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
import { IDENTITY } from '@/engine/video';
import { type ClipTransform, type TimedClip } from '@/engine/timeline';
import { type SoundSource } from '@/engine/soundPlan';
import { frameRange, itemTransform, type StackDraw } from '@/engine/video';

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

  it('an animated size scales the whole layer, as the Size slider does (a title’s font size too)', () => {
    const title = { ...newText(TEXT_STYLES[0], 'Hello'), w: 0.4, keys: { w: pair(0.4, 0.8, 'linear') } };
    const grown = layerAt(title, 1);
    expect(grown.w).toBeCloseTo(0.8, 12);
    expect(grown.size).toBeCloseTo(title.size * 2, 12);
    expect(title.size).toBe(newText(TEXT_STYLES[0], 'Hello').size);
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

/* ---------- 205 T016: AC-8 (every frame of the export's grid) and AC-12 (timing) ---------- */

/** The CSS curves solved by plain bisection (60 halvings): a reference independent of the module's solver. */
function referenceEase(ease: Ease, progress: number): number {
  if (ease === 'linear') return progress;
  if (ease === 'hold') return 0;
  const [x1, y1, x2, y2] = { 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] }[
    ease
  ];
  const bezier = (first: number, second: number, u: number) =>
    3 * first * u * (1 - u) ** 2 + 3 * second * u * u * (1 - u) + u ** 3;
  let low = 0,
    high = 1;
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < progress) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}

/** A change from `from` to `to` over [start, end] eased by `ease`, held before and after. */
const segment = (from: number, to: number, start: number, end: number, ease: Ease) => (t: number) =>
  t <= start ? from : t >= end ? to : from + (to - from) * referenceEase(ease, (t - start) / (end - start));

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
    opacity: (t: number) => (t < 3 ? 1 : segment(1, 0, 3, 4, 'linear')(t)),
  };

  for (const fps of [30, 60]) {
    it(`at ${fps} fps every frame the clip and the title show equals the expected list`, () => {
      const [first, last] = frameRange(0, 5, fps);
      let frames = 0;
      for (let n = first; n < last; n++) {
        const time = n / fps;
        if (time >= movingClip.start && time < movingClip.start + 3) {
          const local = time - movingClip.start;
          const box = transformAt(movingClip, local);
          for (const prop of ['x', 'y', 'rot', 'opacity'] as const)
            expect(box[prop], `clip ${prop} at frame ${n}`).toBeCloseTo(expectedClip[prop](local), 9);
          expect([box.w, box.radius]).toEqual([0.35, 0]);
          // The same evaluation every time it is asked (the preview's and the export's are one).
          expect(transformAt(movingClip, local)).toEqual(box);
          frames++;
        }
        if (time >= title.start && time < title.end) {
          const shown = layerAt(title, time);
          expect(shown.x, `title x at frame ${n}`).toBeCloseTo(expectedTitle.x(time - title.start), 9);
          expect(shown.opacity, `title opacity at frame ${n}`).toBeCloseTo(expectedTitle.opacity(time - title.start), 9);
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
  /** 500 clips on four tracks, 0.5 s apart, 10 keys each (5,000 keys). */
  const project = (withKeys: boolean) =>
    Array.from({ length: 500 }, (_, i) =>
      clip({
        id: `c${i}`,
        track: `v${i % 4}`,
        start: i * 0.5,
        in: 0,
        out: 2,
        tf: { ...IDENTITY, w: 0.5 },
        ...(withKeys
          ? {
              keys: {
                x: [0, 0.5, 1, 1.5].map((t, n) => ({ t, v: 0.2 + n * 0.2, ease: 'ease-in-out' as const })),
                opacity: [0, 1, 2].map((t, n) => ({ t, v: 1 - n * 0.4, ease: 'linear' as const })),
                volume: [0, 1, 2].map((t, n) => ({ t, v: 1 - n * 0.3, ease: 'ease-out' as const })),
              },
            }
          : {}),
      }),
    );

  it('takes at most 0.05 ms (median of 200 frames) with 500 clips and 5,000 keys', () => {
    const clips = project(true);
    expect(clips.reduce((n, c) => n + countKeys(c.keys), 0)).toBe(5000);
    const runs: number[] = [];
    let sink = 0;
    for (let run = 0; run < 200; run++) {
      const time = 3 + (run * 7.31) % 240;
      const started = performance.now();
      for (const c of clips) {
        const local = time - c.start;
        if (local < 0 || local >= 2) continue;
        sink += transformAt(c, local).x + volumeAt(c, local);
      }
      runs.push(performance.now() - started);
    }
    runs.sort((a, b) => a - b);
    expect(sink).toBeGreaterThan(0);
    expect(runs[100]).toBeLessThanOrEqual(0.05);
  });

  it('a project without keys gives back each clip’s own box and volume (nothing allocated)', () => {
    for (const c of project(false)) {
      expect(transformAt(c, 0.7)).toBe(c.tf);
      expect(volumeAt(c, 0.7)).toBe(c.volume);
    }
  });
});

/* ---------- 205 T030: what renderStack and drawLayers draw ---------- */

describe('itemTransform and layersAt: one evaluation for the preview and the export (AC-8, AC-11)', () => {
  /** A stack item as the preview and the export build it: the whole clip spread in, with `overlay`. */
  const item = (c: TimedClip & { volume: number }, local: number): StackDraw => ({
    clip: { ...c, edit: {} as StackDraw['clip']['edit'], motion: 'none', fade: false, overlay: true },
    src: null,
    sw: 0,
    sh: 0,
    local,
  });

  it('gives back the stored box itself when nothing is animated', () => {
    const tf: ClipTransform = { x: 0.2, y: 0.3, w: 0.4, rot: 10, opacity: 0.9, radius: 0.1 };
    const stored = item(clip({ tf }), 1);
    expect(itemTransform(stored)).toBe(stored.clip.tf);
    expect(itemTransform(item(clip(), 1))).toBe(IDENTITY);
  });

  it('gives the keyed values at the item’s own time', () => {
    const keyed = clip({ tf: { ...IDENTITY, w: 0.5 }, keys: { x: pair(0, 1, 'linear'), opacity: pair(1, 0, 'hold') } });
    expect(itemTransform(item(keyed, 0.25))).toEqual({ ...IDENTITY, w: 0.5, x: 0.25, opacity: 1 });
    expect(itemTransform(item(keyed, 1))).toEqual({ ...IDENTITY, w: 0.5, x: 1, opacity: 0 });
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
  /** The exact volume at timeline time t: the keys (or the stored volume) times the end ramps, worked out here. */
  const exact = (s: SoundSource, t: number) => {
    let v = s.gain ? valueAt(s.gain, t - s.start) : s.volume;
    if (t < s.start + s.fadeIn) v *= Math.max(0, (t - s.start) / s.fadeIn);
    if (t > s.end - s.fadeOut) v *= Math.max(0, (s.end - t) / s.fadeOut);
    return v;
  };
  /** The curve as setValueCurveAtTime plays it: its points spread evenly over [from, from + length], linear between. */
  const played = (curve: Float32Array, from: number, length: number, t: number) => {
    const at = ((t - from) / length) * (curve.length - 1);
    const i = Math.min(curve.length - 2, Math.floor(at));
    return curve[i] + (curve[i + 1] - curve[i]) * (at - i);
  };
  /** Played vs exact every 0.5 ms: within 0.5 dB where the sound is above −40 dB, within 0.001 below. */
  const within = (s: SoundSource, from: number, length: number) => {
    const curve = gainCurve(s, from, length);
    expect(length / (curve.length - 1)).toBeLessThanOrEqual(0.005 + 1e-12);
    let worst = 0;
    for (let t = from; t <= from + length; t += 0.0005) {
      const want = exact(s, t),
        got = played(curve, from, length, t);
      if (want >= 0.01) worst = Math.max(worst, Math.abs(20 * Math.log10(got / want)));
      else expect(Math.abs(got - want)).toBeLessThan(0.001);
    }
    expect(worst).toBeLessThanOrEqual(0.5);
    return worst;
  };

  it('a source without keys gives today’s ramp values at every point', () => {
    const s = source();
    const curve = gainCurve(s, 2, 10);
    curve.forEach((v, i) => expect(v).toBeCloseTo(exact(s, 2 + (i * 10) / (curve.length - 1)), 6));
    expect(curve[0]).toBe(0);
    within(s, 2, 10);
    within(s, 10, 4);
  });

  it('volume keys (linear and eased, a dip to 0 and back) stay within 0.5 dB, ramps included', () => {
    const s = source({
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
    within(s, 2, 10);
    within(s, 12, 2);
  });

  it('two adjacent windows meet with equal values', () => {
    const s = source({ gain: [{ t: 0, v: 0, ease: 'ease-in-out' }, { t: 12, v: 1, ease: 'linear' }] });
    for (const edge of [5, 10, 12.345]) {
      const left = gainCurve(s, 2, edge - 2),
        right = gainCurve(s, edge, 14 - edge);
      expect(left[left.length - 1]).toBeCloseTo(right[0], 6);
      expect(right[0]).toBeCloseTo(exact(s, edge), 6);
    }
  });

  it('a Hold jump becomes one step’s ramp, not a click', () => {
    const s = source({ gain: [{ t: 0, v: 1, ease: 'hold' }, { t: 3, v: 0.25, ease: 'linear' }] });
    const curve = gainCurve(s, 2, 10);
    const step = 10 / (curve.length - 1);
    const changes = [...curve].map((v, i) => (i ? Math.abs(v - curve[i - 1]) : 0)).filter((d) => d > 1e-6);
    // Only the fade-in's points and the one step across the jump change the value.
    expect(changes.filter((d) => d > 0.2)).toHaveLength(1);
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
    const item = { keys: { x: keys, opacity: [{ t: 2, v: 1, ease: 'hold' as const }] } };
    expect(adjacentKey(item, 0, 1)).toBe(1);
    expect(adjacentKey(item, 1, 1)).toBe(2);
    expect(adjacentKey(item, 1 + 0.2 / 30, 1)).toBe(2);
    expect(adjacentKey(item, 2.5, -1)).toBe(2);
    expect(adjacentKey(item, 2, -1)).toBe(1);
    expect(adjacentKey(item, 3, 1)).toBeNull();
    expect(adjacentKey(item, 1, -1)).toBeNull();
    expect(adjacentKey({}, 1, 1)).toBeNull();
  });
});

/* ---------- 206 T040: sound across a transition (AC-6) ---------- */

describe('edgeGain: the clips’ sound across a transition (206 AC-6, Q6)', () => {
  /** 205's Ease in and out at linear progress p: transitions ease their sound as their picture. */
  const eased = (p: number) => valueAt([{ t: 0, v: 0, ease: 'ease-in-out' }, { t: 1, v: 1, ease: 'ease-in-out' }], p);
  const sound = (extra: Partial<SoundSource>): SoundSource => ({ ref: 'x', start: 0, end: 4, from: 0, volume: 1, fadeIn: 0, fadeOut: 0, ...extra });
  // A plays 0–4 and goes on 0.5 s past its end; B plays 4–8 and starts 0.5 s before: a 1 s transition on the cut at 4.
  const outgoing = sound({ ref: 'a', trail: 0.5, edgeOut: 'power' }),
    incoming = sound({ ref: 'b', start: 4, end: 8, lead: 0.5, edgeIn: 'power' });

  it('equal power: the squares of the two gains sum to 1 within 1 % at every millisecond of the transition', () => {
    for (let t = 3.5; t <= 4.5; t += 0.001) {
      const sum = edgeGain(outgoing, t) ** 2 + edgeGain(incoming, t) ** 2;
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
    const exact = (s: SoundSource, t: number) => {
      const p = (from: number) => eased(Math.min(1, Math.max(0, (t - from) / 1)));
      let v = s.gain ? valueAt(s.gain, t - s.start) : s.volume;
      if (s.lead) v *= Math.sin((Math.PI / 2) * p(s.start - s.lead));
      if (s.trail) v *= Math.cos((Math.PI / 2) * p(s.end - s.trail));
      return v;
    };
    for (const s of [incoming, outgoing, { ...incoming, gain: [{ t: 0, v: 0.2, ease: 'linear' as const }, { t: 2, v: 1, ease: 'linear' as const }] }]) {
      const from = 3.4,
        length = 1.2;
      const curve = gainCurve(s, from, length);
      for (let t = from; t <= from + length; t += 0.0005) {
        const at = ((t - from) / length) * (curve.length - 1);
        const i = Math.min(curve.length - 2, Math.floor(at));
        const got = curve[i] + (curve[i + 1] - curve[i]) * (at - i),
          want = exact(s, t);
        if (want >= 0.01) expect(Math.abs(20 * Math.log10(got / want))).toBeLessThanOrEqual(0.5);
        else expect(Math.abs(got - want)).toBeLessThan(0.001);
      }
    }
  });
});
