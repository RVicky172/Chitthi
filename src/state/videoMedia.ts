import { limitVideos } from '../engine/edits';
import { DEFAULT_EDIT } from '../engine/instagram';
import { blobOf } from '../engine/mediaFile';
import { checkFile, loadImage } from '../engine/photo';
import { clipLength, pack, V_PHOTO_SECONDS } from '../engine/timeline';
import { MAIN_VIDEO, addTrack as withNewTrack, lockedReason, type Track } from '../engine/tracks';
import type { VLimits } from '../engine/videoFormats';
import { logError } from '../lib/errors';
import { isDesktop } from '../platform/desktop';
import type { IgItem } from './instagram';
import { keepMedia } from './projectSave';
import { scanMedia } from './soundScan';
import { endOn, insertOnTrack } from './videoClips';
import { browserNote, change, editCtx, getVideo, limitText, limits, newId, setVideo, shareStrip, type VClip } from './videoStore';

/*
 * Media in the video: photos and video files read into clips (a preview copy, a thumbnail and, for videos, a
 * filmstrip filled in the background) and added within the project's limits, and the music (its length, waveform,
 * volume, offset). Memory: video clips stay as their files (played through <video> elements while editing, decoded
 * frame by frame on export); photos keep their file and a preview copy of at most 1080 px.
 */

const PREVIEW_MAX = 1080;
const STRIP_FRAMES = 8;

/**
 * A small JPEG of a picture.
 * @param source the picture
 * @param width its width
 * @param height its height
 * @param size the thumbnail's longer side, px
 * @returns a data URL
 */
function thumbOf(source: CanvasImageSource, width: number, height: number, size = 160): string {
  const canvas = document.createElement('canvas');
  const scale = size / Math.max(width, height);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * Reads a photo into a clip, with a preview copy of at most 1080 px.
 * @param name the file's name
 * @param file the file
 * @returns the clip, on the main track at 0
 */
async function photoClip(name: string, file: Blob): Promise<VClip> {
  const url = URL.createObjectURL(file);
  const image = await loadImage(url).catch((error: unknown) => {
    URL.revokeObjectURL(url);
    throw error;
  });
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const scale = Math.min(1, PREVIEW_MAX / Math.max(width, height));
  const still = document.createElement('canvas');
  still.width = Math.max(1, Math.round(width * scale));
  still.height = Math.max(1, Math.round(height * scale));
  still.getContext('2d')?.drawImage(image, 0, 0, still.width, still.height);
  const thumb = thumbOf(still, still.width, still.height);
  return { id: newId(), kind: 'photo', track: MAIN_VIDEO, start: 0, name, file, url, w: width, h: height, srcDur: 0, dur: V_PHOTO_SECONDS, in: 0, out: 0, edit: { ...DEFAULT_EDIT }, motion: 'zoom-in', fade: false, volume: 0, thumb, strip: [thumb], still };
}

/**
 * Seeks a <video>.
 * @param video the element
 * @param seconds the time
 * @returns once the frame is there
 */
const seek = (video: HTMLVideoElement, seconds: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const done = (): void => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.onerror = () => {
      reject(new Error('seek failed'));
    };
    video.currentTime = seconds;
  });

/**
 * A video clip from a loaded <video>: its size, length and a thumbnail.
 * @param video the element, at the thumbnail's frame
 * @param name the file's name
 * @param file the file
 * @param url its object URL
 * @returns the clip, on the main track at 0
 */
function videoClipOf(video: HTMLVideoElement, name: string, file: Blob, url: string): VClip {
  const thumb = thumbOf(video, video.videoWidth, video.videoHeight);
  const duration = video.duration;
  return { id: newId(), kind: 'video', track: MAIN_VIDEO, start: 0, name, file, url, w: video.videoWidth, h: video.videoHeight, srcDur: duration, dur: 0, in: 0, out: duration, edit: { ...DEFAULT_EDIT }, motion: 'none', fade: false, volume: 1, thumb, strip: [thumb], still: null };
}

/**
 * Reads a video's size, length and a thumbnail through a <video> element.
 * @param name the file's name
 * @param file the file
 * @returns the clip; rejects when it can't be played here (or takes over 30 s)
 */
function videoClip(name: string, file: Blob): Promise<VClip> {
  const url = URL.createObjectURL(file);
  return new Promise<VClip>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const fail = (): void => {
      URL.revokeObjectURL(url);
      reject(new Error('unplayable'));
    };
    const timer = setTimeout(fail, 30000);
    video.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !Number.isFinite(video.duration)) {
        clearTimeout(timer);
        fail();
        return;
      }
      void seek(video, Math.min(0.5, video.duration / 2)).then(() => {
        clearTimeout(timer);
        resolve(videoClipOf(video, name, file, url));
        video.removeAttribute('src');
        video.load();
      }, fail);
    };
    // Only object URLs of the user's own files are loaded into a <video> element.
    if (url.startsWith('blob:')) video.src = url;
    else fail();
  });
}

/**
 * Fills a video clip's filmstrip in the background, one seek at a time.
 * @param id the clip
 * @param url its object URL
 * @param duration its source's length, seconds
 */
async function makeStrip(id: string, url: string, duration: number): Promise<void> {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  try {
    // The user's own files only: picked (blob:) or kept by a saved project on desktop (chitthi-media://, 408).
    if (!url.startsWith('blob:') && !url.startsWith('chitthi-media://')) return;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => {
        resolve();
      };
      video.onerror = () => {
        reject(new Error('load'));
      };
    });
    const frames: string[] = [];
    for (let frame = 0; frame < STRIP_FRAMES; frame++) {
      await seek(video, Math.min(duration - 0.05, ((frame + 0.5) / STRIP_FRAMES) * duration));
      frames.push(thumbOf(video, video.videoWidth, video.videoHeight, 120));
    }
    shareStrip(id, frames);
  } catch {
    /* the single thumbnail stays */
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

const VIDEO_TYPES = /^video\/(mp4|quicktime|webm|x-m4v|x-matroska)$/;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;

/** How addMedia reads files into clips (tests put stand-ins here: Node decodes no media). */
export const mediaIO = { photo: photoClip, video: videoClip, strip: makeStrip };

/** `addMedia`'s track for "a new overlay track first" (files dropped above the top track, 203 Q12). */
export const NEW_TRACK = 'new';
const NOT_PICTURE = 'Photos and videos go on a picture track.';

/** A file to add. */
export interface MediaToAdd {
  name: string;
  blob: Blob;
  type?: string;
}

/** Where added media go: a track (or NEW_TRACK) and a time. */
export interface MediaPlace {
  track?: string;
  at?: number;
}

/** How clips go in: at the end of the main track, inserted into its order (Magnetic), or each at a time. */
type AddMode = 'append' | 'insert' | 'place';

/** One addMedia call's progress. */
interface Adding {
  limit: VLimits;
  track: string;
  mode: AddMode;
  at: number | undefined;
  added: VClip[];
  /** Where the next clip starts. */
  cursor: number;
  /** A video was already left out for showing too many at once (said once). */
  tooMany: boolean;
  messages: string[];
}

/**
 * The track media go on, adding a new overlay track first for NEW_TRACK.
 * @param track the track asked for
 * @returns the tracks and the track, or why not
 */
function targetTrack(track: string): { tracks: Track[]; track: string } | { error: string } {
  const { tracks } = getVideo();
  if (track === NEW_TRACK) {
    const result = withNewTrack(tracks, isDesktop);
    return 'error' in result ? result : { tracks: result.tracks, track: result.id };
  }
  const found = tracks.find((candidate) => candidate.id === track);
  if (!found || found.kind === 'audio') return { error: NOT_PICTURE };
  const locked = lockedReason(tracks, track);
  return locked ? { error: locked } : { tracks, track };
}

/**
 * The clips with more added as the mode puts them.
 * @param adding the call's progress
 * @param more the clips to add
 * @returns a new list
 */
function withAdded(adding: Adding, more: VClip[]): VClip[] {
  const { clips } = getVideo();
  if (adding.mode === 'append') return [...clips, ...more];
  if (adding.mode === 'insert') {
    const at = adding.at ?? 0;
    const main = clips.filter((clip) => clip.track === MAIN_VIDEO);
    const before = main.find((clip) => at < clip.start + clipLength(clip) / 2);
    const index = before ? clips.indexOf(before) : clips.findLastIndex((clip) => clip.track === MAIN_VIDEO) + 1;
    return [...clips.slice(0, index), ...more, ...clips.slice(index)];
  }
  return more.reduce(insertOnTrack, clips);
}

/**
 * The start for a clip from the cursor: after any clip of the track it would overlap.
 * @param adding the call's progress
 * @param length the clip's length, seconds
 * @returns seconds
 */
function fitOnTrack(adding: Adding, length: number): number {
  let start = adding.cursor;
  for (let hit = true; hit; ) {
    hit = false;
    for (const clip of [...getVideo().clips, ...adding.added])
      if (clip.track === adding.track && clip.start < start + length - 1e-6 && clip.start + clipLength(clip) > start + 1e-6) {
        start = clip.start + clipLength(clip);
        hit = true;
      }
  }
  return start;
}

/**
 * The message when the video is full.
 * @param adding the call's progress
 * @returns the message
 */
const fullMessage = (adding: Adding): string =>
  adding.mode === 'place'
    ? `Clips there would end after ${limitText(adding.limit.seconds)}, the most${browserNote()}; the rest weren’t added.`
    : `The video is already ${limitText(adding.limit.seconds)} long, the most${browserNote()}; the rest weren’t added.`;

/**
 * Reads a file into a clip, after the size and type checks.
 * @param adding the call's progress (a refusal's message goes there)
 * @param file the file
 * @param type its media type
 * @param isVideo whether it is a video
 * @returns the clip, or null when refused
 */
async function readClip(adding: Adding, file: MediaToAdd, type: string, isVideo: boolean): Promise<VClip | null> {
  const { limit } = adding;
  if (isVideo) {
    if (file.blob.size > limit.fileMB * 1048576) {
      const most = limit.fileMB >= 1024 ? `${limit.fileMB / 1024} GB` : `${limit.fileMB} MB`;
      adding.messages.push(`${file.name} is ${(file.blob.size / 1048576).toFixed(0)} MB. Videos up to ${most} can be added${browserNote()}.`);
      return null;
    }
    return mediaIO.video(file.name, file.blob);
  }
  const why = checkFile(new File([file.blob], file.name, { type }));
  if (why) {
    adding.messages.push(why);
    return null;
  }
  return mediaIO.photo(file.name, file.blob);
}

/**
 * Places a clip read from a file: at the cursor (or the first spot that fits), trimmed to the time left, unless it
 * would end past the limit or show too many videos at once.
 * @param adding the call's progress
 * @param name the file's name
 * @param clip the clip
 * @returns 'stop' when the video is full, else 'next'
 */
function placeClip(adding: Adding, name: string, clip: VClip): 'stop' | 'next' {
  const { limit } = adding;
  const start = adding.mode === 'place' ? fitOnTrack(adding, clipLength(clip)) : adding.cursor;
  if (start >= limit.seconds - 0.5) {
    URL.revokeObjectURL(clip.url);
    adding.messages.push(fullMessage(adding));
    return 'stop';
  }
  const room = limit.seconds - start;
  if (clip.kind === 'video' && clip.out - clip.in > room) {
    clip.out = clip.in + room;
    adding.messages.push(`${name} was trimmed to ${limitText(room)} to keep the video within ${limitText(limit.seconds)}${browserNote()}.`);
  }
  if (clip.kind === 'photo') clip.dur = Math.min(clip.dur, Math.max(0.5, room));
  clip.track = adding.track;
  clip.start = start;
  const clips = withAdded(adding, [...adding.added, clip]);
  const checked = limitVideos(getVideo().clips, { clips: getVideo().magnetic ? pack(clips) : clips }, editCtx());
  if ('error' in checked) {
    URL.revokeObjectURL(clip.url);
    if (!adding.tooMany) adding.messages.push(`${name} wasn’t added. ${checked.error}`);
    adding.tooMany = true;
    return 'next';
  }
  adding.added.push(clip);
  adding.cursor = start + clipLength(clip);
  return 'next';
}

/**
 * Adds one file, or says why not.
 * @param adding the call's progress
 * @param file the file
 * @returns 'stop' when nothing more fits, else 'next'
 */
async function addFile(adding: Adding, file: MediaToAdd): Promise<'stop' | 'next'> {
  const { limit } = adding;
  if (getVideo().clips.length + adding.added.length >= limit.clips) {
    adding.messages.push(`A project holds up to ${limit.clips} clips${browserNote()}; the rest weren’t added.`);
    return 'stop';
  }
  if (adding.cursor >= limit.seconds - 0.5) {
    adding.messages.push(fullMessage(adding));
    return 'stop';
  }
  const type = file.type ?? file.blob.type;
  const isVideo = VIDEO_TYPES.test(type) || VIDEO_EXT.test(file.name);
  try {
    const clip = await readClip(adding, file, type, isVideo);
    return clip ? placeClip(adding, file.name, clip) : 'next';
  } catch (error) {
    logError('handled', error);
    adding.messages.push(
      isVideo
        ? `${file.name} couldn’t be played here. iPhone videos in HEVC may need converting (Settings › Camera › Formats › Most Compatible), or use MP4 (H.264).`
        : `${file.name} couldn’t be read. The file may be damaged.`,
    );
    return 'next';
  }
}

/**
 * Adds photos and videos within this project's limits. Without a place they go at the end of the main track (2.x). On
 * another track (203), or at a time `at`, they go one after another from `at` (default: the playhead), each after the
 * clips there when it doesn't fit; on the main track with Magnetic on they are inserted where `at` falls in the order.
 * `track: NEW_TRACK` adds an overlay track first (one undo step with the clips, and only when a clip is added). A video
 * that would show more videos at once than allowed is left out, with the reason.
 * @param files the files
 * @param place the track and time
 * @returns messages for the user (files left out, trimmed)
 */
export async function addMedia(files: MediaToAdd[], place: MediaPlace = {}): Promise<string[]> {
  const limit = limits();
  const target = targetTrack(place.track ?? MAIN_VIDEO);
  if ('error' in target) return [target.error];
  const { track } = target;
  const video = getVideo();
  let mode: AddMode = 'place';
  if (track === MAIN_VIDEO && (place.at === undefined || video.magnetic)) mode = place.at === undefined ? 'append' : 'insert';
  setVideo({ busy: 'Adding to the timeline…' });
  const cursor = mode === 'place' ? Math.max(0, place.at ?? getVideo().t) : endOn(getVideo().clips, MAIN_VIDEO);
  const adding: Adding = { limit, track, mode, at: place.at, added: [], cursor, tooMany: false, messages: [] };
  for (const file of files) if ((await addFile(adding, file)) === 'stop') break;
  const first = adding.added.at(0);
  if (first) {
    change('', { tracks: target.tracks, clips: withAdded(adding, adding.added) }, { selected: getVideo().selected ?? first.id });
    for (const clip of adding.added) {
      // Kept for the saved project (408 §4) before the save that references it.
      void keepMedia(clip.file, false);
      if (clip.kind !== 'video') continue;
      void mediaIO.strip(clip.id, clip.url, clip.srcDur);
      // Its sound's scan (208 D5), in the background: waveforms and ducking read it.
      scanMedia(clip.url, clip.file);
    }
  }
  setVideo({ busy: null });
  return adding.messages;
}

/**
 * Adds the photo studio's photos to the video, each file read once (disk media is fetched); a missing or unreadable
 * photo is said and the others added.
 * @param photos the photo batch's photos
 * @returns messages for what wasn't added, and why
 */
export async function addBatchPhotos(photos: readonly Pick<IgItem, 'name' | 'file'>[]): Promise<string[]> {
  const unread: string[] = [];
  const files: MediaToAdd[] = [];
  for (const photo of photos) {
    try {
      files.push({ name: photo.name, blob: await blobOf(photo.file) });
    } catch (error) {
      logError('handled', error);
      unread.push(error instanceof Error ? error.message : `“${photo.name}” couldn’t be read.`);
    }
  }
  return [...unread, ...(files.length ? await addMedia(files) : [])];
}
