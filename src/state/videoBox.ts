import { NOT_FOUND } from '../engine/edits';
import { keysOf } from '../engine/guards';
import { countKeys, isAnimated, setKey, transformAt, type ClipKeyProp, type Keyframes } from '../engine/keyframes';
import { clampTransform, IDENTITY, isIdentity, presetTransform, type ClipTransform, type Preset } from '../engine/timeline';
import { vFormat } from '../engine/videoFormats';
import { updateClipWhy } from './videoClips';
import { keyClip, keyEdit, projectKeyCount } from './videoKeys';
import { change, clipLocked, getVideo, type VClip } from './videoStore';

/*
 * A clip's place in the frame (203) and its sound: the box (position, size, rotation, opacity, corner radius) and the
 * volume, stored, or keyed at the playhead when animated (205). Each change is one undo step per `key`.
 */

/**
 * The undo key for a change of some box fields.
 * @param id the clip
 * @param patch the fields
 * @returns e.g. "tf:v1:x,y"
 */
const boxKey = (id: string, patch: Partial<ClipTransform>): string => `tf:${id}:${Object.keys(patch).sort((first, second) => first.localeCompare(second)).join(',')}`;

/**
 * Whether two boxes are the same.
 * @param stored a clip's stored box (missing = the whole frame)
 * @param next the new box (missing = the whole frame)
 * @returns true when nothing would change
 */
function sameBox(stored: ClipTransform | undefined, next: ClipTransform | undefined): boolean {
  if (isIdentity(stored)) return !next;
  return !!stored && !!next && keysOf(next).every((field) => stored[field] === next[field]);
}

/**
 * Changes a clip's box, clamped to the ranges; one undo step per `key` within 800 ms, so a drag passing the same key
 * is one step. The whole frame is stored as no transform.
 * @param id the clip
 * @param patch the box fields to change
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function setClipTransform(id: string, patch: Partial<ClipTransform>, key = boxKey(id, patch)): string | null {
  const video = getVideo();
  const clip = video.clips.find((candidate) => candidate.id === id);
  if (!clip) return NOT_FOUND;
  const locked = clipLocked(id);
  if (locked) return locked;
  const transform = clampTransform({ ...(clip.tf ?? IDENTITY), ...patch });
  const next = isIdentity(transform) ? undefined : transform;
  if (sameBox(clip.tf, next)) return null;
  change(key, { clips: video.clips.map((candidate) => (candidate.id === id ? { ...candidate, tf: next } : candidate)) });
  return null;
}

/** A clip's keys and stored box after a change shown at the playhead. */
interface KeyedBox {
  keys: Keyframes<ClipKeyProp>;
  stored: Partial<ClipTransform>;
}

/**
 * The keys and stored fields for a box change shown at the playhead: animated values get a key, the others are stored.
 * @param clip the clip, animated
 * @param keys its keys
 * @param local the playhead, seconds from its start
 * @param patch the box fields to change
 * @returns the new keys and stored fields, or why not
 */
function keyedBox(clip: VClip, keys: Keyframes<ClipKeyProp>, local: number, patch: Partial<ClipTransform>): KeyedBox | { error: string } {
  const shown = transformAt(clip, local);
  const want = clampTransform({ ...shown, ...patch });
  let next = keys;
  const stored: Partial<ClipTransform> = {};
  for (const prop of keysOf(patch)) {
    if (!(prop in want) || want[prop] === shown[prop]) continue;
    if (!isAnimated(clip, prop)) {
      stored[prop] = want[prop];
      continue;
    }
    const added = setKey(next, prop, local, want[prop], { ...keyEdit(clip), projectKeys: projectKeyCount() + countKeys(next) - countKeys(keys) });
    if ('error' in added) return added;
    next = added;
  }
  return { keys: next, stored };
}

/**
 * Changes a clip's box as shown at the playhead (the stage's drag and arrows, the inspector's fields): an animated value
 * gets a key at the playhead (Q4, auto-key), the others change the stored box as `setClipTransform` does.
 * @param id the clip
 * @param patch the box fields to change
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function setClipTransformAt(id: string, patch: Partial<ClipTransform>, key = boxKey(id, patch)): string | null {
  const found = keyClip(id);
  if ('error' in found) return found.error;
  const clip = found.item;
  if (!clip.keys) return setClipTransform(id, patch, key);
  const result = keyedBox(clip, clip.keys, found.local, patch);
  if ('error' in result) return result.error;
  if (result.keys === clip.keys && Object.keys(result.stored).length === 0) return null;
  const transform = clampTransform({ ...(clip.tf ?? IDENTITY), ...result.stored });
  change(key, { clips: getVideo().clips.map((candidate) => (candidate.id === id ? { ...candidate, tf: isIdentity(transform) ? undefined : transform, keys: result.keys } : candidate)) });
  return null;
}

/**
 * Puts a clip's box full frame or in a corner (35 % of the frame width, 4 % margin; Q4) of this project's frame,
 * upright; its opacity and corner radius stay (one undo step). Through setClipTransformAt: an animated value gets a key
 * at the playhead (205).
 * @param id the clip
 * @param preset full frame or a corner
 * @returns null, or why not
 */
export function applyPreset(id: string, preset: Preset): string | null {
  const format = vFormat(getVideo().format);
  const { x, y, w, rot } = presetTransform(preset, format.w, format.h);
  return setClipTransformAt(id, { x, y, w, rot }, '');
}

/**
 * A clip's own sound: a key at the playhead when its volume is animated, else the stored volume.
 * @param id the clip
 * @param volume 0–1
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function setClipVolume(id: string, volume: number, key = `clip:${id}:volume`): string | null {
  const found = keyClip(id);
  if ('error' in found) return found.error;
  const clip = found.item;
  if (!isAnimated(clip, 'volume')) return updateClipWhy(id, { volume }, key);
  const keys = setKey(clip.keys, 'volume', found.local, volume, keyEdit(clip));
  if ('error' in keys) return keys.error;
  change(key, { clips: getVideo().clips.map((candidate) => (candidate.id === id ? { ...candidate, keys } : candidate)) });
  return null;
}
