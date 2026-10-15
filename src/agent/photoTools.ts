import { IG_FORMATS, igFormat } from '../data/instagram';
import { DEFAULT_ADJUST, type Adjustments } from '../engine/adjust';
import { isOneOf } from '../engine/guards';
import { mergeEdit, renderIg, type IgEdit } from '../engine/instagram';
import { neutralise } from '../engine/light';
import { encodableTypes, PHOTO_TYPE_IDS } from '../engine/photoExport';
import { adjustEach, adjustPhoto, clearBatch, editPhoto, getIg, removePhoto, setIg, setLimit } from '../state/instagram';
import { renderBatch } from '../state/instagramExport';
import { addPhotos } from '../state/instagramMedia';
import { booleanSchema, fetchImage, numberArg, numberSchema, objectSchema, ok, recordArg, stringSchema, toBlob, ToolError, type AgentTool } from './common';
import { MASK_TOOLS } from './maskTools';
import { adjustSchema, cleanAdjust, drawPhoto, findAi, ignoredNote, needLut, PHOTO_ARG } from './photoEdits';
import { PRESET_TOOLS } from './presetTools';
import { batchInfo, batchSettings, changed, currentItem, itemOf, NO_PHOTOS, photoInfo, targetOf } from './photoStudioInfo';

/*
 * Agent tools for the photo studio (#/instagram, P1.12): the batch, framing, colour settings (light, white balance,
 * tone curve, colour mixer, detail, LUTs), masks, presets, previews and export. Like the print tools they only call
 * the studio's store actions and engine functions, and every setting passes the same gates as a loaded file
 * (mergeAdjust, mergeMasks, mergeEdit), so an agent can't set anything the panels couldn't. In live mode each change
 * is on the photo studio's Undo stack.
 */

const FORMAT_IDS = IG_FORMATS.map((format) => format.id);
const FRAMING_KEYS = ['fit', 'bg', 'zoom', 'px', 'py', 'rot', 'flip'] as const;

/**
 * Copies one framing setting.
 * @param target the patch
 * @param source the framing
 * @param key the setting
 */
function copyFraming<K extends (typeof FRAMING_KEYS)[number]>(target: Partial<Pick<IgEdit, K>>, source: Pick<IgEdit, K>, key: K): void {
  target[key] = source[key];
}

/**
 * The average colour around a point of a photo with only its look applied (before white balance), as the studio's
 * eyedropper reads it: 5 × 5 pixels.
 * @param args the white_balance_from_point arguments: photo, x and y as shares of the post frame
 * @returns the photo and the average red, green and blue
 * @throws ToolError when the point isn't on the photo
 */
function neutralSample(args: Record<string, unknown>) {
  const item = targetOf(args.photo);
  const format = igFormat(getIg().format);
  const canvas = document.createElement('canvas');
  canvas.width = format.w;
  canvas.height = format.h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new ToolError('The photo couldn’t be read.');
  const lookOnly = { ...item.edit, masks: [], adjust: { ...DEFAULT_ADJUST, look: item.edit.adjust.look } };
  renderIg(context, item.preview, item.preview.width, item.preview.height, lookOnly, format.w, format.h);
  const pointX = Math.round(Math.min(1, Math.max(0, numberArg(args.x, 0.5))) * (format.w - 1));
  const pointY = Math.round(Math.min(1, Math.max(0, numberArg(args.y, 0.5))) * (format.h - 1));
  const pixels = context.getImageData(Math.max(0, pointX - 2), Math.max(0, pointY - 2), 5, 5).data;
  canvas.width = canvas.height = 1;
  const sum = { red: 0, green: 0, blue: 0, count: 0 };
  for (let at = 0; at < pixels.length; at += 4)
    if (pixels[at + 3]) {
      sum.red += pixels[at] ?? 0;
      sum.green += pixels[at + 1] ?? 0;
      sum.blue += pixels[at + 2] ?? 0;
      sum.count++;
    }
  if (!sum.count) throw new ToolError('That point isn’t on the photo.');
  return { item, red: sum.red / sum.count, green: sum.green / sum.count, blue: sum.blue / sum.count };
}

/** The batch tools. */
const BATCH_TOOLS: AgentTool[] = [
  {
    name: 'get_photo_batch',
    title: 'Get the photo studio batch',
    description:
      'The photo studio (Instagram photos): post format, export file type, and each photo in the batch with its id, framing, colour settings that differ from the defaults, masks and number of layers.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () => ok('Photo batch', batchInfo()),
  },
  {
    name: 'add_batch_photo',
    title: 'Add a photo to the photo studio',
    description:
      'Adds a JPG, PNG, WebP or camera RAW photo (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2 …) to the photo studio’s batch (up to its limit, at most 20), from a local file path (desktop) or an https URL the user owns or may use. The desktop app develops RAW files in 16 bits; export them as TIFF with set_photo_options to keep that precision.',
    inputSchema: objectSchema({ path: stringSchema('Local file path'), url: stringSchema('https URL of an image'), name: stringSchema('Name to show for the photo') }),
    run: async (args, env) => {
      const { name, blob } = await fetchImage(args, env, { raw: true });
      const before = new Set(getIg().items.map((item) => item.id));
      const messages = await addPhotos([{ name, blob }]);
      const added = getIg().items.find((item) => !before.has(item.id));
      if (!added) throw new ToolError(messages.join(' ') || 'The photo couldn’t be added.');
      const note = messages.length ? ' ' + messages.join(' ') : '';
      return ok(`Added “${name}” as ${added.id}.${note}`, photoInfo(added));
    },
  },
  {
    name: 'remove_batch_photo',
    title: 'Remove photos from the photo studio',
    description: 'Removes one photo from the batch, or every photo with all: true. Undo brings them back in the open studio.',
    inputSchema: objectSchema({ photo: stringSchema('Photo id from get_photo_batch'), all: booleanSchema('Remove every photo') }),
    destructive: true,
    run: (args) => {
      if (args.all === true) clearBatch();
      else if (typeof args.photo === 'string') removePhoto(itemOf(args.photo).id);
      else throw new ToolError('Name a photo, or pass all: true.');
      return ok(`${getIg().items.length} photo(s) left in the batch.`);
    },
  },
  {
    name: 'set_photo_options',
    title: 'Set photo format and export options',
    description: `The post format every photo is framed in (${IG_FORMATS.map((format) => format.id + ' ' + format.ratio).join(', ')}), the export file type (only types this app can write), JPEG/WebP/AVIF quality and the batch limit.`,
    inputSchema: objectSchema({
      format: stringSchema('Post format', { enum: FORMAT_IDS }),
      fileType: stringSchema('Export file type', { enum: PHOTO_TYPE_IDS }),
      quality: numberSchema('Quality for lossy types, 60–100', { minimum: 60, maximum: 100 }),
      limit: numberSchema('How many photos the batch may hold, 1–20', { minimum: 1, maximum: 20 }),
    }),
    run: async (args) => {
      if (typeof args.format === 'string') {
        if (!isOneOf(FORMAT_IDS, args.format)) throw new ToolError(`Unknown format “${args.format}”.`);
        setIg({ format: args.format });
      }
      if (typeof args.fileType === 'string') {
        const writable = await encodableTypes();
        if (!isOneOf(writable, args.fileType)) throw new ToolError(`This app can’t write ${args.fileType}; it can write ${writable.join(', ')}.`);
        setIg({ fileType: args.fileType });
      }
      if (typeof args.quality === 'number') setIg({ quality: Math.round(Math.min(100, Math.max(60, args.quality))) });
      if (typeof args.limit === 'number') setLimit(args.limit);
      return ok('Options set.', batchSettings());
    },
  },
  {
    name: 'frame_photo',
    title: 'Frame a photo',
    description:
      'Where a photo sits in the post: fill the frame (edges cropped) or fit inside it with a background colour or a blurred copy, zoom, position, quarter turns and mirroring.',
    inputSchema: objectSchema({
      photo: PHOTO_ARG,
      fit: stringSchema('fill or fit', { enum: ['fill', 'fit'] }),
      bg: stringSchema('Background for fit: "#rrggbb" or "blur"'),
      zoom: numberSchema('1–4; 1 = just fills (or fits)', { minimum: 1, maximum: 4 }),
      px: numberSchema('Horizontal position in the room the photo has, -1 (left) to 1', { minimum: -1, maximum: 1 }),
      py: numberSchema('Vertical position, -1 (top) to 1', { minimum: -1, maximum: 1 }),
      rot: numberSchema('Turn in degrees', { enum: [0, 90, 180, 270] }),
      flip: booleanSchema('Mirror'),
    }),
    run: (args) => {
      const item = targetOf(args.photo);
      const keys = FRAMING_KEYS.filter((key) => key in args);
      const merged = mergeEdit({ ...item.edit, ...Object.fromEntries(keys.map((key) => [key, args[key]])) });
      const patch: Partial<IgEdit> = {};
      for (const key of keys) copyFraming(patch, merged, key);
      editPhoto(item.id, patch);
      return ok('Framing set.', photoInfo(currentItem(item.id)).framing);
    },
  },
];

/** The colour tools. */
const COLOUR_TOOLS: AgentTool[] = [
  {
    name: 'adjust_photo',
    title: 'Adjust a photo’s colour and detail',
    description:
      'Sets colour settings on one photo or all: look, exposure, highlights, shadows, whites, blacks, temperature and tint, tone curve, colour mixer, sharpening, noise reduction, clarity, dehaze, grain, vignette and a LUT. Only the settings given change (reset: true starts from the defaults). Values are clamped to their ranges.',
    inputSchema: objectSchema(
      {
        photo: stringSchema('Photo id from get_photo_batch, "all" for every photo (default: the selected photo)'),
        settings: adjustSchema('The settings to change'),
        reset: booleanSchema('Start from the default settings (keeps nothing else)'),
      },
      ['settings'],
    ),
    run: async (args) => {
      const given = recordArg(args.settings);
      await needLut(given);
      const isReset = args.reset === true;
      let ignored: string[] = [];
      const nextOf = (current: Adjustments): Adjustments => {
        const base = isReset ? DEFAULT_ADJUST : current;
        const clean = cleanAdjust(base, given);
        ignored = clean.ignored;
        return { ...base, ...clean.patch };
      };
      if (args.photo === 'all') {
        if (!getIg().items.length) throw new ToolError(NO_PHOTOS);
        adjustEach(nextOf);
        const adjusted = getIg().items.map((item) => ({ id: item.id, adjust: changed(item.edit.adjust) }));
        return ok(`Settings applied to ${getIg().items.length} photo(s).${ignoredNote(ignored)}`, adjusted);
      }
      const item = targetOf(args.photo);
      if (isReset) adjustPhoto(item.id, nextOf(item.edit.adjust));
      else {
        const clean = cleanAdjust(item.edit.adjust, given);
        ignored = clean.ignored;
        adjustPhoto(item.id, clean.patch);
      }
      return ok(`Settings applied.${ignoredNote(ignored)}`, changed(currentItem(item.id).edit.adjust));
    },
  },
  {
    name: 'white_balance_from_point',
    title: 'White balance from a neutral point',
    description:
      'The eyedropper: sets temperature and tint so the colour around a point that should be grey or white becomes neutral. x and y are shares of the post frame (0–1, as in render_photo_preview).',
    inputSchema: objectSchema(
      { photo: PHOTO_ARG, x: numberSchema('0 (left) to 1', { minimum: 0, maximum: 1 }), y: numberSchema('0 (top) to 1', { minimum: 0, maximum: 1 }) },
      ['x', 'y'],
    ),
    run: (args) => {
      const { item, red, green, blue } = neutralSample(args);
      const whiteBalance = neutralise(red, green, blue);
      adjustPhoto(item.id, whiteBalance);
      return ok(`White balance set from rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}).`, whiteBalance);
    },
  },
];

/** The preview and export tools. */
const PHOTO_OUTPUT_TOOLS: AgentTool[] = [
  {
    name: 'render_photo_preview',
    title: 'Render a photo preview',
    description:
      'A PNG of one photo as it will be posted (framing, colour, masks and layers), at most 1024 px on the long side. Give mask to see where that mask applies (in red).',
    inputSchema: objectSchema({
      photo: PHOTO_ARG,
      maxPx: numberSchema('Long side in pixels, 256–1024', { minimum: 256, maximum: 1024 }),
      mask: stringSchema('Mask id to show in red'),
    }),
    readOnly: true,
    run: async (args) => {
      const item = itemOf(args.photo);
      const note = await findAi(item);
      const maskId = typeof args.mask === 'string' && args.mask ? args.mask : undefined;
      const canvas = await drawPhoto(item, Math.min(1024, Math.max(256, numberArg(args.maxPx, 800))), maskId);
      const image = await toBlob(canvas);
      canvas.width = canvas.height = 0;
      return { text: `Photo ${item.id} (“${item.name}”), ${igFormat(getIg().format).ratio}.${note}`, image };
    },
  },
  {
    name: 'export_photos',
    title: 'Export the photo batch',
    description:
      'Renders every photo of the batch at full size in the post format and file type chosen (set_photo_options) and writes the files into the agent output folder.',
    inputSchema: objectSchema(),
    run: async () => {
      if (!getIg().items.length) throw new ToolError(NO_PHOTOS);
      for (const item of getIg().items) {
        const note = await findAi(item);
        if (note) throw new ToolError(`Photo ${item.id}:${note}`);
      }
      const files = await renderBatch();
      return { text: `${files.length} photo(s) exported.`, files: files.map((file) => ({ name: file.name, blob: file })) };
    },
  },
];

/** Every photo-studio tool, in the order agents see them. */
export const PHOTO_TOOLS: AgentTool[] = [...BATCH_TOOLS, ...COLOUR_TOOLS, ...MASK_TOOLS, ...PRESET_TOOLS, ...PHOTO_OUTPUT_TOOLS];
