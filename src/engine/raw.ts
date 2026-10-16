/*
 * Camera RAW photos (P1.9), free of DOM and React. The desktop app develops RAW files with LibRaw (electron/raw.cjs)
 * into 16-bit linear RGB with sRGB primaries; here that becomes the editor's 8-bit preview and the 16-bit export's
 * linear source. The web app can't run LibRaw, so it opens the JPEG preview every camera stores inside the RAW file.
 */

/** File types the photo studio treats as camera RAW (electron/raw.cjs accepts the same). */
export const RAW_EXTS = ['dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'orf', 'rw2', 'pef', 'srw', '3fr', 'iiq', 'erf', 'kdc', 'mos', 'mrw', 'rwl', 'x3f'] as const;

/**
 * Whether a file name is a camera RAW's.
 * @param name the file's name
 * @returns true for a RAW extension
 */
export const isRawName = (name: string): boolean => (RAW_EXTS as readonly string[]).includes(name.split('.').pop()?.toLowerCase() ?? '');

/** RAW files can be large: a 100-megapixel camera writes about 200 MB. */
export const RAW_MAX_MB = 300;

/** A developed RAW: width × height pixels, three 16-bit linear values each (sRGB primaries), top row first. */
export interface RawImage {
  width: number;
  height: number;
  data: Uint16Array;
}

/**
 * The largest complete JPEG inside a file (the camera's preview in a RAW). Every JPEG is walked marker by marker to its
 * end, so thumbnails and the full-size preview are told apart by size and nothing is cut off.
 * @param bytes the file
 * @returns the JPEG's bytes, or null when there is none over 1 KB
 */
export function embeddedJpeg(bytes: Uint8Array): Uint8Array | null {
  let bestStart = 0;
  let bestEnd = 0;
  let index = 0;
  while (index + 3 < bytes.length) {
    const start = bytes[index] === 0xff && bytes[index + 1] === 0xd8 && bytes[index + 2] === 0xff;
    const end = start ? jpegEnd(bytes, index) : -1;
    if (end > 0) {
      if (bestEnd === 0 || end - index > bestEnd - bestStart) [bestStart, bestEnd] = [index, end];
      // Carry on after this JPEG.
      index = end;
    } else index++;
  }
  return bestEnd - bestStart > 1024 ? bytes.subarray(bestStart, bestEnd) : null;
}

/**
 * Whether a marker starts a frame (SOF0–SOF15 but DHT, JPG and DAC): a JPEG without one has no picture.
 * @param marker the marker's second byte
 * @returns true for a start of frame
 */
const isFrameMarker = (marker: number): boolean =>
  (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);

/**
 * Whether a marker is a restart (RST0–RST7), which has no length.
 * @param marker the marker's second byte
 * @returns true for a restart
 */
const isRestart = (marker: number): boolean => marker >= 0xd0 && marker <= 0xd7;

/**
 * Skips entropy-coded data: it runs to the next marker that isn't a stuffed byte (FF 00) or a restart (FF D0–D7).
 * @param bytes the file
 * @param start where the data starts
 * @returns where the next marker is
 */
function skipScanData(bytes: Uint8Array, start: number): number {
  let index = start;
  while (index + 1 < bytes.length) {
    const next = bytes[index + 1] ?? 0;
    if (bytes[index] === 0xff && next !== 0 && !isRestart(next)) break;
    index++;
  }
  return index;
}

/**
 * How far to move past a marker without a length.
 * @param marker the marker's second byte
 * @returns 1 for a fill byte (FF FF), 2 for a restart, 0 for a marker with a length
 */
function lengthlessStep(marker: number): number {
  if (marker === 0xff) return 1;
  return isRestart(marker) ? 2 : 0;
}

/**
 * Where the JPEG starting at `start` ends.
 * @param bytes the file
 * @param start the JPEG's first byte (its SOI marker)
 * @returns the index after its EOI marker, or -1 when it isn't a complete JPEG
 */
function jpegEnd(bytes: Uint8Array, start: number): number {
  let index = start + 2;
  let frame = false;
  while (index + 1 < bytes.length) {
    if (bytes[index] !== 0xff) return -1;
    const marker = bytes[index + 1] ?? 0;
    if (marker === 0xd9) return frame ? index + 2 : -1;
    const step = lengthlessStep(marker);
    if (step) {
      index += step;
      continue;
    }
    const next = afterSegment(bytes, index, marker);
    if (next < 0) return -1;
    if (isFrameMarker(marker)) frame = true;
    index = next;
  }
  return -1;
}

/**
 * Where the segment of a marker with a length ends (after its scan data, for a start of scan).
 * @param bytes the file
 * @param index the marker's first byte
 * @param marker the marker's second byte
 * @returns the next marker's index, or -1 when the segment is cut off or its length is wrong
 */
function afterSegment(bytes: Uint8Array, index: number, marker: number): number {
  if (index + 3 >= bytes.length) return -1;
  const length = ((bytes[index + 2] ?? 0) << 8) | (bytes[index + 3] ?? 0);
  if (length < 2) return -1;
  const next = index + 2 + length;
  return marker === 0xda ? skipScanData(bytes, next) : next;
}

/**
 * Linear light to sRGB-encoded.
 * @param value linear light, 0–1
 * @returns sRGB, 0–1
 */
export const encodeSrgb = (value: number): number => (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055);

/**
 * sRGB-encoded to linear light.
 * @param value sRGB, 0–1
 * @returns linear light
 */
export const decodeSrgb = (value: number): number => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);

/** 0–65535 linear to 8-bit sRGB, made once (every developed pixel goes through it). */
let to8Table: Uint8Array | null = null;

/**
 * The table of 16-bit linear values as 8-bit sRGB.
 * @returns 65536 values
 */
function to8(): Uint8Array {
  if (!to8Table) {
    to8Table = new Uint8Array(65536);
    for (let value = 0; value < 65536; value++) to8Table[value] = Math.round(encodeSrgb(value / 65535) * 255);
  }
  return to8Table;
}

/**
 * A developed RAW as 8-bit sRGB RGBA, averaged in linear light (as the eye adds light): the editor's preview, and the
 * picture the 8-bit export draws.
 * @param image the developed RAW
 * @param long the most pixels on the longer side
 * @returns the RGBA image
 */
export function rawToRgba8(image: RawImage, long: number): { width: number; height: number; data: Uint8ClampedArray } {
  const block = Math.max(1, Math.ceil(Math.max(image.width, image.height) / long));
  const width = Math.max(1, Math.floor(image.width / block));
  const height = Math.max(1, Math.floor(image.height / block));
  const out = new Uint8ClampedArray(width * height * 4);
  const table = to8();
  const data = image.data;
  const count = block * block;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let row = 0; row < block; row++) {
        for (let column = 0; column < block; column++) {
          const source = ((y * block + row) * image.width + x * block + column) * 3;
          red += data[source] ?? 0;
          green += data[source + 1] ?? 0;
          blue += data[source + 2] ?? 0;
        }
      }
      const target = (y * width + x) * 4;
      out[target] = table[Math.round(red / count)] ?? 0;
      out[target + 1] = table[Math.round(green / count)] ?? 0;
      out[target + 2] = table[Math.round(blue / count)] ?? 0;
      out[target + 3] = 255;
    }
  }
  return { width, height, data: out };
}
