import { useSyncExternalStore } from 'react';
import { lastLoud, tooLoud } from '../engine/voiceLevel';
import {
  announceCountIn,
  announceResult,
  announceStart,
  canRecord,
  recordTarget,
  takeName,
  takeStart,
  tooLoudDue,
  type PlacedTake,
} from '../engine/voiceTake';
import type { Track } from '../engine/tracks';
import { logError } from '../lib/errors';
import {
  inputLatency,
  listMicrophones,
  loadVoicePrefs,
  micFailure,
  microphoneConstraints,
  missingSupport,
  offsetFor,
  onDevicesChanged,
  pickMicrophone,
  recorderMime,
  saveVoicePrefs,
  type MicPlace,
  type Microphone,
  type RecordSupport,
  type VoicePrefs,
} from '../lib/microphone';
import { indexedDbTakes, makeTakeStore } from '../lib/takeStore';
import { toast } from '../lib/toast';
import { desktop, isDesktop } from '../platform/desktop';
import { keepMedia } from './projectSave';
import { analyserMeter, mediaRecorder, type MicStream, type RecorderMeter, type TakeRecorder } from './recorderDevices';
import { addTake, type TakeToPlace } from './videoSound';
import { getVideo, newId, setPlaying, setVideo, subscribeVideo, total, type VState } from './videoStore';

/*
 * The voice-over recorder (209 §5): a small store, no undo, with the phases closed → ready → countIn → recording →
 * finishing. The microphone is open only while the recording controls are (AC-7); every way out goes through
 * `release()`. Its IO is injected (`recorderIO`), so tests drive it with fakes and fake timers.
 */

export type { MicStream, MicTrack, RecorderMeter, TakeRecorder } from './recorderDevices';

/** Where the recorder is. */
export type RecorderPhase = 'closed' | 'ready' | 'countIn' | 'recording' | 'finishing';

/** The recorder's state, for the controls. */
export interface RecorderState {
  phase: RecorderPhase;
  /** The track chosen with a track's record button, or null. */
  track: string | null;
  microphones: Microphone[];
  /** The microphone in use, or null. */
  device: string | null;
  prefs: VoicePrefs;
  /** The input's peak, dBFS. */
  level: number;
  loud: boolean;
  /** Seconds left of the count-in. */
  countdown: number;
  /** Seconds recorded. */
  elapsed: number;
  /** What to tell the user (a failure, a fallback, the last take), or null. */
  message: string | null;
  /** The last take placed: its name, place and length (s) and what it replaced, for the announcement. */
  lastTake: PlacedTake | null;
  /** Takes left on the device by a crash, offered for the open project (AC-9). */
  recovery: RecoverEntry[];
}

/** A take offered for recovery (AC-9). */
export interface RecoverEntry {
  id: string;
  name: string;
  /** Its length, s; null when it can't be read (it can still be saved as a file). */
  length: number | null;
  /** When it was recorded, ms since 1970. */
  startedAt: number;
  /** Whether recording stopped normally (false: stopped early). */
  done: boolean;
}

/** The longest take, s (Q5). */
export const MAX_TAKE_SECONDS = 3_600;
const METER_MS = 1000 / 30;
const CHUNK_MS = 1_000;

/** What the recorder works with: the browser's own, replaced by fakes in tests. */
export const recorderIO = {
  /** The media devices. */
  devices: {
    enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
    getUserMedia: (constraints?: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints),
  } as Pick<MediaDevices, 'enumerateDevices'> & {
    getUserMedia(constraints: MediaStreamConstraints): Promise<MicStream>;
  },
  /** Calls back when microphones are plugged in or out; returns a function that stops it. */
  onDevicesChanged: (changed: () => void): (() => void) => onDevicesChanged(changed),
  /** What the browser offers for recording. */
  support: (): RecordSupport => ({
    secure: window.isSecureContext,
    getUserMedia: 'mediaDevices' in navigator && typeof navigator.mediaDevices.getUserMedia === 'function',
    mediaRecorder: typeof MediaRecorder === 'function',
  }),
  /** Where the app runs, for the failure messages. */
  place: (): MicPlace => ({
    desktop: isDesktop,
    platform: desktop?.info.platform ?? 'web',
    secure: window.isSecureContext,
  }),
  /** Where the recording choices are kept. */
  storage: (): Pick<Storage, 'getItem' | 'setItem'> => localStorage,
  /** The format to record in, or null. */
  mime: (): string | null => (typeof MediaRecorder === 'function' ? recorderMime() : null),
  /** Makes a recorder on the microphone. */
  makeRecorder: mediaRecorder,
  /** Makes the level meter on the microphone. */
  makeMeter: analyserMeter,
  /** Takes in progress, for crash recovery. */
  takes: makeTakeStore(indexedDbTakes()),
  /** Whether the tab is hidden. */
  hidden: (): boolean => document.hidden,
  /** Calls back when the tab is hidden or shown; returns a function that stops it. */
  onVisibility: (changed: () => void): (() => void) => {
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  },
  /** The clock playback runs on, ms. */
  now: (): number => performance.now(),
  /** The time of day, ms since 1970 (when a take was recorded). */
  clock: (): number => Date.now(),
  /** The open video project's id, or null. */
  projectId: async (): Promise<string | null> => {
    const { ensureProjects } = await import('./projects');
    return (await ensureProjects()).autosave.current('video')?.id ?? null;
  },
  /** A recorded take's length, s; rejects when it can't be read (engine/takeLength.ts, loaded on use). */
  measure: async (blob: Blob): Promise<number> => (await import('../engine/takeLength')).measureTake(blob),
  /** Keeps a take as the project's own media (408); resolves to its id, or why not. */
  keep: (file: File): Promise<string | { error: string }> => keepMedia(file, true),
  /** Logs a failure for the user's error report. */
  logError,
  /** Tells screen readers (and shows) a short message: the toast's polite live region, like the timeline's `tell()`. */
  announce: toast,
};

let state: RecorderState = {
  phase: 'closed',
  track: null,
  microphones: [],
  device: null,
  prefs: { device: null, cleanUp: false, countIn: 3, hear: false, offsets: {} },
  level: -Infinity,
  loud: false,
  countdown: 0,
  elapsed: 0,
  message: null,
  lastTake: null,
  recovery: [],
};
const listeners = new Set<() => void>();

/**
 * Changes the recorder's state and tells the subscribers.
 * @param patch the fields to change
 */
function setRecorder(patch: Partial<RecorderState>): void {
  state = { ...state, ...patch };
  // The stage shows the count-in (Q4).
  if (patch.countdown !== undefined && patch.countdown !== getVideo().countIn) setVideo({ countIn: patch.countdown });
  for (const listener of listeners) listener();
}

/** @returns the recorder's state now */
export const getRecorder = (): RecorderState => state;

/**
 * The recorder's state in a component.
 * @param select picks what the component needs
 * @returns the selection, re-rendering when it changes
 */
export function useRecorder<T>(select: (recorder: RecorderState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => select(state),
  );
}

/** A take while it is being recorded, with its details (505 §1): `recordedAt` once the recorder starts. */
interface Take extends Pick<TakeToPlace, 'recordedAt' | 'microphone'> {
  /** Its id in the take store. */
  id: string;
  /** The track it goes onto, and the tracks with it (a new Voice track not yet in the project). */
  track: string;
  tracks: Track[];
  name: string;
  mime: string;
  recorder: TakeRecorder | null;
  /** The playhead when Record was pressed (playback starts there), s. */
  playStart: number;
  /** The preview's clock once it plays (209 §3). */
  playClock: VState['playClock'];
  /** `recorderIO.now()` at the recorder's start event, ms. */
  captureWall: number;
  /** The input latency then, s. */
  inputLatency: number;
  /** The Recording offset of the microphone in use, s. */
  offset: number;
  chunks: Blob[];
  /** The take store's writes, one after another. */
  stored: Promise<void>;
  storeFailed: boolean;
  /** Why it stopped, when not by the user. */
  cutShort: string | null;
}

/** The open microphone and everything that runs while it is open. */
let mic: { stream: MicStream; meter: RecorderMeter; stops: (() => void)[] } | null = null;
let take: Take | null = null;
/** Count-in, meter and 60-minute timers. */
let timers: ReturnType<typeof setTimeout>[] = [];
/** The 60-minute stop of the take recording now. */
let maxTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped by every close, so an open still waiting for the microphone knows it was cancelled. */
let generation = 0;
let loudAt: number | null = null;
/** When Too loud was last said, ms. */
let loudSaidAt: number | null = null;
/** The tab was hidden with the controls open: open the microphone again when it is shown. */
let reopen = false;
/** The microphone being opened now, so a second openControls waits for it. */
let opening: Promise<void> | null = null;
/** The visibility listener lives from openControls to closeControls, across a hidden tab. */
let stopVisibility: (() => void) | null = null;

/**
 * Says a failure and logs it (AC-6).
 * @param message what to tell the user
 * @param error what failed
 */
function fail(message: string, error: unknown): void {
  recorderIO.logError('handled', error instanceof Error ? error : new Error(message));
  setRecorder({ message });
}

/** Clears every timer. */
function clearTimers(): void {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

/** Clears the 60-minute stop. */
function clearMaxTimer(): void {
  if (maxTimer !== null) clearTimeout(maxTimer);
  maxTimer = null;
}

/** Stops every input track and the meter at once (AC-7). */
function release(): void {
  clearTimers();
  clearMaxTimer();
  loudAt = null;
  loudSaidAt = null;
  if (mic) {
    for (const stop of mic.stops) stop();
    for (const track of mic.stream.getTracks()) track.stop();
    mic.meter.close();
  }
  mic = null;
}

/** One meter reading (30 a second): level, Too loud, elapsed time. */
function readMeter(): void {
  if (!mic) return;
  const now = recorderIO.now();
  const level = mic.meter.peak();
  loudAt = lastLoud(loudAt, level, now);
  const loud = tooLoud(loudAt, now);
  if (loud && tooLoudDue(loudSaidAt, now)) {
    loudSaidAt = now;
    recorderIO.announce('Too loud');
  }
  const elapsed = take && state.phase === 'recording' ? (now - take.captureWall) / 1000 : state.elapsed;
  setRecorder({ level, loud, elapsed });
}

/**
 * The microphone list and choice, after a change of devices: a chosen microphone that went away falls back to the
 * default, which is opened instead.
 */
async function devicesChanged(): Promise<void> {
  const microphones = await listMicrophones(recorderIO.devices);
  const picked = pickMicrophone(microphones, state.prefs.device);
  setRecorder({ microphones, ...(picked.message ? { message: picked.message } : {}) });
  if (picked.id !== state.device && state.phase === 'ready') await reopenMicrophone();
}

/** The microphone stopped by itself (unplugged, a phone pausing the tab). */
function trackEnded(): void {
  if (state.phase === 'recording' && take) {
    take.cutShort = 'the microphone stopped';
    fail(
      `${take.name}: the microphone stopped. Keeping what was recorded…`,
      new Error('The microphone stopped during a take.'),
    );
    void stop();
    return;
  }
  if (state.phase === 'ready' || state.phase === 'countIn') {
    release();
    fail(
      'The microphone stopped. Check it is plugged in, then open Record voice again.',
      new Error('The microphone stopped.'),
    );
    setRecorder({ phase: 'closed', countdown: 0 });
  }
}

/** The tab was hidden or shown: the microphone closes while hidden, unless a take is recording (AC-7). */
function visibilityChanged(): void {
  if (recorderIO.hidden()) {
    if (state.phase !== 'ready' && state.phase !== 'countIn') return;
    release();
    reopen = true;
    setRecorder({ phase: 'closed', countdown: 0 });
  } else if (reopen) {
    reopen = false;
    void openControls(state.track ?? undefined);
  }
}

/** The preview stopped (the end of the video, Space, Pause): so does the take (AC-1). */
function videoChanged(): void {
  if (state.phase !== 'recording') return;
  const video = getVideo();
  if (take && !take.playClock && video.playClock) take.playClock = video.playClock;
  if (!video.playing) void stop();
}

/**
 * Opens the microphone chosen in the prefs and starts the meter.
 * @returns whether it opened
 */
async function openChosen(): Promise<boolean> {
  const opening = ++generation;
  const prefs = loadVoicePrefs(recorderIO.storage());
  const picked = pickMicrophone(await listMicrophones(recorderIO.devices), prefs.device);
  let stream: MicStream;
  try {
    stream = await recorderIO.devices.getUserMedia(microphoneConstraints(picked.id, prefs.cleanUp));
  } catch (error) {
    fail(micFailure(error, recorderIO.place()), error);
    setRecorder({ phase: 'closed' });
    return false;
  }
  if (opening !== generation) {
    for (const track of stream.getTracks()) track.stop();
    return false;
  }
  const meter = recorderIO.makeMeter(stream);
  const stops = [recorderIO.onDevicesChanged(() => void devicesChanged()), subscribeVideo(videoChanged)];
  for (const track of stream.getTracks()) {
    track.addEventListener('ended', trackEnded);
    stops.push(() => track.removeEventListener('ended', trackEnded));
  }
  mic = { stream, meter, stops };
  timers.push(setInterval(readMeter, METER_MS));
  // Names are shown only once permission is given, so the list is read again.
  const microphones = await listMicrophones(recorderIO.devices);
  setRecorder({
    phase: 'ready',
    prefs,
    microphones,
    device: picked.id,
    ...(picked.message ? { message: picked.message } : {}),
  });
  return true;
}

/** Opens the microphone again with the current prefs (another microphone, Voice clean-up). */
async function reopenMicrophone(): Promise<void> {
  release();
  await openChosen();
}

/**
 * Opens the recording controls: the microphone for the meter (AC-4, AC-7).
 * @param track the track whose record button was used
 * @returns when the microphone is open (or failed)
 */
export async function openControls(track?: string): Promise<void> {
  if (track !== undefined) setRecorder({ track });
  if (state.phase !== 'closed') return;
  // A second call while the microphone is opening waits for the first.
  if (opening) return opening;
  setRecorder({ message: null });
  const missing = missingSupport(recorderIO.support());
  if (missing) {
    fail(missing, new Error(missing));
    return;
  }
  stopVisibility ??= recorderIO.onVisibility(visibilityChanged);
  opening = openChosen().then(() => undefined);
  try {
    await opening;
  } finally {
    opening = null;
  }
}

/** Closes the recording controls: a take recording stops (and is kept), the microphone closes (AC-7). */
export function closeControls(): void {
  generation++;
  if (state.phase === 'recording' && take?.recorder) {
    take.recorder.stop();
    endPlayback();
  }
  stopVisibility?.();
  stopVisibility = null;
  reopen = false;
  release();
  setRecorder({ phase: 'closed', countdown: 0, level: -Infinity, loud: false });
}

/**
 * Changes and remembers recording choices; a new microphone or Voice clean-up reopens the microphone.
 * @param patch the choices to change
 */
export async function setVoicePrefs(patch: Partial<VoicePrefs>): Promise<void> {
  const prefs = { ...state.prefs, ...patch };
  saveVoicePrefs(prefs, recorderIO.storage());
  setRecorder({ prefs });
  const reopenNeeded =
    (patch.device !== undefined && patch.device !== state.device) ||
    (patch.cleanUp !== undefined && patch.cleanUp !== state.prefs.cleanUp);
  if (reopenNeeded && state.phase === 'ready') await reopenMicrophone();
}

/** The preview stops and the recording sign goes. */
function endPlayback(): void {
  setVideo({ recording: null });
  setPlaying(false);
}

/**
 * Starts the recorder (after the count-in).
 * @param mime the format to record in
 */
function startRecorder(mime: string): void {
  if (!mic || !take) return;
  const current = take;
  const recorder = recorderIO.makeRecorder(mic.stream, mime);
  current.recorder = recorder;
  recorder.ondata = (chunk) => {
    current.chunks.push(chunk);
    store(current, () => recorderIO.takes.append(current.id, chunk));
  };
  recorder.onerror = (error) => {
    current.cutShort = 'recording failed';
    fail(`${current.name}: recording failed. Keeping what was recorded…`, error);
    void stop();
  };
  recorder.onstop = () => void finishTake(current);
  const input = mic.stream.getTracks()[0];
  const meter = mic.meter;
  recorder.onstart = () => {
    current.captureWall = recorderIO.now();
    current.inputLatency = inputLatency(input?.getSettings() ?? {}, { baseLatency: meter.latency });
    const startedAt = recorderIO.clock();
    current.recordedAt = startedAt;
    store(current, async () => {
      const project = (await recorderIO.projectId()) ?? '';
      await recorderIO.takes.begin({
        id: current.id,
        project,
        name: current.name,
        startedAt,
        track: current.track,
        start: placeOf(current),
        mime: current.mime,
      });
    });
    setVideo({ recording: { track: current.track, hear: state.prefs.hear } });
    setPlaying(true);
    setRecorder({ phase: 'recording', elapsed: 0 });
    recorderIO.announce(
      announceStart(current.tracks.find((track) => track.id === current.track)?.name ?? current.track),
    );
    maxTimer = setTimeout(() => void stop(), MAX_TAKE_SECONDS * 1000);
  };
  recorder.start(CHUNK_MS);
}

/** Records a take: the count-in, then the microphone with the preview playing from the playhead (AC-1). */
export function record(): void {
  if (state.phase !== 'ready' || !mic) return;
  const video = getVideo();
  const selected = video.sounds.find((sound) => sound.id === video.soundSel)?.track ?? null;
  const target = recordTarget(video.tracks, state.track, selected);
  if ('error' in target) {
    setRecorder({ message: target.error });
    return;
  }
  const why = canRecord({ tracks: target.tracks, length: total(), playhead: video.t }, target.track);
  if (why) {
    setRecorder({ message: why });
    return;
  }
  const mime = recorderIO.mime();
  if (!mime) {
    fail(
      'This browser can’t record sound. Try a recent Chrome, Edge, Firefox or Safari, or the desktop app.',
      new Error('No recording format'),
    );
    return;
  }
  take = {
    id: newId(),
    track: target.track,
    tracks: target.tracks,
    name: takeName(video.sounds),
    mime,
    recorder: null,
    playStart: video.t,
    playClock: null,
    captureWall: 0,
    inputLatency: 0,
    offset: offsetFor(state.prefs, state.device),
    microphone: state.microphones.find((device) => device.id === state.device)?.label,
    chunks: [],
    stored: Promise.resolve(),
    storeFailed: false,
    cutShort: null,
  };
  setRecorder({ message: null });
  const countIn = state.prefs.countIn;
  if (countIn === 0) {
    startRecorder(mime);
    return;
  }
  setRecorder({ phase: 'countIn', countdown: countIn });
  recorderIO.announce(announceCountIn(countIn, true));
  const tick = setInterval(() => {
    const countdown = state.countdown - 1;
    if (countdown > 0) {
      setRecorder({ countdown });
      recorderIO.announce(announceCountIn(countdown, false));
      return;
    }
    clearInterval(tick);
    setRecorder({ countdown: 0 });
    startRecorder(mime);
  }, 1000);
  timers.push(tick);
}

/** Stops a take (Stop, Shift + R, Space, the end of the video, 60 min, a failure), or cancels the count-in. */
export async function stop(): Promise<void> {
  if (state.phase === 'countIn') {
    cancelCountIn();
    return;
  }
  if (state.phase !== 'recording' || !take?.recorder) return;
  setRecorder({ phase: 'finishing' });
  clearMaxTimer();
  take.recorder.stop();
  endPlayback();
  await Promise.resolve();
}

/**
 * Shift + R (AC-10): records (opening the microphone first when the controls are closed), cancels the count-in, or
 * stops the take.
 * @param track the track to record onto, when the controls open now
 * @returns when done
 */
export async function toggleRecording(track?: string): Promise<void> {
  if (state.phase === 'closed') await openControls(track);
  if (state.phase === 'ready') record();
  else if (state.phase === 'countIn') cancelCountIn();
  else if (state.phase === 'recording') await stop();
}

/** Cancels the count-in: nothing is recorded (AC-1). */
export function cancelCountIn(): void {
  if (state.phase !== 'countIn') return;
  clearTimers();
  if (mic) timers.push(setInterval(readMeter, METER_MS));
  take = null;
  setRecorder({ phase: 'ready', countdown: 0 });
}

/**
 * A take as a file named after it (Q7: WebM with Opus, or MP4 with AAC on Safari).
 * @param blob the recording
 * @param name the take's name
 * @param mime its format
 * @returns the file
 */
const takeAsFile = (blob: Blob, name: string, mime: string): File =>
  new File([blob], `${name}${mime.startsWith('audio/mp4') ? '.m4a' : '.webm'}`, { type: mime });

/**
 * Queues a write to the take store; the first failure (a full disk) is said once, and the take is still placed.
 * @param current the take
 * @param write the write
 */
function store(current: Take, write: () => Promise<void>): void {
  current.stored = current.stored.then(write).catch((error: unknown) => {
    if (current.storeFailed) return;
    current.storeFailed = true;
    fail(
      `${current.name} can’t be saved on this device as it is recorded (no room?). It goes on the timeline when you stop.`,
      error,
    );
  });
}

/**
 * Where a take's first sample belongs on the timeline (209 §3): by the preview's clock once it played, else by the
 * playhead when capture began.
 * @param current the take
 * @returns seconds
 */
const placeOf = (current: Take): number =>
  takeStart({
    playStart: current.playClock?.startTime ?? current.playStart,
    playWall: current.playClock?.startWall ?? current.captureWall,
    captureWall: current.captureWall,
    inputLatency: current.inputLatency,
    offset: current.offset,
  });

/**
 * Leaves a take in the take store, marked finished, for recovery (AC-9).
 * @param current the take
 * @returns when done (a failure is ignored: there is nothing more to do)
 */
const keepForRecovery = (current: Take): Promise<void> => recorderIO.takes.finish(current.id).catch(() => undefined);

/**
 * Puts a stopped take on the timeline (AC-1, AC-2, AC-8): measured from its file, placed with punch-in as one undo
 * step, kept as the project's media; the take store lets go of it once kept. Anything that fails leaves it for recovery.
 * @param current the take
 * @returns what to show
 */
async function placeFinished(current: Take): Promise<Partial<RecorderState>> {
  const blob = new Blob(current.chunks, { type: current.mime });
  let length: number;
  try {
    length = await recorderIO.measure(blob);
  } catch (error) {
    await keepForRecovery(current);
    fail(
      `${current.name} couldn’t be read, so it isn’t on the timeline. It is kept under Recover voice recording.`,
      error,
    );
    return {};
  }
  const file = takeAsFile(blob, current.name, current.mime);
  const placed = addTake({
    file,
    name: current.name,
    track: current.track,
    tracks: current.tracks,
    start: placeOf(current),
    length,
    recordedAt: current.recordedAt,
    microphone: current.microphone,
  });
  if ('error' in placed) {
    await keepForRecovery(current);
    fail(
      `${current.name} couldn’t be placed: ${placed.error} It is kept under Recover voice recording.`,
      new Error(placed.error),
    );
    return {};
  }
  const kept = await recorderIO.keep(file);
  if (typeof kept === 'string' && !current.storeFailed)
    await recorderIO.takes.remove(current.id).catch(() => undefined);
  else await keepForRecovery(current);
  const lastTake = { name: current.name, start: placed.sound.start, length, replaced: placed.replaced };
  recorderIO.announce(announceResult(lastTake));
  return {
    lastTake,
    message: current.cutShort ? `${current.name} kept: ${length.toFixed(1)} s, ${current.cutShort}.` : null,
  };
}

/**
 * A take's recorder stopped: the take is placed, and the recorder goes back to ready (or closed, when the controls
 * closed meanwhile).
 * @param finished the take
 */
async function finishTake(finished: Take): Promise<void> {
  if (take === finished) take = null;
  await finished.stored;
  const shown = await placeFinished(finished);
  setRecorder({ phase: mic ? 'ready' : 'closed', elapsed: 0, ...shown });
}

/**
 * Looks for takes a crash left on the device for the open project (AC-9), after deleting those older than 30 days.
 * Each is measured, so the offer shows its length; one that can't be read is offered without it.
 */
export async function checkRecovery(): Promise<void> {
  try {
    await recorderIO.takes.sweep(recorderIO.clock());
    const project = await recorderIO.projectId();
    const stored =
      project === null ? [] : (await recorderIO.takes.list(project)).filter((header) => header.id !== take?.id);
    const recovery: RecoverEntry[] = [];
    for (const header of stored) {
      const length = await recorderIO.measure(await recorderIO.takes.join(header.id)).catch(() => null);
      recovery.push({ id: header.id, name: header.name, length, startedAt: header.startedAt, done: header.done });
    }
    setRecorder({ recovery });
  } catch (error) {
    recorderIO.logError('handled', error);
    setRecorder({ recovery: [] });
  }
}

/**
 * Takes a take off the recovery list.
 * @param id the take
 */
const dropOffer = (id: string): void => {
  setRecorder({ recovery: state.recovery.filter((entry) => entry.id !== id) });
};

/**
 * **Add to the timeline** (AC-9): a recovered take placed where it was being recorded, on its Voice track (or another,
 * or a new one), with punch-in, as one undo step; kept with the project, then gone from the device's take store.
 * @param id the take
 * @returns null once placed, else why not
 */
export async function recoverTake(id: string): Promise<string | null> {
  const header = (await recorderIO.takes.list()).find((stored) => stored.id === id);
  if (!header) {
    dropOffer(id);
    return 'That recording isn’t on this device any more.';
  }
  const blob = await recorderIO.takes.join(id);
  let length: number;
  try {
    length = await recorderIO.measure(blob);
  } catch (error) {
    recorderIO.logError('handled', error);
    return `${header.name} couldn’t be read. Save it as a file to keep it.`;
  }
  const target = recordTarget(getVideo().tracks, header.track, null);
  if ('error' in target) return target.error;
  const file = takeAsFile(blob, header.name, header.mime);
  const placed = addTake({
    file,
    name: header.name,
    track: target.track,
    tracks: target.tracks,
    start: header.start,
    length,
    recordedAt: header.startedAt,
  });
  if ('error' in placed) return placed.error;
  dropOffer(id);
  const lastTake = { name: header.name, start: placed.sound.start, length, replaced: placed.replaced };
  setRecorder({ lastTake });
  recorderIO.announce(announceResult(lastTake));
  if (typeof (await recorderIO.keep(file)) === 'string') await recorderIO.takes.remove(id).catch(() => undefined);
  return null;
}

/**
 * **Discard** (AC-9): deletes a recovered take from the device.
 * @param id the take
 */
export async function discardTake(id: string): Promise<void> {
  dropOffer(id);
  await recorderIO.takes.remove(id);
}

/**
 * A recovered take as a file, for **Save as file**.
 * @param id the take
 * @returns the file; rejects when it is gone
 */
export async function takeFile(id: string): Promise<File> {
  const header = (await recorderIO.takes.list()).find((stored) => stored.id === id);
  if (!header) throw new Error('That recording isn’t on this device any more.');
  return takeAsFile(await recorderIO.takes.join(id), header.name, header.mime);
}
