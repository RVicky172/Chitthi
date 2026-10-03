import { describe, expect, it } from 'vitest';
import { canEncode, encodePhoto, isPhotoType, PHOTO_TYPE_IDS, PHOTO_TYPES, type Encoder } from './photoExport';

/** An encoder like a browser's: writes the types it knows, and PNG for any other (as toBlob does). */
const browser =
  (knows: string[]): Encoder =>
  async (mime) =>
    new Blob(['x'], { type: knows.includes(mime) ? mime : 'image/png' });
const cv = {} as HTMLCanvasElement;

describe('photo export types', () => {
  it('cover JPEG, PNG, WebP and AVIF, each with its own type and extension', () => {
    expect(PHOTO_TYPE_IDS).toEqual(['jpeg', 'png', 'webp', 'avif']);
    expect(new Set(PHOTO_TYPE_IDS.map((t) => PHOTO_TYPES[t].ext)).size).toBe(4);
    expect(PHOTO_TYPES.png.lossy).toBe(false);
    expect([isPhotoType('webp'), isPhotoType('gif'), isPhotoType(3)]).toEqual([true, false, false]);
  });
  it('are found writable only when the browser really writes them', async () => {
    const chrome = browser(['image/jpeg', 'image/png', 'image/webp']);
    expect(await canEncode('webp', chrome)).toBe(true);
    expect(await canEncode('avif', chrome)).toBe(false);
    expect(await canEncode('jpeg', browser([]))).toBe(true);
  });
  it('refuse a file the browser quietly wrote as something else', async () => {
    await expect(encodePhoto(cv, 'avif', 90, browser(['image/png']))).rejects.toThrow(/can’t write AVIF/);
    await expect(encodePhoto(cv, 'webp', 90, async () => null)).rejects.toThrow(/couldn’t be encoded/);
    expect((await encodePhoto(cv, 'webp', 90, browser(['image/webp']))).type).toBe('image/webp');
  });
  it('pass quality as 0–1 for lossy types and leave PNG at full', async () => {
    const seen: number[] = [];
    const spy: Encoder = async (mime, q) => (seen.push(q), new Blob(['x'], { type: mime }));
    await encodePhoto(cv, 'jpeg', 85, spy);
    await encodePhoto(cv, 'png', 85, spy);
    await encodePhoto(cv, 'webp', 400, spy);
    expect(seen).toEqual([0.85, 1, 1]);
  });
});
