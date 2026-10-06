import type { Layer } from './layers';
import { clipLength, frameRange, type ClipTiming } from './video';

/*
 * The video editor's project as tracks (P2.1, specs/features/201-track-model), free of DOM and React. Clips sit on a
 * track at an absolute start time; tracks have a kind (video, overlay, audio) and can be hidden (pictures), muted
 * (sound) or locked (no edits). A 2.x project, clips in a row plus one song, is one video track packed end to end and
 * one music track; for it every function here gives exactly the 2.x answer (timeline.testkit.ts keeps the 2.x code to
 * prove it), so the preview and the export don't change. Times are seconds at full precision.
 */

export type TrackKind = 'video' | 'overlay' | 'audio';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  /** Video / overlay: not drawn in the preview or the export. */
  hidden: boolean;
  /** Audio: not heard in the preview or the export. */
  muted: boolean;
  /** Its clips can't be selected, moved, trimmed, split, duplicated or deleted. */
  locked: boolean;
}

/** The main video track and the music track: every project has them. */
export const MAIN_VIDEO = 'V1';
export const MUSIC = 'A1';

export const defaultTracks = (): Track[] => [
  { id: MAIN_VIDEO, kind: 'video', name: 'Video', hidden: false, muted: false, locked: false },
  { id: MUSIC, kind: 'audio', name: 'Music', hidden: false, muted: false, locked: false },
];

/** How many picture (video + overlay) and sound tracks a project may have (Q4; 201 uses 1 + 1). */
export const TRACK_LIMITS = (desktop: boolean): { visual: number; audio: number } =>
  desktop ? { visual: 8, audio: 8 } : { visual: 4, audio: 4 };

/** A photo or video clip on a picture track. */
export interface TimedClip extends ClipTiming {
  id: string;
  track: string;
  /** Seconds from the start of the video. */
  start: number;
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

export interface Project<C extends TimedClip = TimedClip> {
  tracks: Track[];
  clips: C[];
  audio: AudioClip[];
  layers: Layer[];
  /** Fade to black over the last half second. */
  fadeOut: boolean;
}

const isVisual = (t: Track) => t.kind === 'video' || t.kind === 'overlay';

/**
 * Places the main video track's clips end to end in their order (the gapless rule of 201; `202` brings gaps and
 * ripple). Starts are summed exactly as 2.x did, so they are bit-identical. Other tracks keep their starts.
 */
export function pack<C extends TimedClip>(clips: C[]): C[] {
  let t = 0;
  return clips.map((c) => {
    if (c.track !== MAIN_VIDEO) return c;
    const start = t;
    t += clipLength(c);
    return c.start === start ? c : { ...c, start };
  });
}

const endOf = (c: TimedClip) => c.start + clipLength(c);

/** The video's length: where the last picture clip ends (hidden tracks count too: hiding doesn't shorten it). */
export function projectLength(p: Project): number {
  const visual = new Set(p.tracks.filter(isVisual).map((t) => t.id));
  let end = 0;
  for (const c of p.clips) if (visual.has(c.track)) end = Math.max(end, endOf(c));
  return end;
}

/** The picture clip showing at time t on the topmost visible picture track, and seconds into it; null for none. The
 * main track clamps as 2.x did: before 0 its first clip, past the end its last. */
export function videoAt<C extends TimedClip>(p: Project<C>, t: number): { clip: C; local: number } | null {
  const visual = p.tracks.filter((tr) => isVisual(tr) && !tr.hidden);
  for (let i = visual.length - 1; i >= 0; i--) {
    const on = p.clips.filter((c) => c.track === visual[i].id);
    if (!on.length) continue;
    const hit = on.find((c) => t >= c.start && t < endOf(c));
    if (hit) return { clip: hit, local: t - hit.start };
    if (visual[i].id === MAIN_VIDEO) {
      const c = t < 0 ? on[0] : on[on.length - 1];
      return { clip: c, local: t - c.start };
    }
  }
  return null;
}

/**
 * The export's frames: per clip of the visible main track, frame numbers [f0, f1) at fps and its start (local time of
 * frame i = i / fps − start), exactly as 2.x's loop. With the main track hidden: one span of black frames (layers
 * still drawn on top).
 */
export function framePlan<C extends TimedClip>(
  p: Project<C>,
  fps: number,
): { clip: C | null; f0: number; f1: number; start: number }[] {
  const total = projectLength(p);
  const frames = Math.max(1, Math.round(total * fps));
  const main = p.tracks.find((t) => t.id === MAIN_VIDEO);
  if (!main || main.hidden) return [{ clip: null, f0: 0, f1: frames, start: 0 }];
  const out: { clip: C | null; f0: number; f1: number; start: number }[] = [];
  for (const c of p.clips) {
    if (c.track !== MAIN_VIDEO) continue;
    const [f0, f1] = frameRange(c.start, endOf(c), fps);
    const last = Math.min(f1, frames);
    if (f0 >= last) continue;
    out.push({ clip: c, f0, f1: last, start: c.start });
  }
  return out;
}

export interface SoundSource {
  /** The clip's id, or the audio clip's id ('music'). */
  ref: string;
  /** Timeline seconds. */
  start: number;
  end: number;
  /** Source seconds at `start`. */
  from: number;
  volume: number;
  /** Volume ramps at its ends, seconds. */
  fadeIn: number;
  fadeOut: number;
}

/**
 * The sounds the export mixes: each video clip's own sound on the main track (hiding the track keeps it: hiding is
 * about pictures) with short ramps at the cuts, then the audio clips of tracks that aren't muted; a `toEnd` clip plays
 * to the end of the video and fades out over min(1.5 s, a third of the video), as 2.x's music did.
 */
export function audioPlan(p: Project): SoundSource[] {
  const total = projectLength(p);
  const out: SoundSource[] = [];
  for (const c of p.clips) {
    if (c.track !== MAIN_VIDEO || c.kind !== 'video') continue;
    const volume = (c as TimedClip & { volume?: number }).volume ?? 0;
    if (volume <= 0) continue;
    out.push({ ref: c.id, start: c.start, end: endOf(c), from: c.in, volume, fadeIn: 0.03, fadeOut: 0.03 });
  }
  const muted = new Set(p.tracks.filter((t) => t.kind === 'audio' && t.muted).map((t) => t.id));
  for (const a of p.audio) {
    if (muted.has(a.track) || a.volume <= 0) continue;
    const end = a.toEnd ? total : a.start + Math.max(0, a.srcDur - a.in);
    out.push({
      ref: a.id,
      start: a.start,
      end,
      from: Math.max(0, a.in),
      volume: a.volume,
      fadeIn: 0,
      fadeOut: Math.min(1.5, total / 3),
    });
  }
  return out;
}
