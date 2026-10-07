import { useSyncExternalStore } from 'react';
import type { Adjustments } from '../engine/adjust';
import { closeGap, closeGaps, lift, moveTo, nudge, reorder, rippleDelete, roll, slide, slip, trim, type Edit, type EditCtx, type Tool } from '../engine/edits';
import { DEFAULT_EDIT, type IgEdit } from '../engine/instagram';
import type { Layer } from '../engine/layers';
import { checkFile, loadImage } from '../engine/photo';
import { MAIN_VIDEO, MUSIC, defaultTracks, gaps, lockedReason, pack, patchTrack, projectLength, type AudioClip, type Project, type Track } from '../engine/timeline';
import { V_PHOTO_SECONDS, bitrateFor, clipLength, formatsFor, limitsFor, vFormat, type Motion, type VFormatId, type VFps, type VKind, type VLimits, type VQuality } from '../engine/video';
import { logError } from '../lib/errors';
import { canStreamToDisk, openFileSink } from '../lib/fileSink';
import { isDesktop } from '../platform/desktop';
import type { LayerTools } from './instagram';

/*
 * The video editor's state: tracks (engine/timeline.ts), clips (photos and video files) in start order on the main
 * video track, layers over the whole timeline, music on the music track, the playhead and the export. With Magnetic on
 * (the default) every change to the clips packs them end to end (`pack`), so each clip's `start` is where 2.x placed
 * it; with it off clips keep their times and gaps (202). Edits go through engine/edits.ts. One project at a time, made as
 * a Reel / Short (vertical) or a YouTube video (16:9); switching between them keeps the clips and changes the frame.
 * Memory: video clips stay as their files (played through <video> elements while editing, decoded frame by frame on
 * export); photos keep their file and a preview copy of at most 1080 px. Undo covers the tracks, clips and layers.
 * The project lasts for this session.
 */

const PREVIEW_MAX = 1080;
const STRIP_FRAMES = 8;

export interface VClip {
  id: string;
  kind: 'photo' | 'video';
  /** The track it is on (201: always the main video track). */
  track: string;
  /** Seconds from the start of the video; kept packed end to end while Magnetic is on. */
  start: number;
  name: string;
  file: Blob;
  /** Object URL of the file, for <video> playback and thumbnails. */
  url: string;
  /** Pixel size of the picture. */
  w: number;
  h: number;
  /** Video: length of the source file in seconds (0 for photos). */
  srcDur: number;
  /** Photo: seconds on screen. */
  dur: number;
  /** Video: the part used. */
  in: number;
  out: number;
  edit: IgEdit;
  motion: Motion;
  /** Fade in from black at the start of this clip. */
  fade: boolean;
  /** Video: 0–1. */
  volume: number;
  /** Small JPEG for the clip. */
  thumb: string;
  /** Video: small frames spread through the source, for the timeline's filmstrip (filled in the background). */
  strip: string[];
  /** Photo: a copy of at most 1080 px for the preview. */
  still: HTMLCanvasElement | null;
}

export interface VMusic {
  /** The music track. */
  track: string;
  file: Blob;
  name: string;
  url: string;
  dur: number;
  volume: number;
  /** Seconds into the song where the video's sound starts. */
  offset: number;
  /** Loudness peaks (0–1) through the whole song, for the timeline's waveform; empty until measured. */
  peaks: number[];
}

/** A track's height on the timeline (Q5): small 40 px, medium 64 px (2.x's rows), large 96 px. */
export type TrackHeight = 'small' | 'medium' | 'large';

export interface VState {
  kind: VKind;
  tracks: Track[];
  /** Track heights by track id (a view setting: not undone, lasts for the session); missing = medium. */
  trackView: Record<string, TrackHeight>;
  clips: VClip[];
  selected: string | null;
  format: VFormatId;
  fps: VFps;
  layers: Layer[];
  layerSel: string | null;
  tools: LayerTools;
  music: VMusic | null;
  /** Fade to black over the last half second. */
  fadeOut: boolean;
  /** The main track packs its clips end to end (202); off, clips keep their times and gaps. Part of the project. */
  magnetic: boolean;
  /** The timeline's edit tool (a view setting: not undone, lasts for the session; D4). */
  tool: Tool;
  /** Drags snap to edges and the playhead (a view setting). */
  snapping: boolean;
  quality: VQuality;
  /** Playhead, seconds. */
  t: number;
  /** Timeline zoom, pixels per second. */
  zoom: number;
  playing: boolean;
  busy: string | null;
  /** Export progress (0–1) and what it is doing, while exporting. */
  progress: { frac: number; phase: string } | null;
  /** The last exported MP4 when built in memory (Reels: for sharing), until anything changes. */
  result: File | null;
  /** Where the last long export was saved. */
  savedTo: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

let state: VState = {
  kind: 'reel',
  tracks: defaultTracks(),
  trackView: {},
  clips: [],
  selected: null,
  format: 'reel',
  fps: 30,
  layers: [],
  layerSel: null,
  tools: { tool: 'select', brush: 'marker', brushColor: '#ffffff', brushScale: 1 },
  music: null,
  fadeOut: true,
  magnetic: true,
  tool: 'select',
  snapping: true,
  quality: 'standard',
  t: 0,
  zoom: 60,
  playing: false,
  busy: null,
  progress: null,
  result: null,
  savedTo: null,
  canUndo: false,
  canRedo: false,
};

const listeners = new Set<() => void>();
const PURE = ['selected', 'layerSel', 'tools', 'tool', 'snapping', 'trackView', 't', 'zoom', 'playing', 'busy', 'progress', 'result', 'savedTo', 'canUndo', 'canRedo'];
function set(patch: Partial<VState>): void {
  // Anything that changes the video makes the last export stale.
  const stale = Object.keys(patch).some((k) => !PURE.includes(k));
  state = { ...state, ...(stale ? { result: null, savedTo: null } : {}), ...patch };
  listeners.forEach((l) => l());
}
export const getVideo = () => state;
export function useVideo<T>(sel: (s: VState) => T): T {
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

/** This project's limits in this app (browser or desktop). */
export const limits = (kind: VKind = state.kind): VLimits => limitsFor(kind, isDesktop);
/** The video's length with these clips (packed first when magnetic, as every change then does). */
const lengthOf = (clips: VClip[], tracks: Track[] = state.tracks, magnetic = state.magnetic) =>
  projectLength({ tracks, clips: magnetic ? pack(clips) : clips, audio: [], layers: [], fadeOut: false });
/** What the edit operations need to know (engine/edits.ts). */
const editCtx = (): EditCtx => ({ maxLength: limits().seconds, locked: (track) => lockedReason(state.tracks, track) });
/** The state as the track model sees it (engine/timeline.ts): for the preview, the timeline and the export. */
export const projectOf = (s: VState = state): Project<VClip> => ({ tracks: s.tracks, clips: s.clips, audio: musicClips(s.music), layers: s.layers, fadeOut: s.fadeOut });
/** The video's length (a selector: `useVideo(videoLength)`). */
export const videoLength = (s: VState) => projectLength(projectOf(s));
export const total = () => videoLength(state);
export const setPlayhead = (t: number) => set({ t: Math.max(0, Math.min(t, total())) });
export const selectClip = (id: string | null) => set({ selected: id });
export const selectVLayer = (id: string | null) => set({ layerSel: id });
export const setVTools = (patch: Partial<LayerTools>) => set({ tools: { ...state.tools, ...patch } });
export const setPlaying = (playing: boolean) => set({ playing: playing && state.clips.length > 0 });
export const setZoom = (zoom: number) => set({ zoom: Math.max(4, Math.min(400, zoom)) });
export const setTool = (tool: Tool) => set({ tool });
export const setSnapping = (snapping: boolean) => set({ snapping });
export const setVideoOptions = (patch: Partial<Pick<VState, 'format' | 'fadeOut' | 'quality' | 'fps'>>) => set(patch);

/** Switches between a Reel / Short and a YouTube video: the clips stay, the frame and limits change. */
export function setKind(kind: VKind): void {
  if (kind === state.kind) return;
  const f = formatsFor(kind)[0];
  const fps = limits(kind).fps.includes(state.fps) ? state.fps : 30;
  set({ kind, format: f.id, fps });
}

/* ---------- undo / redo (tracks, clips, layers and Magnetic) ---------- */
interface Snap {
  tracks: Track[];
  clips: VClip[];
  layers: Layer[];
  /** With the clips, so undoing a gap close brings back the gaps with Magnetic off (D1). */
  magnetic: boolean;
}
const past: Snap[] = [];
const future: Snap[] = [];
let lastKey = '',
  lastAt = 0;
const snap = (): Snap => ({ tracks: state.tracks, clips: state.clips, layers: state.layers, magnetic: state.magnetic });
function record(key: string): void {
  const now = Date.now();
  if (key && key === lastKey && now - lastAt < 800) {
    lastAt = now;
    return;
  }
  lastKey = key;
  lastAt = now;
  past.push(snap());
  if (past.length > 100) past.shift();
  future.length = 0;
}
const flags = () => ({ canUndo: past.length > 0, canRedo: future.length > 0 });
export const endVStep = () => {
  lastKey = '';
};
function restore(s: Snap): void {
  lastKey = '';
  set({
    tracks: s.tracks,
    clips: s.clips,
    layers: s.layers,
    magnetic: s.magnetic,
    selected: s.clips.some((c) => c.id === state.selected) ? state.selected : (s.clips[0]?.id ?? null),
    layerSel: s.layers.some((l) => l.id === state.layerSel) ? state.layerSel : null,
    t: Math.min(state.t, lengthOf(s.clips, s.tracks, s.magnetic)),
    ...flags(),
  });
}
export function undoV(): void {
  const s = past.pop();
  if (!s) return;
  future.push(snap());
  restore(s);
}
export function redoV(): void {
  const s = future.pop();
  if (!s) return;
  past.push(snap());
  restore(s);
}
/** Every undoable change goes through here; with Magnetic on, changed clips are packed end to end (the one place). */
function change(key: string, patch: Partial<Snap>, extra: Partial<VState> = {}): void {
  record(key);
  const magnetic = patch.magnetic ?? state.magnetic;
  if (patch.clips && magnetic) patch = { ...patch, clips: pack(patch.clips) };
  const clips = patch.clips ?? state.clips;
  set({ ...patch, ...flags(), ...extra, t: Math.min(extra.t ?? state.t, lengthOf(clips, patch.tracks, magnetic)) });
}

/**
 * Starts a project from clips already made (tests; opening a saved project goes through mergeProject first): no
 * history, packed when magnetic, else in start order.
 */
export function loadVideoProject(p: { clips: VClip[]; tracks?: Track[]; magnetic?: boolean; music?: VMusic | null }): void {
  past.length = 0;
  future.length = 0;
  lastKey = '';
  const magnetic = p.magnetic !== false;
  const clips = magnetic ? pack(p.clips) : p.clips.slice().sort((a, b) => a.start - b.start);
  set({ clips, tracks: p.tracks ?? defaultTracks(), magnetic, music: p.music ?? null, layers: [], layerSel: null, selected: clips[0]?.id ?? null, t: 0, ...flags() });
}

/**
 * Magnetic (202, D1): switching it on closes every gap on the main track as one undo step; switching it off changes no
 * clip and isn't recorded.
 */
export function setMagnetic(on: boolean): void {
  if (on === state.magnetic) return;
  if (on) change('', { clips: closeGaps(state.clips), magnetic: true });
  else set({ magnetic: false });
}

/* ---------- tracks ---------- */
/** Hides / mutes / locks a track (one undo step each; Hide is for picture tracks, Mute for sound tracks). */
export function setTrack(id: string, patch: Partial<Pick<Track, 'hidden' | 'muted' | 'locked'>>): void {
  const tracks = patchTrack(state.tracks, id, patch);
  if (tracks !== state.tracks) change('', { tracks });
}
export const setTrackHeight = (id: string, height: TrackHeight) => set({ trackView: { ...state.trackView, [id]: height } });
/** Why a clip can't be changed (its track is locked), or null. */
export const clipLocked = (id: string): string | null => {
  const c = state.clips.find((x) => x.id === id);
  return c ? lockedReason(state.tracks, c.track) : null;
};
/** Why the music can't be changed (its track is locked), or null. */
export const musicLocked = (): string | null => lockedReason(state.tracks, MUSIC);

/* ---------- clips ---------- */
let seq = 0;
const newId = () => `v${Date.now().toString(36)}${(seq++).toString(36)}`;

function thumbOf(src: CanvasImageSource, w: number, h: number, size = 160): string {
  const c = document.createElement('canvas'),
    k = size / Math.max(w, h);
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

async function photoClip(name: string, file: Blob): Promise<VClip> {
  const url = URL.createObjectURL(file);
  const img = await loadImage(url).catch((e) => {
    URL.revokeObjectURL(url);
    throw e;
  });
  const w = img.naturalWidth,
    h = img.naturalHeight,
    k = Math.min(1, PREVIEW_MAX / Math.max(w, h));
  const still = document.createElement('canvas');
  still.width = Math.max(1, Math.round(w * k));
  still.height = Math.max(1, Math.round(h * k));
  still.getContext('2d')?.drawImage(img, 0, 0, still.width, still.height);
  const thumb = thumbOf(still, still.width, still.height);
  return { id: newId(), kind: 'photo', track: MAIN_VIDEO, start: 0, name, file, url, w, h, srcDur: 0, dur: V_PHOTO_SECONDS, in: 0, out: 0, edit: { ...DEFAULT_EDIT }, motion: 'zoom-in', fade: false, volume: 0, thumb, strip: [thumb], still };
}

/** Seeks a <video> and resolves once the frame is there. */
const seek = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((res, rej) => {
    const ok = () => {
      v.removeEventListener('seeked', ok);
      res();
    };
    v.addEventListener('seeked', ok);
    v.onerror = () => rej(new Error('seek failed'));
    v.currentTime = t;
  });

/** Reads a video's size, length and a thumbnail through a <video> element. */
function videoClip(name: string, file: Blob): Promise<VClip> {
  const url = URL.createObjectURL(file);
  return new Promise<VClip>((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unplayable'));
    };
    const timer = setTimeout(fail, 30000);
    v.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    v.onloadedmetadata = () => {
      if (!v.videoWidth || !Number.isFinite(v.duration)) {
        clearTimeout(timer);
        fail();
        return;
      }
      void seek(v, Math.min(0.5, v.duration / 2)).then(() => {
        clearTimeout(timer);
        const thumb = thumbOf(v, v.videoWidth, v.videoHeight);
        resolve({
          id: newId(),
          kind: 'video',
          track: MAIN_VIDEO,
          start: 0,
          name,
          file,
          url,
          w: v.videoWidth,
          h: v.videoHeight,
          srcDur: v.duration,
          dur: 0,
          in: 0,
          out: v.duration,
          edit: { ...DEFAULT_EDIT },
          motion: 'none',
          fade: false,
          volume: 1,
          thumb,
          strip: [thumb],
          still: null,
        });
        v.removeAttribute('src');
        v.load();
      }, fail);
    };
    // Only object URLs of the user's own files are loaded into a <video> element.
    if (url.startsWith('blob:')) v.src = url;
    else fail();
  });
}

/** Fills a video clip's filmstrip in the background, one seek at a time. */
async function makeStrip(id: string, url: string, dur: number): Promise<void> {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  try {
    if (!url.startsWith('blob:')) return;
    v.src = url;
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('load'));
    });
    const frames: string[] = [];
    for (let i = 0; i < STRIP_FRAMES; i++) {
      await seek(v, Math.min(dur - 0.05, ((i + 0.5) / STRIP_FRAMES) * dur));
      frames.push(thumbOf(v, v.videoWidth, v.videoHeight, 120));
    }
    // Not an undo step: every copy of this clip (in the history too) can share the strip.
    for (const list of [state.clips, ...past.map((s) => s.clips), ...future.map((s) => s.clips)]) for (const c of list) if (c.id === id) c.strip = frames;
    set({ clips: state.clips.slice() });
  } catch {
    /* the single thumbnail stays */
  } finally {
    v.removeAttribute('src');
    v.load();
  }
}

const VIDEO_TYPES = /^video\/(mp4|quicktime|webm|x-m4v|x-matroska)$/;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;

/** Adds photos and videos at the end of the timeline, within this project's limits. Returns messages. */
export async function addMedia(files: { name: string; blob: Blob; type?: string }[]): Promise<string[]> {
  const L = limits();
  const msgs: string[] = [];
  const locked = lockedReason(state.tracks, MAIN_VIDEO);
  if (locked) return [locked];
  set({ busy: 'Adding to the timeline…' });
  const added: VClip[] = [];
  let length = total();
  const where = isDesktop ? '' : ' in the browser (the desktop app allows more)';
  for (const f of files) {
    if (state.clips.length + added.length >= L.clips) {
      msgs.push(`A project holds up to ${L.clips} clips${where}; the rest weren’t added.`);
      break;
    }
    if (length >= L.seconds - 0.5) {
      msgs.push(`The video is already ${fmtLimit(L.seconds)} long, the most${where}; the rest weren’t added.`);
      break;
    }
    const type = f.type ?? f.blob.type ?? '';
    const isVideo = VIDEO_TYPES.test(type) || VIDEO_EXT.test(f.name);
    try {
      if (isVideo) {
        if (f.blob.size > L.fileMB * 1048576) {
          msgs.push(`${f.name} is ${(f.blob.size / 1048576).toFixed(0)} MB. Videos up to ${L.fileMB >= 1024 ? `${L.fileMB / 1024} GB` : `${L.fileMB} MB`} can be added${where}.`);
          continue;
        }
        const c = await videoClip(f.name, f.blob);
        const room = L.seconds - length;
        if (c.out - c.in > room) {
          c.out = c.in + room;
          msgs.push(`${f.name} was trimmed to ${fmtLimit(room)} to keep the video within ${fmtLimit(L.seconds)}${where}.`);
        }
        added.push(c);
        length += clipLength(c);
      } else {
        const why = checkFile(new File([f.blob], f.name, { type }));
        if (why) {
          msgs.push(why);
          continue;
        }
        const c = await photoClip(f.name, f.blob);
        c.dur = Math.min(c.dur, Math.max(0.5, L.seconds - length));
        added.push(c);
        length += clipLength(c);
      }
    } catch (e) {
      logError('handled', e);
      msgs.push(
        isVideo
          ? `${f.name} couldn’t be played here. iPhone videos in HEVC may need converting (Settings › Camera › Formats › Most Compatible), or use MP4 (H.264).`
          : `${f.name} couldn’t be read. The file may be damaged.`,
      );
    }
  }
  if (added.length) {
    change('', { clips: [...state.clips, ...added] }, { selected: state.selected ?? added[0].id });
    for (const c of added) if (c.kind === 'video') void makeStrip(c.id, c.url, c.srcDur);
  }
  set({ busy: null });
  return msgs;
}

// Whole minutes only: 90 s stays "90 seconds" rather than rounding up to a limit the editor doesn't allow.
const fmtLimit = (s: number) =>
  s >= 3600 ? `${(s / 3600).toFixed(s % 3600 ? 1 : 0)} hours` : s >= 60 && s % 60 === 0 ? (s === 60 ? '1 minute' : `${s / 60} minutes`) : `${Math.round(s)} seconds`;
export const limitText = fmtLimit;

/** Changes a clip; refused (false) if its track is locked or it would make the video longer than this project allows. */
export function updateClip(id: string, patch: Partial<VClip>, key = `clip:${id}:${Object.keys(patch).sort().join(',')}`): boolean {
  if (clipLocked(id)) return false;
  const clips = state.clips.map((c) => (c.id === id ? { ...c, ...patch } : c));
  if (lengthOf(clips) - limits().seconds > 0.01) return false;
  change(key, { clips });
  return true;
}
export const editClip = (id: string, patch: Partial<IgEdit>) => {
  const c = state.clips.find((x) => x.id === id);
  if (c) updateClip(id, { edit: { ...c.edit, ...patch } }, `clipedit:${id}:${Object.keys(patch).sort().join(',')}`);
};
export const adjustClip = (id: string, patch: Partial<Adjustments>) => {
  const c = state.clips.find((x) => x.id === id);
  if (c) updateClip(id, { edit: { ...c.edit, adjust: { ...c.edit.adjust, ...patch } } }, `clipadjust:${id}:${Object.keys(patch).sort().join(',')}`);
};

/* Clip actions are refused (false) on a locked track; `clipLocked` says why. */
export function removeClip(id: string): boolean {
  const i = state.clips.findIndex((c) => c.id === id);
  if (i < 0 || clipLocked(id)) return false;
  // The object URL is kept while the clip can still come back through undo; it goes when the page closes.
  const r = (state.magnetic ? rippleDelete : lift)(state.clips, id, editCtx());
  if ('error' in r) return false;
  const clips = r.clips;
  change('', { clips }, { selected: state.selected === id ? (clips[Math.min(i, clips.length - 1)]?.id ?? null) : state.selected });
  return true;
}

export function moveClip(id: string, by: -1 | 1): boolean {
  const i = state.clips.findIndex((c) => c.id === id);
  return moveClipTo(id, i + by);
}
/** Moves a clip to a new place in the order (dragging on the timeline). */
export function moveClipTo(id: string, index: number): boolean {
  if (clipLocked(id)) return false;
  const r = reorder(state.clips, id, index, editCtx());
  if ('error' in r || r.clips === state.clips) return false;
  change('', { clips: r.clips });
  return true;
}

export function duplicateClip(id: string): boolean {
  const i = state.clips.findIndex((c) => c.id === id);
  const c = state.clips[i];
  if (!c || clipLocked(id) || total() + clipLength(c) > limits().seconds || state.clips.length >= limits().clips) return false;
  const copy: VClip = { ...c, id: newId(), fade: false, start: c.start + clipLength(c) };
  if (!state.magnetic) {
    // D2: into the first gap after the original that fits, else after the last clip; nothing else moves.
    const len = clipLength(c);
    const end = state.clips.reduce((m, x) => (x.track === c.track ? Math.max(m, x.start + clipLength(x)) : m), 0);
    const room = gaps(projectOf(), c.track).find((g) => g.start >= copy.start - 1e-9 && g.end - g.start >= len - 1e-6);
    copy.start = room ? room.start : end;
    const clips = [...state.clips, copy].sort((a, b) => (a.track === b.track ? a.start - b.start : 0));
    change('', { clips }, { selected: copy.id });
    return true;
  }
  const clips = state.clips.slice();
  clips.splice(i + 1, 0, copy);
  change('', { clips }, { selected: copy.id });
  return true;
}

/** Splits the clip under the playhead into two clips (not on a locked track). */
export function splitAtPlayhead(): boolean {
  for (const [i, c] of state.clips.entries()) {
    const len = clipLength(c),
      t0 = c.start;
    if (c.track === MAIN_VIDEO && state.t > t0 + 0.2 && state.t < t0 + len - 0.2) {
      if (clipLocked(c.id)) return false;
      const local = state.t - t0;
      const a: VClip = c.kind === 'video' ? { ...c, out: c.in + local } : { ...c, dur: local };
      const b: VClip = c.kind === 'video' ? { ...c, id: newId(), start: t0 + local, in: c.in + local, fade: false } : { ...c, id: newId(), start: t0 + local, dur: len - local, fade: false };
      const clips = state.clips.slice();
      clips.splice(i, 1, a, b);
      change('', { clips }, { selected: b.id });
      return true;
    }
  }
  return false;
}

/* ---------- edit tools (202): each returns null, or why it was refused ---------- */

/** Applies an edit's result as one undo step (`key` coalesces a drag); nothing is recorded when nothing changed. */
function apply(r: Edit<VClip>, key = '', extra: Partial<VState> = {}): string | null {
  if ('error' in r) return r.error;
  if (r.clips !== state.clips) change(key, { clips: r.clips }, extra);
  return null;
}
/** Shift + Delete: removes a clip and pulls the later ones back, with Magnetic on or off. */
export function rippleDeleteClip(id: string): string | null {
  const i = state.clips.findIndex((c) => c.id === id);
  const r = rippleDelete(state.clips, id, editCtx());
  const left = 'clips' in r ? r.clips.filter((c) => c.track === MAIN_VIDEO) : [];
  const next = left[Math.min(i, left.length - 1)]?.id ?? null;
  return apply(r, '', { selected: state.selected === id ? next : state.selected });
}
/** Moves one edge of a clip by `delta` seconds; with Magnetic on, or `ripple` (Shift), the later clips follow. */
export function trimClip(id: string, side: 'start' | 'end', delta: number, o: { ripple?: boolean } = {}, key = ''): string | null {
  return apply(trim(state.clips, id, side, delta, { ripple: state.magnetic || !!o.ripple }, editCtx()), key);
}
/** Magnetic off: puts a clip at a time, or the nearest free spot where it fits. */
export const moveClipToTime = (id: string, start: number, key = ''): string | null => apply(moveTo(state.clips, id, start, editCtx()), key);
export const rollClip = (id: string, delta: number, key = ''): string | null => apply(roll(state.clips, id, delta, editCtx()), key);
export const slipClip = (id: string, delta: number, key = ''): string | null => apply(slip(state.clips, id, delta, editCtx()), key);
export const slideClip = (id: string, delta: number, key = ''): string | null => apply(slide(state.clips, id, delta, editCtx(), state.magnetic), key);
/** Alt + ← / → (Q5): `frames` frames at the project's frame rate with the current tool. */
export const nudgeClip = (id: string, frames: number): string | null =>
  apply(nudge(state.clips, id, state.tool, frames, state.fps, state.magnetic, editCtx()), `nudge:${state.tool}:${id}`);
/** Q / W: ripple-trims the selected clip's start / end to the playhead. */
export function rippleTrimToPlayhead(side: 'start' | 'end'): string | null {
  const c = state.clips.find((x) => x.id === state.selected);
  if (!c) return 'Select a clip first.';
  const end = c.start + clipLength(c);
  if (!(state.t > c.start && state.t < end)) return 'Put the playhead inside the clip first.';
  return apply(trim(state.clips, c.id, side, state.t - (side === 'start' ? c.start : end), { ripple: true }, editCtx()), '', side === 'start' ? { t: c.start } : {});
}
/** Closes the gap at a time on the main track (a selected gap's Delete). */
export const deleteGap = (at: number): string | null => apply(closeGap(state.clips, at, editCtx()));
/** The Slip keys on the music (Q8): moves where in the song the video's sound starts. */
export function slipMusic(delta: number): string | null {
  const m = state.music;
  if (!m) return 'There’s no music to slip.';
  const why = musicLocked();
  if (why) return why;
  const max = Math.max(0, m.dur - Math.min(total(), m.dur));
  updateMusic({ offset: Math.max(0, Math.min(max, m.offset + delta)) });
  return null;
}

/* ---------- layers ---------- */
export function addVLayer(layer: Layer): void {
  change(`add:${layer.id}`, { layers: [...state.layers, layer] }, { layerSel: layer.id });
}
export function updateVLayer(id: string, patch: Partial<Layer> | ((l: Layer) => Layer), key = `layer:${id}`): void {
  change(key, { layers: state.layers.map((l) => (l.id === id ? (typeof patch === 'function' ? patch(l) : ({ ...l, ...patch } as Layer)) : l)) });
}
export function removeVLayer(id: string): void {
  change('', { layers: state.layers.filter((l) => l.id !== id) }, { layerSel: state.layerSel === id ? null : state.layerSel });
}
export function restackVLayer(id: string, by: 1 | -1): void {
  const i = state.layers.findIndex((l) => l.id === id),
    j = i + by;
  if (i < 0 || j < 0 || j >= state.layers.length) return;
  const layers = state.layers.slice();
  [layers[i], layers[j]] = [layers[j], layers[i]];
  change('', { layers });
}
export function setVLayers(layers: Layer[], key = '', layerSel?: string | null): void {
  change(key, { layers }, layerSel === undefined ? {} : { layerSel });
}

/* ---------- music ---------- */
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i;

/** Loudness peaks through a song, for the waveform. The decoded sound is dropped right after. */
async function measurePeaks(file: Blob, n = 800): Promise<number[]> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());
  const data = buf.getChannelData(0),
    step = Math.max(1, Math.floor(data.length / n)),
    out: number[] = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (let j = i * step, e = Math.min(data.length, j + step); j < e; j += 4) p = Math.max(p, Math.abs(data[j]));
    out.push(p);
    max = Math.max(max, p);
  }
  return out.map((p) => (max ? p / max : 0));
}

export async function setMusicFile(file: File): Promise<string | null> {
  const locked = musicLocked();
  if (locked) return locked;
  if (!/^audio\//.test(file.type) && !AUDIO_EXT.test(file.name)) return `${file.name} isn’t a sound file. Use MP3, M4A, WAV, OGG or FLAC.`;
  if (file.size > 100 * 1048576) return `${file.name} is too large. Music files up to 100 MB can be added.`;
  const url = URL.createObjectURL(file);
  try {
    const dur = await new Promise<number>((res, rej) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => (Number.isFinite(a.duration) ? res(a.duration) : rej(new Error('no duration')));
      a.onerror = () => rej(new Error('unplayable'));
      a.src = url;
    });
    if (state.music) URL.revokeObjectURL(state.music.url);
    set({ music: { track: MUSIC, file, name: file.name, url, dur, volume: 0.8, offset: 0, peaks: [] } });
    void measurePeaks(file)
      .then((peaks) => state.music?.url === url && set({ music: { ...state.music, peaks } }))
      .catch(() => undefined);
    return null;
  } catch (e) {
    URL.revokeObjectURL(url);
    logError('handled', e);
    return `${file.name} couldn’t be played here.`;
  }
}
/** The music as a sound clip on its track (as `fromSequence` makes it): from its offset to the end of the video. */
export const musicClips = (m: VMusic | null = state.music): (AudioClip & { file: Blob })[] =>
  m ? [{ id: 'music', track: m.track, start: 0, in: m.offset, volume: m.volume, toEnd: true, srcDur: m.dur, file: m.file }] : [];
/* Music changes are refused (false) while the music track is locked; `musicLocked` says why. */
export function updateMusic(patch: Partial<Pick<VMusic, 'volume' | 'offset'>>): boolean {
  if (!state.music || musicLocked()) return false;
  set({ music: { ...state.music, ...patch } });
  return true;
}
export function removeMusic(): boolean {
  if (musicLocked()) return false;
  if (state.music) URL.revokeObjectURL(state.music.url);
  set({ music: null });
  return true;
}

/* ---------- export ---------- */
let running: AbortController | null = null;

export type ExportOutcome = { kind: 'file'; file: File } | { kind: 'saved'; name: string } | null;

/**
 * Encodes the video. Reels are built in memory (so they can be shared); YouTube videos stream to a file the user
 * picks (desktop, Chrome, Edge), or are built in memory where the browser can't stream. Call straight from a click:
 * the save picker needs it. Resolves null when cancelled.
 */
export async function exportVideo(): Promise<ExportOutcome> {
  if (running) return null;
  const f = vFormat(state.format);
  const name = `chitthi-${state.kind === 'vlog' ? 'youtube' : state.format}-${new Date().toISOString().slice(0, 10)}.mp4`;
  const stream = state.kind === 'vlog' && canStreamToDisk();
  const sink = stream ? await openFileSink(name) : null;
  if (stream && !sink) return null;
  const ctl = new AbortController();
  running = ctl;
  set({ progress: { frac: 0, phase: 'Loading the video encoder…' }, result: null, savedTo: null });
  try {
    const { encodeVideo } = await import('../engine/videoExport');
    const blob = await encodeVideo({
      tracks: state.tracks,
      clips: state.clips.map((c) => ({ id: c.id, track: c.track, start: c.start, kind: c.kind, dur: c.dur, in: c.in, out: c.out, edit: c.edit, motion: c.motion, fade: c.fade, file: c.file, volume: c.volume })),
      audio: musicClips(),
      layers: state.layers,
      width: f.w,
      height: f.h,
      fps: state.fps,
      bitrate: bitrateFor(f, state.fps, state.quality),
      fadeOut: state.fadeOut,
      sink: sink ? { kind: 'stream', writable: sink.writable } : { kind: 'memory' },
      signal: ctl.signal,
      onProgress: (frac, phase) => set({ progress: { frac, phase } }),
    });
    if (sink) {
      const saved = await sink.finish(true);
      set({ progress: null, savedTo: saved });
      return saved ? { kind: 'saved', name: saved } : null;
    }
    const file = new File([blob!], name, { type: 'video/mp4' });
    set({ progress: null, result: file });
    return { kind: 'file', file };
  } catch (e) {
    await sink?.finish(false).catch(() => undefined);
    set({ progress: null });
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  } finally {
    running = null;
  }
}
export const cancelExport = () => running?.abort();
