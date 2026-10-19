/*
 * Media ids (408 §2, D3): a file's id is its fingerprint, so the same file added twice, or to two projects, has one id
 * and is stored once. The fingerprint is the size, the type and an FNV-1a hash of the first and last 64 KB, read with
 * `Blob.slice`: a 4 GB video costs 128 KB of reading. Two different files collide only with the same size, type and
 * 128 KB of ends.
 */

/** Bytes read from each end of a file. */
export const MEDIA_KEY_SAMPLE = 64 * 1024;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a over bytes, from a running hash.
 * @param bytes the bytes
 * @param hash the hash so far
 * @returns the 32-bit hash
 */
function fnv(bytes: Uint8Array, hash = FNV_OFFSET): number {
  let next = hash;
  for (const byte of bytes) {
    next ^= byte;
    next = Math.imul(next, FNV_PRIME);
  }
  return next >>> 0;
}

/**
 * A 32-bit hash in base 36, always 7 characters.
 * @param hash the hash
 * @returns its text
 */
const base36 = (hash: number): string => hash.toString(36).padStart(7, '0');

/**
 * A file's media id: `m<size>-<type hash>-<first 64 KB hash><last 64 KB hash>`, all base 36 (at most 32 characters,
 * a valid project media id).
 * @param file the file (a Blob, or anything with its size, type and `slice`)
 * @returns the id
 */
export async function mediaKey(file: Pick<Blob, 'size' | 'type' | 'slice'>): Promise<string> {
  const head = new Uint8Array(await file.slice(0, MEDIA_KEY_SAMPLE).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - MEDIA_KEY_SAMPLE)).arrayBuffer());
  const type = fnv(new TextEncoder().encode(file.type));
  return `m${file.size.toString(36)}-${base36(type)}-${base36(fnv(head))}${base36(fnv(tail))}`;
}
