import { describe, expect, it } from 'vitest';
import { decodeSrgb, embeddedJpeg, encodeSrgb, isRawName, rawToRgba8 } from '@/engine/raw';
import { buildTiff, syntheticDng, tiff16 } from '@/engine/tiff';
import { defined } from '../../support/defined';

/**
 * A minimal complete JPEG: SOI, a frame header, a scan with data (stuffed FF 00 and a restart marker), EOI.
 * @param fill the scan's data byte
 * @param len how many data bytes
 * @returns the file's bytes
 */
function jpeg(fill: number, len: number): Uint8Array {
  const head = [0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0];
  // Bytes 10–11 are a stuffed FF 00, bytes 20–21 a restart marker (FF D3); the rest is `fill`.
  const special: Record<number, number> = { 10: 0xff, 11: 0x00, 20: 0xff, 21: 0xd3 };
  const data = Array.from({ length: len }, (_, index) => special[index] ?? fill);
  return new Uint8Array([...head, ...data, 0xff, 0xd9]);
}

describe('camera RAW files', () => {
  it('are known by their extension', () => {
    expect(['a.CR3', 'b.dng', 'c.NEF', 'd.arw'].every(isRawName)).toBe(true);
    expect(['a.jpg', 'b.tif', 'c', 'd.dng.txt'].some(isRawName)).toBe(false);
  });

  it('give up the largest complete JPEG inside them', () => {
    const small = jpeg(1, 1500),
      big = jpeg(2, 4000);
    const file = new Uint8Array([...new Uint8Array(100), ...small, ...new Uint8Array(50), ...big, 9, 9, 9]);
    const got = defined(embeddedJpeg(file));
    expect(got).toHaveLength(big.length);
    expect(got[got.length - 1]).toBe(0xd9);
    expect(got[100]).toBe(2);
    // A JPEG cut short, or only a thumbnail-sized one, isn't taken.
    expect(embeddedJpeg(big.subarray(0, 2000))).toBeNull();
    expect(embeddedJpeg(jpeg(1, 100))).toBeNull();
  });

  it('develop to an 8-bit sRGB preview averaged in linear light', () => {
    // 4 × 2 pixels: left half black and white alternating, right half mid grey (linear 0.5).
    const values = new Uint16Array(4 * 2 * 3);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 4; x++)
        values.fill(x < 2 ? 65535 * ((x + y) % 2) : 32768, (y * 4 + x) * 3, (y * 4 + x) * 3 + 3);
    const rgba = rawToRgba8({ width: 4, height: 2, data: values }, 2);
    expect([rgba.width, rgba.height]).toEqual([2, 1]);
    // Half the light averages to linear 0.5 (sRGB 188), like the grey: not the 128 that averaging sRGB values gives.
    expect(rgba.data[0]).toBe(rgba.data[4]);
    expect(rgba.data[0]).toBe(Math.round(encodeSrgb(0.5) * 255));
  });

  it('round-trip sRGB encoding', () => {
    for (const value of [0, 0.001, 0.2, 0.5, 1]) expect(decodeSrgb(encodeSrgb(value))).toBeCloseTo(value, 6);
  });
});

describe('TIFF writer', () => {
  it('writes a 16-bit RGB TIFF with every tag a reader needs', () => {
    const rgb = new Uint16Array([0, 1000, 65535, 65535, 0, 1]);
    const bytes = tiff16(2, 1, rgb),
      view = new DataView(bytes.buffer);
    expect([...bytes.subarray(0, 4)]).toEqual([0x49, 0x49, 42, 0]);
    const ifd = view.getUint32(4, true),
      uint16 = view.getUint16(ifd, true),
      tags = new Map<number, { type: number; count: number; at: number }>();
    for (let index = 0; index < uint16; index++) {
      const at = ifd + 2 + index * 12;
      tags.set(view.getUint16(at, true), {
        type: view.getUint16(at + 2, true),
        count: view.getUint32(at + 4, true),
        at: at + 8,
      });
    }
    expect([...tags.keys()]).toEqual([...tags.keys()].sort((left, right) => left - right));
    expect(view.getUint32(defined(tags.get(256)).at, true)).toBe(2);
    expect(view.getUint16(defined(tags.get(262)).at, true)).toBe(2);
    const bits = view.getUint32(defined(tags.get(258)).at, true);
    expect([view.getUint16(bits, true), view.getUint16(bits + 2, true), view.getUint16(bits + 4, true)]).toEqual([
      16, 16, 16,
    ]);
    const strip = view.getUint32(defined(tags.get(273)).at, true);
    expect(view.getUint32(defined(tags.get(279)).at, true)).toBe(12);
    expect([0, 1, 2, 3, 4, 5].map((index) => view.getUint16(strip + index * 2, true))).toEqual([...rgb]);
    expect(strip + 12).toBe(bytes.length);
  });

  it('puts short values inside the entry and longer ones after the directory', () => {
    const bytes = buildTiff(
      [
        { tag: 305, type: 'ascii', value: 'ab' },
        { tag: 270, type: 'ascii', value: 'a longer description' },
      ],
      new Uint8Array(2),
    );
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('a longer description');
    expect(text).toContain('ab');
  });

  it('can write a synthetic DNG, with a preview JPEG after its raw data', () => {
    const dng = syntheticDng(jpeg(3, 3000));
    expect([...dng.subarray(0, 4)]).toEqual([0x49, 0x49, 42, 0]);
    expect(dng.length).toBeGreaterThan(192 * 128 * 2);
    expect(defined(embeddedJpeg(dng))).toHaveLength(jpeg(3, 3000).length);
  });
});
