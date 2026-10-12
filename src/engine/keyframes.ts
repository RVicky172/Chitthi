/**
 * Keyframes (205): values of a clip's box, its volume and a layer that change over time. One pure module evaluates
 * them for the preview, the export, the stage and the inspector, so what is seen is what is exported.
 */
import type { Layer } from './layers';
import type { ClipTransform, TimedClip } from './timeline';
import { IDENTITY, V_FPS } from './video';

/** How the change that starts at a keyframe eases into the next one (Q3). */
export type Ease = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

export const EASES: readonly Ease[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'];

export interface Keyframe {
  /** Seconds from the start of its clip or layer. */
  t: number;
  /** The value from here (in its property's units: shares of the frame, degrees, 0–1). */
  v: number;
  /** How the change from this keyframe to the next eases. */
  ease: Ease;
}

/** A clip's animatable values: 203's box and its volume (Q1). */
export type ClipKeyProp = keyof ClipTransform | 'volume';
/** A layer's animatable values (Q1). */
export type LayerKeyProp = 'x' | 'y' | 'w' | 'rot' | 'opacity';
/** An item's keyframes: each animated value's keys, in time order. */
export type Keyframes<P extends string> = Partial<Record<P, Keyframe[]>>;

export const KEY_LIMITS = { perValue: 100, perProject: 5000 } as const;

/** Each clip value's range: 203's box (`clampTransform`) and volume 0–1 (Q8). */
export const CLIP_RANGES: Readonly<Record<ClipKeyProp, readonly [number, number]>> = {
  x: [-0.5, 1.5],
  y: [-0.5, 1.5],
  w: [0.05, 4],
  rot: [-180, 180],
  opacity: [0, 1],
  radius: [0, 0.5],
  volume: [0, 1],
};

/** Each layer value's range, as `mergeLayers` clamps them. */
export const LAYER_RANGES: Readonly<Record<LayerKeyProp, readonly [number, number]>> = {
  x: [-0.5, 1.5],
  y: [-0.5, 1.5],
  w: [0.01, 4],
  rot: [-360, 360],
  opacity: [0, 1],
};

export const CLIP_KEY_PROPS = Object.keys(CLIP_RANGES) as ClipKeyProp[];
export const LAYER_KEY_PROPS = Object.keys(LAYER_RANGES) as LayerKeyProp[];
const BOX_PROPS = CLIP_KEY_PROPS.filter((prop): prop is keyof ClipTransform => prop !== 'volume');

/** A value kept within its property's range on a clip or a layer. */
export function clampValue(prop: ClipKeyProp | LayerKeyProp, value: number, on: 'clip' | 'layer'): number {
  const range = on === 'clip' ? CLIP_RANGES[prop as ClipKeyProp] : LAYER_RANGES[prop as LayerKeyProp];
  if (!range) return value;
  return Math.min(range[1], Math.max(range[0], value));
}

/** The CSS curves' control points (x1, y1, x2, y2). */
const BEZIER: Record<'ease-in' | 'ease-out' | 'ease-in-out', readonly [number, number, number, number]> = {
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** One coordinate of a cubic Bézier from (0, 0) to (1, 1) with control coordinates `first` and `second`. */
const bezierAt = (first: number, second: number, u: number): number =>
  ((1 - 3 * second + 3 * first) * u + (3 * second - 6 * first)) * u * u + 3 * first * u;

const bezierSlope = (first: number, second: number, u: number): number =>
  3 * (1 - 3 * second + 3 * first) * u * u + 2 * (3 * second - 6 * first) * u + 3 * first;

/** A CSS cubic-bezier's output at progress `progress` (0–1): solve x(u) = progress by Newton, else bisection. */
function cubicBezier(curve: readonly [number, number, number, number], progress: number): number {
  const [x1, y1, x2, y2] = curve;
  let u = progress;
  for (let step = 0; step < 8; step++) {
    const error = bezierAt(x1, x2, u) - progress;
    if (Math.abs(error) < 1e-7) return bezierAt(y1, y2, u);
    const slope = bezierSlope(x1, x2, u);
    if (Math.abs(slope) < 1e-6) break;
    u -= error / slope;
  }
  let low = 0,
    high = 1;
  u = progress;
  for (let step = 0; step < 40; step++) {
    const x = bezierAt(x1, x2, u);
    if (Math.abs(x - progress) < 1e-7) break;
    if (x < progress) low = u;
    else high = u;
    u = (low + high) / 2;
  }
  return bezierAt(y1, y2, u);
}

/** Progress (0–1) through a change eased by `ease`. */
function eased(ease: Ease, progress: number): number {
  if (ease === 'linear') return progress;
  if (ease === 'hold') return 0;
  return cubicBezier(BEZIER[ease], progress);
}

/**
 * The value of `keys` (sorted by time, at least one) at `t`, in the keys' own time: exact at a key, the first value
 * before the first key and the last after the last; between two keys the first one's ease.
 */
export function valueAt(keys: readonly Keyframe[], t: number): number {
  const last = keys.length - 1;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[last].t) return keys[last].v;
  // The last key at or before t: keys[low].t <= t < keys[high].t.
  let low = 0,
    high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (keys[mid].t <= t) low = mid;
    else high = mid;
  }
  const from = keys[low],
    to = keys[high];
  if (t === from.t) return from.v;
  const progress = (t - from.t) / (to.t - from.t);
  return from.v + (to.v - from.v) * eased(from.ease, progress);
}

/** True when `prop` of the clip or layer has at least one keyframe. */
export function isAnimated(item: { keys?: Keyframes<string> }, prop: string): boolean {
  return (item.keys?.[prop]?.length ?? 0) > 0;
}

/** A clip's box at `local` seconds from its start: its `tf` (or the identity) with the animated fields replaced. */
export function transformAt(clip: TimedClip, local: number): ClipTransform {
  const base = clip.tf ?? IDENTITY;
  const keys = clip.keys;
  if (!keys) return base;
  let out: ClipTransform | null = null;
  for (const prop of BOX_PROPS) {
    const list = keys[prop];
    if (!list || list.length === 0) continue;
    out ??= { ...base };
    out[prop] = clampValue(prop, valueAt(list, local), 'clip');
  }
  return out ?? base;
}

/** A clip's volume at `local` seconds from its start. */
export function volumeAt(clip: TimedClip & { volume: number }, local: number): number {
  const list = clip.keys?.volume;
  if (!list || list.length === 0) return clip.volume;
  return clampValue('volume', valueAt(list, local), 'clip');
}

/** A layer at timeline time `t` (its keys count from its start): the layer itself when nothing is animated. */
export function layerAt<L extends Layer>(layer: L, t: number): L {
  const keys = layer.keys;
  if (!keys) return layer;
  const local = t - (layer.start ?? 0);
  let out: L | null = null;
  for (const prop of LAYER_KEY_PROPS) {
    const list = keys[prop];
    if (!list || list.length === 0) continue;
    out ??= { ...layer };
    out[prop] = clampValue(prop, valueAt(list, local), 'layer');
  }
  return out ?? layer;
}

/* ---------- Pure edits (§2): each returns new keys (undefined when nothing is left animated) ---------- */

/** How a key edit is checked: the item it is on (for ranges), the frame rate, and the project's key count. */
export interface KeyEdit {
  on: 'clip' | 'layer';
  /** Keys within half a frame count as the same time; 30 when not given. */
  fps?: number;
  /** Keys in the whole project before the edit (the 5,000 limit). */
  projectKeys?: number;
}

/** True when two key times are within half a frame at `fps`. */
const near = (a: number, b: number, fps: number = V_FPS): boolean => Math.abs(a - b) < 0.5 / fps;

/** Keys with empty lists dropped; undefined when none is left. */
function tidy<P extends string>(keys: Keyframes<P>): Keyframes<P> | undefined {
  const out: Keyframes<P> = {};
  let any = false;
  for (const prop of Object.keys(keys) as P[]) {
    const list = keys[prop];
    if (list && list.length > 0) {
      out[prop] = list;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** Every key of an item. */
export function countKeys(keys: Keyframes<string> | undefined): number {
  let count = 0;
  if (keys) for (const list of Object.values(keys)) count += list?.length ?? 0;
  return count;
}

/** Sets `prop` to `value` at `t`: replaces the value of a key within half a frame, else adds one (Ease in and out). */
export function setKey<P extends ClipKeyProp | LayerKeyProp>(
  keys: Keyframes<P> | undefined,
  prop: P,
  t: number,
  value: number,
  edit: KeyEdit,
): Keyframes<P> | { error: string } {
  const v = clampValue(prop, value, edit.on);
  const list = keys?.[prop] ?? [];
  const at = list.findIndex((key) => near(key.t, t, edit.fps));
  let next: Keyframe[];
  if (at >= 0) next = list.map((key, i) => (i === at ? { ...key, v } : key));
  else {
    if (list.length >= KEY_LIMITS.perValue) return { error: `A value can have at most ${KEY_LIMITS.perValue} keyframes.` };
    if ((edit.projectKeys ?? 0) >= KEY_LIMITS.perProject)
      return { error: `A project can have at most ${KEY_LIMITS.perProject.toLocaleString('en')} keyframes.` };
    const added: Keyframe = { t, v, ease: 'ease-in-out' };
    next = [...list, added].sort((a, b) => a.t - b.t);
  }
  return { ...keys, [prop]: next } as Keyframes<P>;
}

/** Removes `prop`'s key within half a frame of `t`; the same keys when there is none. */
export function removeKey<P extends string>(
  keys: Keyframes<P>,
  prop: P,
  t: number,
  fps?: number,
): Keyframes<P> | undefined {
  const list = keys[prop];
  if (!list?.some((key) => near(key.t, t, fps))) return keys;
  return tidy({ ...keys, [prop]: list.filter((key) => !near(key.t, t, fps)) } as Keyframes<P>);
}

/** Applies `change` to the list of `prop`, or of every value for 'all'; the same keys when nothing changed. */
function eachList<P extends string>(
  keys: Keyframes<P>,
  prop: P | 'all',
  change: (list: Keyframe[]) => Keyframe[] | null,
): Keyframes<P> | undefined {
  let out: Keyframes<P> | null = null;
  for (const name of prop === 'all' ? (Object.keys(keys) as P[]) : [prop]) {
    const list = keys[name];
    if (!list) continue;
    const next = change(list);
    if (!next) continue;
    out ??= { ...keys };
    out[name] = next;
  }
  return out ? tidy(out) : keys;
}

/** Moves the key at `from` (one value's, or every value's for 'all') to `to`; a key already at `to` is replaced. */
export function moveKey<P extends string>(
  keys: Keyframes<P>,
  prop: P | 'all',
  from: number,
  to: number,
  fps?: number,
): Keyframes<P> | undefined {
  return eachList(keys, prop, (list) => {
    const moving = list.find((key) => near(key.t, from, fps));
    if (!moving) return null;
    const rest = list.filter((key) => key !== moving && !near(key.t, to, fps));
    return [...rest, { ...moving, t: to }].sort((a, b) => a.t - b.t);
  });
}

/** Sets the ease of the key at `t` (one value's, or every value's for 'all'). */
export function setEase<P extends string>(
  keys: Keyframes<P>,
  prop: P | 'all',
  t: number,
  ease: Ease,
  fps?: number,
): Keyframes<P> | undefined {
  return eachList(keys, prop, (list) =>
    list.some((key) => near(key.t, t, fps)) ? list.map((key) => (near(key.t, t, fps) ? { ...key, ease } : key)) : null,
  );
}

/** Moves every key by `by` seconds (for a start edge that moved by −`by`). */
export function shiftKeys<P extends string>(keys: Keyframes<P> | undefined, by: number): Keyframes<P> | undefined {
  if (!keys || by === 0) return keys;
  const out: Keyframes<P> = {};
  for (const prop of Object.keys(keys) as P[]) out[prop] = keys[prop]?.map((key) => ({ ...key, t: key.t + by }));
  return out;
}

/** The ease of the change running through `t`: the key at or before it, else the first key's. */
function easeAt(list: readonly Keyframe[], t: number): Ease {
  let ease = list[0].ease;
  for (const key of list) {
    if (key.t > t) break;
    ease = key.ease;
  }
  return ease;
}

/**
 * Keys for the two parts of a split at `at` seconds from the start: the left part keeps the keys before the cut and
 * gets one at the cut holding the value there; the right part gets one at 0 with that value and the keys after the
 * cut, shifted to its start. So nothing jumps at the cut.
 */
export function splitKeys<P extends string>(
  keys: Keyframes<P> | undefined,
  at: number,
): [Keyframes<P> | undefined, Keyframes<P> | undefined] {
  if (!keys) return [undefined, undefined];
  const left: Keyframes<P> = {},
    right: Keyframes<P> = {};
  for (const prop of Object.keys(keys) as P[]) {
    const list = keys[prop];
    if (!list || list.length === 0) continue;
    const cut = { v: valueAt(list, at), ease: easeAt(list, at) };
    left[prop] = [...list.filter((key) => key.t < at), { t: at, ...cut }];
    right[prop] = [{ t: 0, ...cut }, ...list.filter((key) => key.t > at).map((key) => ({ ...key, t: key.t - at }))];
  }
  return [tidy(left), tidy(right)];
}

/** A clip as keyframes see it: its box and, for a video, its volume. */
export type KeyedClip = TimedClip & { volume?: number };

const isClip = (item: KeyedClip | Layer): item is KeyedClip => 'track' in item;

/** `prop`'s value at `local` seconds from the item's start: animated, else stored. */
export function valueOf(item: KeyedClip | Layer, prop: ClipKeyProp | LayerKeyProp, local: number): number {
  const list = (item.keys as Keyframes<string> | undefined)?.[prop];
  const on = isClip(item) ? 'clip' : 'layer';
  if (list && list.length > 0) return clampValue(prop, valueAt(list, local), on);
  if (!isClip(item)) return item[prop as LayerKeyProp];
  if (prop === 'volume') return item.volume ?? 0;
  return (item.tf ?? IDENTITY)[prop as keyof ClipTransform];
}

/** Starts animating `prop` (or adds a key to it) with a key at `local` holding its current value there. */
export function animate(
  item: KeyedClip,
  prop: ClipKeyProp,
  local: number,
  edit?: Omit<KeyEdit, 'on'>,
): Keyframes<ClipKeyProp> | { error: string };
export function animate(
  item: Layer,
  prop: LayerKeyProp,
  local: number,
  edit?: Omit<KeyEdit, 'on'>,
): Keyframes<LayerKeyProp> | { error: string };
export function animate(
  item: KeyedClip | Layer,
  prop: ClipKeyProp | LayerKeyProp,
  local: number,
  edit: Omit<KeyEdit, 'on'> = {},
): Keyframes<string> | { error: string } {
  const keys = item.keys as Keyframes<ClipKeyProp | LayerKeyProp> | undefined;
  return setKey(keys, prop, local, valueOf(item, prop, local), { ...edit, on: isClip(item) ? 'clip' : 'layer' });
}

/**
 * **Remove animation**: `prop`'s keys go and its value at `local` becomes the stored one. Returns the item's changed
 * fields (`keys`, and `tf`, `volume` or the layer's field).
 */
export function stopAnimating(item: KeyedClip, prop: ClipKeyProp, local: number): Partial<KeyedClip>;
export function stopAnimating(item: Layer, prop: LayerKeyProp, local: number): Partial<Layer>;
export function stopAnimating(
  item: KeyedClip | Layer,
  prop: ClipKeyProp | LayerKeyProp,
  local: number,
): Partial<KeyedClip> | Partial<Layer> {
  const value = valueOf(item, prop, local);
  const rest: Keyframes<string> = { ...item.keys };
  delete rest[prop];
  const keys = tidy(rest);
  if (!isClip(item)) return { [prop]: value, keys } as Partial<Layer>;
  if (prop === 'volume') return { volume: value, keys };
  return { tf: { ...(item.tf ?? IDENTITY), [prop]: value }, keys } as Partial<KeyedClip>;
}
