/*
 * A small TIFF writer (P1.9), like the PNG pHYs helper: one image file directory, uncompressed, little-endian. Used for
 * the photo editor's 16-bit TIFF export (tiff16) and, by the tests, to write a synthetic DNG (a DNG is a TIFF with
 * camera tags). No imports, so Node scripts can load it directly.
 */

export type TiffType = 'byte' | 'ascii' | 'short' | 'long' | 'rational' | 'srational';

export interface TiffEntry {
  tag: number;
  type: TiffType;
  /** Numbers (rationals as decimals), or the text of an ASCII tag. */
  value: readonly number[] | string;
}

const TYPE: Record<TiffType, [code: number, size: number]> = {
  byte: [1, 1],
  ascii: [2, 1],
  short: [3, 2],
  long: [4, 4],
  rational: [5, 8],
  srational: [10, 8],
};

/** Tags the writer fills in itself: where the pixel data is and how long it is. */
const STRIP_OFFSETS = 273,
  STRIP_BYTES = 279;

/**
 * A TIFF file with one IFD holding `entries` (StripOffsets and StripByteCounts are added) and the pixel data as one
 * strip. `extra` bytes, if given, follow the strip (the tests put a preview JPEG there, as cameras do).
 */
export function buildTiff(entries: readonly TiffEntry[], strip: Uint8Array, extra?: Uint8Array): Uint8Array {
  const all = [
    ...entries.filter((e) => e.tag !== STRIP_OFFSETS && e.tag !== STRIP_BYTES),
    { tag: STRIP_OFFSETS, type: 'long' as const, value: [0] },
    { tag: STRIP_BYTES, type: 'long' as const, value: [strip.length] },
  ].sort((a, b) => a.tag - b.tag);
  const count = (e: TiffEntry) => (typeof e.value === 'string' ? e.value.length + 1 : e.value.length);
  const bytes = (e: TiffEntry) => count(e) * TYPE[e.type][1];
  const ifd = 8,
    ifdSize = 2 + all.length * 12 + 4;
  let extraAt = ifd + ifdSize;
  const outOfLine = all.map((e) => {
    if (bytes(e) <= 4) return -1;
    const at = extraAt + (extraAt % 2);
    extraAt = at + bytes(e);
    return at;
  });
  const stripAt = extraAt + (extraAt % 2);
  const total = stripAt + strip.length + (extra?.length ?? 0);
  const buf = new Uint8Array(total),
    v = new DataView(buf.buffer);
  buf.set([0x49, 0x49, 42, 0]);
  v.setUint32(4, ifd, true);
  v.setUint16(ifd, all.length, true);
  const put = (e: TiffEntry, at: number) => {
    if (typeof e.value === 'string') {
      for (let i = 0; i < e.value.length; i++) buf[at + i] = e.value.charCodeAt(i) & 0x7f;
      return;
    }
    e.value.forEach((x, i) => {
      const o = at + i * TYPE[e.type][1];
      if (e.type === 'byte') buf[o] = x;
      else if (e.type === 'short') v.setUint16(o, x, true);
      else if (e.type === 'long') v.setUint32(o, x, true);
      else {
        // Rationals as n / 10000: enough for colour matrices and resolutions.
        const den = 10000,
          num = Math.round(x * den);
        if (e.type === 'rational') v.setUint32(o, Math.max(0, num), true);
        else v.setInt32(o, num, true);
        v.setUint32(o + 4, den, true);
      }
    });
  };
  all.forEach((e, k) => {
    const at = ifd + 2 + k * 12;
    v.setUint16(at, e.tag, true);
    v.setUint16(at + 2, TYPE[e.type][0], true);
    v.setUint32(at + 4, count(e), true);
    const value = e.tag === STRIP_OFFSETS ? { ...e, value: [stripAt] } : e;
    if (outOfLine[k] < 0) put(value, at + 8);
    else {
      v.setUint32(at + 8, outOfLine[k], true);
      put(value, outOfLine[k]);
    }
  });
  v.setUint32(ifd + 2 + all.length * 12, 0, true);
  buf.set(strip, stripAt);
  if (extra) buf.set(extra, stripAt + strip.length);
  return buf;
}

/**
 * A 16-bit RGB TIFF: w × h pixels, rgb holding three values per pixel (0–65535, sRGB-encoded), top row first. Opens
 * in every photo editor; 72 ppi like the PNG and JPEG exports.
 */
export function tiff16(w: number, h: number, rgb: Uint16Array, software = 'Chitthi Studio'): Uint8Array {
  if (rgb.length !== w * h * 3) throw new Error('tiff16: wrong number of values');
  const strip = new Uint8Array(rgb.length * 2),
    v = new DataView(strip.buffer);
  for (let i = 0; i < rgb.length; i++) v.setUint16(i * 2, rgb[i], true);
  return buildTiff(
    [
      { tag: 256, type: 'long', value: [w] },
      { tag: 257, type: 'long', value: [h] },
      { tag: 258, type: 'short', value: [16, 16, 16] },
      { tag: 259, type: 'short', value: [1] },
      { tag: 262, type: 'short', value: [2] },
      { tag: 277, type: 'short', value: [3] },
      { tag: 278, type: 'long', value: [h] },
      { tag: 282, type: 'rational', value: [72] },
      { tag: 283, type: 'rational', value: [72] },
      { tag: 284, type: 'short', value: [1] },
      { tag: 296, type: 'short', value: [2] },
      { tag: 305, type: 'ascii', value: software },
    ],
    strip,
  );
}

/**
 * For tests (P1.9): a small synthetic DNG that LibRaw can develop, with no camera or photo behind it, so no licence
 * question. 192 × 128 sensor pixels in an RGGB mosaic, linear 16-bit: on top, red, green and blue patches (left to
 * right); below, a grey ramp from black to white. Its colour matrix is XYZ to linear sRGB, so the camera's colours are
 * sRGB's. `preview` (a JPEG) is stored after the raw data, as cameras store theirs, for the embedded-preview reader.
 */
export function syntheticDng(preview?: Uint8Array): Uint8Array {
  const W = 192,
    H = 128,
    strip = new Uint8Array(W * H * 2),
    v = new DataView(strip.buffer);
  const patch = [
    [0.6, 0.04, 0.04],
    [0.04, 0.5, 0.04],
    [0.04, 0.06, 0.6],
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const rgb = y < H / 2 ? patch[Math.min(2, Math.floor((x * 3) / W))] : [x / (W - 1), x / (W - 1), x / (W - 1)];
      // RGGB: red at even row and column, blue at odd row and column, green elsewhere.
      const c = y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : x % 2 === 0 ? 1 : 2;
      v.setUint16((y * W + x) * 2, Math.round(rgb[c] * 65535), true);
    }
  const XYZ_TO_SRGB = [3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.204, 1.057];
  return buildTiff(
    [
      { tag: 254, type: 'long', value: [0] },
      { tag: 256, type: 'long', value: [W] },
      { tag: 257, type: 'long', value: [H] },
      { tag: 258, type: 'short', value: [16] },
      { tag: 259, type: 'short', value: [1] },
      { tag: 262, type: 'short', value: [32803] },
      { tag: 271, type: 'ascii', value: 'Chitthi' },
      { tag: 272, type: 'ascii', value: 'Synthetic test' },
      { tag: 274, type: 'short', value: [1] },
      { tag: 277, type: 'short', value: [1] },
      { tag: 278, type: 'long', value: [H] },
      { tag: 284, type: 'short', value: [1] },
      { tag: 33421, type: 'short', value: [2, 2] },
      { tag: 33422, type: 'byte', value: [0, 1, 1, 2] },
      { tag: 50706, type: 'byte', value: [1, 4, 0, 0] },
      { tag: 50707, type: 'byte', value: [1, 1, 0, 0] },
      { tag: 50708, type: 'ascii', value: 'Chitthi Synthetic test' },
      { tag: 50714, type: 'long', value: [0] },
      { tag: 50717, type: 'long', value: [65535] },
      { tag: 50721, type: 'srational', value: XYZ_TO_SRGB },
      { tag: 50728, type: 'rational', value: [1, 1, 1] },
      { tag: 50778, type: 'short', value: [21] },
    ],
    strip,
    preview,
  );
}
