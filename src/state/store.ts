import { useSyncExternalStore } from 'react';
import { mergeDesign } from '../engine/design';
import { photoMeta, updatePhoto } from '../engine/photo';
import { db } from '../lib/db';
import type { BackDesign, Design, ExportSettings, PaneId, Photo, PhotoMeta, PlainColours, Side, ViewerFaces } from '../types';

/*
 * The print studio's store: one `Design`, its photos and the UI state, with undo / redo over the design and photos
 * (changes within 400 ms make one step) and autosave (the design to localStorage, the photos to IndexedDB). The
 * actions are in actions.ts.
 */

/** The screens of the app, one per URL hash. */
export type Screen = 'home' | 'studio' | 'sizes' | 'paper' | 'instagram' | 'docs';

/** The print studio's UI state: not undoable, not saved (except `perf`, remembered on this device). */
export interface UIState {
  side: Side;
  guides: boolean;
  /** Preview in approximate print colours (engine/proof.ts); the print files are unchanged. */
  proof: boolean;
  pane: PaneId;
  cropId: string | null;
  /** Photo slot of the current layout that the photo tray fills next. */
  slot: number;
  viewer: ViewerFaces | null;
  /** Full-screen gallery of saved designs is open. */
  gallery: boolean;
  /** Landing page, the design studio, the sizes guide or paper sizes in 3D (mirrors the URL hash: #/studio, #/sizes, #/paper). */
  screen: Screen;
  /** Settings dialog is open. */
  settings: boolean;
  /** Photo library dialog is open, and which tab it shows. */
  library: boolean;
  libraryTab: 'mine' | 'pexels' | 'ai';
  /** Feature finder (Ctrl+K) is open. */
  finder: boolean;
  /** Performance monitor widget is shown (remembered on this device). */
  perf: boolean;
  /** A long task the preview shows a loader for (e.g. a photo downloading), or null. */
  loading: string | null;
  /** Calendar month shown in the preview (0-based from the start month). */
  calPage: number;
  /** Bumped when web fonts finish loading, so the preview redraws with them. */
  fontTick: number;
}

/** The print studio's whole state. */
export interface AppState {
  design: Design;
  photos: Photo[];
  ui: UIState;
  /** The saved design this card was opened from (or last saved as), or null for a new card. */
  designId: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

const STORAGE_KEY = 'chitthi-v3';

/** URL hash prefixes and their screens, checked in order; anything else is the landing page. */
const HASH_SCREENS: readonly (readonly [string, Screen])[] = [
  ['#/studio', 'studio'],
  ['#/sizes', 'sizes'],
  ['#/paper', 'paper'],
  ['#/instagram', 'instagram'],
  ['#/docs', 'docs'],
];

/**
 * The screen a URL hash points at.
 * @param hash the URL hash, with its `#`
 * @returns the screen; the landing page for an empty or unknown hash
 */
export function screenOf(hash: string): Screen {
  return HASH_SCREENS.find(([prefix]) => hash.startsWith(prefix))?.[1] ?? 'home';
}

/**
 * The URL hash of a screen.
 * @param screen the screen
 * @returns `#/<screen>`, or an empty string for the landing page
 */
export const hashOf = (screen: Screen): string => (screen === 'home' ? '' : `#/${screen}`);

/**
 * The autosaved design (or the 2.x one), checked by `mergeDesign`.
 * @returns the design; the default design when there is none or it can't be read
 */
function loadDesign(): Design {
  try {
    const savedJson = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('chitthi-v2');
    return mergeDesign(savedJson ? JSON.parse(savedJson) : null);
  } catch {
    // Storage blocked or the saved text broken: start from the default design.
    return mergeDesign(null);
  }
}

const PERF_KEY = 'chitthi-perf';
/**
 * Whether the performance monitor was left on, on this device.
 * @returns true when it was
 */
function readPerf(): boolean {
  try {
    return localStorage.getItem(PERF_KEY) === '1';
  } catch {
    // Storage blocked: the monitor starts hidden.
    return false;
  }
}

let state: AppState = {
  design: loadDesign(),
  photos: [],
  designId: null,
  canUndo: false,
  canRedo: false,
  ui: { side: 'front', guides: false, proof: false, pane: 'photos', cropId: null, slot: 0, viewer: null, gallery: false, settings: false, library: false, libraryTab: 'mine', loading: null, finder: false, perf: readPerf(), screen: screenOf(location.hash), calPage: 0, fontTick: 0 },
};
const listeners = new Set<() => void>();
const emit = () => {
  listeners.forEach((listener) => {
    listener();
  });
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * The store's current state, for actions and event handlers (components read it with `useApp`).
 * @returns the state; replaced, never changed, on every update
 */
export const getState = (): AppState => state;

/**
 * Subscribe a component to a slice of the store. Selectors must return stable references or primitives.
 * @param selector picks the slice from the state
 * @returns the slice; the component re-renders when it changes
 */
export function useApp<Slice>(selector: (current: AppState) => Slice): Slice {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

/* ---------- history (undo / redo) ---------- */

/** One undo step: the design and photos at that point. */
interface Snapshot {
  design: Design;
  photos: Photo[];
}

/** The undo history: the steps, the one shown, and a change waiting to become a step. */
interface History {
  stack: Snapshot[];
  /** Index in `stack` of the step shown now (-1 before the first commit). */
  index: number;
  timer: ReturnType<typeof setTimeout> | 0;
  /** A change is waiting for its commit timer. */
  pending: boolean;
}
const history: History = { stack: [], index: -1, timer: 0, pending: false };
/*
 * Memory guard: snapshots share photos by reference, but every crop, rotation or colour look makes a new processed
 * canvas (up to 16 MP, 64 MB), and undo keeps the old ones alive. Past this many bytes of canvases that only the
 * history holds, the oldest steps are dropped (at least MIN_STEPS are always kept).
 */
const HISTORY_BYTES = 320 * 1024 * 1024,
  MIN_STEPS = 10,
  MAX_STEPS = 100;

/**
 * Bytes of processed canvases held by snapshots other than the current card.
 * @returns the bytes (4 per pixel)
 */
function historyBytes(): number {
  const live = new Set<CanvasImageSource>(state.photos.map((photo) => photo.src)),
    seen = new Set<CanvasImageSource>();
  let bytes = 0;
  for (const snapshot of history.stack)
    for (const photo of snapshot.photos)
      if (photo.src !== photo.orig && !live.has(photo.src) && !seen.has(photo.src)) {
        seen.add(photo.src);
        bytes += photo.sw * photo.sh * 4;
      }
  return bytes;
}

/** Undo steps and the photo memory only they hold, for the performance monitor. */
export interface HistoryStats {
  steps: number;
  bytes: number;
}

/**
 * Undo steps and the extra photo memory they hold, for the performance monitor.
 * @returns the number of steps and the bytes of canvases only the history keeps
 */
export const historyStats = (): HistoryStats => ({ steps: history.stack.length, bytes: historyBytes() });

/**
 * The undo step at an index of the stack.
 * @param index the index (out of range gives nothing)
 * @returns the step, or undefined
 */
const stepAt = (index: number): Snapshot | undefined => (index < 0 ? undefined : history.stack.at(index));

/** Update `canUndo` / `canRedo` from the history (and tell the listeners when they change). */
function syncUndo(): void {
  const canUndo = history.index > 0,
    canRedo = history.index < history.stack.length - 1;
  if (canUndo !== state.canUndo || canRedo !== state.canRedo) {
    state = { ...state, canUndo, canRedo };
    emit();
  }
}

/** Make the current design and photos an undo step now (nothing when they are the step shown already). */
export function commit(): void {
  history.pending = false;
  if (history.timer) clearTimeout(history.timer);
  const top = stepAt(history.index);
  if (top?.design === state.design && top.photos === state.photos) return;
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push({ design: state.design, photos: state.photos });
  if (history.stack.length > MAX_STEPS) history.stack.shift();
  while (history.stack.length > MIN_STEPS && historyBytes() > HISTORY_BYTES) history.stack.shift();
  history.index = history.stack.length - 1;
  syncUndo();
}

/** Commit after 400 ms without changes, so a drag or a slider makes one undo step. */
function scheduleCommit(): void {
  history.pending = true;
  if (history.timer) clearTimeout(history.timer);
  history.timer = setTimeout(commit, 400);
}

/**
 * Show an undo step: its design and photos become the current ones (and are saved).
 * @param snapshot the step
 */
function restore(snapshot: Snapshot): void {
  state = { ...state, design: snapshot.design, photos: snapshot.photos };
  schedulePersist();
  syncUndo();
  emit();
}

/** Go back one undo step (a change still waiting is committed first). */
export function undo(): void {
  if (history.pending) commit();
  const previous = stepAt(history.index - 1);
  if (!previous) return;
  history.index--;
  restore(previous);
}

/** Go forward one undo step. */
export function redo(): void {
  if (history.pending) commit();
  const next = stepAt(history.index + 1);
  if (!next) return;
  history.index++;
  restore(next);
}

/** Forget every undo step; the current card becomes the only one. */
export function resetHistory(): void {
  history.stack = [];
  history.index = -1;
  commit();
}

/* ---------- persistence ---------- */
let designTimer: ReturnType<typeof setTimeout> | 0 = 0,
  photosTimer: ReturnType<typeof setTimeout> | 0 = 0,
  savedPhotosSignature = '';

/**
 * What of the photos is saved, as text, to tell whether they changed since the last save.
 * @param metas the photos' saved fields
 * @returns a signature that changes when any saved field changes (the data URL by its length)
 */
const signatureOf = (metas: PhotoMeta[]) =>
  JSON.stringify(metas.map((meta) => [meta.name, meta.url.length, meta.rot, meta.flip, meta.crop, meta.zoom, meta.px, meta.py, meta.look]));

/** Write the design to localStorage now. */
function persistDesign(): void {
  designTimer = 0;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.design));
  } catch {
    /* storage full or blocked */
  }
}
// A change made just before the tab is closed, reloaded or hidden is written at once instead of being lost.
if (typeof window !== 'undefined')
  for (const eventName of ['pagehide', 'visibilitychange'] as const)
    window.addEventListener(eventName, () => {
      if (designTimer && (eventName === 'pagehide' || document.visibilityState === 'hidden')) {
        clearTimeout(designTimer);
        persistDesign();
      }
    });

/** Save the design after 400 ms and the photos after 1.2 s without changes (the photos only when they changed). */
function schedulePersist(): void {
  if (designTimer) clearTimeout(designTimer);
  designTimer = setTimeout(persistDesign, 400);
  if (photosTimer) clearTimeout(photosTimer);
  photosTimer = setTimeout(() => {
    const metas = state.photos.map(photoMeta),
      signature = signatureOf(metas);
    if (signature === savedPhotosSignature) return;
    savedPhotosSignature = signature;
    // A failed save is tried again with the next change; the photos are still in the page.
    db.putWorkPhotos(metas).catch(() => undefined);
  }, 1200);
}

/** Note the current photos as saved (after they were loaded or saved elsewhere), so autosave skips them. */
export const markPhotosSaved = () => {
  savedPhotosSignature = signatureOf(state.photos.map(photoMeta));
};

/* ---------- updates ---------- */

/**
 * Apply a change to the state and tell the listeners.
 * @param patch the fields to replace
 * @param isTracked whether a change to the design or photos is saved and undoable (UI changes are not)
 */
function set(patch: Partial<AppState>, isTracked = true): void {
  const previous = state;
  state = { ...state, ...patch };
  if (isTracked && (state.design !== previous.design || state.photos !== previous.photos)) {
    schedulePersist();
    scheduleCommit();
  }
  emit();
}

/** A change: the fields to replace, or a function of the current value that returns them. */
type Patch<Value> = Partial<Value> | ((current: Value) => Partial<Value>);
const resolve = <Value>(patch: Patch<Value>, current: Value) => (typeof patch === 'function' ? patch(current) : patch);

/**
 * Change the design (saved, undoable).
 * @param patch the fields to replace, or a function of the current design that returns them
 */
export const setDesign = (patch: Patch<Design>) => {
  set({ design: { ...state.design, ...resolve(patch, state.design) } });
};
/**
 * Change the card back's settings.
 * @param patch the fields to replace
 */
export const setBack = (patch: Partial<BackDesign>) => {
  set({ design: { ...state.design, back: { ...state.design.back, ...patch } } });
};
/**
 * Change the export settings.
 * @param patch the fields to replace
 */
export const setExp = (patch: Partial<ExportSettings>) => {
  set({ design: { ...state.design, exp: { ...state.design.exp, ...patch } } });
};
/**
 * Change the plain (no theme) colours.
 * @param patch the fields to replace
 */
export const setPlain = (patch: Partial<PlainColours>) => {
  set({ design: { ...state.design, plain: { ...state.design.plain, ...patch } } });
};
/**
 * Replace the photo list (its order is the slot assignment: photoSlots.ts).
 * @param photos the new list
 */
export const setPhotos = (photos: Photo[]) => {
  set({ photos });
};
/**
 * Change one photo's saved fields (crop, rotation, look …); its processed canvas is redrawn by `updatePhoto`.
 * @param id the photo
 * @param patch the fields to replace
 */
export const patchPhoto = (id: string, patch: Partial<PhotoMeta>) => {
  set({ photos: state.photos.map((photo) => (photo.id === id ? updatePhoto(photo, patch) : photo)) });
};
/**
 * Change the UI state (not saved, not undoable).
 * @param patch the fields to replace
 */
export const setUI = (patch: Partial<UIState>) => {
  set({ ui: { ...state.ui, ...patch } }, false);
};
/**
 * Note which saved design the card is (not undoable).
 * @param designId the saved design's id, or null for a new card
 */
export const setDesignId = (designId: string | null) => {
  set({ designId }, false);
};
/** Redraw the preview after web fonts loaded. */
export const bumpFonts = () => {
  setUI({ fontTick: state.ui.fontTick + 1 });
};
/**
 * Show or hide the performance monitor, and remember the choice on this device.
 * @param isShown whether the monitor is shown
 */
export function setPerf(isShown: boolean): void {
  try {
    localStorage.setItem(PERF_KEY, isShown ? '1' : '0');
  } catch {
    /* storage blocked: the choice lasts for this page */
  }
  setUI({ perf: isShown });
}
/**
 * Replace the whole card (open from gallery, new card). Stays undoable.
 * @param design the card's design
 * @param photos its photos
 * @param designId the saved design's id, or null for a new card
 */
export const replaceCard = (design: Design, photos: Photo[], designId: string | null) => {
  set({ design, photos, designId });
};
