/*
 * Short random tags for record ids (saved designs, stored photos): unique enough next to a timestamp, from the
 * browser's cryptographic random source (407 T041).
 */

/**
 * Four random base-36 characters.
 * @returns the tag, e.g. `k3x0`
 */
export function randomTag(): string {
  const random = crypto.getRandomValues(new Uint32Array(1)).at(0) ?? 0;
  return (random % 36 ** 4).toString(36).padStart(4, '0');
}

/**
 * A new record id: a prefix, the time in base 36 and a random tag.
 * @param prefix one letter saying what the record is (`d` a saved design, `s` a stored photo)
 * @returns the id
 */
export const newRecordId = (prefix: string): string => prefix + Date.now().toString(36) + randomTag();
