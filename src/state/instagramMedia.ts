import { DEFAULT_EDIT } from '../engine/instagram';
import { checkFile, loadImage } from '../engine/photo';
import { embeddedJpeg, isRawName, rawToRgba8, type RawImage } from '../engine/raw';
import { logError } from '../lib/errors';
import { desktop } from '../platform/desktop';
import { flags, getIg, PREVIEW_MAX, record, setIgState, type IgItem } from './instagram';
import { keepMedia } from './projectSave';

/*
 * Photos into the Instagram batch: files decoded into items with a preview copy, camera RAW developed by the desktop
 * app (or its embedded JPEG on the web) (407 T041, split from state/instagram.ts).
 */

let idCount = 0;

/**
 * A new photo id.
 * @returns the id: `ig`, the time and a counter in base 36
 */
const newId = () => `ig${Date.now().toString(36)}${(idCount++).toString(36)}`;

/** 8-bit RGBA pixels (engine/raw.ts `rawToRgba8`). */
interface Rgba8 {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * A canvas holding 8-bit RGBA pixels.
 * @param pixels the pixels
 * @returns the canvas
 */
export function canvasOf(pixels: Rgba8): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');
  // ImageData wants an ArrayBuffer-backed array; rawToRgba8 makes one (never a SharedArrayBuffer).
  context.putImageData(new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height), 0, 0);
  return canvas;
}

/**
 * Develops a RAW file with LibRaw in the desktop app (half size: still well over the 1920 px a post needs).
 * @param name the file's name
 * @param file the file
 * @returns the developed image (16-bit)
 * @throws {Error} outside the desktop app
 */
export async function developRaw(name: string, file: Blob): Promise<RawImage> {
  if (!desktop?.raw) throw new Error('RAW files are developed in the desktop app.');
  return desktop.raw.develop(await file.arrayBuffer(), name, { half: true });
}

let rawReady: Promise<boolean> | null = null;

/**
 * True when this app can develop RAW files (the desktop app with its RAW developer installed).
 * @returns the answer (asked once)
 */
export const canDevelopRaw = (): Promise<boolean> => (rawReady ??= desktop?.raw ? desktop.raw.available().catch(() => false) : Promise.resolve(false));

/**
 * A batch photo from a camera RAW, developed in the desktop app.
 * @param name the file's name
 * @param file the file
 * @returns the photo
 */
async function makeRawItem(name: string, file: Blob): Promise<IgItem> {
  const img = await developRaw(name, file);
  return { id: newId(), name, file, w: img.width, h: img.height, preview: canvasOf(rawToRgba8(img, PREVIEW_MAX)), edit: { ...DEFAULT_EDIT }, layers: [], raw: true };
}

/**
 * A photo's preview (at most PREVIEW_MAX px on the long side), made again from its file (a reopened project, 408).
 * @param name the file's name
 * @param file the file
 * @param raw it is a camera RAW, developed again
 * @returns the preview
 */
export const previewOf = async (name: string, file: Blob, raw = false): Promise<HTMLCanvasElement> => (raw ? await makeRawItem(name, file) : await makeItem(name, file)).preview;

/**
 * A batch photo from an image file.
 * @param name the file's name
 * @param file the file
 * @returns the photo
 */
async function makeItem(name: string, file: Blob): Promise<IgItem> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth,
      height = img.naturalHeight,
      scale = Math.min(1, PREVIEW_MAX / Math.max(width, height));
    const preview = document.createElement('canvas');
    preview.width = Math.max(1, Math.round(width * scale));
    preview.height = Math.max(1, Math.round(height * scale));
    const context = preview.getContext('2d');
    if (!context) throw new Error('No canvas');
    context.imageSmoothingQuality = 'high';
    context.drawImage(img, 0, 0, preview.width, preview.height);
    return { id: newId(), name, file, w: width, h: height, preview, edit: { ...DEFAULT_EDIT }, layers: [] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A file to add to the batch. */
export interface PhotoFile {
  name: string;
  blob: Blob;
  /** Its MIME type; missing = the blob's. */
  type?: string;
}

/**
 * A camera RAW on the web: its embedded JPEG preview as a batch photo.
 * @param file the file
 * @param messages where to say what happened
 * @returns the photo, or null when the file has no preview
 */
async function rawPreviewItem(file: PhotoFile, messages: string[]): Promise<IgItem | null> {
  const jpeg = embeddedJpeg(new Uint8Array(await file.blob.arrayBuffer()));
  if (!jpeg) {
    messages.push(`${file.name} is a camera RAW file without a preview Chitthi Studio can open. Open it in the desktop app, or export a JPEG from your camera app.`);
    return null;
  }
  // The embedded JPEG is a view of the file's own ArrayBuffer.
  const item = await makeItem(file.name, new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
  messages.push(`${file.name}: showing the camera’s built-in JPEG preview. The desktop app opens the full RAW, in 16 bits.`);
  return item;
}

/**
 * One file as a batch photo, or a message saying why it can't be one.
 * @param file the file
 * @param messages where to say what happened
 * @returns the photo, or null
 */
async function itemOf(file: PhotoFile, messages: string[]): Promise<IgItem | null> {
  const refusal = checkFile(new File([file.blob], file.name, { type: file.type ?? file.blob.type }), { raw: true });
  if (refusal) {
    messages.push(refusal);
    return null;
  }
  try {
    if (!isRawName(file.name)) return await makeItem(file.name, file.blob);
    if (await canDevelopRaw()) return await makeRawItem(file.name, file.blob);
    // The web app can't develop RAW: it opens the JPEG preview the camera stored in the file.
    return await rawPreviewItem(file, messages);
  } catch (error) {
    logError('handled', error);
    messages.push(`${file.name} couldn’t be read. The file may be damaged.`);
    return null;
  }
}

/**
 * Adds photos up to the batch limit (one undo step).
 * @param files the files
 * @returns messages for the user: files that can't be used, and how many didn't fit
 */
export async function addPhotos(files: PhotoFile[]): Promise<string[]> {
  const messages: string[] = [];
  const { limit, items } = getIg();
  const room = limit - items.length;
  if (room <= 0) return [`The batch is full (${limit} photos). Raise the limit (up to 20) or remove a photo.`];
  const leftOut = files.length - room;
  if (leftOut > 0) messages.push(`${leftOut} photo${leftOut > 1 ? 's' : ''} not added: the batch holds ${limit}. Raise the limit (up to 20) to add more.`);
  setIgState({ busy: 'Adding photos…' });
  const added: IgItem[] = [];
  for (const file of files.slice(0, room)) {
    const item = await itemOf(file, messages);
    if (item) added.push(item);
  }
  if (added.length) record('');
  const current = getIg();
  setIgState({ items: [...current.items, ...added], selected: current.selected ?? added.at(0)?.id ?? null, busy: null, ...flags() });
  // Kept for the saved project (408 §4) before the save that references it.
  for (const item of added) void keepMedia(item.file, false);
  return messages;
}
