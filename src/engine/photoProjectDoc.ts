import { IG_CAPTION_MAX, IG_FORMATS, IG_MAX_BATCH, clampBatch, type IgFileType, type IgFormatId } from '../data/instagram';
import { isRecord } from './guards';
import { mergeEdit, type IgEdit } from './instagram';
import { keyBudget, type KeyBudget } from './keyframeGate';
import { mergeLayers } from './layerGate';
import type { Layer } from './layers';
import { isPhotoType } from './photoExport';
import { sortedKeys, type DocMedia, type MediaLike } from './projectDoc';
import { ID, readMedia, readName, versionText } from './projectGate';

/*
 * The photo studio's saved project (408 §1): the batch's settings and its photos, each with its edits, masks and
 * layers and the media id of its file. `photoDocument` / `photoFromDocument` convert between it and the studio's
 * batch; `mergePhotoProject` is the single gate for a document read back from storage. All pure.
 */

/** A photo in the studio: its document fields, its file and what the file is (the store adds its preview). */
export interface EditorPhoto<F extends MediaLike> {
  id: string;
  /** The file's name. */
  name: string;
  file: F;
  /** Natural size of the original, pixels. */
  w: number;
  h: number;
  edit: IgEdit;
  /** Text, shapes, stickers and drawings over the photo, bottom first. */
  layers: Layer[];
  /** The file is a camera RAW, developed by the desktop app (P1.9). */
  raw?: boolean;
}

/** A photo in the document: its file is a media id; its name and size are its media entry's. */
export interface DocPhoto extends Pick<EditorPhoto<MediaLike>, 'id' | 'edit' | 'layers'> {
  media: string;
  /** Written only for a camera RAW. */
  raw?: true;
}

/** The saved photo project, version 1. */
export interface PhotoProjectDoc {
  version: 1;
  /** The project's name, 1–80 characters. */
  name?: string;
  format: IgFormatId;
  /** How many photos the batch may hold (1–20, never fewer than it holds). */
  limit: number;
  fileType: IgFileType;
  /** JPEG quality, 60–100. */
  quality: number;
  caption: string;
  /** The selected photo's id. */
  selected: string | null;
  items: DocPhoto[];
  /** Each photo file once, in the order the batch first uses it. */
  media: DocMedia[];
}

/** The studio's batch, as `photoDocument` reads it and `photoFromDocument` gives it (the store's `IgState` is one). */
export interface EditorBatch<F extends MediaLike>
  extends Pick<PhotoProjectDoc, 'format' | 'limit' | 'fileType' | 'quality' | 'caption' | 'selected'> {
  items: EditorPhoto<F>[];
}

/** A photo project opened from a document: the batch and its name. */
export interface OpenedBatch<F extends MediaLike> {
  name: string;
  batch: EditorBatch<F>;
}

/** The settings of a new batch, and of a document with none that can be read. */
const DEFAULTS = { format: 'portrait', limit: 4, fileType: 'jpeg', quality: 92 } as const;

/**
 * The document of the studio's batch: each file listed once, edits and layers with their keys sorted, so the same
 * batch always gives the same bytes.
 * @param batch the studio's batch
 * @param name the project's name
 * @param mediaId the media id a file was kept under
 * @returns the document
 */
export function photoDocument<F extends MediaLike>(batch: EditorBatch<F>, name: string, mediaId: (file: F) => string): PhotoProjectDoc {
  const media = new Map<string, DocMedia>();
  const items = batch.items.map(({ id, name: fileName, file, w: width, h: height, edit, layers, raw }): DocPhoto => {
    const fileId = mediaId(file);
    if (!media.has(fileId))
      media.set(fileId, { id: fileId, kind: 'photo', name: fileName, type: file.type, size: file.size, w: width, h: height, srcDur: 0 });
    return { id, media: fileId, edit: sortedKeys(edit), layers: sortedKeys(layers), ...(raw ? { raw: true } : {}) };
  });
  const { format, limit, fileType, quality, caption, selected } = batch;
  return { version: 1, name, format, limit, fileType, quality, caption, selected, items, media: [...media.values()] };
}

/**
 * The studio's batch from a document that went through the gate: each photo with the file `open` gives for its media,
 * its name and size from its media entry.
 * @param doc the document, after `mergePhotoProject`
 * @param open the file for a media entry, asked once per entry (a missing file is the opener's to mark, 408 D4)
 * @returns the batch and its name
 */
export function photoFromDocument<F extends MediaLike>(doc: PhotoProjectDoc, open: (media: DocMedia) => F): OpenedBatch<F> {
  const entries = new Map(doc.media.map((entry) => [entry.id, entry]));
  const files = new Map<string, F>();
  const items: EditorPhoto<F>[] = [];
  for (const { id, media, edit, layers, raw } of doc.items) {
    const entry = entries.get(media);
    if (!entry) continue;
    const file = files.get(entry.id) ?? open(entry);
    files.set(entry.id, file);
    items.push({ id, name: entry.name, file, w: entry.w, h: entry.h, edit, layers, ...(raw ? { raw: true } : {}) });
  }
  const { format, limit, fileType, quality, caption, selected } = doc;
  return { name: doc.name ?? '', batch: { format, limit, fileType, quality, caption, selected, items } };
}

/** What the gate returns. */
export interface MergedPhotoProject {
  doc: PhotoProjectDoc;
  /** What was dropped or changed, and why: each reason once, for the user. */
  dropped: string[];
}

/**
 * The project a gate returns when there is nothing to read.
 * @returns an empty batch with the default settings
 */
const emptyDoc = (): PhotoProjectDoc => ({ version: 1, ...DEFAULTS, caption: '', selected: null, items: [], media: [] });

/**
 * A photo id not yet used in the document.
 * @param wanted the id the document gave, if any
 * @param taken the ids used so far
 * @returns the id
 */
function freeId(wanted: string, taken: ReadonlySet<string>): string {
  let count = taken.size + 1;
  const base = (wanted || 'ig').slice(0, 32);
  while (taken.has(`${base}-${count}`)) count++;
  return `${base}-${count}`;
}

/** What reading one photo needs: the photo media by id, the ids taken, the keyframe budget, the gate's reasons. */
interface PhotoContext {
  photos: ReadonlyMap<string, DocMedia>;
  taken: Set<string>;
  budget: KeyBudget;
  desktop: boolean;
  note: (reason: string) => void;
}

/**
 * One photo of a document: through `mergeEdit` and `mergeLayers`, with photo media of a known size and a unique id,
 * a camera RAW only in the desktop app.
 * @param entry the document's photo
 * @param context what reading a photo needs
 * @returns the photo and the layers it lost, or null when it is left out
 */
function readPhoto(entry: unknown, context: PhotoContext): { photo: DocPhoto; layersLost: number } | null {
  const { photos, taken, budget, desktop, note } = context;
  if (!isRecord(entry)) {
    note('A photo was unreadable and was left out.');
    return null;
  }
  if (typeof entry.media !== 'string' || !photos.has(entry.media)) {
    note('A photo without its media was left out.');
    return null;
  }
  if (entry.raw === true && !desktop) {
    note('A camera RAW photo was left out: RAW photos open in the desktop app.');
    return null;
  }
  const wanted = typeof entry.id === 'string' && ID.test(entry.id) ? entry.id : '';
  if (wanted && taken.has(wanted)) note(`Two photos had the id “${wanted}”; one was renamed.`);
  const id = wanted && !taken.has(wanted) ? wanted : freeId(wanted, taken);
  taken.add(id);
  const layers = mergeLayers(entry.layers, new Set(), budget);
  const photo: DocPhoto = { id, media: entry.media, edit: mergeEdit(entry.edit), layers, ...(entry.raw === true ? { raw: true } : {}) };
  return { photo, layersLost: (Array.isArray(entry.layers) ? entry.layers.length : 0) - layers.length };
}

/**
 * A document's photos (see `readPhoto`), at most 20.
 * @param raw the document's `items`
 * @param media the document's media, as read
 * @param desktop whether this is the desktop app
 * @param note adds a reason once
 * @returns the photos
 */
function readPhotos(raw: unknown, media: readonly DocMedia[], desktop: boolean, note: (reason: string) => void): DocPhoto[] {
  const entries = Array.isArray(raw) ? raw : [];
  if (entries.length > IG_MAX_BATCH) note(`A batch holds up to ${IG_MAX_BATCH} photos; ${entries.length - IG_MAX_BATCH} were left out.`);
  const photos = new Map(media.filter((entry) => entry.kind === 'photo' && entry.w > 0 && entry.h > 0).map((entry) => [entry.id, entry]));
  const context: PhotoContext = { photos, taken: new Set(), budget: keyBudget(), desktop, note };
  const items: DocPhoto[] = [];
  let layersLost = 0;
  for (const entry of entries.slice(0, IG_MAX_BATCH)) {
    const read = readPhoto(entry, context);
    if (!read) continue;
    items.push(read.photo);
    layersLost += read.layersLost;
  }
  if (layersLost > 0) note(`${layersLost} layer(s) couldn’t be read and were left out.`);
  return items;
}

/**
 * Reads a version 1 document (see `mergePhotoProject`).
 * @param document the document
 * @param desktop whether this is the desktop app
 * @param dropped the gate's reasons
 * @returns the project
 */
function readPhotoProject(document: Record<string, unknown>, desktop: boolean, dropped: string[]): PhotoProjectDoc {
  const note = (reason: string) => {
    if (!dropped.includes(reason)) dropped.push(reason);
  };
  const name = readName(document.name, dropped);
  const media = readMedia(document.media, dropped);
  const items = readPhotos(document.items, media, desktop, note);
  const used = new Set(items.map((item) => item.media));
  const { format, limit, fileType, quality, caption, selected } = document;
  return {
    version: 1,
    ...(name ? { name } : {}),
    format: IG_FORMATS.some((entry) => entry.id === format) ? (format as IgFormatId) : DEFAULTS.format,
    limit: Math.max(typeof limit === 'number' ? clampBatch(limit) : DEFAULTS.limit, items.length),
    fileType: isPhotoType(fileType) ? fileType : DEFAULTS.fileType,
    quality: typeof quality === 'number' && Number.isFinite(quality) ? Math.round(Math.min(100, Math.max(60, quality))) : DEFAULTS.quality,
    caption: typeof caption === 'string' ? caption.slice(0, IG_CAPTION_MAX) : '',
    selected: items.some((item) => item.id === selected) ? (selected as string) : null,
    items,
    media: media.filter((entry) => used.has(entry.id)),
  };
}

/**
 * The single gate for photo project data from storage. Settings out of range are clamped or replaced by the defaults;
 * photos without their media, unreadable or (on the web) camera RAW are left out; at most 20 photos; ids are made
 * unique; edits and layers go through `mergeEdit` and `mergeLayers`. Never throws.
 * @param raw the parsed document
 * @param desktop whether this is the desktop app (RAW photos)
 * @returns a valid version 1 photo project and what it dropped or changed, and why
 */
export function mergePhotoProject(raw: unknown, desktop: boolean): MergedPhotoProject {
  const dropped: string[] = [];
  try {
    if (!isRecord(raw) || raw.version === undefined) return { doc: emptyDoc(), dropped: ['This isn’t a photo project.'] };
    if (raw.version !== 1)
      return {
        doc: emptyDoc(),
        dropped: [`This project is from a newer version of Chitthi Studio (version ${versionText(raw.version).slice(0, 10)}).`],
      };
    return { doc: readPhotoProject(raw, desktop, dropped), dropped };
  } catch (error) {
    return { doc: emptyDoc(), dropped: [...dropped, `The project couldn’t be read (${error instanceof Error ? error.message : 'unknown error'}).`] };
  }
}
