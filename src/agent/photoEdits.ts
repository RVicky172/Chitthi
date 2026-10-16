import { igFormat } from '../data/instagram';
import { ADJUST_RANGES, DEFAULT_ADJUST, LOOK_IDS, mergeAdjust, type Adjustments } from '../engine/adjust';
import { isOneOf, keysOf } from '../engine/guards';
import { HSL_BANDS, type ColourMixer } from '../engine/hsl';
import { photoPlace, renderIg } from '../engine/instagram';
import { drawLayers } from '../engine/layerDraw';
import { aiTargets, MASK_COMBINES, type Mask, type MaskPart, type PartKind } from '../engine/masks';
import { frameMask } from '../engine/maskPlace';
import { mergeMasks } from '../engine/maskGate';
import { ensureFonts } from '../lib/fonts';
import { ensureLut, loadLutLibrary } from '../lib/userLuts';
import { getIg, setMasks, type IgItem } from '../state/instagram';
import { numberSchema, recordArg, stringArg, stringSchema, ToolError } from './common';
import { maskOf } from './photoStudioInfo';

/*
 * What the photo-studio tools share: the colour settings' schema and how an agent's settings pass the gates
 * (mergeAdjust, mergeMasks), mask parts, AI masks and the preview drawing.
 */

/** The kinds of mask part, for schemas. */
export const PART_KINDS: readonly PartKind[] = ['brush', 'linear', 'radial', 'colour', 'luma', 'ai'];

/** What each slider does, for the schema (ranges come from ADJUST_RANGES). */
const ABOUT: Record<keyof typeof ADJUST_RANGES, string> = {
  brightness: 'Brightness (older slider; prefer exposure)',
  contrast: 'Contrast',
  saturation: 'Saturation',
  warmth: 'Warmth (older slider; prefer temperature)',
  vignette: 'Darkened corners',
  exposure: 'Exposure in stops',
  highlights: 'Highlights',
  shadows: 'Shadows',
  whites: 'Whites',
  blacks: 'Blacks',
  temperature: 'White balance: warmer (> 0) or cooler',
  tint: 'White balance: magenta (> 0) or green',
  sharpen: 'Sharpening',
  sharpenRadius: 'Sharpening radius in px at 1080 px wide',
  sharpenMask: 'Sharpen edges only (edge masking)',
  noise: 'Noise reduction',
  clarity: 'Clarity (local contrast)',
  dehaze: 'Dehaze',
  grain: 'Film grain',
  lutAmount: 'How strongly the LUT applies',
};

/**
 * The JSON Schema of colour settings.
 * @param description what the settings are for
 * @returns the schema
 */
export const adjustSchema = (description: string) => ({
  type: 'object',
  description,
  properties: {
    look: stringSchema('Ready-made look, applied first', { enum: LOOK_IDS }),
    ...Object.fromEntries(
      keysOf(ADJUST_RANGES).map((key) => {
        const [low, high] = ADJUST_RANGES[key];
        return [key, numberSchema(`${ABOUT[key]}, ${low} to ${high} (default ${DEFAULT_ADJUST[key]})`, { minimum: low, maximum: high })];
      }),
    ),
    curve: {
      type: 'object',
      description:
        'Tone curve: point lists [[input, output], …] (0–1, 2–14 points, sorted by input) for "rgb" (all channels), "r", "g", "b". Channels left out stay as they are; [[0,0],[1,1]] is straight.',
    },
    mixer: {
      type: 'object',
      description: `Colour mixer: "hue", "sat", "lum", each -100 to 100 per colour band, as an object by band (${HSL_BANDS.join(', ')}) or an array of 8 in that order. Bands left out stay as they are.`,
    },
    lut: stringSchema('Id of an imported LUT (list_luts), or "" for none'),
  },
  additionalProperties: false,
});

/** The settings of each kind of mask part, for the tool descriptions. */
export const PART_SETTINGS =
  'Part settings by kind (positions are shares of the photo’s own width and height, 0–1, before it is turned or mirrored; sizes are shares of its width). ' +
  'linear: x, y (middle of the fade), angle (degrees, 90 = full at the top fading downwards), width (length of the fade). ' +
  'radial: x, y, rx, ry (radii), angle, feather 0–100 (full inside, fading over the outer feather %). ' +
  'colour: colour "#rrggbb" (or r, g, b 0–255), range 1–100 (how near a colour counts). ' +
  'luma: lo, hi (0 black – 100 white), smooth 0–100. ' +
  'brush: strokes (replace) or addStrokes (append), each {pts: [x0, y0, x1, y1, …], size (share of the photo width, 0.002–0.6), feather 0–100, flow 1–100, erase}. ' +
  'ai: target "subject" or "sky", found on this device by an AI model (the background: subject with invert: true); refine it with a brush part that adds or subtracts. ' +
  'The sky model needs a one-time download (about 176 MB): if a tool says so, ask the user, then call find_with_ai with allowDownload: true.';

/** The photo argument most photo tools take. */
export const PHOTO_ARG = stringSchema('Photo id from get_photo_batch (default: the selected photo)');

/* ---------- colour settings ---------- */

/**
 * The colour mixer with an agent's values over it.
 * @param base the mixer now
 * @param given `hue`, `sat`, `lum`: arrays of 8 or objects by band
 * @returns the new mixer (values checked later by mergeAdjust)
 */
function mixerPatch(base: ColourMixer, given: Record<string, unknown>): ColourMixer {
  const mixer = { hue: [...base.hue], sat: [...base.sat], lum: [...base.lum] };
  for (const channel of ['hue', 'sat', 'lum'] as const) {
    const values = given[channel];
    if (Array.isArray(values)) values.slice(0, 8).forEach((value, index) => typeof value === 'number' && (mixer[channel][index] = value));
    else
      for (const [band, value] of Object.entries(recordArg(values))) {
        const index = HSL_BANDS.findIndex((known) => known === band);
        if (index >= 0 && typeof value === 'number') mixer[channel][index] = value;
      }
  }
  return mixer;
}

/**
 * Makes sure a LUT the agent names is loaded, so the renderers apply it.
 * @param given the agent's settings
 * @throws ToolError when the LUT isn't on this device
 */
export async function needLut(given: Record<string, unknown>): Promise<void> {
  if (typeof given.lut !== 'string' || !given.lut) return;
  await loadLutLibrary();
  if (!(await ensureLut(given.lut).catch(() => undefined))) throw new ToolError(`There is no LUT “${given.lut}” on this device. Use list_luts, or import_lut.`);
}

/**
 * Whether a key names a colour setting.
 * @param key a key the agent gave
 * @returns true for a setting of Adjustments
 */
const isAdjustKey = (key: string): key is keyof Adjustments => key in DEFAULT_ADJUST;

/**
 * Copies one setting.
 * @param target the patch
 * @param source the settings
 * @param key the setting
 */
function copySetting<K extends keyof Adjustments>(target: Partial<Pick<Adjustments, K>>, source: Pick<Adjustments, K>, key: K): void {
  target[key] = source[key];
}

/**
 * The settings an agent gives, on top of `base`, through mergeAdjust (numbers clamped, unknown values dropped).
 * @param base the settings now
 * @param given the agent's settings
 * @returns only the keys it gave (curve and mixer merged into the base's), and the keys that aren't settings
 */
export function cleanAdjust(base: Adjustments, given: Record<string, unknown>): { patch: Partial<Adjustments>; ignored: string[] } {
  const next: Record<string, unknown> = { ...base, ...given };
  if (given.curve && typeof given.curve === 'object') next.curve = { ...base.curve, ...recordArg(given.curve) };
  if (given.mixer && typeof given.mixer === 'object') next.mixer = mixerPatch(base.mixer, recordArg(given.mixer));
  const merged = mergeAdjust(next);
  const patch: Partial<Adjustments> = {};
  for (const key of Object.keys(given).filter(isAdjustKey)) copySetting(patch, merged, key);
  return { patch, ignored: Object.keys(given).filter((key) => !isAdjustKey(key)) };
}

/**
 * The note about settings that were left out.
 * @param ignored the keys that aren't settings
 * @returns the note, or '' when there are none
 */
export const ignoredNote = (ignored: string[]): string => (ignored.length ? ` Ignored unknown settings: ${ignored.join(', ')}.` : '');

/* ---------- masks ---------- */

/** A mask whose parts haven't passed the gate yet. */
export type MaskDraft = Omit<Mask, 'parts'> & { parts: unknown[] };

/**
 * A part with the agent's settings laid over it; checked afterwards by mergeMasks().
 * @param part the part now (or a new one)
 * @param given the agent's part settings
 * @param combine how it joins the parts before it, if given
 * @param invert whether to invert it, if given
 * @returns the unchecked part
 */
export function shapePart(part: MaskPart, given: Record<string, unknown>, combine?: unknown, invert?: unknown): Record<string, unknown> {
  // addStrokes and colour are instructions, not fields of a part.
  const settings = Object.fromEntries(Object.entries(given).filter(([key]) => key !== 'addStrokes' && key !== 'colour'));
  const next: Record<string, unknown> = { ...part, ...settings, id: part.id, kind: part.kind };
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(stringArg(given.colour));
  if (part.kind === 'colour' && hex) [next.r, next.g, next.b] = hex.slice(1).map((pair) => parseInt(pair, 16));
  if (part.kind === 'brush') {
    const strokes = Array.isArray(given.strokes) ? Array.from<unknown>(given.strokes) : part.strokes;
    const added = Array.isArray(given.addStrokes) ? Array.from<unknown>(given.addStrokes) : [];
    next.strokes = [...strokes, ...added];
  }
  if (isOneOf(MASK_COMBINES, combine)) next.combine = combine;
  if (typeof invert === 'boolean') next.invert = invert;
  return next;
}

/**
 * Puts a changed mask back through the gate and onto the photo (other masks keep their cached rasters).
 * @param item the photo
 * @param draft the mask, possibly with unchecked parts
 * @returns the mask as stored
 * @throws ToolError when the gate refuses the mask
 */
export function putMask(item: IgItem, draft: MaskDraft): Mask {
  const clean = mergeMasks([draft]).at(0);
  if (!clean) throw new ToolError('That mask can’t be used.');
  const at = item.edit.masks.findIndex((mask) => mask.id === draft.id);
  setMasks(item.id, at < 0 ? [...item.edit.masks, clean] : item.edit.masks.map((mask, index) => (index === at ? clean : mask)));
  return clean;
}

/* ---------- AI masks ---------- */

/**
 * Makes the segmentations a photo's AI mask parts need.
 * @param item the photo
 * @param allowDownload the user agreed to download a model that isn't on the device
 * @returns '' when done, or a note for the agent when a model must be downloaded first
 * @throws ToolError when segmentation fails
 */
export async function findAi(item: IgItem, allowDownload = false): Promise<string> {
  const targets = aiTargets(item.edit.masks);
  if (!targets.length) return '';
  const segment = await import('../ai/segment');
  try {
    await segment.ensureSegments(item.preview, targets, { allowDownload });
    return '';
  } catch (error) {
    if (error instanceof segment.NeedsDownload)
      return ` ${error.message} Ask the user whether to download it; if they agree, call find_with_ai with allowDownload: true. Until then the sky part is empty.`;
    if (error instanceof segment.SegmentError) throw new ToolError(error.message);
    throw error;
  }
}

/* ---------- pictures ---------- */

/**
 * Shows a mask in red at half strength where it is full, as the studio shows it.
 * @param pixels the drawn photo's pixels (changed in place)
 * @param mask the mask's coverage, 0–255 per pixel
 */
function tintMask(pixels: Uint8ClampedArray, mask: Uint8Array | Uint8ClampedArray): void {
  for (let index = 0; index < mask.length; index++) {
    const coverage = mask[index] ?? 0;
    const amount = coverage / 510;
    if (!amount) continue;
    const at = index * 4;
    pixels[at] = (pixels[at] ?? 0) + (232 - (pixels[at] ?? 0)) * amount;
    pixels[at + 1] = (pixels[at + 1] ?? 0) + (36 - (pixels[at + 1] ?? 0)) * amount;
    pixels[at + 2] = (pixels[at + 2] ?? 0) + (64 - (pixels[at + 2] ?? 0)) * amount;
    pixels[at + 3] = Math.max(pixels[at + 3] ?? 0, coverage >> 1);
  }
}

/**
 * A photo as it will be posted (framing, colour, masks, layers), optionally with a mask shown in red.
 * @param item the photo
 * @param longSide the picture's long side in pixels
 * @param maskId a mask to show
 * @returns the canvas
 */
export async function drawPhoto(item: IgItem, longSide: number, maskId?: string): Promise<HTMLCanvasElement> {
  const format = igFormat(getIg().format);
  const scale = longSide / Math.max(format.w, format.h);
  const width = Math.max(1, Math.round(format.w * scale));
  const height = Math.max(1, Math.round(format.h * scale));
  await ensureFonts(item.layers.flatMap((layer) => (layer.kind === 'text' || layer.kind === 'shape' ? [layer.font] : [])));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new ToolError('The preview couldn’t be drawn.');
  const { width: sourceWidth, height: sourceHeight } = item.preview;
  renderIg(context, item.preview, sourceWidth, sourceHeight, item.edit, width, height);
  drawLayers(context, item.layers, width, height);
  if (maskId) {
    const place = photoPlace(sourceWidth, sourceHeight, item.edit, width, height);
    const coverage = frameMask(maskOf(item, maskId), sourceWidth, sourceHeight, place, width, height, item.preview);
    const image = context.getImageData(0, 0, width, height);
    tintMask(image.data, coverage.data);
    context.putImageData(image, 0, 0);
  }
  return canvas;
}
