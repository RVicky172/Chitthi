import { addTrack as withNewTrack, deleteTrack as withoutTrack, moveTrack as withTrackMoved, patchTrack, renameTrack as withTrackRenamed, type Track } from '../engine/tracks';
import { isDesktop } from '../platform/desktop';
import { change, getVideo, setVideo, type TrackHeight, type VState } from './videoStore';

/*
 * The video editor's track actions (201, 203): hide / mute / lock, add, rename, move and delete overlay tracks, track
 * heights, and where a clip sits among its track's clips. Each change is one undo step.
 */

/**
 * Hides / mutes / locks a track (one undo step each; Hide is for picture tracks, Mute for sound and overlay tracks:
 * an overlay clip's own sound, 203 Q7).
 * @param id the track
 * @param patch the switches to change
 */
export function setTrack(id: string, patch: Partial<Pick<Track, 'hidden' | 'muted' | 'locked'>>): void {
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
 * Deletes an overlay track with its clips (the UI asks first when it holds any).
 * @param id the track
 * @returns null, or why not
 */
export function deleteTrack(id: string): string | null {
  const video = getVideo();
  const result = withoutTrack(video.tracks, video.clips, id);
  if ('error' in result) return result.error;
  const selected = result.clips.some((clip) => clip.id === video.selected) ? video.selected : (result.clips.at(0)?.id ?? null);
  change('', { tracks: result.tracks, clips: result.clips }, { selected });
  return null;
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
