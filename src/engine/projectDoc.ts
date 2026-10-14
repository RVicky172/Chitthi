/*
 * The video project as a document (201): its JSON shape, a 2.x project (clips in a row) on tracks, and the JSON
 * written to a project file. Reading one back goes through projectGate.ts.
 */
import type { IgEdit } from './instagram';
import { tidyKeys } from './keyframes';
import type { Layer } from './layers';
import {
  clampTransform,
  isIdentity,
  pack,
  type AudioClip,
  type ClipTiming,
  type ClipTransform,
  type Project,
  type TimedClip,
} from './timeline';
import { MAIN_VIDEO, MUSIC, defaultTracks } from './tracks';
import { transitionFields } from './transitions';
import type { Motion } from './video';
import type { VFormatId, VFps, VKind, VQuality } from './videoFormats';

/** What a media file is. */
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
  /** In the document only: the clip's `tf` (203), written when it isn't the identity; the gate turns it into `tf`. */
  transform?: ClipTransform;
}

/** A sound clip as saved, with the media it plays. */
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
  /** The main track packs its clips end to end (202); missing in a document = on. */
  magnetic?: boolean;
}

/** A 2.x clip: its timing and id. */
export interface SequenceClip extends ClipTiming {
  id: string;
}

/** A 2.x song: where it starts in its file, its volume and its length. */
export interface SequenceMusic {
  offset: number;
  volume: number;
  dur: number;
}

/** A 2.x project: clips in a row and one song. */
export interface Sequence<C extends SequenceClip, M extends SequenceMusic> {
  clips: C[];
  music: M | null;
  layers: Layer[];
  fadeOut: boolean;
}

/** A 2.x song as a music clip: the song's other fields are kept. */
export type MusicClip<M extends SequenceMusic> = AudioClip & Omit<M, 'offset' | 'volume' | 'dur'>;

/** A 2.x project on tracks, as `fromSequence` returns it. */
export type SequenceProject<C extends SequenceClip, M extends SequenceMusic> = Project<
  C & Pick<TimedClip, 'track' | 'start'>
> & { audio: MusicClip<M>[] };

/**
 * A 2.x project on tracks: the clips back to back on the main video track, the song as a music clip that plays to the
 * end of the video from its offset. Every other field of the clips and the song is kept.
 * @param sequence the 2.x project
 * @returns the project on tracks
 */
export function fromSequence<C extends SequenceClip, M extends SequenceMusic>(
  sequence: Sequence<C, M>,
): SequenceProject<C, M> {
  const clips = pack(sequence.clips.map((clip) => ({ ...clip, track: MAIN_VIDEO, start: 0 })));
  let audio: MusicClip<M>[] = [];
  if (sequence.music) {
    const { offset, volume, dur, ...rest } = sequence.music;
    audio = [{ ...rest, id: 'music', track: MUSIC, start: 0, in: offset, volume, toEnd: true, srcDur: dur }];
  }
  return { tracks: defaultTracks(), clips, audio, layers: sequence.layers, fadeOut: sequence.fadeOut };
}

/**
 * A picture clip as written to a document: only its own fields, in the document's order; its `tf` as `transform`, only
 * when it isn't the identity; its keyframes (205) only when it has some; its transition's fields only.
 * @param clip the clip
 * @returns the clip's JSON form
 */
function clipDocument(clip: DocClip): DocClip {
  const {
    id,
    track,
    start,
    media,
    kind,
    dur,
    in: inPoint,
    out,
    edit,
    motion,
    fade,
    volume,
    tf,
    transform,
    keys,
  } = clip;
  const box = clampTransform(tf ?? transform);
  const kept = keys && tidyKeys(keys);
  return {
    id,
    track,
    start,
    media,
    kind,
    dur,
    in: inPoint,
    out,
    edit,
    motion,
    fade,
    volume,
    ...(isIdentity(box) ? {} : { transform: box }),
    ...(kept ? { keys: kept } : {}),
    ...(clip.transition ? { transition: transitionFields(clip.transition) } : {}),
  };
}

/**
 * The JSON form of a project: only the fields a project is made of (no files, URLs, thumbnails or view state). So
 * 201 / 202 documents stay as they were.
 * @param project the project
 * @returns its document
 */
export function toDocument(project: ProjectDoc): ProjectDoc {
  return {
    version: 1,
    kind: project.kind,
    format: project.format,
    fps: project.fps,
    quality: project.quality,
    fadeOut: project.fadeOut,
    magnetic: project.magnetic !== false,
    tracks: project.tracks.map(({ id, kind, name, hidden, muted, locked }) => ({
      id,
      kind,
      name,
      hidden,
      muted,
      locked,
    })),
    clips: project.clips.map(clipDocument),
    audio: project.audio.map(({ id, track, start, media, in: inPoint, volume, toEnd, srcDur }) => ({
      id,
      track,
      start,
      media,
      in: inPoint,
      volume,
      toEnd,
      srcDur,
    })),
    layers: project.layers,
    media: project.media.map(({ id, kind, name, type, size, w: width, h: height, srcDur }) => ({
      id,
      kind,
      name,
      type,
      size,
      w: width,
      h: height,
      srcDur,
    })),
  };
}
