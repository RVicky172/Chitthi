/*
 * A short fingerprint of an image URL, so the same photo can be recognised on a design and in the library without
 * comparing (or hashing) multi-megabyte data URLs: the length plus an FNV-1a hash of ~4 KB taken from the start and
 * the end of the data.
 */
const keys = new Map<string, string>();

export function photoKey(url: string): string {
  if (!url) return '';
  // Short URLs (sample files) are their own key.
  if (url.length < 512) return url;
  const hit = keys.get(url);
  if (hit) return hit;
  const sample = url.slice(64, 2112) + url.slice(-2048);
  let h = 0x811c9dc5;
  for (let i = 0; i < sample.length; i++) {
    h ^= sample.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const k = `${url.length.toString(36)}-${(h >>> 0).toString(36)}`;
  // Keep the lookup small: it only saves re-hashing the same strings.
  if (keys.size > 500) keys.clear();
  keys.set(url, k);
  return k;
}
