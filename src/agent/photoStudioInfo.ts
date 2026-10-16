import { igFormat } from '../data/instagram';
import { DEFAULT_ADJUST, type Adjustments } from '../engine/adjust';
import { keysOf } from '../engine/guards';
import { maskActive, type Mask, type MaskPart } from '../engine/masks';
import { getIg, selectPhoto, type IgItem } from '../state/instagram';
import { stringArg, ToolError } from './common';

/*
 * The photo studio as an agent sees it (the batch, each photo's framing, changed settings and masks), and finding the
 * photo or mask an agent names.
 */

/** The message when the batch is empty. */
export const NO_PHOTOS = 'The photo studio has no photos. Add one with add_batch_photo.';

/**
 * Whether two settings are equal (as JSON).
 * @param first a setting
 * @param second another
 * @returns true when they are the same
 */
const sameSetting = (first: unknown, second: unknown): boolean => JSON.stringify(first) === JSON.stringify(second);

/**
 * Only the settings that differ from the defaults, so an agent sees what was done.
 * @param adjust colour settings
 * @returns the changed ones
 */
export const changed = (adjust: Adjustments): Partial<Adjustments> =>
  Object.fromEntries(keysOf(adjust).filter((key) => !sameSetting(adjust[key], DEFAULT_ADJUST[key])).map((key) => [key, adjust[key]]));

/**
 * A mask part as an agent sees it: a brush part gives its number of strokes, not the strokes.
 * @param part the part
 * @returns its description
 */
const partInfo = (part: MaskPart) => (part.kind === 'brush' ? { ...part, strokes: part.strokes.length } : part);

/**
 * A mask as an agent sees it.
 * @param mask the mask
 * @returns its id, name, switches, parts and changed settings
 */
export const maskInfo = (mask: Mask) => ({
  id: mask.id,
  name: mask.name,
  on: mask.on,
  invert: mask.invert,
  active: maskActive(mask),
  parts: mask.parts.map(partInfo),
  adjust: changed(mask.adjust),
});

/**
 * A photo of the batch as an agent sees it.
 * @param item the photo
 * @returns its id, name, size, framing, changed settings, masks and number of layers
 */
export const photoInfo = (item: IgItem) => {
  const { edit } = item;
  return {
    id: item.id,
    name: item.name,
    pixels: [item.w, item.h],
    raw: !!item.raw,
    selected: getIg().selected === item.id,
    framing: { fit: edit.fit, bg: edit.bg, zoom: edit.zoom, px: edit.px, py: edit.py, rot: edit.rot, flip: edit.flip },
    adjust: changed(edit.adjust),
    masks: edit.masks.map(maskInfo),
    layers: item.layers.length,
  };
};

/**
 * The batch's settings.
 * @returns post format, file type, quality and limit
 */
export const batchSettings = () => {
  const studio = getIg();
  const format = igFormat(studio.format);
  return { format: { id: format.id, ratio: format.ratio, pixels: [format.w, format.h] }, fileType: studio.fileType, quality: studio.quality, limit: studio.limit };
};

/**
 * The batch as an agent sees it.
 * @returns its settings and every photo
 */
export const batchInfo = () => ({ ...batchSettings(), photos: getIg().items.map(photoInfo) });

/**
 * The photo an agent names.
 * @param photoId the argument (the selected photo when it names none)
 * @returns the photo
 * @throws ToolError when the batch is empty or has no such photo
 */
export function itemOf(photoId: unknown): IgItem {
  const studio = getIg();
  if (!studio.items.length) throw new ToolError(NO_PHOTOS);
  const id = stringArg(photoId) || studio.selected;
  const item = studio.items.find((candidate) => candidate.id === id);
  if (!item) throw new ToolError(`There is no photo “${stringArg(photoId)}” in the batch. Use get_photo_batch for the ids.`);
  return item;
}

/**
 * The photo to change: selected too, so someone watching the live studio sees it.
 * @param photoId the argument
 * @returns the photo
 */
export function targetOf(photoId: unknown): IgItem {
  const item = itemOf(photoId);
  if (getIg().selected !== item.id) selectPhoto(item.id);
  return item;
}

/**
 * A photo as it is now (after a change).
 * @param id the photo's id
 * @returns the photo
 * @throws ToolError when it is no longer in the batch
 */
export function currentItem(id: string): IgItem {
  const item = getIg().items.find((candidate) => candidate.id === id);
  if (!item) throw new ToolError(`Photo ${id} is no longer in the batch.`);
  return item;
}

/**
 * The mask an agent names on a photo.
 * @param item the photo
 * @param maskId the argument
 * @returns the mask
 * @throws ToolError when the photo has no such mask
 */
export function maskOf(item: IgItem, maskId: unknown): Mask {
  const mask = item.edit.masks.find((candidate) => candidate.id === maskId);
  if (!mask) throw new ToolError(`Photo ${item.id} has no mask “${stringArg(maskId)}”. Use get_photo_batch for the ids.`);
  return mask;
}
