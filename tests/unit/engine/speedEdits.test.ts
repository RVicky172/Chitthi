import { describe, expect, it } from 'vitest';
import { TOO_LONG, trim, type EditClip } from '@/engine/edits';
import type { Keyframe } from '@/engine/keyframes';
import { REVERSE_NUDGE, RAMP_PRESETS, playLength, type RampPoint } from '@/engine/speed';
import {
  FREEZE_LIMITS,
  FREEZE_SECONDS,
  NOT_FREEZABLE,
  NOT_VIDEO,
  OUTSIDE_CLIP,
  RAMP_DROPS_REVERSE,
  RAMP_POINTS,
  REVERSE_DROPS_RAMP,
  freezeFrame,
  setSpeed,
  type SpeedCtx,
  type SpeedEdit,
} from '@/engine/speedEdits';
import { IDENTITY, clipLength } from '@/engine/timeline';
import { MAIN_VIDEO } from '@/engine/tracks';
import { defined } from '../../support/defined';

/* ---------- helpers ---------- */

const ctx: SpeedCtx = { maxLength: 3 * 3600, locked: () => null, maxVideos: 5, desktop: true, magnetic: true, fps: 30 };
const off: SpeedCtx = { ...ctx, magnetic: false };

/**
 * A video clip: [in, out] of a 10 s source.
 * @param id its id
 * @param start its start, seconds
 * @param part its source part
 * @param track its track
 * @returns the clip
 */
const video = (id: string, start: number, part: [number, number], track = MAIN_VIDEO): EditClip => ({
  id,
  track,
  start,
  kind: 'video',
  dur: 0,
  in: part[0],
  out: part[1],
  srcDur: 10,
});
const photo = (id: string, start: number, dur: number, track = MAIN_VIDEO): EditClip => ({
  id,
  track,
  start,
  kind: 'photo',
  dur,
  in: 0,
  out: 0,
  srcDur: 0,
});
/**
 * The main track's clips: a video 0–4 (source 1–5), a photo 4–7, c video 7–9 (source 0–2).
 * @returns the clips
 */
const mainClips = (): EditClip[] => [video('a', 0, [1, 5]), photo('b', 4, 3), video('c', 7, [0, 2])];

/**
 * The clips of a result that went through.
 * @param result the edit
 * @returns its clips
 */
const done = (result: SpeedEdit<EditClip>): EditClip[] => {
  if ('error' in result) throw new Error(`refused: ${result.error}`);
  return result.clips;
};
const byId = (clips: EditClip[], id: string) => defined(clips.find((clip) => clip.id === id));
const starts = (clips: EditClip[]) => clips.map((clip) => [clip.id, clip.start]);
const key = (time: number, value: number): Keyframe => ({ t: time, v: value, ease: 'ease-in-out' });

/* ---------- a constant speed (Q2, Q3) ---------- */

describe('setSpeed: a constant speed keeps in and out and changes the length (AC-2, Q2)', () => {
  it('2× halves the length, in and out stay; Magnetic on moves the later clips back', () => {
    const clips = done(setSpeed(mainClips(), 'a', { speed: 2 }, ctx));
    const sped = byId(clips, 'a');
    expect([sped.in, sped.out, sped.speed]).toEqual([1, 5, 2]);
    expect(clipLength(sped)).toBe(2);
    expect(starts(clips)).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 5],
    ]);
  });

  it('0.5× doubles it and moves the later clips on', () => {
    const clips = done(setSpeed(mainClips(), 'a', { speed: 0.5 }, ctx));
    expect(clipLength(byId(clips, 'a'))).toBe(8);
    expect(starts(clips)).toEqual([
      ['a', 0],
      ['b', 8],
      ['c', 11],
    ]);
  });

  it('1× drops the field, so a clip back at 1× is as it was', () => {
    const fast = done(setSpeed(mainClips(), 'a', { speed: 2 }, ctx));
    const back = done(setSpeed(fast, 'a', { speed: 1 }, ctx));
    expect(back).toEqual(mainClips());
    expect('speed' in byId(back, 'a')).toBe(false);
  });

  it('speeds outside 0.1–10 are kept within them (Q1)', () => {
    expect(byId(done(setSpeed(mainClips(), 'c', { speed: 50 }, ctx)), 'c').speed).toBe(10);
    expect(byId(done(setSpeed(mainClips(), 'c', { speed: 0.01 }, ctx)), 'c').speed).toBe(0.1);
  });

  it('the same speed again changes nothing (the same array)', () => {
    const clips = mainClips();
    expect(done(setSpeed(clips, 'a', { speed: 1 }, ctx))).toBe(clips);
  });

  it('Magnetic off on the main track: faster leaves a gap, slower that would run into the next clip is refused (Q3)', () => {
    expect(starts(done(setSpeed(mainClips(), 'a', { speed: 2 }, off)))).toEqual([
      ['a', 0],
      ['b', 4],
      ['c', 7],
    ]);
    expect(setSpeed(mainClips(), 'a', { speed: 0.5 }, off)).toEqual({
      error: 'There is 4 s of room before the next clip; at 0.5× this clip needs 8 s',
    });
  });

  it('on an overlay track it is refused with the reason even with Magnetic on, and fits into the room there is', () => {
    const clips = [...mainClips(), video('o', 1, [0, 1], 'V2'), photo('p', 2.2, 1, 'V2')];
    expect(setSpeed(clips, 'o', { speed: 0.5 }, ctx)).toEqual({
      error: 'There is 1.2 s of room before the next clip; at 0.5× this clip needs 2 s',
    });
    const fits = done(setSpeed(clips, 'o', { speed: 0.9 }, ctx));
    expect(clipLength(byId(fits, 'o'))).toBeCloseTo(1 / 0.9, 12);
    expect(starts(fits)).toEqual(starts(clips));
  });

  it('the last clip of a track may grow freely', () => {
    const clips = [...mainClips(), video('o', 1, [0, 2], 'V2')];
    expect(clipLength(byId(done(setSpeed(clips, 'o', { speed: 0.25 }, off)), 'o'))).toBe(8);
  });

  it('a change that makes the video longer than the platform allows is refused (TOO_LONG)', () => {
    expect(setSpeed(mainClips(), 'a', { speed: 0.25 }, { ...ctx, maxLength: 15 })).toEqual({ error: TOO_LONG });
    // Shortening is always allowed, even over the limit.
    expect('error' in setSpeed(mainClips(), 'a', { speed: 2 }, { ...ctx, maxLength: 5 })).toBe(false);
  });

  it('a speed that would make the clip shorter than 0.1 s is refused (AC-2)', () => {
    const clips = [video('a', 0, [1, 1.5])];
    const result = setSpeed(clips, 'a', { speed: 10 }, ctx);
    expect(result).toEqual({ error: 'At 10× this clip would be shorter than 0.1 s.' });
    expect(clipLength(byId(done(setSpeed(clips, 'a', { speed: 5 }, ctx)), 'a'))).toBeCloseTo(0.1, 12);
  });

  it('refuses photos, freeze frames, unknown clips and locked tracks', () => {
    expect(setSpeed(mainClips(), 'b', { speed: 2 }, ctx)).toEqual({ error: NOT_VIDEO });
    const frozen = [{ ...video('f', 0, [1, 5]), freeze: 2, dur: 2 }];
    expect(setSpeed(frozen, 'f', { speed: 2 }, ctx)).toEqual({ error: NOT_VIDEO });
    expect('error' in setSpeed(mainClips(), 'zz', { speed: 2 }, ctx)).toBe(true);
    const locked = { ...ctx, locked: () => 'The Video track is locked.' };
    expect(setSpeed(mainClips(), 'a', { speed: 2 }, locked)).toEqual({ error: 'The Video track is locked.' });
  });
});

/* ---------- keyframes and transitions (AC-7, Q9) ---------- */

describe('setSpeed: keyframes scale with the length, transitions are shortened with the reason (AC-7)', () => {
  it('keyframes stay at the same places along the clip (Q9)', () => {
    const clips = mainClips().map((clip) =>
      clip.id === 'a' ? { ...clip, keys: { x: [key(0, 0), key(2, 1), key(4, 0.5)] } } : clip,
    );
    const sped = byId(done(setSpeed(clips, 'a', { speed: 2 }, ctx)), 'a');
    expect(sped.keys?.x?.map((keyframe) => keyframe.t)).toEqual([0, 1, 2]);
    const slow = byId(done(setSpeed(clips, 'a', { speed: 0.5 }, ctx)), 'a');
    expect(slow.keys?.x?.map((keyframe) => keyframe.t)).toEqual([0, 4, 8]);
  });

  it('a transition that no longer fits is shortened to whole frames, and says so', () => {
    const clips = mainClips().map((clip) =>
      clip.id === 'a' ? { ...clip, transition: { kind: 'dissolve' as const, dur: 2, to: 'b' } } : clip,
    );
    const result = setSpeed(clips, 'a', { speed: 10 }, ctx);
    const sped = byId(done(result), 'a');
    // 0.4 s long: room for 2 × 0.4 = 0.8 s.
    expect(sped.transition?.dur).toBeCloseTo(0.8, 9);
    expect('note' in result && result.note).toBe('The transition was shortened to 0.8 s to fit.');
  });

  it('a transition that still fits keeps its length and nothing is said', () => {
    const clips = mainClips().map((clip) =>
      clip.id === 'a' ? { ...clip, transition: { kind: 'dissolve' as const, dur: 1, to: 'b' } } : clip,
    );
    const result = setSpeed(clips, 'a', { speed: 2 }, ctx);
    expect(byId(done(result), 'a').transition?.dur).toBe(1);
    expect('note' in result ? result.note : undefined).toBeUndefined();
  });
});

/* ---------- reverse and ramps (Q7) ---------- */

describe('setSpeed: reverse and ramps (AC-3, AC-5, Q7)', () => {
  const hero: RampPoint[] = [...RAMP_PRESETS.hero];

  it('reverse keeps the length and the later clips; off drops the field', () => {
    const clips = done(setSpeed(mainClips(), 'a', { reverse: true }, ctx));
    expect(byId(clips, 'a').reverse).toBe(true);
    expect(starts(clips)).toEqual(starts(mainClips()));
    expect(done(setSpeed(clips, 'a', { reverse: false }, ctx))).toEqual(mainClips());
  });

  it('a ramp replaces the speed, sets the length its curve takes, and Magnetic moves the later clips', () => {
    const fast = done(setSpeed(mainClips(), 'a', { speed: 2 }, ctx));
    const ramped = done(setSpeed(fast, 'a', { ramp: hero }, ctx));
    const clip = byId(ramped, 'a');
    expect(clip.ramp).toEqual(hero);
    expect('speed' in clip).toBe(false);
    expect(clipLength(clip)).toBeCloseTo(playLength({ ...clip }), 12);
    expect(byId(ramped, 'b').start).toBeCloseTo(clipLength(clip), 12);
  });

  it('a constant speed replaces a ramp', () => {
    const ramped = done(setSpeed(mainClips(), 'a', { ramp: hero }, ctx));
    const clip = byId(done(setSpeed(ramped, 'a', { speed: 2 }, ctx)), 'a');
    expect('ramp' in clip).toBe(false);
    expect(clip.speed).toBe(2);
  });

  it('reverse drops a ramp, and says so (Q7)', () => {
    const ramped = done(setSpeed(mainClips(), 'a', { ramp: hero }, ctx));
    const result = setSpeed(ramped, 'a', { reverse: true }, ctx);
    const clip = byId(done(result), 'a');
    expect([clip.reverse, 'ramp' in clip]).toEqual([true, false]);
    expect(clipLength(clip)).toBe(4);
    expect('note' in result && result.note).toBe(REVERSE_DROPS_RAMP);
  });

  it('a ramp turns reverse off, and says so (Q7)', () => {
    const reversed = done(setSpeed(mainClips(), 'a', { reverse: true }, ctx));
    const result = setSpeed(reversed, 'a', { ramp: hero }, ctx);
    const clip = byId(done(result), 'a');
    expect(['reverse' in clip, clip.ramp]).toEqual([false, hero]);
    expect('note' in result && result.note).toBe(RAMP_DROPS_REVERSE);
  });

  it('a ramp of 1 or 11 points is refused; a ramp keeps the 0.1 s and overlay rules', () => {
    expect(setSpeed(mainClips(), 'a', { ramp: [{ at: 0, v: 2 }] }, ctx)).toEqual({ error: RAMP_POINTS });
    const eleven = Array.from({ length: 11 }, (_, index) => ({ at: index / 10, v: 1 }));
    expect(setSpeed(mainClips(), 'a', { ramp: eleven }, ctx)).toEqual({ error: RAMP_POINTS });
    const slowRamp: RampPoint[] = [
      { at: 0, v: 0.5 },
      { at: 1, v: 0.5 },
    ];
    expect(setSpeed(mainClips(), 'a', { ramp: slowRamp }, off)).toEqual({
      error: 'There is 4 s of room before the next clip; with this ramp this clip needs 8 s',
    });
  });
});

/* ---------- freeze frames (AC-4, Q4, D1, D-051) ---------- */

describe('freezeFrame: a still of the frame at the playhead between the two parts (AC-4, Q4)', () => {
  /** A clip with the fields a freeze carries over or moves: its fade and (standing in for its edit) a look. */
  type LookClip = EditClip & { fade?: boolean; look?: string };
  /**
   * Ids for new clips: the freeze first, then the split's right part.
   * @returns the id maker
   */
  const ids = () => {
    let count = 0;
    return () => `n${++count}`;
  };
  const freezeOf = (clips: readonly LookClip[]) => defined(clips.find((clip) => clip.freeze !== undefined));
  const spans = (clips: readonly LookClip[]) =>
    clips.map((clip) => [clip.freeze === undefined ? clip.id : 'freeze', clip.start, clipLength(clip)]);
  const withA = (patch: Partial<LookClip>): LookClip[] =>
    mainClips().map((clip) => (clip.id === 'a' ? { ...clip, ...patch } : clip));
  const ok = <C extends EditClip>(result: SpeedEdit<C>): C[] => {
    if ('error' in result) throw new Error(`refused: ${result.error}`);
    return result.clips;
  };
  const find = <C extends EditClip>(clips: C[], id: string) => defined(clips.find((clip) => clip.id === id));

  it('in the middle with Magnetic on: splits there, a 2 s still between, the later clips move by 2 s', () => {
    const clips = ok(freezeFrame(mainClips(), 'a', 1.5, ctx, ids()));
    expect(spans(clips)).toEqual([
      ['a', 0, 1.5],
      ['freeze', 1.5, FREEZE_SECONDS],
      ['n2', 3.5, 2.5],
      ['b', 6, 3],
      ['c', 9, 2],
    ]);
    const still = freezeOf(clips);
    expect([still.id, still.kind, still.freeze, still.dur, still.track]).toEqual(['n1', 'video', 2.5, 2, MAIN_VIDEO]);
    expect([find(clips, 'a').out, find(clips, 'n2').in]).toEqual([2.5, 2.5]);
  });

  it('the still is the frame shown there: at 2× and reversed too; it has no speed of its own', () => {
    const fast = freezeOf(ok(freezeFrame(withA({ speed: 2 }), 'a', 0.5, ctx, ids())));
    expect(fast.freeze).toBe(2);
    expect('speed' in fast).toBe(false);
    const back = ok(freezeFrame(withA({ reverse: true }), 'a', 1.5, ctx, ids()));
    expect(freezeOf(back).freeze).toBeCloseTo(3.5 - REVERSE_NUDGE, 12);
    expect('reverse' in freezeOf(back)).toBe(false);
    expect([find(back, 'a').in, find(back, 'a').out, find(back, 'n2').in, find(back, 'n2').out]).toEqual([3.5, 5, 1, 3.5]);
  });

  it('keeps the clip’s file, box and look; holds its keyframed values at the cut (D1, D-051)', () => {
    const tf = { ...IDENTITY, x: 0.4, w: 0.5 };
    const clips = withA({ tf, keys: { x: [key(0, 0.2), key(4, 0.6)] }, look: 'warm' });
    const still = freezeOf(ok(freezeFrame(clips, 'a', 2, ctx, ids())));
    expect([still.tf, still.look]).toEqual([tf, 'warm']);
    expect(still.keys?.x).toHaveLength(1);
    expect(still.keys?.x?.[0]?.t).toBe(0);
    expect(still.keys?.x?.[0]?.v).toBeCloseTo(0.4, 12);
  });

  it('at the clip’s first frame it goes before the clip without a split, taking its fade and its incoming transition', () => {
    const clips: LookClip[] = [
      { ...photo('p', 0, 2), transition: { kind: 'dissolve', dur: 0.5, to: 'a' } },
      { ...video('a', 2, [1, 5]), fade: true },
    ];
    const result = ok(freezeFrame(clips, 'a', 0.01, ctx, ids()));
    expect(spans(result)).toEqual([
      ['p', 0, 2],
      ['freeze', 2, 2],
      ['a', 4, 4],
    ]);
    // The source time under the playhead: within the clip's first frame.
    expect(freezeOf(result).freeze).toBeCloseTo(1.01, 12);
    expect(find(result, 'p').transition?.to).toBe('n1');
    expect([freezeOf(result).fade, find(result, 'a').fade]).toEqual([true, false]);
  });

  it('at its last frame it goes after the clip without a split, taking the clip’s outgoing transition', () => {
    const clips = withA({ transition: { kind: 'dissolve', dur: 0.5, to: 'b' } });
    const result = ok(freezeFrame(clips, 'a', 4 - 0.01, ctx, ids()));
    expect(spans(result).slice(0, 3)).toEqual([
      ['a', 0, 4],
      ['freeze', 4, 2],
      ['b', 6, 3],
    ]);
    expect(freezeOf(result).freeze).toBeCloseTo(4.99, 12);
    expect('transition' in find(result, 'a')).toBe(false);
    expect(freezeOf(result).transition?.to).toBe('b');
  });

  it('a split clip’s outgoing transition goes with its right part; the still has none and no fade', () => {
    const clips = withA({ transition: { kind: 'dissolve', dur: 0.5, to: 'b' }, fade: true });
    const result = ok(freezeFrame(clips, 'a', 2, ctx, ids()));
    expect(find(result, 'n2').transition?.to).toBe('b');
    expect('transition' in freezeOf(result)).toBe(false);
    expect('transition' in find(result, 'a')).toBe(false);
    expect([find(result, 'a').fade, freezeOf(result).fade, find(result, 'n2').fade]).toEqual([true, false, false]);
  });

  it('Magnetic off or on an overlay track: the right part moves on into the room after the clip, else refused', () => {
    expect(freezeFrame(mainClips(), 'a', 1.5, off, ids())).toEqual({
      error: 'There is 0 s of room after this clip; the freeze frame needs 2 s',
    });
    const roomy = [video('a', 0, [1, 5]), photo('b', 7, 1)];
    expect(spans(ok(freezeFrame(roomy, 'a', 1.5, off, ids())))).toEqual([
      ['a', 0, 1.5],
      ['freeze', 1.5, 2],
      ['n2', 3.5, 2.5],
      ['b', 7, 1],
    ]);
    const overlay = [...mainClips(), video('o', 1, [0, 2], 'V2'), photo('q', 4, 1, 'V2')];
    expect(freezeFrame(overlay, 'o', 1, ctx, ids())).toEqual({
      error: 'There is 1 s of room after this clip; the freeze frame needs 2 s',
    });
  });

  it('refuses photos, freeze frames, a playhead outside the clip, locked tracks and a video too long', () => {
    expect(freezeFrame(mainClips(), 'b', 1, ctx, ids())).toEqual({ error: NOT_FREEZABLE });
    const once = ok(freezeFrame(mainClips(), 'a', 1.5, ctx, ids()));
    expect(freezeFrame(once, 'n1', 1, ctx, ids())).toEqual({ error: NOT_FREEZABLE });
    expect(freezeFrame(mainClips(), 'a', 4.5, ctx, ids())).toEqual({ error: OUTSIDE_CLIP });
    expect(freezeFrame(mainClips(), 'a', -0.1, ctx, ids())).toEqual({ error: OUTSIDE_CLIP });
    const locked = { ...ctx, locked: () => 'The Video track is locked.' };
    expect(freezeFrame(mainClips(), 'a', 1, locked, ids())).toEqual({ error: 'The Video track is locked.' });
    expect(freezeFrame(mainClips(), 'a', 1, { ...ctx, maxLength: 10 }, ids())).toEqual({ error: TOO_LONG });
  });

  it('its end is dragged like a photo’s, 0.1 s to 60 s; its still doesn’t change', () => {
    const clips = ok(freezeFrame(mainClips(), 'a', 1.5, ctx, ids()));
    const ripple = { ripple: true };
    const trimmed = (side: 'start' | 'end', delta: number, options = ripple) => {
      const result = trim(clips, 'n1', side, delta, options, ctx);
      if ('error' in result) throw new Error(result.error);
      return freezeOf(result.clips);
    };
    const longest = trimmed('end', 100);
    expect([longest.dur, longest.freeze]).toEqual([FREEZE_LIMITS.max, 2.5]);
    const shortest = trimmed('end', -100);
    expect([shortest.dur, shortest.freeze, shortest.in, shortest.out]).toEqual([FREEZE_LIMITS.min, 2.5, 1, 5]);
    const fromStart = trimmed('start', 0.5, { ripple: false });
    expect([fromStart.start, fromStart.dur, fromStart.freeze]).toEqual([2, 1.5, 2.5]);
  });
});

describe('setSpeed: Reset speed and ramp edits over a span (AC-8, D-050)', () => {
  it('reset drops speed, reverse, ramp and span in one change', () => {
    const clips = [{ ...video('a', 0, [1, 5]), speed: 2, reverse: true as const }, photo('b', 2, 3)];
    const reset = done(setSpeed(clips, 'a', { reset: true }, ctx));
    expect(reset).toEqual([video('a', 0, [1, 5]), photo('b', 4, 3)]);
    const ramped = [{ ...video('a', 0, [1, 5]), ramp: [...RAMP_PRESETS.hero], rampSpan: [0, 6] as const }];
    expect(done(setSpeed(ramped, 'a', { reset: true }, ctx))).toEqual([video('a', 0, [1, 5])]);
  });

  it('a ramp with a span keeps it; a ramp without one is over in–out', () => {
    const clips = [{ ...video('a', 0, [1, 5]), ramp: [...RAMP_PRESETS.hero], rampSpan: [0, 6] as const }];
    const points: RampPoint[] = [
      { at: 0, v: 1 },
      { at: 1, v: 2 },
    ];
    expect(byId(done(setSpeed(clips, 'a', { ramp: points, rampSpan: [0, 6] }, ctx)), 'a').rampSpan).toEqual([0, 6]);
    expect('rampSpan' in byId(done(setSpeed(clips, 'a', { ramp: points }, ctx)), 'a')).toBe(false);
  });
});
