/*
 * Camera RAW photos (P1.9), free of DOM and React. The desktop app develops RAW files with LibRaw (electron/raw.cjs)
 * into 16-bit linear RGB with sRGB primaries; here that becomes the editor's 8-bit preview and the 16-bit export's
 * linear source. The web app can't run LibRaw, so it opens the JPEG preview every camera stores inside the RAW file.
 */

/** File types the photo studio treats as camera RAW (electron/raw.cjs accepts the same). */
export const RAW_EXTS = ['dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'orf', 'rw2', 'pef', 'srw', '3fr', 'iiq', 'erf', 'kdc', 'mos', 'mrw', 'rwl', 'x3f'] as const;

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
 * The largest complete JPEG inside a file (the camera's preview in a RAW), or null. Every JPEG is walked marker by
 * marker to its end, so thumbnails and the full-size preview are told apart by size and nothing is cut off.
 */
export function embeddedJpeg(bytes: Uint8Array): Uint8Array | null {
  let best: [number, number] | null = null;
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue;
    const end = jpegEnd(bytes, i);
    if (end > 0) {
      if (!best || end - i > best[1] - best[0]) best = [i, end];
      i = end - 1;
    }
  }
  return best && best[1] - best[0] > 1024 ? bytes.subarray(best[0], best[1]) : null;
}

/** Where the JPEG starting at `start` ends (after its EOI marker), or -1 when it isn't a complete JPEG. */
function jpegEnd(b: Uint8Array, start: number): number {
  let i = start + 2,
    frame = false;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return -1;
    const m = b[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0xd9) return frame ? i + 2 : -1;
    if (m >= 0xd0 && m <= 0xd7) {
      i += 2;
      continue;
    }
    if (i + 3 >= b.length) return -1;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return -1;
    if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) frame = true;
    i += 2 + len;
    if (m === 0xda) {
      // Entropy-coded data: runs to the next marker that isn't a stuffed byte (FF 00) or a restart (FF D0–D7).
      while (i + 1 < b.length && !(b[i] === 0xff && b[i + 1] !== 0 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
    }
  }
  return -1;
}

/** Linear light (0–1) to sRGB-encoded (0–1). */
export const encodeSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);
/** sRGB-encoded (0–1) to linear light. */
export const decodeSrgb = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** 0–65535 linear to 8-bit sRGB, through a table (every developed pixel goes through it once). */
let TO8: Uint8Array | null = null;
const to8 = () => {
  if (!TO8) {
    TO8 = new Uint8Array(65536);
    for (let i = 0; i < 65536; i++) TO8[i] = Math.round(encodeSrgb(i / 65535) * 255);
  }
  return TO8;
};

/**
 * A developed RAW as 8-bit sRGB RGBA at most `long` px on its longer side (averaged in linear light, as the eye adds
 * light): the editor's preview, and the picture the 8-bit export draws.
 */
export function rawToRgba8(img: RawImage, long: number): { width: number; height: number; data: Uint8ClampedArray } {
  const k = Math.max(1, Math.ceil(Math.max(img.width, img.height) / long)),
    w = Math.max(1, Math.floor(img.width / k)),
    h = Math.max(1, Math.floor(img.height / k)),
    out = new Uint8ClampedArray(w * h * 4),
    t = to8(),
    n = k * k;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const s = ((y * k + j) * img.width + x * k + i) * 3;
          r += img.data[s];
          g += img.data[s + 1];
          b += img.data[s + 2];
        }
      const o = (y * w + x) * 4;
      out[o] = t[Math.round(r / n)];
      out[o + 1] = t[Math.round(g / n)];
      out[o + 2] = t[Math.round(b / n)];
      out[o + 3] = 255;
    }
  return { width: w, height: h, data: out };
}
