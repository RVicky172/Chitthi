/*
 * The video project as a document (201): its JSON shape, a 2.x project (clips in a row) on tracks, the JSON written
 * to a project file, and the editor's project to and from a document (408). Reading one back goes through
 * projectGate.ts.
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
import { MAIN_VIDEO, MUSIC, defaultTracks, type TrackHeight } from './tracks';
import { speedFields } from './speed';
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
  /** A voice take recorded in the app (504 D3); missing for other files and takes from before 504. */
  recorded?: true;
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
  /** The export's loudness target, LUFS (208 AC-8); missing = Off (every project from before 208, Q12). */
  loudness?: number;
  /** The project's name (408), 1–80 characters; missing in documents from before 408. */
  name?: string;
  /** Where the playhead was, seconds (408); missing = the start. */
  playhead?: number;
  /** Track heights by track id (408); missing = every track medium. */
  trackView?: TrackView;
}

/** Track heights by track id; a track not listed is medium. */
export type TrackView = Partial<Record<string, TrackHeight>>;

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
 * when it isn't the identity; its keyframes (205) only when it has some; its transition's fields only; its speed
 * fields (207) only when it has some.
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
    ...speedFields(clip),
  };
}

/**
 * The JSON form of a project: only the fields a project is made of (no files, URLs or thumbnails; of the view, only
 * the playhead and track heights, 408). Fields added later are written only when set, so older documents stay as they
 * were.
 * @param project the project
 * @returns its document
 */
export function toDocument(project: ProjectDoc): ProjectDoc {
  return {
    version: 1,
    ...(project.name === undefined ? {} : { name: project.name }),
    kind: project.kind,
    format: project.format,
    fps: project.fps,
    quality: project.quality,
    fadeOut: project.fadeOut,
    magnetic: project.magnetic !== false,
    ...(project.loudness === undefined ? {} : { loudness: project.loudness }),
    ...(project.playhead === undefined ? {} : { playhead: project.playhead }),
    ...(project.trackView && Object.keys(project.trackView).length ? { trackView: { ...project.trackView } } : {}),
    // A sound track's settings (208) are written only when set, so older documents stay as they were.
    tracks: project.tracks.map(({ id, kind, name, hidden, muted, locked, role, volume, solo, voice, duck }) => ({
      id,
      kind,
      name,
      hidden,
      muted,
      locked,
      ...(role ? { role } : {}),
      ...(volume === undefined ? {} : { volume }),
      ...(solo ? { solo } : {}),
      ...(voice === false ? { voice } : {}),
      ...(duck ? { duck: { amount: duck.amount, threshold: duck.threshold } } : {}),
    })),
    clips: project.clips.map(clipDocument),
    audio: project.audio.map(({ id, track, start, media, in: inPoint, out, volume, fadeIn, fadeOut, keys, name, toEnd, srcDur }) => {
      const kept = keys ? tidyKeys(keys) : undefined;
      return {
        id,
        track,
        start,
        media,
        in: inPoint,
        ...(out === undefined || toEnd ? {} : { out }),
        volume,
        ...(fadeIn ? { fadeIn } : {}),
        ...(fadeOut ? { fadeOut } : {}),
        ...(kept ? { keys: kept } : {}),
        ...(name ? { name } : {}),
        toEnd,
        srcDur,
      };
    }),
    layers: project.layers,
    media: project.media.map(({ id, kind, name, type, size, w: width, h: height, srcDur, recorded }) => ({
      id,
      kind,
      name,
      type,
      size,
      w: width,
      h: height,
      srcDur,
      ...(recorded ? { recorded } : {}),
    })),
  };
}

/* ---------- the editor's project (408) ---------- */

/** What a document needs to know about a file the editor holds: a Blob, or a file on disk (408 §5). */
export interface MediaLike {
  /** Bytes. */
  size: number;
  /** MIME type. */
  type: string;
}

/** A picture clip in the editor: its document fields, its file and what the file is (the store adds its previews). */
export interface EditorClip<F extends MediaLike> extends Omit<DocClip, 'media' | 'transform'> {
  name: string;
  file: F;
  /** Pixel size of the picture. */
  w: number;
  h: number;
  /** Video: length of the source file in seconds (0 for photos). */
  srcDur: number;
}

/** A sound clip in the editor: the clip and its file (a recorded take's marked, 504 D3). */
export interface EditorSound<F extends MediaLike> extends AudioClip {
  file: F;
  recorded?: true;
}

/** A file in the editor's media pool (504) that no clip may use: what its media entry says, and its file. */
export interface EditorPoolItem<F extends MediaLike> extends Pick<DocMedia, 'name' | 'w' | 'h' | 'srcDur' | 'recorded'> {
  kind: 'video' | 'photo' | 'audio';
  file: F;
}

/** The editor's project, as `videoDocument` reads it and `videoFromDocument` gives it (the store's `VState` is one). */
export interface EditorVideo<F extends MediaLike>
  extends Pick<ProjectDoc, 'kind' | 'format' | 'fps' | 'quality' | 'tracks' | 'layers' | 'fadeOut'> {
  clips: EditorClip<F>[];
  sounds: EditorSound<F>[];
  magnetic: boolean;
  /** LUFS, or Off. */
  loudness: 'off' | number;
  /** Playhead, seconds. */
  t: number;
  trackView: TrackView;
  /** Files imported into the media pool (504); those in use are listed with their clips. */
  pool: EditorPoolItem<F>[];
}

/** A project opened from a document: the editor's project and its name. */
export interface OpenedVideo<F extends MediaLike> {
  name: string;
  video: EditorVideo<F>;
}

/**
 * A copy of a JSON value with every object's keys in code-unit order, so the document's bytes don't depend on the
 * order a layer or an edit was built in (the editor's own, or the gate's after reopening).
 * @param value a JSON value
 * @returns the copy
 */
export function sortedKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortedKeys) as T; // the same array, element by element
  if (value === null || typeof value !== 'object') return value;
  const names = Object.keys(value).sort((first, second) => Number(first > second) - Number(first < second));
  // The same object with its keys in another order.
  return Object.fromEntries(names.map((name) => [name, sortedKeys((value as Record<string, unknown>)[name])])) as T;
}

/**
 * The document of the editor's project: its clips and sounds with their media ids, each file listed once in the order
 * it is first used (clips, then sounds, then the image layers' pictures), the name, the playhead and the track heights;
 * layers and edits with their keys sorted, so the same project always gives the same bytes.
 * @param video the editor's project
 * @param name the project's name
 * @param mediaId the media id a file was kept under
 * @param images the media of the image layers' pictures
 * @returns the document, as `toDocument` writes it
 */
export function videoDocument<F extends MediaLike>(
  video: EditorVideo<F>,
  name: string,
  mediaId: (file: F) => string,
  images: readonly DocMedia[] = [],
): ProjectDoc {
  const media = new Map<string, DocMedia>();
  const listed = (entry: DocMedia): string => {
    if (!media.has(entry.id)) media.set(entry.id, entry);
    return entry.id;
  };
  const clips = video.clips.map(({ file, name: fileName, w: width, h: height, srcDur, ...clip }): DocClip => {
    const { size, type } = file;
    const id = listed({ id: mediaId(file), kind: clip.kind, name: fileName, type, size, w: width, h: height, srcDur });
    return { ...clip, edit: sortedKeys(clip.edit), media: id };
  });
  // A recorded take is marked on its file's entry, not on the sound clip (504 D3).
  const audio = video.sounds.map(({ file, recorded, ...sound }): DocAudio => {
    const { size, type } = file;
    const id = listed({ id: mediaId(file), kind: 'audio', name: sound.name ?? '', type, size, w: 0, h: 0, srcDur: sound.srcDur, ...(recorded ? { recorded } : {}) });
    return { ...sound, media: id };
  });
  images.forEach(listed);
  // The media pool's files no clip uses, after the rest (504 §4).
  for (const { file, kind, name: fileName, w: width, h: height, srcDur, recorded } of video.pool) {
    const { size, type } = file;
    listed({ id: mediaId(file), kind, name: fileName, type, size, w: width, h: height, srcDur, ...(recorded ? { recorded } : {}) });
  }
  const { kind, format, fps, quality, tracks, layers, fadeOut, magnetic, loudness, t: playhead, trackView } = video;
  return toDocument({
    version: 1,
    name,
    kind,
    format,
    fps,
    quality,
    fadeOut,
    magnetic,
    ...(loudness === 'off' ? {} : { loudness }),
    playhead,
    trackView,
    tracks,
    clips,
    audio,
    layers: sortedKeys(layers),
    media: [...media.values()],
  });
}

/**
 * The editor's project from a document that went through the gate (`mergeProject`, which turns a clip's `transform`
 * into its `tf`): each clip and sound with the file `open` gives for its media; a clip takes its name, size and
 * length from its media entry.
 * @param doc the document, after the gate
 * @param open the file for a media entry, asked once per entry (a missing file is the opener's to mark, 408 D4)
 * @returns the editor's project and its name
 */
export function videoFromDocument<F extends MediaLike>(doc: ProjectDoc, open: (media: DocMedia) => F): OpenedVideo<F> {
  const entries = new Map(doc.media.map((entry) => [entry.id, entry]));
  const files = new Map<string, F>();
  const fileOf = (entry: DocMedia): F => {
    const file = files.get(entry.id) ?? open(entry);
    files.set(entry.id, file);
    return file;
  };
  const clips: EditorClip<F>[] = [];
  // After the gate a clip's box is its `tf`: the document's `transform` is gone.
  for (const { media, ...clip } of doc.clips) {
    const entry = entries.get(media);
    if (entry) clips.push({ ...clip, name: entry.name, file: fileOf(entry), w: entry.w, h: entry.h, srcDur: entry.srcDur });
  }
  const sounds: EditorSound<F>[] = [];
  for (const { media, ...sound } of doc.audio) {
    const entry = entries.get(media);
    if (entry) sounds.push({ ...sound, file: fileOf(entry), ...(entry.recorded ? { recorded: entry.recorded } : {}) });
  }
  // The media pool (504 §4): the files no clip or sound clip uses (an image layer's picture is no pool file).
  const pool: EditorPoolItem<F>[] = [];
  for (const entry of doc.media) {
    const { id, kind, name, w, h, srcDur, recorded } = entry;
    if (kind === 'image' || files.has(id)) continue;
    pool.push({ kind, name, file: fileOf(entry), w, h, srcDur, ...(recorded ? { recorded } : {}) });
  }
  const { kind, format, fps, quality, tracks, layers, fadeOut } = doc;
  return {
    name: doc.name ?? '',
    video: {
      kind,
      format,
      fps,
      quality,
      tracks,
      layers,
      fadeOut,
      clips,
      sounds,
      magnetic: doc.magnetic !== false,
      loudness: doc.loudness ?? 'off',
      t: doc.playhead ?? 0,
      trackView: { ...doc.trackView },
      pool,
    },
  };
}
