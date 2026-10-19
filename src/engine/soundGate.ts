import { isOneOf, isRecord } from './guards';
import { mergeKeys, type KeyBudget } from './keyframeGate';
import { LOUDNESS_RANGE } from './loudnessTargets';
import type { DocAudio, DocMedia } from './projectDoc';
import { SOUND_MIN, soundLength } from './soundClips';
import { DUCK_RANGES, type AudioTrackSettings, type SoundRole, type Track } from './tracks';

/*
 * The document gate for sound (208 §8, AC-11), beside projectGate.ts as speedGate.ts is: a sound track's settings, a
 * sound clip's out point, volume, fades, keys and name, overlapping sounds, and the loudness target. Each is read only
 * when there, mended into its range or left out with the reason, never throwing, so documents from before 208 read
 * and write as before.
 */

/** The longest source or timeline time read, seconds (a day; as projectGate.ts). */
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

/** What reading sound clips needs of the project gate: the tracks and media read, the keys left, reasons, ids. */
export interface SoundContext {
  tracks: Track[];
  media: DocMedia[];
  budget: KeyBudget;
  dropped: string[];
  /** A valid id not used yet (projectGate's `unique`). */
  unique: (value: unknown, prefix: string) => string;
}

const SOUND_ROLES: readonly SoundRole[] = ['music', 'voice', 'effects'];
/** A sound clip's longest fade, seconds (208 AC-2). */
const MAX_FADE = 10;

/** What the gate says about sound (208 AC-11), each once. */
export const SOUND_REASONS = {
  range: 'Some sound volumes, fades or in and out points were out of range and were adjusted.',
  unread: 'Some sound settings couldn’t be read and were left out.',
  overlap: 'Some sounds overlapped another sound on their track and were left out.',
  trackRange: 'Some sound track volumes or ducking settings were out of range and were adjusted.',
  trackUnread: 'Some sound track settings couldn’t be read and were left out.',
  loudnessRange: 'The loudness target was out of range and was adjusted.',
  loudnessUnread: 'The loudness target couldn’t be read, so loudness is off.',
} as const;

/**
 * Says a reason once.
 * @param dropped the gate's reasons
 * @param reason the reason
 */
const noteOnce = (dropped: string[], reason: string): void => {
  if (!dropped.includes(reason)) dropped.push(reason);
};

/**
 * A number clamped into a range, saying when it was out of it.
 * @param value the number
 * @param range the range
 * @param said called when it was out of range
 * @returns the number within the range
 */
function clampSaying(value: number, [low, high]: readonly [number, number], said: () => void): number {
  const clamped = Math.min(high, Math.max(low, value));
  if (clamped !== value) said();
  return clamped;
}

/**
 * A sound track's settings (208): role, volume, Solo, Counts as voice, ducking; each read only when there, clamped
 * into its range, or left out with the reason. A Voice track doesn't duck.
 * @param entry the document's track
 * @param dropped the gate's reasons
 * @returns the settings that were set
 */
export function readSoundTrack(entry: Record<string, unknown>, dropped: string[]): AudioTrackSettings {
  const unread = () => noteOnce(dropped, SOUND_REASONS.trackUnread);
  const range = () => noteOnce(dropped, SOUND_REASONS.trackRange);
  const settings: AudioTrackSettings = {};
  if (isOneOf(SOUND_ROLES, entry.role)) settings.role = entry.role;
  else if (entry.role !== undefined) unread();
  if (typeof entry.volume === 'number' && Number.isFinite(entry.volume)) settings.volume = clampSaying(entry.volume, [0, 2], range);
  else if (entry.volume !== undefined) unread();
  if (entry.solo === true) settings.solo = true;
  else if (entry.solo !== undefined && entry.solo !== false) unread();
  if (entry.voice === false) settings.voice = false;
  else if (entry.voice !== undefined && entry.voice !== true) unread();
  const duck = isRecord(entry.duck) ? entry.duck : null;
  if (duck && typeof duck.amount === 'number' && typeof duck.threshold === 'number' && settings.role !== 'voice')
    settings.duck = { amount: clampSaying(duck.amount, DUCK_RANGES.amount, range), threshold: clampSaying(duck.threshold, DUCK_RANGES.threshold, range) };
  else if (entry.duck !== undefined) unread();
  return settings;
}

/**
 * A sound clip's fades (208 AC-2): each 0–10 s (0 = none), together no longer than the clip (both scaled down when
 * they are); a fade that isn't a number is left out.
 * @param record the document's sound
 * @param length the clip's length, seconds (null for a toEnd clip, whose length follows the video)
 * @param dropped the gate's reasons
 * @returns the fades that are set
 */
function readFades(record: Record<string, unknown>, length: number | null, dropped: string[]): Pick<DocAudio, 'fadeIn' | 'fadeOut'> {
  const read = (value: unknown): number => {
    if (value === undefined) return 0;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      noteOnce(dropped, SOUND_REASONS.unread);
      return 0;
    }
    return clampSaying(value, [0, MAX_FADE], () => noteOnce(dropped, SOUND_REASONS.range));
  };
  let fadeIn = read(record.fadeIn);
  let fadeOut = read(record.fadeOut);
  if (length !== null && fadeIn + fadeOut > length + 1e-9) {
    const scale = length / (fadeIn + fadeOut);
    fadeIn *= scale;
    fadeOut *= scale;
    noteOnce(dropped, SOUND_REASONS.range);
  }
  return { ...(fadeIn ? { fadeIn } : {}), ...(fadeOut ? { fadeOut } : {}) };
}

/**
 * A sound clip's out point (208): its file's end when missing, past the file or not after its in point.
 * @param raw the document's `out`
 * @param inPoint the clip's in point
 * @param srcDur its file's length
 * @param dropped the gate's reasons
 * @returns seconds into the file
 */
function readOut(raw: unknown, inPoint: number, srcDur: number, dropped: string[]): number {
  if (raw === undefined) return srcDur;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    noteOnce(dropped, SOUND_REASONS.unread);
    return srcDur;
  }
  if (raw > srcDur || raw < inPoint + SOUND_MIN) {
    noteOnce(dropped, SOUND_REASONS.range);
    return srcDur;
  }
  return raw;
}

/**
 * One sound clip from a document (208 AC-11): its timing, volume (0–2), fades, volume keys and name.
 * @param record the document's sound
 * @param track its track
 * @param media its media
 * @param context what reading needs
 * @returns the sound clip
 */
function readSound(record: Record<string, unknown>, track: Track, media: DocMedia, context: SoundContext): DocAudio {
  const { dropped } = context;
  const inPoint = Math.min(numberIn(record.in, 0, MAX_TIME) ?? 0, media.srcDur);
  const toEnd = record.toEnd !== false;
  let volume = 0.8;
  if (typeof record.volume === 'number' && Number.isFinite(record.volume))
    volume = clampSaying(record.volume, [0, 2], () => noteOnce(dropped, SOUND_REASONS.range));
  else if (record.volume !== undefined) noteOnce(dropped, SOUND_REASONS.unread);
  const out = toEnd ? undefined : readOut(record.out, inPoint, media.srcDur, dropped);
  const keys = mergeKeys(record.keys, ['volume'], 'sound', context.budget);
  let name: string | undefined;
  if (typeof record.name === 'string') name = record.name.slice(0, 200) || undefined;
  else if (record.name !== undefined) noteOnce(dropped, SOUND_REASONS.unread);
  return {
    id: context.unique(record.id, 'a'),
    track: track.id,
    start: numberIn(record.start, 0, MAX_TIME) ?? 0,
    media: media.id,
    in: inPoint,
    ...(out === undefined ? {} : { out }),
    volume,
    ...readFades(record, out === undefined ? null : out - inPoint, dropped),
    ...(keys ? { keys } : {}),
    ...(name ? { name } : {}),
    toEnd,
    srcDur: media.srcDur,
  };
}

/**
 * A document's sound clips: on a sound track, with sound media; on each track, a sound overlapping one before it is
 * left out (the later goes first, 208 AC-11).
 * @param raw the document's `audio`
 * @param context what reading needs
 * @param videoEnd the video's length, seconds (where a toEnd sound ends)
 * @returns the sound clips, in the document's order
 */
export function readAudio(raw: unknown, context: SoundContext, videoEnd: number): DocAudio[] {
  const audio: DocAudio[] = [];
  for (const entry of listOf(raw)) {
    const record = isRecord(entry) ? entry : null;
    const track = record && context.tracks.find((candidate) => candidate.id === record.track);
    const media = record && context.media.find((candidate) => candidate.id === record.media);
    if (!record || track?.kind !== 'audio' || media?.kind !== 'audio') {
      context.dropped.push('A sound on a missing or picture track, or without its media, was left out.');
      continue;
    }
    audio.push(readSound(record, track, media, context));
  }
  const kept = new Set<DocAudio>();
  for (const sound of [...audio].sort((first, second) => first.start - second.start)) {
    const end = sound.start + soundLength(sound, videoEnd, audio);
    const clash = [...kept].some(
      (other) => other.track === sound.track && other.start < end - 1e-9 && sound.start < other.start + soundLength(other, videoEnd, audio) - 1e-9,
    );
    if (clash) noteOnce(context.dropped, SOUND_REASONS.overlap);
    else kept.add(sound);
  }
  return audio.filter((sound) => kept.has(sound));
}

/**
 * A document's loudness target (208 AC-8): within −24…−9 LUFS (clamped), missing = Off.
 * @param raw the document's `loudness`
 * @param dropped the gate's reasons
 * @returns LUFS, or undefined for Off
 */
export function readLoudness(raw: unknown, dropped: string[]): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    noteOnce(dropped, SOUND_REASONS.loudnessUnread);
    return undefined;
  }
  return clampSaying(raw, LOUDNESS_RANGE, () => noteOnce(dropped, SOUND_REASONS.loudnessRange));
}
