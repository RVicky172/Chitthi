import { describe, expect, it } from 'vitest';
import { valueAt } from './keyframes';
import { MAIN_VIDEO, type TimedClip } from './timeline';
import { TRANSITION_LIMITS, cutsOf, defaultTransition, halves, progressAt, roomFor, tidyTransitions, type Transition } from './transitions';

/** A video clip on a track: `len` seconds from `start`. */
const clip = (id: string, start: number, len: number, extra: Partial<TimedClip> = {}): TimedClip => ({
  id,
  track: MAIN_VIDEO,
  start,
  kind: 'video',
  dur: 0,
  in: 0,
  out: len,
  ...extra,
});
/** A transition of `dur` seconds into clip `to`. */
const into = (to: string, dur: number, kind: Transition['kind'] = 'dissolve'): Transition => ({ kind, dur, to });
/** The eased progress 205's Ease in and out gives at linear progress `p`. */
const easeInOut = (p: number) => valueAt([{ t: 0, v: 0, ease: 'ease-in-out' }, { t: 1, v: 1, ease: 'ease-in-out' }], p);

describe('defaults and limits (Q1, Q3)', () => {
  it('a new transition is 0.5 s; wipes and slides go left, dips go to black', () => {
    expect(TRANSITION_LIMITS).toEqual({ min: 0.1, max: 3, default: 0.5 });
    expect(defaultTransition('dissolve', 'b')).toEqual({ kind: 'dissolve', dur: 0.5, to: 'b' });
    expect(defaultTransition('wipe', 'b')).toEqual({ kind: 'wipe', dur: 0.5, to: 'b', dir: 'left' });
    expect(defaultTransition('slide', 'b')).toEqual({ kind: 'slide', dur: 0.5, to: 'b', dir: 'left' });
    expect(defaultTransition('dip', 'b')).toEqual({ kind: 'dip', dur: 0.5, to: 'b', colour: 'black' });
    expect(defaultTransition('zoom', 'b')).toEqual({ kind: 'zoom', dur: 0.5, to: 'b' });
  });
});

describe('cutsOf and halves', () => {
  const clips = [clip('a', 0, 2, { transition: into('b', 1) }), clip('b', 2, 3, { transition: into('c', 0.6) }), clip('c', 5, 2), clip('d', 8, 1)];

  it('lists each pair of touching clips on a track in time order (not across a gap)', () => {
    expect(cutsOf(clips, MAIN_VIDEO).map(([a, b]) => `${a.id}-${b.id}`)).toEqual(['a-b', 'b-c']);
    expect(cutsOf([clip('x', 0, 1), clip('y', 1 + 5e-7, 1)], MAIN_VIDEO)).toHaveLength(1);
    expect(cutsOf([clip('x', 0, 1), clip('y', 1, 1, { track: 'O1' })], MAIN_VIDEO)).toHaveLength(0);
  });

  it('a clip’s halves: the transition leading into it (before its start) and its own (after its end)', () => {
    expect(halves(clips[0], clips)).toEqual({ before: 0, after: 0.5 });
    expect(halves(clips[1], clips)).toEqual({ before: 0.5, after: 0.3 });
    expect(halves(clips[2], clips)).toEqual({ before: 0.3, after: 0 });
  });
});

describe('progressAt (Q2, Q12): centred on the cut, eased in and out', () => {
  const tr = into('b', 1);
  it('is null outside [cut − d/2, cut + d/2)', () => {
    expect(progressAt(tr, 4, 3.49)).toBeNull();
    expect(progressAt(tr, 4, 4.5)).toBeNull();
  });
  it('runs 0 → 1 with 205’s Ease in and out', () => {
    expect(progressAt(tr, 4, 3.5)).toBe(0);
    expect(progressAt(tr, 4, 4)).toBeCloseTo(0.5, 12);
    for (const p of [0.25, 0.75]) expect(progressAt(tr, 4, 3.5 + p)).toBeCloseTo(easeInOut(p), 12);
    expect(progressAt(tr, 4, 4.5 - 1e-9)).toBeCloseTo(1, 6);
  });
});

describe('roomFor (AC-3): what fits between two clips', () => {
  it('twice the shorter of what is left of each clip, at most 3 s', () => {
    const a = clip('a', 0, 2),
      b = clip('b', 2, 0.8);
    expect(roomFor(a, b, [a, b])).toBeCloseTo(1.6, 12);
    const long = [clip('a', 0, 10), clip('b', 10, 10)];
    expect(roomFor(long[0], long[1], long)).toBe(3);
  });
  it('leaves room for the clip’s other transition', () => {
    const clips = [clip('a', 0, 2, { transition: into('b', 1.2) }), clip('b', 2, 1), clip('c', 3, 4)];
    // b already gives 0.6 s to the transition from a: 0.4 s left on its side.
    expect(roomFor(clips[1], clips[2], clips)).toBeCloseTo(0.8, 12);
  });
});

describe('tidyTransitions (AC-4): the one rule', () => {
  it('keeps transitions between touching clips and returns the same array when nothing changes', () => {
    const clips = [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('b', 2, 2)];
    const tidy = tidyTransitions(clips, 30);
    expect(tidy.clips).toBe(clips);
    expect(tidy.dropped).toEqual([]);
  });

  it('drops one whose clip doesn’t start where its own ends: a gap, another track, a missing clip', () => {
    for (const clips of [
      [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('b', 2.5, 2)],
      [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('b', 2, 2, { track: 'O1' })],
      [clip('a', 0, 2, { transition: into('gone', 0.5) }), clip('b', 2, 2)],
      // Not its neighbour any more (a reorder): c now follows a.
      [clip('a', 0, 2, { transition: into('b', 0.5) }), clip('c', 2, 1), clip('b', 3, 2)],
    ]) {
      const tidy = tidyTransitions(clips, 30);
      expect(tidy.clips[0].transition).toBeUndefined();
      expect(tidy.dropped).toEqual(['a']);
    }
  });

  it('shortens one that no longer fits, in time order, so each clip’s two halves fit in it', () => {
    const clips = [clip('a', 0, 2, { transition: into('b', 2) }), clip('b', 2, 1.2, { transition: into('c', 2) }), clip('c', 3.2, 4)];
    const tidy = tidyTransitions(clips, 30);
    // a → b: b is 1.2 s, so at most 2.4; a's 2 s fits. b → c: b has 1.2 − 1 = 0.2 s left, so 0.4 s.
    expect(tidy.clips[0].transition!.dur).toBeCloseTo(2, 9);
    expect(tidy.clips[1].transition!.dur).toBeCloseTo(0.4, 9);
    expect(tidy.dropped).toEqual([]);
  });

  it('puts lengths on whole frames (rounding down) at 30 and 60 fps, and caps them at 3 s', () => {
    const clips = (dur: number) => [clip('a', 0, 10, { transition: into('b', dur) }), clip('b', 10, 10)];
    expect(tidyTransitions(clips(0.51), 30).clips[0].transition!.dur).toBeCloseTo(15 / 30, 12);
    expect(tidyTransitions(clips(0.51), 60).clips[0].transition!.dur).toBeCloseTo(30 / 60, 12);
    expect(tidyTransitions(clips(5), 30).clips[0].transition!.dur).toBe(3);
  });

  it('drops one with less than 0.1 s of room', () => {
    // z → a takes 1 s of a's 1.04 s: 0.04 s left for a → b, so 0.08 s of room.
    const clips = [clip('z', 0, 2, { transition: into('a', 2) }), clip('a', 2, 1.04, { transition: into('b', 1) }), clip('b', 3.04, 2)];
    const tidy = tidyTransitions(clips, 30);
    expect(tidy.clips[0].transition!.dur).toBeCloseTo(2, 9);
    expect(tidy.clips[1].transition).toBeUndefined();
    expect(tidy.dropped).toEqual(['a']);
  });

  it('works on overlay tracks and on clips of any type, keeping their other fields', () => {
    const clips = [
      { ...clip('a', 1, 2, { track: 'O1' }), name: 'first', transition: into('b', 0.5) },
      { ...clip('b', 3, 2, { track: 'O1' }), name: 'second' },
    ];
    const tidy = tidyTransitions(clips, 30);
    expect(tidy.clips[0]).toEqual(clips[0]);
    expect(tidy.clips[0].name).toBe('first');
  });
});
