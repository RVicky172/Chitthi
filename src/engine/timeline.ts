import { mergeEdit, type IgEdit } from './instagram';
import { mergeLayers, type Layer } from './layers';
import {
  MOTIONS,
  V_PHOTO_SECONDS,
  clipLength,
  formatsFor,
  frameRange,
  limitsFor,
  type ClipTiming,
  type Motion,
  type VFormatId,
  type VFps,
  type VKind,
  type VQuality,
} from './video';

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

/**
 * A track with its switches changed: Hide applies to picture tracks, Mute to sound tracks, Lock to both. Returns the
 * same array when nothing changes (unknown track, a switch the track doesn't have, or the value it already has).
 */
export function patchTrack(
  tracks: Track[],
  id: string,
  patch: Partial<Pick<Track, 'hidden' | 'muted' | 'locked'>>,
): Track[] {
  const i = tracks.findIndex((t) => t.id === id);
  if (i < 0) return tracks;
  const t = tracks[i],
    visual = t.kind !== 'audio';
  const next: Track = {
    ...t,
    hidden: visual && patch.hidden !== undefined ? patch.hidden : t.hidden,
    muted: !visual && patch.muted !== undefined ? patch.muted : t.muted,
    locked: patch.locked ?? t.locked,
  };
  if (next.hidden === t.hidden && next.muted === t.muted && next.locked === t.locked) return tracks;
  return tracks.map((x, j) => (j === i ? next : x));
}

/** Why a track's clips can't be changed, or null when they can (unknown tracks aren't locked). */
export function lockedReason(tracks: Track[], id: string): string | null {
  const t = tracks.find((x) => x.id === id);
  return t?.locked ? `The ${t.name} track is locked. Unlock it to change its clips.` : null;
}

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

/* ---------- the project document and its gate ---------- */

export type MediaKind = 'photo' | 'video' | 'audio' | 'image';

/** A file the project uses, described (never embedded): where it lives is up to whoever saves the project. */
export interface DocMedia {
  id: string;
  kind: MediaKind;
  name: string;
  /** MIME type. */
  type: string;
  /** Bytes. */
  size: number;
  /** Pixels (0 for sound). */
  w: number;
  h: number;
  /** Seconds (0 for pictures). */
  srcDur: number;
}

/** A picture clip as saved: its timing, look and motion, and the media it shows. */
export interface DocClip extends TimedClip {
  media: string;
  edit: IgEdit;
  motion: Motion;
  fade: boolean;
  /** Its own sound, 0–1 (photos: 0). */
  volume: number;
}

export interface DocAudio extends AudioClip {
  media: string;
}

/** A project as JSON. Version 1 is the track model; a document without a version is a 2.x project (clips in a row). */
export interface ProjectDoc extends Project<DocClip> {
  version: 1;
  kind: VKind;
  format: VFormatId;
  fps: VFps;
  quality: VQuality;
  audio: DocAudio[];
  media: DocMedia[];
}

/**
 * A 2.x project on tracks: the clips back to back on the main video track, the song as a music clip that plays to the
 * end of the video from its offset. Every other field of the clips and the song is kept.
 */
export function fromSequence<
  C extends ClipTiming & { id: string },
  M extends { offset: number; volume: number; dur: number },
>(seq: {
  clips: C[];
  music: M | null;
  layers: Layer[];
  fadeOut: boolean;
}): Project<C & { track: string; start: number }> & { audio: (AudioClip & Omit<M, 'offset' | 'volume' | 'dur'>)[] } {
  const clips = pack(seq.clips.map((c) => ({ ...c, track: MAIN_VIDEO, start: 0 })));
  let audio: (AudioClip & Omit<M, 'offset' | 'volume' | 'dur'>)[] = [];
  if (seq.music) {
    const { offset, volume, dur, ...rest } = seq.music;
    audio = [{ ...rest, id: 'music', track: MUSIC, start: 0, in: offset, volume, toEnd: true, srcDur: dur }];
  }
  return { tracks: defaultTracks(), clips, audio, layers: seq.layers, fadeOut: seq.fadeOut };
}

/** The JSON form of a project: only the fields a project is made of (no files, URLs, thumbnails or view state). */
export function toDocument(p: ProjectDoc): ProjectDoc {
  return {
    version: 1,
    kind: p.kind,
    format: p.format,
    fps: p.fps,
    quality: p.quality,
    fadeOut: p.fadeOut,
    tracks: p.tracks.map(({ id, kind, name, hidden, muted, locked }) => ({ id, kind, name, hidden, muted, locked })),
    clips: p.clips.map(({ id, track, start, media, kind, dur, in: i, out, edit, motion, fade, volume }) => ({
      id,
      track,
      start,
      media,
      kind,
      dur,
      in: i,
      out,
      edit,
      motion,
      fade,
      volume,
    })),
    audio: p.audio.map(({ id, track, start, media, in: i, volume, toEnd, srcDur }) => ({
      id,
      track,
      start,
      media,
      in: i,
      volume,
      toEnd,
      srcDur,
    })),
    layers: p.layers,
    media: p.media.map(({ id, kind, name, type, size, w, h, srcDur }) => ({
      id,
      kind,
      name,
      type,
      size,
      w,
      h,
      srcDur,
    })),
  };
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const MEDIA_KINDS: readonly MediaKind[] = ['photo', 'video', 'audio', 'image'];
const TRACK_KINDS: readonly TrackKind[] = ['video', 'overlay', 'audio'];
const MOTION_IDS: readonly string[] = MOTIONS.map(([m]) => m);
/** The longest source or timeline time the gate accepts, seconds (a day). */
const MAX_TIME = 86400;
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const fin = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
let gen = 0;
const freshId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(gen++).toString(36)}`;

function emptyDoc(desktop: boolean): ProjectDoc {
  return {
    version: 1,
    kind: 'reel',
    format: 'reel',
    fps: limitsFor('reel', desktop).fps[0],
    quality: 'standard',
    fadeOut: true,
    tracks: defaultTracks(),
    clips: [],
    audio: [],
    layers: [],
    media: [],
  };
}

/** A 2.x document (no version) as a version 1 candidate, still to go through the gate. */
function upgrade(o: Record<string, unknown>): Record<string, unknown> {
  const clips = arr(o.clips).filter((c): c is Record<string, unknown> => !!obj(c));
  const m = obj(o.music);
  const seq = fromSequence({
    clips: clips.map((c) => ({
      ...c,
      kind: c.kind === 'video' ? ('video' as const) : ('photo' as const),
      dur: Number(c.dur),
      in: Number(c.in),
      out: Number(c.out),
      id: String(c.id),
    })),
    music: m ? { ...m, offset: Number(m.offset), volume: Number(m.volume), dur: Number(m.dur) } : null,
    layers: [],
    fadeOut: o.fadeOut !== false,
  });
  return { ...o, version: 1, tracks: seq.tracks, clips: seq.clips, audio: seq.audio, music: undefined };
}

/**
 * The single gate for project data from outside the running app (project files; 2.x projects): a valid version 1
 * project and what it dropped or changed, and why. Values out of range are clamped or replaced by defaults; clips on a
 * missing or wrong track or without their media, and unknown fields, are dropped; ids are made unique; the main track
 * is packed. Never throws.
 */
export function mergeProject(raw: unknown, desktop: boolean): { doc: ProjectDoc; dropped: string[] } {
  const dropped: string[] = [];
  try {
    let o = obj(raw);
    if (!o) return { doc: emptyDoc(desktop), dropped: ['This isn’t a project.'] };
    if (o.version === undefined) o = upgrade(o);
    else if (o.version !== 1)
      return {
        doc: emptyDoc(desktop),
        dropped: [
          `This project is from a newer version of Chitthi Studio (version ${String(o.version).slice(0, 10)}).`,
        ],
      };

    // Settings.
    const kind: VKind = o.kind === 'vlog' ? 'vlog' : 'reel';
    const formats = formatsFor(kind);
    const format = formats.find((f) => f.id === o.format && (desktop || !f.desktopOnly))?.id ?? formats[0].id;
    const L = limitsFor(kind, desktop);
    const fps = L.fps.includes(o.fps as VFps) ? (o.fps as VFps) : L.fps[0];
    const quality: VQuality = o.quality === 'high' ? 'high' : 'standard';
    const fadeOut = o.fadeOut !== false;

    // Media.
    const media: DocMedia[] = [];
    for (const r of arr(o.media)) {
      const m = obj(r);
      if (
        !m ||
        typeof m.id !== 'string' ||
        !ID.test(m.id) ||
        media.some((x) => x.id === m.id) ||
        !MEDIA_KINDS.includes(m.kind as MediaKind)
      ) {
        dropped.push('A media entry was unreadable and was left out.');
        continue;
      }
      media.push({
        id: m.id,
        kind: m.kind as MediaKind,
        name: text(m.name, 200),
        type: text(m.type, 100),
        size: fin(m.size, 0, Number.MAX_SAFE_INTEGER) ?? 0,
        w: Math.round(fin(m.w, 0, 100000) ?? 0),
        h: Math.round(fin(m.h, 0, 100000) ?? 0),
        srcDur: fin(m.srcDur, 0, MAX_TIME) ?? 0,
      });
    }
    const mediaOf = (id: unknown) => media.find((m) => m.id === id);

    // Tracks: the main video and music tracks always exist, with their kinds; the rest within the limits.
    const T = TRACK_LIMITS(desktop);
    const tracks: Track[] = [];
    for (const r of arr(o.tracks)) {
      const t = obj(r);
      if (
        !t ||
        typeof t.id !== 'string' ||
        !ID.test(t.id) ||
        tracks.some((x) => x.id === t.id) ||
        !TRACK_KINDS.includes(t.kind as TrackKind)
      ) {
        dropped.push('A track was unreadable and was left out.');
        continue;
      }
      const kindT: TrackKind = t.id === MAIN_VIDEO ? 'video' : t.id === MUSIC ? 'audio' : (t.kind as TrackKind);
      const full =
        kindT === 'audio'
          ? tracks.filter((x) => x.kind === 'audio').length >= T.audio
          : tracks.filter(isVisual).length >= T.visual;
      if (full) {
        dropped.push(
          `A project holds up to ${T.visual} picture and ${T.audio} sound tracks here; “${text(t.name, 40)}” was left out.`,
        );
        continue;
      }
      tracks.push({
        id: t.id,
        kind: kindT,
        name: text(t.name, 40) || (kindT === 'audio' ? 'Audio' : 'Video'),
        hidden: t.hidden === true,
        muted: t.muted === true,
        locked: t.locked === true,
      });
    }
    for (const d of defaultTracks())
      if (!tracks.some((t) => t.id === d.id)) {
        if (d.kind === 'video' && tracks.filter(isVisual).length >= T.visual)
          tracks.splice(tracks.findLastIndex(isVisual), 1);
        if (d.kind === 'audio' && tracks.filter((t) => t.kind === 'audio').length >= T.audio)
          tracks.splice(
            tracks.findLastIndex((t) => t.kind === 'audio'),
            1,
          );
        tracks.splice(d.kind === 'video' ? 0 : tracks.length, 0, d);
      }
    const trackOf = (id: unknown) => tracks.find((t) => t.id === id);

    // Picture clips.
    const ids = new Set<string>();
    const unique = (v: unknown, prefix: string) => {
      let id = typeof v === 'string' && ID.test(v) ? v : '';
      if (!id || ids.has(id)) {
        if (id) dropped.push(`Two items had the id “${id}”; one was renamed.`);
        id = freshId(prefix);
      }
      ids.add(id);
      return id;
    };
    const clips: DocClip[] = [];
    const rawClips = arr(o.clips);
    if (rawClips.length > L.clips)
      dropped.push(`A project holds up to ${L.clips} clips here; ${rawClips.length - L.clips} were left out.`);
    for (const r of rawClips.slice(0, L.clips)) {
      const c = obj(r);
      if (!c) {
        dropped.push('A clip was unreadable and was left out.');
        continue;
      }
      const cKind = c.kind === 'video' ? 'video' : 'photo';
      const tr = trackOf(c.track);
      if (!tr || !isVisual(tr)) {
        dropped.push('A clip on a missing or sound track was left out.');
        continue;
      }
      const m = mediaOf(c.media);
      if (!m || m.kind !== cKind) {
        dropped.push(`A ${cKind} clip without its media was left out.`);
        continue;
      }
      let dur = 0,
        cin = 0,
        out = 0;
      if (cKind === 'photo') dur = fin(c.dur, 0, L.seconds) ?? V_PHOTO_SECONDS;
      else {
        cin = fin(c.in, 0, MAX_TIME) ?? 0;
        out = Math.min(fin(c.out, 0, MAX_TIME) ?? m.srcDur, m.srcDur);
        if (!(cin < out)) {
          dropped.push('A video clip with nothing left to play was left out.');
          continue;
        }
      }
      clips.push({
        id: unique(c.id, 'v'),
        track: tr.id,
        start: fin(c.start, 0, MAX_TIME) ?? 0,
        media: m.id,
        kind: cKind,
        dur,
        in: cin,
        out,
        edit: mergeEdit(c.edit),
        motion: (MOTION_IDS.includes(c.motion as string) ? c.motion : cKind === 'photo' ? 'zoom-in' : 'none') as Motion,
        fade: c.fade === true,
        volume: fin(c.volume, 0, 1) ?? (cKind === 'video' ? 1 : 0),
      });
    }

    // Sound clips.
    const audio: DocAudio[] = [];
    for (const r of arr(o.audio)) {
      const a = obj(r);
      const tr = a && trackOf(a.track);
      const m = a && mediaOf(a.media);
      if (!a || !tr || tr.kind !== 'audio' || !m || m.kind !== 'audio') {
        dropped.push('A sound on a missing or picture track, or without its media, was left out.');
        continue;
      }
      audio.push({
        id: unique(a.id, 'a'),
        track: tr.id,
        start: fin(a.start, 0, MAX_TIME) ?? 0,
        media: m.id,
        in: Math.min(fin(a.in, 0, MAX_TIME) ?? 0, m.srcDur),
        volume: fin(a.volume, 0, 1) ?? 0.8,
        toEnd: a.toEnd !== false,
        srcDur: m.srcDur,
      });
    }

    const images = new Set(media.filter((m) => m.kind === 'image').map((m) => m.id));
    const layers = mergeLayers(o.layers, images);
    if (arr(o.layers).length > layers.length)
      dropped.push(`${arr(o.layers).length - layers.length} layer(s) couldn’t be read and were left out.`);

    return {
      doc: { version: 1, kind, format, fps, quality, fadeOut, tracks, clips: pack(clips), audio, layers, media },
      dropped,
    };
  } catch (e) {
    return {
      doc: emptyDoc(desktop),
      dropped: [...dropped, `The project couldn’t be read (${e instanceof Error ? e.message : 'unknown error'}).`],
    };
  }
}
