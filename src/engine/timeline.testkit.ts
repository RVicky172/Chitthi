/*
 * Test kit for the track model (specs/features/201-track-model), used only by tests and the self-test.
 *
 * 1. THE 2.x REFERENCE — never edit. A frozen copy of how the video editor placed clips, picked the frame and planned
 *    the export's frames and sound before tracks (engine/video.ts timeline / clipAt / totalLength / frameRange and the
 *    loops of engine/videoExport.ts encodeVideo / openAudio, as of 2026-10-06, commit a283e6a). The track model must
 *    give exactly these answers for every 2.x project, so the preview and the export stay the same.
 * 2. FIXTURES — every shape a 2.x project can take.
 */
import { DEFAULT_EDIT, type IgEdit } from './instagram';
import type { Layer } from './layers';
import type { Motion } from './video';

/* ---------- 1. The 2.x reference (frozen) ---------- */

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

export const legacyClipLength = (c: { kind: 'photo' | 'video'; dur: number; in: number; out: number }): number =>
  Math.max(0.1, c.kind === 'photo' ? c.dur : c.out - c.in);

export interface LegacyPlaced<T> {
  clip: T;
  index: number;
  start: number;
  end: number;
}

export function legacyTimeline<T extends LegacyClip>(clips: T[]): LegacyPlaced<T>[] {
  let t = 0;
  return clips.map((clip, index) => {
    const start = t;
    t += legacyClipLength(clip);
    return { clip, index, start, end: t };
  });
}
export const legacyTotal = (clips: LegacyClip[]): number => clips.reduce((a, c) => a + legacyClipLength(c), 0);

export function legacyClipAt<T extends LegacyClip>(tl: LegacyPlaced<T>[], t: number): LegacyPlaced<T> | null {
  if (!tl.length) return null;
  return tl.find((p) => t >= p.start && t < p.end) ?? (t < 0 ? tl[0] : tl[tl.length - 1]);
}

export function legacyFrameRange(start: number, end: number, fps: number): [number, number] {
  return [Math.max(0, Math.ceil(start * fps - 1e-6)), Math.max(0, Math.ceil(end * fps - 1e-6))];
}

/** The export's frames: for each clip it draws, frame numbers [f0, last) and the clip's start (local = i / fps − start). */
export function legacyFramePlan(
  p: LegacyProject,
  fps: number,
): { id: string; f0: number; f1: number; start: number }[] {
  const total = legacyTotal(p.clips);
  const frames = Math.max(1, Math.round(total * fps));
  const out: { id: string; f0: number; f1: number; start: number }[] = [];
  for (const pl of legacyTimeline(p.clips)) {
    const [f0, f1] = legacyFrameRange(pl.start, pl.end, fps);
    const last = Math.min(f1, frames);
    if (f0 >= last) continue;
    out.push({ id: pl.clip.id, f0, f1: last, start: pl.start });
  }
  return out;
}

/** The sound sources the export mixes (before checking which files have decodable sound). */
export function legacyAudioPlan(
  p: LegacyProject,
): { ref: string; start: number; end: number; from: number; volume: number; fadeIn: number; fadeOut: number }[] {
  const total = legacyTotal(p.clips);
  const out: {
    ref: string;
    start: number;
    end: number;
    from: number;
    volume: number;
    fadeIn: number;
    fadeOut: number;
  }[] = [];
  for (const pl of legacyTimeline(p.clips)) {
    const c = pl.clip;
    if (c.kind !== 'video' || c.volume <= 0) continue;
    out.push({ ref: c.id, start: pl.start, end: pl.end, from: c.in, volume: c.volume, fadeIn: 0.03, fadeOut: 0.03 });
  }
  if (p.music && p.music.volume > 0)
    out.push({
      ref: 'music',
      start: 0,
      end: total,
      from: Math.max(0, p.music.offset),
      volume: p.music.volume,
      fadeIn: 0,
      fadeOut: Math.min(1.5, total / 3),
    });
  return out;
}

/* ---------- 2. Fixtures ---------- */

let n = 0;
const photo = (dur: number, patch: Partial<LegacyClip> = {}): LegacyClip => ({
  id: `p${n++}`,
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
  id: `v${n++}`,
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
const text = (start?: number, end?: number): Layer =>
  ({
    id: `l${n++}`,
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
  }) as Layer;

/** Every 2.x shape, by name. Lengths are chosen to stress float sums (0.37 s, 1/3 s) and the 0.1 s minimum. */
export function legacyFixtures(): Record<string, LegacyProject> {
  n = 0;
  const base = { music: null, layers: [], fadeOut: true };
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      i % 5 === 4 ? video(0.25 * (i % 3), 0.25 * (i % 3) + 0.37 + (i % 4) * 0.11) : photo(0.37 + (i % 7) / 3),
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
