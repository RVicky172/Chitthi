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
