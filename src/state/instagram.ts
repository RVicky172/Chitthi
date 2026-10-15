import { useSyncExternalStore } from 'react';
import { clampBatch, IG_FORMATS, type IgFileType, type IgFormatId } from '../data/instagram';
import { brushDef, type BrushId } from '../data/layers';
import type { Adjustments } from '../engine/adjust';
import { DEFAULT_EDIT, LOOK_KEYS, type IgEdit } from '../engine/instagram';
import { type Layer } from '../engine/layers';
import { type Mask } from '../engine/masks';
import { isPhotoType } from '../engine/photoExport';

/*
 * The Instagram studio's state: a batch of photos, each with its own edits, the post format, the batch limit and the
 * export settings. Memory: each photo keeps its original file (compressed) and a preview copy of at most PREVIEW_MAX
 * px; full-size pixels exist only while one photo is being exported. The batch lasts for this session.
 *
 * This module holds the state, the selections, undo / redo (`change`) and the photo edits; the other actions are in
 * instagramLayers (layers), instagramMedia (adding photos) and instagramExport (rendering the batch) (407 T041).
 */

/** Longest side of a photo's preview copy, in pixels. */
export const PREVIEW_MAX = 1080;

/** A photo in the batch. */
export interface IgItem {
  id: string;
  name: string;
  /** The original file; decoded again at full size only for export. */
  file: Blob;
  /** Natural width of the original. */
  w: number;
  /** Natural height of the original. */
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

/** The Instagram studio's whole state. */
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
  /** What a long task is doing, for its progress line; null when idle. */
  busy: string | null;
  /** The selected layer of the selected photo. */
  layerSel: string | null;
  tools: LayerTools;
  /** The white-balance eyedropper is waiting for a click on the photo. */
  picking: boolean;
  /** The selected mask of the selected photo. */
  maskSel: string | null;
  /** The part of the selected mask the brush paints into. */
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

/** The export settings remembered on this device. */
type Prefs = Partial<Pick<IgState, 'format' | 'limit' | 'fileType' | 'quality'>>;

const PREFS_KEY = 'chitthi-ig-prefs';

/**
 * The export settings remembered on this device.
 * @returns them, each checked where it is used; empty when none were saved or storage is blocked
 */
function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    // Storage blocked or the saved text broken: the defaults.
    return {};
  }
}

/**
 * Whether a value is one of the post formats.
 * @param value the value
 * @returns true for a format's id
 */
const isFormatId = (value: unknown): value is IgFormatId => IG_FORMATS.some((format) => format.id === value);

const savedPrefs = readPrefs();
let state: IgState = {
  items: [],
  selected: null,
  format: isFormatId(savedPrefs.format) ? savedPrefs.format : 'portrait',
  limit: clampBatch(savedPrefs.limit ?? 4),
  fileType: isPhotoType(savedPrefs.fileType) ? savedPrefs.fileType : 'jpeg',
  quality: Math.min(100, Math.max(60, savedPrefs.quality ?? 92)),
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

/** Fields whose change leaves the rendered files as they are (they don't change the pictures). */
const KEEPS_READY: readonly string[] = ['ready', 'busy', 'selected', 'caption', 'layerSel', 'tools', 'maskSel', 'partSel', 'maskBrush', 'canUndo', 'canRedo'];

const listeners = new Set<() => void>();

/**
 * Apply a change to the state (not undoable: actions that change the photos go through `change`) and tell the
 * listeners. Anything that changes the pictures drops the rendered files; the export settings are remembered.
 * @param patch the fields to replace
 */
export function setIgState(patch: Partial<IgState>): void {
  const isStale = Object.keys(patch).some((field) => !KEEPS_READY.includes(field));
  state = { ...state, ...(isStale && !('ready' in patch) ? { ready: null } : {}), ...patch };
  if ('format' in patch || 'limit' in patch || 'fileType' in patch || 'quality' in patch) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ format: state.format, limit: state.limit, fileType: state.fileType, quality: state.quality }));
    } catch {
      /* storage blocked: the choice lasts for this session */
    }
  }
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * The store's current state, for actions and event handlers (components read it with `useIg`).
 * @returns the state; replaced, never changed, on every update
 */
export const getIg = (): IgState => state;

/**
 * Subscribe a component to a slice of the store. Selectors must return stable references or primitives.
 * @param selector picks the slice from the state
 * @returns the slice; the component re-renders when it changes
 */
export function useIg<Slice>(selector: (current: IgState) => Slice): Slice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => selector(state),
    () => selector(state),
  );
}

/**
 * Change the post format, file type, quality or caption.
 * @param patch the fields to replace
 */
export const setIg = (patch: Partial<Pick<IgState, 'format' | 'fileType' | 'quality' | 'caption'>>) => {
  setIgState(patch);
};

/**
 * Selects a photo (and drops the layer and mask selections, which belong to the previous photo).
 * @param id the photo, or null for none
 */
export const selectPhoto = (id: string | null) => {
  setIgState({ selected: id, layerSel: null, maskSel: null, partSel: null });
};
/**
 * Selects a layer of the selected photo.
 * @param id the layer, or null for none
 */
export const selectLayer = (id: string | null) => {
  setIgState({ layerSel: id });
};
/**
 * Change the layer tools.
 * @param patch the fields to replace
 */
export const setTools = (patch: Partial<LayerTools>) => {
  setIgState({ tools: { ...state.tools, ...patch } });
};
/**
 * Arm or disarm the white-balance eyedropper.
 * @param picking whether it waits for a click on the photo
 */
export const setPicking = (picking: boolean) => {
  setIgState({ picking });
};

/**
 * Selects a mask, and the part the brush paints into.
 * @param id the mask (of the selected photo), or null for none
 * @param part the part; missing = the mask's first part
 */
export function selectMask(id: string | null, part?: string | null): void {
  const mask = state.items.find((item) => item.id === state.selected)?.edit.masks.find((candidate) => candidate.id === id);
  if (!mask) {
    setIgState({ maskSel: null, partSel: null });
    return;
  }
  setIgState({ maskSel: mask.id, partSel: part !== undefined ? part : (mask.parts.at(0)?.id ?? null) });
}

/**
 * Change the mask brush.
 * @param patch the fields to replace
 */
export const setMaskBrush = (patch: Partial<MaskBrush>) => {
  setIgState({ maskBrush: { ...state.maskBrush, ...patch } });
};

/**
 * Brush width as a share of the frame width, for the current tools.
 * @param tools the layer tools
 * @returns the width
 */
export const brushWidth = (tools: LayerTools) => brushDef(tools.brush).width * tools.brushScale;

/* ---------- undo / redo ---------- */
// Snapshots of the items array (edits and layers live inside it; unchanged photos are shared, so snapshots are cheap).
// Changes with the same key in quick succession (a slider drag, a layer drag, typing) make one step.
const past: IgItem[][] = [];
const future: IgItem[][] = [];
let lastKey = '',
  lastAt = 0;

/**
 * Records an undo step, unless it continues the last one (the same key within 800 ms: a drag).
 * @param key groups changes into one step ('' never groups)
 */
export function record(key: string): void {
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

/** Whether undo and redo have anything. */
type UndoFlags = Pick<IgState, 'canUndo' | 'canRedo'>;

/**
 * Whether undo and redo have anything.
 * @returns the flags for the state
 */
export const flags = (): UndoFlags => ({ canUndo: past.length > 0, canRedo: future.length > 0 });

/** Ends the current step, so the next change (even with the same key) becomes its own undo step. */
export const endStep = () => {
  lastKey = '';
};

/**
 * Puts a snapshot back, keeping the selections that still exist.
 * @param items the snapshot
 */
function restore(items: IgItem[]): void {
  lastKey = '';
  const selected = items.some((item) => item.id === state.selected) ? state.selected : (items.at(0)?.id ?? null);
  const isLayerKept = items.some((item) => item.layers.some((layer) => layer.id === state.layerSel));
  const mask = items.find((item) => item.id === selected)?.edit.masks.find((candidate) => candidate.id === state.maskSel);
  const isPartKept = !!mask?.parts.some((part) => part.id === state.partSel);
  setIgState({
    items,
    selected,
    layerSel: isLayerKept ? state.layerSel : null,
    maskSel: mask ? mask.id : null,
    partSel: isPartKept ? state.partSel : (mask?.parts.at(0)?.id ?? null),
    ...flags(),
  });
}

/** Go back one undo step. */
export function undo(): void {
  const previous = past.pop();
  if (!previous) return;
  future.push(state.items);
  restore(previous);
}

/** Go forward one undo step. */
export function redo(): void {
  const next = future.pop();
  if (!next) return;
  past.push(state.items);
  restore(next);
}

/**
 * The one path for undoable changes to the photos.
 * @param key groups a run of changes into one undo step ('' never groups)
 * @param items the new photos
 * @param extra other fields to change with them (selections)
 */
export function change(key: string, items: IgItem[], extra: Partial<IgState> = {}): void {
  record(key);
  setIgState({ items, ...flags(), ...extra });
}

/* ---------- the batch ---------- */

/**
 * Sets the batch limit. It can't go below the photos already in the batch.
 * @param requested the limit asked for (clamped to 1–20)
 * @returns the limit actually set
 */
export function setLimit(requested: number): number {
  const limit = Math.max(clampBatch(requested), state.items.length);
  setIgState({ limit });
  return limit;
}

/**
 * Remove a photo from the batch; the selection moves to the photo now in its place.
 * @param id the photo
 */
export function removePhoto(id: string): void {
  const index = state.items.findIndex((item) => item.id === id);
  const items = state.items.filter((item) => item.id !== id);
  const selected = state.selected === id ? (items.at(Math.min(index, items.length - 1))?.id ?? null) : state.selected;
  change('', items, { selected, layerSel: null });
}

/** Remove every photo (undoable). */
export const clearBatch = () => {
  change('', [], { selected: null, layerSel: null });
};

/**
 * Moves a photo one place earlier (-1) or later (+1). The first photo is the post's cover.
 * @param id the photo
 * @param by the direction
 */
export function movePhoto(id: string, by: -1 | 1): void {
  const index = state.items.findIndex((item) => item.id === id);
  if (index < 0) return;
  movePhotoTo(id, index + by);
}

/**
 * Moves a photo to a new place in the order (dragging in the photo strip).
 * @param id the photo
 * @param index the new place (clamped to the batch)
 */
export function movePhotoTo(id: string, index: number): void {
  const from = state.items.findIndex((item) => item.id === id),
    to = Math.max(0, Math.min(state.items.length - 1, index));
  const moving = state.items.at(from);
  if (from < 0 || from === to || !moving) return;
  const items = state.items.slice();
  items.splice(from, 1);
  items.splice(to, 0, moving);
  change('', items);
}

/* ---------- edits ---------- */

/**
 * The batch with one photo's edit changed.
 * @param id the photo
 * @param edit makes its new edit from the old one
 * @returns the new items
 */
const withEdit = (id: string, edit: (old: IgEdit) => IgEdit) => state.items.map((item) => (item.id === id ? { ...item, edit: edit(item.edit) } : item));

/**
 * An undo key that groups changes to the same fields of the same photo.
 * @param kind what is changed
 * @param id the photo
 * @param patch the change (its field names)
 * @returns the key
 */
const fieldsKey = (kind: string, id: string, patch: object) => `${kind}:${id}:${Object.keys(patch).sort((first, second) => first.localeCompare(second)).join(',')}`;

/**
 * Change a photo's edit (fit, background, look …); quick changes to the same fields are one undo step.
 * @param id the photo
 * @param patch the fields to replace
 */
export function editPhoto(id: string, patch: Partial<IgEdit>): void {
  change(
    fieldsKey('edit', id, patch),
    withEdit(id, (edit) => ({ ...edit, ...patch })),
  );
}

/**
 * Changes a photo's colour settings; a slider dragged quickly is one undo step.
 * @param id the photo
 * @param patch the settings to replace
 */
export function adjustPhoto(id: string, patch: Partial<Adjustments>): void {
  change(
    fieldsKey('adjust', id, patch),
    withEdit(id, (edit) => ({ ...edit, adjust: { ...edit.adjust, ...patch } })),
  );
}

/**
 * Replaces a photo's masks.
 * @param id the photo
 * @param masks the masks
 * @param key groups a run of changes (a stroke being drawn, a slider) into one undo step
 */
export function setMasks(id: string, masks: Mask[], key = ''): void {
  change(
    key,
    withEdit(id, (edit) => ({ ...edit, masks })),
  );
}

/**
 * Changes one mask of a photo.
 * @param id the photo
 * @param maskId the mask
 * @param update makes the new mask from the old one
 * @param key groups a run of changes into one undo step
 */
export function updateMask(id: string, maskId: string, update: (mask: Mask) => Mask, key = ''): void {
  const item = state.items.find((candidate) => candidate.id === id);
  if (item)
    setMasks(
      id,
      item.edit.masks.map((mask) => (mask.id === maskId ? update(mask) : mask)),
      key,
    );
}

/**
 * Changes the colour settings of every photo in the batch, as one undo step (a preset applied to all).
 * @param patch the settings to replace
 */
export function adjustAll(patch: Partial<Adjustments>): void {
  change(
    '',
    state.items.map((item) => ({ ...item, edit: { ...item.edit, adjust: { ...item.edit.adjust, ...patch } } })),
  );
}

/**
 * Changes the colour settings of every photo in the batch, each from its own, as one undo step (agent tools).
 * @param adjust makes a photo's new settings from its old ones
 */
export function adjustEach(adjust: (old: Adjustments) => Adjustments): void {
  change(
    '',
    state.items.map((item) => ({ ...item, edit: { ...item.edit, adjust: adjust(item.edit.adjust) } })),
  );
}

/**
 * Copies the look of one photo (fit, background, look, adjustments, vignette) to every photo in the batch.
 * @param id the photo to copy from
 */
export function applyLookToAll(id: string): void {
  const source = state.items.find((item) => item.id === id);
  if (!source) return;
  // fromEntries loses the keys' types; the entries are exactly LOOK_KEYS with the source's values.
  const look = Object.fromEntries(LOOK_KEYS.map((key) => [key, source.edit[key]])) as Partial<IgEdit>;
  change(
    '',
    state.items.map((item) => ({ ...item, edit: { ...item.edit, ...look } })),
  );
}

/**
 * Put a photo's edit back to the defaults (its layers stay).
 * @param id the photo
 */
export const resetPhoto = (id: string) => {
  editPhoto(id, { ...DEFAULT_EDIT });
};
