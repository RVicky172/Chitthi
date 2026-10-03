/*
 * Photo file types for export (P1.11): JPEG and PNG everywhere, WebP and AVIF where this browser can encode them.
 * canvas.toBlob() quietly falls back to PNG for a type it can't write, so support is found by encoding a tiny picture
 * and looking at what comes back, once per type, and every export checks the type it got.
 */

export type PhotoType = 'jpeg' | 'png' | 'webp' | 'avif';

export interface PhotoTypeDef {
  mime: string;
  ext: string;
  label: string;
  /** Takes a quality setting. */
  lossy: boolean;
}

export const PHOTO_TYPES: Record<PhotoType, PhotoTypeDef> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG', lossy: true },
  png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true },
  avif: { mime: 'image/avif', ext: 'avif', label: 'AVIF', lossy: true },
};
export const PHOTO_TYPE_IDS = Object.keys(PHOTO_TYPES) as PhotoType[];

export const isPhotoType = (v: unknown): v is PhotoType => typeof v === 'string' && v in PHOTO_TYPES;

/** Encodes a picture the way a canvas does: resolves to the file, or null. */
export type Encoder = (mime: string, quality: number) => Promise<Blob | null>;

const canvasEncoder =
  (cv: HTMLCanvasElement): Encoder =>
  (mime, quality) =>
    new Promise((res) => cv.toBlob(res, mime, quality));

const probes = new Map<PhotoType, Promise<boolean>>();

/** True when this browser writes this type (JPEG and PNG always do). The encoder is for tests. */
export function canEncode(type: PhotoType, encode?: Encoder): Promise<boolean> {
  if (type === 'jpeg' || type === 'png') return Promise.resolve(true);
  if (encode) return encode(PHOTO_TYPES[type].mime, 0.8).then((b) => b?.type === PHOTO_TYPES[type].mime);
  let p = probes.get(type);
  if (!p) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 2;
    const x = cv.getContext('2d');
    if (x) {
      x.fillStyle = '#c84';
      x.fillRect(0, 0, 2, 2);
    }
    p = canvasEncoder(cv)(PHOTO_TYPES[type].mime, 0.8)
      .then((b) => b?.type === PHOTO_TYPES[type].mime)
      .catch(() => false);
    probes.set(type, p);
  }
  return p;
}

/** The types this browser can write, in display order. */
export async function encodableTypes(): Promise<PhotoType[]> {
  const ok = await Promise.all(PHOTO_TYPE_IDS.map((t) => canEncode(t)));
  return PHOTO_TYPE_IDS.filter((_, i) => ok[i]);
}

/** Encodes a canvas as the type, quality 1–100 for lossy types. Throws when the browser wrote something else. */
export async function encodePhoto(cv: HTMLCanvasElement, type: PhotoType, quality: number, encode: Encoder = canvasEncoder(cv)): Promise<Blob> {
  const def = PHOTO_TYPES[type];
  const blob = await encode(def.mime, def.lossy ? Math.min(1, Math.max(0.01, quality / 100)) : 1);
  if (!blob) throw new Error('The picture couldn’t be encoded.');
  if (blob.type !== def.mime) throw new Error(`This browser can’t write ${def.label} files.`);
  return blob;
}
