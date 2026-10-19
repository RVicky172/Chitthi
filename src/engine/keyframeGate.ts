/*
 * The document gate for keyframes (205 §10): an item's keys as read from a saved project, checked and clamped, within
 * the project's 5,000 keys. Never throws; each problem is reported once as a reason the user sees.
 */
import { isOneOf, isRecord } from './guards';
import {
  EASES,
  clampValue,
  tidyKeys,
  type ClipKeyProp,
  type Ease,
  type Keyframe,
  type Keyframes,
  type LayerKeyProp,
  type KeyTarget,
} from './keyframes';

/**
 * How many keyframes a document may hold: per value and in the whole project. Here, not in keyframes.ts, because this
 * module's top level reads it and keyframes.ts is in an import cycle with it (through layers.ts).
 */
export const KEY_LIMITS = { perValue: 100, perProject: 5000 } as const;

/** What the gate has left of the project's 5,000 keys, and where its reasons go (each reason once). */
export interface KeyBudget {
  left: number;
  dropped: string[];
}

/**
 * A fresh budget for reading a project's keys.
 * @param dropped where the gate's reasons go
 * @returns the budget, with all 5,000 keys left
 */
export const keyBudget = (dropped: string[] = []): KeyBudget => ({ left: KEY_LIMITS.perProject, dropped });

/** The longest key time the gate accepts either side of an item's start, seconds (a day, as clip times). */
const MAX_KEY_TIME = 86400;

const KEY_REASONS = {
  unread: 'Some keyframes couldn’t be read and were left out.',
  adjusted: 'Some keyframe values were out of range and were adjusted.',
  ease: 'Some keyframes had an unknown interpolation and now ease in and out.',
  same: 'Some keyframes were at the same time; the last of each was kept.',
  perValue: `A value can have at most ${KEY_LIMITS.perValue} keyframes; the rest were left out.`,
  perProject: `A project can have at most ${KEY_LIMITS.perProject.toLocaleString('en')} keyframes; the rest were left out.`,
} as const;

/**
 * Reads one key from a document.
 * @param entry the document's key
 * @param prop the value it is for
 * @param on whether the item is a clip or a layer
 * @param note records a gate reason (each once)
 * @returns the key (value clamped, unknown ease → Ease in and out), or null when its time or value can't be read
 */
function readKey(
  entry: unknown,
  prop: ClipKeyProp | LayerKeyProp,
  on: KeyTarget,
  note: (reason: string) => void,
): Keyframe | null {
  const time = isRecord(entry) ? entry.t : undefined;
  const raw = isRecord(entry) ? entry.v : undefined;
  if (
    typeof time !== 'number' ||
    typeof raw !== 'number' ||
    !Number.isFinite(time) ||
    !Number.isFinite(raw) ||
    Math.abs(time) > MAX_KEY_TIME
  ) {
    note(KEY_REASONS.unread);
    return null;
  }
  const value = clampValue(prop, raw, on);
  if (value !== raw) note(KEY_REASONS.adjusted);
  let ease: Ease = 'ease-in-out';
  if (isRecord(entry) && isOneOf(EASES, entry.ease)) ease = entry.ease;
  else note(KEY_REASONS.ease);
  return { t: time, v: value, ease };
}

/**
 * One value's keys as the gate keeps them: sorted (the last of equal times kept), at most 100, and no more than the
 * project has left.
 * @param read the keys read, in the document's order
 * @param budget the project's keys left and the gate's reasons
 * @param note records a gate reason (each once)
 * @returns the list (the budget is charged for it)
 */
function settleList(read: Keyframe[], budget: KeyBudget, note: (reason: string) => void): Keyframe[] {
  // A stable sort keeps the document's order among equal times, so the last of them is the one written last.
  read.sort((left, right) => left.t - right.t);
  let list: Keyframe[] = [];
  for (const key of read) {
    if (list.at(-1)?.t === key.t) {
      note(KEY_REASONS.same);
      list[list.length - 1] = key;
    } else list.push(key);
  }
  if (list.length > KEY_LIMITS.perValue) {
    note(KEY_REASONS.perValue);
    list = list.slice(0, KEY_LIMITS.perValue);
  }
  if (list.length > budget.left) {
    note(KEY_REASONS.perProject);
    list = list.slice(0, budget.left);
  }
  budget.left -= list.length;
  return list;
}

/**
 * The gate for an item's keyframes from a document: only `props` are read; keys need a finite time (within a day of the
 * item's start) and value; values are clamped, unknown eases become Ease in and out, lists are sorted (the last of
 * equal times kept) and cut to 100 per value and to what is left of the project's 5,000. Never throws.
 * @param raw the document's `keys` field
 * @param props the values the item can animate
 * @param on whether the item is a clip or a layer
 * @param budget the project's keys left and the gate's reasons
 * @returns the keys, or undefined when nothing is left
 */
export function mergeKeys<P extends ClipKeyProp | LayerKeyProp>(
  raw: unknown,
  props: readonly P[],
  on: KeyTarget,
  budget: KeyBudget,
): Keyframes<P> | undefined {
  const note = (reason: string) => {
    if (!budget.dropped.includes(reason)) budget.dropped.push(reason);
  };
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    note(KEY_REASONS.unread);
    return undefined;
  }
  const merged: Keyframes<P> = {};
  for (const [name, rawList] of Object.entries(raw)) {
    if (!isOneOf(props, name) || !Array.isArray(rawList)) {
      note(KEY_REASONS.unread);
      continue;
    }
    const read: Keyframe[] = [];
    for (const entry of rawList) {
      const key = readKey(entry, name, on, note);
      if (key) read.push(key);
    }
    const list = settleList(read, budget, note);
    if (list.length > 0) merged[name] = list;
  }
  return tidyKeys(merged);
}
