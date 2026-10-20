import { change, getVideo, poolKey, poolOf, usesOf, type PoolItem, type PoolUse, type VState } from './videoStore';

/*
 * The voice takes of the video project (505 §2), as the Audio panel's Recordings list shows them: the recorded files of
 * the media pool with where they are used, and renaming one. Adding a take again and deleting it are the pool's own
 * (`addFromPool`, `removeFromPool`, 504).
 */

/** A take in the Recordings list. */
export interface TakeRow {
  /** Its file's pool key (`poolKey`). */
  key: string;
  item: PoolItem;
  /** The sound clips that use it, in the store's order. */
  uses: PoolUse[];
  /** Its first use on the timeline (the earliest), or null when it is unused. */
  place: TakePlace | null;
}

/** Where a take's clip sits: the clip, its track (id and name) and its start, s. */
export interface TakePlace {
  sound: string;
  trackId: string;
  track: string;
  start: number;
}

/** `takesOf`'s last answer and what it was made from (a store selector must give the same value for the same state). */
let takesMemo: { items: PoolItem[]; sounds: VState['sounds']; tracks: VState['tracks']; rows: TakeRow[] } | null = null;

/**
 * The order of the list: newest first, takes without a time last, by name (Voice 9 before Voice 10).
 * @param first a take
 * @param second another
 * @returns negative when the first goes first
 */
function newestFirst(first: TakeRow, second: TakeRow): number {
  const firstAt = first.item.recordedAt;
  const secondAt = second.item.recordedAt;
  if (firstAt !== undefined && secondAt !== undefined) return secondAt - firstAt;
  if (firstAt !== undefined || secondAt !== undefined) return firstAt === undefined ? 1 : -1;
  return first.item.name.localeCompare(second.item.name, undefined, { numeric: true });
}

/**
 * The project's voice takes (AC-1): every recorded file of the media pool, newest first, with its uses and where the
 * first of them (the earliest on the timeline) sits. A selector: the same array until the pool, sounds or tracks change.
 * @param video the state
 * @returns the rows
 */
export function takesOf(video: VState): TakeRow[] {
  const items = poolOf(video);
  const { sounds, tracks } = video;
  if (takesMemo?.items === items && takesMemo.sounds === sounds && takesMemo.tracks === tracks) return takesMemo.rows;
  const rows = items
    .filter((item) => item.recorded)
    .map((item): TakeRow => {
      const key = poolKey(item);
      const uses = usesOf(video, key);
      const used = sounds.filter((sound) => poolKey(sound) === key);
      const first = used.reduce<(typeof used)[number] | null>((earliest, sound) => (earliest && earliest.start <= sound.start ? earliest : sound), null);
      const trackName = (id: string): string => tracks.find((track) => track.id === id)?.name ?? id;
      const place = first ? { sound: first.id, trackId: first.track, track: trackName(first.track), start: first.start } : null;
      return { key, item, uses, place };
    })
    .sort(newestFirst);
  takesMemo = { items, sounds, tracks, rows };
  return rows;
}

/**
 * Renames a take (AC-1): its pool item and every sound clip of its file, which shows the file's name (208), as one
 * undo step.
 * @param key the take's pool key
 * @param name the new name (trimmed)
 * @returns null once renamed, else why not
 */
export function renameTake(key: string, name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Give the recording a name.';
  const video = getVideo();
  const pool = video.pool.map((item) => (poolKey(item) === key ? { ...item, name: trimmed } : item));
  const sounds = video.sounds.map((sound) => (poolKey(sound) === key ? { ...sound, name: trimmed } : sound));
  change('', { pool, sounds });
  return null;
}
