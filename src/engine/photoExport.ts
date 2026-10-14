import { keysOf } from './guards';

/*
 * Photo file types for export (P1.11): JPEG and PNG everywhere, WebP and AVIF where this browser can encode them, and
 * 16-bit TIFF (P1.9) where the graphics card can render in floats (written by engine/tiff.ts, not by a canvas).
 * canvas.toBlob() quietly falls back to PNG for a type it can't write, so support is found by encoding a tiny picture
 * and looking at what comes back, once per type, and every export checks the type it got.
 */

/** A photo file type. */
export type PhotoType = 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff';

/** A file type's details. */
export interface PhotoTypeDef {
  mime: string;
  ext: string;
  label: string;
  /** Takes a quality setting. */
  lossy: boolean;
}

/** Every type, in display order. */
export const PHOTO_TYPES: Record<PhotoType, PhotoTypeDef> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG', lossy: true },
  png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true },
  avif: { mime: 'image/avif', ext: 'avif', label: 'AVIF', lossy: true },
  tiff: { mime: 'image/tiff', ext: 'tif', label: 'TIFF (16-bit)', lossy: false },
};

/** Every type's id, in display order. */
export const PHOTO_TYPE_IDS = keysOf(PHOTO_TYPES);

/**
 * Whether a value is a photo type's id.
 * @param value anything
 * @returns true for a known id
 */
export const isPhotoType = (value: unknown): value is PhotoType => typeof value === 'string' && value in PHOTO_TYPES;

/** Encodes a picture the way a canvas does: resolves to the file, or null. */
export type Encoder = (mime: string, quality: number) => Promise<Blob | null>;

/**
 * A canvas's encoder.
 * @param canvas the canvas
 * @returns the encoder
 */
const canvasEncoder =
  (canvas: HTMLCanvasElement): Encoder =>
  (mime, quality) =>
    new Promise((resolve) => {
      canvas.toBlob(resolve, mime, quality);
    });

const probes = new Map<PhotoType, Promise<boolean>>();

/**
 * Probes a type by encoding a tiny picture, once per type.
 * @param type the type
 * @returns whether what came back is of that type
 */
function probe(type: PhotoType): Promise<boolean> {
  const cached = probes.get(type);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#c84';
    ctx.fillRect(0, 0, 2, 2);
  }
  const probed = canvasEncoder(canvas)(PHOTO_TYPES[type].mime, 0.8)
    .then((blob) => blob?.type === PHOTO_TYPES[type].mime)
    .catch(() => false);
  probes.set(type, probed);
  return probed;
}

/**
 * Whether this browser writes a type (JPEG and PNG always do).
 * @param type the type
 * @param encode an encoder to probe with (for tests)
 * @returns true when it can
 */
export function canEncode(type: PhotoType, encode?: Encoder): Promise<boolean> {
  if (type === 'jpeg' || type === 'png') return Promise.resolve(true);
  if (type === 'tiff') return import('./deep').then((deep) => deep.deepSupported()).catch(() => false);
  if (encode) return encode(PHOTO_TYPES[type].mime, 0.8).then((blob) => blob?.type === PHOTO_TYPES[type].mime);
  return probe(type);
}

/**
 * The types this browser can write.
 * @returns them, in display order
 */
export async function encodableTypes(): Promise<PhotoType[]> {
  const supported = await Promise.all(PHOTO_TYPE_IDS.map((type) => canEncode(type)));
  return PHOTO_TYPE_IDS.filter((_, index) => supported[index]);
}

/**
 * Encodes a canvas as a type.
 * @param canvas the canvas
 * @param type the type
 * @param quality 1–100, for lossy types
 * @param encode the encoder (the canvas's by default)
 * @returns the file
 * @throws {Error} when nothing came back, or when the browser wrote another type
 */
export async function encodePhoto(canvas: HTMLCanvasElement, type: PhotoType, quality: number, encode: Encoder = canvasEncoder(canvas)): Promise<Blob> {
  const definition = PHOTO_TYPES[type];
  const blob = await encode(definition.mime, definition.lossy ? Math.min(1, Math.max(0.01, quality / 100)) : 1);
  if (!blob) throw new Error('The picture couldn’t be encoded.');
  if (blob.type !== definition.mime) throw new Error(`This browser can’t write ${definition.label} files.`);
  return blob;
}
