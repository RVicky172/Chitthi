import { describe, expect, it } from 'vitest';
import {
  VOICE_PREFS_KEY,
  inputLatency,
  listMicrophones,
  loadVoicePrefs,
  micFailure,
  microphoneConstraints,
  missingSupport,
  offsetFor,
  pickMicrophone,
  readVoicePrefs,
  recorderMime,
  saveVoicePrefs,
  type VoicePrefs,
} from '@/lib/microphone';

/* 209 AC-4 (choosing the microphone, clean-up, remembered choices) and AC-6 (every failure explained). */

/**
 * A device as `enumerateDevices` lists it.
 * @param kind its kind
 * @param deviceId its id
 * @param label its name (empty before permission)
 * @returns the device
 */
const device = (kind: MediaDeviceKind, deviceId: string, label = ''): MediaDeviceInfo =>
  ({ kind, deviceId, label, groupId: 'g', toJSON: () => ({}) });

/**
 * A stand-in for `navigator.mediaDevices` listing the given devices.
 * @param list the devices
 * @returns the stand-in
 */
const devicesOf = (list: MediaDeviceInfo[]) => ({ enumerateDevices: () => Promise.resolve(list) });

/**
 * A DOMException-like error.
 * @param name its name
 * @returns the error
 */
const failure = (name: string): Error => Object.assign(new Error(name), { name });

/** A localStorage stand-in. */
class MemoryStorage {
  readonly items = new Map<string, string>();
  /**
   * @param key the key
   * @returns its value, or null
   */
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  /**
   * @param key the key
   * @param value its value
   */
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

describe('listMicrophones', () => {
  it('lists only microphones, the system default first', async () => {
    const list = await listMicrophones(
      devicesOf([
        device('audioinput', 'usb', 'USB Mic'),
        device('videoinput', 'cam', 'Camera'),
        device('audiooutput', 'spk', 'Speakers'),
        device('audioinput', 'default', 'Default - Built-in'),
      ]),
    );
    expect(list).toEqual([
      { id: 'default', label: 'Default - Built-in' },
      { id: 'usb', label: 'USB Mic' },
    ]);
  });

  it('names microphones before permission is given and leaves the order when there is no default entry', async () => {
    const list = await listMicrophones(devicesOf([device('audioinput', ''), device('audioinput', 'b')]));
    expect(list).toEqual([
      { id: '', label: 'Microphone 1' },
      { id: 'b', label: 'Microphone 2' },
    ]);
  });
});

describe('pickMicrophone', () => {
  const microphones = [
    { id: 'default', label: 'Default' },
    { id: 'usb', label: 'USB Mic' },
  ];

  it('uses the saved choice when it is plugged in', () => {
    expect(pickMicrophone(microphones, 'usb')).toEqual({ id: 'usb', message: null });
  });

  it('uses the default with no saved choice', () => {
    expect(pickMicrophone(microphones, null)).toEqual({ id: 'default', message: null });
  });

  it('falls back to the default and says so when the saved one is unplugged', () => {
    const picked = pickMicrophone(microphones, 'gone');
    expect(picked.id).toBe('default');
    expect(picked.message).toMatch(/isn’t connected/);
  });

  it('has nothing to pick with no microphone', () => {
    expect(pickMicrophone([], 'usb')).toEqual({ id: null, message: null });
  });
});

describe('microphoneConstraints', () => {
  it('asks for one channel of audio only, the clean-up switch setting all three', () => {
    expect(microphoneConstraints('usb', false)).toEqual({
      audio: { deviceId: { exact: 'usb' }, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    const on = microphoneConstraints(null, true).audio as MediaTrackConstraints;
    expect(on).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    expect(on.deviceId).toBeUndefined();
  });
});

describe('recorderMime', () => {
  it('picks Opus in WebM, else AAC in MP4, else MP4', () => {
    expect(recorderMime(() => true)).toBe('audio/webm;codecs=opus');
    expect(recorderMime((type) => type.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2');
    expect(recorderMime((type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(recorderMime(() => false)).toBeNull();
  });
});

describe('inputLatency', () => {
  it('uses the track’s reported latency, else the audio context’s base latency, else 0', () => {
    expect(inputLatency({ latency: 0.02 }, { baseLatency: 0.01 })).toBe(0.02);
    expect(inputLatency({}, { baseLatency: 0.01 })).toBe(0.01);
    expect(inputLatency({}, {})).toBe(0);
    expect(inputLatency({ latency: Number.NaN }, { baseLatency: -1 })).toBe(0);
  });
});

describe('micFailure (AC-6)', () => {
  const web = { desktop: false, platform: 'web', secure: true };
  const mac = { desktop: true, platform: 'darwin', secure: true };
  const windows = { desktop: true, platform: 'win32', secure: true };

  it('says how to allow a refused microphone in the browser, on macOS and on Windows', () => {
    expect(micFailure(failure('NotAllowedError'), web)).toMatch(/address bar/);
    expect(micFailure(failure('NotAllowedError'), mac)).toMatch(/System Settings.*Privacy & Security.*Microphone/);
    expect(micFailure(failure('NotAllowedError'), windows)).toMatch(/Settings.*Privacy & security.*Microphone/);
  });

  it('explains no microphone, one in use, an insecure page and anything else', () => {
    expect(micFailure(failure('NotFoundError'), web)).toMatch(/No microphone/);
    expect(micFailure(failure('OverconstrainedError'), web)).toMatch(/No microphone/);
    expect(micFailure(failure('NotReadableError'), web)).toMatch(/another app/);
    expect(micFailure(failure('SecurityError'), web)).toMatch(/https/);
    expect(micFailure(failure('NotAllowedError'), { ...web, secure: false })).toMatch(/https/);
    expect(micFailure(new Error('boom'), web)).toMatch(/couldn’t be opened.*boom/);
    expect(micFailure('odd', web)).toMatch(/couldn’t be opened/);
  });
});

describe('missingSupport (AC-6)', () => {
  it('explains a page that isn’t secure and a browser that can’t record', () => {
    const all = { secure: true, getUserMedia: true, mediaRecorder: true };
    expect(missingSupport(all)).toBeNull();
    expect(missingSupport({ ...all, secure: false, getUserMedia: false })).toMatch(/https/);
    expect(missingSupport({ ...all, mediaRecorder: false })).toMatch(/can’t record/);
    expect(missingSupport({ ...all, getUserMedia: false })).toMatch(/can’t record/);
  });
});

describe('voice prefs', () => {
  const defaults: VoicePrefs = { device: null, cleanUp: false, countIn: 3, hear: false, offsets: {} };

  it('defaults when nothing is saved or what is saved can’t be read', () => {
    expect(readVoicePrefs(null)).toEqual(defaults);
    expect(readVoicePrefs('{not json')).toEqual(defaults);
    expect(readVoicePrefs('[1,2]')).toEqual(defaults);
  });

  it('keeps valid fields and drops or repairs the rest', () => {
    const raw = JSON.stringify({ device: 'usb', cleanUp: true, countIn: 5, hear: true, offsets: { usb: 0.1, far: 9, bad: 'x', nan: null } });
    expect(readVoicePrefs(raw)).toEqual({ device: 'usb', cleanUp: true, countIn: 5, hear: true, offsets: { usb: 0.1, far: 0.25 } });
    const odd = JSON.stringify({ device: 4, cleanUp: 'yes', countIn: 4, hear: 1, offsets: [] });
    expect(readVoicePrefs(odd)).toEqual(defaults);
  });

  it('saves and loads through storage, surviving storage that throws', () => {
    const storage = new MemoryStorage();
    const prefs: VoicePrefs = { device: 'usb', cleanUp: true, countIn: 0, hear: false, offsets: { usb: -0.05 } };
    saveVoicePrefs(prefs, storage);
    expect(storage.items.has(VOICE_PREFS_KEY)).toBe(true);
    expect(loadVoicePrefs(storage)).toEqual(prefs);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadVoicePrefs(broken)).toEqual(defaults);
    expect(() => saveVoicePrefs(prefs, broken)).not.toThrow();
  });

  it('gives each microphone its own Recording offset', () => {
    const prefs: VoicePrefs = { ...defaults, offsets: { usb: 0.12 } };
    expect(offsetFor(prefs, 'usb')).toBe(0.12);
    expect(offsetFor(prefs, 'default')).toBe(0);
    expect(offsetFor(prefs, null)).toBe(0);
  });
});
