/*
 * Sound clips on the audio tracks (208 §1), free of DOM and React: adding a sound file at the playhead, moving,
 * trimming, splitting, duplicating and deleting. Like the picture edits (edits.ts), each is a pure function that returns
 * the new sound clips or why it was refused; it never throws and never leaves two sounds overlapping on a track, a clip
 * outside its file, or a track's clips out of start order. Audio tracks are free like overlay tracks: nothing packs them
 * and they don't move when the main track ripples (Q5, Q16).
 */
import { shiftKeys, splitKeys } from './keyframes';
import type { EditCtx, Refusal } from './edits';
import { formatTime, type AudioClip } from './timeline';
import { addAudioTrack, soundRole, type Track } from './tracks';

/** Seconds: an edit never makes a sound clip shorter than this. */
export const SOUND_MIN = 0.1;
/** Starts summed in floating point may sit a hair off an edge. */
const EPS = 1e-9;

/** What every sound edit checks against: the picture edits' lock guard, and where the video ends. */
export interface SoundCtx extends Pick<EditCtx, 'locked'> {
  /** The video's length, seconds: where a `toEnd` clip ends. */
  videoEnd: number;
}

/** A sound edit that went through: the new sound clips (as `EditDone` for pictures). */
export interface SoundDone<A> {
  audio: A[];
}

/** A sound edit's result: the new sound clips, or why it was refused. */
export type SoundEdit<A> = SoundDone<A> | Refusal;

/** A sound file to add: the new clip's id, and the file's name and length. */
export type NewSound = Pick<AudioClip, 'id' | 'srcDur'> & Required<Pick<AudioClip, 'name'>>;

/** A sound added, as `addSound` returns it: the new tracks too (a track is made when none has room). */
export interface SoundAdded<A> extends SoundDone<A> {
  tracks: Track[];
  /** The track it went on. */
  track: string;
}

export const SOUND_NOT_FOUND = 'That sound isn’t on the timeline.';
const OVERLAP = 'No room here: it would overlap another sound on this track.';
const PAST_START = 'That is past the start of the sound file.';
const PAST_END = 'That is past the end of the sound file.';
const TOO_SHORT = `That would make a sound shorter than ${SOUND_MIN} s.`;
/** Seconds: the longest fade in or out (AC-2). */
export const FADE_MAX = 10;

/**
 * A sound clip's seconds on the timeline.
 * @param clip the clip
 * @param videoEnd the video's length: a `toEnd` clip runs to it (Q7), capped by what is left of its file
 * @param audio the sound clips: a `toEnd` clip stops at the next one on its track when that comes first (T072, option A)
 * @returns seconds (0 for a `toEnd` clip starting past the end)
 */
export function soundLength(clip: AudioClip, videoEnd: number, audio: readonly Pick<AudioClip, 'id' | 'track' | 'start'>[]): number {
  if (!clip.toEnd) return Math.max(0, (clip.out ?? clip.srcDur) - clip.in);
  let end = videoEnd;
  for (const other of audio)
    if (other.track === clip.track && other.id !== clip.id && other.start > clip.start + EPS) end = Math.min(end, other.start);
  return Math.max(0, Math.min(end - clip.start, clip.srcDur - clip.in));
}

/**
 * Whether a stretch of a track is free of other sound clips.
 * @param audio the sound clips
 * @param track the track
 * @param start the stretch's start, seconds
 * @param end its end
 * @param videoEnd the video's length
 * @param except a clip to leave out (the one being edited)
 * @param cutsToEnd whether a toEnd clip before the stretch stops where it starts (T072, option A: an edit the user
 *   makes); false for Add sound's own choice of a track, which never cuts a song short
 * @returns true when nothing else is there
 */
function isFree(audio: readonly AudioClip[], track: string, start: number, end: number, videoEnd: number, except?: string, cutsToEnd = true): boolean {
  // Measured with the clip in its new place, so a toEnd clip before it stops there.
  const placed = cutsToEnd ? [...audio.filter((other) => other.id !== except), { id: except ?? '', track, start }] : audio;
  return audio.every(
    (other) =>
      other.track !== track ||
      other.id === except ||
      other.start + soundLength(other, videoEnd, placed) <= start + EPS ||
      other.start >= end - EPS,
  );
}

/**
 * The clips with one replaced (or added), in start order (stable, so each track keeps its order).
 * @param audio the sound clips
 * @param clip the new or changed clip
 * @param extra another new clip (split, duplicate)
 * @returns the new clips
 */
function withClip<A extends AudioClip>(audio: readonly A[], clip: A, extra?: A): A[] {
  const next = audio.some((other) => other.id === clip.id)
    ? audio.map((other) => (other.id === clip.id ? clip : other))
    : [...audio, clip];
  if (extra) next.push(extra);
  return next.sort((first, second) => first.start - second.start);
}

/**
 * The clip and whether its track can be changed.
 * @param audio the sound clips
 * @param id the clip's id
 * @param ctx the context
 * @returns the clip, or why not
 */
function editable<A extends AudioClip>(audio: readonly A[], id: string, ctx: SoundCtx): A | Refusal {
  const clip = audio.find((candidate) => candidate.id === id);
  if (!clip) return { error: SOUND_NOT_FOUND };
  const locked = ctx.locked(clip.track);
  return locked ? { error: locked } : clip;
}

/**
 * A clip placed on a track if there is room: the whole file at 100 %; a song longer than the video, as the first clip
 * on a Music track, plays to the end of the video (Q7).
 * @param audio the sound clips
 * @param track the track
 * @param file the sound file
 * @param at its start, seconds
 * @param ctx the context
 * @returns the clip, or null when the track is locked or has no room
 */
function placeOn(audio: readonly AudioClip[], track: Track, file: NewSound, at: number, ctx: SoundCtx): AudioClip | null {
  if (ctx.locked(track.id)) return null;
  const first = soundRole(track) === 'music' && !audio.some((other) => other.track === track.id);
  const toEnd = first && file.srcDur > ctx.videoEnd - at;
  const clip: AudioClip = toEnd
    ? { id: file.id, track: track.id, start: at, in: 0, volume: 1, toEnd: true, srcDur: file.srcDur, name: file.name }
    : { id: file.id, track: track.id, start: at, in: 0, out: file.srcDur, volume: 1, toEnd: false, srcDur: file.srcDur, name: file.name };
  return isFree(audio, track.id, at, at + soundLength(clip, ctx.videoEnd, audio), ctx.videoEnd, undefined, false) ? clip : null;
}

/**
 * A sound file added at the playhead (AC-2): on the chosen track when it has room there, else on the first sound track
 * that has, else on a new sound track (while there are fewer than 8).
 * @param audio the sound clips
 * @param tracks the project's tracks
 * @param file the sound file
 * @param at the playhead, seconds
 * @param chosen the chosen track's id (null: none chosen)
 * @param ctx the context
 * @returns the new clips, tracks and the track it went on, or why not
 */
export function addSound(
  audio: AudioClip[],
  tracks: Track[],
  file: NewSound,
  at: number,
  chosen: string | null,
  ctx: SoundCtx,
): SoundAdded<AudioClip> | Refusal {
  const start = Math.max(0, at);
  const sound = tracks.filter((track) => track.kind === 'audio');
  const order = [...sound.filter((track) => track.id === chosen), ...sound.filter((track) => track.id !== chosen)];
  for (const track of order) {
    const clip = placeOn(audio, track, file, start, ctx);
    if (clip) return { audio: withClip(audio, clip), tracks, track: track.id };
  }
  const added = addAudioTrack(tracks);
  if ('error' in added) return { error: `No room for this sound at ${formatTime(start)} on any sound track. ${added.error}` };
  const track = added.tracks.find((candidate) => candidate.id === added.id);
  const clip = track ? placeOn(audio, track, file, start, ctx) : null;
  if (!clip) return { error: `No room for this sound at ${formatTime(start)}.` };
  return { audio: withClip(audio, clip), tracks: added.tracks, track: added.id };
}

/**
 * A sound clip moved to a time (at least 0), on its track or another sound track.
 * @param audio the sound clips
 * @param id the clip's id
 * @param start its new start, seconds
 * @param ctx the context
 * @param track the track to move it to (missing: its own)
 * @returns the new clips, or why not
 */
export function moveSound<A extends AudioClip>(audio: A[], id: string, start: number, ctx: SoundCtx, track?: string): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const to = track ?? clip.track;
  const locked = ctx.locked(to);
  if (locked) return { error: locked };
  let moved = { ...clip, track: to, start: Math.max(0, start) };
  // Landing at or past the video's end, a toEnd clip would be 0 s long: it keeps the length it had (T072, option A).
  if (moved.toEnd && moved.start >= ctx.videoEnd - EPS) {
    const length = Math.max(SOUND_MIN, soundLength(clip, ctx.videoEnd, audio));
    moved = { ...moved, toEnd: false, out: Math.min(clip.srcDur, clip.in + length) };
  }
  const end = moved.start + soundLength(moved, ctx.videoEnd, audio);
  if (!isFree(audio, to, moved.start, end, ctx.videoEnd, id)) return { error: OVERLAP };
  return { audio: withClip(audio, moved) };
}

/**
 * A sound clip with its start edge moved by `by` seconds (its keys stay on the same sound).
 * @param clip the clip
 * @param by seconds (positive: later)
 * @param videoEnd the video's length
 * @param audio the sound clips (a `toEnd` clip stops at the next one on its track)
 * @returns the trimmed clip, or why not
 */
function trimStart<A extends AudioClip>(clip: A, by: number, videoEnd: number, audio: readonly AudioClip[]): A | Refusal {
  const room = soundLength(clip, videoEnd, audio) - SOUND_MIN;
  const step = Math.min(by, room);
  if (clip.in + step < -EPS) return { error: PAST_START };
  const keys = shiftKeys(clip.keys, -step);
  return { ...clip, start: clip.start + step, in: Math.max(0, clip.in + step), ...(keys ? { keys } : {}) };
}

/**
 * A sound clip with its end edge moved by `by` seconds; a `toEnd` clip gets a fixed end (Q7).
 * @param clip the clip
 * @param by seconds (positive: longer)
 * @param videoEnd the video's length
 * @param audio the sound clips (a `toEnd` clip stops at the next one on its track)
 * @returns the trimmed clip, or why not
 */
function trimEnd<A extends AudioClip>(clip: A, by: number, videoEnd: number, audio: readonly AudioClip[]): A | Refusal {
  const length = Math.max(SOUND_MIN, soundLength(clip, videoEnd, audio) + by);
  const out = clip.in + length;
  if (out > clip.srcDur + EPS) return { error: PAST_END };
  return { ...clip, out: Math.min(out, clip.srcDur), toEnd: false };
}

/**
 * A sound clip trimmed at one edge, within its file, never shorter than SOUND_MIN nor into its neighbour.
 * @param audio the sound clips
 * @param id the clip's id
 * @param edge which edge
 * @param by seconds the edge moves (positive: later)
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function trimSound<A extends AudioClip>(audio: A[], id: string, edge: 'start' | 'end', by: number, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const moved = edge === 'start' ? trimStart(clip, by, ctx.videoEnd, audio) : trimEnd(clip, by, ctx.videoEnd, audio);
  if ('error' in moved) return moved;
  const trimmed = fitFades(moved, ctx.videoEnd, audio);
  const end = trimmed.start + soundLength(trimmed, ctx.videoEnd, audio);
  if (!isFree(audio, clip.track, trimmed.start, end, ctx.videoEnd, id)) return { error: OVERLAP };
  return { audio: withClip(audio, trimmed) };
}

/**
 * A sound clip split at a time into two that play the same sound: the first keeps its fade-in, the second its fade-out
 * and `toEnd`; volume keys are split so nothing jumps at the cut.
 * @param audio the sound clips
 * @param id the clip's id
 * @param at the cut, timeline seconds (at least SOUND_MIN inside the clip)
 * @param newId the second part's id
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function splitSound<A extends AudioClip>(audio: A[], id: string, at: number, newId: string, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const local = at - clip.start;
  const length = soundLength(clip, ctx.videoEnd, audio);
  if (local < SOUND_MIN - EPS || local > length - SOUND_MIN + EPS) return { error: 'Put the playhead inside the sound to split it.' };
  const cut = clip.in + local;
  const [leftKeys, rightKeys] = splitKeys(clip.keys, local);
  // Each part takes only its own fade and keys: the cut itself is neither faded nor keyed.
  const rest: A = { ...clip };
  delete rest.fadeIn;
  delete rest.fadeOut;
  delete rest.keys;
  // A fade longer than its part is cut to the part (each fade stays no longer than its clip, AC-2).
  const fadeIn = Math.min(clip.fadeIn ?? 0, local);
  const fadeOut = Math.min(clip.fadeOut ?? 0, length - local);
  const left: A = { ...rest, out: cut, toEnd: false, ...(fadeIn ? { fadeIn } : {}), ...(leftKeys ? { keys: leftKeys } : {}) };
  const right: A = { ...rest, id: newId, start: at, in: cut, ...(fadeOut ? { fadeOut } : {}), ...(rightKeys ? { keys: rightKeys } : {}) };
  return { audio: withClip(audio, left, right) };
}

/**
 * A copy of a sound clip right after it on its track, when there is room.
 * @param audio the sound clips
 * @param id the clip's id
 * @param newId the copy's id
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function duplicateSound<A extends AudioClip>(audio: A[], id: string, newId: string, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const copy = { ...clip, id: newId, start: clip.start + soundLength(clip, ctx.videoEnd, audio) };
  if (!isFree(audio, clip.track, copy.start, copy.start + soundLength(copy, ctx.videoEnd, audio), ctx.videoEnd))
    return { error: 'No room right after this sound for a copy.' };
  return { audio: withClip(audio, copy) };
}

/**
 * A sound clip deleted.
 * @param audio the sound clips
 * @param id the clip's id
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function deleteSound<A extends AudioClip>(audio: A[], id: string, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  return { audio: audio.filter((other) => other !== clip) };
}


/**
 * A clip whose fades fit its length: when together they are longer, both shrink in proportion (a trim made it shorter).
 * @param clip the clip
 * @param videoEnd the video's length
 * @param audio the sound clips (a `toEnd` clip stops at the next one on its track)
 * @returns the clip (the same one when they fit)
 */
function fitFades<A extends AudioClip>(clip: A, videoEnd: number, audio: readonly AudioClip[]): A {
  const total = (clip.fadeIn ?? 0) + (clip.fadeOut ?? 0);
  const length = soundLength(clip, videoEnd, audio);
  if (total <= length + EPS) return clip;
  const scale = length / total;
  return {
    ...clip,
    ...(clip.fadeIn ? { fadeIn: clip.fadeIn * scale } : {}),
    ...(clip.fadeOut ? { fadeOut: clip.fadeOut * scale } : {}),
  };
}

/**
 * The clip touching a clip's start or end on its track.
 * @param audio the sound clips
 * @param clip the clip
 * @param side which edge
 * @param videoEnd the video's length
 * @returns the neighbour, or undefined
 */
function neighbour<A extends AudioClip>(audio: readonly A[], clip: A, side: 'before' | 'after', videoEnd: number): A | undefined {
  const edge = side === 'after' ? clip.start + soundLength(clip, videoEnd, audio) : clip.start;
  return audio.find((other) => {
    if (other.track !== clip.track || other.id === clip.id) return false;
    const touching = side === 'after' ? other.start : other.start + soundLength(other, videoEnd, audio);
    return Math.abs(touching - edge) < 1e-6;
  });
}

/**
 * A clip whose start moves by `by` seconds along its file: it starts later on the timeline and later in the file
 * (Roll's and Slide's right-hand clip); its keys stay on the same sound.
 * @param clip the clip
 * @param by seconds
 * @returns the clip, or why not
 */
function shiftStart<A extends AudioClip>(clip: A, by: number): A | Refusal {
  if (clip.in + by < -EPS) return { error: PAST_START };
  const keys = shiftKeys(clip.keys, -by);
  return { ...clip, start: clip.start + by, in: Math.max(0, clip.in + by), ...(keys ? { keys } : {}) };
}

/**
 * Slip (Q5): the clip plays another part of its file in the same place and length, kept within the file.
 * @param audio the sound clips
 * @param id the clip's id
 * @param by seconds later in the file (negative: earlier)
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function slipSound<A extends AudioClip>(audio: A[], id: string, by: number, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const length = soundLength(clip, ctx.videoEnd, audio);
  const inPoint = Math.min(Math.max(0, clip.srcDur - length), Math.max(0, clip.in + by));
  const slipped: A = clip.toEnd ? { ...clip, in: inPoint } : { ...clip, in: inPoint, out: inPoint + length };
  return { audio: withClip(audio, slipped) };
}

/**
 * Roll (Q5): the cut between a clip and the one right after it on its track moves; the first ends later in its file,
 * the second starts later in its own, so the track's length doesn't change.
 * @param audio the sound clips
 * @param id the first clip's id
 * @param by seconds the cut moves (positive: later)
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function rollSound<A extends AudioClip>(audio: A[], id: string, by: number, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const next = neighbour(audio, clip, 'after', ctx.videoEnd);
  if (!next) return { error: 'Roll needs a sound right after this one on its track.' };
  const lengths = [soundLength(clip, ctx.videoEnd, audio) + by, soundLength(next, ctx.videoEnd, audio) - by];
  if (Math.min(...lengths) < SOUND_MIN - EPS) return { error: TOO_SHORT };
  const left = trimEnd(clip, by, ctx.videoEnd, audio);
  if ('error' in left) return left;
  const right = shiftStart(next, by);
  if ('error' in right) return right;
  return { audio: withClip(withClip(audio, fitFades(left, ctx.videoEnd, audio)), fitFades(right, ctx.videoEnd, audio)) };
}

/**
 * The clip with an edge trimmed in place for Ripple: its start stays on the timeline (a start trim takes the sound off
 * its front instead), never shorter than SOUND_MIN.
 * @param clip the clip
 * @param edge which edge
 * @param by seconds the edge moves (positive: later)
 * @param videoEnd the video's length
 * @param audio the sound clips (a `toEnd` clip stops at the next one on its track)
 * @returns the trimmed clip, or why not
 */
function rippleTrimmed<A extends AudioClip>(clip: A, edge: 'start' | 'end', by: number, videoEnd: number, audio: readonly AudioClip[]): A | Refusal {
  if (edge === 'end') return trimEnd(clip, by, videoEnd, audio);
  const step = Math.min(by, soundLength(clip, videoEnd, audio) - SOUND_MIN);
  if (clip.in + step < -EPS) return { error: PAST_START };
  const keys = shiftKeys(clip.keys, -step);
  return { ...clip, in: Math.max(0, clip.in + step), ...(keys ? { keys } : {}) };
}

/**
 * Ripple (Q5): an edge trimmed and every later clip on the same track moved by the change, so the gaps after it keep
 * their lengths; other tracks don't move.
 * @param audio the sound clips
 * @param id the clip's id
 * @param edge which edge
 * @param by seconds the edge moves (positive: later)
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function rippleSound<A extends AudioClip>(audio: A[], id: string, edge: 'start' | 'end', by: number, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const trimmed = rippleTrimmed(clip, edge, by, ctx.videoEnd, audio);
  if ('error' in trimmed) return trimmed;
  const oldEnd = clip.start + soundLength(clip, ctx.videoEnd, audio);
  const change = soundLength(trimmed, ctx.videoEnd, audio) - soundLength(clip, ctx.videoEnd, audio);
  const moved = audio.map((other) => {
    if (other.id === id) return fitFades(trimmed, ctx.videoEnd, audio);
    const later = other.track === clip.track && other.start >= oldEnd - EPS;
    return later ? { ...other, start: other.start + change } : other;
  });
  return { audio: moved.toSorted((first, second) => first.start - second.start) };
}

/**
 * Slide (Q5): a clip moves between the clips touching it on both sides, playing the same sound; the one before ends
 * later in its file and the one after starts later in its own, so the track's length doesn't change.
 * @param audio the sound clips
 * @param id the clip's id
 * @param by seconds it moves (positive: later)
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function slideSound<A extends AudioClip>(audio: A[], id: string, by: number, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  const before = neighbour(audio, clip, 'before', ctx.videoEnd);
  const after = neighbour(audio, clip, 'after', ctx.videoEnd);
  if (!before || !after) return { error: 'Slide needs sounds right before and after this one on its track.' };
  const lengths = [soundLength(before, ctx.videoEnd, audio) + by, soundLength(after, ctx.videoEnd, audio) - by];
  if (Math.min(...lengths) < SOUND_MIN - EPS) return { error: TOO_SHORT };
  const left = trimEnd(before, by, ctx.videoEnd, audio);
  if ('error' in left) return left;
  const right = shiftStart(after, by);
  if ('error' in right) return right;
  const slid = withClip(withClip(audio, fitFades(left, ctx.videoEnd, audio)), fitFades(right, ctx.videoEnd, audio));
  return { audio: withClip(slid, { ...clip, start: clip.start + by }) };
}

/** A clip's fades to set, seconds; 0 (or less) removes one. */
export type FadeChange = Pick<AudioClip, 'fadeIn' | 'fadeOut'>;

/**
 * A sound clip's fades set (AC-2): each 0–FADE_MAX s, together not longer than the clip.
 * @param audio the sound clips
 * @param id the clip's id
 * @param change the fades to set
 * @param ctx the context
 * @returns the new clips, or why not
 */
export function setFades<A extends AudioClip>(audio: A[], id: string, change: FadeChange, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  if (Math.max(change.fadeIn ?? 0, change.fadeOut ?? 0) > FADE_MAX + EPS) return { error: `A fade can be up to ${FADE_MAX} s.` };
  const next: A = { ...clip };
  if (change.fadeIn !== undefined) {
    if (change.fadeIn > 0) next.fadeIn = change.fadeIn;
    else delete next.fadeIn;
  }
  if (change.fadeOut !== undefined) {
    if (change.fadeOut > 0) next.fadeOut = change.fadeOut;
    else delete next.fadeOut;
  }
  if ((next.fadeIn ?? 0) + (next.fadeOut ?? 0) > soundLength(next, ctx.videoEnd, audio) + EPS)
    return { error: 'The fades would be longer than the sound: shorten one first.' };
  return { audio: withClip(audio, next) };
}

/**
 * **Play to the end of the video** (Q7): on, the clip plays from its start to the video's end or to the next sound on
 * its track, whichever is first (T072, option A), capped by its file; off, it keeps the length it had as a fixed out
 * point.
 * @param audio the sound clips
 * @param id the clip's id
 * @param on the switch
 * @param ctx the context
 * @returns the new clips (the same array when nothing changes), or why not
 */
export function setToEnd<A extends AudioClip>(audio: A[], id: string, on: boolean, ctx: SoundCtx): SoundEdit<A> {
  const clip = editable(audio, id, ctx);
  if ('error' in clip) return clip;
  if (clip.toEnd === on) return { audio };
  if (!on) {
    const length = Math.max(SOUND_MIN, soundLength(clip, ctx.videoEnd, audio));
    return { audio: withClip(audio, { ...clip, toEnd: false, out: Math.min(clip.srcDur, clip.in + length) }) };
  }
  const next: A = { ...clip, toEnd: true };
  delete next.out;
  return { audio: withClip(audio, fitFades(next, ctx.videoEnd, audio)) };
}
