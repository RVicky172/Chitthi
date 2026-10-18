import { NOT_FOUND } from '../engine/edits';
import { RAMP_LIMITS, RAMP_POINT_GAP, RAMP_PRESETS, SPEED_LIMITS, rampPointRange, rampSpeedAt, type RampPoint, type RampPreset } from '../engine/speed';
import { freezeFrame, setSpeed, type SpeedChange, type SpeedCtx, type SpeedEdit } from '../engine/speedEdits';
import { clipLength } from '../engine/timeline';
import { MAIN_VIDEO } from '../engine/tracks';
import { commit, editCtx, getVideo, newId, type VClip, type VState } from './videoStore';

/*
 * Speed actions (207 plan §6, AC-8): a clip's speed, reverse, ramp and its points, Reset speed, and Freeze frame. Each
 * is one undo step (a slider or point drag passes one key, so it coalesces into one), and gives back why it was refused
 * (nothing changes then) or a note to tell the user (a ramp dropped for reverse, a transition shortened).
 */

/** What a speed action did: refused with the reason, or done, with a note for the user when there is one. */
export type SpeedOutcome = { error: string } | { note?: string };

const NO_RAMP = 'This clip has no speed ramp: choose one first.';
const NO_POINT = 'That ramp point isn’t there.';
const ENDS_STAY = 'The first and last points of a ramp stay.';
const TOO_MANY = `A ramp has at most ${RAMP_LIMITS.maxPoints} points.`;
const TOO_CLOSE = 'There is already a point there.';
const NO_VIDEO = 'Put the playhead on a video clip to freeze its frame.';

/**
 * The context speed edits check against: the edit limits, Magnetic and the frame rate.
 * @returns the context
 */
const speedCtx = (): SpeedCtx => ({ ...editCtx(), magnetic: getVideo().magnetic, fps: getVideo().fps });

/**
 * Stores a speed edit as one undo step.
 * @param result the edit
 * @param key groups a drag's changes into one step
 * @param extra other state to set with it
 * @returns what happened
 */
function applySpeed(result: SpeedEdit<VClip>, key = '', extra: Partial<VState> = {}): SpeedOutcome {
  if ('error' in result) return { error: result.error };
  if (result.clips === getVideo().clips) return {};
  const refused = commit(key, { clips: result.clips }, extra);
  if (refused) return { error: refused };
  return result.note ? { note: result.note } : {};
}

/**
 * Changes a clip's speed, reverse or ramp.
 * @param id the clip
 * @param change the change
 * @param key groups a drag's changes into one step
 * @returns what happened
 */
const changeSpeed = (id: string, change: SpeedChange, key = ''): SpeedOutcome =>
  applySpeed(setSpeed(getVideo().clips, id, change, speedCtx()), key);

/**
 * Sets a clip's constant speed (dropping a ramp): its in and out stay, its length changes (Q2).
 * @param id the clip
 * @param speed 0.1–10
 * @param key groups a slider drag into one step
 * @returns what happened
 */
export const setClipSpeed = (id: string, speed: number, key = `speed:${id}`): SpeedOutcome => changeSpeed(id, { speed }, key);

/**
 * Turns reverse on or off (on drops a ramp, and says so, Q7).
 * @param id the clip
 * @param reverse on or off
 * @returns what happened
 */
export const setClipReverse = (id: string, reverse: boolean): SpeedOutcome => changeSpeed(id, { reverse });

/**
 * Gives a clip a ramp: a preset (Q6) or points (turns reverse off, and says so, Q7).
 * @param id the clip
 * @param ramp a preset's name, or the points
 * @returns what happened
 */
export const setClipRamp = (id: string, ramp: RampPreset | readonly RampPoint[]): SpeedOutcome =>
  changeSpeed(id, { ramp: typeof ramp === 'string' ? RAMP_PRESETS[ramp].map((point) => ({ ...point })) : ramp });

/**
 * Reset speed: back to 1× forwards, no ramp.
 * @param id the clip
 * @returns what happened
 */
export const resetSpeed = (id: string): SpeedOutcome => changeSpeed(id, { reset: true });

/**
 * A ramped clip, or why there is none.
 * @param id the clip
 * @returns the clip and its points, or the reason
 */
function rampOf(id: string): { clip: VClip; points: readonly RampPoint[] } | { error: string } {
  const clip = getVideo().clips.find((candidate) => candidate.id === id);
  if (!clip) return { error: NOT_FOUND };
  return clip.ramp ? { clip, points: clip.ramp } : { error: NO_RAMP };
}

/**
 * Changes a ramped clip's points, keeping its span (D-050).
 * @param clip the clip
 * @param points the new points
 * @param key groups a drag into one step
 * @returns what happened
 */
const changePoints = (clip: VClip, points: readonly RampPoint[], key = ''): SpeedOutcome =>
  changeSpeed(clip.id, { ramp: points, ...(clip.rampSpan ? { rampSpan: clip.rampSpan } : {}) }, key);

/**
 * Moves a ramp point: its place stays between its neighbours (the end points stay at 0 and 1), its speed within
 * 0.1–10×.
 * @param id the clip
 * @param index the point
 * @param point where it goes: a share of the clip and a speed
 * @param key groups a drag into one step
 * @returns what happened
 */
export function moveRampPoint(id: string, index: number, point: RampPoint, key = `ramp:${id}:${index}`): SpeedOutcome {
  const found = rampOf(id);
  if ('error' in found) return found;
  const { clip, points } = found;
  if (!points[index]) return { error: NO_POINT };
  const [low, high] = rampPointRange(points, index);
  const at = Math.min(high, Math.max(low, point.at));
  const speed = Math.min(SPEED_LIMITS.max, Math.max(SPEED_LIMITS.min, point.v));
  return changePoints(clip, points.map((old, place) => (place === index ? { at, v: speed } : old)), key);
}

/**
 * Adds a ramp point at a place, at the speed the curve has there (at most 10 points).
 * @param id the clip
 * @param at a share of the clip
 * @returns what happened
 */
export function addRampPoint(id: string, at: number): SpeedOutcome {
  const found = rampOf(id);
  if ('error' in found) return found;
  const { clip, points } = found;
  if (points.length >= RAMP_LIMITS.maxPoints) return { error: TOO_MANY };
  const place = Math.min(1 - RAMP_POINT_GAP, Math.max(RAMP_POINT_GAP, at));
  if (points.some((point) => Math.abs(point.at - place) < RAMP_POINT_GAP)) return { error: TOO_CLOSE };
  const added = [...points, { at: place, v: rampSpeedAt(points, place) }].sort((left, right) => left.at - right.at);
  return changePoints(clip, added);
}

/**
 * Removes a ramp point (not the first or last).
 * @param id the clip
 * @param index the point
 * @returns what happened
 */
export function removeRampPoint(id: string, index: number): SpeedOutcome {
  const found = rampOf(id);
  if ('error' in found) return found;
  const { clip, points } = found;
  if (!points[index]) return { error: NO_POINT };
  if (index === 0 || index === points.length - 1) return { error: ENDS_STAY };
  return changePoints(clip, points.filter((_, place) => place !== index));
}

/**
 * Freeze frame (Shift + F, Q10): a 2 s still of the frame at the playhead, of the selected video clip under it, else
 * the main track's, else the topmost overlay track's. Selects the still.
 * @returns what happened
 */
export function freezeFrameAtPlayhead(): SpeedOutcome {
  const video = getVideo();
  const under = (clip: VClip) => clip.kind === 'video' && video.t >= clip.start && video.t < clip.start + clipLength(clip);
  const rank = (clip: VClip) => (clip.track === MAIN_VIDEO ? -1 : -video.tracks.findIndex((track) => track.id === clip.track));
  const candidates = video.clips.filter(under).sort((first, second) => rank(first) - rank(second));
  const clip = candidates.find((candidate) => candidate.id === video.selected) ?? candidates.at(0);
  if (!clip) return { error: NO_VIDEO };
  let still = '';
  const ids = () => {
    const id = newId();
    still ||= id;
    return id;
  };
  const result = freezeFrame(video.clips, clip.id, video.t - clip.start, speedCtx(), ids);
  return applySpeed(result, '', { selected: still });
}
