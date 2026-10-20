import { DEFAULT_EDIT } from '../engine/instagram';
import { blobOf } from '../engine/mediaFile';
import { MAIN_VIDEO } from '../engine/tracks';
import { logError } from '../lib/errors';
import type { VLimits } from '../engine/videoFormats';
import type { IgItem } from './instagram';
import { keepMedia } from './projectSave';
import { scanMedia } from './soundScan';
import { batchFiles, placeClips, readMediaFile, settleMedia, type ClipSource, type MediaToAdd } from './videoMedia';
import { isSoundFile, placeSound, readSoundFile } from './videoSound';
import { change, getVideo, limits, newId, poolKey, poolOf, setVideo, type PoolItem, type VClip } from './videoStore';

/*
 * The media pool (504): files imported into the project without going on the timeline, placed from there, and
 * tidied away. The pool the Media panel lists is `poolOf` (videoStore.ts): these imports plus every file in use.
 */

/**
 * A pool item from a clip read from a file: what the list shows and what placing it needs, without the photo's
 * preview copy (504 §3: it is made again when the photo is placed).
 * @param clip the clip
 * @returns the item
 */
const itemOf = ({ url, kind, name, file, w, h, srcDur, thumb, strip }: VClip): PoolItem => ({ url, kind, name, file, w, h, srcDur, thumb, strip });

/**
 * Reads a sound file into a pool item.
 * @param file the file
 * @param messages where a refusal or failure is said
 * @returns the item, or null
 */
async function soundItemOf(file: File, messages: string[]): Promise<PoolItem | null> {
  const read = await readSoundFile(file, messages);
  return read ? { url: read.url, kind: 'audio', name: file.name, file, w: 0, h: 0, srcDur: read.srcDur, thumb: '', strip: [] } : null;
}

/**
 * Imports photos, videos and sound files into the media pool, none onto the timeline (504 AC-1): one undo step for
 * all (D2), none when nothing could be read. Each is kept for the saved project and its sound scanned, as adding does.
 * @param files the files, as picked or dropped (File), or read from the photo studio (pictures only)
 * @returns messages for the files left out, and why
 */
export async function importToPool(files: readonly (File | MediaToAdd)[]): Promise<string[]> {
  const messages: string[] = [];
  const read: ReadItem[] = [];
  setVideo({ busy: 'Adding to the media…' });
  try {
    const limit = limits();
    for (const file of files) {
      const item = await readPoolItem(file, limit, messages);
      if (item) read.push(item);
    }
  } finally {
    setVideo({ busy: null });
  }
  if (read.length > 0) {
    change('', { pool: [...getVideo().pool, ...read.map(({ item }) => item)] });
    read.forEach(settleItem);
  }
  return messages;
}

/** A file read into a pool item, with the clip it was read as (pictures). */
interface ReadItem {
  item: PoolItem;
  clip?: VClip;
}

/**
 * Reads one file for the pool: sound by its length, a picture into a clip.
 * @param file the file
 * @param limit the project's limits
 * @param messages where a refusal or failure is said
 * @returns the item, or null
 */
async function readPoolItem(file: File | MediaToAdd, limit: VLimits, messages: string[]): Promise<ReadItem | null> {
  if (file instanceof File && isSoundFile(file)) {
    const sound = await soundItemOf(file, messages);
    return sound ? { item: sound } : null;
  }
  const media: MediaToAdd = file instanceof File ? { name: file.name, blob: file, type: file.type } : file;
  const clip = await readMediaFile(media, limit, messages);
  return clip ? { item: itemOf(clip), clip } : null;
}

/**
 * What an imported file needs in the background, as adding does: kept for the saved project, its sound scanned.
 * @param read the file as read
 */
function settleItem({ item, clip }: ReadItem): void {
  if (clip) {
    settleMedia(clip);
    return;
  }
  void keepMedia(item.file, false);
  scanMedia(item.url, item.file);
}

/** Where an item from the pool goes: a track and a time (default: the playhead on the track its kind goes on). */
export interface PoolPlace {
  track?: string;
  at?: number;
}

/**
 * A pool item's picture as a clip to place: a video at once from what the pool holds; a photo with its preview copy
 * made again from the file (504 §3), keeping the pool's URL and file.
 * @param item the item
 * @returns where the clip comes from
 */
function pictureSource(item: PoolItem): ClipSource {
  const { url, kind, name, file, w, h, srcDur, thumb, strip } = item;
  const base = { id: newId(), track: MAIN_VIDEO, start: 0, name, file, url, w, h, srcDur, in: 0, edit: { ...DEFAULT_EDIT }, fade: false, thumb, strip: strip.length ? strip : [thumb], still: null };
  if (kind === 'video') return { name, fresh: false, read: () => Promise.resolve({ ...base, kind, dur: 0, out: srcDur, motion: 'none', volume: 1 }) };
  return {
    name,
    fresh: false,
    async read(limit, messages) {
      let blob: Blob;
      try {
        blob = await blobOf(file);
      } catch (error) {
        logError('handled', error);
        messages.push(error instanceof Error ? error.message : `“${name}” couldn’t be read.`);
        return null;
      }
      const read = await readMediaFile({ name, blob }, limit, messages);
      if (!read) return null;
      if (read.url !== url) URL.revokeObjectURL(read.url);
      return { ...read, id: base.id, url, file };
    },
  };
}

/**
 * Puts a file of the media pool on the timeline (504 AC-3, D1): a video or photo on the main video track, a sound on
 * the sound track of its kind (a recording on a Voice track), at the playhead unless a track and time are given (a
 * drop); one undo step.
 * @param key the item's pool key (`poolKey`: its URL)
 * @param place the track and time
 * @returns messages for the user (refusals, limits)
 */
export async function addFromPool(key: string, place: PoolPlace = {}): Promise<string[]> {
  const item = poolOf(getVideo()).find((entry) => poolKey(entry) === key);
  if (!item) return ['That file is no longer in the project’s media.'];
  if (item.kind === 'audio') {
    const why = placeSound({ url: item.url, file: item.file, srcDur: item.srcDur, name: item.name, ...(item.recorded ? { recorded: item.recorded } : {}) }, place);
    return why ? [why] : [];
  }
  return placeClips([pictureSource(item)], { track: place.track ?? MAIN_VIDEO, at: place.at ?? getVideo().t });
}

/**
 * Takes a file out of the project (504 AC-4, D4): out of the pool, with every clip and sound clip that uses it, as one
 * undo step. The panel asks first when it is used.
 * @param key the item's pool key (`poolKey`: its URL)
 */
export function removeFromPool(key: string): void {
  const video = getVideo();
  const clips = video.clips.filter((clip) => poolKey(clip) !== key);
  const sounds = video.sounds.filter((sound) => poolKey(sound) !== key);
  const pool = video.pool.filter((entry) => poolKey(entry) !== key);
  const gone = (id: string | null, list: readonly { id: string }[]): boolean => id !== null && !list.some((entry) => entry.id === id);
  change(
    '',
    { pool, ...(clips.length !== video.clips.length ? { clips } : {}), ...(sounds.length !== video.sounds.length ? { sounds } : {}) },
    {
      ...(gone(video.selected, clips) ? { selected: clips.at(0)?.id ?? null } : {}),
      ...(gone(video.soundSel, sounds) ? { soundSel: null } : {}),
    },
  );
}

/**
 * Imports the photo studio's photos into the media pool; a missing or unreadable photo is said and the others added.
 * @param photos the photo batch's photos
 * @returns messages for what wasn't added, and why
 */
export async function importBatchPhotos(photos: readonly Pick<IgItem, 'name' | 'file'>[]): Promise<string[]> {
  const { files, unread } = await batchFiles(photos);
  return [...unread, ...(files.length ? await importToPool(files) : [])];
}
