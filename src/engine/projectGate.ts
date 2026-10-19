/*
 * The single gate for project data from outside the running app (201; 203, 205, 206, 408): a project file, a saved
 * project or a 2.x project becomes a valid version 1 project, with each problem said once. Never throws.
 */
import { isOneOf, isRecord, keysOf } from './guards';
import { mergeEdit } from './instagram';
import { keyBudget, mergeKeys, type KeyBudget } from './keyframeGate';
import { CLIP_KEY_PROPS } from './keyframes';
import { mergeLayers } from './layerGate';
import {
  fromSequence,
  type DocClip,
  type DocMedia,
  type MediaKind,
  type ProjectDoc,
} from './projectDoc';
import {
  clampTransform,
  clipLength,
  isIdentity,
  pack,
  projectLength,
  TRANSFORM_RANGES,
  V_PHOTO_SECONDS,
  type ClipTransform,
  type TimedClip,
} from './timeline';
import {
  MAIN_VIDEO,
  MUSIC,
  TRACK_HEIGHTS,
  TRACK_LIMITS,
  defaultTracks,
  isPictureTrack,
  type Track,
  type TrackKind,
  type TrackLimits,
} from './tracks';
import type { TrackView } from './projectDoc';
import { readAudio, readLoudness, readSoundTrack } from './soundGate';
import { mergeSpeed } from './speedGate';
import { TRANSITION_REASONS, mergeTransition, tidyTransitions } from './transitions';
import { MOTIONS, type Motion } from './video';
import { V_FPS, formatsFor, limitsFor, type VFormatId, type VFps, type VKind, type VLimits, type VQuality } from './videoFormats';

/** An id in a document: a clip's, a sound's, a media entry's, a photo's (408). */
export const ID = /^[A-Za-z0-9_-]{1,40}$/;
const MEDIA_KINDS: readonly MediaKind[] = ['photo', 'video', 'audio', 'image'];
const TRACK_KINDS: readonly TrackKind[] = ['video', 'overlay', 'audio'];
const MOTION_IDS: readonly Motion[] = MOTIONS.map(([motion]) => motion);
/** The longest source or timeline time the gate accepts, seconds (a day). */
const MAX_TIME = 86400;

/**
 * A document's list.
 * @param value the document's value
 * @returns it when it is an array, else none
 */
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * A document's number within a range.
 * @param value the document's value
 * @param low the smallest allowed
 * @param high the largest allowed
 * @returns the number, or null when it isn't a finite number in range
 */
const numberIn = (value: unknown, low: number, high: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high ? value : null;

/**
 * A document's text, cut to a length.
 * @param value the document's value
 * @param max the longest allowed
 * @returns the text, or '' when it isn't a string
 */
const textOf = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

let idCounter = 0;

/**
 * A new id, unique in this session.
 * @param prefix the id's first letter (`v` for a clip, `a` for a sound)
 * @returns the id
 */
const freshId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

/**
 * The project a gate returns when there is nothing to read.
 * @param desktop whether this is the desktop app
 * @returns an empty reel
 */
function emptyDoc(desktop: boolean): ProjectDoc {
  return {
    version: 1,
    kind: 'reel',
    format: 'reel',
    fps: limitsFor('reel', desktop).fps.at(0) ?? V_FPS,
    quality: 'standard',
    fadeOut: true,
    magnetic: true,
    tracks: defaultTracks(),
    clips: [],
    audio: [],
    layers: [],
    media: [],
  };
}

/**
 * A 2.x document (no version) as a version 1 candidate, still to go through the gate.
 * @param document the 2.x document
 * @returns the candidate: its clips on the main track and its song on the music track
 */
function upgrade(document: Record<string, unknown>): Record<string, unknown> {
  const clips = listOf(document.clips).filter(isRecord);
  const music = isRecord(document.music) ? document.music : null;
  const sequence = fromSequence({
    clips: clips.map((clip) => ({
      ...clip,
      kind: clip.kind === 'video' ? ('video' as const) : ('photo' as const),
      dur: Number(clip.dur),
      in: Number(clip.in),
      out: Number(clip.out),
      id: String(clip.id),
    })),
    music: music
      ? { ...music, offset: Number(music.offset), volume: Number(music.volume), dur: Number(music.dur) }
      : null,
    layers: [],
    fadeOut: document.fadeOut !== false,
  });
  return {
    ...document,
    version: 1,
    tracks: sequence.tracks,
    clips: sequence.clips,
    audio: sequence.audio,
    music: undefined,
  };
}

/**
 * One track's clips in start order (equal starts keep the document's order), a clip that overlaps the one before it
 * moved to that clip's end, with a reason.
 * @param onTrack the track's clips
 * @param track the track
 * @param fits whether a placed clip starts within the length limit (it counts the ones that don't)
 * @param dropped the gate's reasons
 * @returns the placed clips that fit
 */
function placeInOrder<C extends TimedClip>(
  onTrack: C[],
  track: Track,
  fits: (clip: C) => boolean,
  dropped: string[],
): C[] {
  const where = track.id === MAIN_VIDEO ? 'the video track' : `the ${track.name} track`;
  const placedClips: C[] = [];
  let end = 0;
  onTrack.sort((left, right) => left.start - right.start);
  for (const clip of onTrack) {
    const start = clip.start < end - 1e-6 ? end : clip.start;
    const placed = start === clip.start ? clip : { ...clip, start };
    if (!fits(placed)) continue;
    if (start !== clip.start) dropped.push(`Two clips overlapped on ${where}; one was moved to after the other.`);
    end = Math.max(end, start + clipLength(clip));
    placedClips.push(placed);
  }
  return placedClips;
}

/**
 * The picture clips track by track, in the tracks' order: the main track packed (Magnetic on) or, like every overlay
 * track, its clips in start order (equal starts keep the document's order) with a clip that overlaps the one before it
 * moved to that clip's end, with a reason (D-009 D3, 203). A clip that then starts at or past the project's length
 * limit is left out, with a reason.
 * @param clips the clips read
 * @param tracks the project's tracks
 * @param magnetic whether the main track packs its clips
 * @param maxSeconds the project's length limit
 * @param dropped the gate's reasons
 * @returns the placed clips
 */
function placeClips<C extends TimedClip>(
  clips: C[],
  tracks: Track[],
  magnetic: boolean,
  maxSeconds: number,
  dropped: string[],
): C[] {
  const placedClips: C[] = [];
  const limit = maxSeconds % 60 ? `${maxSeconds}-second` : `${maxSeconds / 60}-minute`;
  let late = 0;
  const fits = (clip: C) => {
    if (clip.start < maxSeconds) return true;
    late++;
    return false;
  };
  for (const track of tracks.filter(isPictureTrack)) {
    const onTrack = clips.filter((clip) => clip.track === track.id);
    if (track.id === MAIN_VIDEO && magnetic) placedClips.push(...pack(onTrack).filter(fits));
    else placedClips.push(...placeInOrder(onTrack, track, fits, dropped));
  }
  if (late)
    dropped.push(
      late === 1
        ? `A clip didn’t fit within the ${limit} limit and was left out.`
        : `${late} clips didn’t fit within the ${limit} limit and were left out.`,
    );
  return placedClips;
}

/**
 * A clip's `transform` from a document as its `tf`, with a reason when it had no number to read, or a field was out of
 * range or missing.
 * @param raw the document's `transform`
 * @param dropped the gate's reasons
 * @returns the transform clamped, or undefined at the identity (or when missing)
 */
function readTransform(raw: unknown, dropped: string[]): ClipTransform | undefined {
  if (raw === undefined) return undefined;
  const record = isRecord(raw) ? raw : null;
  const fields = keysOf(TRANSFORM_RANGES);
  const given: Partial<ClipTransform> = {};
  for (const field of fields) {
    const value = record?.[field];
    if (typeof value === 'number') given[field] = value;
  }
  const transform = clampTransform(given);
  if (!record || !fields.some((field) => numberIn(record[field], -Infinity, Infinity) !== null)) {
    dropped.push('A clip’s position and size couldn’t be read; it fills the frame.');
    return undefined;
  }
  if (fields.some((field) => record[field] !== transform[field]))
    dropped.push('A clip’s position and size were out of range or incomplete and were adjusted.');
  return isIdentity(transform) ? undefined : transform;
}

/** A project's settings, as the gate reads them. */
interface Settings {
  kind: VKind;
  format: VFormatId;
  fps: VFps;
  quality: VQuality;
  fadeOut: boolean;
  magnetic: boolean;
  limits: VLimits;
}

/**
 * A document's settings: the kind and format (a desktop-only format only on desktop), frame rate within the limits,
 * quality, fade and Magnetic.
 * @param document the document
 * @param desktop whether this is the desktop app
 * @returns the settings, with the project's limits
 */
function readSettings(document: Record<string, unknown>, desktop: boolean): Settings {
  const kind: VKind = document.kind === 'vlog' ? 'vlog' : 'reel';
  const formats = formatsFor(kind);
  const chosen = formats.find((format) => format.id === document.format && (desktop || !format.desktopOnly));
  // Every kind has formats: 'reel' only completes the type.
  const format = chosen?.id ?? formats.at(0)?.id ?? 'reel';
  const limits = limitsFor(kind, desktop);
  const fps = isOneOf(limits.fps, document.fps) ? document.fps : (limits.fps.at(0) ?? V_FPS);
  const quality: VQuality = document.quality === 'high' ? 'high' : 'standard';
  return {
    kind,
    format,
    fps,
    quality,
    fadeOut: document.fadeOut !== false,
    magnetic: document.magnetic !== false,
    limits,
  };
}

/**
 * A document's media: entries with a valid, unique id and a known kind (the photo gate's too, 408).
 * @param raw the document's `media`
 * @param dropped the gate's reasons
 * @returns the media
 */
export function readMedia(raw: unknown, dropped: string[]): DocMedia[] {
  const media: DocMedia[] = [];
  for (const entry of listOf(raw)) {
    const id = isRecord(entry) ? entry.id : undefined;
    const kind = isRecord(entry) ? entry.kind : undefined;
    if (
      !isRecord(entry) ||
      typeof id !== 'string' ||
      !ID.test(id) ||
      media.some((other) => other.id === id) ||
      !isOneOf(MEDIA_KINDS, kind)
    ) {
      dropped.push('A media entry was unreadable and was left out.');
      continue;
    }
    media.push({
      id,
      kind,
      name: textOf(entry.name, 200),
      type: textOf(entry.type, 100),
      size: numberIn(entry.size, 0, Number.MAX_SAFE_INTEGER) ?? 0,
      w: Math.round(numberIn(entry.w, 0, 100000) ?? 0),
      h: Math.round(numberIn(entry.h, 0, 100000) ?? 0),
      srcDur: numberIn(entry.srcDur, 0, MAX_TIME) ?? 0,
    });
  }
  return media;
}

/**
 * A track's kind as the gate keeps it: the main track is the one video track and the music track a sound track; any
 * other video track is an overlay (203).
 * @param id the track's id
 * @param kind the document's kind
 * @returns the kind
 */
function trackKindFor(id: string, kind: TrackKind): TrackKind {
  if (id === MAIN_VIDEO) return 'video';
  if (id === MUSIC) return 'audio';
  return kind === 'video' ? 'overlay' : kind;
}

/**
 * Whether a track would pass the project's limits. The main video and music tracks never count against them: a slot is
 * kept for each until it is read.
 * @param id the track's id
 * @param kind its kind
 * @param tracks the tracks read so far
 * @param limits the project's track limits
 * @returns true when there is no room for it
 */
function overTrackLimit(id: string, kind: TrackKind, tracks: readonly Track[], limits: TrackLimits): boolean {
  if (id === MAIN_VIDEO || id === MUSIC) return false;
  const sound = kind === 'audio';
  const sameKind = tracks.filter(sound ? (track) => track.kind === 'audio' : isPictureTrack).length;
  const slotKept = tracks.some((track) => track.id === (sound ? MUSIC : MAIN_VIDEO)) ? 0 : 1;
  return sameKind >= (sound ? limits.audio : limits.visual) - slotKept;
}

/**
 * The name a track without one gets.
 * @param kind the track's kind
 * @returns the name
 */
function defaultTrackName(kind: TrackKind): string {
  if (kind === 'audio') return 'Audio';
  return kind === 'overlay' ? 'Overlay' : 'Video';
}

/**
 * One track from a document.
 * @param entry the document's track
 * @param tracks the tracks read so far
 * @param limits the project's track limits
 * @param dropped the gate's reasons
 * @returns the track, or null when it is left out
 */
function readTrack(entry: unknown, tracks: readonly Track[], limits: TrackLimits, dropped: string[]): Track | null {
  const id = isRecord(entry) ? entry.id : undefined;
  const rawKind = isRecord(entry) ? entry.kind : undefined;
  if (
    !isRecord(entry) ||
    typeof id !== 'string' ||
    !ID.test(id) ||
    tracks.some((track) => track.id === id) ||
    !isOneOf(TRACK_KINDS, rawKind)
  ) {
    dropped.push('A track was unreadable and was left out.');
    return null;
  }
  const kind = trackKindFor(id, rawKind);
  const name = textOf(entry.name, 40) || defaultTrackName(kind);
  if (overTrackLimit(id, kind, tracks, limits)) {
    dropped.push(
      `A project holds up to ${limits.visual} picture and ${limits.audio} sound tracks here; “${name}” was left out.`,
    );
    return null;
  }
  if (kind === 'overlay' && rawKind === 'video')
    dropped.push(`The “${name}” track became an overlay track: a project has one main video track.`);
  return {
    id,
    kind,
    name,
    hidden: entry.hidden === true,
    // The main track has Hide only (201 D2): its clips' sound is set per clip.
    muted: kind !== 'video' && entry.muted === true,
    locked: entry.locked === true,
    ...(kind === 'audio' ? readSoundTrack(entry, dropped) : {}),
  };
}

/**
 * A document's tracks: the main video and music tracks always exist, with their kinds; the rest within the limits.
 * The main track is the bottom picture track: nothing is drawn under it (203 Q10).
 * @param raw the document's `tracks`
 * @param desktop whether this is the desktop app
 * @param dropped the gate's reasons
 * @returns the tracks
 */
function readTracks(raw: unknown, desktop: boolean, dropped: string[]): Track[] {
  const limits = TRACK_LIMITS(desktop);
  const tracks: Track[] = [];
  for (const entry of listOf(raw)) {
    const track = readTrack(entry, tracks, limits, dropped);
    if (track) tracks.push(track);
  }
  // Missing ones are added: the slots kept for them mean no other track has to go.
  for (const missing of defaultTracks())
    if (!tracks.some((track) => track.id === missing.id))
      tracks.splice(missing.kind === 'video' ? 0 : tracks.length, 0, missing);
  const firstPicture = tracks.findIndex(isPictureTrack);
  const main = tracks.findIndex((track) => track.id === MAIN_VIDEO);
  if (main !== firstPicture) {
    tracks.splice(firstPicture, 0, ...tracks.splice(main, 1));
    dropped.push('The main video track was moved below the overlay tracks.');
  }
  return tracks;
}

/** What reading clips and sounds needs. */
interface ClipContext {
  tracks: Track[];
  media: DocMedia[];
  limits: VLimits;
  budget: KeyBudget;
  dropped: string[];
  /** A valid id not used yet: the document's when it is, else a fresh one (with a reason when it was taken). */
  unique: (value: unknown, prefix: string) => string;
}

/**
 * Makes the gate's id checker.
 * @param dropped the gate's reasons
 * @returns `unique` (see `ClipContext`)
 */
function uniqueIds(dropped: string[]): ClipContext['unique'] {
  const ids = new Set<string>();
  return (value, prefix) => {
    let id = typeof value === 'string' && ID.test(value) ? value : '';
    if (!id || ids.has(id)) {
      if (id) dropped.push(`Two items had the id “${id}”; one was renamed.`);
      id = freshId(prefix);
    }
    ids.add(id);
    return id;
  };
}

/**
 * The motion a clip without a known one gets.
 * @param kind the clip's kind
 * @returns a slow zoom for a photo, none for a video
 */
const defaultMotion = (kind: 'photo' | 'video'): Motion => (kind === 'photo' ? 'zoom-in' : 'none');

/** A clip's timing as the gate reads it. */
interface ClipTimes {
  dur: number;
  in: number;
  out: number;
}

/**
 * A clip's timing: a photo's seconds on screen, or the part of a video's source it plays (within the source).
 * @param entry the document's clip
 * @param kind the clip's kind
 * @param media the clip's media
 * @param limits the project's limits
 * @returns the timing, or null for a video with nothing left to play
 */
function readClipTimes(
  entry: Record<string, unknown>,
  kind: 'photo' | 'video',
  media: DocMedia,
  limits: VLimits,
): ClipTimes | null {
  if (kind === 'photo') return { dur: numberIn(entry.dur, 0, limits.seconds) ?? V_PHOTO_SECONDS, in: 0, out: 0 };
  const inPoint = numberIn(entry.in, 0, MAX_TIME) ?? 0;
  const out = Math.min(numberIn(entry.out, 0, MAX_TIME) ?? media.srcDur, media.srcDur);
  // Not `in >= out`: a NaN must fail too.
  const playsForward = inPoint < out;
  return playsForward ? { dur: 0, in: inPoint, out } : null;
}

/**
 * One picture clip from a document: on a picture track, with media of its kind and something to play.
 * @param entry the document's clip
 * @param context what reading needs
 * @returns the clip, or null when it is left out
 */
function readClip(entry: unknown, context: ClipContext): DocClip | null {
  const { dropped } = context;
  if (!isRecord(entry)) {
    dropped.push('A clip was unreadable and was left out.');
    return null;
  }
  const kind = entry.kind === 'video' ? 'video' : 'photo';
  const track = context.tracks.find((candidate) => candidate.id === entry.track);
  if (!track || !isPictureTrack(track)) {
    dropped.push('A clip on a missing or sound track was left out.');
    return null;
  }
  const media = context.media.find((candidate) => candidate.id === entry.media);
  if (media?.kind !== kind) {
    dropped.push(`A ${kind} clip without its media was left out.`);
    return null;
  }
  const times = readClipTimes(entry, kind, media, context.limits);
  if (!times) {
    dropped.push('A video clip with nothing left to play was left out.');
    return null;
  }
  const tf = readTransform(entry.transform, dropped);
  const keys = mergeKeys(entry.keys, CLIP_KEY_PROPS, 'clip', context.budget);
  const transition = mergeTransition(entry.transition, dropped);
  // Speed, reverse, ramps and freeze frames (207): a freeze frame's `dur` is its length, as a photo's.
  const { dur: stillFor, ...speed } = mergeSpeed(entry, kind, media.srcDur, dropped);
  return {
    id: context.unique(entry.id, 'v'),
    track: track.id,
    start: numberIn(entry.start, 0, MAX_TIME) ?? 0,
    media: media.id,
    kind,
    dur: stillFor ?? times.dur,
    in: times.in,
    out: times.out,
    edit: mergeEdit(entry.edit),
    motion: isOneOf(MOTION_IDS, entry.motion) ? entry.motion : defaultMotion(kind),
    fade: entry.fade === true,
    volume: numberIn(entry.volume, 0, 1) ?? (kind === 'video' ? 1 : 0),
    ...(tf ? { tf } : {}),
    ...(keys ? { keys } : {}),
    ...(transition ? { transition } : {}),
    ...speed,
  };
}

/**
 * A document's picture clips, at most the project's clip limit.
 * @param raw the document's `clips`
 * @param context what reading needs
 * @returns the clips, not yet placed
 */
function readClips(raw: unknown, context: ClipContext): DocClip[] {
  const entries = listOf(raw);
  const most = context.limits.clips;
  if (entries.length > most)
    context.dropped.push(`A project holds up to ${most} clips here; ${entries.length - most} were left out.`);
  const clips: DocClip[] = [];
  for (const entry of entries.slice(0, most)) {
    const clip = readClip(entry, context);
    if (clip) clips.push(clip);
  }
  return clips;
}

/**
 * A document's version as text, for the message about a newer version.
 * @param value the document's `version`
 * @returns the text (an object as JSON, not "[object Object]")
 */
export const versionText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : JSON.stringify(value);

/** The longest project name (408). */
export const NAME_MAX = 80;

/**
 * A saved project's name (408, the photo gate's too): trimmed and cut to 80 characters, an emoji counting as one.
 * @param value the document's `name`
 * @param dropped the gate's reasons
 * @returns the name, or undefined when it is missing, empty or not text
 */
export function readName(value: unknown, dropped: string[]): string | undefined {
  if (typeof value !== 'string') {
    if (value !== undefined) dropped.push('The project’s name couldn’t be read.');
    return undefined;
  }
  const letters = Array.from(new Intl.Segmenter().segment(value.trim()), (part) => part.segment);
  return letters.slice(0, NAME_MAX).join('').trim() || undefined;
}

/** What a saved project keeps of its view and its name (408). */
type ProjectView = Pick<ProjectDoc, 'name' | 'playhead' | 'trackView'>;

/**
 * A saved project's name, playhead and track heights (408): the name as `readName` reads it, the playhead within the
 * project's length, heights only for the project's tracks.
 * @param document the document
 * @param tracks the project's tracks, as read
 * @param length the project's length, seconds
 * @param dropped the gate's reasons
 * @returns the fields that are set
 */
function readView(document: Record<string, unknown>, tracks: readonly Track[], length: number, dropped: string[]): ProjectView {
  const name = readName(document.name, dropped);
  const view: ProjectView = name ? { name } : {};
  if (typeof document.playhead === 'number' && Number.isFinite(document.playhead))
    view.playhead = Math.min(Math.max(0, document.playhead), length);
  if (isRecord(document.trackView)) {
    const ids = new Set(tracks.map((track) => track.id));
    const trackView: TrackView = {};
    for (const [id, height] of Object.entries(document.trackView))
      if (ids.has(id) && isOneOf(TRACK_HEIGHTS, height)) trackView[id] = height;
    if (Object.keys(trackView).length) view.trackView = trackView;
  }
  return view;
}

/** What the gate returns. */
export interface MergedProject {
  doc: ProjectDoc;
  /** What was dropped or changed, and why: each reason once, for the user. */
  dropped: string[];
}

/**
 * Reads a version 1 document (see `mergeProject`).
 * @param document the document
 * @param desktop whether this is the desktop app
 * @param dropped the gate's reasons
 * @returns the project
 */
function readProject(document: Record<string, unknown>, desktop: boolean, dropped: string[]): ProjectDoc {
  const settings = readSettings(document, desktop);
  const media = readMedia(document.media, dropped);
  const tracks = readTracks(document.tracks, desktop, dropped);
  // Keyframes: 5,000 in the whole project, clips first, then layers (205 Q5).
  const budget = keyBudget(dropped);
  const context: ClipContext = { tracks, media, limits: settings.limits, budget, dropped, unique: uniqueIds(dropped) };
  const clips = readClips(document.clips, context);
  // Transitions only on cuts between touching clips, fitting in them (206 AC-4, AC-5), once the clips are placed.
  const placed = tidyTransitions(
    placeClips(clips, tracks, settings.magnetic, settings.limits.seconds, dropped),
    settings.fps,
  );
  if (placed.dropped.length && !dropped.includes(TRANSITION_REASONS.cut)) dropped.push(TRANSITION_REASONS.cut);
  const audio = readAudio(document.audio, context, projectLength({ tracks, clips: placed.clips, audio: [], layers: [], fadeOut: false }));
  const loudness = readLoudness(document.loudness, dropped);
  const images = new Set(media.filter((entry) => entry.kind === 'image').map((entry) => entry.id));
  const layers = mergeLayers(document.layers, images, budget);
  const layersRead = listOf(document.layers).length;
  if (layersRead > layers.length)
    dropped.push(`${layersRead - layers.length} layer(s) couldn’t be read and were left out.`);
  const { kind, format, fps, quality, fadeOut, magnetic } = settings;
  const view = readView(document, tracks, projectLength({ tracks, clips: placed.clips, audio: [], layers: [], fadeOut }), dropped);
  return {
    version: 1,
    ...view,
    kind,
    format,
    fps,
    quality,
    fadeOut,
    magnetic,
    ...(loudness === undefined ? {} : { loudness }),
    tracks,
    clips: placed.clips,
    audio,
    layers,
    media,
  };
}

/**
 * The single gate for project data from outside the running app (project files; 2.x projects). Values out of range
 * are clamped or replaced by defaults; clips on a missing or wrong track or without their media, and unknown fields,
 * are dropped; ids are made unique; a clip's `transform` is clamped into its `tf`; the main track is the one video track
 * and the bottom picture track; it is packed (with Magnetic off: sorted, overlaps moved apart, as overlay tracks always
 * are). Never throws.
 * @param raw the parsed document
 * @param desktop whether this is the desktop app (its limits and formats)
 * @returns a valid version 1 project and what it dropped or changed, and why
 */
export function mergeProject(raw: unknown, desktop: boolean): MergedProject {
  const dropped: string[] = [];
  try {
    if (!isRecord(raw)) return { doc: emptyDoc(desktop), dropped: ['This isn’t a project.'] };
    if (raw.version !== undefined && raw.version !== 1)
      return {
        doc: emptyDoc(desktop),
        dropped: [
          `This project is from a newer version of Chitthi Studio (version ${versionText(raw.version).slice(0, 10)}).`,
        ],
      };
    const document = raw.version === undefined ? upgrade(raw) : raw;
    return { doc: readProject(document, desktop, dropped), dropped };
  } catch (error) {
    return {
      doc: emptyDoc(desktop),
      dropped: [
        ...dropped,
        `The project couldn’t be read (${error instanceof Error ? error.message : 'unknown error'}).`,
      ],
    };
  }
}
