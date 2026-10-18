/**
 * Keyframes (205): values of a clip's box, its volume and a layer that change over time. One pure module evaluates
 * them for the preview, the export, the stage and the inspector, so what is seen is what is exported.
 */
import { keysOf } from './guards';
import { KEY_LIMITS } from './keyframeGate';
import { scaleLayer, type Layer } from './layers';
import { IDENTITY, type ClipTransform, type TimedClip } from './timeline';
import type { SoundSource } from './soundPlan';
import { V_FPS } from './videoFormats';

/** How the change that starts at a keyframe eases into the next one (Q3). */
export type Ease = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

export const EASES: readonly Ease[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'];

/** One keyframe, as saved (its short field names are the document's). */
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

/** Anything that may carry keyframes: a clip or a layer. */
export interface Keyed {
  keys?: Keyframes<string>;
}

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

/** The ranges looked up by any value name (none for a name only the other kind animates), for clampValue. */
const RANGES_BY_NAME: Readonly<Record<'clip' | 'layer', Readonly<Partial<Record<string, readonly [number, number]>>>>> = {
  clip: CLIP_RANGES,
  layer: LAYER_RANGES,
};

export const CLIP_KEY_PROPS = keysOf(CLIP_RANGES);
export const LAYER_KEY_PROPS = keysOf(LAYER_RANGES);
const BOX_PROPS = CLIP_KEY_PROPS.filter((prop): prop is keyof ClipTransform => prop !== 'volume');

/**
 * Whether a value name is one a clip can animate.
 * @param prop a value name
 * @returns true for a clip's box values and its volume
 */
export const isClipKeyProp = (prop: string): prop is ClipKeyProp => Object.hasOwn(CLIP_RANGES, prop);

/**
 * Whether a value name is one a layer can animate.
 * @param prop a value name
 * @returns true for a layer's position, size, turn and opacity
 */
export const isLayerKeyProp = (prop: string): prop is LayerKeyProp => Object.hasOwn(LAYER_RANGES, prop);

/**
 * A value kept within its property's range on a clip or a layer.
 * @param prop the value's name
 * @param value the value
 * @param on whether it is a clip's or a layer's
 * @returns the value clamped to its range (unchanged for a name without one)
 */
export function clampValue(prop: ClipKeyProp | LayerKeyProp, value: number, on: 'clip' | 'layer'): number {
  // A plain lookup, not isClipKeyProp / isLayerKeyProp: this runs per sample of every volume curve (407 T072).
  const range = RANGES_BY_NAME[on][prop];
  if (!range) return value;
  return Math.min(range[1], Math.max(range[0], value));
}

/** The CSS curves' control points (x1, y1, x2, y2). */
const BEZIER: Record<'ease-in' | 'ease-out' | 'ease-in-out', readonly [number, number, number, number]> = {
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/**
 * One coordinate of a cubic Bézier from (0, 0) to (1, 1).
 * @param first the first control point's coordinate
 * @param second the second control point's coordinate
 * @param along the curve's parameter, 0–1
 * @returns the coordinate
 */
const bezierAt = (first: number, second: number, along: number): number =>
  ((1 - 3 * second + 3 * first) * along + (3 * second - 6 * first)) * along * along + 3 * first * along;

/**
 * The slope of one coordinate of a cubic Bézier from (0, 0) to (1, 1).
 * @param first the first control point's coordinate
 * @param second the second control point's coordinate
 * @param along the curve's parameter, 0–1
 * @returns d(coordinate) / d(along)
 */
const bezierSlope = (first: number, second: number, along: number): number =>
  3 * (1 - 3 * second + 3 * first) * along * along + 2 * (3 * second - 6 * first) * along + 3 * first;

/**
 * A CSS cubic-bezier's output at a progress: solves x(along) = progress by Newton's method, else by bisection.
 * @param curve the control points (x1, y1, x2, y2)
 * @param progress the input, 0–1
 * @returns the eased output
 */
function cubicBezier(curve: readonly [number, number, number, number], progress: number): number {
  const [x1, y1, x2, y2] = curve;
  let along = progress;
  for (let step = 0; step < 8; step++) {
    const error = bezierAt(x1, x2, along) - progress;
    if (Math.abs(error) < 1e-12) return bezierAt(y1, y2, along);
    const slope = bezierSlope(x1, x2, along);
    if (Math.abs(slope) < 1e-6) break;
    along -= error / slope;
  }
  let low = 0;
  let high = 1;
  along = progress;
  for (let step = 0; step < 40; step++) {
    const x = bezierAt(x1, x2, along);
    if (Math.abs(x - progress) < 1e-12) break;
    if (x < progress) low = along;
    else high = along;
    along = (low + high) / 2;
  }
  return bezierAt(y1, y2, along);
}

/**
 * Progress through a change, eased.
 * @param ease the ease
 * @param progress the linear progress, 0–1
 * @returns the eased progress (0 throughout for a hold)
 */
function eased(ease: Ease, progress: number): number {
  if (ease === 'linear') return progress;
  if (ease === 'hold') return 0;
  return cubicBezier(BEZIER[ease], progress);
}

/**
 * The value of keyframes at a time, in the keys' own time: exact at a key, the first value before the first key and the
 * last after the last; between two keys, eased by the first one's ease.
 * @param keys the keys, sorted by time, at least one
 * @param time seconds from the start of their clip or layer
 * @returns the value
 * @throws when there are no keys
 */
export function valueAt(keys: readonly Keyframe[], time: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === undefined || last === undefined) throw new Error('A value needs at least one keyframe.');
  if (time <= first.t) return first.v;
  if (time >= last.t) return last.v;
  // The last key at or before the time: keys[low].t <= time < keys[high].t.
  let low = 0;
  let high = keys.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    const key = keys[middle];
    // `=== undefined`, not `?.t ?? Infinity`: this runs per sample of every volume curve, and the optional read made
    // it ~50 % slower (407 T072).
    if (key === undefined) break;
    if (key.t <= time) low = middle;
    else high = middle;
  }
  const from = keys[low];
  const to = keys[high];
  if (from === undefined || to === undefined) return last.v;
  if (time === from.t) return from.v;
  const progress = (time - from.t) / (to.t - from.t);
  return from.v + (to.v - from.v) * eased(from.ease, progress);
}

/**
 * Whether a value of a clip or layer is animated.
 * @param item the clip or layer
 * @param prop the value's name
 * @returns true when it has at least one keyframe
 */
export function isAnimated(item: Keyed, prop: string): boolean {
  return (item.keys?.[prop]?.length ?? 0) > 0;
}

/**
 * A clip's box at a time: its `tf` (or the identity) with the animated fields replaced.
 * @param clip the clip
 * @param local seconds from its start
 * @returns the box (the stored one, not a copy, when nothing is animated)
 */
export function transformAt(clip: Pick<TimedClip, 'tf' | 'keys'>, local: number): ClipTransform {
  const base = clip.tf ?? IDENTITY;
  const keys = clip.keys;
  if (!keys) return base;
  let animated: ClipTransform | null = null;
  for (const prop of BOX_PROPS) {
    const list = keys[prop];
    if (!list || list.length === 0) continue;
    animated ??= { ...base };
    animated[prop] = clampValue(prop, valueAt(list, local), 'clip');
  }
  return animated ?? base;
}

/** A clip with a volume, as `volumeAt` reads it. */
export interface VolumeKeyed {
  volume: number;
  keys?: Keyframes<ClipKeyProp>;
}

/**
 * A clip's volume at a time.
 * @param clip the clip
 * @param local seconds from its start
 * @returns its volume, 0–1
 */
export function volumeAt(clip: VolumeKeyed, local: number): number {
  const list = clip.keys?.volume;
  if (!list || list.length === 0) return clip.volume;
  return clampValue('volume', valueAt(list, local), 'clip');
}

/**
 * A layer at a timeline time (its keys count from its start).
 * @param layer the layer
 * @param time timeline seconds
 * @returns the layer as drawn then: the layer itself when nothing is animated
 */
export function layerAt<L extends Layer>(layer: L, time: number): L {
  const keys = layer.keys;
  if (!keys) return layer;
  const local = time - (layer.start ?? 0);
  let animated: L | null = null;
  for (const prop of LAYER_KEY_PROPS) {
    const list = keys[prop];
    if (!list || list.length === 0) continue;
    const value = clampValue(prop, valueAt(list, local), 'layer');
    // Size scales the whole layer, as the Size slider does: a title's font size, a shape's height and stroke too.
    if (prop === 'w') animated = { ...scaleLayer(animated ?? layer, value / layer.w), w: value };
    else {
      animated ??= { ...layer };
      animated[prop] = value;
    }
  }
  return animated ?? layer;
}

/**
 * The layers as drawn at a timeline time: each keyed layer evaluated (`layerAt`).
 * @param layers the layers
 * @param time timeline seconds; none in the photo editor
 * @returns the same array without a time or when no layer is animated (nothing is allocated per frame then)
 */
export function layersAt(layers: Layer[], time?: number): Layer[] {
  if (time === undefined || !layers.some((layer) => layer.keys)) return layers;
  return layers.map((layer) => layerAt(layer, time));
}

/**
 * A sound source's volume at a timeline time: its volume keys (or its volume) times its end ramps and transitions.
 * @param source the sound source
 * @param time timeline seconds
 * @returns the gain, 0–1
 */
export function sourceGainAt(source: SoundSource, time: number): number {
  let volume = source.gain ? clampValue('volume', valueAt(source.gain, time - source.start), 'clip') : source.volume;
  volume *= edgeGain(source, time);
  if (source.fadeIn > 0 && time < source.start + source.fadeIn)
    volume *= Math.max(0, (time - source.start) / source.fadeIn);
  if (source.fadeOut > 0 && time > source.end - source.fadeOut)
    volume *= Math.max(0, (source.end - time) / source.fadeOut);
  return volume;
}

/** A transition's progress is eased as its picture is (206 Q12): 205's Ease in and out. */
const TRANSITION_EASE: Keyframe[] = [
  { t: 0, v: 0, ease: 'ease-in-out' },
  { t: 1, v: 1, ease: 'ease-in-out' },
];

/**
 * A source's gain from its transitions (206 AC-6): over the transition leading into it (centred on its start, `lead`
 * each side) it rises as sin(π/2 · p), and over its own (centred on its end, `trail` each side) it falls as
 * cos(π/2 · p), with p the transition's eased progress, so two clips' squares sum to 1 (equal power); a dip (`dip`)
 * goes through silence at the cut instead (2p − 1 rising, 1 − 2p falling).
 * @param source the sound source's timing and transitions
 * @param time timeline seconds
 * @returns the gain, 0–1 (1 elsewhere and without transitions)
 */
export function edgeGain(
  source: Pick<SoundSource, 'start' | 'end' | 'lead' | 'trail' | 'edgeIn' | 'edgeOut'>,
  time: number,
): number {
  const easedProgress = (from: number, length: number) =>
    valueAt(TRANSITION_EASE, Math.min(1, Math.max(0, (time - from) / length)));
  let gain = 1;
  if (source.lead) {
    const progress = easedProgress(source.start - source.lead, 2 * source.lead);
    gain *= source.edgeIn === 'dip' ? Math.max(0, 2 * progress - 1) : Math.sin((Math.PI / 2) * progress);
  }
  if (source.trail) {
    const progress = easedProgress(source.end - source.trail, 2 * source.trail);
    gain *= source.edgeOut === 'dip' ? Math.max(0, 1 - 2 * progress) : Math.cos((Math.PI / 2) * progress);
  }
  return gain;
}

/**
 * The export's gain curve for a source over a stretch of the timeline (§5): `sourceGainAt` at evenly spread points at
 * most `step` apart, both ends included, for `AudioParam.setValueCurveAtTime`, which plays it linearly between points
 * (within 0.5 dB of the exact curve). Windows meet on the same value, so nothing clicks at their joins.
 * @param source the sound source
 * @param from the stretch's start, timeline seconds
 * @param length its length, seconds
 * @param step the largest distance between points, seconds
 * @returns the gains, at least two
 */
export function gainCurve(source: SoundSource, from: number, length: number, step = 0.005): Float32Array {
  const count = Math.max(2, Math.ceil(length / step - 1e-9) + 1);
  const curve = new Float32Array(count);
  for (let index = 0; index < count; index++)
    curve[index] = sourceGainAt(source, from + (index * length) / (count - 1));
  return curve;
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

/** A refused key edit, with what to tell the user. */
export interface KeyError {
  error: string;
}

/**
 * Whether two key times count as the same.
 * @param first a time, seconds
 * @param second another time, seconds
 * @param fps the frame rate
 * @returns true when they are within half a frame
 */
const near = (first: number, second: number, fps: number = V_FPS): boolean => Math.abs(first - second) < 0.5 / fps;

/**
 * Keys with empty lists dropped.
 * @param keys an item's keys
 * @returns the keys, or undefined when none is left
 */
export function tidyKeys<P extends string>(keys: Keyframes<P>): Keyframes<P> | undefined {
  const tidied: Keyframes<P> = {};
  let any = false;
  for (const prop of keysOf(keys)) {
    const list = keys[prop];
    if (list && list.length > 0) {
      tidied[prop] = list;
      any = true;
    }
  }
  return any ? tidied : undefined;
}

/**
 * Every key of an item.
 * @param keys the item's keys
 * @returns how many there are
 */
export function countKeys(keys: Keyframes<string> | undefined): number {
  let count = 0;
  if (keys) for (const list of Object.values(keys)) count += list?.length ?? 0;
  return count;
}

/**
 * Sets a value at a time: replaces the value of a key within half a frame, else adds one (Ease in and out).
 * @param keys the item's keys
 * @param prop the value's name
 * @param time seconds from the item's start
 * @param value the value (clamped to its range)
 * @param edit the item kind, frame rate and project key count
 * @returns the new keys, or an error when a limit would be passed
 */
export function setKey<P extends ClipKeyProp | LayerKeyProp>(
  keys: Keyframes<P> | undefined,
  prop: P,
  time: number,
  value: number,
  edit: KeyEdit,
): Keyframes<P> | KeyError {
  const clamped = clampValue(prop, value, edit.on);
  const list = keys?.[prop] ?? [];
  const at = list.findIndex((key) => near(key.t, time, edit.fps));
  let next: Keyframe[];
  if (at >= 0) next = list.map((key, index) => (index === at ? { ...key, v: clamped } : key));
  else {
    if (list.length >= KEY_LIMITS.perValue)
      return { error: `A value can have at most ${KEY_LIMITS.perValue} keyframes.` };
    if ((edit.projectKeys ?? 0) >= KEY_LIMITS.perProject)
      return { error: `A project can have at most ${KEY_LIMITS.perProject.toLocaleString('en')} keyframes.` };
    const added: Keyframe = { t: time, v: clamped, ease: 'ease-in-out' };
    next = [...list, added].sort((left, right) => left.t - right.t);
  }
  const changed: Keyframes<P> = { ...keys };
  changed[prop] = next;
  return changed;
}

/**
 * Removes a value's key at a time.
 * @param keys the item's keys
 * @param prop the value's name
 * @param time seconds from the item's start (a key within half a frame is removed)
 * @param fps the frame rate
 * @returns the new keys (the same keys when there is none there; undefined when nothing is left)
 */
export function removeKey<P extends string>(
  keys: Keyframes<P>,
  prop: P,
  time: number,
  fps?: number,
): Keyframes<P> | undefined {
  const list = keys[prop];
  if (!list?.some((key) => near(key.t, time, fps))) return keys;
  const changed: Keyframes<P> = { ...keys };
  changed[prop] = list.filter((key) => !near(key.t, time, fps));
  return tidyKeys(changed);
}

/**
 * Applies a change to one value's list, or to every value's for 'all'.
 * @param keys the item's keys
 * @param prop the value's name, or 'all'
 * @param change returns a list's new keys, or null to leave it
 * @returns the new keys (the same keys when nothing changed)
 */
function eachList<P extends string>(
  keys: Keyframes<P>,
  prop: P | 'all',
  change: (list: Keyframe[]) => Keyframe[] | null,
): Keyframes<P> | undefined {
  let changed: Keyframes<P> | null = null;
  for (const name of prop === 'all' ? keysOf(keys) : [prop]) {
    const list = keys[name];
    if (!list) continue;
    const next = change(list);
    if (!next) continue;
    changed ??= { ...keys };
    changed[name] = next;
  }
  return changed ? tidyKeys(changed) : keys;
}

/**
 * Moves a key (one value's, or every value's for 'all'); a key already at the new time is replaced.
 * @param keys the item's keys
 * @param prop the value's name, or 'all'
 * @param from the key's time, seconds from the item's start
 * @param to its new time
 * @param fps the frame rate
 * @returns the new keys
 */
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
    return [...rest, { ...moving, t: to }].sort((left, right) => left.t - right.t);
  });
}

/**
 * Sets the ease of the key at a time (one value's, or every value's for 'all').
 * @param keys the item's keys
 * @param prop the value's name, or 'all'
 * @param time the key's time, seconds from the item's start
 * @param ease the new ease
 * @param fps the frame rate
 * @returns the new keys
 */
export function setEase<P extends string>(
  keys: Keyframes<P>,
  prop: P | 'all',
  time: number,
  ease: Ease,
  fps?: number,
): Keyframes<P> | undefined {
  return eachList(keys, prop, (list) =>
    list.some((key) => near(key.t, time, fps))
      ? list.map((key) => (near(key.t, time, fps) ? { ...key, ease } : key))
      : null,
  );
}

/**
 * Moves every key (for a start edge that moved the other way).
 * @param keys the item's keys
 * @param by seconds to add to every key's time
 * @returns the new keys (the same keys for no move)
 */
export function shiftKeys<P extends string>(keys: Keyframes<P> | undefined, by: number): Keyframes<P> | undefined {
  if (!keys || by === 0) return keys;
  const shifted: Keyframes<P> = {};
  for (const prop of keysOf(keys)) shifted[prop] = keys[prop]?.map((key) => ({ ...key, t: key.t + by }));
  return shifted;
}

/**
 * Scales every key's time (207 Q9: a clip's speed changed its length, and its keys stay at the same places along it).
 * @param keys the item's keys
 * @param factor the new length over the old
 * @returns the new keys (the same keys for a factor of 1)
 */
export function scaleKeys<P extends string>(keys: Keyframes<P> | undefined, factor: number): Keyframes<P> | undefined {
  if (!keys || factor === 1) return keys;
  const scaled: Keyframes<P> = {};
  for (const prop of keysOf(keys)) scaled[prop] = keys[prop]?.map((key) => ({ ...key, t: key.t * factor }));
  return scaled;
}

/**
 * The ease of the change running through a time.
 * @param list one value's keys, at least one
 * @param time seconds from the item's start
 * @returns the ease of the key at or before it, else the first key's
 */
function easeAt(list: readonly Keyframe[], time: number): Ease {
  let ease = list.at(0)?.ease ?? 'ease-in-out';
  for (const key of list) {
    if (key.t > time) break;
    ease = key.ease;
  }
  return ease;
}

/**
 * Keys for the two parts of a split: the left part keeps the keys before the cut and gets one at the cut holding the
 * value there; the right part gets one at 0 with that value and the keys after the cut, shifted to its start. So
 * nothing jumps at the cut.
 * @param keys the item's keys
 * @param at the cut, seconds from the item's start
 * @returns the left part's keys and the right part's
 */
export function splitKeys<P extends string>(
  keys: Keyframes<P> | undefined,
  at: number,
): [Keyframes<P> | undefined, Keyframes<P> | undefined] {
  if (!keys) return [undefined, undefined];
  const left: Keyframes<P> = {};
  const right: Keyframes<P> = {};
  for (const prop of keysOf(keys)) {
    const list = keys[prop];
    if (!list || list.length === 0) continue;
    const cut = { v: valueAt(list, at), ease: easeAt(list, at) };
    left[prop] = [...list.filter((key) => key.t < at), { t: at, ...cut }];
    right[prop] = [{ t: 0, ...cut }, ...list.filter((key) => key.t > at).map((key) => ({ ...key, t: key.t - at }))];
  }
  return [tidyKeys(left), tidyKeys(right)];
}

/** A clip as keyframes see it: its box and, for a video, its volume. */
export type KeyedClip = TimedClip & { volume?: number };

const isClip = (item: KeyedClip | Layer): item is KeyedClip => 'track' in item;

/**
 * A value of a clip or layer at a time: animated, else stored.
 * @param item the clip or layer
 * @param prop the value's name
 * @param local seconds from the item's start
 * @returns the value
 */
export function valueOf(item: KeyedClip | Layer, prop: ClipKeyProp | LayerKeyProp, local: number): number {
  const keys: Keyframes<string> | undefined = item.keys;
  const list = keys?.[prop];
  const on = isClip(item) ? 'clip' : 'layer';
  if (list && list.length > 0) return clampValue(prop, valueAt(list, local), on);
  if (!isClip(item)) return isLayerKeyProp(prop) ? item[prop] : 0;
  if (prop === 'volume') return item.volume ?? 0;
  return (item.tf ?? IDENTITY)[prop];
}

/**
 * Starts animating a value (or adds a key to it) with a key holding its current value.
 * @param item the clip or layer
 * @param prop the value's name
 * @param local the key's time, seconds from the item's start
 * @param edit the frame rate and project key count
 * @returns the item's new keys, or an error when a limit would be passed
 */
export function animate(
  item: KeyedClip,
  prop: ClipKeyProp,
  local: number,
  edit?: Omit<KeyEdit, 'on'>,
): Keyframes<ClipKeyProp> | KeyError;
export function animate(
  item: Layer,
  prop: LayerKeyProp,
  local: number,
  edit?: Omit<KeyEdit, 'on'>,
): Keyframes<LayerKeyProp> | KeyError;
export function animate(
  item: KeyedClip | Layer,
  prop: ClipKeyProp | LayerKeyProp,
  local: number,
  edit: Omit<KeyEdit, 'on'> = {},
): Keyframes<string> | KeyError {
  const keys: Keyframes<ClipKeyProp | LayerKeyProp> | undefined = item.keys;
  return setKey(keys, prop, local, valueOf(item, prop, local), { ...edit, on: isClip(item) ? 'clip' : 'layer' });
}

/**
 * **Remove animation**: a value's keys go and its value at a time becomes the stored one.
 * @param item the clip or layer
 * @param prop the value's name
 * @param local seconds from the item's start
 * @returns the item's changed fields (`keys`, and `tf`, `volume` or the layer's field)
 */
export function stopAnimating(item: KeyedClip, prop: ClipKeyProp, local: number): Partial<KeyedClip>;
export function stopAnimating(item: Layer, prop: LayerKeyProp, local: number): Partial<Layer>;
export function stopAnimating(
  item: KeyedClip | Layer,
  prop: ClipKeyProp | LayerKeyProp,
  local: number,
): Partial<KeyedClip> | Partial<Layer> {
  const value = valueOf(item, prop, local);
  const others: Keyframes<string> = Object.fromEntries(
    Object.entries(item.keys ?? {}).filter(([name]) => name !== prop),
  );
  const keys = tidyKeys(others);
  if (!isClip(item)) {
    const changed: Partial<Layer> = {};
    if (isLayerKeyProp(prop)) changed[prop] = value;
    changed.keys = keys;
    return changed;
  }
  if (prop === 'volume') return { volume: value, keys };
  const tf = { ...(item.tf ?? IDENTITY) };
  tf[prop] = value;
  return { tf, keys };
}

/* ---------- The inspector (§7) ---------- */

/** The keyframe button's state for a value: not animated, at a key (within half a frame), or between keys. */
export type KeyState = 'none' | 'key' | 'between';

/**
 * The keyframe button's state for a value at a time.
 * @param keys the value's keys
 * @param local seconds from the item's start
 * @param fps the frame rate
 * @returns the state
 */
export function keyState(keys: readonly Keyframe[] | undefined, local: number, fps: number = V_FPS): KeyState {
  if (!keys || keys.length === 0) return 'none';
  return keys.some((key) => near(key.t, local, fps)) ? 'key' : 'between';
}

/**
 * The time of the item's previous or next keyframe of any animated value; a key within half a frame of `local`
 * doesn't count, so pressing again moves on.
 * @param item the clip or layer
 * @param local seconds from its start
 * @param direction −1 for the previous key, +1 for the next
 * @param fps the frame rate
 * @returns the key's time, seconds from the item's start, or null when there is none
 */
export function adjacentKey(item: Keyed, local: number, direction: -1 | 1, fps: number = V_FPS): number | null {
  const forward = direction > 0;
  let best: number | null = null;
  for (const list of Object.values(item.keys ?? {}))
    for (const key of list ?? []) {
      const behind = forward ? key.t < local : key.t > local;
      if (near(key.t, local, fps) || behind) continue;
      if (best === null || (forward ? key.t < best : key.t > best)) best = key.t;
    }
  return best;
}
