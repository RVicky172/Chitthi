/*
 * The video editor's tracks (P2.1, 201; overlay tracks 203), free of DOM and React: the main video and music tracks
 * every project has, their switches (hide, mute, lock), and adding, renaming, moving and deleting overlay tracks.
 */
import type { Refusal } from './edits';
import type { TimedClip } from './timeline';

/** What a track holds: the main video, overlay pictures, or sound. */
export type TrackKind = 'video' | 'overlay' | 'audio';

/** A track of the project, as saved (its field names are the document's). */
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

/**
 * A new project's tracks.
 * @returns the main video track and the music track
 */
export const defaultTracks = (): Track[] => [
  { id: MAIN_VIDEO, kind: 'video', name: 'Video', hidden: false, muted: false, locked: false },
  { id: MUSIC, kind: 'audio', name: 'Music', hidden: false, muted: false, locked: false },
];

/** A track's switches. */
export type TrackSwitches = Pick<Track, 'hidden' | 'muted' | 'locked'>;

/**
 * A track with its switches changed: Hide applies to picture tracks, Mute to sound and overlay tracks (an overlay
 * clip's own sound, 203 Q7; the main track keeps Hide only, 201 D2), Lock to all.
 * @param tracks the project's tracks
 * @param id the track's id
 * @param patch the switches to change
 * @returns the new tracks; the same array when nothing changes (unknown track, a switch the track doesn't have, or the
 *   value it already has)
 */
export function patchTrack(tracks: Track[], id: string, patch: Partial<TrackSwitches>): Track[] {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return tracks;
  const showsPictures = track.kind !== 'audio';
  const next: Track = {
    ...track,
    hidden: showsPictures && patch.hidden !== undefined ? patch.hidden : track.hidden,
    muted: track.kind !== 'video' && patch.muted !== undefined ? patch.muted : track.muted,
    locked: patch.locked ?? track.locked,
  };
  if (next.hidden === track.hidden && next.muted === track.muted && next.locked === track.locked) return tracks;
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
  desktop ? { visual: 8, audio: 8 } : { visual: 4, audio: 4 };

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
 * An overlay track moved one place among the overlay tracks; the main video track stays the bottom picture track
 * (203 Q10), sound tracks don't move.
 * @param tracks the project's tracks
 * @param id the track's id
 * @param by +1 for up (drawn later), −1 for down
 * @returns the new tracks, or why not
 */
export function moveTrack(tracks: Track[], id: string, by: 1 | -1): TracksChanged | Refusal {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return { error: NO_TRACK };
  if (track.id === MAIN_VIDEO) return { error: MAIN_FIXED };
  if (track.kind !== 'overlay') return { error: 'Only overlay tracks can be moved.' };
  const overlays = tracks.flatMap((other, index) => (other.kind === 'overlay' ? [index] : []));
  const from = tracks.indexOf(track);
  const place = overlays.indexOf(from) + by;
  if (place >= overlays.length) return { error: `The ${track.name} track is already the top track.` };
  if (place < 0) return { error: `The ${track.name} track is already just above the main video track.` };
  const to = overlays.at(place);
  const swapped = to === undefined ? undefined : tracks.at(to);
  if (!swapped) return { error: NO_TRACK };
  return {
    tracks: tracks.map((other, index) => {
      if (index === from) return swapped;
      return index === to ? track : other;
    }),
  };
}

/** A track deleted, as `deleteTrack` returns it. */
export interface TrackDeleted<C> {
  tracks: Track[];
  /** The clips without the track's. */
  clips: C[];
}

/**
 * An overlay track deleted with its clips; the main video and sound tracks can't be, nor a locked track.
 * @param tracks the project's tracks
 * @param clips the picture clips
 * @param id the track's id
 * @returns the new tracks and clips, or why not
 */
export function deleteTrack<C extends TimedClip>(tracks: Track[], clips: C[], id: string): TrackDeleted<C> | Refusal {
  const track = tracks.find((candidate) => candidate.id === id);
  if (!track) return { error: NO_TRACK };
  if (track.id === MAIN_VIDEO) return { error: 'The main video track can’t be deleted.' };
  if (track.kind !== 'overlay') return { error: 'Only overlay tracks can be deleted.' };
  if (track.locked) return { error: `The ${track.name} track is locked. Unlock it to delete it.` };
  return { tracks: tracks.filter((other) => other !== track), clips: clips.filter((clip) => clip.track !== id) };
}
