import { describe, expect, it } from 'vitest';
import {
  RAMP_LIMITS,
  RAMP_PRESETS,
  SPEED_LIMITS,
  SPEED_PRESETS,
  edgeSpeed,
  localAt,
  playLength,
  rampSpeedAt,
  sourceAt,
  type RampPoint,
  type RampPreset,
  type SpeedClip,
} from '@/engine/speed';
import { clipLength, frameRange } from '@/engine/timeline';

/** Within a microsecond (AC-1, AC-3). */
const MICRO = 1e-6;

/**
 * A video clip using source seconds `inPoint`–`outPoint`.
 * @param inPoint its in point, source seconds
 * @param outPoint its out point, source seconds
 * @param extra speed fields
 * @returns the clip
 */
const video = (inPoint: number, outPoint: number, extra: Partial<SpeedClip> = {}): SpeedClip => ({
  kind: 'video',
  dur: 0,
  in: inPoint,
  out: outPoint,
  ...extra,
});

/**
 * The source time shown at each export frame of a clip starting at `start`, as the export asks for it.
 * @param clip the clip
 * @param start where it starts on the timeline, seconds
 * @param fps the frame rate
 * @returns one source time per frame
 */
function framesShown(clip: SpeedClip, start: number, fps: number): number[] {
  const [first, afterLast] = frameRange(start, start + clipLength(clip), fps);
  const shown: number[] = [];
  for (let frame = first; frame < afterLast; frame++) shown.push(sourceAt(clip, frame / fps - start));
  return shown;
}

/**
 * Expects two lists of times to match one for one within a microsecond.
 * @param actual the times found
 * @param expected the times expected
 */
function expectTimes(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((time, index) => expect(Math.abs(time - (expected.at(index) ?? Number.NaN))).toBeLessThan(MICRO));
}

describe('speed limits (Q1)', () => {
  it('runs 0.1× to 10× in steps of 0.01×, with the inspector presets', () => {
    expect(SPEED_LIMITS).toEqual({ min: 0.1, max: 10, step: 0.01 });
    expect(SPEED_PRESETS).toEqual([0.25, 0.5, 0.75, 1, 1.5, 2, 4]);
  });
});

describe('a constant speed (AC-1)', () => {
  it('lasts (out − in) / speed on the timeline and keeps in and out (Q2)', () => {
    expect(playLength(video(2, 6, { speed: 2 }))).toBe(2);
    expect(playLength(video(2, 6, { speed: 0.5 }))).toBe(8);
    expect(playLength(video(0, 10, { speed: 10 }))).toBe(1);
    expect(playLength(video(1, 2, { speed: 0.25 }))).toBe(4);
    expect(clipLength(video(2, 6, { speed: 2 }))).toBe(2);
    expect(clipLength(video(2, 6, { speed: 0.5 }))).toBe(8);
  });

  it('gives exactly in + local at 1× (what every clip did before 207)', () => {
    for (const clip of [video(1.3, 5), video(1.3, 5, { speed: 1 })])
      for (const local of [0, 0.7, 1 / 3, 2.9]) expect(sourceAt(clip, local)).toBe(1.3 + local);
    expect(clipLength(video(1.3, 5))).toBe(5 - 1.3);
  });

  it('maps clip time to source time as in + t × speed, and back', () => {
    const clip = video(2, 6, { speed: 2 });
    expect(sourceAt(clip, 0)).toBe(2);
    expect(sourceAt(clip, 1)).toBe(4);
    expect(sourceAt(clip, 2)).toBe(6);
    expect(localAt(clip, 5)).toBeCloseTo(1.5, 12);
    expect(localAt(video(1, 3, { speed: 0.5 }), 2)).toBeCloseTo(2, 12);
  });

  it.each([
    [0.25, 30],
    [0.25, 60],
    [0.5, 30],
    [0.5, 60],
    [2, 30],
    [2, 60],
    [10, 30],
    [10, 60],
  ])('shows the expected source time at every export frame at %s× and %s fps', (speed, fps) => {
    // A clip using source 3–7 s, starting 1.5 s into the video.
    const clip = video(3, 7, { speed });
    const start = 1.5;
    const frames = Math.round((4 / speed) * fps);
    const firstFrame = Math.round(start * fps);
    const expected = Array.from({ length: frames }, (_, index) => 3 + ((firstFrame + index) / fps - start) * speed);
    expectTimes(framesShown(clip, start, fps), expected);
  });

  it('goes on at its speed past its ends (transition handles, 206)', () => {
    const clip = video(4, 8, { speed: 2 });
    expect(sourceAt(clip, -0.25)).toBe(3.5);
    expect(sourceAt(clip, 2.25)).toBe(8.5);
    expect(edgeSpeed(clip, 'start')).toBe(2);
    expect(edgeSpeed(clip, 'end')).toBe(2);
    expect(edgeSpeed(video(4, 8), 'end')).toBe(1);
  });
});

describe('reverse (AC-3)', () => {
  it('shows its out point first and its in point last, as out − t × speed', () => {
    const clip = video(2, 6, { reverse: true });
    expect(playLength(clip)).toBe(4);
    expect(sourceAt(clip, 0)).toBe(6);
    expect(sourceAt(clip, 1)).toBe(5);
    expect(sourceAt(clip, 4)).toBe(2);
    expect(localAt(clip, 5)).toBeCloseTo(1, 12);
    const fast = video(2, 6, { reverse: true, speed: 2 });
    expect(playLength(fast)).toBe(2);
    expect(sourceAt(fast, 0.5)).toBe(5);
    expect(localAt(fast, 3)).toBeCloseTo(1.5, 12);
  });

  it.each([
    [1, 30],
    [1, 60],
    [2, 30],
    [2, 60],
  ])('shows the expected source time at every export frame reversed at %s× and %s fps', (speed, fps) => {
    const clip = video(1, 5, { reverse: true, speed });
    const frames = Math.round((4 / speed) * fps);
    const expected = Array.from({ length: frames }, (_, index) => 5 - (index / fps) * speed);
    expectTimes(framesShown(clip, 0, fps), expected);
  });

  it('runs its handles past its out point before its start and below its in point after its end', () => {
    const clip = video(2, 6, { reverse: true, speed: 2 });
    expect(sourceAt(clip, -0.5)).toBe(7);
    expect(sourceAt(clip, 2.5)).toBe(1);
  });
});

describe('a freeze frame (AC-4, D1)', () => {
  it('lasts its dur and shows its one source time throughout', () => {
    const still = video(2, 6, { freeze: 3.4, dur: 2 });
    expect(playLength(still)).toBe(2);
    expect(clipLength(still)).toBe(2);
    for (const local of [-0.3, 0, 1, 2, 2.4]) expect(sourceAt(still, local)).toBe(3.4);
    expect(edgeSpeed(still, 'start')).toBe(0);
  });
});

/** The six presets (Q6). */
const PRESET_NAMES: readonly RampPreset[] = ['montage', 'hero', 'bullet', 'jump', 'flash-in', 'flash-out'];

/** A custom curve with steep changes between the slowest and fastest speeds, to test the numerics. */
const CUSTOM: readonly RampPoint[] = [
  { at: 0, v: 0.1 },
  { at: 0.3, v: 10 },
  { at: 0.35, v: 0.1 },
  { at: 0.7, v: 2.5 },
  { at: 1, v: 0.4 },
];

/** Every curve the ramp tests run on: the presets and the custom one. */
const CURVES: readonly (readonly [string, readonly RampPoint[]])[] = [
  ...PRESET_NAMES.map((name) => [name, RAMP_PRESETS[name]] as const),
  ['custom', CUSTOM],
];

/** The reference integrates 100× finer than the 512-step table (AC-5). */
const REFERENCE_STEPS = 512 * 100;

/**
 * A reference for a ramped clip, integrated apart from the code under test (only the speed curve is shared): the play
 * time at each of REFERENCE_STEPS shares by Simpson's rule, and the source time at a clip time by bisection within
 * one step.
 * @param clip a ramped video clip
 * @returns its length and its source time at a clip time
 */
function rampReference(clip: SpeedClip): { length: number; sourceAt: (local: number) => number } {
  const ramp = clip.ramp ?? [];
  const span = clip.out - clip.in;
  const step = 1 / REFERENCE_STEPS;
  const inverse = (share: number) => span / rampSpeedAt(ramp, share);
  const simpson = (from: number, to: number) => ((to - from) / 6) * (inverse(from) + 4 * inverse((from + to) / 2) + inverse(to));
  const playedBy = [0];
  for (let index = 0; index < REFERENCE_STEPS; index++)
    playedBy.push((playedBy.at(-1) ?? 0) + simpson(index * step, (index + 1) * step));
  const length = playedBy.at(-1) ?? 0;
  const referenceSourceAt = (local: number): number => {
    let low = 0;
    let high = REFERENCE_STEPS;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if ((playedBy.at(middle) ?? 0) <= local) low = middle;
      else high = middle;
    }
    const base = playedBy.at(low) ?? 0;
    let from = low * step;
    let to = (low + 1) * step;
    for (let round = 0; round < 50; round++) {
      const middle = (from + to) / 2;
      if (base + simpson(low * step, middle) <= local) from = middle;
      else to = middle;
    }
    return clip.in + ((from + to) / 2) * span;
  };
  return { length, sourceAt: referenceSourceAt };
}

describe('ramp presets (Q6)', () => {
  it.each(PRESET_NAMES)('%s has 2–10 points from 0 to 1 in order, at speeds within the limits', (name) => {
    const ramp = RAMP_PRESETS[name];
    expect(ramp.length).toBeGreaterThanOrEqual(RAMP_LIMITS.minPoints);
    expect(ramp.length).toBeLessThanOrEqual(RAMP_LIMITS.maxPoints);
    expect(ramp.at(0)?.at).toBe(0);
    expect(ramp.at(-1)?.at).toBe(1);
    ramp.slice(1).forEach((point, index) => expect(point.at).toBeGreaterThan(ramp.at(index)?.at ?? 1));
    for (const point of ramp) {
      expect(point.v).toBeGreaterThanOrEqual(SPEED_LIMITS.min);
      expect(point.v).toBeLessThanOrEqual(SPEED_LIMITS.max);
    }
  });

  it('have the shapes Q6 names', () => {
    const speeds = (name: RampPreset) => RAMP_PRESETS[name].map((point) => point.v);
    const montage = speeds('montage');
    expect(montage).toHaveLength(5);
    montage.slice(1).forEach((speed, index) => {
      const before = montage.at(index) ?? 0;
      expect(index % 2 === 0 ? speed < before : speed > before).toBe(true);
    });
    const hero = speeds('hero');
    expect([hero.at(0), hero.at(-1)]).toEqual([1, 1]);
    expect(Math.min(...hero)).toBeLessThan(1);
    const bullet = speeds('bullet');
    expect(bullet.at(0)).toBeGreaterThan(1);
    expect(bullet.at(-1)).toBeGreaterThan(1);
    expect(Math.min(...bullet)).toBeLessThan(Math.min(...hero));
    const jump = speeds('jump');
    expect([jump.at(0), jump.at(-1)]).toEqual([1, 1]);
    expect(Math.max(...jump)).toBeGreaterThan(1);
    const flashIn = speeds('flash-in');
    expect(flashIn.at(0)).toBeGreaterThan(1);
    expect(flashIn.at(-1)).toBe(1);
    const flashOut = speeds('flash-out');
    expect(flashOut.at(0)).toBe(1);
    expect(flashOut.at(-1)).toBeGreaterThan(1);
  });
});

describe("a ramp's speed curve (Q5)", () => {
  it.each(CURVES)('%s passes through its points and never leaves their range', (_name, ramp) => {
    for (const point of ramp) expect(rampSpeedAt(ramp, point.at)).toBeCloseTo(point.v, 12);
    const speeds = ramp.map((point) => point.v);
    const [slowest, fastest] = [Math.min(...speeds), Math.max(...speeds)];
    for (let index = 0; index <= 1000; index++) {
      const speed = rampSpeedAt(ramp, index / 1000);
      expect(speed).toBeGreaterThanOrEqual(slowest - 1e-12);
      expect(speed).toBeLessThanOrEqual(fastest + 1e-12);
    }
  });

  it('does not overshoot between two points: it stays between their speeds', () => {
    CURVES.forEach(([, ramp]) =>
      ramp.slice(1).forEach((point, index) => {
        const before = ramp.at(index) ?? point;
        const [low, high] = [Math.min(before.v, point.v), Math.max(before.v, point.v)];
        for (let step = 0; step <= 50; step++) {
          const speed = rampSpeedAt(ramp, before.at + ((point.at - before.at) * step) / 50);
          expect(speed).toBeGreaterThanOrEqual(low - 1e-12);
          expect(speed).toBeLessThanOrEqual(high + 1e-12);
        }
      }),
    );
  });

  it('holds its end speeds past its ends', () => {
    expect(rampSpeedAt(CUSTOM, -0.5)).toBe(0.1);
    expect(rampSpeedAt(CUSTOM, 1.5)).toBe(0.4);
  });
});

describe('a ramped clip (AC-5)', () => {
  it.each(CURVES)('%s: its length is the time the curve takes to play its source part', (_name, ramp) => {
    const clip = video(2, 6, { ramp: [...ramp] });
    const reference = rampReference(clip);
    expect(Math.abs(playLength(clip) - reference.length)).toBeLessThan(MICRO);
    expect(Math.abs(clipLength(clip) - reference.length)).toBeLessThan(MICRO);
  });

  it.each(CURVES)('%s: starts exactly at in, ends exactly at out and always moves forwards', (_name, ramp) => {
    const clip = video(2, 6, { ramp: [...ramp] });
    const length = playLength(clip);
    expect(sourceAt(clip, 0)).toBe(2);
    expect(sourceAt(clip, length)).toBe(6);
    let before = sourceAt(clip, 0);
    for (let index = 1; index <= 2000; index++) {
      const now = sourceAt(clip, (length * index) / 2000);
      expect(now).toBeGreaterThan(before);
      before = now;
    }
  });

  it.each(CURVES.flatMap(([name, ramp]) => [30, 60].map((fps) => [name, fps, ramp] as const)))(
    '%s at %s fps: the source time at every export frame matches a reference integrated 100× finer',
    (_name, fps, ramp) => {
      const clip = video(2, 6, { ramp: [...ramp] });
      const start = 1.5;
      const reference = rampReference(clip);
      const [first, afterLast] = frameRange(start, start + reference.length, fps);
      const expected = Array.from({ length: afterLast - first }, (_, index) => reference.sourceAt((first + index) / fps - start));
      expectTimes(framesShown(clip, start, fps), expected);
    },
  );

  it.each(CURVES)('%s: localAt is the inverse of sourceAt', (_name, ramp) => {
    const clip = video(2, 6, { ramp: [...ramp] });
    const length = playLength(clip);
    for (let index = 0; index <= 40; index++) {
      const local = (length * index) / 40;
      expect(Math.abs(localAt(clip, sourceAt(clip, local)) - local)).toBeLessThan(MICRO);
    }
  });

  it('runs its handles past its ends at its edge speeds (206)', () => {
    const clip = video(2, 6, { ramp: [...CUSTOM] });
    const length = playLength(clip);
    expect(edgeSpeed(clip, 'start')).toBe(0.1);
    expect(edgeSpeed(clip, 'end')).toBe(0.4);
    expect(sourceAt(clip, -1)).toBeCloseTo(1.9, 12);
    expect(sourceAt(clip, length + 1)).toBeCloseTo(6.4, 12);
    expect(localAt(clip, 1.9)).toBeCloseTo(-1, 9);
    expect(localAt(clip, 6.4)).toBeCloseTo(length + 1, 9);
  });

  it('takes the ramp and ignores reverse when both are set (Q7: the gate drops reverse)', () => {
    const ramp = [...RAMP_PRESETS.hero];
    const both = video(2, 6, { ramp, reverse: true });
    const rampOnly = video(2, 6, { ramp });
    expect(playLength(both)).toBe(playLength(rampOnly));
    expect(sourceAt(both, 1)).toBe(sourceAt(rampOnly, 1));
  });
});

describe('a ramp over a fixed source span (D2, D-050)', () => {
  it.each([
    [0.2, 0.8],
    [0.05, 0.95],
    [0.3, 0.35],
    [0, 0.5],
    [0.5, 1],
  ])('a clip from %s to %s of the curve’s play time plays exactly that part of the whole clip', (first, last) => {
    for (const [name, ramp] of CURVES) {
      const whole = video(2, 6, { ramp: [...ramp] });
      const length = playLength(whole);
      const part = video(sourceAt(whole, length * first), sourceAt(whole, length * last), {
        ramp: whole.ramp,
        rampSpan: [2, 6],
      });
      expect(Math.abs(playLength(part) - length * (last - first)), name).toBeLessThan(MICRO);
      for (let step = 0; step <= 20; step++) {
        const local = (step / 20) * playLength(part);
        expect(Math.abs(sourceAt(part, local) - sourceAt(whole, length * first + local)), `${name} ${step}`).toBeLessThan(MICRO);
      }
      expect(sourceAt(part, 0)).toBe(part.in);
      expect(sourceAt(part, playLength(part))).toBe(part.out);
      expect(edgeSpeed(part, 'start')).toBeCloseTo(rampSpeedAt(ramp, (part.in - 2) / 4), 12);
      expect(edgeSpeed(part, 'end')).toBeCloseTo(rampSpeedAt(ramp, (part.out - 2) / 4), 12);
    }
  });

  it('a span equal to in–out maps exactly as no span', () => {
    for (const [, ramp] of CURVES) {
      const plain = video(2, 6, { ramp: [...ramp] });
      const spanned = { ...plain, rampSpan: [2, 6] as const };
      expect(playLength(spanned)).toBe(playLength(plain));
      for (const local of [-0.5, 0, 0.3, 1.7, playLength(plain), playLength(plain) + 1])
        expect(sourceAt(spanned, local)).toBe(sourceAt(plain, local));
      expect(localAt(spanned, 4.2)).toBe(localAt(plain, 4.2));
    }
  });

  it('past the span’s ends the curve is held at its end speeds', () => {
    const ramp: RampPoint[] = [
      { at: 0, v: 0.5 },
      { at: 1, v: 2 },
    ];
    const whole = video(2, 6, { ramp });
    const wider = video(1, 7, { ramp, rampSpan: [2, 6] });
    expect(playLength(wider)).toBeCloseTo(1 / 0.5 + playLength(whole) + 1 / 2, 9);
    expect(sourceAt(wider, 2)).toBeCloseTo(2, 9);
    expect(localAt(wider, 6)).toBeCloseTo(2 + playLength(whole), 9);
  });
});
