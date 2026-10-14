import { shiftKeys } from './keyframes';
import { mostVideosAt } from './stack';
import { MAIN_VIDEO, type Track } from './tracks';
import { clipLength, pack, type TimedClip } from './timeline';
import { limitsFor } from './videoFormats';

/*
 * The video editor's edit operations (P2.2, specs/features/202-edit-operations), free of DOM and React: ripple and
 * non-ripple delete and trim, closing gaps, moving a clip to a time or a place. Each is a pure function on a project's
 * picture clips that returns the new clips or why it was refused; it never throws and never returns an invalid track
 * (`checkTrack`). The UI, the keyboard and the agent tools (212) call these same functions. A track's clips are kept
 * in start order; an edit changes only the edited clip's track (moveToTrack: the two tracks). With Magnetic on the
 * store packs the result, which gives exactly 2.x's edits; only the main track is ever packed, overlay tracks (203)
 * never are (Q8). An edit that would show more videos at once than `maxVideos` is refused (203 AC-9).
 */

/** Seconds; an edit never makes a clip shorter than this (one already shorter can't be shortened further). */
export const MIN_LEN = 0.3;
/** Seconds a photo may show. */
export const PHOTO_MAX = 60;
/** Starts summed in floating point may sit a hair off an edge. */
const EPS = 1e-9;

/** A picture clip as the edits see it: its timing on a track and its source's length (photos: 0). */
export type EditClip = TimedClip & { srcDur: number };

/** An edit that went through: the new clips. */
export interface EditDone<C> {
  clips: C[];
}

/** An edit that was refused, with what to tell the user. */
export interface Refusal {
  error: string;
}

/** An edit's result: the new clips, or why it was refused. */
export type Edit<C> = EditDone<C> | Refusal;

/** What every edit checks against. */
export interface EditCtx {
  /** The project's length limit, seconds (`limitsFor`). */
  maxLength: number;
  /** Why a track can't be changed, or null. */
  locked: (track: string) => string | null;
  /** The most video clips on screen at once (`limitsFor().videosAtOnce`; 203 Q6). */
  maxVideos: number;
  /** The desktop app: its limits, and no "the desktop app allows more" in messages. */
  desktop: boolean;
}

/** `moveToTrack`'s context: also whether Magnetic is on. */
export interface MoveCtx extends EditCtx {
  magnetic: boolean;
}

export const NOT_FOUND = 'That clip isn’t on the timeline.';
export const NO_ROOM = 'No room here: make a gap first or switch Magnetic on';
export const TOO_LONG = 'That would make the video longer than this project allows.';
const NOT_MAGNETIC = 'Only the main video track keeps its clips in order: move this clip to a time instead.';

/** The desktop app's videos-at-once limit (with WebCodecs), which the browser's message mentions. */
const DESKTOP_VIDEOS = limitsFor('reel', true, true).videosAtOnce;

/**
 * Why an edit was refused for showing too many videos at once (203 AC-9): each video showing is decoded and held in
 * memory. In the browser (a lower limit) it says what the desktop app allows; a browser without WebCodecs' video
 * decoding (`limitsFor` gives 1) plays one video at a time, as before 204.
 * @param limit the most videos allowed at once
 * @param desktop whether this is the desktop app
 * @returns the message
 */
export const tooManyVideos = (limit: number, desktop: boolean): string => {
  if (limit === 1 && !desktop)
    return `This browser can show one video at a time: it can’t decode video frames itself. Chrome, Edge and the desktop app show up to ${DESKTOP_VIDEOS}.`;
  const most = `At most ${limit} ${limit === 1 ? 'video' : 'videos'} can show at the same time`;
  const why = 'each one showing is decoded and kept in memory';
  return desktop ? `${most} (${why}).` : `${most} in the browser (${why}); the desktop app allows ${DESKTOP_VIDEOS}.`;
};

const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/**
 * Where the last clip ends: the video's length (every clip in the list is a picture clip).
 * @param clips the picture clips
 * @returns seconds
 */
const lengthOf = (clips: readonly TimedClip[]) => clips.reduce((latest, clip) => Math.max(latest, endOf(clip)), 0);

/**
 * The part of a clip used: a photo's seconds, a video's out − in (clipLength floors it at 0.1 s for display).
 * @param clip the clip
 * @returns seconds
 */
const usedLength = (clip: TimedClip) => (clip.kind === 'photo' ? clip.dur : clip.out - clip.in);

/**
 * The most videos on screen at once; every clip the edits see is on a picture track.
 * @param clips the picture clips
 * @returns the count
 */
function videosAtOnce(clips: readonly TimedClip[]): number {
  const tracks = [...new Set(clips.map((clip) => clip.track))].map((id): Track => ({
    id,
    kind: 'overlay',
    name: id,
    hidden: false,
    muted: false,
    locked: false,
  }));
  return mostVideosAt(clips, tracks);
}

/**
 * An edit's result, or a refusal when it shows more videos at once than `ctx.maxVideos` and more than `before` did (so
 * an older project over a lower limit can still be edited down). Every edit here ends with it; the store must call it
 * on the results it makes itself (split, duplicate, switching Magnetic on).
 * @param before the clips before the edit
 * @param result the edit's result
 * @param ctx the edit's limits
 * @returns `result`, or the refusal
 */
export function limitVideos<C extends EditClip>(before: C[], result: Edit<C>, ctx: EditCtx): Edit<C> {
  if ('error' in result || result.clips === before) return result;
  const showing = videosAtOnce(result.clips);
  if (showing <= ctx.maxVideos || showing <= videosAtOnce(before)) return result;
  return { error: tooManyVideos(ctx.maxVideos, ctx.desktop) };
}

/** A clip found for an edit. */
interface Found<C> {
  clip: C;
}

/**
 * The clip to edit.
 * @param clips the picture clips
 * @param id the clip's id
 * @param ctx the edit's limits (whether its track is locked)
 * @returns the clip, or why it can't be edited
 */
function find<C extends EditClip>(clips: C[], id: string, ctx: EditCtx): Found<C> | Refusal {
  const clip = clips.find((candidate) => candidate.id === id);
  if (!clip) return { error: NOT_FOUND };
  const why = ctx.locked(clip.track);
  return why ? { error: why } : { clip };
}

/**
 * Moves the clips of a track that start at or after a time.
 * @param clips the picture clips
 * @param track the track's id
 * @param from the time, seconds
 * @param by seconds to move them (not before 0)
 * @param skip the id of a clip not to move
 * @returns the clips (the same array for no move)
 */
const shiftFrom = <C extends TimedClip>(clips: C[], track: string, from: number, by: number, skip?: string): C[] =>
  by === 0
    ? clips
    : clips.map((other) =>
        other.track === track && other.id !== skip && other.start >= from - EPS
          ? { ...other, start: Math.max(0, other.start + by) }
          : other,
      );

/**
 * Puts a clip back on its track in start order (removed from where it was first).
 * @param clips the picture clips
 * @param clip the clip, at its new start
 * @returns the new clips
 */
function place<C extends TimedClip>(clips: C[], clip: C): C[] {
  const placed = clips.filter((other) => other.id !== clip.id);
  let at = placed.findIndex((other) => other.track === clip.track && other.start > clip.start);
  if (at < 0) at = placed.findLastIndex((other) => other.track === clip.track) + 1 || placed.length;
  placed.splice(at, 0, clip);
  return placed;
}

/**
 * What is wrong with one clip in its track (see `checkTrack`).
 * @param clip the clip
 * @param previous the clip before it on its track
 * @param before the clips before the edit
 * @returns the problem, or null
 */
function clipProblem(
  clip: EditClip,
  previous: TimedClip | undefined,
  before: readonly EditClip[] | undefined,
): string | null {
  if (clip.start < 0) return `${clip.id} starts before 0`;
  // Not `in >= out`: a NaN in or out must fail too.
  const playsForward = clip.in < clip.out;
  if (clip.kind === 'video' && (clip.in < 0 || clip.out > clip.srcDur + EPS || !playsForward))
    return `${clip.id} plays outside its source`;
  if (previous && clip.start < previous.start) return `${clip.id} is out of order`;
  if (previous && clip.start < endOf(previous) - 1e-6) return `${clip.id} overlaps ${previous.id}`;
  const earlier = before?.find((other) => other.id === clip.id);
  const used = usedLength(clip);
  if (earlier && used < usedLength(earlier) - EPS && used < MIN_LEN - 1e-6)
    return `${clip.id} was made shorter than 0.3 s`;
  return null;
}

/**
 * Why a track list breaks the rules: each track sorted by start, no overlaps, nothing before 0, videos inside their
 * source, the video within `maxLength`. With the clips `before` the edit: no clip was made shorter than 0.3 s (one
 * already shorter may stay as it was).
 * @param clips the picture clips
 * @param maxLength the project's length limit, seconds
 * @param before the clips before the edit
 * @returns the first problem, or null
 */
export function checkTrack(clips: EditClip[], maxLength: number, before?: EditClip[]): string | null {
  const last = new Map<string, TimedClip>();
  for (const clip of clips) {
    const problem = clipProblem(clip, last.get(clip.track), before);
    if (problem) return problem;
    last.set(clip.track, clip);
  }
  const length = lengthOf(clips);
  if (length > maxLength + 0.01 && (!before || length > lengthOf(before) + EPS))
    return `the video is too long (${length} s)`;
  return null;
}

/**
 * Removes a clip and pulls every later clip on its track back by its length.
 * @param clips the picture clips
 * @param id the clip's id
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
export function rippleDelete<C extends EditClip>(clips: C[], id: string, ctx: EditCtx): Edit<C> {
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  const { clip } = found;
  const rest = clips.filter((other) => other.id !== id);
  return limitVideos(clips, { clips: shiftFrom(rest, clip.track, endOf(clip), -clipLength(clip)) }, ctx);
}

/**
 * Removes a clip and leaves a gap of its length (Magnetic off).
 * @param clips the picture clips
 * @param id the clip's id
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
export function lift<C extends EditClip>(clips: C[], id: string, ctx: EditCtx): Edit<C> {
  const found = find(clips, id, ctx);
  return 'error' in found ? found : { clips: clips.filter((other) => other.id !== id) };
}

/**
 * Closes the gap at a time on a track: every clip after it moves back by its length.
 * @param clips the picture clips
 * @param at a time in the gap, seconds
 * @param ctx the edit's limits
 * @param track the track's id
 * @returns the new clips, or why not
 */
export function closeGap<C extends EditClip>(clips: C[], at: number, ctx: EditCtx, track = MAIN_VIDEO): Edit<C> {
  const why = ctx.locked(track);
  if (why) return { error: why };
  let reached = 0;
  for (const clip of clips) {
    if (clip.track !== track) continue;
    if (clip.start > reached + EPS && at >= reached && at < clip.start)
      return limitVideos(clips, { clips: shiftFrom(clips, track, clip.start, reached - clip.start) }, ctx);
    reached = Math.max(reached, endOf(clip));
  }
  return { error: 'There’s no gap here.' };
}

/**
 * Every gap on the main track closed, clips in their order (switching Magnetic on).
 * @param clips the picture clips
 * @returns the packed clips
 */
export const closeGaps = <C extends EditClip>(clips: C[]): C[] => pack(clips);

/** How a trim moves the other clips. */
export interface TrimOptions {
  /** The later clips on the track follow the change. */
  ripple: boolean;
}

/**
 * How long a clip may get in a trim, seconds of it used: to the source's end (end edge) or start (start edge) for a
 * video, 60 s for a photo; without ripple, also up to its neighbour.
 * @param clips the picture clips
 * @param clip the clip being trimmed
 * @param side the edge being moved
 * @param ripple whether later clips follow
 * @returns the longest length
 */
function trimCeiling(clips: readonly EditClip[], clip: EditClip, side: 'start' | 'end', ripple: boolean): number {
  const used = usedLength(clip);
  let ceiling: number;
  if (clip.kind === 'photo') ceiling = Math.max(used, PHOTO_MAX);
  else ceiling = side === 'end' ? clip.srcDur - clip.in : clip.out;
  if (ripple) return ceiling;
  const same = clips.filter((other) => other.track === clip.track && other.id !== clip.id);
  if (side === 'end') {
    const next = same.find((other) => other.start >= clip.start + EPS);
    return next ? Math.min(ceiling, used + Math.max(0, next.start - endOf(clip))) : ceiling;
  }
  const previousEnd = same
    .filter((other) => other.start < clip.start - EPS)
    .reduce((latest, other) => Math.max(latest, endOf(other)), 0);
  return Math.min(ceiling, used + Math.max(0, clip.start - previousEnd));
}

/**
 * A clip with one edge moved so that `used` seconds of it are used.
 * @param clip the clip
 * @param side the edge moved
 * @param used the new length used, seconds
 * @returns the trimmed clip (its start not yet moved)
 */
function trimmedClip<C extends EditClip>(clip: C, side: 'start' | 'end', used: number): C {
  if (clip.kind === 'photo') return { ...clip, dur: used };
  return side === 'end'
    ? { ...clip, out: Math.min(clip.srcDur, clip.in + used) }
    : { ...clip, in: Math.max(0, clip.out - used) };
}

/**
 * Moves one edge of a clip on the timeline. With `ripple` the later clips on the track follow the change (a start trim
 * then keeps the clip's start and changes what plays, as 2.x did); without, nothing else moves: the clip's other edge
 * stays, and lengthening stops at its neighbour. Limits: 0.3 s, the source (video), 60 s (photo); a lengthening past
 * the project's length limit is refused.
 * @param clips the picture clips
 * @param id the clip's id
 * @param side the edge to move
 * @param delta seconds to move it (+ is later)
 * @param options whether later clips follow
 * @param ctx the edit's limits
 * @returns the new clips (the same array when nothing changes), or why not
 */
export function trim<C extends EditClip>(
  clips: C[],
  id: string,
  side: 'start' | 'end',
  delta: number,
  options: TrimOptions,
  ctx: EditCtx,
): Edit<C> {
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  const { clip } = found;
  const usedBefore = usedLength(clip);
  const floor = Math.min(MIN_LEN, usedBefore);
  const ceiling = trimCeiling(clips, clip, side, options.ripple);
  const wanted = side === 'end' ? usedBefore + delta : usedBefore - delta;
  const usedAfter = Math.max(floor, Math.min(Math.max(ceiling, usedBefore), wanted));
  if (usedAfter === usedBefore) return { clips };
  const trimmed = trimmedClip(clip, side, usedAfter);
  let result: C[];
  if (options.ripple) {
    const grow = clipLength(trimmed) - clipLength(clip);
    const replaced = clips.map((other) => (other.id === id ? trimmed : other));
    result = shiftFrom(replaced, clip.track, endOf(clip), grow, id);
  } else {
    const moved = side === 'start' ? keepKeys(clip, { ...trimmed, start: endOf(clip) - clipLength(trimmed) }) : trimmed;
    result = clips.map((other) => (other.id === id ? moved : other));
  }
  if (usedAfter > usedBefore && lengthOf(result) > ctx.maxLength + 0.01) return { error: TOO_LONG };
  return limitVideos(clips, { clips: result }, ctx);
}

/**
 * Puts a clip at a time on its track (Magnetic off): there if it fits, else at the nearest free spot where it fits
 * (before or after) within the project's length limit; refused when there is none (Q2: no overwrite).
 * @param clips the picture clips
 * @param id the clip's id
 * @param start the wanted start, seconds
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
export function moveTo<C extends EditClip>(clips: C[], id: string, start: number, ctx: EditCtx): Edit<C> {
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  const { clip } = found;
  const others = clips.filter((other) => other.id !== id);
  const best = freeSpot(others, clip.track, clipLength(clip), start, ctx.maxLength);
  if (best === null) return { error: NO_ROOM };
  if (best === clip.start) return { clips };
  return limitVideos(clips, { clips: place(clips, { ...clip, start: best }) }, ctx);
}

/**
 * Where a clip goes on a track near a time: there if it fits, else the nearest free stretch where it fits, with the
 * video within `maxLength`.
 * @param others the track's clips, without the one being placed
 * @param track the track's id
 * @param clipSeconds the clip's length
 * @param start the wanted start, seconds
 * @param maxLength the project's length limit, seconds
 * @returns the start, or null when there is no room
 */
function freeSpot(
  others: readonly TimedClip[],
  track: string,
  clipSeconds: number,
  start: number,
  maxLength: number,
): number | null {
  const wanted = Math.max(0, start);
  // The free stretches of the track; the last one is open-ended.
  const free: [number, number][] = [];
  let reached = 0;
  for (const other of others) {
    if (other.track !== track) continue;
    if (other.start > reached + EPS) free.push([reached, other.start]);
    reached = Math.max(reached, endOf(other));
  }
  free.push([reached, Infinity]);
  const videoLength = lengthOf(others);
  let best: number | null = null;
  for (const [from, to] of free) {
    if (to - from < clipSeconds - 1e-6) continue;
    const spot = Math.min(Math.max(wanted, from), Math.max(from, to - clipSeconds));
    if (Math.max(videoLength, spot + clipSeconds) > maxLength + 0.01) continue;
    if (best === null || Math.abs(spot - wanted) < Math.abs(best - wanted)) best = spot;
  }
  return best;
}

/**
 * Where a clip goes in the main track's order (as the timeline's drag).
 * @param others the clips, without the one being placed
 * @param centre the clip's centre, seconds
 * @returns its index among the main track's clips
 */
function mainIndex(others: readonly TimedClip[], centre: number): number {
  const main = others.filter((other) => other.track === MAIN_VIDEO);
  const position = main.findIndex((other) => centre < other.start + clipLength(other) / 2);
  return position < 0 ? main.length : position;
}

/**
 * Moves a clip to another picture track (203 AC-3); both tracks must be unlocked. Onto an overlay track, or the main
 * track with Magnetic off, it goes where moveTo would (there if it fits, else the nearest free spot; never over another
 * clip). Onto the main track with Magnetic on it is inserted where its centre falls (before the first clip whose middle
 * is after it, as the timeline's drag) and the track is packed; with Magnetic on the main track it leaves closes up.
 * Within its own track it is moveTo, or reorder on the main track with Magnetic on.
 * @param clips the picture clips
 * @param id the clip's id
 * @param track the track to move it to
 * @param start the wanted start, seconds
 * @param ctx the edit's limits and whether Magnetic is on
 * @returns the new clips, or why not
 */
export function moveToTrack<C extends EditClip>(
  clips: C[],
  id: string,
  track: string,
  start: number,
  ctx: MoveCtx,
): Edit<C> {
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  const why = ctx.locked(track);
  if (why) return { error: why };
  const clipSeconds = clipLength(found.clip);
  const insert = ctx.magnetic && track === MAIN_VIDEO;
  const rest = clips.filter((other) => other.id !== id);
  if (track === found.clip.track)
    return insert ? reorder(clips, id, mainIndex(rest, start + clipSeconds / 2), ctx) : moveTo(clips, id, start, ctx);
  const moved: C = { ...found.clip, track };
  if (insert) return insertOnMain(clips, rest, moved, start + clipSeconds / 2, ctx);
  const base = ctx.magnetic ? pack(rest) : rest;
  const spot = freeSpot(base, track, clipSeconds, start, ctx.maxLength);
  if (spot === null) return { error: NO_ROOM };
  return limitVideos(clips, { clips: place(base, { ...moved, start: spot }) }, ctx);
}

/**
 * Inserts a clip into the main track's order where its centre falls, and packs the track (Magnetic on).
 * @param clips the picture clips before the move
 * @param rest the clips without the one being moved
 * @param moved the clip, on the main track
 * @param centre where its centre was dropped, seconds
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
function insertOnMain<C extends EditClip>(clips: C[], rest: C[], moved: C, centre: number, ctx: EditCtx): Edit<C> {
  const main = rest.filter((other) => other.track === MAIN_VIDEO);
  const before = main.at(mainIndex(rest, centre));
  const at = before
    ? rest.indexOf(before)
    : rest.findLastIndex((other) => other.track === MAIN_VIDEO) + 1 || rest.length;
  const result = pack([...rest.slice(0, at), moved, ...rest.slice(at)]);
  if (lengthOf(result) > ctx.maxLength + 0.01 && lengthOf(result) > lengthOf(clips) + EPS) return { error: TOO_LONG };
  return limitVideos(clips, { clips: result }, ctx);
}

/* ---------- roll, slip, slide ---------- */

/** How far an edge may move, seconds: [the most it may move earlier (≤ 0), the most later (≥ 0)]. */
type EdgeRange = [number, number];

/**
 * How far a clip's end edge can move (+ lengthens): 0.3 s to the source's end (video) or 60 s (photo).
 * @param clip the clip
 * @returns the range
 */
function endRange(clip: EditClip): EdgeRange {
  const used = usedLength(clip);
  return [
    Math.min(MIN_LEN, used) - used,
    Math.max(used, clip.kind === 'photo' ? PHOTO_MAX : clip.srcDur - clip.in) - used,
  ];
}

/**
 * How far a clip's start edge can move (+ shortens): to the source's start (video) or 60 s (photo), 0.3 s.
 * @param clip the clip
 * @returns the range
 */
function startRange(clip: EditClip): EdgeRange {
  const used = usedLength(clip);
  return [used - Math.max(used, clip.kind === 'photo' ? PHOTO_MAX : clip.out), used - Math.min(MIN_LEN, used)];
}

// A video's edge is kept inside its source: the ranges' sums can miss its ends by a rounding error.
const moveEnd = <C extends EditClip>(clip: C, by: number): C =>
  clip.kind === 'photo' ? { ...clip, dur: clip.dur + by } : { ...clip, out: Math.min(clip.srcDur, clip.out + by) };
const moveStart = <C extends EditClip>(clip: C, by: number): C =>
  clip.kind === 'photo'
    ? { ...clip, start: Math.max(0, clip.start + by), dur: clip.dur - by }
    : { ...clip, start: Math.max(0, clip.start + by), in: Math.max(0, clip.in + by) };

/**
 * A clip whose start edge moved, with its keyframes shifted back by the move, so they stay at their place on the
 * timeline (205 Q2). Whole-clip moves don't call it: keyframe times count from the clip's start.
 * @param before the clip before the move
 * @param after the clip after it
 * @returns `after`, with its keys shifted
 */
function keepKeys<C extends TimedClip>(before: C, after: C): C {
  const moved = after.start - before.start;
  return after.keys && moved !== 0 ? { ...after, keys: shiftKeys(after.keys, -moved) } : after;
}

/**
 * A move kept within a range (a range that excludes 0 is widened to include it: no move is always allowed).
 * @param move seconds
 * @param range the range
 * @returns the move, clamped
 */
const clampMove = (move: number, [low, high]: EdgeRange) =>
  Math.max(Math.min(low, 0), Math.min(Math.max(high, 0), move));

/** The clips just before and after a clip on its track. */
interface Neighbours<C> {
  previous?: C;
  next?: C;
  /** `previous`, when it touches the clip (no gap between). */
  touchingPrevious?: C;
  /** `next`, when it touches the clip. */
  touchingNext?: C;
}

/**
 * The clips of a clip's track just before and after it, and whether each touches it.
 * @param clips the picture clips
 * @param clip the clip
 * @returns its neighbours
 */
function neighbours<C extends EditClip>(clips: readonly C[], clip: C): Neighbours<C> {
  const same = clips.filter((other) => other.track === clip.track && other.id !== clip.id);
  const previous = same.filter((other) => other.start < clip.start).at(-1);
  const next = same.find((other) => other.start >= clip.start);
  return {
    previous,
    next,
    touchingPrevious: previous && Math.abs(endOf(previous) - clip.start) < 1e-6 ? previous : undefined,
    touchingNext: next && Math.abs(next.start - endOf(clip)) < 1e-6 ? next : undefined,
  };
}

/**
 * Moves the cut between a clip and the one right after it: one lengthens as the other shortens, nothing else moves and
 * the length stays. Stops at 0.3 s and the sources' ends; a cut with a gap is refused.
 * @param clips the picture clips
 * @param leftId the id of the clip before the cut
 * @param delta seconds to move the cut (+ later)
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
export function roll<C extends EditClip>(clips: C[], leftId: string, delta: number, ctx: EditCtx): Edit<C> {
  const found = find(clips, leftId, ctx);
  if ('error' in found) return found;
  const { next, touchingNext } = neighbours(clips, found.clip);
  if (!next) return { error: 'There’s no clip after this one to roll into.' };
  if (!touchingNext) return { error: 'There’s a gap at this cut: Roll moves a cut between two clips side by side.' };
  const [leftLow, leftHigh] = endRange(found.clip);
  const [rightLow, rightHigh] = startRange(touchingNext);
  const by = clampMove(delta, [Math.max(leftLow, rightLow), Math.min(leftHigh, rightHigh)]);
  if (by === 0) return { clips };
  const left = moveEnd(found.clip, by);
  const right = keepKeys(touchingNext, { ...moveStart(touchingNext, by), start: endOf(left) });
  const replaced = clips.map((other) => {
    if (other.id === left.id) return left;
    return other.id === right.id ? right : other;
  });
  return limitVideos(clips, { clips: replaced }, ctx);
}

/**
 * Changes which part of a video clip plays (in and out together, within its source); its start and length stay.
 * @param clips the picture clips
 * @param id the clip's id
 * @param delta seconds to move what plays
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
export function slip<C extends EditClip>(clips: C[], id: string, delta: number, ctx: EditCtx): Edit<C> {
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  const { clip } = found;
  if (clip.kind === 'photo') return { error: 'A photo has no source time to slip: use Slip on a video clip.' };
  const by = clampMove(delta, [-clip.in, clip.srcDur - clip.out]);
  if (by === 0) return { clips };
  return { clips: clips.map((other) => (other.id === id ? { ...clip, in: clip.in + by, out: clip.out + by } : other)) };
}

/**
 * How far a clip can slide: a touching previous clip's end edge moves with it, else it moves into (or away from) the
 * gap before it; on the next side a touching clip's start edge moves, else it moves into the gap after it.
 * @param clip the clip
 * @param near its neighbours (`next` is there)
 * @param next the clip after it
 * @param magnetic whether no gap may open (the main track with Magnetic on)
 * @returns the range
 */
function slideRange<C extends EditClip>(clip: C, near: Neighbours<C>, next: C, magnetic: boolean): EdgeRange {
  const gapBefore = clip.start - (near.previous ? endOf(near.previous) : 0);
  let [low, high]: EdgeRange = near.touchingPrevious
    ? endRange(near.touchingPrevious)
    : [-gapBefore, magnetic ? 0 : Infinity];
  if (near.touchingNext) {
    const [nextLow, nextHigh] = startRange(near.touchingNext);
    return [Math.max(low, nextLow), Math.min(high, nextHigh)];
  }
  high = Math.min(high, next.start - endOf(clip));
  if (magnetic) low = Math.max(low, 0);
  return [low, high];
}

/**
 * Moves a clip between its neighbours, keeping what it plays and its length: a touching previous clip's end and next
 * clip's start move with it (within 0.3 s and their sources), or it moves into a gap next to it. Bounded by 0; the last
 * clip has nothing to slide against. With `magnetic` it opens no gap on the main track (it may close one); overlay
 * tracks are never magnetic (Q8).
 * @param clips the picture clips
 * @param id the clip's id
 * @param delta seconds to move it
 * @param ctx the edit's limits
 * @param magnetic whether Magnetic is on
 * @returns the new clips, or why not
 */
export function slide<C extends EditClip>(
  clips: C[],
  id: string,
  delta: number,
  ctx: EditCtx,
  magnetic = false,
): Edit<C> {
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  const { clip } = found;
  const near = neighbours(clips, clip);
  if (!near.next) return { error: 'There’s no clip after this one: Slide moves a clip between two others.' };
  const by = clampMove(delta, slideRange(clip, near, near.next, magnetic && clip.track === MAIN_VIDEO));
  if (by === 0) return { clips };
  const moved = clips.map((other) => {
    if (other.id === id) return { ...clip, start: clip.start + by };
    if (other.id === near.touchingPrevious?.id) return moveEnd(other, by);
    if (other.id === near.touchingNext?.id) return keepKeys(other, moveStart(other, by));
    return other;
  });
  return limitVideos(clips, { clips: moved }, ctx);
}

/** The timeline's edit tools. */
export type Tool = 'select' | 'roll' | 'slip' | 'slide';

/**
 * The keyboard's Alt + ← / → (Q5): moves with a tool. Select moves the clip to a time (Magnetic off, or on an overlay
 * track) or one place in the order per press (Magnetic on, the main track); Roll moves the clip's end cut; Slip and
 * Slide.
 * @param clips the picture clips
 * @param id the clip's id
 * @param tool the tool
 * @param frames how many frames to move (− earlier)
 * @param fps the project's frame rate
 * @param magnetic whether Magnetic is on
 * @param ctx the edit's limits
 * @returns the new clips, or why not
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
  const seconds = frames / fps;
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  switch (tool) {
    case 'roll':
      return roll(clips, id, seconds, ctx);
    case 'slip':
      return slip(clips, id, seconds, ctx);
    case 'slide':
      return slide(clips, id, seconds, ctx, magnetic);
    case 'select': {
      if (!magnetic || found.clip.track !== MAIN_VIDEO) return moveTo(clips, id, found.clip.start + seconds, ctx);
      const index = clips.filter((other) => other.track === found.clip.track).findIndex((other) => other.id === id);
      return reorder(clips, id, index + Math.sign(frames), ctx);
    }
  }
}

/**
 * Moves a main-track clip to another place in the order and packs the track (Magnetic on: 2.x's drag). Overlay tracks
 * are never magnetic (Q8), so their clips move to a time instead.
 * @param clips the picture clips
 * @param id the clip's id
 * @param index its new place among the main track's clips
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
export function reorder<C extends EditClip>(clips: C[], id: string, index: number, ctx: EditCtx): Edit<C> {
  const found = find(clips, id, ctx);
  if ('error' in found) return found;
  const track = found.clip.track;
  if (track !== MAIN_VIDEO) return { error: NOT_MAGNETIC };
  const same = clips.filter((other) => other.track === track);
  const from = same.findIndex((other) => other.id === id);
  const to = Math.max(0, Math.min(same.length - 1, index));
  if (from === to) return { clips };
  const order = same.slice();
  order.splice(to, 0, ...order.splice(from, 1));
  let placed = 0;
  const reordered = clips.map((other) => {
    if (other.track !== track) return other;
    const next = order.at(placed) ?? other;
    placed++;
    return next;
  });
  return limitVideos(clips, { clips: pack(reordered) }, ctx);
}
