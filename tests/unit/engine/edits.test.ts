import { describe, expect, it } from 'vitest';
import {
  MIN_LEN,
  PHOTO_MAX,
  checkTrack,
  closeGap,
  closeGaps,
  lift,
  limitVideos,
  moveTo,
  moveToTrack,
  nudge,
  reorder,
  rippleDelete,
  roll,
  slide,
  slip,
  tooManyVideos,
  trim,
  type EditClip,
  type EditCtx,
  type Tool,
} from '@/engine/edits';
import { snapTargets, snapTime } from '@/engine/timeSnap';
import type { Keyframe } from '@/engine/keyframes';
import type { Layer } from '@/engine/layers';
import { MAIN_VIDEO, defaultTracks } from '@/engine/tracks';
import { mergeProject } from '@/engine/projectGate';
import { clipLength, pack } from '@/engine/timeline';
import { toDocument, type ProjectDoc } from '@/engine/projectDoc';
import { legacyFixtures, type LegacyClip } from '../../support/timeline.testkit';
import { defined } from '../../support/defined';

type C = LegacyClip & EditClip;

const ctx: EditCtx = { maxLength: 3 * 3600, locked: () => null, maxVideos: 5, desktop: true };
const lockedCtx: EditCtx = {
  ...ctx,
  locked: (track) => (track === MAIN_VIDEO ? 'The Video track is locked. Unlock it to change its clips.' : null),
};

/**
 * A 2.x fixture on the main track, packed; videos get a source 1.5 s longer than the part used.
 * @param clips the 2.x clips
 * @returns the clips on the main track
 */
const onTrack = (clips: LegacyClip[]): C[] =>
  pack(
    clips.map((legacyClip) => ({
      ...legacyClip,
      track: MAIN_VIDEO,
      start: 0,
      srcDur: legacyClip.kind === 'video' ? legacyClip.out + 1.5 : 0,
    })),
  );

/**
 * Hand-made clips: [start, length] photos on the main track (ids a, b, c, …).
 * @param spans each photo's [start, length]
 * @returns the clips
 */
const photos = (...spans: [number, number][]): C[] =>
  spans.map(([start, dur], index) => ({
    ...legacyFixtures().photoOnly.clips[0],
    id: String.fromCharCode(97 + index),
    track: MAIN_VIDEO,
    start,
    dur,
    srcDur: 0,
  }));
const vid = (id: string, start: number, cin: number, out: number, srcDur: number): C => ({
  ...legacyFixtures().videoOnly.clips[0],
  id,
  track: MAIN_VIDEO,
  start,
  in: cin,
  out,
  srcDur,
});

const ok = <T>(result: { clips: T[] } | { error: string }): T[] => {
  if ('error' in result) throw new Error(`refused: ${result.error}`);
  return result.clips;
};
const err = (result: { clips: unknown[] } | { error: string }): string => ('error' in result ? result.error : '');
const spans = (cs: C[]) =>
  cs.map((legacyClip) => [legacyClip.id, +legacyClip.start.toFixed(6), +clipLength(legacyClip).toFixed(6)]);

/* Today's store (201), as reference: every change edits the list in order, then packs. */
const ref = {
  remove: (cs: C[], id: string) => pack(cs.filter((legacyClip) => legacyClip.id !== id)),
  patch: (cs: C[], id: string, patch: Partial<C>) =>
    pack(cs.map((legacyClip) => (legacyClip.id === id ? { ...legacyClip, ...patch } : legacyClip))),
  /**
   * The timeline's edge drag (Timeline.tsx at a3adea2), without snapping.
   * @param cs the clips
   * @param id the clip dragged
   * @param side which edge
   * @param dt how far, in seconds
   * @returns the clips after the drag
   */
  trim(cs: C[], id: string, side: 'start' | 'end', dt: number) {
    const c0 = defined(cs.find((legacyClip) => legacyClip.id === id));
    if (c0.kind === 'video')
      return side === 'end'
        ? this.patch(cs, id, { out: Math.max(c0.in + MIN_LEN, Math.min(c0.srcDur, c0.out + dt)) })
        : this.patch(cs, id, { in: Math.max(0, Math.min(c0.out - MIN_LEN, c0.in + dt)) });
    const dur = side === 'end' ? c0.dur + dt : c0.dur - dt;
    return this.patch(cs, id, { dur: Math.max(MIN_LEN, Math.min(60, dur)) });
  },
  moveTo(cs: C[], id: string, index: number) {
    const from = cs.findIndex((legacyClip) => legacyClip.id === id);
    const to = Math.max(0, Math.min(cs.length - 1, index));
    const out = cs.slice();
    const [moved] = out.splice(from, 1);
    out.splice(to, 0, moved);
    return pack(out);
  },
};

const fixtures = Object.entries(legacyFixtures())
  .filter(([, project]) => project.clips.length)
  .map(([name, project]) => [name, onTrack(project.clips.slice(0, 60))] as const);

describe('checkTrack: the invariant every edit keeps', () => {
  it('accepts every packed 2.x fixture', () => {
    for (const [, cs] of fixtures) expect(checkTrack(cs, ctx.maxLength)).toBeNull();
  });
  it('finds overlaps, unsorted clips, negative starts, out-of-source videos and over-long projects', () => {
    expect(checkTrack(photos([0, 2], [1, 2]), 100)).toMatch(/overlap/);
    expect(checkTrack(photos([4, 2], [0, 2]), 100)).toMatch(/order/);
    expect(checkTrack(photos([-1, 2]), 100)).toMatch(/before 0/);
    expect(checkTrack([vid('v', 0, 1, 5, 4)], 100)).toMatch(/source/);
    expect(checkTrack([vid('v', 0, -0.5, 2, 4)], 100)).toMatch(/source/);
    expect(checkTrack(photos([0, 2], [2, 2]), 3)).toMatch(/long/);
    expect(checkTrack(photos([0, 2], [3, 2]), 100)).toBeNull();
  });
  it('with the clips before an edit: a clip shortened under 0.3 s is an error; one already shorter may stay', () => {
    const before = photos([0, 2], [2, 0.2]);
    expect(checkTrack(photos([0, 0.25], [2, 0.2]), 100, before)).toMatch(/0\.3/);
    expect(checkTrack(photos([0, 2], [2, 0.2]), 100, before)).toBeNull();
  });
});

describe('delete: ripple, lift, and closing gaps', () => {
  const cs = photos([0, 2], [2, 3], [5, 1]);
  it('ripple delete pulls every later clip back by the clip’s length', () => {
    expect(spans(ok(rippleDelete(cs, 'b', ctx)))).toEqual([
      ['a', 0, 2],
      ['c', 2, 1],
    ]);
  });
  it('ripple delete pulls back by the length only: a gap after the clip stays', () => {
    const clips = photos([0, 2], [3, 1], [6, 1]);
    expect(spans(ok(rippleDelete(clips, 'b', ctx)))).toEqual([
      ['a', 0, 2],
      ['c', 5, 1],
    ]);
  });
  it('lift leaves a gap of the clip’s length; nothing else moves', () => {
    expect(spans(ok(lift(cs, 'b', ctx)))).toEqual([
      ['a', 0, 2],
      ['c', 5, 1],
    ]);
  });
  it('closeGap closes the gap at a time, closeGaps all of them (clips keep their order)', () => {
    const clips = photos([1, 2], [4, 1], [7, 1]);
    expect(spans(ok(closeGap(clips, 3.5, ctx)))).toEqual([
      ['a', 1, 2],
      ['b', 3, 1],
      ['c', 6, 1],
    ]);
    expect(spans(ok(closeGap(clips, 0.5, ctx)))).toEqual([
      ['a', 0, 2],
      ['b', 3, 1],
      ['c', 6, 1],
    ]);
    expect(err(closeGap(clips, 1.5, ctx))).toMatch(/no gap/i);
    expect(spans(closeGaps(clips))).toEqual([
      ['a', 0, 2],
      ['b', 2, 1],
      ['c', 3, 1],
    ]);
  });
  it('unknown clips and locked tracks are refused with the reason', () => {
    expect(err(rippleDelete(cs, 'zz', ctx))).toMatch(/isn’t on the timeline/);
    for (const result of [
      rippleDelete(cs, 'b', lockedCtx),
      lift(cs, 'b', lockedCtx),
      closeGap(photos([1, 1]), 0.5, lockedCtx),
    ])
      expect(err(result)).toMatch(/locked/);
  });
});

describe('trim', () => {
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6), ...photos([5, 1]).map((photo) => ({ ...photo, id: 'c' }))];
  const at = (clips: C[], id: string) => spans(clips).find((span) => span[0] === id);

  it('end, ripple: later clips move by the change', () => {
    const clips = ok(trim(cs, 'v', 'end', 1, { ripple: true }, ctx));
    expect(at(clips, 'v')).toEqual(['v', 2, 4]);
    expect(at(clips, 'c')).toEqual(['c', 6, 1]);
  });
  it('end, no ripple: shortening leaves a gap, lengthening stops at the next clip', () => {
    expect(at(ok(trim(cs, 'v', 'end', -1, { ripple: false }, ctx)), 'c')).toEqual(['c', 5, 1]);
    const clips = [...photos([0, 2]), vid('v', 2, 1, 4, 6), { ...photos([6, 1])[0], id: 'c' }];
    const legacyClips = ok(trim(clips, 'v', 'end', 5, { ripple: false }, ctx));
    expect(at(legacyClips, 'v')).toEqual(['v', 2, 4]);
    expect(at(legacyClips, 'c')).toEqual(['c', 6, 1]);
    expect(ok(trim(cs, 'v', 'end', 1, { ripple: false }, ctx))).toBe(cs);
  });
  it('start, ripple: the start stays, the source moves, later clips follow (2.x’s start trim)', () => {
    const clips = ok(trim(cs, 'v', 'start', 0.5, { ripple: true }, ctx));
    expect(defined(clips.find((legacyClip) => legacyClip.id === 'v')).in).toBe(1.5);
    expect(at(clips, 'v')).toEqual(['v', 2, 2.5]);
    expect(at(clips, 'c')).toEqual(['c', 4.5, 1]);
  });
  it('start, no ripple: the end stays, the start moves; lengthening stops at the previous clip', () => {
    const clips = ok(trim(cs, 'v', 'start', 0.5, { ripple: false }, ctx));
    expect(at(clips, 'v')).toEqual(['v', 2.5, 2.5]);
    expect(at(clips, 'c')).toEqual(['c', 5, 1]);
    const legacyClips = [...photos([0, 2]), vid('v', 3, 1, 4, 6)];
    const back = ok(trim(legacyClips, 'v', 'start', -5, { ripple: false }, ctx));
    expect(at(back, 'v')).toEqual(['v', 2, 4]);
    expect(defined(back.find((legacyClip) => legacyClip.id === 'v')).in).toBe(0);
  });
  it('limits: 0.3 s, the source, 60 s for a photo, a clip already shorter than 0.3 s', () => {
    expect(at(ok(trim(cs, 'v', 'end', -9, { ripple: true }, ctx)), 'v')).toEqual(['v', 2, MIN_LEN]);
    expect(at(ok(trim(cs, 'v', 'start', 9, { ripple: true }, ctx)), 'v')).toEqual(['v', 2, MIN_LEN]);
    expect(
      defined(ok(trim(cs, 'v', 'end', 9, { ripple: true }, ctx)).find((legacyClip) => legacyClip.id === 'v')).out,
    ).toBe(6);
    expect(
      defined(ok(trim(cs, 'v', 'start', -9, { ripple: true }, ctx)).find((legacyClip) => legacyClip.id === 'v')).in,
    ).toBe(0);
    expect(at(ok(trim(cs, 'a', 'end', 100, { ripple: true }, ctx)), 'a')).toEqual(['a', 0, PHOTO_MAX]);
    const tiny = photos([0, 0.2], [0.2, 1]);
    expect(ok(trim(tiny, 'a', 'end', -0.1, { ripple: true }, ctx))).toBe(tiny);
  });
  it('the project’s length limit refuses a lengthening that would pass it', () => {
    expect(err(trim(cs, 'a', 'end', 5, { ripple: true }, { ...ctx, maxLength: 8 }))).toMatch(/long/);
    expect(at(ok(trim(cs, 'a', 'end', 1, { ripple: true }, { ...ctx, maxLength: 8 })), 'c')).toEqual(['c', 6, 1]);
  });
  it('locked and unknown clips are refused', () => {
    expect(err(trim(cs, 'v', 'end', 1, { ripple: true }, lockedCtx))).toMatch(/locked/);
    expect(err(trim(cs, 'zz', 'end', 1, { ripple: true }, ctx))).toMatch(/isn’t on the timeline/);
  });
});

describe('moveTo (Magnetic off) and reorder (Magnetic on)', () => {
  const cs = photos([0, 2], [4, 2], [6, 3]);
  it('places a clip at the time asked when it fits', () => {
    expect(spans(ok(moveTo(cs, 'a', 2, ctx)))).toEqual([
      ['a', 2, 2],
      ['b', 4, 2],
      ['c', 6, 3],
    ]);
  });
  it('else at the nearest free spot where it fits, before or after', () => {
    // [1.5, 4.5] overlaps; the 2 s gap is too short for c (3 s); its own place at 6 is nearest.
    expect(spans(ok(moveTo(cs, 'c', 1.5, ctx))).find((span) => span[0] === 'c')).toEqual(['c', 6, 3]);
    // [3, 5] overlaps b; the gap 0–4 (a moved out) fits at 2.
    expect(spans(ok(moveTo(cs, 'a', 3, ctx))).find((span) => span[0] === 'a')).toEqual(['a', 2, 2]);
    // [8, 10] overlaps c; after c (9) is nearer than the gap before b (2).
    expect(spans(ok(moveTo(cs, 'a', 8, ctx)))).toEqual([
      ['b', 4, 2],
      ['c', 6, 3],
      ['a', 9, 2],
    ]);
    // Before 0 is 0.
    expect(spans(ok(moveTo(cs, 'b', -3, ctx))).find((span) => span[0] === 'b')).toEqual(['b', 2, 2]);
  });
  it('keeps the project within its length, else refuses with the reason (Q2)', () => {
    expect(spans(ok(moveTo(cs, 'a', 8, { ...ctx, maxLength: 9 }))).find((span) => span[0] === 'a')).toEqual([
      'a',
      2,
      2,
    ]);
    const full = photos([0, 3], [3, 3], [8, 4]);
    expect(err(moveTo(full, 'c', 1, { ...ctx, maxLength: 9 }))).toBe(
      'No room here: make a gap first or switch Magnetic on',
    );
  });
  it('reorder is today’s drag to a place, packed', () => {
    for (const [, clips] of fixtures)
      if (clips.length > 2) {
        expect(spans(ok(reorder(clips, clips[0].id, 2, ctx)))).toEqual(spans(ref.moveTo(clips, clips[0].id, 2)));
        expect(spans(ok(reorder(clips, clips[clips.length - 1].id, 0, ctx)))).toEqual(
          spans(ref.moveTo(clips, clips[clips.length - 1].id, 0)),
        );
      }
    expect(ok(reorder(cs, 'a', 0, ctx))).toBe(cs);
  });
  it('locked tracks are refused', () => {
    expect(err(moveTo(cs, 'a', 2, lockedCtx))).toMatch(/locked/);
    expect(err(reorder(cs, 'a', 2, lockedCtx))).toMatch(/locked/);
  });
});

describe('AC-1: with Magnetic on (results packed) every edit equals today’s store on the 2.x fixtures', () => {
  const deltas = [-100, -1, -0.2, 0.15, 0.5, 2, 100];
  it.each(fixtures)('%s', (_, cs) => {
    for (const legacyClip of cs) {
      expect(spans(pack(ok(rippleDelete(cs, legacyClip.id, ctx))))).toEqual(spans(ref.remove(cs, legacyClip.id)));
      expect(spans(pack(ok(lift(cs, legacyClip.id, ctx))))).toEqual(spans(ref.remove(cs, legacyClip.id)));
      // Clips already under 0.3 s: 2.x's edge drag snapped them up to 0.3 s even when shortening; 202 leaves them.
      if (clipLength(legacyClip) < MIN_LEN) continue;
      for (const side of ['start', 'end'] as const)
        for (const delta of deltas) {
          const got = trim(cs, legacyClip.id, side, delta, { ripple: true }, ctx);
          expect(spans(pack(ok(got))), `${legacyClip.id} ${side} ${delta}`).toEqual(
            spans(ref.trim(cs, legacyClip.id, side, delta)),
          );
        }
    }
  });
});

const length = (cs: C[]) => Math.max(...cs.map((legacyClip) => legacyClip.start + clipLength(legacyClip)));
const get = (cs: C[], id: string) => defined(cs.find((legacyClip) => legacyClip.id === id));

describe('roll: move the cut between two adjacent clips', () => {
  // a: photo 0–2; v: video 2–5 (source 1–4 of 6); c: photo 5–6.
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6), { ...photos([5, 1])[0], id: 'c' }];
  it('lengthens one clip and shortens the other by the same amount; nothing else moves, the length stays', () => {
    const clips = ok(roll(cs, 'a', 0.5, ctx));
    expect(spans(clips)).toEqual([
      ['a', 0, 2.5],
      ['v', 2.5, 2.5],
      ['c', 5, 1],
    ]);
    expect(get(clips, 'v').in).toBe(1.5);
    const back = ok(roll(cs, 'v', -1, ctx));
    expect(spans(back)).toEqual([
      ['a', 0, 2],
      ['v', 2, 2],
      ['c', 4, 2],
    ]);
    expect(length(back)).toBe(length(cs));
  });
  it('stops at 0.3 s and at the source’s ends', () => {
    expect(spans(ok(roll(cs, 'a', 9, ctx)))[1]).toEqual(['v', 4.7, MIN_LEN]);
    expect(spans(ok(roll(cs, 'v', -9, ctx)))[1]).toEqual(['v', 2, MIN_LEN]);
    // v's start can't go before its source's start (in 1 → 0): a can shrink by at most 1 s.
    expect(get(ok(roll(cs, 'a', -1.5, ctx)), 'v').in).toBe(0);
    expect(spans(ok(roll(cs, 'a', -1.5, ctx)))[0]).toEqual(['a', 0, 1]);
    // v's end can't pass its source (out 4 → 6): c gives up at most its length − 0.3 s (0.7 s).
    expect(get(ok(roll(cs, 'v', 5, ctx)), 'v').out).toBeCloseTo(4.7, 9);
    expect(ok(roll(cs, 'a', 0, ctx))).toBe(cs);
  });
  it('a cut with a gap, or no clip after, is refused; locked refused', () => {
    const clips = photos([0, 2], [3, 2]);
    expect(err(roll(clips, 'a', 0.5, ctx))).toMatch(/gap/);
    expect(err(roll(cs, 'c', 0.5, ctx))).toMatch(/no clip after/);
    expect(err(roll(cs, 'a', 0.5, lockedCtx))).toMatch(/locked/);
  });
});

describe('slip: change which part of a video plays', () => {
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6)];
  it('moves in and out together; the start and length stay', () => {
    const clips = ok(slip(cs, 'v', 0.5, ctx));
    expect([get(clips, 'v').in, get(clips, 'v').out, get(clips, 'v').start]).toEqual([1.5, 4.5, 2]);
  });
  it('stops at the source’s ends', () => {
    expect([get(ok(slip(cs, 'v', 9, ctx)), 'v').in, get(ok(slip(cs, 'v', 9, ctx)), 'v').out]).toEqual([3, 6]);
    expect([get(ok(slip(cs, 'v', -9, ctx)), 'v').in, get(ok(slip(cs, 'v', -9, ctx)), 'v').out]).toEqual([0, 3]);
    const full = [vid('w', 0, 0, 6, 6)];
    expect(ok(slip(full, 'w', 1, ctx))).toBe(full);
  });
  it('a photo is refused with a message; locked refused', () => {
    expect(err(slip(cs, 'a', 0.5, ctx))).toMatch(/photo/i);
    expect(err(slip(cs, 'v', 0.5, lockedCtx))).toMatch(/locked/);
  });
});

describe('slide: move a clip between its neighbours', () => {
  // a: 0–2 photo; v: 2–4 video (source 1–3 of 6); b: 4–7 video (source 1–4 of 6); c: 7–8 photo.
  const cs = [...photos([0, 2]), vid('v', 2, 1, 3, 6), vid('b', 4, 1, 4, 6), { ...photos([7, 1])[0], id: 'c' }];
  it('the previous clip’s end and the next clip’s start move with it; its content and length stay', () => {
    const clips = ok(slide(cs, 'v', 0.5, ctx));
    expect(spans(clips)).toEqual([
      ['a', 0, 2.5],
      ['v', 2.5, 2],
      ['b', 4.5, 2.5],
      ['c', 7, 1],
    ]);
    expect([get(clips, 'v').in, get(clips, 'v').out, get(clips, 'b').in]).toEqual([1, 3, 1.5]);
    expect(length(clips)).toBe(length(cs));
  });
  it('stops where a neighbour would go under 0.3 s or past its source', () => {
    // Left: b's start can't go before its source (in 1 → 0), 1 s, before a reaches 0.3 s (1.7 s).
    expect(get(ok(slide(cs, 'v', -9, ctx)), 'v').start).toBeCloseTo(1, 9);
    // Right: b shrinks to 0.3 s (2.7 s).
    expect(get(ok(slide(cs, 'v', 9, ctx)), 'v').start).toBeCloseTo(4.7, 9);
    // Right: c shrinks to 0.3 s (0.7 s) before v's end reaches its source's (3 s).
    expect(get(ok(slide(cs, 'b', 9, ctx)), 'b').start).toBeCloseTo(4.7, 9);
    // Left: v shrinks to 0.3 s (1.7 s).
    expect(get(ok(slide(cs, 'b', -9, ctx)), 'b').start).toBeCloseTo(2.3, 9);
  });
  it('next to a gap the clip only moves into (or away from) the gap', () => {
    const clips = photos([0, 2], [3, 2], [5, 1]);
    expect(spans(ok(slide(clips, 'b', -5, ctx)))).toEqual([
      ['a', 0, 2],
      ['b', 2, 2],
      ['c', 4, 2],
    ]);
    const legacyClips = photos([0, 2], [2, 2], [5, 1]);
    expect(spans(ok(slide(legacyClips, 'b', 5, ctx)))).toEqual([
      ['a', 0, 3],
      ['b', 3, 2],
      ['c', 5, 1],
    ]);
  });
  it('bounded by 0; the last clip has nothing to slide against; Magnetic on opens no gap', () => {
    expect(ok(slide(cs, 'a', -1, ctx))).toBe(cs);
    expect(get(ok(slide(cs, 'a', 0.5, ctx)), 'a').start).toBe(0.5);
    expect(ok(slide(cs, 'a', 0.5, ctx, true))).toBe(cs);
    const clips = photos([0, 2], [2, 2], [5, 1]);
    // Into the gap after b, yes; away from it (growing it), no.
    expect(get(ok(slide(clips, 'b', 1, ctx, true)), 'b').start).toBe(3);
    expect(ok(slide(clips, 'b', -1, ctx, true))).toBe(clips);
    expect(err(slide(cs, 'c', -0.5, ctx))).toMatch(/no clip after/);
  });
  it('locked refused', () => expect(err(slide(cs, 'v', 0.5, lockedCtx))).toMatch(/locked/));
});

describe('nudge: the keyboard’s Alt + arrows with each tool', () => {
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6), { ...photos([5, 1])[0], id: 'c' }];
  it('Select with Magnetic on reorders one place per press', () => {
    expect(ok(nudge(cs, 'a', 'select', 1, 30, true, ctx)).map((legacyClip) => legacyClip.id)).toEqual(['v', 'a', 'c']);
    expect(ok(nudge(cs, 'a', 'select', -30, 30, true, ctx))).toBe(cs);
  });
  it('Select with Magnetic off moves the clip by a frame or a second (to a free spot)', () => {
    const clips = photos([0, 2], [3, 1]);
    expect(get(ok(nudge(clips, 'b', 'select', 1, 30, false, ctx)), 'b').start).toBeCloseTo(3 + 1 / 30, 12);
    expect(get(ok(nudge(clips, 'b', 'select', -1, 60, false, ctx)), 'b').start).toBeCloseTo(3 - 1 / 60, 12);
    expect(get(ok(nudge(clips, 'b', 'select', -30, 30, false, ctx)), 'b').start).toBeCloseTo(2, 12);
  });
  it('Roll moves the clip’s end cut, Slip slips, Slide slides', () => {
    expect(clipLength(get(ok(nudge(cs, 'a', 'roll', 3, 30, true, ctx)), 'a'))).toBeCloseTo(2.1, 12);
    expect(get(ok(nudge(cs, 'v', 'slip', 60, 60, true, ctx)), 'v').in).toBeCloseTo(2, 12);
    expect(get(ok(nudge(cs, 'v', 'slide', -1, 30, true, ctx)), 'v').start).toBeCloseTo(2 - 1 / 30, 12);
    expect(err(nudge(cs, 'a', 'slip', 1, 30, true, ctx))).toMatch(/photo/i);
  });
});

describe('snapping (moved out of the timeline)', () => {
  const cs = photos([0, 2], [3, 1.5]);
  const layers = [{ id: 'l1', start: 1.2, end: 2.6 }, { id: 'l2' }] as Layer[];
  it('targets: 0, the end, the playhead, clip and gap edges, layer edges (an untimed layer ends with the video)', () => {
    expect(snapTargets(cs, layers, 0.7, 4.5).sort((left, right) => left - right)).toEqual([
      0, 0, 0, 0.7, 1.2, 2, 2.6, 3, 4.5, 4.5, 4.5,
    ]);
  });
  it('skips the dragged clip’s or layer’s own edges', () => {
    const targets = snapTargets(cs, layers, 0.7, 4.5, { clip: 'b', layer: 'l1' });
    expect(targets).not.toContain(3);
    expect(targets).not.toContain(1.2);
    expect(targets).not.toContain(2.6);
  });
  it('snaps to the nearest target within the tolerance (8 px at the zoom), else leaves the time', () => {
    const wanted = [0, 2, 3, 4.5];
    const tol = 8 / 60; // 60 px per second
    expect(snapTime(2.1, wanted, tol)).toBe(2);
    expect(snapTime(2.9, wanted, tol)).toBe(3);
    expect(snapTime(2.5, wanted, tol)).toBe(2.5);
    expect(snapTime(2.1, wanted, 8 / 400)).toBe(2.1);
    expect(snapTime(2.1, [], tol)).toBe(2.1);
    // Nearest wins when two are in range.
    expect(snapTime(2.06, [2, 2.1], tol)).toBe(2.1);
  });
});

/* ---------- 203: overlay tracks (AC-3, AC-9) ---------- */

const O1 = 'O1',
  O2 = 'O2',
  O3 = 'O3';
/**
 * A photo clip [start, start + dur] on a track.
 * @param id its id
 * @param start where it starts
 * @param dur how long it shows
 * @param track its track
 * @returns the clip
 */
const pic = (id: string, start: number, dur: number, track = O1): C => ({ ...photos([start, dur])[0], id, track });
/**
 * A video clip on a track, its source 10 s long.
 * @param id its id
 * @param start where it starts
 * @param len how long it plays
 * @param track its track
 * @returns the clip
 */
const clip = (id: string, start: number, len: number, track: string): C => ({ ...vid(id, start, 0, len, 10), track });
/**
 * One track's clips in the order they are listed: [id, start, length].
 * @param cs the clips
 * @param track the track
 * @returns [id, start, length] per clip
 */
const onTrack_ = (cs: C[], track: string) => spans(cs.filter((legacyClip) => legacyClip.track === track));

describe('203 moveToTrack: between picture tracks (AC-3)', () => {
  // Main: a 0–2, b 2–5, c 5–6; Overlay 1: x 1–4.
  const base = [...photos([0, 2], [2, 3], [5, 1]), pic('x', 1, 3)];
  const off = { ...ctx, magnetic: false },
    on = { ...ctx, magnetic: true };
  it('main → overlay: at the time asked when it fits, else the nearest free spot; the main track keeps its gap', () => {
    const clips = ok(moveToTrack(base, 'c', O1, 0, off));
    expect(onTrack_(clips, O1)).toEqual([
      ['c', 0, 1],
      ['x', 1, 3],
    ]);
    const legacyClips = ok(moveToTrack(base, 'b', O1, 2, off));
    expect(onTrack_(legacyClips, O1)).toEqual([
      ['x', 1, 3],
      ['b', 4, 3],
    ]);
    expect(onTrack_(legacyClips, MAIN_VIDEO)).toEqual([
      ['a', 0, 2],
      ['c', 5, 1],
    ]);
    expect(checkTrack(legacyClips, ctx.maxLength, base)).toBeNull();
  });
  it('main → overlay with Magnetic on: the main track closes up, the overlay track is not packed', () => {
    const clips = ok(moveToTrack(base, 'b', O1, 2, on));
    expect(onTrack_(clips, MAIN_VIDEO)).toEqual([
      ['a', 0, 2],
      ['c', 2, 1],
    ]);
    expect(onTrack_(clips, O1)).toEqual([
      ['x', 1, 3],
      ['b', 4, 3],
    ]);
  });
  it('overlay → main with Magnetic on: inserted where its centre falls (as the timeline’s drag), then packed', () => {
    // Centre 2 is before b's middle (3.5).
    expect(onTrack_(ok(moveToTrack(base, 'x', MAIN_VIDEO, 0.5, on)), MAIN_VIDEO)).toEqual([
      ['a', 0, 2],
      ['x', 2, 3],
      ['b', 5, 3],
      ['c', 8, 1],
    ]);
    // Centre 5.5 is not before c's middle (5.5): last.
    expect(onTrack_(ok(moveToTrack(base, 'x', MAIN_VIDEO, 4, on)), MAIN_VIDEO)).toEqual([
      ['a', 0, 2],
      ['b', 2, 3],
      ['c', 5, 1],
      ['x', 6, 3],
    ]);
    const first = ok(moveToTrack(base, 'x', MAIN_VIDEO, -5, on));
    expect(onTrack_(first, MAIN_VIDEO).map((entry) => entry[0])).toEqual(['x', 'a', 'b', 'c']);
    expect(onTrack_(first, O1)).toEqual([]);
  });
  it('overlay → main with Magnetic off is moveTo: there if it fits, else the nearest free spot', () => {
    const gap = [...photos([0, 2]), pic('c', 5, 1, MAIN_VIDEO), pic('x', 1, 3)];
    expect(onTrack_(ok(moveToTrack(gap, 'x', MAIN_VIDEO, 1.5, off)), MAIN_VIDEO)).toEqual([
      ['a', 0, 2],
      ['x', 2, 3],
      ['c', 5, 1],
    ]);
    expect(onTrack_(ok(moveToTrack(base, 'x', MAIN_VIDEO, 2, off)), MAIN_VIDEO)).toEqual([
      ['a', 0, 2],
      ['b', 2, 3],
      ['c', 5, 1],
      ['x', 6, 3],
    ]);
  });
  it('within its own track it is moveTo (or reorder for the main track with Magnetic on)', () => {
    expect(ok(moveToTrack(base, 'x', O1, 6, off))).toEqual(ok(moveTo(base, 'x', 6, ctx)));
    expect(onTrack_(ok(moveToTrack(base, 'a', MAIN_VIDEO, 5.5, on)), MAIN_VIDEO).map((entry) => entry[0])).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
  it('a locked source or target track is refused', () => {
    const lockedO1 = { ...ctx, locked: (track: string) => (track === O1 ? 'Overlay 1 is locked.' : null) };
    expect(err(moveToTrack(base, 'x', MAIN_VIDEO, 0, { ...lockedCtx, magnetic: true }))).toMatch(/locked/);
    expect(err(moveToTrack(base, 'a', O1, 6, { ...lockedCtx, magnetic: false }))).toMatch(/locked/);
    expect(err(moveToTrack(base, 'a', O1, 6, { ...lockedO1, magnetic: false }))).toBe('Overlay 1 is locked.');
    expect(err(moveToTrack(base, 'x', MAIN_VIDEO, 0, { ...lockedO1, magnetic: true }))).toBe('Overlay 1 is locked.');
    expect(err(moveToTrack(base, 'nope', O1, 0, off))).toBe('That clip isn’t on the timeline.');
  });
  it('never overlaps: no free spot within the length limit is refused', () => {
    expect(err(moveToTrack(base, 'b', O1, 2, { ...off, maxLength: 6.5 }))).toBe(
      'No room here: make a gap first or switch Magnetic on',
    );
    expect(err(moveToTrack(base, 'b', O1, 2, { ...on, maxLength: 6.5 }))).toBe(
      'No room here: make a gap first or switch Magnetic on',
    );
    expect(err(moveToTrack(base, 'x', MAIN_VIDEO, 0, { ...on, maxLength: 8 }))).toMatch(/longer/);
  });
  it('300 seeded moves between three picture tracks, with edits in between, keep every track valid', () => {
    const rnd = mulberry32(203);
    const tracks = [MAIN_VIDEO, O1, O2];
    const kinds = ['moveToTrack', 'moveTo', 'trim', 'rippleDelete', 'slide', 'roll', 'closeGap'];
    let cs = fixtures[2][1],
      applied = 0;
    for (let index = 0; index < 300; index++) {
      if (cs.length < 3) cs = fixtures[index % fixtures.length][1];
      const before = cs;
      const id = cs[Math.floor(rnd() * cs.length)].id;
      const magnetic = rnd() < 0.5;
      const x = { ...ctx, magnetic };
      const kind = rnd() < 0.5 ? 'moveToTrack' : kinds[Math.floor(rnd() * kinds.length)];
      const run = () => {
        if (kind === 'moveToTrack')
          return moveToTrack(cs, id, tracks[Math.floor(rnd() * 3)], rnd() * (length(cs) + 2) - 1, x);
        if (kind === 'closeGap') return closeGap(cs, rnd() * length(cs), x, tracks[Math.floor(rnd() * 3)]);
        return OPS[kind](cs, id, rnd, x);
      };
      const result = run();
      if ('error' in result) continue;
      expect(checkTrack(result.clips, x.maxLength, before), `step ${index} ${kind}`).toBeNull();
      if (result.clips !== before) applied++;
      cs = result.clips;
    }
    expect(applied).toBeGreaterThan(100);
    expect(new Set(cs.map((legacyClip) => legacyClip.track)).size).toBeGreaterThan(1);
  });
});

describe('203: every 202 operation works on an overlay track, which is never packed (AC-3, Q8)', () => {
  // Main: a 0–2, b 2–5. Overlay 1: p 1–3, q 5–7, r 7–8 (gaps before p and q). Overlay 2: the video w 3–5.
  const ov = [...photos([0, 2], [2, 3]), pic('p', 1, 2), pic('q', 5, 2), pic('r', 7, 1), clip('w', 3, 2, O2)];
  const main = onTrack_(ov, MAIN_VIDEO);
  const o1 = (cs: C[]) => onTrack_(cs, O1);
  it('trim, with and without ripple; the main track and the gaps stay', () => {
    const clips = ok(trim(ov, 'p', 'end', 1, { ripple: false }, ctx));
    expect(o1(clips)).toEqual([
      ['p', 1, 3],
      ['q', 5, 2],
      ['r', 7, 1],
    ]);
    expect(onTrack_(clips, MAIN_VIDEO)).toEqual(main);
    // Without ripple, lengthening stops at the next clip.
    expect(o1(ok(trim(ov, 'p', 'end', 5, { ripple: false }, ctx)))[0]).toEqual(['p', 1, 4]);
    const rt = ok(trim(ov, 'q', 'end', 1, { ripple: true }, ctx));
    expect(o1(rt)).toEqual([
      ['p', 1, 2],
      ['q', 5, 3],
      ['r', 8, 1],
    ]);
    expect(onTrack_(rt, MAIN_VIDEO)).toEqual(main);
  });
  it('ripple delete and lift: later clips on the track follow (ripple), nothing is packed', () => {
    const clips = ok(rippleDelete(ov, 'q', ctx));
    expect(o1(clips)).toEqual([
      ['p', 1, 2],
      ['r', 5, 1],
    ]);
    expect(onTrack_(clips, MAIN_VIDEO)).toEqual(main);
    expect(o1(ok(lift(ov, 'q', ctx)))).toEqual([
      ['p', 1, 2],
      ['r', 7, 1],
    ]);
  });
  it('closing one gap on the overlay track closes only that gap', () => {
    expect(o1(ok(closeGap(ov, 4, ctx, O1)))).toEqual([
      ['p', 1, 2],
      ['q', 3, 2],
      ['r', 5, 1],
    ]);
  });
  it('roll, slip and slide', () => {
    expect(o1(ok(roll(ov, 'q', 0.5, ctx)))).toEqual([
      ['p', 1, 2],
      ['q', 5, 2.5],
      ['r', 7.5, 0.5],
    ]);
    const legacyClip = get(ok(slip(ov, 'w', 1, ctx)), 'w');
    expect([legacyClip.start, legacyClip.in, legacyClip.out]).toEqual([3, 1, 3]);
    expect(o1(ok(slide(ov, 'q', -1, ctx)))).toEqual([
      ['p', 1, 2],
      ['q', 4, 2],
      ['r', 6, 2],
    ]);
    // With Magnetic on a main-track slide may not open a gap; an overlay track is never magnetic.
    expect(o1(ok(slide(ov, 'q', 0.5, ctx, true)))).toEqual([
      ['p', 1, 2],
      ['q', 5.5, 2],
      ['r', 7.5, 0.5],
    ]);
  });
  it('moveTo and the keyboard’s nudge (Magnetic on moves by time there, it doesn’t reorder)', () => {
    expect(o1(ok(moveTo(ov, 'p', 3.5, ctx)))).toEqual([
      ['p', 3, 2],
      ['q', 5, 2],
      ['r', 7, 1],
    ]);
    expect(get(ok(nudge(ov, 'q', 'select', -1, 30, true, ctx)), 'q').start).toBeCloseTo(5 - 1 / 30, 12);
    expect(onTrack_(ok(nudge(ov, 'q', 'select', -1, 30, true, ctx)), MAIN_VIDEO)).toEqual(main);
    expect(err(reorder(ov, 'q', 0, ctx))).toMatch(/main video track/);
  });
  it('split and duplicate (the store makes them) pass the videos-at-once check when they add no video at once', () => {
    const legacyClip = get(ov, 'q');
    const split = ov.flatMap((overlay) =>
      overlay.id === 'q'
        ? [
            { ...legacyClip, dur: 1 },
            { ...legacyClip, id: 'q2', start: 6, dur: 1 },
          ]
        : [overlay],
    );
    expect(ok(limitVideos(ov, { clips: split }, ctx))).toBe(split);
    expect(checkTrack(split, ctx.maxLength, ov)).toBeNull();
    const dup = [...ov, { ...get(ov, 'w'), id: 'w2', start: 5 }];
    expect(ok(limitVideos(ov, { clips: dup }, { ...ctx, maxVideos: 2 }))).toBe(dup);
  });
  it('snapping targets include every overlay clip’s edges', () => {
    const targets = snapTargets(ov, [], 0, 8);
    for (const at of [1, 3, 5, 7, 8]) expect(targets).toContain(at);
    expect(snapTargets(ov, [], 0, 8, { clip: 'p' })).not.toContain(1);
  });
});

describe('203: the videos-at-once limit (AC-9, D3)', () => {
  // Main: the video v 0–6. Overlay 1: w 0–2. Overlay 2: y 4–6, a photo ph 7–9. Two videos at once at most.
  const lim = [clip('v', 0, 6, MAIN_VIDEO), clip('w', 0, 2, O1), clip('y', 4, 2, O2), pic('ph', 7, 2, O2)];
  const c2 = { ...ctx, maxVideos: 2, desktop: false },
    c3 = { ...ctx, maxVideos: 3, desktop: false };
  it('an edit that shows more videos at once than the limit is refused with the message naming it', () => {
    expect(err(moveTo(lim, 'y', 0, c2))).toBe(tooManyVideos(2, false));
    expect(err(trim(lim, 'w', 'end', 3, { ripple: false }, c2))).toBe(tooManyVideos(2, false));
    expect(err(moveToTrack(lim, 'y', O3, 0, { ...c2, magnetic: false }))).toBe(tooManyVideos(2, false));
    expect(get(ok(moveTo(lim, 'y', 0, c3)), 'y').start).toBe(0);
    expect(clipLength(get(ok(trim(lim, 'w', 'end', 1.5, { ripple: false }, c2)), 'w'))).toBe(3.5);
  });
  it('photos don’t count', () => {
    expect(get(ok(moveTo(lim, 'ph', 0, c2)), 'ph').start).toBe(0);
    expect(get(ok(moveToTrack(lim, 'ph', O3, 0, { ...c2, magnetic: false })), 'ph').track).toBe(O3);
  });
  it('an edit that doesn’t raise the count is allowed, even over the limit (a lower limit, an older project)', () => {
    const over = lim
      .map((legacyClip) => (legacyClip.id === 'y' ? { ...legacyClip, start: 0 } : legacyClip))
      .sort((left, right) => left.start - right.start);
    expect(get(ok(moveTo(over, 'y', 0.5, c2)), 'y').start).toBe(0.5);
    expect(get(ok(trim(over, 'v', 'end', -1, { ripple: false }, c2)), 'v').out).toBe(5);
  });
  it('limitVideos checks a result the store made itself (split, duplicate)', () => {
    const dup = [...lim, { ...get(lim, 'y'), id: 'y2', track: O3, start: 0 }];
    expect(err(limitVideos(lim, { clips: dup }, c2))).toBe(tooManyVideos(2, false));
    expect(ok(limitVideos(lim, { clips: dup }, c3))).toBe(dup);
    expect(err(limitVideos(lim, { error: 'no' }, c2))).toBe('no');
  });
  it('the desktop app’s limit has no “the desktop app allows” in its message', () => {
    // Five videos at 0–2 (main and Overlays 1–4) and a sixth on Overlay 5 at 4–6.
    const five = [
      clip('v', 0, 6, MAIN_VIDEO),
      ...[1, 2, 3, 4].map((nth) => clip(`o${nth}`, 0, 2, `O${nth}`)),
      clip('z', 4, 2, 'O5'),
    ];
    expect(err(moveTo(five, 'z', 0, ctx))).toBe(tooManyVideos(5, true));
  });
  it('the message says the limit, why, and (in the browser) what the desktop app allows', () => {
    expect(tooManyVideos(3, false)).toMatch(/^At most 3 videos can show at the same time in the browser/);
    expect(tooManyVideos(3, false)).toMatch(/memory/);
    expect(tooManyVideos(3, false)).toMatch(/the desktop app allows 5\.$/);
    // Without WebCodecs' video decoding the browser plays one video at a time: that, not memory, is the reason.
    expect(tooManyVideos(1, false)).toMatch(
      /^This browser can show one video at a time: it can’t decode video frames itself/,
    );
    expect(tooManyVideos(1, false)).not.toMatch(/memory/);
    expect(tooManyVideos(1, true)).toMatch(/^At most 1 video can show/);
    expect(tooManyVideos(5, true)).toMatch(/^At most 5 videos can show at the same time/);
    expect(tooManyVideos(5, true)).toMatch(/memory/);
    expect(tooManyVideos(5, true)).not.toMatch(/desktop app/);
  });
});

/* ---------- AC-11 and AC-12 ---------- */

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let time = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    time = (time + Math.imul(time ^ (time >>> 7), 61 | time)) ^ time;
    return ((time ^ (time >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The clips as a saved project (a medium entry per clip).
 * @param cs the clips
 * @returns the document
 */
const asDoc = (cs: C[]): ProjectDoc => ({
  version: 1,
  kind: 'vlog',
  format: 'yt1080',
  fps: 30,
  quality: 'standard',
  fadeOut: true,
  tracks: defaultTracks(),
  clips: cs.map((legacyClip) => ({ ...legacyClip, media: `m${legacyClip.id}` })),
  audio: [],
  layers: [],
  media: cs.map((legacyClip) => ({
    id: `m${legacyClip.id}`,
    kind: legacyClip.kind,
    name: legacyClip.id,
    type: legacyClip.kind === 'video' ? 'video/mp4' : 'image/jpeg',
    size: 1,
    w: 10,
    h: 10,
    srcDur: legacyClip.srcDur,
  })),
});

type Op = (cs: C[], id: string, rnd: () => number, ctx: EditCtx) => { clips: C[] } | { error: string };
const jitter = (rnd: () => number) => (rnd() - 0.5) * (rnd() < 0.2 ? 40 : 4);
const TOOLS: Tool[] = ['select', 'roll', 'slip', 'slide'];
const OPS: Record<string, Op> = {
  rippleDelete: (cs, id, _, x) => rippleDelete(cs, id, x),
  lift: (cs, id, _, x) => lift(cs, id, x),
  closeGap: (cs, _, rnd, x) => closeGap(cs, rnd() * length(cs), x),
  trim: (cs, id, rnd, x) => trim(cs, id, rnd() < 0.5 ? 'start' : 'end', jitter(rnd), { ripple: rnd() < 0.5 }, x),
  moveTo: (cs, id, rnd, x) => moveTo(cs, id, rnd() * (length(cs) + 3) - 1, x),
  reorder: (cs, id, rnd, x) => reorder(cs, id, Math.floor(rnd() * cs.length), x),
  roll: (cs, id, rnd, x) => roll(cs, id, jitter(rnd), x),
  slip: (cs, id, rnd, x) => slip(cs, id, jitter(rnd), x),
  slide: (cs, id, rnd, x) => slide(cs, id, jitter(rnd), x, rnd() < 0.5),
  nudge: (cs, id, rnd, x) =>
    nudge(cs, id, TOOLS[Math.floor(rnd() * 4)], Math.round((rnd() - 0.5) * 120), rnd() < 0.5 ? 30 : 60, rnd() < 0.5, x),
};

describe('AC-11: 1,000 seeded random edits per operation keep every rule', () => {
  const starts = fixtures.map(([, cs]) => cs);
  it.each(Object.keys(OPS))('%s', (name) => {
    const rnd = mulberry32(name.length * 7919);
    let cs = starts[0],
      step = 0,
      applied = 0;
    for (let index = 0; index < 1000; index++) {
      // Every fixture in turn, and a fresh one when edits left too few clips.
      if (cs.length < 2 || (index % 100 === 0 && index)) cs = starts[++step % starts.length];
      const before = cs;
      // A length limit near the current length, so lengthening is sometimes refused.
      const x = { ...ctx, maxLength: length(cs) + rnd() * 3 };
      // A quarter of the steps is a lift or a move first, so there are gaps to edit around.
      let op = OPS[name];
      if (rnd() < 0.25) op = rnd() < 0.5 ? OPS.lift : OPS.moveTo;
      const result = op(cs, cs[Math.floor(rnd() * cs.length)].id, rnd, x);
      if ('error' in result) continue;
      expect(checkTrack(result.clips, x.maxLength, before), `${name} step ${index}`).toBeNull();
      if (result.clips !== before) applied++;
      cs = result.clips;
      // Packed (Magnetic on) and as it is (Magnetic off, gaps kept), the project goes through the gate unchanged.
      if (index % 10 === 0)
        for (const doc of [toDocument(asDoc(pack(cs))), toDocument({ ...asDoc(cs), magnetic: false })]) {
          const back = mergeProject(JSON.parse(JSON.stringify(doc)), true);
          expect(back.dropped, `${name} step ${index}`).toEqual([]);
          expect(back.doc, `${name} step ${index}`).toEqual(doc);
        }
    }
    expect(applied).toBeGreaterThan(name === 'closeGap' ? 10 : 100);
  });
});

describe('AC-12: every operation on 500 clips in under 2 ms (median of 100)', () => {
  const big = onTrack(legacyFixtures().clips500.clips);
  it.each(Object.keys(OPS))('%s', (name) => {
    const rnd = mulberry32(42);
    const times: number[] = [];
    for (let index = 0; index < 100; index++) {
      const id = big[Math.floor(rnd() * big.length)].id;
      const t0 = performance.now();
      OPS[name](big, id, rnd, ctx);
      times.push(performance.now() - t0);
    }
    times.sort((left, right) => left - right);
    const median = times[50];
    console.log(`AC-12 ${name}: median ${median.toFixed(3)} ms`);
    expect(median).toBeLessThan(2);
  });
});

/* ---------- 205 T020: edits keep keyframes in place (AC-3) ---------- */

describe('205: keyframes follow their clip; start-edge edits keep them at their timeline place (AC-3)', () => {
  const key = (time: number, value: number): Keyframe => ({ t: time, v: value, ease: 'ease-in-out' });
  /**
   * Keys on every clip: x at 0.5 s and 1 s from its start.
   * @param cs the clips
   * @returns the clips with keys
   */
  const keyed = (cs: C[]): C[] =>
    cs.map((legacyClip) => ({ ...legacyClip, keys: { x: [key(0.5, 0.3), key(1, 0.6)] } }));
  const keyTimes = (cs: C[], id: string) =>
    defined(defined(get(cs, id).keys).x).map((keyframe) => +keyframe.t.toFixed(9));
  // a: photo 0–2; v: video 2–5 (source 1–4 of 6); c: photo 5–6.
  const cs = keyed([...photos([0, 2]), vid('v', 2, 1, 4, 6), { ...photos([5, 1])[0], id: 'c' }]);

  it('a start trim without ripple shifts the keys by minus the start’s move (photo and video)', () => {
    const clips = ok(trim(cs, 'v', 'start', 0.5, { ripple: false }, ctx));
    expect(get(clips, 'v').start).toBe(2.5);
    expect(keyTimes(clips, 'v')).toEqual([0, 0.5]);
    // a touches v: nothing to lengthen into, nothing changes.
    expect(ok(trim(cs, 'v', 'start', -0.5, { ripple: false }, ctx))).toBe(cs);
    const gap = ok(lift(cs, 'a', ctx));
    const grown = ok(trim(gap, 'v', 'start', -0.75, { ripple: false }, ctx));
    expect(get(grown, 'v').start).toBe(1.25);
    expect(keyTimes(grown, 'v')).toEqual([1.25, 1.75]);
    const photo = ok(trim(cs, 'c', 'start', 0.25, { ripple: false }, ctx));
    expect(keyTimes(photo, 'c')).toEqual([0.25, 0.75]);
    // The other clips' keys are untouched.
    expect(get(clips, 'a').keys).toBe(get(cs, 'a').keys);
  });

  it('a ripple start trim, an end trim and Slip leave the keys alone', () => {
    for (const clips of [
      ok(trim(cs, 'v', 'start', 0.5, { ripple: true }, ctx)),
      ok(trim(cs, 'v', 'end', -0.5, { ripple: true }, ctx)),
      ok(trim(cs, 'v', 'end', -0.5, { ripple: false }, ctx)),
      ok(slip(cs, 'v', 0.5, ctx)),
    ])
      for (const legacyClip of clips) expect(legacyClip.keys).toBe(get(cs, legacyClip.id).keys);
  });

  it('moves, nudges, reorders and track changes carry the keys (times from the clip’s start)', () => {
    const gap = ok(lift(cs, 'a', ctx));
    for (const clips of [
      ok(moveTo(gap, 'v', 0.5, ctx)),
      ok(nudge(gap, 'v', 'select', -3, 30, false, ctx)),
      ok(nudge(cs, 'v', 'select', 3, 30, true, ctx)),
      ok(reorder(cs, 'c', 0, ctx)),
      ok(moveToTrack(cs, 'v', O1, 0, { ...ctx, magnetic: false })),
    ])
      for (const legacyClip of clips) expect(legacyClip.keys).toBe(get(cs, legacyClip.id).keys);
  });

  it('Roll shifts the right clip’s keys, Slide the next clip’s', () => {
    const rolled = ok(roll(cs, 'a', 0.5, ctx));
    expect(get(rolled, 'a').keys).toBe(get(cs, 'a').keys);
    expect(keyTimes(rolled, 'v')).toEqual([0, 0.5]);
    const back = ok(roll(cs, 'v', -1, ctx));
    expect(keyTimes(back, 'c')).toEqual([1.5, 2]);
    // a: 0–2 photo; v: 2–4 video; b: 4–7 video; c: 7–8 photo.
    const four = keyed([
      ...photos([0, 2]),
      vid('v', 2, 1, 3, 6),
      vid('b', 4, 1, 4, 6),
      { ...photos([7, 1])[0], id: 'c' },
    ]);
    const slid = ok(slide(four, 'v', 0.5, ctx));
    expect(get(slid, 'v').keys).toBe(get(four, 'v').keys);
    expect(get(slid, 'a').keys).toBe(get(four, 'a').keys);
    expect(keyTimes(slid, 'b')).toEqual([0, 0.5]);
  });

  it('clips without keys get none', () => {
    const plain = [...photos([0, 2]), vid('v', 2, 1, 4, 6)];
    for (const clips of [ok(trim(plain, 'v', 'start', 0.5, { ripple: false }, ctx)), ok(roll(plain, 'a', 0.5, ctx))])
      for (const legacyClip of clips) expect('keys' in legacyClip).toBe(false);
  });

  it('1,000 seeded random edits: start-edge edits keep each key’s timeline time, every other edit carries it', () => {
    const rnd = mulberry32(205);
    const starts = fixtures.map(([, clips]) => keyed(clips));
    let current = starts[0],
      round = 0,
      startEdges = 0,
      carried = 0;
    const names = ['trim', 'moveTo', 'reorder', 'roll', 'slip', 'slide', 'nudge', 'lift', 'rippleDelete'];
    for (let index = 0; index < 1000; index++) {
      if (current.length < 2 || (index % 100 === 0 && index)) current = starts[++round % starts.length];
      const before = current;
      const name = names[Math.floor(rnd() * names.length)];
      const result = OPS[name](before, before[Math.floor(rnd() * before.length)].id, rnd, ctx);
      if ('error' in result) continue;
      for (const after of result.clips) {
        const was = defined(before.find((legacyClip) => legacyClip.id === after.id));
        const moved = after.start - was.start;
        // A start edge moved: the clip starts elsewhere and its length changed (photo) or its content stayed put
        // (video). Whole-clip moves keep both. (Not "its end stayed": a Roll from a video under 0.1 s, which the
        // timeline shows 0.1 s long, moves the next clip's end too.)
        const edge =
          Math.abs(moved) > 1e-9 &&
          (was.kind === 'photo' ? Math.abs(after.dur - was.dur) > 1e-9 : Math.abs(after.in - was.in - moved) < 1e-9);
        const shift = defined(defined(after.keys).x)[0].t - defined(defined(was.keys).x)[0].t;
        if (edge) {
          startEdges++;
          expect(shift, `${name} step ${index}: ${after.id}`).toBeCloseTo(-moved, 9);
        } else {
          if (Math.abs(moved) > 1e-9) carried++;
          expect(shift, `${name} step ${index}: ${after.id}`).toBe(0);
        }
      }
      current = result.clips;
    }
    expect(startEdges).toBeGreaterThan(50);
    expect(carried).toBeGreaterThan(50);
  });
});
