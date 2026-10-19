import {
  DUCK_DEFAULTS,
  addAudioTrack,
  addTrack as withNewTrack,
  deleteTrack as withoutTrack,
  moveTrack as withTrackMoved,
  patchTrack,
  renameTrack as withTrackRenamed,
  setAudioTrack,
  soundRole,
  type AudioTrackPatch,
  type Ducking,
  type SoundRole,
  type Track,
  type TrackSwitches,
} from '../engine/tracks';
import { isDesktop } from '../platform/desktop';
import { change, getVideo, setVideo, type TrackHeight, type VState } from './videoStore';

/*
 * The video editor's track actions (201, 203, 208): hide / mute / solo / lock, add, rename, move and delete overlay and
 * sound tracks, a sound track's role, volume and ducking, track heights, and where a clip sits among its track's clips.
 * Each change is one undo step (a slider's drag, one).
 */

/**
 * Hides / mutes / solos / locks a track (one undo step each; Hide is for picture tracks, Mute for sound and overlay
 * tracks: an overlay clip's own sound, 203 Q7; Solo for sound tracks, heard in the preview only, 208 Q2).
 * @param id the track
 * @param patch the switches to change
 */
export function setTrack(id: string, patch: Partial<TrackSwitches>): void {
  const tracks = patchTrack(getVideo().tracks, id, patch);
  if (tracks !== getVideo().tracks) change('', { tracks });
}

/**
 * Adds an empty overlay track at the top of the picture tracks (203 Q12).
 * @returns null, or why not (the track limit)
 */
export function addTrack(): string | null {
  const result = withNewTrack(getVideo().tracks, isDesktop);
  if ('error' in result) return result.error;
  change('', { tracks: result.tracks });
  return null;
}

/**
 * Renames a track (1–40 characters).
 * @param id the track
 * @param name the new name
 * @returns null, or why not
 */
export function renameTrack(id: string, name: string): string | null {
  const result = withTrackRenamed(getVideo().tracks, id, name);
  if ('error' in result) return result.error;
  if (result.tracks !== getVideo().tracks) change('', { tracks: result.tracks });
  return null;
}

/**
 * Moves an overlay track one place up (+1, drawn later) or down among the overlay tracks.
 * @param id the track
 * @param by up or down
 * @returns null, or why not
 */
export function moveTrack(id: string, by: 1 | -1): string | null {
  const result = withTrackMoved(getVideo().tracks, id, by);
  if ('error' in result) return result.error;
  change('', { tracks: result.tracks });
  return null;
}

/**
 * Deletes an overlay or sound track with its clips (the UI asks first when it holds any).
 * @param id the track
 * @returns null, or why not
 */
export function deleteTrack(id: string): string | null {
  const video = getVideo();
  const result = withoutTrack(video.tracks, video.clips, id, video.sounds);
  if ('error' in result) return result.error;
  const selected = result.clips.some((clip) => clip.id === video.selected) ? video.selected : (result.clips.at(0)?.id ?? null);
  change('', { tracks: result.tracks, clips: result.clips, sounds: result.audio }, { selected });
  return null;
}

/**
 * Adds an empty sound track after the last one, "Audio N", role Effects (208 AC-1).
 * @returns null, or why not (8 sound tracks)
 */
export function addSoundTrack(): string | null {
  const result = addAudioTrack(getVideo().tracks);
  if ('error' in result) return result.error;
  change('', { tracks: result.tracks });
  return null;
}

/**
 * Changes a sound track's settings through the engine's rules.
 * @param key the undo step's key ('' for a step of its own)
 * @param id the track
 * @param patch the settings
 * @returns null, or why not
 */
function patchSoundTrack(key: string, id: string, patch: AudioTrackPatch): string | null {
  const result = setAudioTrack(getVideo().tracks, id, patch);
  if ('error' in result) return result.error;
  if (result.tracks !== getVideo().tracks) change(key, { tracks: result.tracks });
  return null;
}

/**
 * A sound track's role (208 Q3): making it Voice turns its ducking off.
 * @param id the track
 * @param role Music, Voice or Effects
 * @returns null, or why not
 */
export const setTrackRole = (id: string, role: SoundRole): string | null => patchSoundTrack('', id, { role });

/**
 * A sound track's volume, 0–200 % (Q8); a slider's drag is one undo step.
 * @param id the track
 * @param volume 0–2
 * @returns null, or why not
 */
export const setTrackVolume = (id: string, volume: number): string | null => patchSoundTrack(`track-volume:${id}`, id, { volume });

/**
 * Whether a sound track counts as voice for ducking (Q10).
 * @param id the track
 * @param on counts as voice
 * @returns null, or why not
 */
export const setCountsAsVoice = (id: string, on: boolean): string | null => patchSoundTrack('', id, { voice: on });

/**
 * A Music or Effects track's ducking (AC-6): on with an amount and threshold, or off (null). Turning it on or off is a
 * step of its own; dragging its sliders, one.
 * @param id the track
 * @param duck the amount and threshold, or null for off
 * @returns null, or why not
 */
export function setDucking(id: string, duck: Ducking | null): string | null {
  const track = getVideo().tracks.find((candidate) => candidate.id === id);
  const switching = !track?.duck || duck === null;
  return patchSoundTrack(switching ? '' : `duck:${id}`, id, { duck });
}

/**
 * Whether every Music track is lowered under the voice (the Audio panel's switch, Q9).
 * @returns true when there is a Music track and each has ducking on
 */
export function lowerMusicUnderVoice(): boolean {
  const music = getVideo().tracks.filter((track) => track.kind === 'audio' && soundRole(track) === 'music');
  return music.length > 0 && music.every((track) => track.duck);
}

/**
 * Lower music under voice (Q9): ducking on for every Music track (at the defaults where it was off), or off for all,
 * as one undo step.
 * @param on on or off
 */
export function setLowerMusicUnderVoice(on: boolean): void {
  let tracks = getVideo().tracks;
  for (const track of tracks) {
    if (track.kind !== 'audio' || soundRole(track) !== 'music') continue;
    const result = setAudioTrack(tracks, track.id, { duck: on ? (track.duck ?? { ...DUCK_DEFAULTS }) : null });
    if (!('error' in result)) tracks = result.tracks;
  }
  if (tracks !== getVideo().tracks) change('', { tracks });
}

/**
 * The picture tracks a clip can be on.
 * @param video the state
 * @returns the main track first, then the overlay tracks
 */
export const pictureTracks = (video: VState = getVideo()): Track[] => video.tracks.filter((track) => track.kind === 'video' || track.kind === 'overlay');

/** A clip's track and its number on that track. */
export interface ClipPlace {
  track: Track;
  /** From 1: the inspector's "Clip N" and the timeline's labels. */
  n: number;
}

/**
 * A clip's track and its number on that track.
 * @param id the clip
 * @param video the state
 * @returns its place, or null when there is no such clip
 */
export function clipPlace(id: string, video: VState = getVideo()): ClipPlace | null {
  const clip = video.clips.find((candidate) => candidate.id === id);
  const track = clip && video.tracks.find((candidate) => candidate.id === clip.track);
  return clip && track ? { track, n: video.clips.filter((candidate) => candidate.track === clip.track).indexOf(clip) + 1 } : null;
}

/**
 * Sets a track's height on the timeline (a view setting: not undone).
 * @param id the track
 * @param height small, medium or large
 */
export const setTrackHeight = (id: string, height: TrackHeight): void => {
  setVideo({ trackView: { ...getVideo().trackView, [id]: height } });
};
