import { NOT_FOUND, TOO_LONG, lengthOf, limitVideos, shiftFrom, type EditClip, type EditDone, type MoveCtx, type Refusal } from './edits';
import { keysOf } from './guards';
import { scaleKeys, splitKeys } from './keyframes';
import { FREEZE_SECONDS, RAMP_LIMITS, SPEED_LIMITS, frameSourceAt, playLength, speedFields, type RampPoint } from './speed';
import { splitSource } from './speedEdges';
import { clipLength } from './timeline';
import { MAIN_VIDEO } from './tracks';
import { tidyTransitions } from './transitions';

/*
 * Speed edits on the timeline (P2.7, specs/features/207-speed plan §2), free of DOM and React. A speed change builds
 * the new clip (in and out kept, Q2) and then follows the rules every edit follows: on the main track with Magnetic on
 * the later clips move; elsewhere a clip that would run into the next one is refused with the reason (Q3); the
 * platform's length limit, the videos-at-once limit and the transitions' room (206) as for 202's edits.
 */

/** `setSpeed`'s context: an edit's limits, whether Magnetic is on, and the frame rate transitions are put on. */
export interface SpeedCtx extends MoveCtx {
  fps: number;
}

/**
 * A speed change: a constant speed (dropping a ramp), reverse on or off, a ramp in place of the speed (over `rampSpan`
 * when given, a point edit keeping the clip's, D-050; else over in–out), or Reset speed (1× forwards).
 */
export type SpeedChange =
  | { speed: number }
  | { reverse: boolean }
  | { ramp: readonly RampPoint[]; rampSpan?: readonly [number, number] }
  | { reset: true };

/** A speed edit's result: the new clips and what to tell the user about it, or why it was refused. */
export type SpeedEdit<C> = (EditDone<C> & { note?: string }) | Refusal;

/** The shortest a clip may play at a speed, seconds (`clipLength`'s floor; AC-2). */
const SHORTEST = 0.1;
const EPS = 1e-9;

export { FREEZE_LIMITS, FREEZE_SECONDS } from './speed';

export const NOT_VIDEO = 'Only video clips have a speed.';
export const RAMP_POINTS = `A ramp has ${RAMP_LIMITS.minPoints} to ${RAMP_LIMITS.maxPoints} points.`;
export const REVERSE_DROPS_RAMP = 'Reverse plays at a constant speed: the ramp was removed.';
export const RAMP_DROPS_REVERSE = 'A ramp plays forwards: Reverse was turned off.';

/**
 * A number as the messages show it: at most `places` decimals, no trailing zeros.
 * @param value the number
 * @param places decimals
 * @returns the text
 */
const shown = (value: number, places = 1) => String(Number(value.toFixed(places)));

/**
 * How a change is named in a message: "at 0.5×" or "with this ramp".
 * @param clip the changed clip
 * @returns the words
 */
const atSpeed = (clip: EditClip) => (clip.ramp ? 'with this ramp' : `at ${shown(clip.speed ?? 1, 2)}×`);

/**
 * A clip without some of its fields (not set to undefined, so a clip back at 1× is as it was).
 * @param clip the clip
 * @param fields the fields to leave out
 * @returns the copy
 */
function without<C extends EditClip>(clip: C, ...fields: ('speed' | 'reverse' | 'ramp' | 'rampSpan' | 'keys')[]): C {
  const copy = { ...clip };
  for (const field of fields) Reflect.deleteProperty(copy, field);
  return copy;
}

/**
 * The clip with a speed change made (Q1, Q7), and what to say about a field it dropped.
 * @param clip the video clip
 * @param change the change
 * @returns the changed clip and the note
 */
function withSpeed<C extends EditClip>(clip: C, change: SpeedChange): { changed: C; note?: string } {
  if ('reset' in change) return { changed: without(clip, 'speed', 'reverse', 'ramp', 'rampSpan') };
  if ('speed' in change) {
    const speed = Math.min(SPEED_LIMITS.max, Math.max(SPEED_LIMITS.min, Math.round(change.speed / SPEED_LIMITS.step) * SPEED_LIMITS.step));
    const constant = without(clip, 'speed', 'ramp', 'rampSpan');
    return { changed: speed === 1 ? constant : { ...constant, speed } };
  }
  if ('reverse' in change) {
    if (!change.reverse) return { changed: without(clip, 'reverse') };
    const changed: C = { ...without(clip, 'ramp', 'rampSpan'), reverse: true };
    return clip.ramp ? { changed, note: REVERSE_DROPS_RAMP } : { changed };
  }
  // A new ramp is over the clip's in–out (no span, D-050); a point edit passes the clip's span on.
  const changed: C = {
    ...without(clip, 'speed', 'reverse', 'rampSpan'),
    ramp: change.ramp.map((point) => ({ ...point })),
    ...(change.rampSpan ? { rampSpan: change.rampSpan } : {}),
  };
  return clip.reverse ? { changed, note: RAMP_DROPS_REVERSE } : { changed };
}

/**
 * Whether two clips play at the same speed.
 * @param left a clip
 * @param right another
 * @returns true when their speed fields match
 */
const sameSpeed = (left: EditClip, right: EditClip) =>
  JSON.stringify(speedFields(left)) === JSON.stringify(speedFields(right));

/**
 * The clips with one clip replaced by its new length: on the main track with Magnetic on the later clips follow;
 * elsewhere a longer clip must fit before the next one (Q3).
 * @param clips the picture clips
 * @param clip the clip before the change
 * @param changed the clip after it
 * @param ctx the edit's limits
 * @returns the new clips, or why not
 */
function placeChanged<C extends EditClip>(clips: C[], clip: C, changed: C, ctx: SpeedCtx): C[] | Refusal {
  const end = clip.start + clipLength(clip);
  const grow = clipLength(changed) - clipLength(clip);
  const replaced = clips.map((other) => (other.id === clip.id ? changed : other));
  if (ctx.magnetic && clip.track === MAIN_VIDEO) return shiftFrom(replaced, clip.track, end, grow, clip.id);
  if (grow <= EPS) return replaced;
  const next = clips
    .filter((other) => other.track === clip.track && other.id !== clip.id && other.start >= end - 1e-6)
    .reduce<C | undefined>((first, other) => (!first || other.start < first.start ? other : first), undefined);
  if (next && clip.start + clipLength(changed) > next.start + 1e-6)
    return {
      error: `There is ${shown(next.start - clip.start)} s of room before the next clip; ${atSpeed(changed)} this clip needs ${shown(clipLength(changed))} s`,
    };
  return replaced;
}

/**
 * What happened to a clip's transitions once they were fitted to its new length (206 AC-4), to tell the user.
 * @param before the clips before
 * @param after the clips after `tidyTransitions`
 * @param id the changed clip's id
 * @returns the note, or undefined when they kept their lengths
 */
function transitionNote(before: readonly EditClip[], after: readonly EditClip[], id: string): string | undefined {
  for (const clip of before) {
    if (!clip.transition || (clip.id !== id && clip.transition.to !== id)) continue;
    const now = after.find((other) => other.id === clip.id)?.transition;
    if (!now) return 'The transition was removed: there is no room for it now.';
    if (now.dur !== clip.transition.dur) return `The transition was shortened to ${shown(now.dur, 2)} s to fit.`;
  }
  return undefined;
}

/**
 * Changes a video clip's speed (AC-2, AC-5, AC-7): keeps its in and out (Q2), scales its keyframes with its length
 * (Q9), and moves the later clips (main track, Magnetic on) or refuses when it doesn't fit (Q3); refuses a clip
 * shorter than 0.1 s and a video longer than the platform allows. Reverse drops a ramp and a ramp drops reverse,
 * with a note (Q7); a transition that no longer fits is shortened, with a note.
 * @param clips the picture clips
 * @param id the clip's id
 * @param change the speed, reverse or ramp
 * @param ctx the edit's limits, Magnetic and the frame rate
 * @returns the new clips (the same array when nothing changes) and a note, or why not
 */
export function setSpeed<C extends EditClip>(clips: C[], id: string, change: SpeedChange, ctx: SpeedCtx): SpeedEdit<C> {
  const clip = clips.find((candidate) => candidate.id === id);
  if (!clip) return { error: NOT_FOUND };
  const locked = ctx.locked(clip.track);
  if (locked) return { error: locked };
  if (clip.kind !== 'video' || clip.freeze !== undefined) return { error: NOT_VIDEO };
  if ('ramp' in change && (change.ramp.length < RAMP_LIMITS.minPoints || change.ramp.length > RAMP_LIMITS.maxPoints))
    return { error: RAMP_POINTS };
  const { changed, note } = withSpeed(clip, change);
  if (sameSpeed(clip, changed)) return { clips };
  const length = playLength(changed);
  if (length < SHORTEST - EPS) return { error: `${atSpeed(changed).replace(/^./, (first) => first.toUpperCase())} this clip would be shorter than ${SHORTEST} s.` };
  const keys = scaleKeys(clip.keys, length / clipLength(clip));
  const placed = placeChanged(clips, clip, keys ? { ...changed, keys } : without(changed, 'keys'), ctx);
  if ('error' in placed) return placed;
  if (length > clipLength(clip) + EPS && lengthOf(placed) > ctx.maxLength + 0.01) return { error: TOO_LONG };
  const limited = limitVideos(clips, { clips: placed }, ctx);
  if ('error' in limited) return limited;
  const tidied = tidyTransitions(limited.clips, ctx.fps).clips;
  const notes = [note, transitionNote(clips, tidied, id)].filter(Boolean);
  return notes.length ? { clips: tidied, note: notes.join(' ') } : { clips: tidied };
}

/* ---------- freeze frames (AC-4, Q4, D1) ---------- */

export const NOT_FREEZABLE = 'Freeze frame holds a frame of a video clip: put the playhead on one.';
export const OUTSIDE_CLIP = 'Put the playhead inside the clip to freeze its frame there.';

/** A clip a freeze can be made from: a picture clip, which may fade in from black at its start. */
type FreezeClip = EditClip & { fade?: boolean };

/**
 * Keys holding the values an item's keys have at a time (D-051): one key at 0 per animated value.
 * @param keys the clip's keys
 * @param at seconds from its start
 * @returns the held keys, or undefined without keys
 */
function heldKeys(keys: EditClip['keys'], at: number): EditClip['keys'] {
  const [, after] = splitKeys(keys, at);
  if (!after) return undefined;
  const held: NonNullable<EditClip['keys']> = {};
  for (const prop of keysOf(after)) {
    const first = after[prop]?.at(0);
    if (first) held[prop] = [first];
  }
  return held;
}

/**
 * A clip without its transition, keys or fade (each left out, not set to undefined).
 * @param clip the clip
 * @returns the copy
 */
function bare<C extends FreezeClip>(clip: C): C {
  const copy = without(clip, 'speed', 'reverse', 'ramp', 'rampSpan', 'keys');
  Reflect.deleteProperty(copy, 'transition');
  return copy;
}

/**
 * The still of a clip's frame at a time into it (D1): a video clip showing that one source time for 2 s, with the
 * clip's file, box and look, its keyframed values held (D-051), no speed, no transition, no fade.
 * @param clip the video clip
 * @param local seconds into it
 * @param id the still's id
 * @returns the still, its start not yet set
 */
function stillOf<C extends FreezeClip>(clip: C, local: number, id: string): C {
  const keys = heldKeys(clip.keys, local);
  return {
    ...bare(clip),
    id,
    freeze: frameSourceAt(clip, local),
    dur: FREEZE_SECONDS,
    ...('fade' in clip ? { fade: false } : {}),
    ...(keys ? { keys } : {}),
  };
}

/**
 * A clip's pieces with a still put in at a time into it: before the clip at its first frame (taking its fade and the
 * transition leading into it), after it at its last (taking its transition), else between the two parts of a split
 * (the right part keeping its transition, as split does).
 * @param clip the clip
 * @param local seconds into it
 * @param ctx the frame rate
 * @param newId makes an id: the still's, then the right part's
 * @returns the pieces in order, and the id a transition leading into the clip should now point to
 */
function piecesOf<C extends FreezeClip>(clip: C, local: number, ctx: SpeedCtx, newId: () => string): { pieces: C[]; into: string } {
  const length = clipLength(clip);
  const frame = 1 / ctx.fps;
  const still = stillOf(clip, local, newId());
  if (local < frame) {
    const moved: C = { ...clip, start: clip.start + FREEZE_SECONDS, ...('fade' in clip ? { fade: false } : {}) };
    return { pieces: [{ ...still, start: clip.start, ...('fade' in clip ? { fade: clip.fade } : {}) }, moved], into: still.id };
  }
  if (local >= length - frame) {
    const before: C = { ...clip };
    Reflect.deleteProperty(before, 'transition');
    return {
      pieces: [before, { ...still, start: clip.start + length, ...(clip.transition ? { transition: clip.transition } : {}) }],
      into: clip.id,
    };
  }
  const [keysLeft, keysRight] = splitKeys(clip.keys, local);
  const [leftPart, rightPart] = splitSource(clip, local);
  const left: C = { ...without(clip, 'keys'), ...leftPart, ...(keysLeft ? { keys: keysLeft } : {}) };
  Reflect.deleteProperty(left, 'transition');
  const right: C = {
    ...without(clip, 'keys'),
    ...rightPart,
    id: newId(),
    start: clip.start + local + FREEZE_SECONDS,
    ...('fade' in clip ? { fade: false } : {}),
    ...(keysRight ? { keys: keysRight } : {}),
  };
  return { pieces: [left, { ...still, start: clip.start + local }, right], into: clip.id };
}

/**
 * Freeze frame (AC-4, Q4): a 2 s still of the frame at a time into a video clip, put between the two parts of the
 * clip split there, or before or after it at its first or last frame. On the main track with Magnetic on the later
 * clips move by its length; elsewhere it needs that much room after the clip, else it is refused with the reason.
 * @param clips the picture clips
 * @param id the video clip's id
 * @param local seconds into the clip (the playhead)
 * @param ctx the edit's limits, Magnetic and the frame rate
 * @param newId makes a new clip's id
 * @returns the new clips, or why not
 */
export function freezeFrame<C extends FreezeClip>(clips: C[], id: string, local: number, ctx: SpeedCtx, newId: () => string): SpeedEdit<C> {
  const clip = clips.find((candidate) => candidate.id === id);
  if (!clip) return { error: NOT_FOUND };
  const locked = ctx.locked(clip.track);
  if (locked) return { error: locked };
  if (clip.kind !== 'video' || clip.freeze !== undefined) return { error: NOT_FREEZABLE };
  const end = clip.start + clipLength(clip);
  if (local < 0 || local > clipLength(clip)) return { error: OUTSIDE_CLIP };
  const magnetic = ctx.magnetic && clip.track === MAIN_VIDEO;
  if (!magnetic) {
    const room = clips
      .filter((other) => other.track === clip.track && other.id !== id && other.start >= end - 1e-6)
      .reduce((nearest, other) => Math.min(nearest, other.start - end), Infinity);
    if (room < FREEZE_SECONDS - 1e-6)
      return { error: `There is ${shown(Math.max(0, room))} s of room after this clip; the freeze frame needs ${shown(FREEZE_SECONDS)} s` };
  }
  const { pieces, into } = piecesOf(clip, local, ctx, newId);
  const others = magnetic ? shiftFrom(clips, clip.track, end, FREEZE_SECONDS, id) : clips;
  const placed = others.flatMap((other) => {
    if (other.id === id) return pieces;
    return other.transition?.to === id && into !== id ? [{ ...other, transition: { ...other.transition, to: into } }] : [other];
  });
  if (lengthOf(placed) > ctx.maxLength + 0.01) return { error: TOO_LONG };
  const limited = limitVideos(clips, { clips: placed }, ctx);
  return 'error' in limited ? limited : { clips: tidyTransitions(limited.clips, ctx.fps).clips };
}
