/**
 * The value, or a thrown error when it is missing: a test's "this must be there" without a non-null assertion (`!`),
 * so a missing value fails with what was missing instead of a TypeError further on.
 * @param value what may be null or undefined
 * @param what what it is, for the error
 * @returns the value
 */
export function defined<T>(value: T, what = 'value'): NonNullable<T> {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to be defined.`);
  return value;
}
