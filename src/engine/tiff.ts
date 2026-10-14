/*
 * A small TIFF writer (P1.9), like the PNG pHYs helper: one image file directory, uncompressed, little-endian. Used for
 * the photo editor's 16-bit TIFF export (tiff16) and, by the tests, to write a synthetic DNG (a DNG is a TIFF with
 * camera tags). No imports, so Node scripts can load it directly.
 */

/** A TIFF field type. */
export type TiffType = 'byte' | 'ascii' | 'short' | 'long' | 'rational' | 'srational';

/** One tag of the image file directory. */
export interface TiffEntry {
  tag: number;
  type: TiffType;
  /** Numbers (rationals as decimals), or the text of an ASCII tag. */
  value: readonly number[] | string;
}

/** Each type's code and size in bytes. */
const TYPE: Record<TiffType, readonly [code: number, size: number]> = {
  byte: [1, 1],
  ascii: [2, 1],
  short: [3, 2],
  long: [4, 4],
  rational: [5, 8],
  srational: [10, 8],
};

/** The tag the writer fills in itself: where the pixel data is. */
const STRIP_OFFSETS = 273;

/** The tag the writer fills in itself: how long the pixel data is. */
const STRIP_BYTES = 279;

/** Where the image file directory starts. */
const IFD = 8;

/**
 * How many values a tag holds.
 * @param entry the tag
 * @returns its count (an ASCII tag's text and its terminating 0)
 */
const countOf = (entry: TiffEntry): number => (typeof entry.value === 'string' ? entry.value.length + 1 : entry.value.length);

/**
 * How many bytes a tag's values take.
 * @param entry the tag
 * @returns bytes
 */
const bytesOf = (entry: TiffEntry): number => countOf(entry) * TYPE[entry.type][1];

/**
 * An even offset at or after one (TIFF values start on word boundaries).
 * @param offset any offset
 * @returns the offset, rounded up to even
 */
const even = (offset: number): number => offset + (offset % 2);

/** Where everything goes in the file. */
interface TiffLayout {
  /** Per tag, where its values go when they don't fit the entry's four bytes (-1: in the entry). */
  outOfLine: number[];
  /** Where the pixel data starts. */
  stripAt: number;
}

/**
 * Lays out the values that don't fit their entries, after the directory, then the strip.
 * @param entries the tags, sorted
 * @returns the layout
 */
function layout(entries: readonly TiffEntry[]): TiffLayout {
  let next = IFD + 2 + entries.length * 12 + 4;
  const outOfLine = entries.map((entry) => {
    if (bytesOf(entry) <= 4) return -1;
    const at = even(next);
    next = at + bytesOf(entry);
    return at;
  });
  return { outOfLine, stripAt: even(next) };
}

/**
 * Writes one number of a tag.
 * @param view the file
 * @param type the tag's type
 * @param offset where the number goes
 * @param value the number (a rational as a decimal)
 */
function writeNumber(view: DataView, type: TiffType, offset: number, value: number): void {
  if (type === 'byte') view.setUint8(offset, value);
  else if (type === 'short') view.setUint16(offset, value, true);
  else if (type === 'long') view.setUint32(offset, value, true);
  else {
    // Rationals as n / 10000: enough for colour matrices and resolutions.
    const denominator = 10000;
    const numerator = Math.round(value * denominator);
    if (type === 'rational') view.setUint32(offset, Math.max(0, numerator), true);
    else view.setInt32(offset, numerator, true);
    view.setUint32(offset + 4, denominator, true);
  }
}

/**
 * Writes a tag's values.
 * @param view the file
 * @param entry the tag
 * @param offset where its values go
 */
function writeValues(view: DataView, entry: TiffEntry, offset: number): void {
  const { value } = entry;
  if (typeof value === 'string') {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index) & 0x7f);
    return;
  }
  value.forEach((number, index) => {
    writeNumber(view, entry.type, offset + index * TYPE[entry.type][1], number);
  });
}

/**
 * A TIFF file with one IFD holding `entries` (StripOffsets and StripByteCounts are added) and the pixel data as one
 * strip.
 * @param entries the tags
 * @param strip the pixel data
 * @param extra bytes to follow the strip (the tests put a preview JPEG there, as cameras do)
 * @returns the file
 */
export function buildTiff(entries: readonly TiffEntry[], strip: Uint8Array, extra?: Uint8Array): Uint8Array {
  const all = [
    ...entries.filter((entry) => entry.tag !== STRIP_OFFSETS && entry.tag !== STRIP_BYTES),
    { tag: STRIP_OFFSETS, type: 'long' as const, value: [0] },
    { tag: STRIP_BYTES, type: 'long' as const, value: [strip.length] },
  ].sort((first, second) => first.tag - second.tag);
  const { outOfLine, stripAt } = layout(all);
  const file = new Uint8Array(stripAt + strip.length + (extra?.length ?? 0));
  const view = new DataView(file.buffer);
  file.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, IFD, true);
  view.setUint16(IFD, all.length, true);
  all.forEach((entry, index) => {
    const at = IFD + 2 + index * 12;
    view.setUint16(at, entry.tag, true);
    view.setUint16(at + 2, TYPE[entry.type][0], true);
    view.setUint32(at + 4, countOf(entry), true);
    const written = entry.tag === STRIP_OFFSETS ? { ...entry, value: [stripAt] } : entry;
    const valuesAt = outOfLine[index] ?? -1;
    if (valuesAt < 0) writeValues(view, written, at + 8);
    else {
      view.setUint32(at + 8, valuesAt, true);
      writeValues(view, written, valuesAt);
    }
  });
  view.setUint32(IFD + 2 + all.length * 12, 0, true);
  file.set(strip, stripAt);
  if (extra) file.set(extra, stripAt + strip.length);
  return file;
}

/**
 * A 16-bit RGB TIFF. Opens in every photo editor; 72 ppi like the PNG and JPEG exports.
 * @param width pixels
 * @param height pixels
 * @param rgb three values per pixel (0–65535, sRGB-encoded), top row first
 * @param software the Software tag's text
 * @returns the file
 * @throws {Error} when `rgb` doesn't hold width × height × 3 values
 */
export function tiff16(width: number, height: number, rgb: Uint16Array, software = 'Chitthi Studio'): Uint8Array {
  if (rgb.length !== width * height * 3) throw new Error('tiff16: wrong number of values');
  const strip = new Uint8Array(rgb.length * 2);
  const view = new DataView(strip.buffer);
  rgb.forEach((value, index) => {
    view.setUint16(index * 2, value, true);
  });
  return buildTiff(
    [
      { tag: 256, type: 'long', value: [width] },
      { tag: 257, type: 'long', value: [height] },
      { tag: 258, type: 'short', value: [16, 16, 16] },
      { tag: 259, type: 'short', value: [1] },
      { tag: 262, type: 'short', value: [2] },
      { tag: 277, type: 'short', value: [3] },
      { tag: 278, type: 'long', value: [height] },
      { tag: 282, type: 'rational', value: [72] },
      { tag: 283, type: 'rational', value: [72] },
      { tag: 284, type: 'short', value: [1] },
      { tag: 296, type: 'short', value: [2] },
      { tag: 305, type: 'ascii', value: software },
    ],
    strip,
  );
}

/** The synthetic DNG's top patches: red, green and blue, linear. */
const PATCHES: readonly (readonly [number, number, number])[] = [
  [0.6, 0.04, 0.04],
  [0.04, 0.5, 0.04],
  [0.04, 0.06, 0.6],
];

/** XYZ to linear sRGB, the synthetic DNG's colour matrix. */
const XYZ_TO_SRGB = [3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.204, 1.057];

/**
 * For tests (P1.9): a small synthetic DNG that LibRaw can develop, with no camera or photo behind it, so no licence
 * question. 192 × 128 sensor pixels in an RGGB mosaic, linear 16-bit: on top, red, green and blue patches (left to
 * right); below, a grey ramp from black to white. Its colour matrix is XYZ to linear sRGB, so the camera's colours are
 * sRGB's.
 * @param preview a JPEG stored after the raw data, as cameras store theirs, for the embedded-preview reader
 * @returns the file
 */
export function syntheticDng(preview?: Uint8Array): Uint8Array {
  const width = 192;
  const height = 128;
  const strip = new Uint8Array(width * height * 2);
  const view = new DataView(strip.buffer);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ramp = x / (width - 1);
      const colour = y < height / 2 ? PATCHES.at(Math.min(2, Math.floor((x * 3) / width))) : [ramp, ramp, ramp];
      // RGGB: red at even row and column, blue at odd row and column, green elsewhere.
      const evenRow = y % 2 === 0;
      const evenColumn = x % 2 === 0;
      let channel = 1;
      if (evenRow && evenColumn) channel = 0;
      else if (!evenRow && !evenColumn) channel = 2;
      view.setUint16((y * width + x) * 2, Math.round((colour?.[channel] ?? 0) * 65535), true);
    }
  }
  return buildTiff(
    [
      { tag: 254, type: 'long', value: [0] },
      { tag: 256, type: 'long', value: [width] },
      { tag: 257, type: 'long', value: [height] },
      { tag: 258, type: 'short', value: [16] },
      { tag: 259, type: 'short', value: [1] },
      { tag: 262, type: 'short', value: [32803] },
      { tag: 271, type: 'ascii', value: 'Chitthi' },
      { tag: 272, type: 'ascii', value: 'Synthetic test' },
      { tag: 274, type: 'short', value: [1] },
      { tag: 277, type: 'short', value: [1] },
      { tag: 278, type: 'long', value: [height] },
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
