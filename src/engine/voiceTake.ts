/*
 * Voice-over takes (209), free of DOM and React: which track a take is recorded onto, its name, when recording is
 * refused, where on the timeline the take's first sample belongs, and what screen readers hear (AC-10).
 */
import type { Refusal } from './edits';
import type { Replaced } from './soundClips';
import { formatTime, type AudioClip } from './timeline';
import { addAudioTrack, lockedReason, setAudioTrack, soundRole, type Track } from './tracks';

/** The track a take goes onto, and the project's tracks with it (a new Voice track when one was added). */
export interface RecordTarget {
  track: string;
  /** The same array when no track was added. */
  tracks: Track[];
}

/**
 * Whether a track is a Voice track.
 * @param track the track
 * @returns true for a sound track whose role is Voice
 */
const isVoiceTrack = (track: Track): boolean => track.kind === 'audio' && soundRole(track) === 'voice';

/**
 * The Voice track a take is recorded onto (AC-1): the one whose button was used, else the selected Voice track, else
 * the first Voice track; with none, a new sound track named "Voice" with role Voice.
 * @param tracks the project's tracks
 * @param chosen the track whose record button was used, or null
 * @param selected the selected track, or null
 * @returns the track and the tracks, or why not (the sound track limit)
 */
export function recordTarget(tracks: Track[], chosen: string | null, selected: string | null): RecordTarget | Refusal {
  const voiceTracks = tracks.filter(isVoiceTrack);
  const found =
    voiceTracks.find((track) => track.id === chosen) ??
    voiceTracks.find((track) => track.id === selected) ??
    voiceTracks[0];
  if (found) return { track: found.id, tracks };
  const added = addAudioTrack(tracks);
  if ('error' in added) return added;
  const named = added.tracks.map((track) => (track.id === added.id ? { ...track, name: 'Voice' } : track));
  const voiced = setAudioTrack(named, added.id, { role: 'voice' });
  if ('error' in voiced) return voiced;
  return { track: added.id, tracks: voiced.tracks };
}

const TAKE_NAME = /^Voice (\d+)$/;

/**
 * A new take's name (AC-1): "Voice N", N one more than the highest "Voice N" in the project.
 * @param sounds the project's sound clips
 * @returns the name
 */
export function takeName(sounds: readonly Pick<AudioClip, 'name'>[]): string {
  let highest = 0;
  for (const sound of sounds) {
    const number = Number(TAKE_NAME.exec(sound.name ?? '')?.[1] ?? 0);
    highest = Math.max(highest, number);
  }
  return `Voice ${highest + 1}`;
}

/** What `canRecord` needs to know about the project. */
export interface RecordContext {
  tracks: Track[];
  /** The video's length, s. */
  length: number;
  /** The playhead, s. */
  playhead: number;
}

/**
 * Why a take can't be recorded onto a track now (AC-1).
 * @param project the project's tracks, length and playhead
 * @param track the track to record onto
 * @returns the reason, or null when it can
 */
export function canRecord(project: RecordContext, track: string): string | null {
  if (project.length <= 0) return 'Add a video or photo first: a voice is recorded over the video.';
  if (project.playhead >= project.length) return 'The playhead is at the end of the video. Move it back to record.';
  return lockedReason(project.tracks, track);
}

/** The Recording offset's limit either way, s (AC-3, Q10). */
export const RECORD_OFFSET_MAX = 0.25;

/** The clocks a take is placed by (§3): all wall times are `performance.now()`, ms. */
export interface TakeTiming {
  /** The playhead when playback began, s. */
  playStart: number;
  /** The wall time then, ms. */
  playWall: number;
  /** The wall time of the recorder's start event (the take's first sample), ms. */
  captureWall: number;
  /** How long the microphone's sound takes to reach the recorder, s. */
  inputLatency: number;
  /** The Recording offset, s (kept within ±0.25). */
  offset: number;
}

/**
 * Where a take's first sample belongs on the timeline (AC-3): the playhead when capture began, less the input
 * latency (the take's first sample was spoken that much earlier), plus the Recording offset.
 * @param timing the clocks
 * @returns seconds on the timeline, at least 0
 */
export function takeStart(timing: TakeTiming): number {
  const playheadAtCapture = timing.playStart + (timing.captureWall - timing.playWall) / 1000;
  const offset = Math.min(RECORD_OFFSET_MAX, Math.max(-RECORD_OFFSET_MAX, timing.offset));
  return Math.max(0, playheadAtCapture - timing.inputLatency + offset);
}

/* ---------- announcements (AC-10) ---------- */

/** A take on the timeline: its name, place and length (s), and what it replaced. */
export interface PlacedTake {
  name: string;
  start: number;
  length: number;
  replaced: Replaced[];
}

/** Too loud is said at most this often, ms. */
export const TOO_LOUD_EVERY_MS = 5_000;

/**
 * One second of the count-in.
 * @param seconds the seconds left
 * @param first whether it is the count-in's first second
 * @returns "Recording in 3" for the first, then "2", "1"
 */
export const announceCountIn = (seconds: number, first: boolean): string =>
  first ? `Recording in ${seconds}` : String(seconds);

/**
 * The start of a take.
 * @param track the track's name
 * @returns e.g. "Recording on Voice"
 */
export const announceStart = (track: string): string => `Recording on ${track}`;

/**
 * The result of a take.
 * @param placed the take
 * @returns e.g. "Voice 2 added at 0:12.4, 8.6 s; replaced 2.1 s of Voice 1"
 */
export function announceResult(placed: PlacedTake): string {
  const added = `${placed.name} added at ${formatTime(placed.start)}, ${placed.length.toFixed(1)} s`;
  if (placed.replaced.length === 0) return added;
  const parts = placed.replaced.map((part) => `${part.seconds.toFixed(1)} s of ${part.name}`);
  return `${added}; replaced ${parts.join(' and ')}`;
}

/**
 * Whether Too loud may be said again.
 * @param saidAt when it was last said, ms, or null
 * @param now the time now, ms
 * @returns true when it was never said or at least TOO_LOUD_EVERY_MS ago
 */
export const tooLoudDue = (saidAt: number | null, now: number): boolean =>
  saidAt === null || now - saidAt >= TOO_LOUD_EVERY_MS;
