import { igFormat } from '../data/instagram';
import { renderIg } from '../engine/instagram';
import { drawLayers } from '../engine/layerDraw';
import { aiTargets } from '../engine/masks';
import { encodePhoto, PHOTO_TYPES } from '../engine/photoExport';
import { loadImage } from '../engine/photo';
import { rawToRgba8, type RawImage } from '../engine/raw';
import { shareSegments } from '../engine/segments';
import { ensureFonts } from '../lib/fonts';
import { makeZip } from '../lib/zip';
import { getIg, setIgState, type IgItem } from './instagram';
import { canvasOf, developRaw } from './instagramMedia';

/*
 * Rendering the Instagram batch at full size into files (JPEG, PNG, WebP or 16-bit TIFF), one photo in full-size
 * memory at a time, and handing them on (a ZIP, the share sheet) (407 T041, split from state/instagram.ts).
 */

/**
 * A number as two digits.
 * @param value the number
 * @returns it padded with a leading zero
 */
const pad = (value: number) => String(value).padStart(2, '0');

/** A photo decoded at full size for export. */
interface ExportSource {
  img: CanvasImageSource;
  /** Width in pixels. */
  w: number;
  /** Height in pixels. */
  h: number;
  /** For a RAW: the developed 16-bit image; null otherwise. */
  raw: RawImage | null;
  /** Frees the full-size pixels. */
  done: () => void;
}

/**
 * The image to draw for an export: the file decoded, or for a RAW the file developed (8-bit) and kept as 16-bit.
 * @param item the photo
 * @returns the decoded image
 */
async function exportSource(item: IgItem): Promise<ExportSource> {
  if (item.raw) {
    const raw = await developRaw(item.name, item.file),
      canvas = canvasOf(rawToRgba8(raw, Math.max(raw.width, raw.height)));
    const release = () => {
      canvas.width = canvas.height = 1;
    };
    return { img: canvas, w: canvas.width, h: canvas.height, raw, done: release };
  }
  const url = URL.createObjectURL(item.file);
  try {
    const img = await loadImage(url);
    return { img, w: img.naturalWidth, h: img.naturalHeight, raw: null, done: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The 16-bit TIFF of one photo (engine/deep.ts): the photo in full precision, background and layers as drawn.
 * @param item the photo
 * @param source its decoded image
 * @param width the post's width in pixels
 * @param height the post's height in pixels
 * @returns the TIFF
 */
async function renderTiff(item: IgItem, source: ExportSource, width: number, height: number): Promise<Blob> {
  const [{ deepFromRaw, renderDeepPost }, { tiff16 }] = await Promise.all([import('../engine/deep'), import('../engine/tiff')]);
  const rgb = await renderDeepPost({ img: source.img, w: source.w, h: source.h, deep: source.raw ? deepFromRaw(source.raw) : undefined, sample: item.preview, e: item.edit, layers: item.layers, W: width, H: height });
  // tiff16 returns a Uint8Array over its own ArrayBuffer.
  return new Blob([tiff16(width, height, rgb) as Uint8Array<ArrayBuffer>], { type: 'image/tiff' });
}

/**
 * One photo drawn on the post canvas and encoded in the chosen file type.
 * @param context the post canvas's context, at the post's size
 * @param item the photo
 * @param source its decoded image
 * @param mime the file type's MIME type
 * @returns the encoded file's bytes
 */
async function renderFlat(context: CanvasRenderingContext2D, item: IgItem, source: ExportSource, mime: string): Promise<Blob> {
  const { canvas } = context,
    { fileType, quality } = getIg();
  context.clearRect(0, 0, canvas.width, canvas.height);
  // JPEG has no transparency: start from white so empty corners never turn black.
  if (mime === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  renderIg(context, source.img, source.w, source.h, item.edit, canvas.width, canvas.height);
  drawLayers(context, item.layers, canvas.width, canvas.height);
  return encodePhoto(canvas, fileType, quality);
}

/**
 * One photo at full size in the chosen file type.
 * @param context the post canvas's context, at the post's size
 * @param item the photo
 * @param mime the file type's MIME type
 * @returns the encoded file's bytes
 */
async function renderItem(context: CanvasRenderingContext2D, item: IgItem, mime: string): Promise<Blob> {
  // AI masks: the photo's segmentations (made on its preview, as the stage shows them) are used for the full size too.
  const targets = aiTargets(item.edit.masks);
  if (targets.length) await (await import('../ai/segment')).ensureSegments(item.preview, targets);
  const source = await exportSource(item);
  try {
    shareSegments(item.preview, source.img);
    if (getIg().fileType === 'tiff') return await renderTiff(item, source, context.canvas.width, context.canvas.height);
    return await renderFlat(context, item, source, mime);
  } finally {
    source.done();
  }
}

/**
 * Renders every photo at full size in the chosen format and file type. One photo is in full-size memory at a time.
 * @param onProgress told how many photos are done, of how many
 * @returns the files, named by format and position
 */
export async function renderBatch(onProgress?: (done: number, total: number) => void): Promise<File[]> {
  const { format: formatId, fileType, items } = getIg();
  const format = igFormat(formatId),
    { mime: type, ext } = PHOTO_TYPES[fileType];
  const out: File[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = format.w;
  canvas.height = format.h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  // Text layers draw in their own fonts: make sure every one is loaded first.
  await ensureFonts(items.flatMap((item) => item.layers.flatMap((layer) => (layer.kind === 'text' || layer.kind === 'shape' ? [layer.font] : []))));
  for (const [index, item] of items.entries()) {
    onProgress?.(index, items.length);
    const blob = await renderItem(context, item, type);
    out.push(new File([blob], `chitthi-instagram-${format.ratio.replace(':', 'x')}-${pad(index + 1)}.${ext}`, { type }));
  }
  onProgress?.(items.length, items.length);
  canvas.width = canvas.height = 1; // release the full-size canvas
  return out;
}

/**
 * Renders the batch and keeps the files, ready for sharing (a share needs a fresh click, so it is a second step).
 * @returns the files
 */
export async function prepareBatch(): Promise<File[]> {
  setIgState({ busy: 'Preparing your photos…' });
  try {
    const files = await renderBatch((done, total) => {
      setIgState({ busy: `Preparing photo ${Math.min(done + 1, total)} of ${total}…` });
    });
    setIgState({ ready: files, busy: null });
    return files;
  } catch (error) {
    setIgState({ busy: null });
    throw error;
  }
}

/**
 * The files in one ZIP.
 * @param files the files
 * @returns the ZIP
 */
export const zipOf = (files: File[]): Promise<Blob> => makeZip(files.map((file) => ({ name: file.name, data: file })));

/**
 * Whether this browser can hand these files to other apps (the system share sheet), e.g. the Instagram app.
 * @param files the files
 * @returns true when it can
 */
export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    // Some browsers throw for file types they won't share.
    return false;
  }
}
