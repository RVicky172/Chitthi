/*
 * The video editor's tracks (P2.1, 201; overlay tracks 203), free of DOM and React: the main video and music tracks
 * every project has, their switches (hide, mute, lock), and adding, renaming, moving and deleting overlay tracks.
 */
import type { Refusal } from './edits';
import type { TimedClip } from './timeline';

/** What a track holds: the main video, overlay pictures, or sound. */
export type TrackKind = 'video' | 'overlay' | 'audio';

/**
 * A sound track's own settings (208), as saved. Each is written only when it differs from the default, so a track
 * without them (every picture track, every track saved before 208) means today's behaviour.
 */
export interface AudioTrackSettings {
  /** What it holds; missing = Music for the music track, Effects for any other (Q3). */
  role?: SoundRole;
  /** Its volume, 0–2; missing = 1 (Q8). */
  volume?: number;
  /** Only soloed sound tracks are heard in the preview; missing = not soloed (Q2). */
  solo?: true;
  /** false when its sound doesn't count as voice for ducking; missing = it does (Q10). */
  voice?: false;
  /** Music or Effects: lowered under the voice; missing = no ducking (Q9). */
  duck?: Ducking;
}

/** A track of the project, as saved (its field names are the document's); sound tracks add their settings. */
export interface Track extends AudioTrackSettings {
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

/** What an audio track holds (208 Q3): ducking listens to Voice and lowers Music (and Effects when turned on). */
export type SoundRole = 'music' | 'voice' | 'effects';

/** How a track is lowered under the voice (208 AC-6). */
export interface Ducking {
  /** How far it goes down, dB (3–30). */
  amount: number;
  /** The voice's loudness above which it counts as speaking, dBFS (−60 to −20). */
  threshold: number;
}

/** Ducking's starting values (208 AC-6). */
export const DUCK_DEFAULTS: Readonly<Ducking> = { amount: 12, threshold: -40 };
/** Ducking's ranges (208 AC-6). */
export const DUCK_RANGES = { amount: [3, 30], threshold: [-60, -20] } as const;

/** A track's height on the timeline (Q5): small 40 px, medium 64 px (2.x's rows), large 96 px. */
export type TrackHeight = 'small' | 'medium' | 'large';
/** Every track height. */
export const TRACK_HEIGHTS: readonly TrackHeight[] = ['small', 'medium', 'large'];

/** The main video track and the music track: every project has them. */
export const MAIN_VIDEO = 'V1';
export const MUSIC = 'A1';

/**
 * A new project's tracks.
 * @returns the main video track and the music track
 */
export const defaultTracks = (): Track[] => [
  { id: MAIN_VIDEO, kind: 'video', name: 'Video', hidden: false, muted: false, locked: false },
  { id: MUSIC, kind: 'audio', name: 'Music', hidden: false, muted: false, locked: false },
];

/** A track's switches: its saved ones, and Solo as on / off (saved only while on). */
export interface TrackSwitches extends Pick<Track, 'hidden' | 'muted' | 'locked'> {
  solo: boolean;
}

/**
 * A track with its switches changed: Hide applies to picture tracks, Mute to sound and overlay tracks (an overlay
 * clip's own sound, 203 Q7; the main track keeps Hide only, 201 D2), Solo to sound tracks (208 Q2), Lock to all.
 * @param tracks the project's tracks
 * @param id the track's id
 * @param patch the switches to change
 * @returns the new tracks; the same array when nothing changes (unknown track, a switch the track doesn't have, or the
 *   value it already has)
 */
export function patchTrack(tracks: Track[], id: string, patch: Partial<TrackSwitches>): Track[] {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return tracks;
  const isSound = track.kind === 'audio';
  const next: Track = {
    ...track,
    hidden: !isSound && patch.hidden !== undefined ? patch.hidden : track.hidden,
    muted: track.kind !== 'video' && patch.muted !== undefined ? patch.muted : track.muted,
    locked: patch.locked ?? track.locked,
  };
  // Solo is written only while on, so tracks without it stay as saved.
  const solo = isSound && patch.solo !== undefined ? patch.solo : Boolean(track.solo);
  if (solo) next.solo = true;
  else delete next.solo;
  const same =
    next.hidden === track.hidden &&
    next.muted === track.muted &&
    next.locked === track.locked &&
    solo === Boolean(track.solo);
  if (same) return tracks;
  return tracks.map((other) => (other === track ? next : other));
}

/**
 * Why a track's clips can't be changed.
 * @param tracks the project's tracks
 * @param id the track's id
 * @returns the reason, or null when they can (unknown tracks aren't locked)
 */
export function lockedReason(tracks: Track[], id: string): string | null {
  const track = tracks.find((candidate) => candidate.id === id);
  return track?.locked ? `The ${track.name} track is locked. Unlock it to change its clips.` : null;
}

/** How many tracks a project may have. */
export interface TrackLimits {
  /** Picture tracks: the main video track and the overlays. */
  visual: number;
  /** Sound tracks. */
  audio: number;
}

/**
 * How many picture (video + overlay) and sound tracks a project may have (Q4; 201 uses 1 + 1).
 * @param desktop whether this is the desktop app
 * @returns the limits
 */
export const TRACK_LIMITS = (desktop: boolean): TrackLimits =>
  // Sound tracks cost no decoders by themselves, so the browser holds as many as the desktop app (208 D2).
  desktop ? { visual: 8, audio: 8 } : { visual: 4, audio: 8 };

/**
 * Why Add track is refused at the picture track limit (the button shows it).
 * @param desktop whether this is the desktop app
 * @returns the message
 */
export const tooManyTracks = (desktop: boolean): string =>
  desktop
    ? `A project holds up to ${TRACK_LIMITS(true).visual} picture tracks.`
    : `A project holds up to ${TRACK_LIMITS(false).visual} picture tracks in the browser (memory); the desktop app allows ${TRACK_LIMITS(true).visual}.`;

/**
 * Whether a track shows pictures.
 * @param track the track
 * @returns true for the main video track and the overlay tracks
 */
export const isPictureTrack = (track: Track) => track.kind === 'video' || track.kind === 'overlay';

const OVERLAY_ID = /^O(\d+)$/;
const OVERLAY_NAME = /^Overlay (\d+)$/;

/**
 * The lowest whole number from 1 that none of the values use.
 * @param values ids or names
 * @param pattern finds the number in one, as its first group
 * @returns the number
 */
const lowestFree = (values: string[], pattern: RegExp) => {
  const used = new Set<number>();
  for (const value of values) {
    const digits = pattern.exec(value)?.[1];
    if (digits) used.add(Number(digits));
  }
  let free = 1;
  while (used.has(free)) free++;
  return free;
};

/** A track added, as `addTrack` returns it. */
export interface TrackAdded {
  tracks: Track[];
  /** The new track's id. */
  id: string;
}

/**
 * A new empty overlay track at the top of the picture tracks (above the last one, below the sound tracks), named
 * "Overlay N" with the lowest free N (203 Q12).
 * @param tracks the project's tracks
 * @param desktop whether this is the desktop app (its limits)
 * @returns the new tracks and the new track's id, or a refusal at the picture track limit
 */
export function addTrack(tracks: Track[], desktop: boolean): TrackAdded | Refusal {
  if (tracks.filter(isPictureTrack).length >= TRACK_LIMITS(desktop).visual) return { error: tooManyTracks(desktop) };
  const ids = tracks.map((track) => track.id);
  const names = tracks.map((track) => track.name);
  const id = `O${lowestFree(ids, OVERLAY_ID)}`;
  const name = `Overlay ${lowestFree(names, OVERLAY_NAME)}`;
  const at = tracks.findLastIndex(isPictureTrack) + 1;
  const track: Track = { id, kind: 'overlay', name, hidden: false, muted: false, locked: false };
  return { tracks: [...tracks.slice(0, at), track, ...tracks.slice(at)], id };
}

const NO_TRACK = 'That track isn’t in the project.';
const AUDIO_ID = /^A(\d+)$/;

/**
 * A new empty audio track after the last audio track, "Audio N" with the lowest free N (A1 is the Music track), role
 * Effects (208 AC-1).
 * @param tracks the project's tracks
 * @returns the new tracks and the new track's id, or a refusal at the sound track limit (8 everywhere, D2)
 */
export function addAudioTrack(tracks: Track[]): TrackAdded | Refusal {
  const limit = TRACK_LIMITS(false).audio;
  if (tracks.filter((track) => track.kind === 'audio').length >= limit)
    return { error: `A project holds up to ${limit} sound tracks.` };
  const number = lowestFree(
    tracks.map((track) => track.id),
    AUDIO_ID,
  );
  const id = `A${number}`;
  const track: Track = { id, kind: 'audio', name: `Audio ${number}`, hidden: false, muted: false, locked: false, role: 'effects' };
  const at = tracks.findLastIndex((other) => other.kind === 'audio') + 1;
  return { tracks: [...tracks.slice(0, at), track, ...tracks.slice(at)], id };
}

/**
 * An audio track's role (208 Q3).
 * @param track the track
 * @returns its role; missing = Music for the music track, Effects for any other
 */
export const soundRole = (track: Track): SoundRole => track.role ?? (track.id === MUSIC ? 'music' : 'effects');

/**
 * An audio track's volume (208 Q8).
 * @param track the track
 * @returns 0–2; missing = 1
 */
export const trackVolume = (track: Track): number => track.volume ?? 1;

/**
 * Whether a track's sound counts as voice for ducking (208 Q10) when its role or kind makes it a voice source.
 * @param track the track
 * @returns false only when switched off
 */
export const countsAsVoice = (track: Track): boolean => track.voice !== false;

/**
 * An audio track's settings to change (208 AC-1, AC-6): role and volume as saved; Counts as voice as on / off
 * (`voice: true` back on) and `duck: null` to turn ducking off.
 */
export interface AudioTrackPatch extends Pick<AudioTrackSettings, 'role' | 'volume'> {
  voice?: boolean;
  duck?: Ducking | null;
}

const clamp = (value: number, [low, high]: readonly [number, number]) => Math.min(high, Math.max(low, value));

/**
 * An audio track with its settings changed: volume clamped to 0–2, ducking to its ranges; a Voice track doesn't duck
 * (it is what ducking listens to), so making a track Voice turns its ducking off.
 * @param tracks the project's tracks
 * @param id the track's id
 * @param patch the settings
 * @returns the new tracks (the same array when nothing changes), or why not
 */
export function setAudioTrack(tracks: Track[], id: string, patch: AudioTrackPatch): TracksChanged | Refusal {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return { error: NO_TRACK };
  if (track.kind !== 'audio') return { error: 'Only sound tracks have a role, a volume and ducking.' };
  const role = patch.role ?? soundRole(track);
  if (patch.duck && role === 'voice') return { error: `The ${track.name} track is a Voice track: ducking lowers music under it.` };
  const next: Track = { ...track };
  if (patch.role !== undefined) next.role = patch.role;
  if (patch.volume !== undefined) next.volume = clamp(patch.volume, [0, 2]);
  if (patch.voice === false) next.voice = false;
  else if (patch.voice) delete next.voice;
  if (patch.duck)
    next.duck = { amount: clamp(patch.duck.amount, DUCK_RANGES.amount), threshold: clamp(patch.duck.threshold, DUCK_RANGES.threshold) };
  if (patch.duck === null || role === 'voice') delete next.duck;
  const same =
    soundRole(next) === soundRole(track) &&
    trackVolume(next) === trackVolume(track) &&
    countsAsVoice(next) === countsAsVoice(track) &&
    next.duck?.amount === track.duck?.amount &&
    next.duck?.threshold === track.duck?.threshold;
  if (same) return { tracks };
  return { tracks: tracks.map((other) => (other === track ? next : other)) };
}

const MAIN_FIXED = 'The main video track stays the bottom picture track.';

/** Tracks changed, as `renameTrack` and `moveTrack` return them. */
export interface TracksChanged {
  /** The new tracks: the same array when nothing changed. */
  tracks: Track[];
}

/**
 * A track renamed. Any track: the UI offers it for overlay tracks only (AC-1).
 * @param tracks the project's tracks
 * @param id the track's id
 * @param name the new name (trimmed; 1–40 characters)
 * @returns the new tracks (the same array when the name doesn't change), or why not
 */
export function renameTrack(tracks: Track[], id: string, name: string): TracksChanged | Refusal {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return { error: NO_TRACK };
  const trimmed = name.trim();
  if (!trimmed) return { error: 'A track needs a name.' };
  if (trimmed.length > 40) return { error: 'A track name can be up to 40 characters.' };
  if (trimmed === track.name) return { tracks };
  return { tracks: tracks.map((other) => (other === track ? { ...other, name: trimmed } : other)) };
}

/**
 * Where a track would go one place along: among the overlay tracks for an overlay (+1 up, drawn later; the main video
 * track stays the bottom picture track, 203 Q10), among the sound tracks for a sound track (+1 down, 208 AC-1).
 * @param tracks the project's tracks
 * @param track the track to move
 * @param by +1 or −1
 * @returns the index to swap with, or why not
 */
function moveTarget(tracks: Track[], track: Track, by: 1 | -1): number | Refusal {
  const kind = track.kind;
  const same = tracks.flatMap((other, index) => (other.kind === kind ? [index] : []));
  const place = same.indexOf(tracks.indexOf(track)) + by;
  const to = same.at(place);
  if (place >= 0 && to !== undefined) return to;
  if (kind === 'audio')
    return { error: `The ${track.name} track is already the ${place < 0 ? 'first' : 'last'} sound track.` };
  if (place < 0) return { error: `The ${track.name} track is already just above the main video track.` };
  return { error: `The ${track.name} track is already the top track.` };
}

/**
 * A track moved one place among the tracks of its kind: overlay tracks among the overlays, sound tracks among the
 * sound tracks (208 AC-1); the main video track doesn't move.
 * @param tracks the project's tracks
 * @param id the track's id
 * @param by +1 for up (overlays, drawn later) or down (sound tracks), −1 the other way
 * @returns the new tracks, or why not
 */
export function moveTrack(tracks: Track[], id: string, by: 1 | -1): TracksChanged | Refusal {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return { error: NO_TRACK };
  if (track.kind === 'video') return { error: MAIN_FIXED };
  const to = moveTarget(tracks, track, by);
  if (typeof to !== 'number') return to;
  const from = tracks.indexOf(track);
  const swapped = tracks.at(to);
  if (!swapped) return { error: NO_TRACK };
  return {
    tracks: tracks.map((other, index) => {
      if (index === from) return swapped;
      return index === to ? track : other;
    }),
  };
}

/** A track deleted, as `deleteTrack` returns it. */
export interface TrackDeleted<C, A> {
  tracks: Track[];
  /** The picture clips without the track's. */
  clips: C[];
  /** The sound clips without the track's (208). */
  audio: A[];
}

/**
 * A track deleted with its clips: an overlay track, or a sound track while another sound track is left (208 AC-1);
 * the main video track can't be, nor a locked track.
 * @param tracks the project's tracks
 * @param clips the picture clips
 * @param id the track's id
 * @param audio the sound clips
 * @returns the new tracks and clips, or why not
 */
export function deleteTrack<C extends TimedClip, A extends { track: string } = never>(
  tracks: Track[],
  clips: C[],
  id: string,
  audio: A[] = [],
): TrackDeleted<C, A> | Refusal {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return { error: NO_TRACK };
  if (track.kind === 'video') return { error: 'The main video track can’t be deleted.' };
  if (track.kind === 'audio' && tracks.filter((other) => other.kind === 'audio').length <= 1)
    return { error: 'A project keeps at least one sound track.' };
  if (track.locked) return { error: `The ${track.name} track is locked. Unlock it to delete it.` };
  return {
    tracks: tracks.filter((other) => other !== track),
    clips: clips.filter((clip) => clip.track !== id),
    audio: audio.filter((sound) => sound.track !== id),
  };
}
