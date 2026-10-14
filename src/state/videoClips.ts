import type { Adjustments } from '../engine/adjust';
import { NOT_FOUND, TOO_LONG, closeGap, lift, moveTo, moveToTrack, nudge, reorder, rippleDelete, roll, slide, slip, trim, type Edit } from '../engine/edits';
import type { IgEdit } from '../engine/instagram';
import { splitKeys } from '../engine/keyframes';
import { clipLength, gaps } from '../engine/timeline';
import { MAIN_VIDEO } from '../engine/tracks';
import { browserNote, clipLocked, commit, editCtx, getVideo, lengthOf, limitText, limits, newId, projectOf, total, type VClip, type VState } from './videoStore';

/*
 * Clip actions: changing a clip, removing, moving, duplicating and splitting it, and the timeline's edit tools (202:
 * ripple delete, trim, roll, slip, slide, nudge, moving to a time or another track). Each is one undo step. They are
 * refused on a locked track; the `…Why` forms and the edit tools return the message to show (null when done).
 */

/**
 * Where a track's clips end.
 * @param clips the clips
 * @param track the track
 * @returns seconds (0 for an empty track)
 */
export const endOn = (clips: VClip[], track: string): number => clips.reduce((end, clip) => (clip.track === track ? Math.max(end, clip.start + clipLength(clip)) : end), 0);

/**
 * The clips with one added in its track's start order (after its track's last clip when it starts last).
 * @param clips the clips
 * @param added the clip to add
 * @returns a new list
 */
export function insertOnTrack(clips: VClip[], added: VClip): VClip[] {
  let index = clips.findIndex((clip) => clip.track === added.track && clip.start > added.start);
  if (index < 0) index = clips.findLastIndex((clip) => clip.track === added.track) + 1 || clips.length;
  return [...clips.slice(0, index), added, ...clips.slice(index)];
}

/**
 * The undo key for a change of some fields.
 * @param prefix what is changed and the item's id
 * @param patch the fields
 * @returns e.g. "clip:v1:dur,volume"
 */
const keyFor = (prefix: string, patch: object): string => `${prefix}:${Object.keys(patch).sort((first, second) => first.localeCompare(second)).join(',')}`;

/**
 * Changes a clip as updateClip does, saying why when it can't.
 * @param id the clip
 * @param patch the fields to change
 * @param key groups changes into one undo step (a slider's drag)
 * @returns null once changed; else why not: its track is locked, the video would be longer than this platform's
 *   limit, or the change would put more videos on screen at once than allowed
 */
export function updateClipWhy(id: string, patch: Partial<VClip>, key = keyFor(`clip:${id}`, patch)): string | null {
  const locked = clipLocked(id);
  if (locked) return locked;
  const clips = getVideo().clips.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip));
  const maxSeconds = limits().seconds;
  if (lengthOf(clips) - maxSeconds > 0.01) return `A video can be up to ${limitText(maxSeconds)} long here.`;
  return commit(key, { clips });
}

/**
 * Changes a clip.
 * @param id the clip
 * @param patch the fields to change
 * @param key groups changes into one undo step
 * @returns false when refused: its track is locked or it would make the video longer than this project allows
 */
export function updateClip(id: string, patch: Partial<VClip>, key = keyFor(`clip:${id}`, patch)): boolean {
  return updateClipWhy(id, patch, key) === null;
}

/**
 * Changes a clip's framing (crop, rotation, look).
 * @param id the clip
 * @param patch the framing to change
 */
export const editClip = (id: string, patch: Partial<IgEdit>): void => {
  const clip = getVideo().clips.find((candidate) => candidate.id === id);
  if (clip) updateClip(id, { edit: { ...clip.edit, ...patch } }, keyFor(`clipedit:${id}`, patch));
};

/**
 * Changes a clip's colour settings.
 * @param id the clip
 * @param patch the settings to change
 */
export const adjustClip = (id: string, patch: Partial<Adjustments>): void => {
  const clip = getVideo().clips.find((candidate) => candidate.id === id);
  if (clip) updateClip(id, { edit: { ...clip.edit, adjust: { ...clip.edit.adjust, ...patch } } }, keyFor(`clipadjust:${id}`, patch));
};

/**
 * Removes a clip: with Magnetic on, the main track's later clips close up; an overlay clip is lifted (203 Q8). The
 * object URL is kept while the clip can still come back through undo; it goes when the page closes.
 * @param id the clip
 * @returns false when refused
 */
export function removeClip(id: string): boolean {
  const video = getVideo();
  const index = video.clips.findIndex((clip) => clip.id === id);
  const removed = video.clips.at(index);
  if (index < 0 || !removed || clipLocked(id)) return false;
  const ripple = video.magnetic && removed.track === MAIN_VIDEO;
  const result = (ripple ? rippleDelete : lift)(video.clips, id, editCtx());
  if ('error' in result) return false;
  const clips = result.clips;
  return commit('', { clips }, { selected: video.selected === id ? (clips.at(Math.min(index, clips.length - 1))?.id ?? null) : video.selected }) === null;
}

/**
 * Moves a main-track clip to a new place in its track's order (dragging on the timeline).
 * @param id the clip
 * @param index its new place
 * @returns false when refused or nothing moved
 */
export function moveClipTo(id: string, index: number): boolean {
  if (clipLocked(id)) return false;
  const video = getVideo();
  const result = reorder(video.clips, id, index, editCtx());
  if ('error' in result || result.clips === video.clips) return false;
  return commit('', { clips: result.clips }) === null;
}

/**
 * Moves a clip one place earlier or later among its track's clips (the main track with Magnetic on).
 * @param id the clip
 * @param by earlier (-1) or later (1)
 * @returns false when refused or nothing moved
 */
export function moveClip(id: string, by: -1 | 1): boolean {
  const { clips } = getVideo();
  const clip = clips.find((candidate) => candidate.id === id);
  const index = clips.filter((candidate) => candidate.track === clip?.track).findIndex((candidate) => candidate.id === id);
  return moveClipTo(id, index + by);
}

/**
 * The clips with a copy placed off the main track (D2; overlay tracks always): into the first gap after the original
 * that fits, or after its track's last clip; nothing else moves.
 * @param clip the original
 * @param copy its copy, placed here
 * @returns the clips, or why not (too long)
 */
function placeCopy(clip: VClip, copy: VClip): VClip[] | string {
  const length = clipLength(clip);
  const room = gaps(projectOf(), clip.track).find((gap) => gap.start >= copy.start - 1e-9 && gap.end - gap.start >= length - 1e-6);
  copy.start = room ? room.start : endOn(getVideo().clips, clip.track);
  const seconds = limits().seconds;
  // The main track keeps 202's check (the video grows by the copy at most); elsewhere the copy's own end counts.
  const tooLong = clip.track === MAIN_VIDEO ? total() + length > seconds : Math.max(total(), copy.start + length) > seconds + 0.01;
  return tooLong ? TOO_LONG : insertOnTrack(getVideo().clips, copy);
}

/**
 * A copy of a clip right after it (Magnetic on, the main track), else into the first gap after it that fits.
 * @param id the clip
 * @returns null once copied, else why not
 */
export function duplicateClipWhy(id: string): string | null {
  const video = getVideo();
  const index = video.clips.findIndex((clip) => clip.id === id);
  const clip = video.clips.at(index);
  if (index < 0 || !clip) return NOT_FOUND;
  const limit = limits();
  const locked = clipLocked(id);
  if (locked) return locked;
  if (video.clips.length >= limit.clips) return `A project holds up to ${limit.clips} clips${browserNote()}.`;
  const copy: VClip = { ...clip, id: newId(), fade: false, start: clip.start + clipLength(clip) };
  let clips: VClip[];
  if (video.magnetic && clip.track === MAIN_VIDEO) {
    if (total() + clipLength(clip) > limit.seconds) return TOO_LONG;
    clips = video.clips.slice();
    clips.splice(index + 1, 0, copy);
  } else {
    const placed = placeCopy(clip, copy);
    if (typeof placed === 'string') return placed;
    clips = placed;
  }
  return commit('', { clips }, { selected: copy.id });
}

/**
 * A copy of a clip, as duplicateClipWhy makes it.
 * @param id the clip
 * @returns false when refused
 */
export const duplicateClip = (id: string): boolean => duplicateClipWhy(id) === null;

/**
 * Which clip a split takes first: the main track (0), then the overlay tracks from the top one down.
 * @param clip a clip
 * @returns its rank, lower first
 */
const trackRank = (clip: VClip): number => {
  const { tracks } = getVideo();
  return clip.track === MAIN_VIDEO ? 0 : tracks.length - tracks.findIndex((track) => track.id === clip.track);
};

/**
 * The two parts of a clip cut at a time. Each part keeps its keyframes, with one at the cut holding the value there
 * (205 AC-3); the clip's own transition (206) is at its end, so it goes with the right part.
 * @param clip the clip
 * @param local the cut, seconds from its start
 * @returns the left and right parts
 */
function splitClip(clip: VClip, local: number): [VClip, VClip] {
  const [keysLeft, keysRight] = splitKeys(clip.keys, local);
  const keys = (part: VClip['keys']): Partial<VClip> => (clip.keys ? { keys: part } : {});
  const { transition, ...left } = clip;
  const outgoing = transition ? { transition } : {};
  const start = clip.start + local;
  if (clip.kind === 'video') return [{ ...left, out: clip.in + local, ...keys(keysLeft) }, { ...left, id: newId(), start, in: clip.in + local, fade: false, ...keys(keysRight), ...outgoing }];
  return [{ ...left, dur: local, ...keys(keysLeft) }, { ...left, id: newId(), start, dur: clipLength(clip) - local, fade: false, ...keys(keysRight), ...outgoing }];
}

/**
 * Splits the clip under the playhead into two clips (not on a locked track): the selected clip when the playhead is
 * inside it (an overlay clip, 203), else the main track's clip there, else the topmost overlay clip there.
 * @returns null once split, else why not
 */
export function splitAtPlayheadWhy(): string | null {
  const video = getVideo();
  const inside = (clip: VClip): boolean => video.t > clip.start + 0.2 && video.t < clip.start + clipLength(clip) - 0.2;
  const selected = video.clips.find((clip) => clip.id === video.selected && inside(clip));
  const clip = selected ?? video.clips.filter(inside).sort((first, second) => trackRank(first) - trackRank(second)).at(0);
  if (!clip) return 'Put the playhead inside a clip, away from its ends, to split it.';
  const locked = clipLocked(clip.id);
  if (locked) return locked;
  const [left, right] = splitClip(clip, video.t - clip.start);
  const clips = video.clips.slice();
  clips.splice(video.clips.indexOf(clip), 1, left, right);
  return commit('', { clips }, { selected: right.id });
}

/**
 * Splits the clip under the playhead, as splitAtPlayheadWhy does.
 * @returns false when refused
 */
export const splitAtPlayhead = (): boolean => splitAtPlayheadWhy() === null;

/* ---------- edit tools (202): each returns null, or why it was refused ---------- */

/**
 * Applies an edit's result as one undo step; nothing is recorded when nothing changed. Checked again on what is stored
 * (packed with Magnetic on) against the videos-at-once limit.
 * @param result the edit's result
 * @param key groups a drag's changes into one step
 * @param extra other fields to change with it
 * @returns null, or why not
 */
function apply(result: Edit<VClip>, key = '', extra: Partial<VState> = {}): string | null {
  if ('error' in result) return result.error;
  return result.clips === getVideo().clips ? null : commit(key, { clips: result.clips }, extra);
}

/**
 * Shift + Delete: removes a clip and pulls the later ones on its track back, with Magnetic on or off.
 * @param id the clip
 * @returns null, or why not
 */
export function rippleDeleteClip(id: string): string | null {
  const video = getVideo();
  const track = video.clips.find((clip) => clip.id === id)?.track;
  const index = video.clips.filter((clip) => clip.track === track).findIndex((clip) => clip.id === id);
  const result = rippleDelete(video.clips, id, editCtx());
  const left = 'clips' in result ? result.clips.filter((clip) => clip.track === track) : [];
  const next = left.at(Math.min(index, left.length - 1))?.id ?? null;
  return apply(result, '', { selected: video.selected === id ? next : video.selected });
}

/**
 * Moves one edge of a clip; with Magnetic on, or `ripple` (Shift), the later clips follow.
 * @param id the clip
 * @param side which edge
 * @param delta seconds
 * @param options ripple: the later clips follow
 * @param options.ripple whether the later clips follow
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function trimClip(id: string, side: 'start' | 'end', delta: number, options: { ripple?: boolean } = {}, key = ''): string | null {
  const video = getVideo();
  return apply(trim(video.clips, id, side, delta, { ripple: video.magnetic || !!options.ripple }, editCtx()), key);
}

/**
 * Magnetic off: puts a clip at a time, or the nearest free spot where it fits.
 * @param id the clip
 * @param start the time
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export const moveClipToTime = (id: string, start: number, key = ''): string | null => apply(moveTo(getVideo().clips, id, start, editCtx()), key);

/**
 * Roll: moves the cut at a clip's end, trimming both sides.
 * @param id the clip before the cut
 * @param delta seconds
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export const rollClip = (id: string, delta: number, key = ''): string | null => apply(roll(getVideo().clips, id, delta, editCtx()), key);

/**
 * Slip: moves the part of a video used, keeping the clip's place and length.
 * @param id the clip
 * @param delta seconds
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export const slipClip = (id: string, delta: number, key = ''): string | null => apply(slip(getVideo().clips, id, delta, editCtx()), key);

/**
 * Slide: moves a clip between its neighbours, trimming them.
 * @param id the clip
 * @param delta seconds
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export const slideClip = (id: string, delta: number, key = ''): string | null => apply(slide(getVideo().clips, id, delta, editCtx(), getVideo().magnetic), key);

/**
 * Alt + ← / → (Q5): nudges a clip by frames at the project's frame rate with the current tool.
 * @param id the clip
 * @param frames how many, signed
 * @returns null, or why not
 */
export const nudgeClip = (id: string, frames: number): string | null => {
  const video = getVideo();
  return apply(nudge(video.clips, id, video.tool, frames, video.fps, video.magnetic, editCtx()), `nudge:${video.tool}:${id}`);
};

/**
 * Q / W: ripple-trims the selected clip's start / end to the playhead.
 * @param side which edge
 * @returns null, or why not
 */
export function rippleTrimToPlayhead(side: 'start' | 'end'): string | null {
  const video = getVideo();
  const clip = video.clips.find((candidate) => candidate.id === video.selected);
  if (!clip) return 'Select a clip first.';
  const end = clip.start + clipLength(clip);
  if (!(video.t > clip.start && video.t < end)) return 'Put the playhead inside the clip first.';
  return apply(trim(video.clips, clip.id, side, video.t - (side === 'start' ? clip.start : end), { ripple: true }, editCtx()), '', side === 'start' ? { t: clip.start } : {});
}

/**
 * Closes the gap at a time on the main track (a selected gap's Delete).
 * @param at the time
 * @returns null, or why not
 */
export const deleteGap = (at: number): string | null => apply(closeGap(getVideo().clips, at, editCtx()));

/**
 * Moves a clip to another picture track (or along its own), as moveToTrack does (203 AC-3): never over another clip;
 * onto the main track with Magnetic on, inserted where it falls.
 * @param id the clip
 * @param track the picture track
 * @param start the time (default: where it is)
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function moveClipToTrack(id: string, track: string, start?: number, key = ''): string | null {
  const video = getVideo();
  const clip = video.clips.find((candidate) => candidate.id === id);
  if (!clip) return NOT_FOUND;
  const target = video.tracks.find((candidate) => candidate.id === track);
  if (!target || (target.kind !== 'video' && target.kind !== 'overlay')) return 'A clip can only move to a picture track.';
  return apply(moveToTrack(video.clips, id, track, start ?? clip.start, { ...editCtx(), magnetic: video.magnetic }), key, { selected: id });
}
