import { useSyncExternalStore } from 'react';
import { clampBatch, IG_FORMATS, igFormat, type IgFileType, type IgFormatId } from '../data/instagram';
import { brushDef, type BrushId } from '../data/layers';
import type { Adjustments } from '../engine/adjust';
import { DEFAULT_EDIT, LOOK_KEYS, renderIg, type IgEdit } from '../engine/instagram';
import { drawLayers, type Layer } from '../engine/layers';
import { aiTargets, type Mask } from '../engine/masks';
import { shareSegments } from '../engine/segments';
import { ensureFonts } from '../lib/fonts';
import { checkFile, loadImage } from '../engine/photo';
import { logError } from '../lib/errors';
import { makeZip } from '../lib/zip';
import { encodePhoto, isPhotoType, PHOTO_TYPES } from '../engine/photoExport';
import { embeddedJpeg, isRawName, rawToRgba8, type RawImage } from '../engine/raw';
import { desktop } from '../platform/desktop';

/*
 * The Instagram studio's state: a batch of photos, each with its own edits, the post format, the batch limit and the
 * export settings. Memory: each photo keeps its original file (compressed) and a preview copy of at most PREVIEW_MAX
 * px; full-size pixels exist only while one photo is being exported. The batch lasts for this session.
 */

const PREVIEW_MAX = 1080;

export interface IgItem {
  id: string;
  name: string;
  /** The original file; decoded again at full size only for export. */
  file: Blob;
  /** Natural size of the original. */
  w: number;
  h: number;
  /** A copy of at most PREVIEW_MAX px on the long side, for the preview and thumbnails. */
  preview: HTMLCanvasElement;
  edit: IgEdit;
  /** Text, shapes, stickers and drawings over the photo, bottom first (engine/layers.ts). */
  layers: Layer[];
  /** The file is a camera RAW, developed by the desktop app (P1.9) for the preview and again for each export. */
  raw?: boolean;
}

/** Layer tools, shared by the photo and video editors. 'mask': the photo editor's mask brush paints on the stage. */
export interface LayerTools {
  tool: 'select' | 'draw' | 'mask';
  brush: BrushId;
  brushColor: string;
  /** Multiplies the brush's own width (0.5-4). */
  brushScale: number;
}

export interface IgState {
  items: IgItem[];
  selected: string | null;
  format: IgFormatId;
  /** How many photos the batch may hold (1–20). */
  limit: number;
  fileType: IgFileType;
  /** JPEG quality, 60–100. */
  quality: number;
  caption: string;
  /** Rendered files ready to share; cleared by any change. */
  ready: File[] | null;
  busy: string | null;
  /** The selected layer of the selected photo. */
  layerSel: string | null;
  tools: LayerTools;
  /** The white-balance eyedropper is waiting for a click on the photo. */
  picking: boolean;
  /** The selected mask of the selected photo, and the part of it the brush paints into. */
  maskSel: string | null;
  partSel: string | null;
  maskBrush: MaskBrush;
  canUndo: boolean;
  canRedo: boolean;
}

/** The mask brush (P1.6). Size is a share of the frame width, as on screen; strokes store it relative to the photo. */
export interface MaskBrush {
  size: number;
  feather: number;
  flow: number;
  erase: boolean;
  /** Show the selected mask as a red overlay on the stage (never in exports). */
  overlay: boolean;
}

const PREF = 'chitthi-ig-prefs';
function prefs(): Partial<Pick<IgState, 'format' | 'limit' | 'fileType' | 'quality'>> {
  try {
    return JSON.parse(localStorage.getItem(PREF) ?? '{}');
  } catch {
    return {};
  }
}
const p0 = prefs();
let state: IgState = {
  items: [],
  selected: null,
  format: IG_FORMATS.some((f) => f.id === p0.format) ? (p0.format as IgFormatId) : 'portrait',
  limit: clampBatch(p0.limit ?? 4),
  fileType: isPhotoType(p0.fileType) ? p0.fileType : 'jpeg',
  quality: Math.min(100, Math.max(60, p0.quality ?? 92)),
  caption: '',
  ready: null,
  busy: null,
  layerSel: null,
  tools: { tool: 'select', brush: 'marker', brushColor: '#ffffff', brushScale: 1 },
  picking: false,
  maskSel: null,
  partSel: null,
  maskBrush: { size: 0.08, feather: 50, flow: 100, erase: false, overlay: true },
  canUndo: false,
  canRedo: false,
};

const listeners = new Set<() => void>();
function set(patch: Partial<IgState>): void {
  // Anything that changes the pictures makes earlier rendered files stale.
  const stale = Object.keys(patch).some((k) => !['ready', 'busy', 'selected', 'caption', 'layerSel', 'tools', 'maskSel', 'partSel', 'maskBrush', 'canUndo', 'canRedo'].includes(k));
  state = { ...state, ...(stale && !('ready' in patch) ? { ready: null } : {}), ...patch };
  if ('format' in patch || 'limit' in patch || 'fileType' in patch || 'quality' in patch) {
    try {
      localStorage.setItem(PREF, JSON.stringify({ format: state.format, limit: state.limit, fileType: state.fileType, quality: state.quality }));
    } catch {
      /* storage blocked: the choice lasts for this session */
    }
  }
  listeners.forEach((l) => l());
}
export const getIg = (): IgState => state;
export function useIg<T>(sel: (s: IgState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => sel(state),
    () => sel(state),
  );
}

export const setIg = (patch: Partial<Pick<IgState, 'format' | 'fileType' | 'quality' | 'caption'>>) => set(patch);

/** Selects a photo (and drops the layer selection, which belongs to the previous photo). */
export const selectPhoto = (id: string | null) => set({ selected: id, layerSel: null, maskSel: null, partSel: null });
export const selectLayer = (id: string | null) => set({ layerSel: id });
export const setTools = (patch: Partial<LayerTools>) => set({ tools: { ...state.tools, ...patch } });
export const setPicking = (picking: boolean) => set({ picking });
/** Selects a mask, and the part the brush paints into (its first part unless given). */
export function selectMask(id: string | null, part?: string | null): void {
  const m = state.items.find((x) => x.id === state.selected)?.edit.masks.find((k) => k.id === id);
  set({ maskSel: m ? m.id : null, partSel: m ? (part !== undefined ? part : (m.parts[0]?.id ?? null)) : null });
}
export const setMaskBrush = (patch: Partial<MaskBrush>) => set({ maskBrush: { ...state.maskBrush, ...patch } });
/** Brush width as a share of the frame width, for the current tools. */
export const brushWidth = (t: LayerTools) => brushDef(t.brush).width * t.brushScale;

/* ---------- undo / redo ---------- */
// Snapshots of the items array (edits and layers live inside it; unchanged photos are shared, so snapshots are cheap).
// Changes with the same key in quick succession (a slider drag, a layer drag, typing) make one step.
const past: IgItem[][] = [];
const future: IgItem[][] = [];
let lastKey = '',
  lastAt = 0;
function record(key: string): void {
  const now = Date.now();
  if (key && key === lastKey && now - lastAt < 800) {
    lastAt = now;
    return;
  }
  lastKey = key;
  lastAt = now;
  past.push(state.items);
  if (past.length > 80) past.shift();
  future.length = 0;
}
const flags = () => ({ canUndo: past.length > 0, canRedo: future.length > 0 });
/** Ends the current step, so the next change (even with the same key) becomes its own undo step. */
export const endStep = () => {
  lastKey = '';
};
function restore(items: IgItem[]): void {
  lastKey = '';
  const sel = items.some((x) => x.id === state.selected) ? state.selected : (items[0]?.id ?? null);
  const layerOk = items.some((x) => x.layers.some((l) => l.id === state.layerSel));
  const mask = items.find((x) => x.id === sel)?.edit.masks.find((m) => m.id === state.maskSel);
  const partOk = !!mask?.parts.some((p) => p.id === state.partSel);
  set({
    items,
    selected: sel,
    layerSel: layerOk ? state.layerSel : null,
    maskSel: mask ? mask.id : null,
    partSel: partOk ? state.partSel : (mask?.parts[0]?.id ?? null),
    ...flags(),
  });
}
export function undo(): void {
  const prev = past.pop();
  if (!prev) return;
  future.push(state.items);
  restore(prev);
}
export function redo(): void {
  const next = future.pop();
  if (!next) return;
  past.push(state.items);
  restore(next);
}
function change(key: string, items: IgItem[], extra: Partial<IgState> = {}): void {
  record(key);
  set({ items, ...flags(), ...extra });
}

/* ---------- layers ---------- */
const withLayers = (id: string, f: (ls: Layer[]) => Layer[]) => state.items.map((x) => (x.id === id ? { ...x, layers: f(x.layers) } : x));

export function addLayer(itemId: string, layer: Layer): void {
  change(`add:${layer.id}`, withLayers(itemId, (ls) => [...ls, layer]), { layerSel: layer.id });
}
/** Changes a layer; `key` groups a run of changes (a drag, typing) into one undo step. */
export function updateLayer(itemId: string, layerId: string, patch: Partial<Layer> | ((l: Layer) => Layer), key = `layer:${layerId}`): void {
  change(
    key,
    withLayers(itemId, (ls) => ls.map((l) => (l.id === layerId ? (typeof patch === 'function' ? patch(l) : ({ ...l, ...patch } as Layer)) : l))),
  );
}
export function removeLayer(itemId: string, layerId: string): void {
  change('', withLayers(itemId, (ls) => ls.filter((l) => l.id !== layerId)), { layerSel: state.layerSel === layerId ? null : state.layerSel });
}
/** Moves a layer one place towards the front (+1) or the back (-1). */
export function restackLayer(itemId: string, layerId: string, by: 1 | -1): void {
  change(
    '',
    withLayers(itemId, (ls) => {
      const i = ls.findIndex((l) => l.id === layerId),
        j = i + by;
      if (i < 0 || j < 0 || j >= ls.length) return ls;
      const out = ls.slice();
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    }),
  );
}
/** Replaces all of a photo's layers (the drawing tool uses this). */
export function setLayers(itemId: string, layers: Layer[], key = '', layerSel?: string | null): void {
  change(key, withLayers(itemId, () => layers), layerSel === undefined ? {} : { layerSel });
}
/** Copies one photo's layers onto every other photo in the batch (new ids, same places). */
export function copyLayersToAll(itemId: string): void {
  const src = state.items.find((x) => x.id === itemId);
  if (!src) return;
  let n = 0;
  const fresh = () => `l${Date.now().toString(36)}c${(n++).toString(36)}`;
  change(
    '',
    state.items.map((x) => (x.id === itemId ? x : { ...x, layers: [...x.layers, ...src.layers.map((l) => ({ ...l, id: fresh() }))] })),
  );
}


/** Sets the batch limit. It can't go below the photos already in the batch; returns the limit actually set. */
export function setLimit(n: number): number {
  const limit = Math.max(clampBatch(n), state.items.length);
  set({ limit });
  return limit;
}

let seq = 0;
const newId = () => `ig${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A canvas holding 8-bit RGBA pixels. */
function canvasOf(px: { width: number; height: number; data: Uint8ClampedArray }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px.width;
  c.height = px.height;
  const x = c.getContext('2d');
  if (!x) throw new Error('No canvas');
  x.putImageData(new ImageData(px.data as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0);
  return c;
}

/** Develops a RAW file with LibRaw in the desktop app (half size: still well over the 1920 px a post needs). */
async function developRaw(name: string, file: Blob): Promise<RawImage> {
  if (!desktop?.raw) throw new Error('RAW files are developed in the desktop app.');
  return desktop.raw.develop(await file.arrayBuffer(), name, { half: true });
}

/** True when this app can develop RAW files (the desktop app with its RAW developer installed). */
let rawReady: Promise<boolean> | null = null;
export const canDevelopRaw = (): Promise<boolean> => (rawReady ??= desktop?.raw ? desktop.raw.available().catch(() => false) : Promise.resolve(false));

async function makeRawItem(name: string, file: Blob): Promise<IgItem> {
  const img = await developRaw(name, file);
  return { id: newId(), name, file, w: img.width, h: img.height, preview: canvasOf(rawToRgba8(img, PREVIEW_MAX)), edit: { ...DEFAULT_EDIT }, layers: [], raw: true };
}

async function makeItem(name: string, file: Blob): Promise<IgItem> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth,
      h = img.naturalHeight,
      k = Math.min(1, PREVIEW_MAX / Math.max(w, h));
    const preview = document.createElement('canvas');
    preview.width = Math.max(1, Math.round(w * k));
    preview.height = Math.max(1, Math.round(h * k));
    const x = preview.getContext('2d');
    if (!x) throw new Error('No canvas');
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, 0, 0, preview.width, preview.height);
    return { id: newId(), name, file, w, h, preview, edit: { ...DEFAULT_EDIT }, layers: [] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Adds photos up to the batch limit. Returns messages for the user: files that can't be used, and how many didn't fit.
 */
export async function addPhotos(files: { name: string; blob: Blob; type?: string }[]): Promise<string[]> {
  const msgs: string[] = [];
  const room = state.limit - state.items.length;
  if (room <= 0) return [`The batch is full (${state.limit} photos). Raise the limit (up to 20) or remove a photo.`];
  const take = files.slice(0, room);
  if (files.length > room) msgs.push(`${files.length - room} photo${files.length - room > 1 ? 's' : ''} not added: the batch holds ${state.limit}. Raise the limit (up to 20) to add more.`);
  set({ busy: 'Adding photos…' });
  const added: IgItem[] = [];
  for (const f of take) {
    const why = checkFile(new File([f.blob], f.name, { type: f.type ?? f.blob.type }), { raw: true });
    if (why) {
      msgs.push(why);
      continue;
    }
    try {
      if (!isRawName(f.name)) added.push(await makeItem(f.name, f.blob));
      else if (await canDevelopRaw()) added.push(await makeRawItem(f.name, f.blob));
      else {
        // The web app can't develop RAW: it opens the JPEG preview the camera stored in the file.
        const jpeg = embeddedJpeg(new Uint8Array(await f.blob.arrayBuffer()));
        if (!jpeg) {
          msgs.push(`${f.name} is a camera RAW file without a preview Chitthi Studio can open. Open it in the desktop app, or export a JPEG from your camera app.`);
          continue;
        }
        added.push(await makeItem(f.name, new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })));
        msgs.push(`${f.name}: showing the camera’s built-in JPEG preview. The desktop app opens the full RAW, in 16 bits.`);
      }
    } catch (e) {
      logError('handled', e);
      msgs.push(`${f.name} couldn’t be read. The file may be damaged.`);
    }
  }
  if (added.length) record('');
  set({ items: [...state.items, ...added], selected: state.selected ?? added[0]?.id ?? null, busy: null, ...flags() });
  return msgs;
}

export function removePhoto(id: string): void {
  const i = state.items.findIndex((x) => x.id === id);
  const items = state.items.filter((x) => x.id !== id);
  change('', items, { selected: state.selected === id ? (items[Math.min(i, items.length - 1)]?.id ?? null) : state.selected, layerSel: null });
}

export const clearBatch = () => change('', [], { selected: null, layerSel: null });

/** Moves a photo one place earlier (-1) or later (+1). The first photo is the post's cover. */
export function movePhoto(id: string, by: -1 | 1): void {
  const i = state.items.findIndex((x) => x.id === id),
    j = i + by;
  if (i < 0 || j < 0 || j >= state.items.length) return;
  const items = state.items.slice();
  [items[i], items[j]] = [items[j], items[i]];
  change('', items);
}

/** Moves a photo to a new place in the order (dragging in the photo strip). */
export function movePhotoTo(id: string, index: number): void {
  const i = state.items.findIndex((x) => x.id === id),
    j = Math.max(0, Math.min(state.items.length - 1, index));
  if (i < 0 || i === j) return;
  const items = state.items.slice();
  const [it] = items.splice(i, 1);
  items.splice(j, 0, it);
  change('', items);
}

export function editPhoto(id: string, patch: Partial<IgEdit>): void {
  change(
    `edit:${id}:${Object.keys(patch).sort().join(',')}`,
    state.items.map((x) => (x.id === id ? { ...x, edit: { ...x.edit, ...patch } } : x)),
  );
}

/** Changes a photo's colour settings; a slider dragged quickly is one undo step. */
export function adjustPhoto(id: string, patch: Partial<Adjustments>): void {
  change(
    `adjust:${id}:${Object.keys(patch).sort().join(',')}`,
    state.items.map((x) => (x.id === id ? { ...x, edit: { ...x.edit, adjust: { ...x.edit.adjust, ...patch } } } : x)),
  );
}

/** Replaces a photo's masks; `key` groups a run of changes (a stroke being drawn, a slider) into one undo step. */
export function setMasks(id: string, masks: Mask[], key = ''): void {
  change(
    key,
    state.items.map((x) => (x.id === id ? { ...x, edit: { ...x.edit, masks } } : x)),
  );
}
/** Changes one mask of a photo. */
export function updateMask(id: string, maskId: string, f: (m: Mask) => Mask, key = ''): void {
  const it = state.items.find((x) => x.id === id);
  if (it) setMasks(id, it.edit.masks.map((m) => (m.id === maskId ? f(m) : m)), key);
}

/** Changes the colour settings of every photo in the batch, as one undo step (a preset applied to all). */
export function adjustAll(patch: Partial<Adjustments>): void {
  change('', state.items.map((x) => ({ ...x, edit: { ...x.edit, adjust: { ...x.edit.adjust, ...patch } } })));
}

/** Changes the colour settings of every photo in the batch, each from its own, as one undo step (agent tools). */
export function adjustEach(f: (a: Adjustments) => Adjustments): void {
  change('', state.items.map((x) => ({ ...x, edit: { ...x.edit, adjust: f(x.edit.adjust) } })));
}

/** Copies the look of one photo (fit, background, look, adjustments, vignette) to every photo in the batch. */
export function applyLookToAll(id: string): void {
  const src = state.items.find((x) => x.id === id);
  if (!src) return;
  const look = Object.fromEntries(LOOK_KEYS.map((k) => [k, src.edit[k]])) as Partial<IgEdit>;
  change('', state.items.map((x) => ({ ...x, edit: { ...x.edit, ...look } })));
}

export const resetPhoto = (id: string) => editPhoto(id, { ...DEFAULT_EDIT });

const pad = (n: number) => String(n).padStart(2, '0');

/** The image to draw for an export: the file decoded, or for a RAW the file developed (8-bit) and kept as 16-bit. */
async function exportSource(it: IgItem): Promise<{ img: CanvasImageSource; w: number; h: number; raw: RawImage | null; done: () => void }> {
  if (it.raw) {
    const raw = await developRaw(it.name, it.file),
      c = canvasOf(rawToRgba8(raw, Math.max(raw.width, raw.height)));
    return { img: c, w: c.width, h: c.height, raw, done: () => (c.width = c.height = 1) };
  }
  const url = URL.createObjectURL(it.file);
  try {
    const img = await loadImage(url);
    return { img, w: img.naturalWidth, h: img.naturalHeight, raw: null, done: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The 16-bit TIFF of one photo (engine/deep.ts): the photo in full precision, background and layers as drawn. */
async function renderTiff(it: IgItem, s: Awaited<ReturnType<typeof exportSource>>, W: number, H: number): Promise<Blob> {
  const [{ deepFromRaw, renderDeepPost }, { tiff16 }] = await Promise.all([import('../engine/deep'), import('../engine/tiff')]);
  const rgb = await renderDeepPost({ img: s.img, w: s.w, h: s.h, deep: s.raw ? deepFromRaw(s.raw) : undefined, sample: it.preview, e: it.edit, layers: it.layers, W, H });
  return new Blob([tiff16(W, H, rgb) as Uint8Array<ArrayBuffer>], { type: 'image/tiff' });
}

/** Renders every photo at full size in the chosen format and file type. One photo is in full-size memory at a time. */
export async function renderBatch(onProgress?: (done: number, total: number) => void): Promise<File[]> {
  const f = igFormat(state.format),
    def = PHOTO_TYPES[state.fileType],
    type = def.mime,
    ext = def.ext;
  const out: File[] = [];
  const cv = document.createElement('canvas');
  cv.width = f.w;
  cv.height = f.h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  // Text layers draw in their own fonts: make sure every one is loaded first.
  await ensureFonts(state.items.flatMap((it) => it.layers.flatMap((l) => (l.kind === 'text' || l.kind === 'shape' ? [l.font] : []))));
  for (const [i, it] of state.items.entries()) {
    onProgress?.(i, state.items.length);
    // AI masks: the photo's segmentations (made on its preview, as the stage shows them) are used for the full size too.
    const targets = aiTargets(it.edit.masks);
    if (targets.length) await (await import('../ai/segment')).ensureSegments(it.preview, targets);
    const s = await exportSource(it);
    let blob: Blob;
    try {
      shareSegments(it.preview, s.img);
      if (state.fileType === 'tiff') blob = await renderTiff(it, s, f.w, f.h);
      else {
        ctx.clearRect(0, 0, f.w, f.h);
        // JPEG has no transparency: start from white so empty corners never turn black.
        if (type === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, f.w, f.h);
        }
        renderIg(ctx, s.img, s.w, s.h, it.edit, f.w, f.h);
        drawLayers(ctx, it.layers, f.w, f.h);
        blob = await encodePhoto(cv, state.fileType, state.quality);
      }
    } finally {
      s.done();
    }
    out.push(new File([blob], `chitthi-instagram-${f.ratio.replace(':', 'x')}-${pad(i + 1)}.${ext}`, { type }));
  }
  onProgress?.(state.items.length, state.items.length);
  cv.width = cv.height = 1; // release the full-size canvas
  return out;
}

/** Renders the batch and keeps the files, ready for sharing (a share needs a fresh click, so it is a second step). */
export async function prepareBatch(): Promise<File[]> {
  set({ busy: 'Preparing your photos…' });
  try {
    const files = await renderBatch((d, t) => set({ busy: `Preparing photo ${Math.min(d + 1, t)} of ${t}…` }));
    set({ ready: files, busy: null });
    return files;
  } catch (e) {
    set({ busy: null });
    throw e;
  }
}

export const zipOf = (files: File[]): Promise<Blob> => makeZip(files.map((f) => ({ name: f.name, data: f })));

/** Whether this browser can hand these files to other apps (the system share sheet), e.g. the Instagram app. */
export function canShareFiles(files: File[]): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files });
  } catch {
    return false;
  }
}
