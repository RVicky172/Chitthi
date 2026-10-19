import { useSyncExternalStore } from 'react';
import type { MixMeasure } from '../engine/exportSound';
import { LOUDNESS_PRESETS } from '../engine/loudnessTargets';
import { closeGaps, limitVideos, type EditCtx, type Tool } from '../engine/edits';
import type { IgEdit } from '../engine/instagram';
import type { ClipKeyProp, Keyframes } from '../engine/keyframes';
import type { Layer } from '../engine/layers';
import type { MediaFile } from '../engine/mediaFile';
import type { SpeedFields } from '../engine/speed';
import { tidyTransitions, type Transition } from '../engine/transitions';
import { pack, projectLength, type AudioClip, type ClipTransform, type Project } from '../engine/timeline';
import { MAIN_VIDEO, MUSIC, defaultTracks, lockedReason, type Track, type TrackHeight } from '../engine/tracks';
import { formatsFor, limitsFor, type VFormatId, type VFps, type VKind, type VLimits, type VQuality } from '../engine/videoFormats';
import type { Motion } from '../engine/video';
import { isDesktop } from '../platform/desktop';
import type { LayerTools } from './instagram';

/*
 * The video editor's store: tracks (engine/timeline.ts), clips (photos and video files) grouped by picture track in
 * the tracks' order (the main video track first, then the overlay tracks, 203), each track in start order, layers over
 * the whole timeline, music on the music track, the playhead and the export. With Magnetic on (the default) every
 * change to the clips packs them end to end (`pack`), so each clip's `start` is where 2.x placed it; with it off clips
 * keep their times and gaps (202). One project at a time, made as a Reel / Short (vertical) or a YouTube video (16:9);
 * switching between them keeps the clips and changes the frame. Undo covers the tracks, clips, layers and Magnetic.
 * The project lasts for this session.
 *
 * This module holds the state, its history and the one path for undoable changes (`change`, `commit`); the actions
 * are in videoTracks, videoClips, videoBox, videoKeys, videoLayers, videoTransitions, videoMedia and videoExportJob.
 */

/** A photo or video on a picture track; a video may play at a speed, reversed, ramped or frozen (207). */
export interface VClip extends SpeedFields {
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
  /** The file (408 §5): a Blob, or disk media on desktop; read through engine/mediaFile.ts. */
  file: MediaFile;
  /** The file's URL for <video> playback and thumbnails: an object URL, or chitthi-media:// for disk media. */
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

/** A sound clip in the store (208 D1): the clip, its file and the file's object URL (its media id, D-053). */
export interface VSound extends AudioClip {
  file: MediaFile;
  url: string;
}

/** A track's height on the timeline (engine/tracks.ts). */
export type { TrackHeight } from '../engine/tracks';

/** Export progress (0–1) and what it is doing. */
export interface ExportProgress {
  frac: number;
  phase: string;
}

/** The video editor's whole state. */
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
  /** The selected sound clip (208): it wins over a selected clip, as a layer does. A view setting. */
  soundSel: string | null;
  tools: LayerTools;
  /** The sound clips on the audio tracks (208), in start order. */
  sounds: VSound[];
  /** The export's loudness target, LUFS, or Off (208 AC-8). */
  loudness: 'off' | number;
  /** The mix's last loudness measurement (208 AC-9; the export reuses it while its key is the mix's). Not saved. */
  measure: MixMeasure | null;
  /** A measurement is under way: `measure` is out of date. */
  measuring: boolean;
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
  /** Export progress, while exporting. */
  progress: ExportProgress | null;
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
  soundSel: null,
  tools: { tool: 'select', brush: 'marker', brushColor: '#ffffff', brushScale: 1 },
  sounds: [],
  // New projects aim at YouTube's and Instagram's −14 LUFS (Q12).
  loudness: LOUDNESS_PRESETS.youtube,
  measure: null,
  measuring: false,
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
/** Fields whose changes leave the last export current (view settings and the export's own state). */
const PURE = ['selected', 'layerSel', 'soundSel', 'tools', 'tool', 'snapping', 'trackView', 't', 'zoom', 'playing', 'busy', 'progress', 'result', 'savedTo', 'canUndo', 'canRedo', 'measure', 'measuring'];

/**
 * Changes the state (not recorded for undo) and tells the subscribers.
 * @param patch the fields to change
 */
export function setVideo(patch: Partial<VState>): void {
  // Anything that changes the video makes the last export stale.
  const stale = Object.keys(patch).some((key) => !PURE.includes(key));
  state = { ...state, ...(stale ? { result: null, savedTo: null } : {}), ...patch };
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * Listens to the store (outside React: the background loudness measurement).
 * @param listener called after every change
 * @returns the unsubscribe function
 */
export function subscribeVideo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The current state.
 * @returns it (replaced, never changed in place, on every change)
 */
export const getVideo = (): VState => state;

/**
 * A React hook: part of the state, re-rendering when it changes.
 * @param select picks the part
 * @returns the part
 */
export function useVideo<T>(select: (video: VState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => select(state),
    () => select(state),
  );
}

/**
 * This project's limits in this app (browser or desktop).
 * @param kind a Reel / Short or a YouTube video
 * @returns the limits
 */
export const limits = (kind: VKind = state.kind): VLimits => limitsFor(kind, isDesktop);

/**
 * The video's length with these clips (packed first when magnetic, as every change then does).
 * @param clips the clips
 * @param tracks the tracks
 * @param magnetic whether Magnetic is on
 * @returns seconds
 */
export const lengthOf = (clips: VClip[], tracks: Track[] = state.tracks, magnetic = state.magnetic): number =>
  projectLength({ tracks, clips: magnetic ? pack(clips) : clips, audio: [], layers: [], fadeOut: false });

/**
 * What the edit operations need to know (engine/edits.ts).
 * @returns the limits, locks and app
 */
export const editCtx = (): EditCtx => ({ maxLength: limits().seconds, locked: (track) => lockedReason(state.tracks, track), maxVideos: limits().videosAtOnce, desktop: isDesktop });

/**
 * The state as the track model sees it (engine/timeline.ts): for the preview, the timeline and the export.
 * @param video the state
 * @returns the project
 */
export const projectOf = (video: VState = state): Project<VClip> & { audio: VSound[] } => ({ tracks: video.tracks, clips: video.clips, audio: video.sounds, layers: video.layers, fadeOut: video.fadeOut });

/**
 * The video's length (a selector: `useVideo(videoLength)`).
 * @param video the state
 * @returns seconds
 */
export const videoLength = (video: VState): number => projectLength(projectOf(video));

/**
 * The current video's length.
 * @returns seconds
 */
export const total = (): number => videoLength(state);

/**
 * Moves the playhead, within the video.
 * @param seconds the time
 */
export const setPlayhead = (seconds: number): void => {
  setVideo({ t: Math.max(0, Math.min(seconds, total())) });
};

/**
 * Selects a clip (and no cut).
 * @param id the clip, or null
 */
export const selectClip = (id: string | null): void => {
  setVideo({ selected: id, transitionSel: null, ...(id ? { soundSel: null } : {}) });
};

/**
 * Selects a layer (and no cut).
 * @param id the layer, or null
 */
export const selectVLayer = (id: string | null): void => {
  setVideo({ layerSel: id, transitionSel: null, ...(id ? { soundSel: null } : {}) });
};

/**
 * Selects a sound clip (208); a layer and a cut give way.
 * @param id the sound clip, or null
 */
export const selectSound = (id: string | null): void => {
  setVideo({ soundSel: id, ...(id ? { layerSel: null, transitionSel: null } : {}) });
};

/**
 * Selects the cut after a clip (206), for the Transitions panel and the inspector; a layer selection gives way.
 * @param id the clip before the cut, or null
 */
export const selectTransition = (id: string | null): void => {
  setVideo({ transitionSel: id, ...(id ? { layerSel: null } : {}) });
};

/**
 * Changes the layer tools (tool, brush, colour).
 * @param patch the settings to change
 */
export const setVTools = (patch: Partial<LayerTools>): void => {
  setVideo({ tools: { ...state.tools, ...patch } });
};

/**
 * Plays or pauses (never plays an empty video).
 * @param playing play
 */
export const setPlaying = (playing: boolean): void => {
  setVideo({ playing: playing && state.clips.length > 0 });
};

/**
 * Zooms the timeline.
 * @param zoom pixels per second, kept to 4–400
 */
export const setZoom = (zoom: number): void => {
  setVideo({ zoom: Math.max(4, Math.min(400, zoom)) });
};

/**
 * Chooses the timeline's edit tool.
 * @param tool the tool
 */
export const setTool = (tool: Tool): void => {
  setVideo({ tool });
};

/**
 * Turns snapping on or off.
 * @param snapping on
 */
export const setSnapping = (snapping: boolean): void => {
  setVideo({ snapping });
};

/**
 * Changes the export options.
 * @param patch format, fade out, quality or frame rate
 */
export const setVideoOptions = (patch: Partial<Pick<VState, 'format' | 'fadeOut' | 'quality' | 'fps'>>): void => {
  setVideo(patch);
};

/**
 * Switches between a Reel / Short and a YouTube video: the clips stay, the frame and limits change.
 * @param kind the kind of video
 */
export function setKind(kind: VKind): void {
  if (kind === state.kind) return;
  const format = formatsFor(kind).at(0);
  if (!format) return;
  const fps = limits(kind).fps.includes(state.fps) ? state.fps : 30;
  setVideo({ kind, format: format.id, fps });
}

/**
 * Why the music can't be changed (its track is locked).
 * @returns the reason, or null
 */
export const musicLocked = (): string | null => lockedReason(state.tracks, MUSIC);

/**
 * Why a clip can't be changed (its track is locked).
 * @param id the clip
 * @returns the reason, or null
 */
export const clipLocked = (id: string): string | null => {
  const clip = state.clips.find((candidate) => candidate.id === id);
  return clip ? lockedReason(state.tracks, clip.track) : null;
};

let idCount = 0;

/**
 * A new clip id.
 * @returns "v", the time and a counter
 */
export const newId = (): string => `v${Date.now().toString(36)}${(idCount++).toString(36)}`;

/**
 * A limit in words. Whole minutes only: 90 s stays "90 seconds" rather than rounding up to a limit the editor doesn't
 * allow.
 * @param seconds the limit
 * @returns e.g. "90 seconds", "3 minutes", "1.5 hours"
 */
export function limitText(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(seconds % 3600 ? 1 : 0)} hours`;
  if (seconds >= 60 && seconds % 60 === 0) return seconds === 60 ? '1 minute' : `${seconds / 60} minutes`;
  return `${Math.round(seconds)} seconds`;
}

/**
 * Where the browser's limits are lower than the desktop app's, said after a limit.
 * @returns '' on desktop, else " in the browser (the desktop app allows more)"
 */
export const browserNote = (): string => (isDesktop ? '' : ' in the browser (the desktop app allows more)');

/* ---------- undo / redo (tracks, clips, layers and Magnetic) ---------- */

/** What undo restores. */
export interface Snap {
  tracks: Track[];
  clips: VClip[];
  layers: Layer[];
  /** With the clips, so undoing a gap close brings back the gaps with Magnetic off (D1). */
  magnetic: boolean;
  /** The sound clips (208). */
  sounds: VSound[];
  /** The loudness target (208 AC-10: undone like any edit). */
  loudness: 'off' | number;
}

const past: Snap[] = [];
const future: Snap[] = [];
let lastKey = '';
let lastAt = 0;

/**
 * The undoable part of the state now.
 * @returns a snapshot
 */
const snapshot = (): Snap => ({ tracks: state.tracks, clips: state.clips, layers: state.layers, magnetic: state.magnetic, sounds: state.sounds, loudness: state.loudness });

/**
 * Records an undo step, unless it continues the last one (the same key within 800 ms: a drag).
 * @param key groups changes into one step ('' never groups)
 */
function record(key: string): void {
  const now = Date.now();
  if (key && key === lastKey && now - lastAt < 800) {
    lastAt = now;
    return;
  }
  lastKey = key;
  lastAt = now;
  past.push(snapshot());
  if (past.length > 100) past.shift();
  future.length = 0;
}

/**
 * Whether undo and redo have anything.
 * @returns the flags for the state
 */
const flags = (): Pick<VState, 'canUndo' | 'canRedo'> => ({ canUndo: past.length > 0, canRedo: future.length > 0 });

/** Ends the current undo step, so the next change starts a new one (a drag's end). */
export const endVStep = (): void => {
  lastKey = '';
};

/**
 * Puts a snapshot back, keeping the selections that still exist.
 * @param snap the snapshot
 */
function restore(snap: Snap): void {
  lastKey = '';
  setVideo({
    tracks: snap.tracks,
    clips: snap.clips,
    layers: snap.layers,
    magnetic: snap.magnetic,
    sounds: snap.sounds,
    loudness: snap.loudness,
    selected: snap.clips.some((clip) => clip.id === state.selected) ? state.selected : (snap.clips.at(0)?.id ?? null),
    layerSel: snap.layers.some((layer) => layer.id === state.layerSel) ? state.layerSel : null,
    transitionSel: snap.clips.some((clip) => clip.id === state.transitionSel) ? state.transitionSel : null,
    soundSel: snap.sounds.some((sound) => sound.id === state.soundSel) ? state.soundSel : null,
    t: Math.min(state.t, lengthOf(snap.clips, snap.tracks, snap.magnetic)),
    ...flags(),
  });
}

/** Undoes the last step. */
export function undoV(): void {
  const snap = past.pop();
  if (!snap) return;
  future.push(snapshot());
  restore(snap);
}

/** Redoes the last undone step. */
export function redoV(): void {
  const snap = future.pop();
  if (!snap) return;
  past.push(snapshot());
  restore(snap);
}

/**
 * Gives every copy of a clip (the current one and those in the history) a filmstrip. Not an undo step: every copy can
 * share the strip.
 * @param id the clip
 * @param frames the strip's frames
 */
export function shareStrip(id: string, frames: string[]): void {
  for (const list of [state.clips, ...past.map((snap) => snap.clips), ...future.map((snap) => snap.clips)]) for (const clip of list) if (clip.id === id) clip.strip = frames;
  setVideo({ clips: state.clips.slice() });
}

/**
 * The clips grouped by track in the tracks' order (the main track first, as the document gate returns them), each
 * track's clips in the order they had.
 * @param clips the clips
 * @param tracks the tracks
 * @returns the same array when they already are, else a sorted copy
 */
function grouped(clips: VClip[], tracks: Track[]): VClip[] {
  const rank = new Map(tracks.map((track, index) => [track.id, index]));
  const rankOf = (clip: VClip): number => rank.get(clip.track) ?? tracks.length;
  let previous = -Infinity;
  let inOrder = true;
  for (const clip of clips) {
    const current = rankOf(clip);
    if (current < previous) inOrder = false;
    previous = current;
  }
  if (inOrder) return clips;
  return clips.slice().sort((first, second) => rankOf(first) - rankOf(second));
}

/**
 * Every undoable change goes through here; with Magnetic on, changed clips are packed end to end (the one place), and
 * transitions are kept or dropped by their one rule (206 AC-4: `tidyTransitions`), so edits needn't know of them.
 * @param key groups changes into one undo step (a drag); '' for a step of its own
 * @param patch the undoable fields to change
 * @param extra other fields to change with them (selection, playhead)
 */
export function change(key: string, patch: Partial<Snap>, extra: Partial<VState> = {}): void {
  record(key);
  const magnetic = patch.magnetic ?? state.magnetic;
  let next = patch;
  if (next.clips && magnetic) next = { ...next, clips: pack(next.clips) };
  if (next.clips || next.tracks) next = { ...next, clips: grouped(next.clips ?? state.clips, next.tracks ?? state.tracks) };
  if (next.clips) next = { ...next, clips: tidyTransitions(next.clips, state.fps).clips };
  const clips = next.clips ?? state.clips;
  setVideo({ ...next, ...flags(), ...extra, t: Math.min(extra.t ?? state.t, lengthOf(clips, next.tracks, magnetic)) });
}

/**
 * `change` for picture clips the store made itself or took from an edit: refused, with the reason, when what would be
 * stored (packed with Magnetic on) shows more videos at once than this app allows and more than now (203 AC-9).
 * @param key groups changes into one undo step
 * @param patch the undoable fields, with the clips
 * @param extra other fields to change with them
 * @returns null once changed, else why not
 */
export function commit(key: string, patch: Partial<Snap> & { clips: VClip[] }, extra: Partial<VState> = {}): string | null {
  const clips = (patch.magnetic ?? state.magnetic) ? pack(patch.clips) : patch.clips;
  const checked = limitVideos(state.clips, { clips }, editCtx());
  if ('error' in checked) return checked.error;
  change(key, { ...patch, clips }, extra);
  return null;
}

/** A project to start from (a saved project after mergeProject, 408; tests). Settings left out stay as they are. */
export interface LoadedProject extends Partial<Pick<VState, 'kind' | 'format' | 'fps' | 'quality' | 'fadeOut' | 'trackView'>> {
  clips: VClip[];
  tracks?: Track[];
  magnetic?: boolean;
  sounds?: VSound[];
  /** Missing: a project from before 208, Off (Q12). */
  loudness?: 'off' | number;
  layers?: Layer[];
  /** The playhead, seconds (0 when left out). */
  t?: number;
}

/**
 * Starts a project from clips already made: no history, packed when magnetic, else in start order.
 * @param project the clips, tracks, Magnetic, sounds, loudness and layers
 */
export function loadVideoProject(project: LoadedProject): void {
  past.length = 0;
  future.length = 0;
  lastKey = '';
  const magnetic = project.magnetic !== false;
  const tracks = project.tracks ?? defaultTracks();
  // Grouped by track, each in start order; with Magnetic on the main track keeps its given order (overlay tracks are
  // never packed, 203 Q8).
  const rank = (clip: VClip): number => {
    const index = tracks.findIndex((track) => track.id === clip.track);
    return index < 0 ? tracks.length : index;
  };
  const sorted = project.clips.slice().sort((first, second) => rank(first) - rank(second) || (magnetic && first.track === MAIN_VIDEO ? 0 : first.start - second.start));
  const clips = magnetic ? pack(sorted) : sorted;
  const { kind, format, fps, quality, fadeOut, trackView } = project;
  const settings = Object.fromEntries(Object.entries({ kind, format, fps, quality, fadeOut, trackView }).filter(([, value]) => value !== undefined));
  const playhead = Math.min(Math.max(0, project.t ?? 0), lengthOf(clips, tracks, magnetic));
  setVideo({ ...settings, clips, tracks, magnetic, sounds: project.sounds ?? [], loudness: project.loudness ?? 'off', measure: null, measuring: false, layers: project.layers ?? [], layerSel: null, transitionSel: null, soundSel: null, selected: clips.at(0)?.id ?? null, t: playhead, ...flags() });
}

/**
 * Magnetic (202, D1): switching it on closes every gap on the main track as one undo step; switching it off changes no
 * clip and isn't recorded.
 * @param on Magnetic on
 * @returns null, or why not: closing the gaps would show too many videos at once (203)
 */
export function setMagnetic(on: boolean): string | null {
  if (on === state.magnetic) return null;
  if (on) return commit('', { clips: closeGaps(state.clips), magnetic: true });
  setVideo({ magnetic: false });
  return null;
}
