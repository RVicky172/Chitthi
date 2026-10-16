import { NOT_FOUND } from '../engine/edits';
import { keysOf } from '../engine/guards';
import {
  countKeys,
  isAnimated,
  isClipKeyProp,
  isLayerKeyProp,
  moveKey,
  removeKey,
  setEase,
  setKey,
  stopAnimating,
  valueOf,
  type ClipKeyProp,
  type Ease,
  type KeyEdit,
  type Keyframes,
  type LayerKeyProp,
} from '../engine/keyframes';
import type { Layer } from '../engine/layers';
import { isIdentity } from '../engine/timeline';
import { change, clipLocked, getVideo, type VClip } from './videoStore';

/*
 * Keyframe actions (205) on a clip or a layer: the inspector's keyframe button, Remove animation, and the timeline's
 * key moves, eases and deletes. Each is one undo step and returns null, or why it was refused. The helpers here
 * (which item a target names, how its keys are checked) also serve videoBox.ts and videoLayers.ts.
 */

/** What a keyframe action works on: a clip or a layer, by id. Times are the playhead's, or a key's own (`at`). */
export type KeyTarget = { clip: string } | { layer: string };
/** A clip's or a layer's animatable value. */
export type KeyProp = ClipKeyProp | LayerKeyProp;
/** A clip or a layer. */
type KeyItem = VClip | Layer;

/** The message when a layer is gone. */
export const LAYER_GONE = 'That layer isn’t in the video any more.';

/**
 * Whether an item is a clip.
 * @param item a clip or a layer
 * @returns true for a clip
 */
const isClip = (item: KeyItem): item is VClip => 'track' in item;

/**
 * Every keyframe in the project now (the 5,000 limit, Q5).
 * @returns the count
 */
export const projectKeyCount = (): number => {
  const video = getVideo();
  return video.clips.reduce((count, clip) => count + countKeys(clip.keys), 0) + video.layers.reduce((count, layer) => count + countKeys(layer.keys), 0);
};

/**
 * A clip's or a layer's keys, typed loosely: actions name values of either.
 * @param item a clip or a layer
 * @returns its keys
 */
const keysOfItem = (item: KeyItem): Keyframes<KeyProp> | undefined => item.keys;

/**
 * How a key edit on an item is checked: its ranges, the project's frame rate and key count.
 * @param item a clip or a layer
 * @returns the check's settings
 */
export const keyEdit = (item: KeyItem): KeyEdit => ({ on: isClip(item) ? 'clip' : 'layer', fps: getVideo().fps, projectKeys: projectKeyCount() });

/** The item a target names and its time at the playhead (seconds from its start). */
export interface FoundItem<T extends KeyItem = KeyItem> {
  item: T;
  local: number;
}

/**
 * The clip a target names, and its time at the playhead.
 * @param id the clip
 * @returns the clip, or why it can't change (gone, or on a locked track)
 */
export function keyClip(id: string): FoundItem<VClip> | { error: string } {
  const video = getVideo();
  const clip = video.clips.find((candidate) => candidate.id === id);
  if (!clip) return { error: NOT_FOUND };
  const locked = clipLocked(clip.id);
  if (locked) return { error: locked };
  return { item: clip, local: video.t - clip.start };
}

/**
 * The item a target names and its time at the playhead.
 * @param target a clip or a layer
 * @returns the item, or why it can't change
 */
function keyItem(target: KeyTarget): FoundItem | { error: string } {
  if ('clip' in target) return keyClip(target.clip);
  const video = getVideo();
  const layer = video.layers.find((candidate) => candidate.id === target.layer);
  return layer ? { item: layer, local: video.t - (layer.start ?? 0) } : { error: LAYER_GONE };
}

/** Changed fields of a clip or a layer, or new keys for either. */
type ItemPatch = Partial<VClip> | Partial<Layer> | { keys: Keyframes<KeyProp> | undefined };

/**
 * Stores the target's changed fields as one undo step.
 * @param target a clip or a layer
 * @param patch the fields, built from the item the target names
 * @param key groups a drag's changes into one step
 * @returns null (done)
 */
function storeItem(target: KeyTarget, patch: ItemPatch, key: string): null {
  const video = getVideo();
  // The patch belongs to the target's kind: every action builds it from the item the target names.
  if ('clip' in target) change(key, { clips: video.clips.map((clip) => (clip.id === target.clip ? { ...clip, ...(patch as Partial<VClip>) } : clip)) });
  else change(key, { layers: video.layers.map((layer) => (layer.id === target.layer ? ({ ...layer, ...patch } as Layer) : layer)) });
  return null;
}

/**
 * Remove animation's fields for a value at a time: its value there becomes the stored one (the whole frame as no box).
 * @param item a clip or a layer
 * @param prop one of its animated values
 * @param local the time, seconds from its start
 * @returns the fields to change
 */
function stoppedAt(item: KeyItem, prop: KeyProp, local: number): Partial<VClip> | Partial<Layer> {
  if (!isClip(item)) return isLayerKeyProp(prop) ? stopAnimating(item, prop, local) : {};
  if (!isClipKeyProp(prop)) return {};
  const patch = stopAnimating(item, prop, local);
  return 'tf' in patch && isIdentity(patch.tf) ? { ...patch, tf: undefined } : patch;
}

/**
 * An item without a value's key at a time: its last key going stops the animation at that key's value, so nothing
 * jumps.
 * @param item a clip or a layer
 * @param prop the value
 * @param at the key's time
 * @returns the item, changed or the same
 */
function withoutKey<T extends KeyItem>(item: T, prop: KeyProp, at: number): T {
  const { fps } = getVideo();
  const keys = keysOfItem(item);
  const list = keys?.[prop] ?? [];
  const found = list.find((key) => Math.abs(key.t - at) < 0.5 / fps);
  if (!found || !keys) return item;
  if (list.length === 1) return { ...item, ...stoppedAt(item, prop, found.t) };
  return { ...item, keys: removeKey(keys, prop, at, fps) };
}

/**
 * The inspector's keyframe button (Q4): starts animating the value(s) with a key at the playhead holding their value
 * there, adds a key there, or (at a key) removes it. Several values (a layer's position: X and Y) go together, as the
 * first one is. One undo step.
 * @param target a clip or a layer
 * @param props the value or values
 * @returns null, or why not
 */
export function toggleKey(target: KeyTarget, props: KeyProp | KeyProp[]): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  const { item, local } = found;
  const names = Array.isArray(props) ? props : [props];
  const first = names.at(0);
  const { fps } = getVideo();
  if (first !== undefined && keysOfItem(item)?.[first]?.some((key) => Math.abs(key.t - local) < 0.5 / fps)) {
    let next = item;
    for (const name of names) next = withoutKey(next, name, local);
    return storeItem(target, next, '');
  }
  let keys = keysOfItem(item);
  for (const name of names) {
    const added = setKey(keys, name, local, valueOf(item, name, local), { ...keyEdit(item), projectKeys: projectKeyCount() + countKeys(keys) - countKeys(keysOfItem(item)) });
    if ('error' in added) return added.error;
    keys = added;
  }
  return storeItem(target, { keys }, '');
}

/**
 * **Remove animation** (the keyframe button's menu): the values' keys go, their values at the playhead stay. One step.
 * @param target a clip or a layer
 * @param props the value or values
 * @returns null, or why not
 */
export function removeAnimation(target: KeyTarget, props: KeyProp | KeyProp[]): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  let item: KeyItem = found.item;
  for (const name of Array.isArray(props) ? props : [props]) if (isAnimated(item, name)) item = { ...item, ...stoppedAt(item, name, found.local) } as KeyItem;
  return item === found.item ? null : storeItem(target, item, '');
}

/**
 * Moves the key at one time to another (one value's, or every value's for 'all'), item times.
 * @param target a clip or a layer
 * @param prop the value, or 'all'
 * @param from the key's time
 * @param to its new time
 * @param key groups a drag's changes into one step
 * @returns null, or why not
 */
export function moveKeys(target: KeyTarget, prop: KeyProp | 'all', from: number, to: number, key = ''): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  const keys = keysOfItem(found.item);
  const next = keys && moveKey(keys, prop, from, to, getVideo().fps);
  return next === keys ? null : storeItem(target, { keys: next }, key);
}

/**
 * Sets the interpolation of the key at a time (one value's, or every value's for 'all'). One undo step.
 * @param target a clip or a layer
 * @param prop the value, or 'all'
 * @param at the key's time
 * @param ease the interpolation
 * @returns null, or why not
 */
export function setKeyEase(target: KeyTarget, prop: KeyProp | 'all', at: number, ease: Ease): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  const keys = keysOfItem(found.item);
  const next = keys && setEase(keys, prop, at, ease, getVideo().fps);
  return next === keys ? null : storeItem(target, { keys: next }, '');
}

/**
 * Deletes the key at a time (one value's, or every value's for 'all'); a value's last key keeps its value. One step.
 * @param target a clip or a layer
 * @param prop the value, or 'all'
 * @param at the key's time
 * @returns null, or why not
 */
export function deleteKeys(target: KeyTarget, prop: KeyProp | 'all', at: number): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  let item = found.item;
  for (const name of prop === 'all' ? keysOf(keysOfItem(item) ?? {}) : [prop]) item = withoutKey(item, name, at);
  return item === found.item ? null : storeItem(target, item, '');
}
