import { RECORD_OFFSET_MAX } from '../engine/voiceTake';

/*
 * The microphone for voice-over (209 §4): listing and choosing microphones, opening one for recording, the recording
 * format, what each failure means to the user, and the recording choices remembered on this device. Everything that
 * touches the browser takes it as a parameter (defaulting to the real one), so it is tested without one.
 */

/** A microphone as the recording controls list it. */
export interface Microphone {
  id: string;
  label: string;
}

/** The part of `navigator.mediaDevices` that lists devices. */
type DeviceLister = Pick<MediaDevices, 'enumerateDevices'>;

/**
 * The microphones, the system default first (AC-4). Before permission is given browsers hide the names, so they are
 * numbered.
 * @param devices the media devices
 * @returns the microphones
 */
export async function listMicrophones(devices: DeviceLister = navigator.mediaDevices): Promise<Microphone[]> {
  const inputs = (await devices.enumerateDevices()).filter((info) => info.kind === 'audioinput');
  const named = inputs.map((info, index) => ({ id: info.deviceId, label: info.label || `Microphone ${index + 1}` }));
  return [...named.filter((mic) => mic.id === 'default'), ...named.filter((mic) => mic.id !== 'default')];
}

/** The microphone to record with, and what to tell the user about it. */
export interface PickedMicrophone {
  /** null when there is no microphone. */
  id: string | null;
  message: string | null;
}

/**
 * The microphone to use (AC-4): the saved choice while it is plugged in, else the system default (the first).
 * @param microphones the microphones, default first
 * @param saved the saved choice, or null
 * @returns the microphone, with a message when the saved one is gone
 */
export function pickMicrophone(microphones: readonly Microphone[], saved: string | null): PickedMicrophone {
  const first = microphones[0];
  if (!first) return { id: null, message: null };
  if (saved === null || microphones.some((mic) => mic.id === saved)) return { id: saved ?? first.id, message: null };
  return { id: first.id, message: `The microphone you chose isn’t connected: recording with ${first.label}.` };
}

/**
 * What to ask `getUserMedia` for (Q6): audio only, one channel; Voice clean-up turns the browser's echo cancellation,
 * noise suppression and automatic gain on or off together.
 * @param deviceId the microphone, or null for the default
 * @param cleanUp the Voice clean-up switch
 * @returns the constraints
 */
export function microphoneConstraints(deviceId: string | null, cleanUp: boolean): MediaStreamConstraints {
  return {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: 1,
      echoCancellation: cleanUp,
      noiseSuppression: cleanUp,
      autoGainControl: cleanUp,
    },
    video: false,
  };
}

/**
 * Opens a microphone.
 * @param deviceId the microphone, or null for the default
 * @param cleanUp the Voice clean-up switch
 * @param devices the media devices
 * @returns its stream (the caller stops its tracks)
 */
export const openMicrophone = (
  deviceId: string | null,
  cleanUp: boolean,
  devices: Pick<MediaDevices, 'getUserMedia'> = navigator.mediaDevices,
): Promise<MediaStream> => devices.getUserMedia(microphoneConstraints(deviceId, cleanUp));

/**
 * Calls back when microphones are plugged in or out.
 * @param changed the callback
 * @param devices the media devices
 * @returns a function that stops listening
 */
export function onDevicesChanged(changed: () => void, devices: EventTarget = navigator.mediaDevices): () => void {
  devices.addEventListener('devicechange', changed);
  return () => devices.removeEventListener('devicechange', changed);
}

const MIMES = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];

/**
 * The format to record in (Q7): what the browser records natively that the sound import reads.
 * @param supported `MediaRecorder.isTypeSupported`
 * @returns the MIME type, or null when none is supported
 */
export const recorderMime = (supported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type)): string | null =>
  MIMES.find((type) => supported(type)) ?? null;

/**
 * How long the microphone's sound takes to reach the recorder (AC-3).
 * @param settings the input track's settings (`latency` where the browser reports it)
 * @param context the meter's audio context
 * @returns seconds: the track's latency, else the context's base latency, else 0
 */
export function inputLatency(settings: { latency?: number }, context: { baseLatency?: number }): number {
  for (const value of [settings.latency, context.baseLatency]) if (value !== undefined && Number.isFinite(value) && value >= 0) return value;
  return 0;
}

/** Where the app runs, for the failure messages. */
export interface MicPlace {
  desktop: boolean;
  /** `process.platform` on desktop ('darwin', 'win32' …). */
  platform: string;
  /** Whether the page is a secure context. */
  secure: boolean;
}

const INSECURE = 'Recording needs a secure page (https). Open Chitthi Studio over https, or use the desktop app.';

/**
 * How to allow the microphone where the app runs.
 * @param place where the app runs
 * @returns the message
 */
function refusedMessage(place: MicPlace): string {
  if (place.desktop && place.platform === 'darwin')
    return 'Chitthi Studio isn’t allowed to use the microphone. Allow it in System Settings → Privacy & Security → Microphone, then try again.';
  if (place.desktop)
    return 'Chitthi Studio isn’t allowed to use the microphone. Turn on microphone access for desktop apps in Settings → Privacy & security → Microphone, then try again.';
  return 'The browser isn’t allowing the microphone. Allow it for this site from the icon at the left of the address bar, then try again.';
}

/**
 * What a failure to open the microphone means and what to do (AC-6).
 * @param error what `getUserMedia` threw
 * @param place where the app runs
 * @returns the message
 */
export function micFailure(error: unknown, place: MicPlace): string {
  const name = error instanceof Error ? error.name : '';
  if (!place.secure || name === 'SecurityError') return INSECURE;
  if (name === 'NotAllowedError') return refusedMessage(place);
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Plug one in or turn it on, then try again.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'The microphone is in use by another app or couldn’t start. Close the other app, then try again.';
  const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
  return `The microphone couldn’t be opened${reason}. Try again.`;
}

/** What the browser offers for recording. */
export interface RecordSupport {
  secure: boolean;
  getUserMedia: boolean;
  mediaRecorder: boolean;
}

/**
 * Why recording can't work here at all (AC-6).
 * @param support what the browser offers
 * @returns the message, or null when it can
 */
export function missingSupport(support: RecordSupport): string | null {
  if (!support.secure) return INSECURE;
  if (!support.getUserMedia || !support.mediaRecorder)
    return 'This browser can’t record sound. Try a recent Chrome, Edge, Firefox or Safari, or the desktop app.';
  return null;
}

/** The recording choices remembered on this device (AC-3, AC-4, AC-5). */
export interface VoicePrefs {
  /** The chosen microphone, or null for the default. */
  device: string | null;
  /** Voice clean-up (Q6). */
  cleanUp: boolean;
  /** The count-in, seconds (Q4). */
  countIn: 0 | 3 | 5;
  /** Hear the video while recording (Q3). */
  hear: boolean;
  /** The Recording offset per microphone, seconds (Q10). */
  offsets: Record<string, number>;
}

export const VOICE_PREFS_KEY = 'chitthi.voice';

/**
 * A saved text read as JSON.
 * @param raw the text, or null
 * @returns its value, or null when there is none or it isn't JSON
 */
function parsed(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The prefs a saved text holds, each field checked.
 * @param raw the saved text, or null
 * @returns the prefs; defaults for anything missing or invalid
 */
export function readVoicePrefs(raw: string | null): VoicePrefs {
  const saved = parsed(raw);
  const record = saved !== null && typeof saved === 'object' && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
  const offsets: Record<string, number> = {};
  if (record.offsets && typeof record.offsets === 'object' && !Array.isArray(record.offsets)) {
    for (const [id, value] of Object.entries(record.offsets))
      if (typeof value === 'number' && Number.isFinite(value)) offsets[id] = Math.min(RECORD_OFFSET_MAX, Math.max(-RECORD_OFFSET_MAX, value));
  }
  return {
    device: typeof record.device === 'string' ? record.device : null,
    cleanUp: record.cleanUp === true,
    countIn: record.countIn === 0 || record.countIn === 5 ? record.countIn : 3,
    hear: record.hear === true,
    offsets,
  };
}

/** The part of `localStorage` the prefs use. */
type PrefStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The saved recording choices.
 * @param storage where they are kept
 * @returns the prefs (defaults when storage is blocked)
 */
export function loadVoicePrefs(storage: PrefStorage = localStorage): VoicePrefs {
  try {
    return readVoicePrefs(storage.getItem(VOICE_PREFS_KEY));
  } catch {
    return readVoicePrefs(null);
  }
}

/**
 * Remembers the recording choices.
 * @param prefs the prefs
 * @param storage where they are kept
 */
export function saveVoicePrefs(prefs: VoicePrefs, storage: PrefStorage = localStorage): void {
  try {
    storage.setItem(VOICE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked: the choices last for this visit only */
  }
}

/**
 * A microphone's Recording offset.
 * @param prefs the prefs
 * @param deviceId the microphone, or null
 * @returns seconds (0 when none is saved)
 */
export const offsetFor = (prefs: VoicePrefs, deviceId: string | null): number => (deviceId === null ? 0 : (prefs.offsets[deviceId] ?? 0));
