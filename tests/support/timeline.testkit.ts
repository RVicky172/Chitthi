/*
 * Test kit for the track model (specs/features/201-track-model), used only by tests and the self-test.
 *
 * 1. THE 2.x REFERENCE — never edit. A frozen copy of how the video editor placed clips, picked the frame and planned
 *    the export's frames and sound before tracks (engine/video.ts timeline / clipAt / totalLength / frameRange and the
 *    loops of engine/videoExport.ts encodeVideo / openAudio, as of 2026-10-06, commit a283e6a). The track model must
 *    give exactly these answers for every 2.x project, so the preview and the export stay the same.
 * 2. FIXTURES — every shape a 2.x project can take.
 */
import { DEFAULT_EDIT, type IgEdit } from '@/engine/instagram';
import type { Layer } from '@/engine/layers';
import type { Motion } from '@/engine/video';

/* ---------- 1. The 2.x reference (frozen) ---------- */

/**
 * A clip as 2.x saved it: photos with a duration, videos with a source range.
 */
export interface LegacyClip {
  id: string;
  kind: 'photo' | 'video';
  dur: number;
  in: number;
  out: number;
  edit: IgEdit;
  motion: Motion;
  fade: boolean;
  volume: number;
}
/**
 * 2.x's one song: where it starts in the file, its volume and the file's length.
 */
export interface LegacyMusic {
  offset: number;
  volume: number;
  dur: number;
}
/** A 2.x project: clips in play order, one song, layers timed over the whole video. */
export interface LegacyProject {
  clips: LegacyClip[];
  music: LegacyMusic | null;
  layers: Layer[];
  fadeOut: boolean;
}

/**
 * How long a 2.x clip plays (photos their duration, videos their source range; at least 0.1 s).
 * @param clip the clip
 * @returns its length in seconds
 */
export const legacyClipLength = (clip: { kind: 'photo' | 'video'; dur: number; in: number; out: number }): number =>
  Math.max(0.1, clip.kind === 'photo' ? clip.dur : clip.out - clip.in);

/**
 * A 2.x clip placed on the timeline: its index and its [start, end) in seconds.
 */
export interface LegacyPlaced<T> {
  clip: T;
  index: number;
  start: number;
  end: number;
}

/**
 * 2.x's timeline: the clips back to back, in order.
 * @param clips the clips
 * @returns each clip with its start and end
 */
export function legacyTimeline<T extends LegacyClip>(clips: T[]): LegacyPlaced<T>[] {
  let time = 0;
  return clips.map((clip, index) => {
    const start = time;
    time += legacyClipLength(clip);
    return { clip, index, start, end: time };
  });
}
/**
 * A 2.x project's length: the clips' lengths added up.
 * @param clips the clips
 * @returns the length in seconds
 */
export const legacyTotal = (clips: LegacyClip[]): number =>
  clips.reduce((sum, clip) => sum + legacyClipLength(clip), 0);

/**
 * The clip 2.x shows at a time (the last one past the end, none before the start).
 * @param tl the timeline
 * @param time the time in seconds
 * @returns the placed clip, or null when there is none
 */
export function legacyClipAt<T extends LegacyClip>(tl: LegacyPlaced<T>[], time: number): LegacyPlaced<T> | null {
  if (!tl.length) return null;
  return tl.find((placed) => time >= placed.start && time < placed.end) ?? (time < 0 ? tl[0] : tl.at(-1)) ?? null;
}

/**
 * The frames 2.x's export draws for [start, end): the first and one past the last.
 * @param start the start in seconds
 * @param end the end in seconds
 * @param fps frames per second
 * @returns [first, one past the last]
 */
export function legacyFrameRange(start: number, end: number, fps: number): [number, number] {
  return [Math.max(0, Math.ceil(start * fps - 1e-6)), Math.max(0, Math.ceil(end * fps - 1e-6))];
}

/**
 * The export's frames: for each clip it draws, frame numbers [f0, last) and the clip's start (local = i / fps − start).
 * @param project the 2.x project
 * @param fps frames per second
 * @returns one entry per clip with frames
 */
export function legacyFramePlan(
  project: LegacyProject,
  fps: number,
): { id: string; f0: number; f1: number; start: number }[] {
  const total = legacyTotal(project.clips);
  const frames = Math.max(1, Math.round(total * fps));
  const out: { id: string; f0: number; f1: number; start: number }[] = [];
  for (const pl of legacyTimeline(project.clips)) {
    const [f0, f1] = legacyFrameRange(pl.start, pl.end, fps);
    const last = Math.min(f1, frames);
    if (f0 >= last) continue;
    out.push({ id: pl.clip.id, f0, f1: last, start: pl.start });
  }
  return out;
}

/** A sound the 2.x export mixed, as `legacyAudioPlan` lists it; the music is labelled with its track (208). */
export interface LegacySound {
  ref: string;
  track?: string;
  role?: 'music';
  start: number;
  end: number;
  from: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

/**
 * The sound sources the export mixes (before checking which files have decodable sound).
 * @param project the 2.x project
 * @returns the sources, in mixing order
 */
export function legacyAudioPlan(project: LegacyProject): LegacySound[] {
  const total = legacyTotal(project.clips);
  const out: LegacySound[] = [];
  for (const pl of legacyTimeline(project.clips)) {
    const legacyClip = pl.clip;
    if (legacyClip.kind !== 'video' || legacyClip.volume <= 0) continue;
    out.push({
      ref: legacyClip.id,
      start: pl.start,
      end: pl.end,
      from: legacyClip.in,
      volume: legacyClip.volume,
      fadeIn: 0.03,
      fadeOut: 0.03,
    });
  }
  if (project.music && project.music.volume > 0)
    out.push({
      ref: 'music',
      // 208: the music is a sound clip on the Music track; its timing and gains are 2.x's.
      track: 'A1',
      role: 'music',
      start: 0,
      end: total,
      from: Math.max(0, project.music.offset),
      volume: project.music.volume,
      fadeIn: 0,
      fadeOut: Math.min(1.5, total / 3),
    });
  return out;
}

/* ---------- 2. Fixtures ---------- */

let nextId = 0;
const photo = (dur: number, patch: Partial<LegacyClip> = {}): LegacyClip => ({
  id: `p${nextId++}`,
  kind: 'photo',
  dur,
  in: 0,
  out: 0,
  edit: { ...DEFAULT_EDIT },
  motion: 'zoom-in',
  fade: false,
  volume: 0,
  ...patch,
});
const video = (from: number, to: number, patch: Partial<LegacyClip> = {}): LegacyClip => ({
  id: `v${nextId++}`,
  kind: 'video',
  dur: 0,
  in: from,
  out: to,
  edit: { ...DEFAULT_EDIT },
  motion: 'none',
  fade: false,
  volume: 1,
  ...patch,
});
const text = (start?: number, end?: number): Layer => ({
  id: `l${nextId++}`,
  kind: 'text',
  x: 0.5,
  y: 0.5,
  w: 0.6,
  rot: 0,
  opacity: 1,
  text: 'Hello',
  font: 'Poppins',
  size: 0.08,
  color: '#ffffff',
  align: 'center',
  bold: true,
  italic: false,
  outline: '',
  bg: '',
  shadow: false,
  start,
  end,
});

/**
 * Every 2.x shape, by name. Lengths are chosen to stress float sums (0.37 s, 1/3 s) and the 0.1 s minimum.
 * @returns the fixtures
 */
export function legacyFixtures(): Record<string, LegacyProject> {
  nextId = 0;
  const base = { music: null, layers: [], fadeOut: true };
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      index % 5 === 4
        ? video(0.25 * (index % 3), 0.25 * (index % 3) + 0.37 + (index % 4) * 0.11)
        : photo(0.37 + (index % 7) / 3),
    );
  return {
    empty: { ...base, clips: [] },
    photoOnly: { ...base, clips: [photo(3), photo(1.5, { fade: true }), photo(0.37)] },
    videoOnly: { ...base, clips: [video(2, 6.5), video(0, 0.05), video(1.25, 1.75, { volume: 0 })] },
    mixed: { ...base, clips: [photo(3, { fade: true }), video(2, 6.5), photo(1.5), video(0.1, 0.43)] },
    musicOffset: { ...base, clips: [photo(2), video(0, 4)], music: { offset: 12.5, volume: 0.8, dur: 180 } },
    musicSilent: { ...base, clips: [photo(2)], music: { offset: 0, volume: 0, dur: 30 } },
    timedLayers: { ...base, clips: [photo(4), photo(4)], layers: [text(), text(1, 3), text(6), text(2.5, 50)] },
    noFadeOut: { ...base, fadeOut: false, clips: [photo(2), video(0, 1)] },
    tinyClips: { ...base, clips: [photo(0.05), photo(0.1), video(3, 3.02), photo(0.0999)] },
    clips20: { ...base, clips: many(20), music: { offset: 3, volume: 0.6, dur: 40 } },
    clips60: { ...base, clips: many(60) },
    clips500: { ...base, clips: many(500), music: { offset: 0, volume: 1, dur: 3600 } },
  };
}

/**
 * A 2.x project as a document: clips in order with their media, the song, layers (no version).
 * @param project the 2.x project
 * @returns the document
 */
export function legacyDoc(project: LegacyProject) {
  const media = [
    ...project.clips.map((clip) => ({
      id: `m${clip.id}`,
      kind: clip.kind,
      name: `${clip.id}.${clip.kind === 'photo' ? 'jpg' : 'mp4'}`,
      type: clip.kind === 'photo' ? 'image/jpeg' : 'video/mp4',
      size: 1000,
      w: 1600,
      h: 900,
      srcDur: clip.kind === 'video' ? clip.out + 1 : 0,
    })),
    ...(project.music
      ? [
          {
            id: 'msong',
            kind: 'audio' as const,
            name: 'song.mp3',
            type: 'audio/mpeg',
            size: 5000,
            w: 0,
            h: 0,
            srcDur: project.music.dur,
          },
        ]
      : []),
  ];
  return {
    kind: 'vlog' as const,
    format: 'yt1080' as const,
    fps: 30 as const,
    quality: 'standard' as const,
    fadeOut: project.fadeOut,
    clips: project.clips.map((clip) => ({ ...clip, media: `m${clip.id}` })),
    music: project.music ? { ...project.music, media: 'msong' } : null,
    layers: project.layers,
    media,
  };
}
