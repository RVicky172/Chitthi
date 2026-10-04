import { IG_FORMATS, igFormat, type IgFormatId } from '../data/instagram';
import { BUILT_IN_PRESETS } from '../data/presets';
import { ADJUST_RANGES, DEFAULT_ADJUST, LOOK_IDS, mergeAdjust, type Adjustments } from '../engine/adjust';
import { HSL_BANDS, type ColourMixer, type HslBand } from '../engine/hsl';
import { mergeEdit, photoPlace, renderIg, type IgEdit } from '../engine/instagram';
import { drawLayers } from '../engine/layers';
import { neutralise } from '../engine/light';
import { LUT_MAX_BYTES, lutById, LutError, parseCube } from '../engine/lut';
import {
  aiTargets,
  frameMask,
  MASK_COMBINES,
  MASK_LIMITS,
  maskActive,
  mergeMasks,
  newMask,
  newPart,
  type Mask,
  type MaskCombine,
  type MaskPart,
  type PartKind,
} from '../engine/masks';
import { encodableTypes, PHOTO_TYPE_IDS, type PhotoType } from '../engine/photoExport';
import { PresetError } from '../engine/presets';
import { ensureFonts } from '../lib/fonts';
import { ensureLut, getLutLibrary, keepLut, loadLutLibrary } from '../lib/userLuts';
import {
  addPhotos,
  adjustEach,
  adjustPhoto,
  clearBatch,
  editPhoto,
  getIg,
  removePhoto,
  renderBatch,
  selectPhoto,
  setIg,
  setLimit,
  setMasks,
  type IgItem,
} from '../state/instagram';
import { deletePreset, exportPresets, getPresets, importPresets, loadPresets, savePreset } from '../state/presets';
import { bool, fetchImage, n, num, obj, ok, s, str, toBlob, ToolError, type AgentTool } from './common';

/*
 * Agent tools for the photo studio (#/instagram, P1.12): the batch, framing, colour settings (light, white balance,
 * tone curve, colour mixer, detail, LUTs), masks, presets, previews and export. Like the print tools they only call
 * the studio's store actions and engine functions, and every setting passes the same gates as a loaded file
 * (mergeAdjust, mergeMasks, mergeEdit), so an agent can't set anything the panels couldn't. In live mode each change
 * is on the photo studio's Undo stack.
 */

const PART_KINDS: readonly PartKind[] = ['brush', 'linear', 'radial', 'colour', 'luma', 'ai'];

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

const adjustSchema = (description: string) => ({
  type: 'object',
  description,
  properties: {
    look: str('Ready-made look, applied first', { enum: LOOK_IDS }),
    ...Object.fromEntries(
      (Object.entries(ADJUST_RANGES) as [keyof typeof ADJUST_RANGES, readonly [number, number]][]).map(([k, [lo, hi]]) => [
        k,
        num(`${ABOUT[k]}, ${lo} to ${hi} (default ${DEFAULT_ADJUST[k]})`, { minimum: lo, maximum: hi }),
      ]),
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
    lut: str('Id of an imported LUT (list_luts), or "" for none'),
  },
  additionalProperties: false,
});

const PART_SETTINGS =
  'Part settings by kind (positions are shares of the photo’s own width and height, 0–1, before it is turned or mirrored; sizes are shares of its width). ' +
  'linear: x, y (middle of the fade), angle (degrees, 90 = full at the top fading downwards), width (length of the fade). ' +
  'radial: x, y, rx, ry (radii), angle, feather 0–100 (full inside, fading over the outer feather %). ' +
  'colour: colour "#rrggbb" (or r, g, b 0–255), range 1–100 (how near a colour counts). ' +
  'luma: lo, hi (0 black – 100 white), smooth 0–100. ' +
  'brush: strokes (replace) or addStrokes (append), each {pts: [x0, y0, x1, y1, …], size (share of the photo width, 0.002–0.6), feather 0–100, flow 1–100, erase}. ' +
  'ai: target "subject" or "sky", found on this device by an AI model (the background: subject with invert: true); refine it with a brush part that adds or subtracts. ' +
  'The sky model needs a one-time download (about 176 MB): if a tool says so, ask the user, then call find_with_ai with allowDownload: true.';

/* ---------- reading and describing ---------- */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Only the settings that differ from the defaults, so an agent sees what was done. */
const changed = (a: Adjustments) => Object.fromEntries(Object.entries(a).filter(([k, v]) => !same(v, DEFAULT_ADJUST[k as keyof Adjustments])));

const partInfo = (p: MaskPart) => (p.kind === 'brush' ? { ...p, strokes: p.strokes.length } : p);
const maskInfo = (m: Mask) => ({ id: m.id, name: m.name, on: m.on, invert: m.invert, active: maskActive(m), parts: m.parts.map(partInfo), adjust: changed(m.adjust) });
const photoInfo = (it: IgItem) => ({
  id: it.id,
  name: it.name,
  pixels: [it.w, it.h],
  selected: getIg().selected === it.id,
  framing: { fit: it.edit.fit, bg: it.edit.bg, zoom: it.edit.zoom, px: it.edit.px, py: it.edit.py, rot: it.edit.rot, flip: it.edit.flip },
  adjust: changed(it.edit.adjust),
  masks: it.edit.masks.map(maskInfo),
  layers: it.layers.length,
});
const batchInfo = () => {
  const st = getIg(),
    f = igFormat(st.format);
  return { format: { id: f.id, ratio: f.ratio, pixels: [f.w, f.h] }, fileType: st.fileType, quality: st.quality, limit: st.limit, photos: st.items.map(photoInfo) };
};

/** The photo an agent names (the selected one when it names none). */
function itemOf(v: unknown): IgItem {
  const st = getIg();
  if (!st.items.length) throw new ToolError('The photo studio has no photos. Add one with add_batch_photo.');
  const id = s(v) || st.selected;
  const it = st.items.find((x) => x.id === id);
  if (!it) throw new ToolError(`There is no photo “${s(v)}” in the batch. Use get_photo_batch for the ids.`);
  return it;
}
/** The photo to change: selected too, so someone watching the live studio sees it. */
function target(v: unknown): IgItem {
  const it = itemOf(v);
  if (getIg().selected !== it.id) selectPhoto(it.id);
  return it;
}
const fresh = (id: string): IgItem => getIg().items.find((x) => x.id === id)!;
const maskOf = (it: IgItem, id: unknown): Mask => {
  const m = it.edit.masks.find((x) => x.id === id);
  if (!m) throw new ToolError(`Photo ${it.id} has no mask “${s(id)}”. Use get_photo_batch for the ids.`);
  return m;
};
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/* ---------- colour settings ---------- */

function mixerPatch(base: ColourMixer, raw: Record<string, unknown>): ColourMixer {
  const out = { hue: [...base.hue], sat: [...base.sat], lum: [...base.lum] };
  for (const k of ['hue', 'sat', 'lum'] as const) {
    const v = raw[k];
    if (Array.isArray(v)) v.slice(0, 8).forEach((x, i) => typeof x === 'number' && (out[k][i] = x));
    else
      for (const [band, x] of Object.entries(record(v))) {
        const i = HSL_BANDS.indexOf(band as HslBand);
        if (i >= 0 && typeof x === 'number') out[k][i] = x;
      }
  }
  return out;
}

/** Makes sure a LUT the agent names is loaded, so the renderers apply it. */
async function needLut(raw: Record<string, unknown>): Promise<void> {
  if (typeof raw.lut !== 'string' || !raw.lut) return;
  await loadLutLibrary();
  if (!(await ensureLut(raw.lut).catch(() => undefined))) throw new ToolError(`There is no LUT “${raw.lut}” on this device. Use list_luts, or import_lut.`);
}

/**
 * The settings an agent gives, on top of `base`, through mergeAdjust (numbers clamped, unknown values dropped).
 * Returns only the keys it gave (curve and mixer merged into the base's), and the keys that aren't settings.
 */
function cleanAdjust(base: Adjustments, raw: Record<string, unknown>): { patch: Partial<Adjustments>; ignored: string[] } {
  const keys = Object.keys(raw).filter((k) => k in DEFAULT_ADJUST) as (keyof Adjustments)[];
  const next: Record<string, unknown> = { ...base, ...raw };
  if (raw.curve && typeof raw.curve === 'object') next.curve = { ...base.curve, ...record(raw.curve) };
  if (raw.mixer && typeof raw.mixer === 'object') next.mixer = mixerPatch(base.mixer, record(raw.mixer));
  const merged = mergeAdjust(next);
  return { patch: Object.fromEntries(keys.map((k) => [k, merged[k]])) as Partial<Adjustments>, ignored: Object.keys(raw).filter((k) => !(k in DEFAULT_ADJUST)) };
}
const ignoredNote = (ignored: string[]) => (ignored.length ? ` Ignored unknown settings: ${ignored.join(', ')}.` : '');

/* ---------- masks ---------- */

/** A part with the agent's settings laid over it; checked afterwards by mergeMasks(). */
function shapePart(part: MaskPart, raw: Record<string, unknown>, combine?: unknown, invert?: unknown): MaskPart {
  const next: Record<string, unknown> = { ...part, ...raw, id: part.id, kind: part.kind };
  delete next.addStrokes;
  delete next.colour;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s(raw.colour));
  if (part.kind === 'colour' && hex) [next.r, next.g, next.b] = hex.slice(1).map((h) => parseInt(h, 16));
  if (part.kind === 'brush') next.strokes = [...(Array.isArray(raw.strokes) ? raw.strokes : part.strokes), ...(Array.isArray(raw.addStrokes) ? raw.addStrokes : [])];
  if (MASK_COMBINES.includes(combine as MaskCombine)) next.combine = combine;
  if (typeof invert === 'boolean') next.invert = invert;
  return next as unknown as MaskPart;
}

/** Puts a changed mask back through the gate and onto the photo (other masks keep their cached rasters). */
function putMask(it: IgItem, m: Mask): Mask {
  const [clean] = mergeMasks([m]);
  const at = it.edit.masks.findIndex((x) => x.id === m.id);
  setMasks(it.id, at < 0 ? [...it.edit.masks, clean] : it.edit.masks.map((x, i) => (i === at ? clean : x)));
  return clean;
}

/* ---------- AI masks ---------- */

/**
 * Makes the segmentations a photo's AI mask parts need. Returns a note for the agent when a model must be downloaded
 * first (and allowDownload isn't set); other failures throw.
 */
async function findAi(it: IgItem, allowDownload = false): Promise<string> {
  const targets = aiTargets(it.edit.masks);
  if (!targets.length) return '';
  const seg = await import('../ai/segment');
  try {
    await seg.ensureSegments(it.preview, targets, { allowDownload });
    return '';
  } catch (e) {
    if (e instanceof seg.NeedsDownload)
      return ` ${e.message} Ask the user whether to download it; if they agree, call find_with_ai with allowDownload: true. Until then the sky part is empty.`;
    if (e instanceof seg.SegmentError) throw new ToolError(e.message);
    throw e;
  }
}

/* ---------- pictures ---------- */

async function drawPhoto(it: IgItem, long: number, maskId?: string): Promise<HTMLCanvasElement> {
  const f = igFormat(getIg().format),
    k = long / Math.max(f.w, f.h),
    W = Math.max(1, Math.round(f.w * k)),
    H = Math.max(1, Math.round(f.h * k));
  await ensureFonts(it.layers.flatMap((l) => (l.kind === 'text' || l.kind === 'shape' ? [l.font] : [])));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d');
  if (!x) throw new ToolError('The preview couldn’t be drawn.');
  const sw = it.preview.width,
    sh = it.preview.height;
  renderIg(x, it.preview, sw, sh, it.edit, W, H);
  drawLayers(x, it.layers, W, H);
  if (maskId) {
    // The mask in red at half strength where it is full, as the studio shows it.
    const fm = frameMask(maskOf(it, maskId), sw, sh, photoPlace(sw, sh, it.edit, W, H), W, H, it.preview);
    const img = x.getImageData(0, 0, W, H),
      d = img.data;
    for (let i = 0; i < fm.data.length; i++) {
      const a = fm.data[i] / 510;
      if (!a) continue;
      d[i * 4] += (232 - d[i * 4]) * a;
      d[i * 4 + 1] += (36 - d[i * 4 + 1]) * a;
      d[i * 4 + 2] += (64 - d[i * 4 + 2]) * a;
      d[i * 4 + 3] = Math.max(d[i * 4 + 3], fm.data[i] >> 1);
    }
    x.putImageData(img, 0, 0);
  }
  return cv;
}

const photoArg = str('Photo id from get_photo_batch (default: the selected photo)');

export const PHOTO_TOOLS: AgentTool[] = [
  /* ---------- the batch ---------- */
  {
    name: 'get_photo_batch',
    title: 'Get the photo studio batch',
    description:
      'The photo studio (Instagram photos): post format, export file type, and each photo in the batch with its id, framing, colour settings that differ from the defaults, masks and number of layers.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => ok('Photo batch', batchInfo()),
  },
  {
    name: 'add_batch_photo',
    title: 'Add a photo to the photo studio',
    description: 'Adds a JPG, PNG or WebP photo to the photo studio’s batch (up to its limit, at most 20), from a local file path (desktop) or an https URL the user owns or may use.',
    inputSchema: obj({ path: str('Local file path'), url: str('https URL of an image'), name: str('Name to show for the photo') }),
    run: async (a, env) => {
      const { name, blob } = await fetchImage(a, env);
      const before = new Set(getIg().items.map((x) => x.id));
      const msgs = await addPhotos([{ name, blob }]);
      const added = getIg().items.find((x) => !before.has(x.id));
      if (!added) throw new ToolError(msgs.join(' ') || 'The photo couldn’t be added.');
      return ok(`Added “${name}” as ${added.id}.${msgs.length ? ' ' + msgs.join(' ') : ''}`, photoInfo(added));
    },
  },
  {
    name: 'remove_batch_photo',
    title: 'Remove photos from the photo studio',
    description: 'Removes one photo from the batch, or every photo with all: true. Undo brings them back in the open studio.',
    inputSchema: obj({ photo: str('Photo id from get_photo_batch'), all: bool('Remove every photo') }),
    destructive: true,
    run: async (a) => {
      if (a.all === true) clearBatch();
      else if (typeof a.photo === 'string') removePhoto(itemOf(a.photo).id);
      else throw new ToolError('Name a photo, or pass all: true.');
      return ok(`${getIg().items.length} photo(s) left in the batch.`);
    },
  },
  {
    name: 'set_photo_options',
    title: 'Set photo format and export options',
    description: `The post format every photo is framed in (${IG_FORMATS.map((f) => `${f.id} ${f.ratio}`).join(', ')}), the export file type (only types this app can write), JPEG/WebP/AVIF quality and the batch limit.`,
    inputSchema: obj({
      format: str('Post format', { enum: IG_FORMATS.map((f) => f.id) }),
      fileType: str('Export file type', { enum: PHOTO_TYPE_IDS }),
      quality: num('Quality for lossy types, 60–100', { minimum: 60, maximum: 100 }),
      limit: num('How many photos the batch may hold, 1–20', { minimum: 1, maximum: 20 }),
    }),
    run: async (a) => {
      if (typeof a.format === 'string') {
        if (!IG_FORMATS.some((f) => f.id === a.format)) throw new ToolError(`Unknown format “${a.format}”.`);
        setIg({ format: a.format as IgFormatId });
      }
      if (typeof a.fileType === 'string') {
        const can = await encodableTypes();
        if (!can.includes(a.fileType as PhotoType)) throw new ToolError(`This app can’t write ${a.fileType}; it can write ${can.join(', ')}.`);
        setIg({ fileType: a.fileType as PhotoType });
      }
      if (typeof a.quality === 'number') setIg({ quality: Math.round(Math.min(100, Math.max(60, a.quality))) });
      if (typeof a.limit === 'number') setLimit(a.limit);
      const { photos: _, ...rest } = batchInfo();
      return ok('Options set.', rest);
    },
  },
  {
    name: 'frame_photo',
    title: 'Frame a photo',
    description:
      'Where a photo sits in the post: fill the frame (edges cropped) or fit inside it with a background colour or a blurred copy, zoom, position, quarter turns and mirroring.',
    inputSchema: obj({
      photo: photoArg,
      fit: str('fill or fit', { enum: ['fill', 'fit'] }),
      bg: str('Background for fit: "#rrggbb" or "blur"'),
      zoom: num('1–4; 1 = just fills (or fits)', { minimum: 1, maximum: 4 }),
      px: num('Horizontal position in the room the photo has, -1 (left) to 1', { minimum: -1, maximum: 1 }),
      py: num('Vertical position, -1 (top) to 1', { minimum: -1, maximum: 1 }),
      rot: num('Turn in degrees', { enum: [0, 90, 180, 270] }),
      flip: bool('Mirror'),
    }),
    run: async (a) => {
      const it = target(a.photo);
      const keys = (['fit', 'bg', 'zoom', 'px', 'py', 'rot', 'flip'] as const).filter((k) => k in a);
      const merged = mergeEdit({ ...it.edit, ...Object.fromEntries(keys.map((k) => [k, a[k]])) });
      editPhoto(it.id, Object.fromEntries(keys.map((k) => [k, merged[k]])) as Partial<IgEdit>);
      return ok('Framing set.', photoInfo(fresh(it.id)).framing);
    },
  },

  /* ---------- colour ---------- */
  {
    name: 'adjust_photo',
    title: 'Adjust a photo’s colour and detail',
    description:
      'Sets colour settings on one photo or all: look, exposure, highlights, shadows, whites, blacks, temperature and tint, tone curve, colour mixer, sharpening, noise reduction, clarity, dehaze, grain, vignette and a LUT. Only the settings given change (reset: true starts from the defaults). Values are clamped to their ranges.',
    inputSchema: obj(
      {
        photo: str('Photo id from get_photo_batch, "all" for every photo (default: the selected photo)'),
        settings: adjustSchema('The settings to change'),
        reset: bool('Start from the default settings (keeps nothing else)'),
      },
      ['settings'],
    ),
    run: async (a) => {
      const raw = record(a.settings);
      await needLut(raw);
      let ignored: string[] = [];
      const next = (base: Adjustments): Adjustments => {
        const r = cleanAdjust(a.reset === true ? DEFAULT_ADJUST : base, raw);
        ignored = r.ignored;
        return { ...(a.reset === true ? DEFAULT_ADJUST : base), ...r.patch };
      };
      if (a.photo === 'all') {
        if (!getIg().items.length) throw new ToolError('The photo studio has no photos. Add one with add_batch_photo.');
        adjustEach(next);
        return ok(`Settings applied to ${getIg().items.length} photo(s).${ignoredNote(ignored)}`, getIg().items.map((x) => ({ id: x.id, adjust: changed(x.edit.adjust) })));
      }
      const it = target(a.photo);
      if (a.reset === true) adjustPhoto(it.id, next(it.edit.adjust));
      else {
        const r = cleanAdjust(it.edit.adjust, raw);
        ignored = r.ignored;
        adjustPhoto(it.id, r.patch);
      }
      return ok(`Settings applied.${ignoredNote(ignored)}`, changed(fresh(it.id).edit.adjust));
    },
  },
  {
    name: 'white_balance_from_point',
    title: 'White balance from a neutral point',
    description:
      'The eyedropper: sets temperature and tint so the colour around a point that should be grey or white becomes neutral. x and y are shares of the post frame (0–1, as in render_photo_preview).',
    inputSchema: obj({ photo: photoArg, x: num('0 (left) to 1', { minimum: 0, maximum: 1 }), y: num('0 (top) to 1', { minimum: 0, maximum: 1 }) }, ['x', 'y']),
    run: async (a) => {
      const it = target(a.photo);
      const f = igFormat(getIg().format);
      const cv = document.createElement('canvas');
      cv.width = f.w;
      cv.height = f.h;
      const x = cv.getContext('2d', { willReadFrequently: true });
      if (!x) throw new ToolError('The photo couldn’t be read.');
      // As the studio's eyedropper: the photo with only its look applied (before white balance), 5 × 5 pixels.
      renderIg(x, it.preview, it.preview.width, it.preview.height, { ...it.edit, masks: [], adjust: { ...DEFAULT_ADJUST, look: it.edit.adjust.look } }, f.w, f.h);
      const px = Math.round(Math.min(1, Math.max(0, n(a.x, 0.5))) * (f.w - 1)),
        py = Math.round(Math.min(1, Math.max(0, n(a.y, 0.5))) * (f.h - 1));
      const d = x.getImageData(Math.max(0, px - 2), Math.max(0, py - 2), 5, 5).data;
      cv.width = cv.height = 1;
      let r = 0,
        g = 0,
        b = 0,
        k = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3]) {
          r += d[i];
          g += d[i + 1];
          b += d[i + 2];
          k++;
        }
      if (!k) throw new ToolError('That point isn’t on the photo.');
      const wb = neutralise(r / k, g / k, b / k);
      adjustPhoto(it.id, wb);
      return ok(`White balance set from rgb(${Math.round(r / k)}, ${Math.round(g / k)}, ${Math.round(b / k)}).`, wb);
    },
  },

  /* ---------- masks ---------- */
  {
    name: 'add_mask',
    title: 'Add a mask to a photo',
    description: `Adds a local adjustment: a mask with one part (brush, linear or radial gradient, colour or brightness range) and its own colour settings, applied only where the mask is (up to ${MASK_LIMITS.masks} masks, ${MASK_LIMITS.parts} parts each). Add more parts with set_mask_part; look at it with render_photo_preview and its mask argument. ${PART_SETTINGS}`,
    inputSchema: obj(
      {
        photo: photoArg,
        kind: str('Kind of the first part', { enum: PART_KINDS }),
        name: str('Name, e.g. "Sky"'),
        part: { type: 'object', description: 'Settings of the first part (see the description); left out = a ready-made shape' },
        adjust: adjustSchema('Colour settings applied where the mask is, e.g. {"exposure": -0.5}'),
        invert: bool('Apply everywhere except the mask'),
      },
      ['kind'],
    ),
    run: async (a) => {
      const it = target(a.photo);
      if (it.edit.masks.length >= MASK_LIMITS.masks) throw new ToolError(`The photo already has ${MASK_LIMITS.masks} masks, the most it can have.`);
      const kind = s(a.kind) as PartKind;
      if (!PART_KINDS.includes(kind)) throw new ToolError(`Unknown part kind “${s(a.kind)}”.`);
      const raw = record(a.adjust);
      await needLut(raw);
      const m = newMask(s(a.name).trim() || `Mask ${it.edit.masks.length + 1}`, kind);
      m.parts = [shapePart(m.parts[0], record(a.part))];
      m.adjust = { ...DEFAULT_ADJUST, ...cleanAdjust(DEFAULT_ADJUST, raw).patch };
      m.invert = a.invert === true;
      const out = putMask(it, m);
      const note = await findAi(fresh(it.id));
      return ok(`Mask ${out.id} added.${maskActive(out) ? '' : ' It changes nothing yet: give it settings with edit_mask.'}${note}`, maskInfo(out));
    },
  },
  {
    name: 'edit_mask',
    title: 'Change a mask',
    description: 'Changes a mask’s name, whether it is on, inverted, and its colour settings (only the settings given change; resetAdjust: true starts from the defaults).',
    inputSchema: obj(
      {
        photo: photoArg,
        mask: str('Mask id'),
        name: str('New name'),
        on: bool('Apply the mask (false keeps it but leaves it out)'),
        invert: bool('Apply everywhere except the mask'),
        adjust: adjustSchema('Colour settings applied where the mask is'),
        resetAdjust: bool('Start the mask’s colour settings from the defaults'),
      },
      ['mask'],
    ),
    run: async (a) => {
      const it = target(a.photo),
        m = maskOf(it, a.mask);
      const raw = record(a.adjust);
      await needLut(raw);
      const base = a.resetAdjust === true ? DEFAULT_ADJUST : m.adjust;
      const r = cleanAdjust(base, raw);
      const out = putMask(it, {
        ...m,
        name: s(a.name).trim() || m.name,
        on: typeof a.on === 'boolean' ? a.on : m.on,
        invert: typeof a.invert === 'boolean' ? a.invert : m.invert,
        adjust: { ...base, ...r.patch },
      });
      return ok(`Mask changed.${ignoredNote(r.ignored)}`, maskInfo(out));
    },
  },
  {
    name: 'set_mask_part',
    title: 'Add or change a mask part',
    description: `Adds a part to a mask (give kind) or changes one (give part). Parts combine in order: add, subtract, or intersect (only where both are; range parts usually narrow a gradient down, e.g. a linear sky fade intersected with a blue colour range). ${PART_SETTINGS}`,
    inputSchema: obj(
      {
        photo: photoArg,
        mask: str('Mask id'),
        part: str('Id of the part to change; leave out to add one'),
        kind: str('Kind of a new part', { enum: PART_KINDS }),
        combine: str('How the part joins the parts before it (the first always adds)', { enum: MASK_COMBINES }),
        invert: bool('Invert this part'),
        settings: { type: 'object', description: 'Part settings (see the description)' },
      },
      ['mask'],
    ),
    run: async (a) => {
      const it = target(a.photo),
        m = maskOf(it, a.mask);
      let parts: MaskPart[];
      if (typeof a.part === 'string') {
        const p = m.parts.find((x) => x.id === a.part);
        if (!p) throw new ToolError(`Mask ${m.id} has no part “${a.part}”.`);
        parts = m.parts.map((x) => (x === p ? shapePart(p, record(a.settings), a.combine, a.invert) : x));
      } else {
        const kind = s(a.kind) as PartKind;
        if (!PART_KINDS.includes(kind)) throw new ToolError('Give the kind of the new part, or the id of a part to change.');
        if (m.parts.length >= MASK_LIMITS.parts) throw new ToolError(`The mask already has ${MASK_LIMITS.parts} parts, the most it can have.`);
        parts = [...m.parts, shapePart(newPart(kind, !m.parts.length), record(a.settings), a.combine, a.invert)];
      }
      const out = putMask(it, { ...m, parts });
      return ok(`Mask part set.${await findAi(fresh(it.id))}`, maskInfo(out));
    },
  },
  {
    name: 'remove_mask',
    title: 'Remove a mask or one of its parts',
    description: 'Removes a mask from a photo, or only one of its parts (give part). Undo brings it back in the open studio.',
    inputSchema: obj({ photo: photoArg, mask: str('Mask id'), part: str('Part id (leave out to remove the whole mask)') }, ['mask']),
    destructive: true,
    run: async (a) => {
      const it = target(a.photo),
        m = maskOf(it, a.mask);
      if (typeof a.part === 'string') {
        if (!m.parts.some((p) => p.id === a.part)) throw new ToolError(`Mask ${m.id} has no part “${a.part}”.`);
        return ok('Part removed.', maskInfo(putMask(it, { ...m, parts: m.parts.filter((p) => p.id !== a.part) })));
      }
      setMasks(
        it.id,
        it.edit.masks.filter((x) => x.id !== m.id),
      );
      return ok(`Mask removed; ${it.edit.masks.length - 1} left.`);
    },
  },

  {
    name: 'find_with_ai',
    title: 'Find the subject or sky with AI',
    description:
      'Runs the on-device AI model for every AI mask part of a photo (subject, sky), so the masks follow what it finds. The sky model needs a one-time download of about 176 MB from Hugging Face: pass allowDownload: true only after the user agreed. Photos never leave the device.',
    inputSchema: obj({ photo: photoArg, allowDownload: bool('The user agreed to download a model that isn’t on the device yet') }),
    run: async (a) => {
      const it = target(a.photo);
      if (!aiTargets(it.edit.masks).length) throw new ToolError('This photo has no AI mask parts. Add one with add_mask (kind "ai").');
      const note = await findAi(it, a.allowDownload === true);
      return ok(note ? note.trim() : `Found ${aiTargets(it.edit.masks).join(' and ')}.`);
    },
  },

  /* ---------- presets and LUTs ---------- */
  {
    name: 'list_presets',
    title: 'List presets',
    description: 'Built-in presets (the looks; applying one changes only the look) and the user’s saved presets (applying one replaces every colour setting), with their settings.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => {
      await loadPresets();
      return ok('Presets', {
        builtIn: BUILT_IN_PRESETS.map((p) => ({ id: p.id, name: p.name, settings: p.adjust })),
        saved: getPresets().map((p) => ({ id: p.id, name: p.name, settings: changed(p.adjust) })),
      });
    },
  },
  {
    name: 'apply_preset',
    title: 'Apply a preset',
    description: 'Applies a preset (id from list_presets) to one photo or to all. A saved preset replaces the photo’s colour settings; a built-in one sets only its look. Masks and framing are kept.',
    inputSchema: obj({ preset: str('Preset id from list_presets'), photo: str('Photo id, or "all" (default: the selected photo)') }, ['preset']),
    run: async (a) => {
      await loadPresets();
      const built = BUILT_IN_PRESETS.find((p) => p.id === a.preset),
        saved = getPresets().find((p) => p.id === a.preset);
      if (!built && !saved) throw new ToolError(`Unknown preset “${s(a.preset)}”. Use list_presets.`);
      let note = '';
      if (saved?.adjust.lut) {
        await loadLutLibrary();
        if (!(await ensureLut(saved.adjust.lut).catch(() => undefined))) note = ' Its LUT isn’t on this device, so it applies without it.';
      }
      const patch: Partial<Adjustments> = built ? built.adjust : { ...saved!.adjust };
      if (a.photo === 'all') {
        if (!getIg().items.length) throw new ToolError('The photo studio has no photos. Add one with add_batch_photo.');
        adjustEach((x) => ({ ...x, ...patch }));
        return ok(`“${(built ?? saved)!.name}” applied to ${getIg().items.length} photo(s).${note}`);
      }
      const it = target(a.photo);
      adjustPhoto(it.id, patch);
      return ok(`“${(built ?? saved)!.name}” applied.${note}`, changed(fresh(it.id).edit.adjust));
    },
  },
  {
    name: 'save_preset',
    title: 'Save a preset',
    description: 'Saves a photo’s colour settings (all of them, not its masks or framing) as a named preset on this device. A name already taken gets a number.',
    inputSchema: obj({ name: str('Preset name (up to 60 characters)'), photo: photoArg }, ['name']),
    run: async (a) => {
      await loadPresets();
      const p = await savePreset(s(a.name), itemOf(a.photo).edit.adjust);
      if (!p) throw new ToolError('Give the preset a name.');
      return ok(`Saved as “${p.name}”.`, { id: p.id, name: p.name, settings: changed(p.adjust) });
    },
  },
  {
    name: 'delete_preset',
    title: 'Delete a saved preset',
    description: 'Deletes one of the user’s saved presets from this device. This can’t be undone, so it needs confirm: true. Photos it was applied to keep their settings.',
    inputSchema: obj({ preset: str('Saved preset id from list_presets'), confirm: bool('Required: the preset is deleted for good') }, ['preset']),
    destructive: true,
    run: async (a) => {
      await loadPresets();
      const p = getPresets().find((x) => x.id === a.preset);
      if (!p) throw new ToolError(`No saved preset “${s(a.preset)}”. Built-in presets can’t be deleted.`);
      if (a.confirm !== true) throw new ToolError(`This deletes “${p.name}” for good. Pass confirm: true to go ahead.`);
      await deletePreset(p.id);
      return ok(`Deleted “${p.name}”.`);
    },
  },
  {
    name: 'export_presets',
    title: 'Export presets to a file',
    description: 'Writes saved presets (all, or the ids given) to a Chitthi preset file, with the LUTs they use, so they can be imported on another device.',
    inputSchema: obj({ presets: { type: 'array', items: { type: 'string' }, description: 'Saved preset ids (default: all)' } }),
    run: async (a) => {
      await loadPresets();
      await loadLutLibrary();
      const ids = Array.isArray(a.presets) ? a.presets : null,
        list = ids ? getPresets().filter((p) => ids.includes(p.id)) : getPresets();
      if (!list.length) throw new ToolError('There are no saved presets to export.');
      const name = `chitthi-presets-${new Date().toISOString().slice(0, 10)}.json`;
      return { text: `${list.length} preset(s) exported.`, files: [{ name, blob: new Blob([await exportPresets(list)], { type: 'application/json' }) }] };
    },
  },
  {
    name: 'import_presets',
    title: 'Import presets from a file',
    description: 'Adds the presets (and their LUTs) from the text of a Chitthi preset file. Presets already saved with the same name and settings are skipped.',
    inputSchema: obj({ json: str('The preset file’s contents') }, ['json']),
    run: async (a) => {
      try {
        const r = await importPresets(new File([s(a.json)], 'presets.json', { type: 'application/json' }));
        return ok(`${r.added} preset(s) added, ${r.skipped} already there, ${r.luts} LUT(s) kept.`, r);
      } catch (e) {
        if (e instanceof PresetError) throw new ToolError(e.message);
        throw e;
      }
    },
  },
  {
    name: 'list_luts',
    title: 'List imported LUTs',
    description: '3D LUTs imported on this device (id, title, points per side). Use an id as the lut setting of adjust_photo, with lutAmount for its strength.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => {
      await loadLutLibrary();
      return ok('LUTs', getLutLibrary().map((l) => ({ id: l.id, title: l.title, size: l.size })));
    },
  },
  {
    name: 'import_lut',
    title: 'Import a LUT',
    description: 'Imports a 3D LUT from the text of a .cube file (2–65 points per side) or an https URL, and keeps it on this device. Returns its id for adjust_photo.',
    inputSchema: obj({ cube: str('Contents of a .cube file'), url: str('https URL of a .cube file'), name: str('Name, if the file has no TITLE') }),
    run: async (a) => {
      let text: string;
      if (typeof a.cube === 'string' && a.cube) text = a.cube;
      else if (typeof a.url === 'string' && /^https:\/\//.test(a.url)) {
        const r = await fetch(a.url);
        if (!r.ok) throw new ToolError(`The LUT couldn’t be downloaded (${r.status}).`);
        text = await r.text();
      } else throw new ToolError('Give the .cube text, or an https URL.');
      if (text.length > LUT_MAX_BYTES) throw new ToolError(`That LUT is over ${LUT_MAX_BYTES / 1048576} MB.`);
      try {
        const lut = parseCube(text, s(a.name) || 'LUT');
        await loadLutLibrary();
        await keepLut(lut);
        return ok(`LUT “${lut.title}” imported (${lut.size}³) as ${lut.id}.`, { id: lut.id, title: lut.title, size: lut.size, loaded: !!lutById(lut.id) });
      } catch (e) {
        if (e instanceof LutError) throw new ToolError(`That LUT can’t be used. ${e.message}`);
        throw e;
      }
    },
  },

  /* ---------- looking and output ---------- */
  {
    name: 'render_photo_preview',
    title: 'Render a photo preview',
    description: 'A PNG of one photo as it will be posted (framing, colour, masks and layers), at most 1024 px on the long side. Give mask to see where that mask applies (in red).',
    inputSchema: obj({ photo: photoArg, maxPx: num('Long side in pixels, 256–1024', { minimum: 256, maximum: 1024 }), mask: str('Mask id to show in red') }),
    readOnly: true,
    run: async (a) => {
      const it = itemOf(a.photo);
      const note = await findAi(it);
      const cv = await drawPhoto(it, Math.min(1024, Math.max(256, n(a.maxPx, 800))), typeof a.mask === 'string' && a.mask ? a.mask : undefined);
      const image = await toBlob(cv);
      cv.width = cv.height = 0;
      return { text: `Photo ${it.id} (“${it.name}”), ${igFormat(getIg().format).ratio}.${note}`, image };
    },
  },
  {
    name: 'export_photos',
    title: 'Export the photo batch',
    description: 'Renders every photo of the batch at full size in the post format and file type chosen (set_photo_options) and writes the files into the agent output folder.',
    inputSchema: obj(),
    run: async () => {
      if (!getIg().items.length) throw new ToolError('The photo studio has no photos. Add one with add_batch_photo.');
      for (const it of getIg().items) {
        const note = await findAi(it);
        if (note) throw new ToolError(`Photo ${it.id}:${note}`);
      }
      const files = await renderBatch();
      return { text: `${files.length} photo(s) exported.`, files: files.map((f) => ({ name: f.name, blob: f })) };
    },
  },
];
