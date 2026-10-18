import { isRecord } from './guards';
import { FREEZE_LIMITS, FREEZE_SECONDS, RAMP_LIMITS, SPEED_LIMITS, type RampPoint, type SpeedFields } from './speed';

/*
 * The document gate for a clip's speed (P2.7, specs/features/207-speed plan §7, AC-9): `mergeSpeed` reads `speed`,
 * `reverse`, `ramp`, `rampSpan` and `freeze` from a saved clip, mends what it can and drops the rest, each with the
 * reason, never throwing. A clip at 1× forwards gets none of the fields, so documents without speed changes read and
 * write as before.
 */

export const SPEED_REASONS = {
  unread: 'Some speed settings couldn’t be read and were left out.',
  range: 'Some clip speeds were out of range and were adjusted.',
  ramp: 'Some speed ramps couldn’t be read or had too few or too many points and were left out.',
  mended: 'Some speed ramps were out of order or incomplete and were mended.',
  both: 'Some clips had a speed ramp with reverse or a constant speed; the ramp was kept.',
  freeze: 'Some freeze frames were outside their video or out of length and were adjusted.',
  still: 'Some freeze frames had speed settings, which were left out.',
} as const;

/**
 * Adds a reason to the gate's list unless it is there already (each reason once).
 * @param dropped the gate's reasons
 * @param reason the reason
 */
const sayOnce = (dropped: string[], reason: string) => {
  if (!dropped.includes(reason)) dropped.push(reason);
};

/**
 * Whether a document sets a field: present, not null (a NaN written as JSON) and not false.
 * @param value the field's value
 * @returns true when set
 */
const isSet = (value: unknown) => value !== undefined && value !== null && value !== false;

/**
 * A finite number, or null.
 * @param value the document's value
 * @returns the number, or null
 */
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * A speed kept within 0.1–10×.
 * @param speed the speed
 * @returns the speed within the limits
 */
const withinLimits = (speed: number) => Math.min(SPEED_LIMITS.max, Math.max(SPEED_LIMITS.min, speed));

/** What reading a ramp found wrong. */
interface RampFlags {
  mended: boolean;
  range: boolean;
}

/**
 * A ramp's readable points, places within 0–1 and speeds within the limits, in order, one per place.
 * @param raw the document's points
 * @param flags set when points were dropped, moved or reordered (`mended`) or speeds clamped (`range`)
 * @returns the points
 */
function readPoints(raw: readonly unknown[], flags: RampFlags): RampPoint[] {
  const points: RampPoint[] = [];
  for (const entry of raw) {
    const at = isRecord(entry) ? finite(entry.at) : null;
    const speed = isRecord(entry) ? finite(entry.v) : null;
    if (at === null || speed === null) {
      flags.mended = true;
      continue;
    }
    const point = { at: Math.min(1, Math.max(0, at)), v: withinLimits(speed) };
    if (point.at !== at) flags.mended = true;
    if (point.v !== speed) flags.range = true;
    points.push(point);
  }
  const ordered = [...points].sort((left, right) => left.at - right.at);
  if (ordered.some((point, index) => point !== points[index])) flags.mended = true;
  const single = ordered.filter((point, index) => index === 0 || point.at !== ordered[index - 1]?.at);
  if (single.length !== ordered.length) flags.mended = true;
  return single;
}

/**
 * A document's ramp and its span (D-050): 2–10 readable points, mended into order with ends at 0 and 1; a span that
 * isn't two numbers in order drops the ramp with it.
 * @param entry the document's clip
 * @param dropped the gate's reasons, each added once
 * @returns the ramp fields, or null when there is no usable ramp
 */
function readRamp(entry: Record<string, unknown>, dropped: string[]): Pick<SpeedFields, 'ramp' | 'rampSpan'> | null {
  const raw = entry.ramp;
  if (!Array.isArray(raw) || raw.length > RAMP_LIMITS.maxPoints) {
    sayOnce(dropped, SPEED_REASONS.ramp);
    return null;
  }
  const flags: RampFlags = { mended: false, range: false };
  const points = readPoints(raw, flags);
  const span = entry.rampSpan;
  const from = Array.isArray(span) ? finite(span[0]) : null;
  const to = Array.isArray(span) ? finite(span[1]) : null;
  const spanBad = span !== undefined && (from === null || to === null || from >= to || (span as unknown[]).length !== 2);
  const first = points.at(0);
  const last = points.at(-1);
  if (points.length < RAMP_LIMITS.minPoints || spanBad || !first || !last) {
    sayOnce(dropped, SPEED_REASONS.ramp);
    return null;
  }
  if (first.at !== 0 || last.at !== 1) flags.mended = true;
  points[0] = { ...first, at: 0 };
  points[points.length - 1] = { ...last, at: 1 };
  if (flags.mended) sayOnce(dropped, SPEED_REASONS.mended);
  if (flags.range) sayOnce(dropped, SPEED_REASONS.range);
  if (isSet(entry.speed) || isSet(entry.reverse)) sayOnce(dropped, SPEED_REASONS.both);
  return from !== null && to !== null ? { ramp: points, rampSpan: [from, to] } : { ramp: points };
}

/**
 * A document's freeze frame (D1): its source time within the file and its length 0.1–60 s (2 s when missing).
 * @param entry the document's clip
 * @param srcDur the file's length, seconds
 * @param dropped the gate's reasons, each added once
 * @returns the freeze fields, or null when `freeze` isn't a number
 */
function readFreeze(entry: Record<string, unknown>, srcDur: number, dropped: string[]): { freeze: number; dur: number } | null {
  const at = finite(entry.freeze);
  if (at === null) {
    if (isSet(entry.freeze)) sayOnce(dropped, SPEED_REASONS.unread);
    return null;
  }
  const freeze = Math.min(srcDur, Math.max(0, at));
  const length = finite(entry.dur);
  // A video clip saves `dur` 0: no length of its own yet.
  const dur = length === null || length <= 0 ? FREEZE_SECONDS : Math.min(FREEZE_LIMITS.max, Math.max(FREEZE_LIMITS.min, length));
  if (freeze !== at || dur !== length) sayOnce(dropped, SPEED_REASONS.freeze);
  if (isSet(entry.speed) || isSet(entry.reverse) || isSet(entry.ramp) || isSet(entry.rampSpan))
    sayOnce(dropped, SPEED_REASONS.still);
  return { freeze, dur };
}

/**
 * A document's constant speed and reverse: the speed within 0.1–10× (none at 1×), reverse only when `true`.
 * @param entry the document's clip
 * @param dropped the gate's reasons, each added once
 * @returns the fields
 */
function readConstant(entry: Record<string, unknown>, dropped: string[]): Pick<SpeedFields, 'speed' | 'reverse'> {
  const fields: Pick<SpeedFields, 'speed' | 'reverse'> = {};
  const speed = finite(entry.speed);
  if (speed === null) {
    if (isSet(entry.speed)) sayOnce(dropped, SPEED_REASONS.unread);
  } else {
    const kept = withinLimits(speed);
    if (kept !== speed) sayOnce(dropped, SPEED_REASONS.range);
    if (kept !== 1) fields.speed = kept;
  }
  if (entry.reverse === true) fields.reverse = true;
  else if (isSet(entry.reverse)) sayOnce(dropped, SPEED_REASONS.unread);
  return fields;
}

/**
 * A saved clip's speed fields (AC-9): a photo has none; a freeze frame only its time and length; a ramp (and its span)
 * replaces a speed and reverse; else a constant speed and reverse. Never throws.
 * @param entry the document's clip
 * @param kind the clip's kind
 * @param srcDur the video's length, seconds
 * @param dropped the gate's reasons, each added once
 * @returns the fields to put on the clip; `dur` only for a freeze frame
 */
export function mergeSpeed(
  entry: Record<string, unknown>,
  kind: 'photo' | 'video',
  srcDur: number,
  dropped: string[],
): SpeedFields & { dur?: number } {
  if (kind === 'photo') {
    if (['speed', 'reverse', 'ramp', 'rampSpan', 'freeze'].some((field) => isSet(entry[field]))) sayOnce(dropped, SPEED_REASONS.unread);
    return {};
  }
  const freeze = readFreeze(entry, srcDur, dropped);
  if (freeze) return freeze;
  const ramp = isSet(entry.ramp) ? readRamp(entry, dropped) : null;
  return ramp ?? readConstant(entry, dropped);
}
