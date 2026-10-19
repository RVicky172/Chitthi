import { describe, expect, it } from 'vitest';
import { MEDIA_KEY_SAMPLE, mediaKey } from '@/engine/mediaKey';
import { seededRandom } from '../../support/seededRandom';

/*
 * 408 T013 (AC-4): a file's media id is its fingerprint (size, type, the first and last 64 KB), so the same file has
 * one id wherever it is added, and a 4 GB file costs 128 KB of reading.
 */

const ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Bytes that look random, the same for the same seed.
 * @param length how many
 * @param seed the seed
 * @returns the bytes
 */
function noise(length: number, seed = 7): Uint8Array<ArrayBuffer> {
  const random = seededRandom(seed);
  return Uint8Array.from({ length }, () => Math.floor(random() * 256));
}

const fileOf = (bytes: Uint8Array<ArrayBuffer>, type = 'video/mp4') => new Blob([bytes], { type });

/** A huge file that isn't in memory: its bytes are made up when read, and every read is counted. */
class HugeBlob {
  readonly type = 'video/mp4';
  read = 0;

  /**
   * @param size the file's size, bytes
   */
  constructor(readonly size: number) {}

  /**
   * A part of the file.
   * @param start first byte
   * @param end byte after the last
   * @returns the part, as a real Blob
   */
  slice(start = 0, end = this.size): Blob {
    const length = Math.max(0, Math.min(end, this.size) - start);
    this.read += length;
    return new Blob([noise(length, start)]);
  }
}

describe('408 AC-4: media ids (mediaKey)', () => {
  const bytes = noise(300_000);

  it('the same bytes give the same id, a valid project media id', async () => {
    const first = await mediaKey(fileOf(bytes));
    expect(await mediaKey(fileOf(bytes.slice()))).toBe(first);
    expect(first).toMatch(ID);
  });

  it.each([
    ['the first byte', 0],
    ['the last byte of the first 64 KB', MEDIA_KEY_SAMPLE - 1],
    ['the first byte of the last 64 KB', bytes.length - MEDIA_KEY_SAMPLE],
    ['the last byte', bytes.length - 1],
  ])('one byte changed at %s gives another id', async (_, at) => {
    const changed = bytes.slice();
    changed[at] = (changed[at] ?? 0) ^ 1;
    expect(await mediaKey(fileOf(changed))).not.toBe(await mediaKey(fileOf(bytes)));
  });

  it('a different size or type gives another id', async () => {
    const id = await mediaKey(fileOf(bytes));
    expect(await mediaKey(fileOf(bytes.slice(0, -1)))).not.toBe(id);
    expect(await mediaKey(fileOf(bytes, 'video/quicktime'))).not.toBe(id);
  });

  it('a file smaller than 128 KB, and an empty one, have ids', async () => {
    expect(await mediaKey(fileOf(noise(10)))).toMatch(ID);
    expect(await mediaKey(fileOf(new Uint8Array(0), ''))).toMatch(ID);
    expect(await mediaKey(fileOf(noise(10)))).not.toBe(await mediaKey(fileOf(noise(11))));
  });

  it('a 4 GB file: only its first and last 64 KB are read', async () => {
    const huge = new HugeBlob(4 * 2 ** 30);
    const id = await mediaKey(huge);
    expect(id).toMatch(ID);
    expect(huge.read).toBe(2 * MEDIA_KEY_SAMPLE);
    expect(await mediaKey(new HugeBlob(4 * 2 ** 30))).toBe(id);
  });
});
