import { keysOf } from './guards';
import type { ClipKeyProp, Keyframes } from './keyframes';
import type { Layer } from './layers';
import { MAIN_VIDEO, isPictureTrack, type Track } from './tracks';
import type { Transition } from './transitions';
import { V_FPS } from './videoFormats';

/*
 * The video editor's project as tracks (P2.1, specs/features/201-track-model), free of DOM and React. Clips sit on a
 * track at an absolute start time; tracks (tracks.ts) have a kind and can be hidden, muted or locked. A 2.x project,
 * clips in a row plus one song, is one video track packed end to end and one music track; for it every function here
 * gives exactly the 2.x answer (timeline.testkit.ts keeps the 2.x code to prove it), so the preview and the export
 * don't change. Times are seconds at full precision. The sound plan is soundPlan.ts; the document, projectDoc.ts and
 * projectGate.ts.
 */

/* ---------- the clip transform (203) ---------- */

/**
 * Where a picture clip's box sits in the frame, with the layers' names and meanings (engine/layers.ts). The box has
 * the frame's aspect ratio (203 D1), so at identity it is the frame and the clip's own framing works inside it.
 */
export interface ClipTransform {
  /** The box's centre, a share of the frame (−0.5…1.5: partly outside is fine). */
  x: number;
  y: number;
  /** The box's width, a share of the frame width (0.05…4). */
  w: number;
  /** Degrees, clockwise (−180…180). */
  rot: number;
  /** 0…1. */
  opacity: number;
  /** Corner radius, a share of the box's shorter side (0…0.5, Q2). */
  radius: number;
}

/** The whole frame: a clip without a transform draws exactly as before 203. */
export const IDENTITY: Readonly<ClipTransform> = Object.freeze({ x: 0.5, y: 0.5, w: 1, rot: 0, opacity: 1, radius: 0 });

/**
 * Whether a transform leaves the clip as the whole frame (the fast path that draws as before 203).
 * @param transform a clip's transform, if it has one
 * @returns true for no transform or one equal to the identity
 */
export const isIdentity = (transform?: ClipTransform): boolean =>
  !transform || keysOf(IDENTITY).every((field) => transform[field] === IDENTITY[field]);

/** Each transform field's range. */
export const TRANSFORM_RANGES: Readonly<Record<keyof ClipTransform, readonly [number, number]>> = {
  x: [-0.5, 1.5],
  y: [-0.5, 1.5],
  w: [0.05, 4],
  rot: [-180, 180],
  opacity: [0, 1],
  radius: [0, 0.5],
};

/**
 * Every field of a transform within its range.
 * @param transform a transform, possibly partial
 * @returns a new transform; missing or non-finite fields take the identity value
 */
export function clampTransform(transform: Partial<ClipTransform> | undefined): ClipTransform {
  const clamped = { ...IDENTITY };
  for (const field of keysOf(TRANSFORM_RANGES)) {
    const value = transform?.[field];
    const [low, high] = TRANSFORM_RANGES[field];
    if (typeof value === 'number' && Number.isFinite(value)) clamped[field] = Math.min(high, Math.max(low, value));
  }
  return clamped;
}

/** The inspector's box presets. */
export type Preset = 'full' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** The inspector's presets, in order, with their labels (Q4). */
export const PRESETS: readonly (readonly [Preset, string])[] = [
  ['full', 'Full frame'],
  ['top-left', 'Top left'],
  ['top-right', 'Top right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-right', 'Bottom right'],
];

/**
 * A preset's transform: Full frame is the identity; a corner is 35 % of the frame width, 4 % of the frame width from
 * the two nearest edges (Q4). The box is 0.35 of the height tall (the frame's aspect), so the vertical margin as a
 * share of the height is 0.04 × width / height.
 * @param preset the preset
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @returns the transform
 */
export function presetTransform(preset: Preset, frameWidth: number, frameHeight: number): ClipTransform {
  if (preset === 'full') return { ...IDENTITY };
  const size = 0.35;
  const margin = 0.04;
  const x = margin + size / 2;
  const y = (margin * frameWidth) / Math.max(1, frameHeight) + size / 2;
  return {
    ...IDENTITY,
    w: size,
    x: preset.endsWith('left') ? x : 1 - x,
    y: preset.startsWith('top') ? y : 1 - y,
  };
}

/* ---------- clip timing ---------- */

/** A new photo's seconds on screen. */
export const V_PHOTO_SECONDS = 3;

/** What the timeline needs to know about a clip. */
export interface ClipTiming {
  kind: 'photo' | 'video';
  /** Photo: seconds on screen. */
  dur: number;
  /** Video: the start of the part used, in seconds of the source. */
  in: number;
  /** Video: the end of the part used, in seconds of the source. */
  out: number;
}

/**
 * A clip's seconds on the timeline.
 * @param clip the clip
 * @returns a photo's duration or a video's trimmed length, at least 0.1 s
 */
export const clipLength = (clip: ClipTiming): number => Math.max(0.1, clip.kind === 'photo' ? clip.dur : clip.out - clip.in);

/**
 * The frame numbers whose time falls in [start, end).
 * @param start the first time, seconds
 * @param end the time after the last, seconds
 * @param fps the frame rate
 * @returns the first frame and the frame after the last
 */
export function frameRange(start: number, end: number, fps: number = V_FPS): [number, number] {
  // The tiny offset keeps a frame exactly on a boundary in the later clip; max(0, …) avoids a -0 first frame.
  return [Math.max(0, Math.ceil(start * fps - 1e-6)), Math.max(0, Math.ceil(end * fps - 1e-6))];
}

/**
 * A time as the timeline shows it.
 * @param seconds the time, seconds (below 0 shows as 0)
 * @returns m:ss.s
 */
export function formatTime(seconds: number): string {
  const time = Math.max(0, seconds);
  return `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4, '0')}`;
}

/* ---------- clips and the project ---------- */

/** A photo or video clip on a picture track. */
export interface TimedClip extends ClipTiming {
  id: string;
  track: string;
  /** Seconds from the start of the video. */
  start: number;
  /** Where its box sits in the frame (203); missing = the whole frame (IDENTITY). */
  tf?: ClipTransform;
  /** Keyframes (205): animated box values and volume, times from the clip's start; missing = nothing animated. */
  keys?: Keyframes<ClipKeyProp>;
  /** The transition on the cut at its end, into the clip that starts there (206, D1); missing = a hard cut. */
  transition?: Transition;
}

/** A sound on an audio track: the music. `toEnd` plays it to the end of the video whatever its length (2.x music). */
export interface AudioClip {
  id: string;
  track: string;
  start: number;
  /** Seconds into the source where it starts (the music's offset). */
  in: number;
  volume: number;
  toEnd: boolean;
  /** Length of the source, seconds. */
  srcDur: number;
}

/** A video project: its tracks, picture clips, sound clips and layers. */
export interface Project<C extends TimedClip = TimedClip> {
  tracks: Track[];
  clips: C[];
  audio: AudioClip[];
  layers: Layer[];
  /** Fade to black over the last half second. */
  fadeOut: boolean;
}

/**
 * Places the main video track's clips end to end in their order (the gapless rule of 201; `202` brings gaps and
 * ripple). Starts are summed exactly as 2.x did, so they are bit-identical. Other tracks keep their starts.
 * @param clips the picture clips
 * @returns the clips (each unchanged when already in place)
 */
export function pack<C extends TimedClip>(clips: C[]): C[] {
  let reached = 0;
  return clips.map((clip) => {
    if (clip.track !== MAIN_VIDEO) return clip;
    const start = reached;
    reached += clipLength(clip);
    return clip.start === start ? clip : { ...clip, start };
  });
}

const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/**
 * Seconds of slack at a clip's edges when asking which clip covers a time. Starts summed in floating point (pack, 2.x)
 * sit a hair (~1e-13 s) off the frame grid; frameRange puts such a frame in the later clip, so every "what shows at t"
 * rule (videoAt, frameStack, mostVideosAt) treats a time within EDGE_EPS before an edge as past it. Far below a frame.
 */
export const EDGE_EPS = 1e-9;

/**
 * The video's length: where the last picture clip ends (hidden tracks count too: hiding doesn't shorten it).
 * @param project the project
 * @returns seconds
 */
export function projectLength(project: Project): number {
  const pictureTracks = new Set(project.tracks.filter(isPictureTrack).map((track) => track.id));
  let end = 0;
  for (const clip of project.clips) if (pictureTracks.has(clip.track)) end = Math.max(end, endOf(clip));
  return end;
}

/** An empty stretch of a track, seconds. */
export interface Gap {
  start: number;
  end: number;
}

/**
 * A track's gaps: the empty stretches before and between its clips (clips are kept in start order).
 * @param project the project
 * @param track the track's id
 * @returns the gaps, in time order
 */
export function gaps(project: Project, track: string): Gap[] {
  const found: Gap[] = [];
  let reached = 0;
  for (const clip of project.clips) {
    if (clip.track !== track) continue;
    // A tiny tolerance: starts summed in floating point may sit a hair after the previous end.
    if (clip.start > reached + 1e-9) found.push({ start: reached, end: clip.start });
    reached = Math.max(reached, endOf(clip));
  }
  return found;
}

/** A clip showing at a time, and seconds into it. */
export interface ClipAtTime<C> {
  clip: C;
  local: number;
}

/**
 * The main track's clamp, as 2.x had it: before 0 its first clip (when it starts at 0), at or past the end its last.
 * @param onTrack the main track's clips, in start order
 * @param time timeline seconds
 * @returns the clip, or null
 */
function mainClamp<C extends TimedClip>(onTrack: readonly C[], time: number): C | null {
  const first = onTrack.at(0);
  const last = onTrack.at(-1);
  if (!first || !last) return null;
  if (time < 0 && first.start <= 0) return first;
  return time >= endOf(last) - EDGE_EPS ? last : null;
}

/**
 * The picture clip showing at a time on the topmost visible picture track (a gap shows nothing). The main track clamps
 * as 2.x did (`mainClamp`). Edges are EDGE_EPS early, as frameRange's, so the paused preview and the export agree on
 * every frame.
 * @param project the project
 * @param time timeline seconds
 * @returns the clip and seconds into it, or null for none
 */
export function videoAt<C extends TimedClip>(project: Project<C>, time: number): ClipAtTime<C> | null {
  const visible = project.tracks.filter((track) => isPictureTrack(track) && !track.hidden);
  for (let index = visible.length - 1; index >= 0; index--) {
    const track = visible.at(index);
    if (!track) continue;
    const onTrack = project.clips.filter((clip) => clip.track === track.id);
    const hit =
      onTrack.find((clip) => time >= clip.start - EDGE_EPS && time < endOf(clip) - EDGE_EPS) ??
      (track.id === MAIN_VIDEO ? mainClamp(onTrack, time) : null);
    if (hit) return { clip: hit, local: time - hit.start };
  }
  return null;
}

/** A span of the export's frames: one clip's frames, or a gap's (black, layers on top) with no clip. */
export interface FrameSpan<C> {
  clip: C | null;
  /** The first frame, and one past the last. */
  f0: number;
  f1: number;
  /** The timeline second the span's local time counts from (frame i shows i / fps − start). */
  start: number;
}

/**
 * The export's frames: per clip of the visible main track, frame numbers [f0, f1) at fps and its start, exactly as
 * 2.x's loop; a gap is a span with no clip, so the frames run 0 → total without holes. With the main track hidden: one
 * span of black frames.
 * @param project the project
 * @param fps the frame rate
 * @returns the spans, in frame order
 */
export function framePlan<C extends TimedClip>(project: Project<C>, fps: number): FrameSpan<C>[] {
  const total = projectLength(project);
  const frames = Math.max(1, Math.round(total * fps));
  const main = project.tracks.find((track) => track.id === MAIN_VIDEO);
  if (!main || main.hidden) return [{ clip: null, f0: 0, f1: frames, start: 0 }];
  const spans: FrameSpan<C>[] = [];
  let next = 0;
  let previousEnd = 0;
  for (const clip of project.clips) {
    if (clip.track !== MAIN_VIDEO) continue;
    const [f0, f1] = frameRange(clip.start, endOf(clip), fps);
    const last = Math.min(f1, frames);
    // Frames between the previous clip and this one: a gap. A packed track (2.x) never has any.
    if (f0 > next) spans.push({ clip: null, f0: next, f1: Math.min(f0, frames), start: previousEnd });
    previousEnd = endOf(clip);
    if (f0 >= last) continue;
    spans.push({ clip, f0, f1: last, start: clip.start });
    next = last;
  }
  return spans;
}
