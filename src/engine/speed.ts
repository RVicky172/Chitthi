import { monotoneSpline } from './curve';

/*
 * A video clip's speed (P2.7, specs/features/207-speed), free of DOM and React: a constant speed, reverse, freeze
 * frames and speed ramps, and the one mapping from a clip's time to the source time it shows (`sourceAt`), which the
 * preview, the export, the decoder pool and the sound all ask, so they show the same frame (AC-10). A clip at 1×,
 * forwards, shows exactly `in + local`, as every clip did before 207.
 *
 * A ramp is a speed curve over the clip's source part (shares 0–1 of in–out), a monotone cubic through its points
 * (curve.ts, no overshoot, Q5). Its play time T(p) = (out − in) × ∫₀ᵖ du / v(u) is tabulated once per ramp at
 * RAMP_STEPS shares (adaptive Simpson within each step, split at the points) and inverted by Newton steps within one
 * step of the table, with both ends pinned, so a ramped clip starts exactly at in and ends exactly at out (AC-5).
 */

/** Speeds a clip can have (Q1). */
export const SPEED_LIMITS = { min: 0.1, max: 10, step: 0.01 } as const;

/** The inspector's speed presets (AC-1). */
export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4] as const;

/** How many points a ramp has (Q5). */
export const RAMP_LIMITS = { minPoints: 2, maxPoints: 10 } as const;

/** A new freeze frame's seconds on screen (Q4). */
export const FREEZE_SECONDS = 2;

/** How long a freeze frame can be, seconds (AC-4): its end is dragged like a photo's. */
export const FREEZE_LIMITS = { min: 0.1, max: 60 } as const;

/** A ramp's point: a place along the clip's source part and the speed there. */
export interface RampPoint {
  /** Share of the source part in–out, 0–1. */
  at: number;
  /** Speed there, 0.1–10. */
  v: number;
}

/** The ramp presets (Q6). */
export type RampPreset = 'montage' | 'hero' | 'bullet' | 'jump' | 'flash-in' | 'flash-out';

/**
 * A frozen ramp from [share, speed] pairs.
 * @param pairs the points
 * @returns the ramp
 */
const presetRamp = (...pairs: readonly (readonly [number, number])[]): readonly RampPoint[] =>
  Object.freeze(pairs.map(([at, speed]) => Object.freeze({ at, v: speed })));

/** The six ramp presets (Q6): starting points the user can change. */
export const RAMP_PRESETS: Readonly<Record<RampPreset, readonly RampPoint[]>> = Object.freeze({
  montage: presetRamp([0, 3], [0.25, 0.5], [0.5, 3], [0.75, 0.5], [1, 3]),
  hero: presetRamp([0, 1], [0.35, 1], [0.5, 0.3], [0.65, 1], [1, 1]),
  bullet: presetRamp([0, 4], [0.42, 0.2], [0.58, 0.2], [1, 4]),
  jump: presetRamp([0, 1], [0.4, 1], [0.5, 5], [0.6, 1], [1, 1]),
  'flash-in': presetRamp([0, 5], [0.3, 1], [1, 1]),
  'flash-out': presetRamp([0, 1], [0.7, 1], [1, 5]),
});

/** A video clip's speed fields; all missing = 1×, forwards. */
export interface SpeedFields {
  /** Source seconds per timeline second, 0.1–10 (Q1); missing = 1. */
  speed?: number;
  /** Plays from its out point to its in point (AC-3); never together with a ramp (Q7: the ramp wins). */
  reverse?: true;
  /** A speed ramp in place of `speed` (AC-5): 2–10 points, in order from share 0 to share 1 of `rampSpan`. */
  ramp?: readonly RampPoint[];
  /**
   * The source seconds a ramp's shares refer to (D2, D-050): set when a trim or split first moves in or out, so the
   * curve stays where it was; missing = in–out.
   */
  rampSpan?: readonly [number, number];
  /** A freeze frame (D1): the source time it shows throughout; its length is `dur`, like a photo's. */
  freeze?: number;
}

/** What the mapping needs to know about a clip: its timing (timeline.ts's ClipTiming) and its speed. */
export interface SpeedClip extends SpeedFields {
  kind: 'photo' | 'video';
  /** Photo or freeze frame: seconds on screen. */
  dur: number;
  /** Video: the part of the source used, seconds. */
  in: number;
  out: number;
}

/**
 * A clip's constant speed.
 * @param clip the clip
 * @returns its speed, 1 when it has none
 */
const speedOf = (clip: SpeedFields): number => clip.speed ?? 1;

/** Steps of a ramp's play-time table. */
const RAMP_STEPS = 512;

/** How closely the play time within one step is integrated, in shares of the source part. */
const INTEGRAL_TOLERANCE = 1e-14;

/** How closely Newton's steps find a play time, in shares of the source part. */
const INVERSE_TOLERANCE = 1e-15;

/** A ramp's speed curve and its play-time table, computed once per ramp. */
interface RampTable {
  /** The speed at a share of the source part. */
  speed: (share: number) => number;
  /** The points' shares, where the curve's pieces join. */
  joins: readonly number[];
  /** ∫₀^(k / RAMP_STEPS) du / v(u) for k = 0…RAMP_STEPS: play time per second of source part. */
  played: Float64Array;
}

/** Tables by ramp: a ramp is never changed in place (edits build a new array), so the array is the key. */
const tables = new WeakMap<readonly RampPoint[], RampTable>();

/**
 * Adaptive Simpson: ∫ f between `from` and `to` to within a tolerance.
 * @param inverse the integrand
 * @param from the start
 * @param to the end
 * @param tolerance the allowed error
 * @returns the integral
 */
function integrate(inverse: (share: number) => number, from: number, to: number, tolerance: number): number {
  const panel = (start: number, end: number, atStart: number, atMiddle: number, atEnd: number, whole: number, depth: number): number => {
    const middle = (start + end) / 2;
    const leftMiddle = inverse((start + middle) / 2);
    const rightMiddle = inverse((middle + end) / 2);
    const left = ((middle - start) / 6) * (atStart + 4 * leftMiddle + atMiddle);
    const right = ((end - middle) / 6) * (atMiddle + 4 * rightMiddle + atEnd);
    const error = left + right - whole;
    if (depth <= 0 || Math.abs(error) <= 15 * tolerance) return left + right + error / 15;
    return (
      panel(start, middle, atStart, leftMiddle, atMiddle, left, depth - 1) +
      panel(middle, end, atMiddle, rightMiddle, atEnd, right, depth - 1)
    );
  };
  if (to <= from) return 0;
  const atStart = inverse(from);
  const atMiddle = inverse((from + to) / 2);
  const atEnd = inverse(to);
  return panel(from, to, atStart, atMiddle, atEnd, ((to - from) / 6) * (atStart + 4 * atMiddle + atEnd), 40);
}

/**
 * ∫ du / v(u) between two shares, split where the curve's pieces join (the curve is only smooth within a piece).
 * @param table the ramp's table
 * @param from the start share
 * @param to the end share
 * @returns play time per second of source part
 */
function playedBetween(table: RampTable, from: number, to: number): number {
  const inverse = (share: number) => 1 / table.speed(share);
  let total = 0;
  let start = from;
  for (const join of table.joins) {
    if (join <= start) continue;
    if (join >= to) break;
    total += integrate(inverse, start, join, INTEGRAL_TOLERANCE);
    start = join;
  }
  return total + integrate(inverse, start, to, INTEGRAL_TOLERANCE);
}

/**
 * A ramp's table, computed on first use.
 * @param ramp the ramp
 * @returns its speed curve and play-time table
 */
function rampTable(ramp: readonly RampPoint[]): RampTable {
  const cached = tables.get(ramp);
  if (cached) return cached;
  const speed = monotoneSpline(ramp.map((point) => [point.at, point.v] as const));
  const table: RampTable = { speed, joins: ramp.map((point) => point.at), played: new Float64Array(RAMP_STEPS + 1) };
  for (let step = 1; step <= RAMP_STEPS; step++)
    table.played[step] = (table.played[step - 1] ?? 0) + playedBetween(table, (step - 1) / RAMP_STEPS, step / RAMP_STEPS);
  tables.set(ramp, table);
  return table;
}

/**
 * A ramp's speed at a share of the source part: the monotone curve through its points, held flat past its ends.
 * @param ramp the ramp
 * @param share 0–1 of in–out
 * @returns the speed
 */
export const rampSpeedAt = (ramp: readonly RampPoint[], share: number): number => rampTable(ramp).speed(share);

/**
 * The play time a ramp takes to reach a share of its source part.
 * @param table the ramp's table
 * @param share 0–1
 * @returns play time per second of source part
 */
function playedTo(table: RampTable, share: number): number {
  const step = Math.min(RAMP_STEPS - 1, Math.floor(share * RAMP_STEPS));
  return (table.played[step] ?? 0) + playedBetween(table, step / RAMP_STEPS, share);
}

/**
 * The share of its source part a ramp has reached after a play time: the table's step, then Newton's steps within it
 * (kept inside the step by bisection when one would leave it).
 * @param table the ramp's table
 * @param played play time per second of source part, between 0 and the table's total
 * @returns 0–1
 */
function shareAfter(table: RampTable, played: number): number {
  const { played: steps } = table;
  let low = 0;
  let high = RAMP_STEPS;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((steps[middle] ?? 0) <= played) low = middle;
    else high = middle;
  }
  const base = steps[low] ?? 0;
  let below = low / RAMP_STEPS;
  let above = (low + 1) / RAMP_STEPS;
  let share = below + (played - base) * table.speed(below);
  for (let round = 0; round < 60; round++) {
    if (!(share > below && share < above)) share = (below + above) / 2;
    const miss = base + playedBetween(table, low / RAMP_STEPS, share) - played;
    if (Math.abs(miss) <= INVERSE_TOLERANCE) break;
    if (miss > 0) above = share;
    else below = share;
    share -= miss * table.speed(share);
  }
  return share;
}

/**
 * Play time per second of span from share 0 to a share: the table within 0–1, held at the end speeds past them.
 * @param table the ramp's table
 * @param share a share of the span, any
 * @returns play time per second of span (negative before 0)
 */
function playedAt(table: RampTable, share: number): number {
  if (share <= 0) return share / table.speed(0);
  const total = table.played[RAMP_STEPS] ?? 0;
  if (share >= 1) return total + (share - 1) / table.speed(1);
  return playedTo(table, share);
}

/**
 * `playedAt`'s inverse: the share reached after a play time from share 0.
 * @param table the ramp's table
 * @param played play time per second of span, any
 * @returns the share (outside 0–1 past the span's ends)
 */
function shareAt(table: RampTable, played: number): number {
  if (played <= 0) return played * table.speed(0);
  const total = table.played[RAMP_STEPS] ?? 0;
  if (played >= total) return 1 + (played - total) * table.speed(1);
  return shareAfter(table, played);
}

/** A ramped clip: its curve, the source span the curve's shares refer to, and its part of it. */
interface RampedClip extends SpeedClip {
  ramp: readonly RampPoint[];
}

/**
 * A ramped clip's span: `rampSpan`, else in–out.
 * @param clip the ramped clip
 * @returns its start and its width, source seconds
 */
function spanOf(clip: RampedClip): { from: number; width: number } {
  const [from, to] = clip.rampSpan ?? [clip.in, clip.out];
  return { from, width: to - from };
}

/**
 * Play time along a ramped clip's curve from its in point to a source time (past its in and out, along the curve
 * too: trims move the edges along it).
 * @param clip the ramped clip
 * @param source source seconds
 * @returns timeline seconds (negative before in)
 */
function curvePlayed(clip: RampedClip, source: number): number {
  const table = rampTable(clip.ramp);
  const { from, width } = spanOf(clip);
  return width * (playedAt(table, (source - from) / width) - playedAt(table, (clip.in - from) / width));
}

/**
 * The source time a ramped clip's curve reaches a time into the clip: `curvePlayed`'s inverse.
 * @param clip the ramped clip
 * @param local seconds from its in point, any
 * @returns source seconds
 */
function curveSource(clip: RampedClip, local: number): number {
  const table = rampTable(clip.ramp);
  const { from, width } = spanOf(clip);
  return from + width * shareAt(table, playedAt(table, (clip.in - from) / width) + local / width);
}

/**
 * A ramped clip's speed at one of its edges: the curve at its in or out point.
 * @param clip the ramped clip
 * @param edge the edge
 * @returns the speed
 */
function rampEdge(clip: RampedClip, edge: 'start' | 'end'): number {
  const { from, width } = spanOf(clip);
  return rampSpeedAt(clip.ramp, ((edge === 'start' ? clip.in : clip.out) - from) / width);
}

/**
 * Where a clip's curve takes an edge moved to a length (trims, D-050): a ramped clip's edge moves along its curve,
 * other clips' as `sourceAt` maps them.
 * @param clip the clip
 * @param local seconds from its in point (its start), any
 * @returns source seconds
 */
export const curveSourceAt = (clip: SpeedClip, local: number): number =>
  clip.ramp ? curveSource({ ...clip, ramp: clip.ramp }, local) : sourceAt(clip, local);

/**
 * `curveSourceAt`'s inverse: the time into a clip at which its curve reaches a source time.
 * @param clip the clip
 * @param source source seconds
 * @returns seconds from its in point (negative before it)
 */
export const curveLocalAt = (clip: SpeedClip, source: number): number =>
  clip.ramp ? curvePlayed({ ...clip, ramp: clip.ramp }, source) : localAt(clip, source);

/**
 * A video clip's seconds on the timeline before the 0.1 s floor of `clipLength`: its source part at its speed (or
 * the time its ramp takes to play it), or a freeze frame's `dur`.
 * @param clip the clip
 * @returns seconds
 */
export function playLength(clip: SpeedClip): number {
  if (clip.kind === 'photo' || clip.freeze !== undefined) return clip.dur;
  if (clip.ramp) return curvePlayed({ ...clip, ramp: clip.ramp }, clip.out);
  return (clip.out - clip.in) / speedOf(clip);
}

/**
 * The source time a clip shows at a time into it (AC-1, AC-3–AC-5): `in + local × speed` forwards, `out − local ×
 * speed` reversed, the ramp's inverse play time for a ramp, the frozen time for a freeze frame. Outside 0…length (a
 * transition's handles, 206) it goes on at the speed of that edge; the caller holds the file's first or last frame
 * past its ends, as before.
 * @param clip the clip
 * @param local seconds into the clip
 * @returns source seconds
 */
export function sourceAt(clip: SpeedClip, local: number): number {
  if (clip.freeze !== undefined) return clip.freeze;
  if (clip.ramp) {
    const ramped = { ...clip, ramp: clip.ramp };
    const length = playLength(clip);
    if (local <= 0) return clip.in + local * rampEdge(ramped, 'start');
    if (local >= length) return clip.out + (local - length) * rampEdge(ramped, 'end');
    return curveSource(ramped, local);
  }
  const speed = speedOf(clip);
  return clip.reverse ? clip.out - local * speed : clip.in + local * speed;
}

/** A reversed clip asks for its frames this much before `sourceAt`: a frame lasts more than this. */
export const REVERSE_NUDGE = 1e-3;

/**
 * The source time of the frame a clip shows at a time into it: `sourceAt`, but a reversed clip asks 1 ms before it.
 * Frames cover `time ≤ t < time + duration`, so played backwards the frame showing over a moment is the one *ending*
 * at its source time: at local 0, `sourceAt` is exactly `out`, the frame after the clip's last (207 T022). Preview,
 * export and the pool all ask this; at 1× forwards it is exactly `in + local`.
 * @param clip the clip
 * @param local seconds into the clip
 * @returns source seconds to ask the decoder for
 */
export function frameSourceAt(clip: SpeedClip, local: number): number {
  const source = sourceAt(clip, local);
  return clip.reverse && !clip.ramp && clip.freeze === undefined ? source - REVERSE_NUDGE : source;
}

/**
 * A clip's speed fields, only those it has (copying clips by name, as the export job does).
 * @param clip the clip
 * @returns its speed, reverse, ramp, ramp span and freeze, each when set
 */
export const speedFields = (clip: SpeedFields): SpeedFields => ({
  ...(clip.speed === undefined ? {} : { speed: clip.speed }),
  ...(clip.reverse ? { reverse: clip.reverse } : {}),
  ...(clip.ramp ? { ramp: clip.ramp } : {}),
  ...(clip.rampSpan ? { rampSpan: clip.rampSpan } : {}),
  ...(clip.freeze === undefined ? {} : { freeze: clip.freeze }),
});

/**
 * The time into a clip at which it shows a source time: `sourceAt`'s inverse (trims, split, thumbnails).
 * @param clip the clip (not a freeze frame: it shows one time throughout, so this gives 0)
 * @param source source seconds
 * @returns seconds into the clip
 */
export function localAt(clip: SpeedClip, source: number): number {
  if (clip.freeze !== undefined) return 0;
  if (clip.ramp) {
    const ramped = { ...clip, ramp: clip.ramp };
    if (source <= clip.in) return (source - clip.in) / rampEdge(ramped, 'start');
    if (source >= clip.out) return playLength(clip) + (source - clip.out) / rampEdge(ramped, 'end');
    return curvePlayed(ramped, source);
  }
  const speed = speedOf(clip);
  return clip.reverse ? (clip.out - source) / speed : (source - clip.in) / speed;
}

/**
 * How fast a clip plays at one of its edges, source seconds per timeline second: its handles (206) run on at it.
 * @param clip the clip
 * @param edge the edge (a constant speed is the same at both; a ramp's isn't)
 * @returns the speed there; 0 for a freeze frame
 */
export function edgeSpeed(clip: SpeedClip, edge: 'start' | 'end'): number {
  if (clip.freeze !== undefined) return 0;
  return clip.ramp ? rampEdge({ ...clip, ramp: clip.ramp }, edge) : speedOf(clip);
}

/** The speeds at which a clip keeps its sound (Q8): outside them it is silent. */
export const SOUND_SPEEDS = { min: 0.5, max: 2 } as const;

/**
 * Why a clip plays without sound (AC-6): a freeze frame, a reversed or ramped clip, or a speed outside 0.5–2×.
 * @param clip the clip
 * @returns the reason the inspector shows, or null when it sounds
 */
export function soundMuted(clip: SpeedFields): string | null {
  if (clip.freeze !== undefined) return 'A freeze frame has no sound.';
  if (clip.ramp) return 'A clip with a speed ramp plays without sound.';
  if (clip.reverse) return 'A reversed clip plays without sound.';
  const speed = speedOf(clip);
  if (speed < SOUND_SPEEDS.min || speed > SOUND_SPEEDS.max)
    return `Sound plays from ${SOUND_SPEEDS.min}× to ${SOUND_SPEEDS.max}×: at ${speed}× this clip is silent.`;
  return null;
}

/**
 * The rate a clip's sound plays at: source seconds per timeline second (AC-6).
 * @param clip the clip
 * @returns its speed, or null when it is silent (`soundMuted`)
 */
export const soundRate = (clip: SpeedFields): number | null => (soundMuted(clip) === null ? speedOf(clip) : null);

/** The closest two ramp points may be, as a share of the clip (the ramp editor and the store). */
export const RAMP_POINT_GAP = 0.01;

/**
 * Where a ramp point may go: an end point stays at 0 or 1, the others between their neighbours.
 * @param points the ramp's points
 * @param index the point
 * @returns the lowest and highest place
 */
export function rampPointRange(points: readonly RampPoint[], index: number): [number, number] {
  if (index === 0) return [0, 0];
  if (index === points.length - 1) return [1, 1];
  return [(points[index - 1]?.at ?? 0) + RAMP_POINT_GAP, (points[index + 1]?.at ?? 1) - RAMP_POINT_GAP];
}
