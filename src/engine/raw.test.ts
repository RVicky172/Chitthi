import { describe, expect, it } from 'vitest';
import { decodeSrgb, embeddedJpeg, encodeSrgb, isRawName, rawToRgba8 } from './raw';
import { buildTiff, syntheticDng, tiff16 } from './tiff';

/** A minimal complete JPEG: SOI, a frame header, a scan with data (stuffed FF 00 and a restart marker), EOI. */
function jpeg(fill: number, len: number): Uint8Array {
  const head = [0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0];
  const data = Array.from({ length: len }, (_, i) => (i === 10 ? 0xff : i === 11 ? 0x00 : i === 20 ? 0xff : i === 21 ? 0xd3 : fill));
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
    const got = embeddedJpeg(file)!;
    expect(got.length).toBe(big.length);
    expect(got[got.length - 1]).toBe(0xd9);
    expect(got[100]).toBe(2);
    // A JPEG cut short, or only a thumbnail-sized one, isn't taken.
    expect(embeddedJpeg(big.subarray(0, 2000))).toBeNull();
    expect(embeddedJpeg(jpeg(1, 100))).toBeNull();
  });

  it('develop to an 8-bit sRGB preview averaged in linear light', () => {
    // 4 × 2 pixels: left half black and white alternating, right half mid grey (linear 0.5).
    const d = new Uint16Array(4 * 2 * 3);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 4; x++) d.fill(x < 2 ? ((x + y) % 2 ? 65535 : 0) : 32768, (y * 4 + x) * 3, (y * 4 + x) * 3 + 3);
    const p = rawToRgba8({ width: 4, height: 2, data: d }, 2);
    expect([p.width, p.height]).toEqual([2, 1]);
    // Half the light averages to linear 0.5 (sRGB 188), like the grey: not the 128 that averaging sRGB values gives.
    expect(p.data[0]).toBe(p.data[4]);
    expect(p.data[0]).toBe(Math.round(encodeSrgb(0.5) * 255));
  });

  it('round-trip sRGB encoding', () => {
    for (const v of [0, 0.001, 0.2, 0.5, 1]) expect(decodeSrgb(encodeSrgb(v))).toBeCloseTo(v, 6);
  });
});

describe('TIFF writer', () => {
  it('writes a 16-bit RGB TIFF with every tag a reader needs', () => {
    const rgb = new Uint16Array([0, 1000, 65535, 65535, 0, 1]);
    const f = tiff16(2, 1, rgb),
      v = new DataView(f.buffer);
    expect([...f.subarray(0, 4)]).toEqual([0x49, 0x49, 42, 0]);
    const ifd = v.getUint32(4, true),
      n = v.getUint16(ifd, true),
      tags = new Map<number, { type: number; count: number; at: number }>();
    for (let i = 0; i < n; i++) {
      const at = ifd + 2 + i * 12;
      tags.set(v.getUint16(at, true), { type: v.getUint16(at + 2, true), count: v.getUint32(at + 4, true), at: at + 8 });
    }
    expect([...tags.keys()]).toEqual([...tags.keys()].sort((a, b) => a - b));
    expect(v.getUint32(tags.get(256)!.at, true)).toBe(2);
    expect(v.getUint16(tags.get(262)!.at, true)).toBe(2);
    const bits = v.getUint32(tags.get(258)!.at, true);
    expect([v.getUint16(bits, true), v.getUint16(bits + 2, true), v.getUint16(bits + 4, true)]).toEqual([16, 16, 16]);
    const strip = v.getUint32(tags.get(273)!.at, true);
    expect(v.getUint32(tags.get(279)!.at, true)).toBe(12);
    expect([0, 1, 2, 3, 4, 5].map((i) => v.getUint16(strip + i * 2, true))).toEqual([...rgb]);
    expect(strip + 12).toBe(f.length);
  });

  it('puts short values inside the entry and longer ones after the directory', () => {
    const f = buildTiff([{ tag: 305, type: 'ascii', value: 'ab' }, { tag: 270, type: 'ascii', value: 'a longer description' }], new Uint8Array(2));
    const text = new TextDecoder().decode(f);
    expect(text).toContain('a longer description');
    expect(text).toContain('ab');
  });

  it('can write a synthetic DNG, with a preview JPEG after its raw data', () => {
    const dng = syntheticDng(jpeg(3, 3000));
    expect([...dng.subarray(0, 4)]).toEqual([0x49, 0x49, 42, 0]);
    expect(dng.length).toBeGreaterThan(192 * 128 * 2);
    expect(embeddedJpeg(dng)!.length).toBe(jpeg(3, 3000).length);
  });
});
