import { LOUDNESS_RANGE } from '../engine/loudnessTargets';
import { isAnimated, setKey, volumeAt } from '../engine/keyframes';
import {
  addSound,
  deleteSound,
  duplicateSound,
  moveSound,
  placeTake,
  rippleSound,
  rollSound,
  setFades,
  setToEnd,
  slideSound,
  slipSound,
  splitSound,
  trimSound,
  type FadeChange,
  type Replaced,
  type SoundCtx,
} from '../engine/soundClips';
import { MUSIC, lockedReason, soundRole, type Track } from '../engine/tracks';
import { takeDetails, type TakeDetails } from '../engine/projectDoc';
import { recordTarget } from '../engine/voiceTake';
import type { MixMeasure, SoundJob } from '../engine/exportSound';
import { logError } from '../lib/errors';
import { keepMedia } from './projectSave';
import { scanMedia, scanSnapshot, subscribeScans } from './soundScan';
import { soundJob } from './videoExportJob';
import { keyEdit } from './videoKeys';
import { change, getVideo, newId, setVideo, subscribeVideo, total, type VSound, type VState } from './videoStore';

/*
 * The sound clips' actions (208 §7, D1): adding sound files at the playhead and changing sound clips, each one
 * `change()` (one undo step; a drag's steps share a key). The edits themselves are engine/soundClips.ts's.
 */

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm|weba)$/i;
/** The largest sound file taken (Q4: as the music before 208). */
const MAX_BYTES = 100 * 1048576;

/**
 * A sound file's length, read by an <audio> element.
 * @param _file the file (tests read its name)
 * @param url its object URL
 * @returns seconds; rejects when it can't be played
 */
const audioLength = (_file: Blob, url: string): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) resolve(audio.duration);
      else reject(new Error('no duration'));
    };
    audio.onerror = () => {
      reject(new Error('unplayable'));
    };
    audio.src = url;
  });

/** How sound files are read (tests put a stand-in here: Node plays no media). */
export const soundIO = {
  /** The length as an <audio> element reads it. */
  element: audioLength,
  /** The length from the file's packets (engine/takeLength.ts, loaded on use). */
  packets: async (file: Blob): Promise<number> => (await import('../engine/takeLength')).measureTake(file),
  /**
   * A sound file's length: the <audio> element's, else, for a file whose header has none (a WebM from MediaRecorder,
   * such as a saved voice take, 209 Q7), measured from its packets.
   * @param file the file
   * @param url its object URL
   * @returns seconds; rejects when it can't be read
   */
  length: (file: Blob, url: string): Promise<number> =>
    soundIO.element(file, url).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'no duration') return soundIO.packets(file);
      throw error;
    }),
};

/**
 * What every sound edit checks: the tracks' locks and where the video ends.
 * @returns the context
 */
const soundCtx = (): SoundCtx => ({ locked: (track) => lockedReason(getVideo().tracks, track), videoEnd: total() });

/** Where added sounds go: a chosen sound track and a time (default: the playhead). */
export interface SoundPlace {
  track?: string;
  at?: number;
}

/**
 * Why a file can't be added as sound, before reading it.
 * @param file the file
 * @returns the reason, or null
 */
function refusal(file: File): string | null {
  if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name))
    return `${file.name} isn’t a sound file. Use MP3, M4A, WAV, OGG, WebM or FLAC.`;
  if (file.size > MAX_BYTES) return `${file.name} is too large. Sound files up to 100 MB can be added.`;
  return null;
}

/**
 * Whether a file is sound rather than a picture: an audio type, or no type and a sound-only name (a .webm without a
 * type is taken as video, as adding media does).
 * @param file the file
 * @returns true for sound
 */
export const isSoundFile = (file: File): boolean =>
  file.type.startsWith('audio/') || (!file.type && AUDIO_EXT.test(file.name) && !/\.webm$/i.test(file.name));

/**
 * Reads a sound file: the checks, its object URL and its length; what went wrong goes into `messages`. The read step
 * of adding sound, shared with the media pool (504 §2).
 * @param file the file
 * @param messages where a refusal or failure is said
 * @returns its URL and length, or null
 */
export async function readSoundFile(file: File, messages: string[]): Promise<{ url: string; srcDur: number } | null> {
  const why = refusal(file);
  if (why) {
    messages.push(why);
    return null;
  }
  const url = URL.createObjectURL(file);
  const srcDur = await soundIO.length(file, url).catch((error: unknown) => {
    logError('handled', error);
    return null;
  });
  if (srcDur === null) {
    URL.revokeObjectURL(url);
    messages.push(`${file.name} couldn’t be played here.`);
    return null;
  }
  return { url, srcDur };
}

/**
 * Adds sound files at the playhead (AC-2, Q4): each on the chosen track when it has room, else the first sound track
 * that has, else a new one; the first song on the Music track plays to the end of the video when it is longer (Q7).
 * All of them are one undo step, and each is scanned in the background (waveforms and ducking read it).
 * @param files the files
 * @param place the chosen track and time
 * @returns messages for the files left out
 */
export async function addSoundFiles(files: File[], place: SoundPlace = {}): Promise<string[]> {
  const messages: string[] = [];
  const at = place.at ?? getVideo().t;
  let { sounds, tracks } = getVideo();
  const added: VSound[] = [];
  for (const file of files) {
    const read = await readSoundFile(file, messages);
    if (!read) continue;
    const { url, srcDur } = read;
    const id = newId();
    const result = addSound(sounds, tracks, { id, srcDur, name: file.name }, at, place.track ?? null, soundCtx());
    if ('error' in result) {
      URL.revokeObjectURL(url);
      messages.push(`${file.name}: ${result.error}`);
      continue;
    }
    sounds = result.audio.map((clip) => (clip.id === id ? { ...clip, file, url } : (clip as VSound)));
    tracks = result.tracks;
    added.push(...sounds.filter((clip) => clip.id === id));
  }
  if (added.length > 0) {
    change('', { sounds, tracks });
    for (const sound of added) {
      // Kept for the saved project (408 §4) before the save that references it.
      void keepMedia(sound.file, false);
      scanMedia(sound.url, sound.file);
    }
  }
  return messages;
}

/** A sound file already in the project (the media pool, 504) to place. */
export type SoundToPlace = Pick<VSound, 'url' | 'file' | 'srcDur'> & TakeDetails & { name: string };

/**
 * The sound track a pool item goes on by its kind (504 AC-3): a recording on a Voice track (made when there is none),
 * other sound on the first Music track; a given track must be a sound track.
 * @param tracks the project's tracks
 * @param sound the sound
 * @param given the track it was dropped on, if any
 * @returns the track (null: addSound's first with room) and the tracks, or why not
 */
function soundTarget(tracks: Track[], sound: SoundToPlace, given: string | undefined): { track: string | null; tracks: Track[] } | { error: string } {
  if (given !== undefined) return tracks.some((track) => track.id === given && track.kind === 'audio') ? { track: given, tracks } : { error: 'Sound goes on a sound track.' };
  if (sound.recorded) return recordTarget(tracks, null, null);
  const music = tracks.find((track) => track.kind === 'audio' && soundRole(track) === 'music');
  return { track: music?.id ?? null, tracks };
}

/**
 * Places a sound file already in the project (504 AC-3): on the track its kind goes on, or the one given, at the time
 * given (default: the playhead); one undo step.
 * @param sound the sound
 * @param place the track and time
 * @returns null once placed, else why not
 */
export function placeSound(sound: SoundToPlace, place: SoundPlace = {}): string | null {
  const video = getVideo();
  const target = soundTarget(video.tracks, sound, place.track);
  if ('error' in target) return target.error;
  const id = newId();
  const result = addSound(video.sounds, target.tracks, { id, srcDur: sound.srcDur, name: sound.name }, place.at ?? video.t, target.track, soundCtx());
  if ('error' in result) return `${sound.name}: ${result.error}`;
  const { url, file } = sound;
  const sounds = result.audio.map((clip) => (clip.id === id ? { ...clip, file, url, ...takeDetails(sound) } : (clip as VSound)));
  change('', { sounds, tracks: result.tracks });
  return null;
}

/**
 * Puts changed sound clips in the store, or says why not.
 * @param key the undo step's key ('' for a step of its own)
 * @param result the edit's result
 * @returns null once changed, else why not
 */
function commitSounds(key: string, result: { audio: VSound[] } | { error: string }): string | null {
  if ('error' in result) return result.error;
  change(key, { sounds: result.audio });
  return null;
}

/**
 * A sound clip's volume (208 D6): 0–200 %; a slider's drag is one undo step.
 * @param id the clip's id
 * @param volume 0–2
 * @returns null, or why not
 */
export function setSoundVolume(id: string, volume: number): string | null {
  const { sounds } = getVideo();
  const clip = sounds.find((sound) => sound.id === id);
  if (!clip) return 'That sound isn’t in the project.';
  const locked = lockedReason(getVideo().tracks, clip.track);
  if (locked) return locked;
  const next = Math.min(2, Math.max(0, volume));
  return commitSounds(`sound-volume:${id}`, {
    audio: sounds.map((sound) => (sound === clip ? { ...sound, volume: next } : sound)),
  });
}

/**
 * Where in its file a sound clip starts (Slip, Q5), kept within the file; a drag is one undo step.
 * @param id the clip's id
 * @param inPoint seconds into the file
 * @returns null, or why not
 */
export function setSoundIn(id: string, inPoint: number): string | null {
  const { sounds } = getVideo();
  const clip = sounds.find((sound) => sound.id === id);
  if (!clip) return 'That sound isn’t in the project.';
  return commitSounds(`sound-in:${id}`, slipSound(sounds, id, inPoint - clip.in, soundCtx()));
}

/**
 * Removes a sound clip (its file stays for undo).
 * @param id the clip's id
 * @returns null, or why not
 */
export function removeSound(id: string): string | null {
  const result = deleteSound(getVideo().sounds, id, soundCtx());
  if ('error' in result) return result.error;
  const { soundSel } = getVideo();
  change('', { sounds: result.audio }, { soundSel: soundSel === id ? null : soundSel });
  return null;
}

/**
 * The song: the first sound clip on the Music track (the Audio panel and the timeline show it until 208's sound rows).
 * @param sounds the sound clips
 * @returns it, or undefined
 */
export const songOf = (sounds: readonly VSound[]): VSound | undefined => sounds.find((sound) => sound.track === MUSIC);

/**
 * The Slip keys on the music (Q8): moves where in the song the video's sound starts.
 * @param delta seconds
 * @returns null, or why not
 */
export function slipMusic(delta: number): string | null {
  const song = songOf(getVideo().sounds);
  if (!song) return 'There’s no music to slip.';
  return commitSounds('slip-music', slipSound(getVideo().sounds, song.id, delta, soundCtx()));
}

/**
 * A sound clip moved to a time, on its track or another sound track; a drag is one undo step.
 * @param id the clip's id
 * @param start its new start, seconds
 * @param track another sound track to move it to
 * @returns null, or why not
 */
export const moveSoundTo = (id: string, start: number, track?: string): string | null =>
  commitSounds(`sound-move:${id}`, moveSound(getVideo().sounds, id, start, soundCtx(), track));

/**
 * A sound clip's start or end edge moved; a drag is one undo step.
 * @param id the clip's id
 * @param edge which edge
 * @param by seconds (positive: later)
 * @returns null, or why not
 */
export const trimSoundEdge = (id: string, edge: 'start' | 'end', by: number): string | null =>
  commitSounds(`sound-trim:${id}:${edge}`, trimSound(getVideo().sounds, id, edge, by, soundCtx()));

/**
 * A sound clip's volume at a time: its keys when it has them (0–2), else its volume.
 * @param clip the sound clip
 * @param local seconds from its start
 * @returns 0–2
 */
export const soundVolumeAt = (clip: VSound, local: number): number => volumeAt(clip, local, 'sound');

/**
 * The inspector's volume (AC-5): with volume keys, the key at the playhead is set (or added); else the volume. A
 * slider's drag is one undo step.
 * @param id the clip's id
 * @param volume 0–2
 * @returns null, or why not
 */
export function setSoundVolumeAt(id: string, volume: number): string | null {
  const video = getVideo();
  const clip = video.sounds.find((sound) => sound.id === id);
  if (!clip || !isAnimated(clip, 'volume')) return setSoundVolume(id, volume);
  const locked = lockedReason(video.tracks, clip.track);
  if (locked) return locked;
  const keys = setKey(clip.keys, 'volume', video.t - clip.start, volume, keyEdit(clip));
  if ('error' in keys) return keys.error;
  return commitSounds(`sound-volume:${id}`, {
    audio: video.sounds.map((sound) => (sound === clip ? { ...sound, keys } : sound)),
  });
}

/**
 * **Play to the end of the video** (Q7) on or off; one undo step.
 * @param id the clip's id
 * @param on the switch
 * @returns null, or why not
 */
export const setSoundToEnd = (id: string, on: boolean): string | null => {
  const result = setToEnd(getVideo().sounds, id, on, soundCtx());
  if ('audio' in result && result.audio === getVideo().sounds) return null;
  return commitSounds('', result);
};

/**
 * Slip (Q5): a sound clip plays another part of its file in the same place; a drag is one undo step.
 * @param id the clip's id
 * @param by seconds later in the file
 * @returns null, or why not
 */
export const slipSoundBy = (id: string, by: number): string | null =>
  commitSounds(`sound-slip:${id}`, slipSound(getVideo().sounds, id, by, soundCtx()));

/**
 * Roll (Q5): the cut after a sound clip moves, the next clip on its track giving or taking the time.
 * @param id the clip before the cut
 * @param by seconds (positive: later)
 * @returns null, or why not
 */
export const rollSoundBy = (id: string, by: number): string | null =>
  commitSounds(`sound-roll:${id}`, rollSound(getVideo().sounds, id, by, soundCtx()));

/**
 * Slide (Q5): a sound clip moves between the clips touching it, which give and take the time.
 * @param id the clip's id
 * @param by seconds (positive: later)
 * @returns null, or why not
 */
export const slideSoundBy = (id: string, by: number): string | null =>
  commitSounds(`sound-slide:${id}`, slideSound(getVideo().sounds, id, by, soundCtx()));

/**
 * Ripple (Q5): a sound clip's edge trimmed and the later clips on its track moved by the change.
 * @param id the clip's id
 * @param edge which edge
 * @param by seconds the edge moves (positive: later)
 * @returns null, or why not
 */
export const rippleSoundEdge = (id: string, edge: 'start' | 'end', by: number): string | null =>
  commitSounds(`sound-ripple:${id}:${edge}`, rippleSound(getVideo().sounds, id, edge, by, soundCtx()));

/**
 * A sound clip split in two at the playhead.
 * @param id the clip's id
 * @returns null, or why not
 */
export const splitSoundAt = (id: string): string | null =>
  commitSounds('', splitSound(getVideo().sounds, id, getVideo().t, newId(), soundCtx()));

/**
 * A copy of a sound clip right after it (or where its track has room).
 * @param id the clip's id
 * @returns null, or why not
 */
export const duplicateSoundClip = (id: string): string | null =>
  commitSounds('', duplicateSound(getVideo().sounds, id, newId(), soundCtx()));

/**
 * A sound clip's fades (0–10 s each, together no longer than the clip); a handle's drag is one undo step.
 * @param id the clip's id
 * @param fades the fades to set
 * @returns null, or why not
 */
export const setSoundFades = (id: string, fades: FadeChange): string | null =>
  commitSounds(`sound-fades:${id}`, setFades(getVideo().sounds, id, fades, soundCtx()));

/**
 * The export's loudness target (AC-8): Off, or −24…−9 LUFS. Switching it on or off is a step of its own; a value's
 * slider drag is one.
 * @param target LUFS, or 'off'
 */
export function setLoudness(target: 'off' | number): void {
  const now = getVideo().loudness;
  const next = target === 'off' ? 'off' : Math.min(LOUDNESS_RANGE[1], Math.max(LOUDNESS_RANGE[0], target));
  if (next === now) return;
  change(next === 'off' || now === 'off' ? '' : 'loudness', { loudness: next });
}

/* ---------- the background loudness measurement (AC-9) ---------- */

/** Milliseconds after the last change before the mix is measured. */
const MEASURE_DELAY = 500;

/**
 * Measures the mix as the export will, in the export's module (loaded on demand).
 * @param job the export's sound
 * @param previous the last measurement (reused when it is of this mix)
 * @param signal stops it
 * @returns the measurement, or null when Loudness is Off
 */
async function measureInBackground(
  job: SoundJob,
  previous: MixMeasure | null,
  signal: AbortSignal,
): Promise<MixMeasure | null> {
  const { measureLoudness } = await import('../engine/exportSound');
  return measureLoudness({ ...job, signal, ...(previous ? { measured: previous } : {}) });
}

/** How the mix is measured (tests put a stand-in here: Node has no Web Audio). */
export const measureIO = { measure: measureInBackground };

/**
 * What the mix's loudness depends on, by identity: an edit replaces one of them, a view change none.
 * @param video the state
 * @returns the inputs
 */
const mixInputs = (video: VState): unknown[] => [
  video.sounds,
  video.tracks,
  video.clips,
  video.loudness,
  scanSnapshot().scans,
];

/**
 * Keeps `measure` current (AC-9): measures the mix 500 ms after the last change to its sound (and once at the start),
 * cancelling a measurement a newer change makes stale. The Audio panel shows it; the export and the preview use its
 * gain.
 * @returns stops watching
 */
export function watchLoudness(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: AbortController | null = null;
  let seen = mixInputs(getVideo());
  const run = () => {
    timer = null;
    const controller = new AbortController();
    running = controller;
    const video = getVideo();
    measureIO
      .measure(soundJob(video), video.measure, controller.signal)
      .then((measure) => {
        if (running !== controller) return;
        running = null;
        setVideo({ measure, measuring: false });
      })
      .catch((error: unknown) => {
        if (running !== controller) return;
        running = null;
        if (!controller.signal.aborted) logError('handled', error);
        setVideo({ measuring: false });
      });
  };
  const restart = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    running?.abort();
    running = null;
    if (getVideo().loudness === 'off') {
      if (getVideo().measuring) setVideo({ measuring: false });
      return;
    }
    if (!getVideo().measuring) setVideo({ measuring: true });
    timer = setTimeout(run, MEASURE_DELAY);
  };
  const check = () => {
    const now = mixInputs(getVideo());
    if (now.every((input, index) => input === seen[index])) return;
    seen = now;
    restart();
  };
  const stopVideo = subscribeVideo(check);
  const stopScans = subscribeScans(check);
  restart();
  return () => {
    stopVideo();
    stopScans();
    if (timer) clearTimeout(timer);
    running?.abort();
  };
}

/**
 * The loudness gain the preview plays with (AC-9, Q14): the export's, from the same measurement.
 * @param video the state
 * @returns dB, 0 when Off or not measured yet
 */
export const masterGainDb = (video: VState): number =>
  video.loudness === 'off' || !video.measure ? 0 : video.measure.gain;

/** A recorded voice take to put on the timeline (209 §5), with when and with which microphone (505 §1). */
export interface TakeToPlace extends Omit<TakeDetails, 'recorded'> {
  file: File;
  name: string;
  /** The track it was recorded onto, and the tracks with it (a new Voice track not yet in the project). */
  track: string;
  tracks: Track[];
  /** Its place on the timeline, s. */
  start: number;
  /** Its length, s. */
  length: number;
}

/** A take placed: its clip and what it replaced. */
export interface PlacedTake {
  sound: VSound;
  replaced: Replaced[];
}

/**
 * Puts a recorded take on its track (209 AC-1, AC-2, AC-8): what it overlaps there is replaced (punch-in), and the
 * take, the punch-in and a new Voice track are one undo step. Its waveform and ducking scan starts.
 * @param take the take
 * @returns the clip and what it replaced, or why not
 */
export function addTake(take: TakeToPlace): PlacedTake | { error: string } {
  const video = getVideo();
  const tracks = video.tracks.some((track) => track.id === take.track) ? video.tracks : take.tracks;
  const url = URL.createObjectURL(take.file);
  const sound: VSound = {
    id: newId(),
    track: take.track,
    start: take.start,
    in: 0,
    out: take.length,
    volume: 1,
    toEnd: false,
    srcDur: take.length,
    name: take.name,
    file: take.file,
    url,
    // Listed under Recordings in the media pool, and saved so (504 D3), with its details (505).
    ...takeDetails({ recorded: true, recordedAt: take.recordedAt, microphone: take.microphone }),
  };
  const placed = placeTake(
    video.sounds,
    sound,
    { locked: (track) => lockedReason(tracks, track), videoEnd: total() },
    newId(),
  );
  if ('error' in placed) {
    URL.revokeObjectURL(url);
    return placed;
  }
  change('', { sounds: placed.audio, tracks });
  scanMedia(url, take.file);
  return { sound, replaced: placed.replaced };
}
