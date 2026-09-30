import { useSyncExternalStore } from 'react';
import { mergeDesign } from '../engine/design';
import { photoMeta, updatePhoto } from '../engine/photo';
import { db } from '../lib/db';
import type { BackDesign, Design, ExportSettings, PaneId, Photo, PhotoMeta, PlainColours, Side, ViewerFaces } from '../types';

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
  screen: 'home' | 'studio' | 'sizes' | 'paper';
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
  fontTick: number;
}
export interface AppState {
  design: Design;
  photos: Photo[];
  ui: UIState;
  designId: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

const LS_KEY = 'chitthi-v3';

/** The screen a URL hash points at. */
export const screenOf = (hash: string): UIState['screen'] =>
  hash.startsWith('#/studio') ? 'studio' : hash.startsWith('#/sizes') ? 'sizes' : hash.startsWith('#/paper') ? 'paper' : 'home';
export const hashOf = (screen: UIState['screen']): string => (screen === 'home' ? '' : `#/${screen}`);
function loadDesign(): Design {
  try {
    const raw = localStorage.getItem(LS_KEY) ?? localStorage.getItem('chitthi-v2');
    return mergeDesign(raw ? JSON.parse(raw) : null);
  } catch {
    return mergeDesign(null);
  }
}

const PERF_KEY = 'chitthi-perf';
function readPerf(): boolean {
  try {
    return localStorage.getItem(PERF_KEY) === '1';
  } catch {
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
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const getState = (): AppState => state;
/** Subscribe a component to a slice of the store. Selectors must return stable references or primitives. */
export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => sel(state),
    () => sel(state),
  );
}

/* ---------- history (undo / redo) ---------- */
interface Snap {
  design: Design;
  photos: Photo[];
}
const hist = { stack: [] as Snap[], i: -1, timer: 0 as ReturnType<typeof setTimeout> | 0, pending: false };
/*
 * Memory guard: snapshots share photos by reference, but every crop, rotation or colour look makes a new processed
 * canvas (up to 16 MP, 64 MB), and undo keeps the old ones alive. Past this many bytes of canvases that only the
 * history holds, the oldest steps are dropped (at least MIN_STEPS are always kept).
 */
const HISTORY_BYTES = 320 * 1024 * 1024,
  MIN_STEPS = 10;
/** Bytes of processed canvases held by snapshots other than the current card. */
function historyBytes(): number {
  const live = new Set<CanvasImageSource>(state.photos.map((p) => p.src)),
    seen = new Set<CanvasImageSource>();
  let bytes = 0;
  for (const s of hist.stack)
    for (const p of s.photos)
      if (p.src !== p.orig && !live.has(p.src) && !seen.has(p.src)) {
        seen.add(p.src);
        bytes += p.sw * p.sh * 4;
      }
  return bytes;
}
/** Undo steps and the extra photo memory they hold, for the performance monitor. */
export const historyStats = () => ({ steps: hist.stack.length, bytes: historyBytes() });
function syncUndo(): void {
  const canUndo = hist.i > 0,
    canRedo = hist.i < hist.stack.length - 1;
  if (canUndo !== state.canUndo || canRedo !== state.canRedo) {
    state = { ...state, canUndo, canRedo };
    emit();
  }
}
export function commit(): void {
  hist.pending = false;
  if (hist.timer) clearTimeout(hist.timer);
  const top = hist.stack[hist.i];
  if (top && top.design === state.design && top.photos === state.photos) return;
  hist.stack = hist.stack.slice(0, hist.i + 1);
  hist.stack.push({ design: state.design, photos: state.photos });
  if (hist.stack.length > 100) hist.stack.shift();
  while (hist.stack.length > MIN_STEPS && historyBytes() > HISTORY_BYTES) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  syncUndo();
}
function scheduleCommit(): void {
  hist.pending = true;
  if (hist.timer) clearTimeout(hist.timer);
  hist.timer = setTimeout(commit, 400);
}
function restore(s: Snap): void {
  state = { ...state, design: s.design, photos: s.photos };
  schedulePersist();
  syncUndo();
  emit();
}
export function undo(): void {
  if (hist.pending) commit();
  if (hist.i <= 0) return;
  hist.i--;
  restore(hist.stack[hist.i]);
}
export function redo(): void {
  if (hist.pending) commit();
  if (hist.i >= hist.stack.length - 1) return;
  hist.i++;
  restore(hist.stack[hist.i]);
}
export function resetHistory(): void {
  hist.stack = [];
  hist.i = -1;
  commit();
}

/* ---------- persistence ---------- */
let lsTimer: ReturnType<typeof setTimeout> | 0 = 0,
  idbTimer: ReturnType<typeof setTimeout> | 0 = 0,
  photoSig = '';
const sigOf = (list: PhotoMeta[]) =>
  JSON.stringify(list.map((p) => [p.name, p.url.length, p.rot, p.flip, p.crop, p.zoom, p.px, p.py, p.look]));
function schedulePersist(): void {
  if (lsTimer) clearTimeout(lsTimer);
  lsTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.design));
    } catch {
      /* storage full or blocked */
    }
  }, 400);
  if (idbTimer) clearTimeout(idbTimer);
  idbTimer = setTimeout(() => {
    const metas = state.photos.map(photoMeta),
      sig = sigOf(metas);
    if (sig === photoSig) return;
    photoSig = sig;
    db.putWorkPhotos(metas).catch(() => undefined);
  }, 1200);
}
export const markPhotosSaved = () => {
  photoSig = sigOf(state.photos.map(photoMeta));
};

/* ---------- updates ---------- */
function set(patch: Partial<AppState>, track = true): void {
  const prev = state;
  state = { ...state, ...patch };
  if (track && (state.design !== prev.design || state.photos !== prev.photos)) {
    schedulePersist();
    scheduleCommit();
  }
  emit();
}
type Patch<T> = Partial<T> | ((cur: T) => Partial<T>);
const resolve = <T>(p: Patch<T>, cur: T) => (typeof p === 'function' ? p(cur) : p);

export const setDesign = (p: Patch<Design>) => set({ design: { ...state.design, ...resolve(p, state.design) } });
export const setBack = (p: Partial<BackDesign>) => set({ design: { ...state.design, back: { ...state.design.back, ...p } } });
export const setExp = (p: Partial<ExportSettings>) => set({ design: { ...state.design, exp: { ...state.design.exp, ...p } } });
export const setPlain = (p: Partial<PlainColours>) =>
  set({ design: { ...state.design, plain: { ...state.design.plain, ...p } } });
export const setPhotos = (photos: Photo[]) => set({ photos });
export const patchPhoto = (id: string, p: Partial<PhotoMeta>) =>
  set({ photos: state.photos.map((ph) => (ph.id === id ? updatePhoto(ph, p) : ph)) });
export const setUI = (p: Partial<UIState>) => set({ ui: { ...state.ui, ...p } }, false);
export const setDesignId = (designId: string | null) => set({ designId }, false);
export const bumpFonts = () => setUI({ fontTick: state.ui.fontTick + 1 });
/** Show or hide the performance monitor, and remember the choice on this device. */
export function setPerf(on: boolean): void {
  try {
    localStorage.setItem(PERF_KEY, on ? '1' : '0');
  } catch {
    /* storage blocked: the choice lasts for this page */
  }
  setUI({ perf: on });
}
/** Replace the whole card (open from gallery, new card). Stays undoable. */
export const replaceCard = (design: Design, photos: Photo[], designId: string | null) => set({ design, photos, designId });
