import type { LookId, Photo, PhotoMeta } from '../types';
import { isRawName, RAW_MAX_MB } from './raw';

/*
 * Photos for print products: checking files before they are read, loading them, the colour looks, and the photo as
 * placed on a card (turned, mirrored, cropped, with its look).
 */

/** Largest photo file accepted, MB. */
export const MAX_MB = 25;

/** Photos a design holds (but calendars). */
export const MAX_PHOTOS = 4;

/**
 * Photos a design can hold: a 12-month calendar needs one per month (two for two-photo pages).
 * @param product the product's id
 * @returns the most photos
 */
export const maxPhotos = (product: string): number => (product === 'calendar' ? 24 : MAX_PHOTOS);

/** Stays under mobile Safari's canvas limit. */
const MAX_PIXELS = 16e6;

const MB = 1048576;

/** A kind of file refused, and why (the name is put first). */
interface Refusal {
  /** Whether a file is of this kind, by its extension and MIME type. */
  matches: (extension: string, type: string) => boolean;
  reason: string;
}

/** The kinds of file refused before the type check, in order. */
const BEFORE_RAW: readonly Refusal[] = [
  {
    matches: (extension, type) => /heic|heif/.test(type) || extension === 'heic' || extension === 'heif',
    reason: 'HEIC photos from iPhone can’t be opened in the browser. Save it as JPG (Share › Save as JPEG, or set Settings › Camera › Formats › Most Compatible).',
  },
  { matches: (extension, type) => extension === 'tif' || extension === 'tiff' || type.includes('tiff'), reason: 'TIFF isn’t supported. Save it as JPG or PNG.' },
];

/** The kinds of file refused after a RAW file is let through. */
const AFTER_RAW: readonly Refusal[] = [
  { matches: (extension, type) => extension === 'gif' || type === 'image/gif', reason: 'GIF images are too low in quality for printing. Use JPG or PNG.' },
  { matches: (extension, type) => extension === 'bmp' || type.includes('bmp'), reason: 'BMP isn’t supported. Save it as JPG or PNG.' },
  { matches: (extension, type) => extension === 'svg' || type.includes('svg'), reason: 'SVG drawings can’t be used as photos. Export it as PNG.' },
  { matches: (extension, type) => extension === 'pdf' || type === 'application/pdf', reason: 'PDFs can’t be used as photos. Export the page as JPG or PNG.' },
  {
    matches: (extension, type) => !['jpg', 'jpeg', 'png', 'webp'].includes(extension) && !['image/jpeg', 'image/png', 'image/webp'].includes(type),
    reason: 'this file type isn’t supported. Use JPG, PNG or WebP.',
  },
];

/**
 * The first refusal a file meets.
 * @param refusals the refusals, in order
 * @param file the file
 * @param extension its extension, lower case
 * @param type its MIME type, lower case
 * @returns the message, or null
 */
function refusalOf(refusals: readonly Refusal[], file: File, extension: string, type: string): string | null {
  const refusal = refusals.find((each) => each.matches(extension, type));
  return refusal ? `${file.name}: ${refusal.reason}` : null;
}

/**
 * A RAW file's size check.
 * @param file the file
 * @returns the message, or null when it's fine
 */
function rawSizeProblem(file: File): string | null {
  if (file.size > RAW_MAX_MB * MB) return `${file.name} is over ${String(RAW_MAX_MB)} MB.`;
  return file.size ? null : `${file.name} is empty. Choose the file again.`;
}

/**
 * Why a file can't be used.
 * @param file the file
 * @param opts `raw`: camera RAW files are welcome (the photo studio, P1.9); elsewhere they are refused like any
 *   unknown type
 * @param opts.raw whether RAW files are accepted
 * @returns a user-facing reason, or null when it's fine
 */
export function checkFile(file: File, opts: { raw?: boolean } = {}): string | null {
  const extension = (file.name.includes('.') ? (file.name.split('.').pop() ?? '') : '').toLowerCase();
  const type = file.type.toLowerCase();
  const early = refusalOf(BEFORE_RAW, file, extension, type);
  if (early) return early;
  if (opts.raw && isRawName(file.name)) return rawSizeProblem(file);
  const refused = refusalOf(AFTER_RAW, file, extension, type);
  if (refused) return refused;
  if (file.size === 0) return `${file.name} is empty. Choose the file again.`;
  if (file.size > MAX_MB * MB) return `${file.name} is ${(file.size / MB).toFixed(1)} MB. The limit is ${String(MAX_MB)} MB; export a smaller JPG from your gallery app.`;
  return null;
}

/**
 * Reads a file as a data URL.
 * @param file the file
 * @returns the data URL
 */
export const readAsDataURL = (file: File): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('The file couldn’t be read.'));
    };
    reader.readAsDataURL(file);
  });

/**
 * Loads an image.
 * @param url its URL
 * @returns the decoded image
 */
export const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error('The image couldn’t be loaded.'));
    };
    image.src = url;
  });

/**
 * Applies a look to a canvas's pixels.
 * @param canvas the canvas
 * @param look the look
 */
function applyLook(canvas: HTMLCanvasElement, look: LookId): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  lookPixels(image.data, look);
  ctx.putImageData(image, 0, 0);
}

/**
 * One pixel through a look (no allocation per pixel).
 * @param red 0–255
 * @param green 0–255
 * @param blue 0–255
 * @param look the look
 * @param out where the pixel is written, 0–255, neither rounded nor clamped
 */
export function lookPixel(red: number, green: number, blue: number, look: LookId, out: number[]): void {
  const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
  out[0] = red;
  out[1] = green;
  out[2] = blue;
  switch (look) {
    case 'bw': {
      const grey = (luma - 128) * 1.08 + 128;
      out[0] = grey;
      out[1] = grey;
      out[2] = grey;
      break;
    }
    case 'warm':
      out[0] = red * 1.08;
      out[1] = green * 1.02;
      out[2] = blue * 0.88;
      break;
    case 'cool':
      out[0] = red * 0.9;
      out[1] = green * 1.01;
      out[2] = blue * 1.1;
      break;
    case 'vivid':
      out[0] = (luma + (red - luma) * 1.35 - 128) * 1.06 + 128;
      out[1] = (luma + (green - luma) * 1.35 - 128) * 1.06 + 128;
      out[2] = (luma + (blue - luma) * 1.35 - 128) * 1.06 + 128;
      break;
    case 'tinted':
      tintedPixel(red, green, blue, luma, out);
      break;
    case 'vintage':
      out[0] = red * 0.45 + (luma * 1.07 + 20) * 0.55;
      out[1] = green * 0.45 + (luma * 0.95 + 12) * 0.55;
      out[2] = blue * 0.45 + (luma * 0.78 + 10) * 0.55;
      break;
    default:
      break;
  }
}

/**
 * Hand-tinted: a black-and-white print on warm paper, with thin washes of colour laid back in only where the photo was
 * strongly coloured (a sari, marigolds, a turban), the way studio photographs were once painted.
 * @param red 0–255
 * @param green 0–255
 * @param blue 0–255
 * @param luma the pixel's luma
 * @param out where the pixel is written
 */
function tintedPixel(red: number, green: number, blue: number, luma: number, out: number[]): void {
  const highest = Math.max(red, green, blue);
  const saturation = highest ? (highest - Math.min(red, green, blue)) / highest : 0;
  const wash = Math.min(1, Math.max(0, (saturation - 0.28) / 0.42)) * 0.62;
  const base = (luma - 128) * 1.06 + 128;
  out[0] = base * 1.015 + 4 + (red - luma) * wash;
  out[1] = base * 0.995 + 2 + (green - luma) * wash;
  out[2] = base * 0.955 + 1 + (blue - luma) * wash;
}

/**
 * The colour looks, on raw RGBA pixels (shared with the Instagram studio, engine/instagram.ts). The same formulas as
 * lookPixel(), kept inline in this loop because a call per pixel makes it 2–3× slower; photo.test.ts checks they agree.
 * @param pixels RGBA, written in place
 * @param look the look
 */
export function lookPixels(pixels: Uint8ClampedArray, look: LookId): void {
  if (look === 'none') return;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
    switch (look) {
      case 'bw': {
        const grey = (luma - 128) * 1.08 + 128;
        pixels[index] = grey;
        pixels[index + 1] = grey;
        pixels[index + 2] = grey;
        break;
      }
      case 'warm':
        pixels[index] = red * 1.08;
        pixels[index + 1] = green * 1.02;
        pixels[index + 2] = blue * 0.88;
        break;
      case 'cool':
        pixels[index] = red * 0.9;
        pixels[index + 1] = green * 1.01;
        pixels[index + 2] = blue * 1.1;
        break;
      case 'vivid':
        pixels[index] = (luma + (red - luma) * 1.35 - 128) * 1.06 + 128;
        pixels[index + 1] = (luma + (green - luma) * 1.35 - 128) * 1.06 + 128;
        pixels[index + 2] = (luma + (blue - luma) * 1.35 - 128) * 1.06 + 128;
        break;
      case 'tinted': {
        const highest = Math.max(red, green, blue);
        const saturation = highest ? (highest - Math.min(red, green, blue)) / highest : 0;
        const wash = Math.min(1, Math.max(0, (saturation - 0.28) / 0.42)) * 0.62;
        const base = (luma - 128) * 1.06 + 128;
        pixels[index] = base * 1.015 + 4 + (red - luma) * wash;
        pixels[index + 1] = base * 0.995 + 2 + (green - luma) * wash;
        pixels[index + 2] = base * 0.955 + 1 + (blue - luma) * wash;
        break;
      }
      case 'vintage':
        pixels[index] = red * 0.45 + (luma * 1.07 + 20) * 0.55;
        pixels[index + 1] = green * 0.45 + (luma * 0.95 + 12) * 0.55;
        pixels[index + 2] = blue * 0.45 + (luma * 0.78 + 10) * 0.55;
        break;
    }
  }
}

/** A photo's drawing source and its size. */
interface Processed {
  src: CanvasImageSource;
  sw: number;
  sh: number;
}

/**
 * Applies rotation, mirroring, crop and look to the original image at full resolution (scaled down past MAX_PIXELS).
 * @param original the decoded image
 * @param meta the photo's settings
 * @returns the drawing source (the original itself when nothing changes it)
 */
function processed(original: HTMLImageElement, meta: PhotoMeta): Processed {
  const imageWidth = original.naturalWidth;
  const imageHeight = original.naturalHeight;
  const turn = ((meta.rot % 360) + 360) % 360;
  const turnedWidth = turn % 180 ? imageHeight : imageWidth;
  const turnedHeight = turn % 180 ? imageWidth : imageHeight;
  const crop = meta.crop;
  const whole = crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1;
  if (!turn && !meta.flip && meta.look === 'none' && whole) return { src: original, sw: imageWidth, sh: imageHeight };
  const cropWidth = Math.max(1, Math.round(crop.w * turnedWidth));
  const cropHeight = Math.max(1, Math.round(crop.h * turnedHeight));
  const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (cropWidth * cropHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropWidth * scale));
  canvas.height = Math.max(1, Math.round(cropHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { src: original, sw: imageWidth, sh: imageHeight };
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);
  ctx.translate(-crop.x * turnedWidth, -crop.y * turnedHeight);
  ctx.translate(turnedWidth / 2, turnedHeight / 2);
  ctx.rotate((turn * Math.PI) / 180);
  if (meta.flip) ctx.scale(-1, 1);
  ctx.drawImage(original, -imageWidth / 2, -imageHeight / 2);
  if (meta.look !== 'none') applyLook(canvas, meta.look);
  return { src: canvas, sw: canvas.width, sh: canvas.height };
}

let photoCount = 0;

/**
 * A photo from a decoded image and its settings.
 * @param original the decoded image
 * @param name the file's name
 * @param url its URL
 * @param meta its settings (missing ones at their defaults)
 * @returns the photo, processed
 */
export function makePhoto(original: HTMLImageElement, name: string, url: string, meta: Partial<PhotoMeta> = {}): Photo {
  const settings: PhotoMeta = {
    name,
    url,
    rot: meta.rot ?? 0,
    flip: !!meta.flip,
    crop: meta.crop ?? { x: 0, y: 0, w: 1, h: 1 },
    zoom: meta.zoom ?? 1,
    px: meta.px ?? 0,
    py: meta.py ?? 0,
    look: meta.look ?? 'none',
  };
  return { ...settings, id: `p${Date.now().toString(36)}${(photoCount++).toString(36)}`, orig: original, ...processed(original, settings) };
}

/**
 * A photo with changed settings, re-processing pixels only when the crop, rotation, mirror or look changed.
 * @param photo the photo
 * @param patch the settings to change
 * @returns the updated photo
 */
export function updatePhoto(photo: Photo, patch: Partial<PhotoMeta>): Photo {
  const next = { ...photo, ...patch };
  const heavy =
    (['rot', 'flip', 'look'] as const).some((key) => key in patch && patch[key] !== photo[key]) ||
    ('crop' in patch && JSON.stringify(patch.crop) !== JSON.stringify(photo.crop));
  return heavy ? { ...next, ...processed(photo.orig, next) } : next;
}

/**
 * A photo's settings, as saved.
 * @param photo the photo
 * @returns its settings
 */
export const photoMeta = (photo: Photo): PhotoMeta => ({
  name: photo.name,
  url: photo.url,
  rot: photo.rot,
  flip: photo.flip,
  crop: photo.crop,
  zoom: photo.zoom,
  px: photo.px,
  py: photo.py,
  look: photo.look,
});

/**
 * Loads saved photos; unreadable ones are skipped.
 * @param list the saved settings
 * @returns the photos that loaded
 */
export async function photosFromMeta(list: PhotoMeta[]): Promise<Photo[]> {
  const photos: Photo[] = [];
  for (const meta of list) {
    try {
      photos.push(makePhoto(await loadImage(meta.url), meta.name, meta.url, meta));
    } catch {
      /* skip unreadable photo */
    }
  }
  return photos;
}
