import { useSyncExternalStore } from 'react';
import type { Adjustments } from '../engine/adjust';
import { NOT_FOUND, TOO_LONG, closeGap, closeGaps, lift, limitVideos, moveTo, moveToTrack, nudge, reorder, rippleDelete, roll, slide, slip, trim, type Edit, type EditCtx, type Tool } from '../engine/edits';
import { DEFAULT_EDIT, type IgEdit } from '../engine/instagram';
import {
  LAYER_KEY_PROPS,
  countKeys,
  isAnimated,
  layerAt,
  moveKey,
  removeKey,
  setEase,
  setKey,
  shiftKeys,
  splitKeys,
  stopAnimating,
  transformAt,
  valueOf,
  type ClipKeyProp,
  type Ease,
  type KeyEdit,
  type Keyframes,
  type LayerKeyProp,
} from '../engine/keyframes';
import { scaleLayer, type Layer } from '../engine/layers';
import { checkFile, loadImage } from '../engine/photo';
import {
  TRANSITION_LIMITS,
  cutsOf,
  defaultTransition,
  roomFor,
  tidyTransitions,
  type Transition,
  type TransitionKind,
} from '../engine/transitions';
import {
  clampTransform,
  clipLength,
  gaps,
  IDENTITY,
  isIdentity,
  pack,
  presetTransform,
  projectLength,
  V_PHOTO_SECONDS,
  type AudioClip,
  type ClipTransform,
  type Preset,
  type Project,
} from '../engine/timeline';
import { MAIN_VIDEO, MUSIC, addTrack as withNewTrack, defaultTracks, deleteTrack as withoutTrack, lockedReason, moveTrack as withTrackMoved, patchTrack, renameTrack as withTrackRenamed, type Track } from '../engine/tracks';
import { bitrateFor, formatsFor, limitsFor, vFormat, type VFormatId, type VFps, type VKind, type VLimits, type VQuality } from '../engine/videoFormats';
import type { Motion } from '../engine/video';
import { logError } from '../lib/errors';
import { canStreamToDisk, openFileSink } from '../lib/fileSink';
import { isDesktop } from '../platform/desktop';
import type { LayerTools } from './instagram';

/*
 * The video editor's state: tracks (engine/timeline.ts), clips (photos and video files) grouped by picture track in
 * the tracks' order (the main video track first, then the overlay tracks, 203), each track in start order, layers over
 * the whole timeline, music on the music track, the playhead and the export. With Magnetic on
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
  /** The picture track it is on: the main video track or an overlay track (203). */
  track: string;
  /** Where its box sits in the frame (203); missing = the whole frame. */
  tf?: ClipTransform;
  /** Keyframes (205): animated box values and volume, seconds from its start; missing = nothing animated. */
  keys?: Keyframes<ClipKeyProp>;
  /** The transition on the cut at its end, into the clip that starts there (206); missing = a hard cut. */
  transition?: Transition;
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
  /** The selected cut (206): the id of the clip before it, whose transition (if any) the inspector shows. A view
   * setting: not undone, not saved. */
  transitionSel: string | null;
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
  transitionSel: null,
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
const editCtx = (): EditCtx => ({ maxLength: limits().seconds, locked: (track) => lockedReason(state.tracks, track), maxVideos: limits().videosAtOnce, desktop: isDesktop });
/** The state as the track model sees it (engine/timeline.ts): for the preview, the timeline and the export. */
export const projectOf = (s: VState = state): Project<VClip> => ({ tracks: s.tracks, clips: s.clips, audio: musicClips(s.music), layers: s.layers, fadeOut: s.fadeOut });
/** The video's length (a selector: `useVideo(videoLength)`). */
export const videoLength = (s: VState) => projectLength(projectOf(s));
export const total = () => videoLength(state);
export const setPlayhead = (t: number) => set({ t: Math.max(0, Math.min(t, total())) });
export const selectClip = (id: string | null) => set({ selected: id, transitionSel: null });
export const selectVLayer = (id: string | null) => set({ layerSel: id, transitionSel: null });
/** Selects the cut after clip `id` (206), for the Transitions panel and the inspector; a layer selection gives way. */
export const selectTransition = (id: string | null) => set({ transitionSel: id, ...(id ? { layerSel: null } : {}) });
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
    transitionSel: s.clips.some((c) => c.id === state.transitionSel) ? state.transitionSel : null,
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
/**
 * The clips grouped by track in the tracks' order (the main track first, as the document gate returns them), each
 * track's clips in the order they had; the same array when they already are.
 */
function grouped(clips: VClip[], tracks: Track[]): VClip[] {
  const rank = new Map(tracks.map((t, i) => [t.id, i]));
  const of = (c: VClip) => rank.get(c.track) ?? tracks.length;
  if (clips.every((c, i) => i === 0 || of(clips[i - 1]) <= of(c))) return clips;
  return clips.slice().sort((a, b) => of(a) - of(b));
}
/**
 * Every undoable change goes through here; with Magnetic on, changed clips are packed end to end (the one place), and
 * transitions are kept or dropped by their one rule (206 AC-4: `tidyTransitions`), so edits needn't know of them.
 */
function change(key: string, patch: Partial<Snap>, extra: Partial<VState> = {}): void {
  record(key);
  const magnetic = patch.magnetic ?? state.magnetic;
  if (patch.clips && magnetic) patch = { ...patch, clips: pack(patch.clips) };
  if (patch.clips || patch.tracks) patch = { ...patch, clips: grouped(patch.clips ?? state.clips, patch.tracks ?? state.tracks) };
  if (patch.clips) patch = { ...patch, clips: tidyTransitions(patch.clips, state.fps).clips };
  const clips = patch.clips ?? state.clips;
  set({ ...patch, ...flags(), ...extra, t: Math.min(extra.t ?? state.t, lengthOf(clips, patch.tracks, magnetic)) });
}
/**
 * `change` for picture clips the store made itself or took from an edit: refused, with the reason, when what would be
 * stored (packed with Magnetic on) shows more videos at once than this app allows and more than now (203 AC-9).
 */
function commit(key: string, patch: Partial<Snap> & { clips: VClip[] }, extra: Partial<VState> = {}): string | null {
  const clips = (patch.magnetic ?? state.magnetic) ? pack(patch.clips) : patch.clips;
  const r = limitVideos(state.clips, { clips }, editCtx());
  if ('error' in r) return r.error;
  change(key, { ...patch, clips }, extra);
  return null;
}

/**
 * Starts a project from clips already made (tests; opening a saved project goes through mergeProject first): no
 * history, packed when magnetic, else in start order.
 */
export function loadVideoProject(p: { clips: VClip[]; tracks?: Track[]; magnetic?: boolean; music?: VMusic | null; layers?: Layer[] }): void {
  past.length = 0;
  future.length = 0;
  lastKey = '';
  const magnetic = p.magnetic !== false;
  const tracks = p.tracks ?? defaultTracks();
  // Grouped by track, each in start order; with Magnetic on the main track keeps its given order (overlay tracks are
  // never packed, 203 Q8).
  const rank = (c: VClip) => {
    const i = tracks.findIndex((t) => t.id === c.track);
    return i < 0 ? tracks.length : i;
  };
  const sorted = p.clips.slice().sort((a, b) => rank(a) - rank(b) || (magnetic && a.track === MAIN_VIDEO ? 0 : a.start - b.start));
  const clips = magnetic ? pack(sorted) : sorted;
  set({ clips, tracks, magnetic, music: p.music ?? null, layers: p.layers ?? [], layerSel: null, transitionSel: null, selected: clips[0]?.id ?? null, t: 0, ...flags() });
}

/**
 * Magnetic (202, D1): switching it on closes every gap on the main track as one undo step; switching it off changes no
 * clip and isn't recorded. Refused, with the reason, when closing the gaps would show too many videos at once (203).
 */
export function setMagnetic(on: boolean): string | null {
  if (on === state.magnetic) return null;
  if (on) return commit('', { clips: closeGaps(state.clips), magnetic: true });
  set({ magnetic: false });
  return null;
}

/* ---------- tracks ---------- */
/**
 * Hides / mutes / locks a track (one undo step each; Hide is for picture tracks, Mute for sound and overlay tracks:
 * an overlay clip's own sound, 203 Q7).
 */
export function setTrack(id: string, patch: Partial<Pick<Track, 'hidden' | 'muted' | 'locked'>>): void {
  const tracks = patchTrack(state.tracks, id, patch);
  if (tracks !== state.tracks) change('', { tracks });
}
/** Adds an empty overlay track at the top of the picture tracks (203 Q12); at the track limit, why not. */
export function addTrack(): string | null {
  const r = withNewTrack(state.tracks, isDesktop);
  if ('error' in r) return r.error;
  change('', { tracks: r.tracks });
  return null;
}
/** Renames a track (1–40 characters); why not, or null. */
export function renameTrack(id: string, name: string): string | null {
  const r = withTrackRenamed(state.tracks, id, name);
  if ('error' in r) return r.error;
  if (r.tracks !== state.tracks) change('', { tracks: r.tracks });
  return null;
}
/** Moves an overlay track one place up (+1, drawn later) or down among the overlay tracks; why not, or null. */
export function moveTrack(id: string, by: 1 | -1): string | null {
  const r = withTrackMoved(state.tracks, id, by);
  if ('error' in r) return r.error;
  change('', { tracks: r.tracks });
  return null;
}
/** Deletes an overlay track with its clips (the UI asks first when it holds any); why not, or null. */
export function deleteTrack(id: string): string | null {
  const r = withoutTrack(state.tracks, state.clips, id);
  if ('error' in r) return r.error;
  const selected = r.clips.some((c) => c.id === state.selected) ? state.selected : (r.clips[0]?.id ?? null);
  change('', { tracks: r.tracks, clips: r.clips }, { selected });
  return null;
}
/** The picture tracks a clip can be on, bottom (the main track) first. */
export const pictureTracks = (s: VState = state): Track[] => s.tracks.filter((t) => t.kind === 'video' || t.kind === 'overlay');
/** A clip's track and its number on that track from 1 (the inspector's "Clip N" and the timeline's labels), or null. */
export function clipPlace(id: string, s: VState = state): { track: Track; n: number } | null {
  const c = s.clips.find((x) => x.id === id);
  const track = c && s.tracks.find((t) => t.id === c.track);
  return c && track ? { track, n: s.clips.filter((x) => x.track === c.track).indexOf(c) + 1 } : null;
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

/** How addMedia reads files into clips (tests put stand-ins here: Node decodes no media). */
export const mediaIO = { photo: photoClip, video: videoClip, strip: makeStrip };

/** `addMedia`'s track for "a new overlay track first" (files dropped above the top track, 203 Q12). */
export const NEW_TRACK = 'new';
const NOT_PICTURE = 'Photos and videos go on a picture track.';
const endOn = (clips: VClip[], track: string) => clips.reduce((m, c) => (c.track === track ? Math.max(m, c.start + clipLength(c)) : m), 0);
/** The clips with c added in its track's start order (after its track's last clip when it starts last). */
function insertOnTrack(clips: VClip[], c: VClip): VClip[] {
  let i = clips.findIndex((x) => x.track === c.track && x.start > c.start);
  if (i < 0) i = clips.findLastIndex((x) => x.track === c.track) + 1 || clips.length;
  return [...clips.slice(0, i), c, ...clips.slice(i)];
}

/**
 * Adds photos and videos within this project's limits; returns messages. Without options they go at the end of the
 * main track (2.x). On another track (203), or at a time `at`, they go one after another from `at` (default: the
 * playhead), each after the clips there when it doesn't fit; on the main track with Magnetic on they are inserted
 * where `at` falls in the order. `track: NEW_TRACK` adds an overlay track first (one undo step with the clips, and
 * only when a clip is added). A video that would show more videos at once than allowed is left out, with the reason.
 */
export async function addMedia(files: { name: string; blob: Blob; type?: string }[], o: { track?: string; at?: number } = {}): Promise<string[]> {
  const L = limits();
  const msgs: string[] = [];
  let tracks = state.tracks,
    track = o.track ?? MAIN_VIDEO;
  if (track === NEW_TRACK) {
    const r = withNewTrack(state.tracks, isDesktop);
    if ('error' in r) return [r.error];
    tracks = r.tracks;
    track = r.id;
  } else {
    const t = state.tracks.find((x) => x.id === track);
    if (!t || t.kind === 'audio') return [NOT_PICTURE];
    const locked = lockedReason(state.tracks, track);
    if (locked) return [locked];
  }
  // How the clips go in: at the end of the main track; inserted into its order (Magnetic); or each at a time.
  const mode = track === MAIN_VIDEO && (o.at === undefined || state.magnetic) ? (o.at === undefined ? 'append' : 'insert') : 'place';
  set({ busy: 'Adding to the timeline…' });
  const added: VClip[] = [];
  /** The clips with `more` added as `mode` puts them. */
  const withAdded = (more: VClip[]): VClip[] => {
    if (mode === 'append') return [...state.clips, ...more];
    if (mode === 'insert') {
      const main = state.clips.filter((x) => x.track === MAIN_VIDEO);
      const k = main.findIndex((x) => o.at! < x.start + clipLength(x) / 2);
      const i = k < 0 ? state.clips.findLastIndex((x) => x.track === MAIN_VIDEO) + 1 : state.clips.indexOf(main[k]);
      return [...state.clips.slice(0, i), ...more, ...state.clips.slice(i)];
    }
    return more.reduce(insertOnTrack, state.clips);
  };
  // Where the next clip starts: the main track's end (append, insert: the main track grows by its length) or `at`.
  let cursor = mode === 'place' ? Math.max(0, o.at ?? state.t) : endOn(state.clips, MAIN_VIDEO);
  /** The start for a clip of `len` seconds from the cursor: after any clip of the track it would overlap. */
  const fit = (len: number) => {
    let s = cursor;
    for (let hit = true; hit; ) {
      hit = false;
      for (const x of [...state.clips, ...added])
        if (x.track === track && x.start < s + len - 1e-6 && x.start + clipLength(x) > s + 1e-6) {
          s = x.start + clipLength(x);
          hit = true;
        }
    }
    return s;
  };
  let tooMany = false;
  const where = isDesktop ? '' : ' in the browser (the desktop app allows more)';
  const full = () =>
    mode === 'place'
      ? `Clips there would end after ${fmtLimit(L.seconds)}, the most${where}; the rest weren’t added.`
      : `The video is already ${fmtLimit(L.seconds)} long, the most${where}; the rest weren’t added.`;
  for (const f of files) {
    if (state.clips.length + added.length >= L.clips) {
      msgs.push(`A project holds up to ${L.clips} clips${where}; the rest weren’t added.`);
      break;
    }
    if (cursor >= L.seconds - 0.5) {
      msgs.push(full());
      break;
    }
    const type = f.type ?? f.blob.type ?? '';
    const isVideo = VIDEO_TYPES.test(type) || VIDEO_EXT.test(f.name);
    try {
      let c: VClip;
      if (isVideo) {
        if (f.blob.size > L.fileMB * 1048576) {
          msgs.push(`${f.name} is ${(f.blob.size / 1048576).toFixed(0)} MB. Videos up to ${L.fileMB >= 1024 ? `${L.fileMB / 1024} GB` : `${L.fileMB} MB`} can be added${where}.`);
          continue;
        }
        c = await mediaIO.video(f.name, f.blob);
      } else {
        const why = checkFile(new File([f.blob], f.name, { type }));
        if (why) {
          msgs.push(why);
          continue;
        }
        c = await mediaIO.photo(f.name, f.blob);
      }
      const start = mode === 'place' ? fit(clipLength(c)) : cursor;
      if (start >= L.seconds - 0.5) {
        URL.revokeObjectURL(c.url);
        msgs.push(full());
        break;
      }
      const room = L.seconds - start;
      if (c.kind === 'video' && c.out - c.in > room) {
        c.out = c.in + room;
        msgs.push(`${f.name} was trimmed to ${fmtLimit(room)} to keep the video within ${fmtLimit(L.seconds)}${where}.`);
      }
      if (c.kind === 'photo') c.dur = Math.min(c.dur, Math.max(0.5, room));
      c.track = track;
      c.start = start;
      const clips = withAdded([...added, c]);
      const r = limitVideos(state.clips, { clips: state.magnetic ? pack(clips) : clips }, editCtx());
      if ('error' in r) {
        URL.revokeObjectURL(c.url);
        if (!tooMany) msgs.push(`${f.name} wasn’t added. ${r.error}`);
        tooMany = true;
        continue;
      }
      added.push(c);
      cursor = start + clipLength(c);
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
    change('', { tracks, clips: withAdded(added) }, { selected: state.selected ?? added[0].id });
    for (const c of added) if (c.kind === 'video') void mediaIO.strip(c.id, c.url, c.srcDur);
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
  return updateClipWhy(id, patch, key) === null;
}
/**
 * Changes a clip as updateClip does, saying why when it can't.
 * @param id the clip
 * @param patch the fields to change
 * @param key groups changes into one undo step (a slider's drag)
 * @returns null once changed; else why not: its track is locked, the video would be longer than this platform's
 *   limit, or the change would put more videos on screen at once than allowed
 */
export function updateClipWhy(id: string, patch: Partial<VClip>, key = `clip:${id}:${Object.keys(patch).sort().join(',')}`): string | null {
  const locked = clipLocked(id);
  if (locked) return locked;
  const clips = state.clips.map((c) => (c.id === id ? { ...c, ...patch } : c));
  const maxSeconds = limits().seconds;
  if (lengthOf(clips) - maxSeconds > 0.01) return `A video can be up to ${fmtLimit(maxSeconds)} long here.`;
  return commit(key, { clips });
}
export const editClip = (id: string, patch: Partial<IgEdit>) => {
  const c = state.clips.find((x) => x.id === id);
  if (c) updateClip(id, { edit: { ...c.edit, ...patch } }, `clipedit:${id}:${Object.keys(patch).sort().join(',')}`);
};
export const adjustClip = (id: string, patch: Partial<Adjustments>) => {
  const c = state.clips.find((x) => x.id === id);
  if (c) updateClip(id, { edit: { ...c.edit, adjust: { ...c.edit.adjust, ...patch } } }, `clipadjust:${id}:${Object.keys(patch).sort().join(',')}`);
};

/*
 * Clip actions are refused (false) on a locked track; `clipLocked` says why. The `…Why` forms return the message to
 * show instead (null when done).
 */
export function removeClip(id: string): boolean {
  const i = state.clips.findIndex((c) => c.id === id);
  if (i < 0 || clipLocked(id)) return false;
  // The object URL is kept while the clip can still come back through undo; it goes when the page closes. Only the
  // main track is magnetic: an overlay clip is lifted even with Magnetic on (203 Q8).
  const ripple = state.magnetic && state.clips[i].track === MAIN_VIDEO;
  const r = (ripple ? rippleDelete : lift)(state.clips, id, editCtx());
  if ('error' in r) return false;
  const clips = r.clips;
  return commit('', { clips }, { selected: state.selected === id ? (clips[Math.min(i, clips.length - 1)]?.id ?? null) : state.selected }) === null;
}

/** Moves a clip one place earlier or later among its track's clips (the main track with Magnetic on). */
export function moveClip(id: string, by: -1 | 1): boolean {
  const c = state.clips.find((x) => x.id === id);
  const i = state.clips.filter((x) => x.track === c?.track).findIndex((x) => x.id === id);
  return moveClipTo(id, i + by);
}
/** Moves a main-track clip to a new place in its track's order (dragging on the timeline). */
export function moveClipTo(id: string, index: number): boolean {
  if (clipLocked(id)) return false;
  const r = reorder(state.clips, id, index, editCtx());
  if ('error' in r || r.clips === state.clips) return false;
  return commit('', { clips: r.clips }) === null;
}

export const duplicateClip = (id: string): boolean => duplicateClipWhy(id) === null;
/**
 * A copy of a clip right after it (Magnetic on, the main track), else (D2; overlay tracks always) into the first gap
 * after the original that fits, or after its track's last clip; nothing else moves.
 */
export function duplicateClipWhy(id: string): string | null {
  const i = state.clips.findIndex((c) => c.id === id);
  const c = state.clips[i];
  if (!c) return NOT_FOUND;
  const L = limits();
  const locked = clipLocked(id);
  if (locked) return locked;
  if (state.clips.length >= L.clips) return `A project holds up to ${L.clips} clips${isDesktop ? '' : ' in the browser (the desktop app allows more)'}.`;
  const copy: VClip = { ...c, id: newId(), fade: false, start: c.start + clipLength(c) };
  let clips: VClip[];
  if (state.magnetic && c.track === MAIN_VIDEO) {
    if (total() + clipLength(c) > L.seconds) return TOO_LONG;
    clips = state.clips.slice();
    clips.splice(i + 1, 0, copy);
  } else {
    const len = clipLength(c);
    const end = endOn(state.clips, c.track);
    const room = gaps(projectOf(), c.track).find((g) => g.start >= copy.start - 1e-9 && g.end - g.start >= len - 1e-6);
    copy.start = room ? room.start : end;
    // The main track keeps 202's check (the video grows by the copy at most); elsewhere the copy's own end counts.
    if (c.track === MAIN_VIDEO ? total() + len > L.seconds : Math.max(total(), copy.start + len) > L.seconds + 0.01) return TOO_LONG;
    clips = insertOnTrack(state.clips, copy);
  }
  return commit('', { clips }, { selected: copy.id });
}

export const splitAtPlayhead = (): boolean => splitAtPlayheadWhy() === null;
/**
 * Splits the clip under the playhead into two clips (not on a locked track): the selected clip when the playhead is
 * inside it (an overlay clip, 203), else the main track's clip there, else the topmost overlay clip there.
 */
export function splitAtPlayheadWhy(): string | null {
  const inside = (c: VClip) => state.t > c.start + 0.2 && state.t < c.start + clipLength(c) - 0.2;
  const sel = state.clips.find((c) => c.id === state.selected && inside(c));
  const c = sel ?? state.clips.filter(inside).sort((a, b) => trackRank(a) - trackRank(b))[0];
  if (!c) return 'Put the playhead inside a clip, away from its ends, to split it.';
  const locked = clipLocked(c.id);
  if (locked) return locked;
  const len = clipLength(c),
    t0 = c.start,
    local = state.t - t0;
  // Each part keeps its keyframes, with one at the cut holding the value there (205 AC-3).
  const [keysA, keysB] = splitKeys(c.keys, local);
  const keys = (k: VClip['keys']) => (c.keys ? { keys: k } : {});
  // The clip's own transition (206) is at its end: it goes with the right part.
  const { transition, ...left } = c;
  const outgoing = transition ? { transition } : {};
  const a: VClip = c.kind === 'video' ? { ...left, out: c.in + local, ...keys(keysA) } : { ...left, dur: local, ...keys(keysA) };
  const b: VClip =
    c.kind === 'video'
      ? { ...left, id: newId(), start: t0 + local, in: c.in + local, fade: false, ...keys(keysB), ...outgoing }
      : { ...left, id: newId(), start: t0 + local, dur: len - local, fade: false, ...keys(keysB), ...outgoing };
  const clips = state.clips.slice();
  clips.splice(state.clips.indexOf(c), 1, a, b);
  return commit('', { clips }, { selected: b.id });
}
/** The main track first (0), then the overlay tracks from the top one down: which clip a split takes. */
const trackRank = (c: VClip) => (c.track === MAIN_VIDEO ? 0 : state.tracks.length - state.tracks.findIndex((t) => t.id === c.track));

/* ---------- edit tools (202): each returns null, or why it was refused ---------- */

/**
 * Applies an edit's result as one undo step (`key` coalesces a drag); nothing is recorded when nothing changed.
 * Checked again on what is stored (packed with Magnetic on) against the videos-at-once limit.
 */
function apply(r: Edit<VClip>, key = '', extra: Partial<VState> = {}): string | null {
  if ('error' in r) return r.error;
  return r.clips === state.clips ? null : commit(key, { clips: r.clips }, extra);
}
/** Shift + Delete: removes a clip and pulls the later ones on its track back, with Magnetic on or off. */
export function rippleDeleteClip(id: string): string | null {
  const track = state.clips.find((c) => c.id === id)?.track;
  const i = state.clips.filter((c) => c.track === track).findIndex((c) => c.id === id);
  const r = rippleDelete(state.clips, id, editCtx());
  const left = 'clips' in r ? r.clips.filter((c) => c.track === track) : [];
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
/**
 * Moves a clip to another picture track (or along its own) at `start` (default: where it is), as moveToTrack does
 * (203 AC-3): never over another clip; onto the main track with Magnetic on, inserted where it falls.
 */
export function moveClipToTrack(id: string, track: string, start?: number, key = ''): string | null {
  const c = state.clips.find((x) => x.id === id);
  if (!c) return NOT_FOUND;
  const t = state.tracks.find((x) => x.id === track);
  if (!t || (t.kind !== 'video' && t.kind !== 'overlay')) return 'A clip can only move to a picture track.';
  return apply(moveToTrack(state.clips, id, track, start ?? c.start, { ...editCtx(), magnetic: state.magnetic }), key, { selected: id });
}

/* ---------- a clip's place in the frame (203) ---------- */
/**
 * Changes a clip's box (position, size, rotation, opacity, corner radius), clamped to their ranges; one undo step
 * per `key` within 800 ms, so a drag passing the same key is one step. The whole frame is stored as no transform.
 */
export function setClipTransform(id: string, patch: Partial<ClipTransform>, key = `tf:${id}:${Object.keys(patch).sort().join(',')}`): string | null {
  const c = state.clips.find((x) => x.id === id);
  if (!c) return NOT_FOUND;
  const locked = clipLocked(id);
  if (locked) return locked;
  const tf = clampTransform({ ...(c.tf ?? IDENTITY), ...patch });
  const next = isIdentity(tf) ? undefined : tf;
  const same = isIdentity(c.tf) ? !next : !!next && (Object.keys(tf) as (keyof ClipTransform)[]).every((k) => c.tf![k] === tf[k]);
  if (same) return null;
  change(key, { clips: state.clips.map((x) => (x.id === id ? { ...x, tf: next } : x)) });
  return null;
}
/**
 * Puts a clip's box full frame or in a corner (35 % of the frame width, 4 % margin; Q4) of this project's frame,
 * upright; its opacity and corner radius stay (one undo step).
 */
export function applyPreset(id: string, preset: Preset): string | null {
  const f = vFormat(state.format);
  const { x, y, w, rot } = presetTransform(preset, f.w, f.h);
  // Through the router: an animated value gets a key at the playhead (205).
  return setClipTransformAt(id, { x, y, w, rot }, '');
}
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

/* ---------- keyframes (205): each returns null, or why it was refused ---------- */

/** What a keyframe action works on: a clip or a layer, by id. Times are the playhead's, or a key's own (`at`). */
export type KeyTarget = { clip: string } | { layer: string };
/** A clip's or a layer's animatable value. */
export type KeyProp = ClipKeyProp | LayerKeyProp;

const LAYER_GONE = 'That layer isn’t in the video any more.';

/** Every keyframe in the project now (the 5,000 limit, Q5). */
const projectKeyCount = (): number =>
  state.clips.reduce((n, c) => n + countKeys(c.keys), 0) + state.layers.reduce((n, l) => n + countKeys(l.keys), 0);

/** A clip's or a layer's keys, typed loosely: actions name values of either. */
const keysOf = (item: VClip | Layer): Keyframes<KeyProp> | undefined => item.keys as Keyframes<KeyProp> | undefined;

/** How a key edit on `item` is checked: its ranges, the project's frame rate and key count. */
const keyEdit = (item: VClip | Layer): KeyEdit => ({ on: 'track' in item ? 'clip' : 'layer', fps: state.fps, projectKeys: projectKeyCount() });

/** The item a target names and its time at the playhead (seconds from its start); or why it can't change. */
function keyItem(target: KeyTarget): { item: VClip | Layer; local: number } | { error: string } {
  if ('clip' in target) {
    const clip = state.clips.find((c) => c.id === target.clip);
    if (!clip) return { error: NOT_FOUND };
    const locked = clipLocked(clip.id);
    if (locked) return { error: locked };
    return { item: clip, local: state.t - clip.start };
  }
  const layer = state.layers.find((l) => l.id === target.layer);
  return layer ? { item: layer, local: state.t - (layer.start ?? 0) } : { error: LAYER_GONE };
}

/** Stores the target's changed fields as one undo step (`key` coalesces a drag). */
function storeItem(target: KeyTarget, patch: Partial<VClip> | Partial<Layer>, key: string): null {
  if ('clip' in target) change(key, { clips: state.clips.map((c) => (c.id === target.clip ? { ...c, ...(patch as Partial<VClip>) } : c)) });
  else change(key, { layers: state.layers.map((l) => (l.id === target.layer ? ({ ...l, ...patch } as Layer) : l)) });
  return null;
}

/** Remove animation's fields for `prop` at `local` (its value there becomes the stored one; the whole frame as no box). */
function stoppedAt(item: VClip | Layer, prop: KeyProp, local: number): Partial<VClip> | Partial<Layer> {
  if (!('track' in item)) return stopAnimating(item, prop as LayerKeyProp, local);
  const patch = stopAnimating(item, prop as ClipKeyProp, local);
  return 'tf' in patch && isIdentity(patch.tf) ? { ...patch, tf: undefined } : patch;
}

/** `item` without `prop`'s key at `at`: its last key going stops the animation at that key's value, so nothing jumps. */
function withoutKey<T extends VClip | Layer>(item: T, prop: KeyProp, at: number): T {
  const list = keysOf(item)?.[prop] ?? [];
  const key = list.find((k) => Math.abs(k.t - at) < 0.5 / state.fps);
  if (!key) return item;
  if (list.length === 1) return { ...item, ...stoppedAt(item, prop, key.t) };
  return { ...item, keys: removeKey(keysOf(item)!, prop, at, state.fps) };
}

/**
 * The inspector's keyframe button (Q4): starts animating the value(s) with a key at the playhead holding their value
 * there, adds a key there, or (at a key) removes it. Several values (a layer's position: X and Y) go together, as the
 * first one is. One undo step.
 */
export function toggleKey(target: KeyTarget, props: KeyProp | KeyProp[]): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  const { item, local } = found;
  const names = Array.isArray(props) ? props : [props];
  if (keysOf(item)?.[names[0]]?.some((k) => Math.abs(k.t - local) < 0.5 / state.fps)) {
    let next = item;
    for (const name of names) next = withoutKey(next, name, local);
    return storeItem(target, next, '');
  }
  let keys = keysOf(item);
  for (const name of names) {
    const added = setKey(keys, name, local, valueOf(item, name, local), { ...keyEdit(item), projectKeys: projectKeyCount() + countKeys(keys) - countKeys(keysOf(item)) });
    if ('error' in added) return added.error;
    keys = added;
  }
  return storeItem(target, { keys } as Partial<VClip>, '');
}

/** **Remove animation** (the keyframe button's menu): the values' keys go, their values at the playhead stay. One step. */
export function removeAnimation(target: KeyTarget, props: KeyProp | KeyProp[]): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  let item: VClip | Layer = found.item;
  for (const name of Array.isArray(props) ? props : [props]) if (isAnimated(item, name)) item = { ...item, ...stoppedAt(item, name, found.local) } as VClip | Layer;
  return item === found.item ? null : storeItem(target, item, '');
}

/** Moves the key at `from` (one value's, or every value's for 'all') to `to`, item times; a drag passes one `key`. */
export function moveKeys(target: KeyTarget, prop: KeyProp | 'all', from: number, to: number, key = ''): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  const keys = keysOf(found.item);
  const next = keys && moveKey(keys, prop, from, to, state.fps);
  return next === keys ? null : storeItem(target, { keys: next } as Partial<VClip>, key);
}

/** Sets the interpolation of the key at `at` (one value's, or every value's for 'all'). One undo step. */
export function setKeyEase(target: KeyTarget, prop: KeyProp | 'all', at: number, ease: Ease): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  const keys = keysOf(found.item);
  const next = keys && setEase(keys, prop, at, ease, state.fps);
  return next === keys ? null : storeItem(target, { keys: next } as Partial<VClip>, '');
}

/** Deletes the key at `at` (one value's, or every value's for 'all'); a value's last key keeps its value. One step. */
export function deleteKeys(target: KeyTarget, prop: KeyProp | 'all', at: number): string | null {
  const found = keyItem(target);
  if ('error' in found) return found.error;
  let item = found.item;
  for (const name of prop === 'all' ? (Object.keys(keysOf(item) ?? {}) as KeyProp[]) : [prop]) item = withoutKey(item, name, at);
  return item === found.item ? null : storeItem(target, item, '');
}

/**
 * Changes a clip's box as shown at the playhead (the stage's drag and arrows, the inspector's fields): an animated value
 * gets a key at the playhead (Q4, auto-key), the others change the stored box as `setClipTransform` does. One undo
 * step per `key`.
 */
export function setClipTransformAt(id: string, patch: Partial<ClipTransform>, key = `tf:${id}:${Object.keys(patch).sort().join(',')}`): string | null {
  const found = keyItem({ clip: id });
  if ('error' in found) return found.error;
  const c = found.item as VClip;
  if (!c.keys) return setClipTransform(id, patch, key);
  const shown = transformAt(c, found.local);
  const want = clampTransform({ ...shown, ...patch });
  let keys: Keyframes<ClipKeyProp> = c.keys;
  const stored: Partial<ClipTransform> = {};
  for (const prop of Object.keys(patch) as (keyof ClipTransform)[]) {
    if (!(prop in want) || want[prop] === shown[prop]) continue;
    if (!isAnimated(c, prop)) {
      stored[prop] = want[prop];
      continue;
    }
    const next = setKey(keys, prop, found.local, want[prop], { ...keyEdit(c), projectKeys: projectKeyCount() + countKeys(keys) - countKeys(c.keys) });
    if ('error' in next) return next.error;
    keys = next;
  }
  if (keys === c.keys && Object.keys(stored).length === 0) return null;
  const tf = clampTransform({ ...(c.tf ?? IDENTITY), ...stored });
  change(key, { clips: state.clips.map((x) => (x.id === id ? { ...x, tf: isIdentity(tf) ? undefined : tf, keys } : x)) });
  return null;
}

/** A clip's own sound: a key at the playhead when its volume is animated, else the stored volume. One step per `key`. */
export function setClipVolume(id: string, volume: number, key = `clip:${id}:volume`): string | null {
  const found = keyItem({ clip: id });
  if ('error' in found) return found.error;
  const c = found.item as VClip;
  if (!isAnimated(c, 'volume')) return updateClipWhy(id, { volume }, key);
  const keys = setKey(c.keys, 'volume', found.local, volume, keyEdit(c));
  if ('error' in keys) return keys.error;
  change(key, { clips: state.clips.map((x) => (x.id === id ? { ...x, keys } : x)) });
  return null;
}

/**
 * Changes a layer as shown at the playhead (`patch`, or a function of the shown layer): animated values get a key at
 * the playhead, the rest change the layer, as `updateVLayer` does. One undo step per `key`.
 */
export function updateLayerAt(id: string, patch: Partial<Layer> | ((shown: Layer) => Layer), key = `layer:${id}`): string | null {
  const l = state.layers.find((x) => x.id === id);
  if (!l) return LAYER_GONE;
  if (!l.keys) {
    updateVLayer(id, patch, key);
    return null;
  }
  const local = state.t - (l.start ?? 0);
  const shown = layerAt(l, state.t);
  const next = typeof patch === 'function' ? patch(shown) : ({ ...shown, ...patch } as Layer);
  let keys: Keyframes<LayerKeyProp> = l.keys;
  // An animated size scales the whole layer when drawn (layerAt): scaled back to the stored size, what scales with it
  // (a title's font size, a shape's height) is stored as it would be at that size, so it doesn't drift.
  const out = (isAnimated(l, 'w') && next.w !== l.w ? scaleLayer(next, l.w / next.w) : { ...next }) as Layer;
  for (const prop of LAYER_KEY_PROPS) {
    if (!isAnimated(l, prop)) continue;
    out[prop] = l[prop];
    if (next[prop] === shown[prop]) continue;
    const r = setKey(keys, prop, local, next[prop], { ...keyEdit(l), projectKeys: projectKeyCount() + countKeys(keys) - countKeys(l.keys) });
    if ('error' in r) return r.error;
    keys = r;
  }
  out.keys = keys;
  change(key, { layers: state.layers.map((x) => (x.id === id ? out : x)) });
  return null;
}

/**
 * Sets when a layer shows (the timeline's layer bar). `start` alone is its start edge: its keys shift back by the
 * move, so they stay at their place on the timeline (AC-3); `start` with `end` moves it whole, keys and all.
 */
export function setLayerTimes(id: string, times: { start?: number; end?: number | undefined }, key = ''): string | null {
  const l = state.layers.find((x) => x.id === id);
  if (!l) return LAYER_GONE;
  const edge = times.start !== undefined && !('end' in times) ? times.start - (l.start ?? 0) : 0;
  const keys = edge ? shiftKeys(l.keys, -edge) : l.keys;
  change(key, { layers: state.layers.map((x) => (x.id === id ? ({ ...x, ...times, ...(l.keys ? { keys } : {}) } as Layer) : x)) });
  return null;
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

/* ---------- Transitions (206 plan §5): each one undo step, returning why it was refused ---------- */

const NO_CUT = 'A transition goes on a cut between two clips that touch: this clip has no clip right after it on its track.';
const NO_ROOM = 'These clips are too short for a transition (it needs at least 0.1 s, half on each side).';

/** The clip right after `clip` on its track, touching it: the other side of its cut. */
const nextOnTrack = (clip: VClip): VClip | undefined => cutsOf(state.clips, clip.track).find(([before]) => before.id === clip.id)?.[1];

/**
 * Adds a transition on the cut at the end of clip `id` (a 0.5 s cross-dissolve unless `patch` says otherwise), or
 * changes the one there: a new kind brings that kind's options (a wipe goes left, a dip to black) unless given; a length
 * is held to 0.1 s and to the room the two clips leave (`roomFor`). Refused, recording nothing, with no clip touching it
 * after it, too little room, on a locked track, or when it would show more videos at once than this app allows (Q7).
 * @param id the outgoing clip
 * @param patch what to set: kind, length, direction, colour
 * @param key groups a drag's changes into one undo step
 */
export function setTransition(id: string, patch: Partial<Omit<Transition, 'to'>>, key = ''): string | null {
  const clip = state.clips.find((c) => c.id === id);
  if (!clip) return NOT_FOUND;
  const locked = clipLocked(id);
  if (locked) return locked;
  const next = nextOnTrack(clip);
  if (!next) return NO_CUT;
  const room = roomFor(clip, next, state.clips);
  if (room < TRANSITION_LIMITS.min - 1e-9) return NO_ROOM;
  const current = clip.transition?.to === next.id ? clip.transition : undefined;
  const kind: TransitionKind = patch.kind ?? current?.kind ?? 'dissolve';
  // A new kind starts from its own defaults (its options), keeping the length.
  const base: Transition = current && current.kind === kind ? current : { ...defaultTransition(kind, next.id), ...(current ? { dur: current.dur } : {}) };
  const { kind: _kind, ...options } = patch;
  const wanted: Transition = { ...base, ...options, kind, to: next.id };
  const transition: Transition = { ...wanted, dur: Math.min(room, Math.max(TRANSITION_LIMITS.min, wanted.dur)) };
  return commit(key, { clips: state.clips.map((c) => (c.id === id ? { ...c, transition } : c)) });
}

/** Removes the transition at the end of clip `id` (a hard cut again); nothing to undo when there is none. */
export function removeTransition(id: string): string | null {
  const clip = state.clips.find((c) => c.id === id);
  if (!clip) return NOT_FOUND;
  if (!clip.transition) return null;
  const locked = clipLocked(id);
  if (locked) return locked;
  const { transition: _gone, ...hardCut } = clip;
  change('', { clips: state.clips.map((c) => (c.id === id ? (hardCut as VClip) : c)) });
  return null;
}

/**
 * **Apply to every cut** (the Transitions panel): a 0.5 s transition of `kind` on every cut of the track, replacing
 * the ones there; where the clips leave less room it is shortened, and where there is none it is left out. One step.
 */
export function transitionEveryCut(track: string, kind: TransitionKind): string | null {
  const locked = lockedReason(state.tracks, track);
  if (locked) return locked;
  const cuts = cutsOf(state.clips, track);
  if (!cuts.length) return 'This track has no cuts between touching clips to put a transition on.';
  const into = new Map(cuts.map(([before, after]) => [before.id, after.id]));
  return commit('', { clips: state.clips.map((c) => (into.has(c.id) ? { ...c, transition: defaultTransition(kind, into.get(c.id)!) } : c)) });
}
