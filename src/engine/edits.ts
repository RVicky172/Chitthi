import type { Layer } from './layers';
import { MAIN_VIDEO, pack, type TimedClip } from './timeline';
import { clipLength } from './video';

/*
 * The video editor's edit operations (P2.2, specs/features/202-edit-operations), free of DOM and React: ripple and
 * non-ripple delete and trim, closing gaps, moving a clip to a time or a place. Each is a pure function on a project's
 * picture clips that returns the new clips or why it was refused; it never throws and never returns an invalid track
 * (`checkTrack`). The UI, the keyboard and the agent tools (212) call these same functions. A track's clips are kept
 * in start order; an edit changes only the edited clip's track. With Magnetic on the store packs the result, which
 * gives exactly 2.x's edits.
 */

/** Seconds; an edit never makes a clip shorter than this (one already shorter can't be shortened further). */
export const MIN_LEN = 0.3;
/** Seconds a photo may show. */
export const PHOTO_MAX = 60;
/** Starts summed in floating point may sit a hair off an edge. */
const EPS = 1e-9;

/** A picture clip as the edits see it: its timing on a track and its source's length (photos: 0). */
export type EditClip = TimedClip & { srcDur: number };
export type Edit<C> = { clips: C[] } | { error: string };
export interface EditCtx {
  /** The project's length limit, seconds (`limitsFor`). */
  maxLength: number;
  /** Why a track can't be changed, or null. */
  locked: (track: string) => string | null;
}

export const NOT_FOUND = 'That clip isn’t on the timeline.';
export const NO_ROOM = 'No room here: make a gap first or switch Magnetic on';
export const TOO_LONG = 'That would make the video longer than this project allows.';

const endOf = (c: TimedClip) => c.start + clipLength(c);
/** Where the last clip ends: the video's length (every clip in the list is a picture clip). */
const lengthOf = (clips: TimedClip[]) => clips.reduce((m, c) => Math.max(m, endOf(c)), 0);
/** The part used: a photo's seconds, a video's out − in (clipLength floors it at 0.1 s for display). */
const raw = (c: TimedClip) => (c.kind === 'photo' ? c.dur : c.out - c.in);

/** The clip, or the reason it can't be edited. */
function find<C extends EditClip>(clips: C[], id: string, ctx: EditCtx): { c: C; i: number } | { error: string } {
  const i = clips.findIndex((x) => x.id === id);
  if (i < 0) return { error: NOT_FOUND };
  const why = ctx.locked(clips[i].track);
  return why ? { error: why } : { c: clips[i], i };
}

/** Moves the clips of a track that start at or after `from` by `by` seconds. */
const shiftFrom = <C extends TimedClip>(clips: C[], track: string, from: number, by: number, skip?: string): C[] =>
  by === 0
    ? clips
    : clips.map((x) =>
        x.track === track && x.id !== skip && x.start >= from - EPS ? { ...x, start: Math.max(0, x.start + by) } : x,
      );

/** The clips with c put back on its track in start order (c removed from where it was first). */
function place<C extends TimedClip>(clips: C[], c: C): C[] {
  const out = clips.filter((x) => x.id !== c.id);
  let at = out.findIndex((x) => x.track === c.track && x.start > c.start);
  if (at < 0) at = out.findLastIndex((x) => x.track === c.track) + 1 || out.length;
  out.splice(at, 0, c);
  return out;
}

/**
 * Why a track list breaks the rules, or null: each track sorted by start, no overlaps, nothing before 0, videos inside
 * their source, the video within `maxLength`. With the clips `before` the edit: no clip was made shorter than 0.3 s
 * (one already shorter may stay as it was).
 */
export function checkTrack(clips: EditClip[], maxLength: number, before?: EditClip[]): string | null {
  const last = new Map<string, TimedClip>();
  for (const c of clips) {
    if (c.start < 0) return `${c.id} starts before 0`;
    if (c.kind === 'video' && (c.in < 0 || c.out > c.srcDur + EPS || !(c.in < c.out)))
      return `${c.id} plays outside its source`;
    const p = last.get(c.track);
    if (p && c.start < p.start) return `${c.id} is out of order`;
    if (p && c.start < endOf(p) - 1e-6) return `${c.id} overlaps ${p.id}`;
    last.set(c.track, c);
    const b = before?.find((x) => x.id === c.id);
    if (b && raw(c) < raw(b) - EPS && raw(c) < MIN_LEN - 1e-6) return `${c.id} was made shorter than 0.3 s`;
  }
  const len = lengthOf(clips);
  if (len > maxLength + 0.01 && (!before || len > lengthOf(before) + EPS)) return `the video is too long (${len} s)`;
  return null;
}

/** Removes a clip and pulls every later clip on its track back by its length. */
export function rippleDelete<C extends EditClip>(clips: C[], id: string, ctx: EditCtx): Edit<C> {
  const f = find(clips, id, ctx);
  if ('error' in f) return f;
  const rest = clips.filter((x) => x.id !== id);
  return { clips: shiftFrom(rest, f.c.track, endOf(f.c), -clipLength(f.c)) };
}

/** Removes a clip and leaves a gap of its length (Magnetic off). */
export function lift<C extends EditClip>(clips: C[], id: string, ctx: EditCtx): Edit<C> {
  const f = find(clips, id, ctx);
  return 'error' in f ? f : { clips: clips.filter((x) => x.id !== id) };
}

/** Closes the gap at time `at` on a track: every clip after it moves back by its length. */
export function closeGap<C extends EditClip>(clips: C[], at: number, ctx: EditCtx, track = MAIN_VIDEO): Edit<C> {
  const why = ctx.locked(track);
  if (why) return { error: why };
  let t = 0;
  for (const c of clips) {
    if (c.track !== track) continue;
    if (c.start > t + EPS && at >= t && at < c.start) return { clips: shiftFrom(clips, track, c.start, t - c.start) };
    t = Math.max(t, endOf(c));
  }
  return { error: 'There’s no gap here.' };
}

/** Every gap on the main track closed, clips in their order (switching Magnetic on). */
export const closeGaps = <C extends EditClip>(clips: C[]): C[] => pack(clips);

/**
 * Moves one edge of a clip by `delta` seconds on the timeline (+ is later). With `ripple` the later clips on the track
 * follow the change (a start trim then keeps the clip's start and changes what plays, as 2.x did); without, nothing
 * else moves: the clip's other edge stays, and lengthening stops at its neighbour. Limits: 0.3 s, the source (video),
 * 60 s (photo); a lengthening past the project's length limit is refused. Returns the same array when nothing changes.
 */
export function trim<C extends EditClip>(
  clips: C[],
  id: string,
  side: 'start' | 'end',
  delta: number,
  o: { ripple: boolean },
  ctx: EditCtx,
): Edit<C> {
  const f = find(clips, id, ctx);
  if ('error' in f) return f;
  const { c } = f;
  const r0 = raw(c);
  const floor = Math.min(MIN_LEN, r0);
  // How long the clip may get: to the source's end (end edge) or start (start edge) for a video, 60 s for a photo.
  let ceil = c.kind === 'photo' ? Math.max(r0, PHOTO_MAX) : side === 'end' ? c.srcDur - c.in : c.out;
  if (!o.ripple) {
    const same = clips.filter((x) => x.track === c.track && x.id !== c.id);
    if (side === 'end') {
      const next = same.find((x) => x.start >= c.start + EPS);
      if (next) ceil = Math.min(ceil, r0 + Math.max(0, next.start - endOf(c)));
    } else {
      const prevEnd = same.filter((x) => x.start < c.start - EPS).reduce((m, x) => Math.max(m, endOf(x)), 0);
      ceil = Math.min(ceil, r0 + Math.max(0, c.start - prevEnd));
    }
  }
  const want = side === 'end' ? r0 + delta : r0 - delta;
  const r1 = Math.max(floor, Math.min(Math.max(ceil, r0), want));
  if (r1 === r0) return { clips };
  const by = r1 - r0;
  const next: C =
    c.kind === 'photo'
      ? { ...c, dur: r1 }
      : side === 'end'
        ? { ...c, out: Math.min(c.srcDur, c.in + r1) }
        : { ...c, in: Math.max(0, c.out - r1) };
  const grow = clipLength(next) - clipLength(c);
  let out: C[];
  if (o.ripple)
    out = shiftFrom(
      clips.map((x) => (x.id === id ? next : x)),
      c.track,
      endOf(c),
      grow,
      id,
    );
  else {
    const moved = side === 'start' ? { ...next, start: endOf(c) - clipLength(next) } : next;
    out = clips.map((x) => (x.id === id ? moved : x));
  }
  if (by > 0 && lengthOf(out) > ctx.maxLength + 0.01) return { error: TOO_LONG };
  return { clips: out };
}

/**
 * Puts a clip at a time on its track (Magnetic off): there if it fits, else at the nearest free spot where it fits
 * (before or after) within the project's length limit; refused when there is none (Q2: no overwrite).
 */
export function moveTo<C extends EditClip>(clips: C[], id: string, start: number, ctx: EditCtx): Edit<C> {
  const f = find(clips, id, ctx);
  if ('error' in f) return f;
  const { c } = f;
  const len = clipLength(c);
  const want = Math.max(0, start);
  // The free stretches of the track without this clip; the last one is open-ended.
  const free: [number, number][] = [];
  let t = 0;
  for (const x of clips) {
    if (x.track !== c.track || x.id === id) continue;
    if (x.start > t + EPS) free.push([t, x.start]);
    t = Math.max(t, endOf(x));
  }
  free.push([t, Infinity]);
  const others = lengthOf(clips.filter((x) => x.id !== id));
  let best: number | null = null;
  for (const [a, b] of free) {
    if (b - a < len - 1e-6) continue;
    const s = Math.min(Math.max(want, a), Math.max(a, b - len));
    if (Math.max(others, s + len) > ctx.maxLength + 0.01) continue;
    if (best === null || Math.abs(s - want) < Math.abs(best - want)) best = s;
  }
  if (best === null) return { error: NO_ROOM };
  if (best === c.start) return { clips };
  return { clips: place(clips, { ...c, start: best }) };
}

/* ---------- roll, slip, slide ---------- */

/** How far a clip's end edge can move (+ lengthens): 0.3 s to the source's end (video) or 60 s (photo). */
function endRange(c: EditClip): [number, number] {
  const r = raw(c);
  return [Math.min(MIN_LEN, r) - r, Math.max(r, c.kind === 'photo' ? PHOTO_MAX : c.srcDur - c.in) - r];
}
/** How far a clip's start edge can move (+ shortens): to the source's start (video) or 60 s (photo), 0.3 s. */
function startRange(c: EditClip): [number, number] {
  const r = raw(c);
  return [r - Math.max(r, c.kind === 'photo' ? PHOTO_MAX : c.out), r - Math.min(MIN_LEN, r)];
}
// A video's edge is kept inside its source: the ranges' sums can miss its ends by a rounding error.
const moveEnd = <C extends EditClip>(c: C, d: number): C =>
  c.kind === 'photo' ? { ...c, dur: c.dur + d } : { ...c, out: Math.min(c.srcDur, c.out + d) };
const moveStart = <C extends EditClip>(c: C, d: number): C =>
  c.kind === 'photo'
    ? { ...c, start: Math.max(0, c.start + d), dur: c.dur - d }
    : { ...c, start: Math.max(0, c.start + d), in: Math.max(0, c.in + d) };
const clamp = (d: number, [lo, hi]: [number, number]) => Math.max(Math.min(lo, 0), Math.min(Math.max(hi, 0), d));

/** The clips of c's track just before and after it, and whether each touches it (no gap between). */
function neighbours<C extends EditClip>(clips: C[], c: C) {
  const same = clips.filter((x) => x.track === c.track && x.id !== c.id);
  const prev = same.filter((x) => x.start < c.start).at(-1);
  const next = same.find((x) => x.start >= c.start);
  return {
    prev,
    next,
    prevTouches: !!prev && Math.abs(endOf(prev) - c.start) < 1e-6,
    nextTouches: !!next && Math.abs(next.start - endOf(c)) < 1e-6,
  };
}

/**
 * Moves the cut between a clip and the one right after it by `delta` (+ later): one lengthens as the other shortens,
 * nothing else moves and the length stays. Stops at 0.3 s and the sources' ends; a cut with a gap is refused.
 */
export function roll<C extends EditClip>(clips: C[], leftId: string, delta: number, ctx: EditCtx): Edit<C> {
  const f = find(clips, leftId, ctx);
  if ('error' in f) return f;
  const { next, nextTouches } = neighbours(clips, f.c);
  if (!next) return { error: 'There’s no clip after this one to roll into.' };
  if (!nextTouches) return { error: 'There’s a gap at this cut: Roll moves a cut between two clips side by side.' };
  const [a, b] = endRange(f.c),
    [c, d] = startRange(next);
  const by = clamp(delta, [Math.max(a, c), Math.min(b, d)]);
  if (by === 0) return { clips };
  const left = moveEnd(f.c, by);
  const right = { ...moveStart(next, by), start: endOf(left) };
  return { clips: clips.map((x) => (x.id === left.id ? left : x.id === right.id ? right : x)) };
}

/** Changes which part of a video clip plays (in and out together, within its source); its start and length stay. */
export function slip<C extends EditClip>(clips: C[], id: string, delta: number, ctx: EditCtx): Edit<C> {
  const f = find(clips, id, ctx);
  if ('error' in f) return f;
  const { c } = f;
  if (c.kind === 'photo') return { error: 'A photo has no source time to slip: use Slip on a video clip.' };
  const by = clamp(delta, [-c.in, c.srcDur - c.out]);
  return by === 0
    ? { clips }
    : { clips: clips.map((x) => (x.id === id ? { ...c, in: c.in + by, out: c.out + by } : x)) };
}

/**
 * Moves a clip between its neighbours by `delta`, keeping what it plays and its length: a touching previous clip's end
 * and next clip's start move with it (within 0.3 s and their sources), or it moves into a gap next to it. Bounded by 0;
 * the last clip has nothing to slide against. With `magnetic` it opens no gap (it may close one).
 */
export function slide<C extends EditClip>(
  clips: C[],
  id: string,
  delta: number,
  ctx: EditCtx,
  magnetic = false,
): Edit<C> {
  const f = find(clips, id, ctx);
  if ('error' in f) return f;
  const { c } = f;
  const { prev, next, prevTouches, nextTouches } = neighbours(clips, c);
  if (!next) return { error: 'There’s no clip after this one: Slide moves a clip between two others.' };
  // The previous side: a touching clip's end edge moves, else the clip moves into (or away from) the gap before it.
  let [lo, hi] = prevTouches ? endRange(prev!) : [-(c.start - (prev ? endOf(prev) : 0)), magnetic ? 0 : Infinity];
  if (nextTouches) {
    const [a, b] = startRange(next);
    [lo, hi] = [Math.max(lo, a), Math.min(hi, b)];
  } else {
    hi = Math.min(hi, next.start - endOf(c));
    if (magnetic) lo = Math.max(lo, 0);
  }
  const by = clamp(delta, [lo, hi]);
  if (by === 0) return { clips };
  return {
    clips: clips.map((x) =>
      x.id === id
        ? { ...c, start: c.start + by }
        : prevTouches && x.id === prev!.id
          ? moveEnd(x, by)
          : nextTouches && x.id === next.id
            ? moveStart(x, by)
            : x,
    ),
  };
}

export type Tool = 'select' | 'roll' | 'slip' | 'slide';

/**
 * The keyboard's Alt + ← / → (Q5): moves by `frames` frames at `fps` with a tool. Select moves the clip to a time
 * (Magnetic off) or one place in the order per press (Magnetic on); Roll moves the clip's end cut; Slip and Slide.
 */
export function nudge<C extends EditClip>(
  clips: C[],
  id: string,
  tool: Tool,
  frames: number,
  fps: number,
  magnetic: boolean,
  ctx: EditCtx,
): Edit<C> {
  const d = frames / fps;
  const f = find(clips, id, ctx);
  if ('error' in f) return f;
  switch (tool) {
    case 'roll':
      return roll(clips, id, d, ctx);
    case 'slip':
      return slip(clips, id, d, ctx);
    case 'slide':
      return slide(clips, id, d, ctx, magnetic);
    default: {
      if (!magnetic) return moveTo(clips, id, f.c.start + d, ctx);
      const i = clips.filter((x) => x.track === f.c.track).findIndex((x) => x.id === id);
      return reorder(clips, id, i + Math.sign(frames), ctx);
    }
  }
}

/** Moves a clip to another place in its track's order and packs the main track (Magnetic on: 2.x's drag). */
export function reorder<C extends EditClip>(clips: C[], id: string, index: number, ctx: EditCtx): Edit<C> {
  const f = find(clips, id, ctx);
  if ('error' in f) return f;
  const same = clips.filter((x) => x.track === f.c.track);
  const i = same.findIndex((x) => x.id === id);
  const j = Math.max(0, Math.min(same.length - 1, index));
  if (i === j) return { clips };
  const order = same.slice();
  order.splice(j, 0, ...order.splice(i, 1));
  let k = 0;
  return { clips: pack(clips.map((x) => (x.track === f.c.track ? order[k++] : x))) };
}

/* ---------- snapping ---------- */

/**
 * The times a drag snaps to: 0, the end, the playhead, every clip's edges (so a gap's too) and every layer's showing
 * edges (an untimed layer shows from 0 to the end), without the edges of the clip or layer being dragged.
 */
export function snapTargets(
  clips: TimedClip[],
  layers: Layer[],
  playhead: number,
  total: number,
  skip: { clip?: string; layer?: string } = {},
): number[] {
  const out = [0, total, playhead];
  for (const c of clips) if (c.id !== skip.clip) out.push(c.start, endOf(c));
  for (const l of layers) if (l.id !== skip.layer) out.push(l.start ?? 0, Math.min(l.end ?? total, total));
  return out;
}

/** The nearest target within `tolerance` seconds of t (the timeline uses 8 px at its zoom), else t itself. */
export function snapTime(t: number, targets: number[], tolerance: number): number {
  let best = t,
    dist = tolerance;
  for (const p of targets)
    if (Math.abs(p - t) < dist) {
      dist = Math.abs(p - t);
      best = p;
    }
  return best;
}
