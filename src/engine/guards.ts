/*
 * Type guards for data read from outside (saved projects, documents, agent arguments): they narrow `unknown` to a
 * typed value, so the gates check instead of casting (specs/coding-standards.md §6). Free of DOM and React.
 */

/**
 * Whether a value is a plain object (not null, not an array), whose fields can then be read.
 * @param value anything
 * @returns true for an object such as `{ to: 'clip-2' }`
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A record's keys, typed as its key type (`Object.keys` gives plain strings).
 * @param record a record whose keys are all of type `K`, e.g. an item's keyframes
 * @returns its own enumerable keys
 */
export function keysOf<K extends string>(record: Partial<Record<K, unknown>>): K[] {
  // The one cast: the record's type says every own key is a K (records built in this app, or by a gate that read them).
  return Object.keys(record) as K[];
}

/**
 * Whether a value is one of a list of known values, e.g. a transition kind or a frame rate.
 * @param options the known values
 * @param value anything
 * @returns true when `value` is one of `options`
 */
export function isOneOf<T extends string | number>(options: readonly T[], value: unknown): value is T {
  return options.some((option) => option === value);
}

/**
 * Whether a value is any object (arrays included), whose fields can then be read: the looser check of the older gates
 * (masks, layers), kept so they accept exactly what they did.
 * @param value anything
 * @returns true for a non-null object
 */
export function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The first entry of a built-in table that is never empty (sizes, themes), used as its fallback.
 * @param table the table
 * @returns its first entry
 * @throws when the table is empty: a programming error, not bad input
 */
export function firstOf<T>(table: readonly T[]): T {
  const first = table.at(0);
  if (first === undefined) throw new Error('A built-in table is empty.');
  return first;
}
