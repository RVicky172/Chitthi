import { describe, expect, it } from 'vitest';
import {
  MIN_LEN,
  PHOTO_MAX,
  checkTrack,
  closeGap,
  closeGaps,
  lift,
  moveTo,
  nudge,
  reorder,
  rippleDelete,
  roll,
  slide,
  slip,
  snapTargets,
  snapTime,
  trim,
  type EditClip,
  type EditCtx,
  type Tool,
} from './edits';
import type { Layer } from './layers';
import { MAIN_VIDEO, defaultTracks, mergeProject, pack, toDocument, type ProjectDoc } from './timeline';
import { legacyFixtures, type LegacyClip } from './timeline.testkit';
import { clipLength } from './video';

type C = LegacyClip & EditClip;

const ctx: EditCtx = { maxLength: 3 * 3600, locked: () => null };
const lockedCtx: EditCtx = {
  ...ctx,
  locked: (t) => (t === MAIN_VIDEO ? 'The Video track is locked. Unlock it to change its clips.' : null),
};

/** A 2.x fixture on the main track, packed; videos get a source 1.5 s longer than the part used. */
const onTrack = (clips: LegacyClip[]): C[] =>
  pack(clips.map((c) => ({ ...c, track: MAIN_VIDEO, start: 0, srcDur: c.kind === 'video' ? c.out + 1.5 : 0 })));

/** Hand-made clips: [start, length] photos on the main track (ids a, b, c, …). */
const photos = (...spans: [number, number][]): C[] =>
  spans.map(([start, dur], i) => ({
    ...legacyFixtures().photoOnly.clips[0],
    id: String.fromCharCode(97 + i),
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

const ok = <T>(r: { clips: T[] } | { error: string }): T[] => {
  if ('error' in r) throw new Error(`refused: ${r.error}`);
  return r.clips;
};
const err = (r: { clips: unknown[] } | { error: string }): string => ('error' in r ? r.error : '');
const spans = (cs: C[]) => cs.map((c) => [c.id, +c.start.toFixed(6), +clipLength(c).toFixed(6)]);

/* Today's store (201), as reference: every change edits the list in order, then packs. */
const ref = {
  remove: (cs: C[], id: string) => pack(cs.filter((c) => c.id !== id)),
  patch: (cs: C[], id: string, p: Partial<C>) => pack(cs.map((c) => (c.id === id ? { ...c, ...p } : c))),
  /** The timeline's edge drag (Timeline.tsx at a3adea2), without snapping. */
  trim(cs: C[], id: string, side: 'start' | 'end', dt: number) {
    const c0 = cs.find((c) => c.id === id)!;
    if (c0.kind === 'video')
      return side === 'end'
        ? this.patch(cs, id, { out: Math.max(c0.in + MIN_LEN, Math.min(c0.srcDur, c0.out + dt)) })
        : this.patch(cs, id, { in: Math.max(0, Math.min(c0.out - MIN_LEN, c0.in + dt)) });
    const dur = side === 'end' ? c0.dur + dt : c0.dur - dt;
    return this.patch(cs, id, { dur: Math.max(MIN_LEN, Math.min(60, dur)) });
  },
  moveTo(cs: C[], id: string, index: number) {
    const i = cs.findIndex((c) => c.id === id);
    const j = Math.max(0, Math.min(cs.length - 1, index));
    const out = cs.slice();
    const [c] = out.splice(i, 1);
    out.splice(j, 0, c);
    return pack(out);
  },
};

const fixtures = Object.entries(legacyFixtures())
  .filter(([, p]) => p.clips.length)
  .map(([name, p]) => [name, onTrack(p.clips.slice(0, 60))] as const);

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
    const g = photos([0, 2], [3, 1], [6, 1]);
    expect(spans(ok(rippleDelete(g, 'b', ctx)))).toEqual([
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
    const g = photos([1, 2], [4, 1], [7, 1]);
    expect(spans(ok(closeGap(g, 3.5, ctx)))).toEqual([
      ['a', 1, 2],
      ['b', 3, 1],
      ['c', 6, 1],
    ]);
    expect(spans(ok(closeGap(g, 0.5, ctx)))).toEqual([
      ['a', 0, 2],
      ['b', 3, 1],
      ['c', 6, 1],
    ]);
    expect(err(closeGap(g, 1.5, ctx))).toMatch(/no gap/i);
    expect(spans(closeGaps(g))).toEqual([
      ['a', 0, 2],
      ['b', 2, 1],
      ['c', 3, 1],
    ]);
  });
  it('unknown clips and locked tracks are refused with the reason', () => {
    expect(err(rippleDelete(cs, 'zz', ctx))).toMatch(/isn’t on the timeline/);
    for (const r of [
      rippleDelete(cs, 'b', lockedCtx),
      lift(cs, 'b', lockedCtx),
      closeGap(photos([1, 1]), 0.5, lockedCtx),
    ])
      expect(err(r)).toMatch(/locked/);
  });
});

describe('trim', () => {
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6), ...photos([5, 1]).map((c) => ({ ...c, id: 'c' }))];
  const at = (r: C[], id: string) => spans(r).find((s) => s[0] === id);

  it('end, ripple: later clips move by the change', () => {
    const r = ok(trim(cs, 'v', 'end', 1, { ripple: true }, ctx));
    expect(at(r, 'v')).toEqual(['v', 2, 4]);
    expect(at(r, 'c')).toEqual(['c', 6, 1]);
  });
  it('end, no ripple: shortening leaves a gap, lengthening stops at the next clip', () => {
    expect(at(ok(trim(cs, 'v', 'end', -1, { ripple: false }, ctx)), 'c')).toEqual(['c', 5, 1]);
    const g = [...photos([0, 2]), vid('v', 2, 1, 4, 6), { ...photos([6, 1])[0], id: 'c' }];
    const r = ok(trim(g, 'v', 'end', 5, { ripple: false }, ctx));
    expect(at(r, 'v')).toEqual(['v', 2, 4]);
    expect(at(r, 'c')).toEqual(['c', 6, 1]);
    expect(ok(trim(cs, 'v', 'end', 1, { ripple: false }, ctx))).toBe(cs);
  });
  it('start, ripple: the start stays, the source moves, later clips follow (2.x’s start trim)', () => {
    const r = ok(trim(cs, 'v', 'start', 0.5, { ripple: true }, ctx));
    expect(r.find((c) => c.id === 'v')!.in).toBe(1.5);
    expect(at(r, 'v')).toEqual(['v', 2, 2.5]);
    expect(at(r, 'c')).toEqual(['c', 4.5, 1]);
  });
  it('start, no ripple: the end stays, the start moves; lengthening stops at the previous clip', () => {
    const r = ok(trim(cs, 'v', 'start', 0.5, { ripple: false }, ctx));
    expect(at(r, 'v')).toEqual(['v', 2.5, 2.5]);
    expect(at(r, 'c')).toEqual(['c', 5, 1]);
    const g = [...photos([0, 2]), vid('v', 3, 1, 4, 6)];
    const back = ok(trim(g, 'v', 'start', -5, { ripple: false }, ctx));
    expect(at(back, 'v')).toEqual(['v', 2, 4]);
    expect(back.find((c) => c.id === 'v')!.in).toBe(0);
  });
  it('limits: 0.3 s, the source, 60 s for a photo, a clip already shorter than 0.3 s', () => {
    expect(at(ok(trim(cs, 'v', 'end', -9, { ripple: true }, ctx)), 'v')).toEqual(['v', 2, MIN_LEN]);
    expect(at(ok(trim(cs, 'v', 'start', 9, { ripple: true }, ctx)), 'v')).toEqual(['v', 2, MIN_LEN]);
    expect(ok(trim(cs, 'v', 'end', 9, { ripple: true }, ctx)).find((c) => c.id === 'v')!.out).toBe(6);
    expect(ok(trim(cs, 'v', 'start', -9, { ripple: true }, ctx)).find((c) => c.id === 'v')!.in).toBe(0);
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
    expect(spans(ok(moveTo(cs, 'c', 1.5, ctx))).find((s) => s[0] === 'c')).toEqual(['c', 6, 3]);
    // [3, 5] overlaps b; the gap 0–4 (a moved out) fits at 2.
    expect(spans(ok(moveTo(cs, 'a', 3, ctx))).find((s) => s[0] === 'a')).toEqual(['a', 2, 2]);
    // [8, 10] overlaps c; after c (9) is nearer than the gap before b (2).
    expect(spans(ok(moveTo(cs, 'a', 8, ctx)))).toEqual([
      ['b', 4, 2],
      ['c', 6, 3],
      ['a', 9, 2],
    ]);
    // Before 0 is 0.
    expect(spans(ok(moveTo(cs, 'b', -3, ctx))).find((s) => s[0] === 'b')).toEqual(['b', 2, 2]);
  });
  it('keeps the project within its length, else refuses with the reason (Q2)', () => {
    expect(spans(ok(moveTo(cs, 'a', 8, { ...ctx, maxLength: 9 }))).find((s) => s[0] === 'a')).toEqual(['a', 2, 2]);
    const full = photos([0, 3], [3, 3], [8, 4]);
    expect(err(moveTo(full, 'c', 1, { ...ctx, maxLength: 9 }))).toBe(
      'No room here: make a gap first or switch Magnetic on',
    );
  });
  it('reorder is today’s drag to a place, packed', () => {
    for (const [, f] of fixtures)
      if (f.length > 2) {
        expect(spans(ok(reorder(f, f[0].id, 2, ctx)))).toEqual(spans(ref.moveTo(f, f[0].id, 2)));
        expect(spans(ok(reorder(f, f[f.length - 1].id, 0, ctx)))).toEqual(spans(ref.moveTo(f, f[f.length - 1].id, 0)));
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
    for (const c of cs) {
      expect(spans(pack(ok(rippleDelete(cs, c.id, ctx))))).toEqual(spans(ref.remove(cs, c.id)));
      expect(spans(pack(ok(lift(cs, c.id, ctx))))).toEqual(spans(ref.remove(cs, c.id)));
      // Clips already under 0.3 s: 2.x's edge drag snapped them up to 0.3 s even when shortening; 202 leaves them.
      if (clipLength(c) < MIN_LEN) continue;
      for (const side of ['start', 'end'] as const)
        for (const d of deltas) {
          const got = trim(cs, c.id, side, d, { ripple: true }, ctx);
          expect(spans(pack(ok(got))), `${c.id} ${side} ${d}`).toEqual(spans(ref.trim(cs, c.id, side, d)));
        }
    }
  });
});

const length = (cs: C[]) => Math.max(...cs.map((c) => c.start + clipLength(c)));
const get = (cs: C[], id: string) => cs.find((c) => c.id === id)!;

describe('roll: move the cut between two adjacent clips', () => {
  // a: photo 0–2; v: video 2–5 (source 1–4 of 6); c: photo 5–6.
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6), { ...photos([5, 1])[0], id: 'c' }];
  it('lengthens one clip and shortens the other by the same amount; nothing else moves, the length stays', () => {
    const r = ok(roll(cs, 'a', 0.5, ctx));
    expect(spans(r)).toEqual([
      ['a', 0, 2.5],
      ['v', 2.5, 2.5],
      ['c', 5, 1],
    ]);
    expect(get(r, 'v').in).toBe(1.5);
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
    const g = photos([0, 2], [3, 2]);
    expect(err(roll(g, 'a', 0.5, ctx))).toMatch(/gap/);
    expect(err(roll(cs, 'c', 0.5, ctx))).toMatch(/no clip after/);
    expect(err(roll(cs, 'a', 0.5, lockedCtx))).toMatch(/locked/);
  });
});

describe('slip: change which part of a video plays', () => {
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6)];
  it('moves in and out together; the start and length stay', () => {
    const r = ok(slip(cs, 'v', 0.5, ctx));
    expect([get(r, 'v').in, get(r, 'v').out, get(r, 'v').start]).toEqual([1.5, 4.5, 2]);
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
    const r = ok(slide(cs, 'v', 0.5, ctx));
    expect(spans(r)).toEqual([
      ['a', 0, 2.5],
      ['v', 2.5, 2],
      ['b', 4.5, 2.5],
      ['c', 7, 1],
    ]);
    expect([get(r, 'v').in, get(r, 'v').out, get(r, 'b').in]).toEqual([1, 3, 1.5]);
    expect(length(r)).toBe(length(cs));
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
    const g = photos([0, 2], [3, 2], [5, 1]);
    expect(spans(ok(slide(g, 'b', -5, ctx)))).toEqual([
      ['a', 0, 2],
      ['b', 2, 2],
      ['c', 4, 2],
    ]);
    const h = photos([0, 2], [2, 2], [5, 1]);
    expect(spans(ok(slide(h, 'b', 5, ctx)))).toEqual([
      ['a', 0, 3],
      ['b', 3, 2],
      ['c', 5, 1],
    ]);
  });
  it('bounded by 0; the last clip has nothing to slide against; Magnetic on opens no gap', () => {
    expect(ok(slide(cs, 'a', -1, ctx))).toBe(cs);
    expect(get(ok(slide(cs, 'a', 0.5, ctx)), 'a').start).toBe(0.5);
    expect(ok(slide(cs, 'a', 0.5, ctx, true))).toBe(cs);
    const h = photos([0, 2], [2, 2], [5, 1]);
    // Into the gap after b, yes; away from it (growing it), no.
    expect(get(ok(slide(h, 'b', 1, ctx, true)), 'b').start).toBe(3);
    expect(ok(slide(h, 'b', -1, ctx, true))).toBe(h);
    expect(err(slide(cs, 'c', -0.5, ctx))).toMatch(/no clip after/);
  });
  it('locked refused', () => expect(err(slide(cs, 'v', 0.5, lockedCtx))).toMatch(/locked/));
});

describe('nudge: the keyboard’s Alt + arrows with each tool', () => {
  const cs = [...photos([0, 2]), vid('v', 2, 1, 4, 6), { ...photos([5, 1])[0], id: 'c' }];
  it('Select with Magnetic on reorders one place per press', () => {
    expect(ok(nudge(cs, 'a', 'select', 1, 30, true, ctx)).map((c) => c.id)).toEqual(['v', 'a', 'c']);
    expect(ok(nudge(cs, 'a', 'select', -30, 30, true, ctx))).toBe(cs);
  });
  it('Select with Magnetic off moves the clip by a frame or a second (to a free spot)', () => {
    const g = photos([0, 2], [3, 1]);
    expect(get(ok(nudge(g, 'b', 'select', 1, 30, false, ctx)), 'b').start).toBeCloseTo(3 + 1 / 30, 12);
    expect(get(ok(nudge(g, 'b', 'select', -1, 60, false, ctx)), 'b').start).toBeCloseTo(3 - 1 / 60, 12);
    expect(get(ok(nudge(g, 'b', 'select', -30, 30, false, ctx)), 'b').start).toBeCloseTo(2, 12);
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
    expect(snapTargets(cs, layers, 0.7, 4.5).sort((a, b) => a - b)).toEqual([
      0, 0, 0, 0.7, 1.2, 2, 2.6, 3, 4.5, 4.5, 4.5,
    ]);
  });
  it('skips the dragged clip’s or layer’s own edges', () => {
    const t = snapTargets(cs, layers, 0.7, 4.5, { clip: 'b', layer: 'l1' });
    expect(t).not.toContain(3);
    expect(t).not.toContain(1.2);
    expect(t).not.toContain(2.6);
  });
  it('snaps to the nearest target within the tolerance (8 px at the zoom), else leaves the time', () => {
    const t = [0, 2, 3, 4.5];
    const tol = 8 / 60; // 60 px per second
    expect(snapTime(2.1, t, tol)).toBe(2);
    expect(snapTime(2.9, t, tol)).toBe(3);
    expect(snapTime(2.5, t, tol)).toBe(2.5);
    expect(snapTime(2.1, t, 8 / 400)).toBe(2.1);
    expect(snapTime(2.1, [], tol)).toBe(2.1);
    // Nearest wins when two are in range.
    expect(snapTime(2.06, [2, 2.1], tol)).toBe(2.1);
  });
});

/* ---------- AC-11 and AC-12 ---------- */

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The clips as a saved project (a medium entry per clip). */
const asDoc = (cs: C[]): ProjectDoc => ({
  version: 1,
  kind: 'vlog',
  format: 'yt1080',
  fps: 30,
  quality: 'standard',
  fadeOut: true,
  tracks: defaultTracks(),
  clips: cs.map((c) => ({ ...c, media: `m${c.id}` })),
  audio: [],
  layers: [],
  media: cs.map((c) => ({
    id: `m${c.id}`,
    kind: c.kind,
    name: c.id,
    type: c.kind === 'video' ? 'video/mp4' : 'image/jpeg',
    size: 1,
    w: 10,
    h: 10,
    srcDur: c.srcDur,
  })),
});

type Op = (cs: C[], id: string, rnd: () => number, ctx: EditCtx) => { clips: C[] } | { error: string };
const amount = (rnd: () => number) => (rnd() - 0.5) * (rnd() < 0.2 ? 40 : 4);
const TOOLS: Tool[] = ['select', 'roll', 'slip', 'slide'];
const OPS: Record<string, Op> = {
  rippleDelete: (cs, id, _, x) => rippleDelete(cs, id, x),
  lift: (cs, id, _, x) => lift(cs, id, x),
  closeGap: (cs, _, rnd, x) => closeGap(cs, rnd() * length(cs), x),
  trim: (cs, id, rnd, x) => trim(cs, id, rnd() < 0.5 ? 'start' : 'end', amount(rnd), { ripple: rnd() < 0.5 }, x),
  moveTo: (cs, id, rnd, x) => moveTo(cs, id, rnd() * (length(cs) + 3) - 1, x),
  reorder: (cs, id, rnd, x) => reorder(cs, id, Math.floor(rnd() * cs.length), x),
  roll: (cs, id, rnd, x) => roll(cs, id, amount(rnd), x),
  slip: (cs, id, rnd, x) => slip(cs, id, amount(rnd), x),
  slide: (cs, id, rnd, x) => slide(cs, id, amount(rnd), x, rnd() < 0.5),
  nudge: (cs, id, rnd, x) =>
    nudge(cs, id, TOOLS[Math.floor(rnd() * 4)], Math.round((rnd() - 0.5) * 120), rnd() < 0.5 ? 30 : 60, rnd() < 0.5, x),
};

describe('AC-11: 1,000 seeded random edits per operation keep every rule', () => {
  const starts = fixtures.map(([, cs]) => cs);
  it.each(Object.keys(OPS))('%s', (name) => {
    const rnd = mulberry32(name.length * 7919);
    let cs = starts[0],
      k = 0,
      applied = 0;
    for (let i = 0; i < 1000; i++) {
      // Every fixture in turn, and a fresh one when edits left too few clips.
      if (cs.length < 2 || (i % 100 === 0 && i)) cs = starts[++k % starts.length];
      const before = cs;
      // A length limit near the current length, so lengthening is sometimes refused.
      const x = { ...ctx, maxLength: length(cs) + rnd() * 3 };
      // A quarter of the steps is a lift or a move first, so there are gaps to edit around.
      const op = rnd() < 0.25 ? (rnd() < 0.5 ? OPS.lift : OPS.moveTo) : OPS[name];
      const r = op(cs, cs[Math.floor(rnd() * cs.length)].id, rnd, x);
      if ('error' in r) continue;
      expect(checkTrack(r.clips, x.maxLength, before), `${name} step ${i}`).toBeNull();
      if (r.clips !== before) applied++;
      cs = r.clips;
      // Packed (Magnetic on) and as it is (Magnetic off, gaps kept), the project goes through the gate unchanged.
      if (i % 10 === 0)
        for (const doc of [toDocument(asDoc(pack(cs))), toDocument({ ...asDoc(cs), magnetic: false })]) {
          const back = mergeProject(JSON.parse(JSON.stringify(doc)), true);
          expect(back.dropped, `${name} step ${i}`).toEqual([]);
          expect(back.doc, `${name} step ${i}`).toEqual(doc);
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
    for (let i = 0; i < 100; i++) {
      const id = big[Math.floor(rnd() * big.length)].id;
      const t0 = performance.now();
      OPS[name](big, id, rnd, ctx);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[50];
    console.log(`AC-12 ${name}: median ${median.toFixed(3)} ms`);
    expect(median).toBeLessThan(2);
  });
});
