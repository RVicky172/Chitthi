import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import {
  MAIN_VIDEO,
  addAudioTrack,
  countsAsVoice,
  defaultTracks,
  setAudioTrack,
  soundRole,
  type Track,
} from '@/engine/tracks';
import { VOICE_PREFS_KEY, type VoicePrefs } from '@/lib/microphone';
import { makeTakeStore, type TakeStore } from '@/lib/takeStore';
import { scanIO } from '@/state/soundScan';
import { setSoundFades, splitSoundAt } from '@/state/videoSound';
import {
  getVideo,
  loadVideoProject,
  redoV,
  setPlayhead,
  setPlaying,
  setVideo,
  undoV,
  type VClip,
  type VSound,
} from '@/state/videoStore';
import {
  MAX_TAKE_SECONDS,
  checkRecovery,
  closeControls,
  discardTake,
  getRecorder,
  openControls,
  record,
  recorderIO,
  recoverTake,
  stop,
  takeFile,
  toggleRecording,
} from '@/state/voiceRecorder';
import { FakeDevices, FakeMeter, FakeRecorder, mediaError } from '../../support/fakeMicrophone';
import { defined } from '../../support/defined';
import { MemoryTakeBackend } from '../../support/memoryTakeBackend';

/*
 * 209 §5: the recorder's phases with the microphone, MediaRecorder, the meter and time faked. AC-1 (count-in, start,
 * the ways a take stops), AC-4 (the meter), AC-6 (failures explained, nothing changed), AC-7 (the microphone closed).
 */

/**
 * A photo clip on the main track.
 * @param id its id
 * @param start its start, s
 * @param dur its length, s
 * @returns the clip
 */
const clip = (id: string, start: number, dur: number): VClip => ({
  id,
  kind: 'photo',
  track: MAIN_VIDEO,
  start,
  name: id,
  file: new Blob(),
  url: '',
  w: 10,
  h: 10,
  srcDur: 0,
  dur,
  in: 0,
  out: 0,
  edit: { ...DEFAULT_EDIT },
  motion: 'none',
  fade: false,
  volume: 0,
  thumb: '',
  strip: [],
  still: null,
});

/**
 * The default tracks and a Voice track A2.
 * @returns the tracks
 */
function voiceTracks(): Track[] {
  const added = addAudioTrack(defaultTracks());
  if ('error' in added) throw new Error(added.error);
  const voiced = setAudioTrack(added.tracks, added.id, { role: 'voice' });
  if ('error' in voiced) throw new Error(voiced.error);
  return voiced.tracks;
}

let devices: FakeDevices;
let recorders: FakeRecorder[];
let meters: FakeMeter[];
let storage: Map<string, string>;
let logged: unknown[];
let hidden: boolean;
let visibility: (() => void) | null;
let supported: boolean;
let takes: TakeStore;
let measured: number | Error;
let kept: string | { error: string };
let scanned: Blob[];
let told: string[];

/**
 * The last recorder made.
 * @returns it
 */
const recorder = (): FakeRecorder => {
  const made = recorders.at(-1);
  if (!made) throw new Error('no recorder made');
  return made;
};

/**
 * Saves recording prefs where the recorder reads them.
 * @param prefs the prefs to change
 * @returns the storage
 */
const prefs = (prefs: Partial<VoicePrefs>) => storage.set(VOICE_PREFS_KEY, JSON.stringify({ countIn: 3, ...prefs }));

beforeEach(() => {
  vi.useFakeTimers();
  devices = new FakeDevices();
  recorders = [];
  meters = [];
  storage = new Map();
  logged = [];
  hidden = false;
  visibility = null;
  supported = true;
  takes = makeTakeStore(new MemoryTakeBackend());
  measured = 8.6;
  kept = 'm1';
  scanned = [];
  told = [];
  Object.assign(scanIO, { scan: (file: Blob) => (scanned.push(file), Promise.resolve(null)) });
  Object.assign(recorderIO, {
    devices,
    onDevicesChanged: () => () => undefined,
    support: () => ({ secure: true, getUserMedia: supported, mediaRecorder: true }),
    place: () => ({ desktop: false, platform: 'web', secure: true }),
    storage: () => ({
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    }),
    mime: () => 'audio/webm;codecs=opus',
    makeRecorder: (stream: FakeRecorder['stream'], mime: string) => {
      const made = new FakeRecorder(stream, mime);
      recorders.push(made);
      return made;
    },
    makeMeter: () => {
      const meter = new FakeMeter();
      meters.push(meter);
      return meter;
    },
    takes,
    measure: () => (measured instanceof Error ? Promise.reject(measured) : Promise.resolve(measured)),
    keep: () => Promise.resolve(kept),
    hidden: () => hidden,
    onVisibility: (changed: () => void) => {
      visibility = changed;
      return () => (visibility = null);
    },
    now: () => Date.now(),
    clock: () => Date.now(),
    projectId: () => 'p1',
    logError: (_source: string, error: unknown) => logged.push(error),
    announce: (text: string) => told.push(text),
  });
  loadVideoProject({ clips: [clip('a', 0, 30)], tracks: voiceTracks() });
  setPlayhead(4);
});

afterEach(() => {
  closeControls();
  vi.useRealTimers();
});

describe('opening the controls (AC-4, AC-7)', () => {
  it('lists the microphones, opens the saved one and runs the meter', async () => {
    prefs({ device: 'usb', cleanUp: true });
    await openControls();
    const state = getRecorder();
    expect(state.phase).toBe('ready');
    expect(state.microphones.map((mic) => mic.id)).toEqual(['default', 'usb']);
    expect(state.device).toBe('usb');
    expect(devices.asked[0]?.audio).toMatchObject({ deviceId: { exact: 'usb' }, echoCancellation: true });
    defined(meters[0]).peakDb = -12.5;
    await vi.advanceTimersByTimeAsync(100);
    expect(getRecorder().level).toBe(-12.5);
    expect(getRecorder().loud).toBe(false);
    defined(meters[0]).peakDb = -0.5;
    await vi.advanceTimersByTimeAsync(50);
    expect(getRecorder().loud).toBe(true);
    defined(meters[0]).peakDb = -20;
    await vi.advanceTimersByTimeAsync(2_100);
    expect(getRecorder().loud).toBe(false);
  });

  it('falls back to the default microphone and says so when the saved one is gone', async () => {
    prefs({ device: 'gone' });
    await openControls();
    expect(getRecorder().device).toBe('default');
    expect(getRecorder().message).toMatch(/isn’t connected/);
  });

  it('closing stops every input track and the meter at once', async () => {
    await openControls();
    closeControls();
    expect(devices.streams[0]?.track.readyState).toBe('ended');
    expect(meters[0]?.closed).toBe(true);
    expect(getRecorder().phase).toBe('closed');
  });

  it('a hidden tab closes the microphone while not recording, and opens it again when shown', async () => {
    await openControls();
    hidden = true;
    visibility?.();
    expect(devices.streams[0]?.track.readyState).toBe('ended');
    hidden = false;
    visibility?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(devices.streams).toHaveLength(2);
    expect(getRecorder().phase).toBe('ready');
  });
});

describe('failures before recording (AC-6)', () => {
  it('explains a refused microphone, logs it and changes nothing', async () => {
    const before = getVideo();
    devices.failNext = mediaError('NotAllowedError');
    await openControls();
    expect(getRecorder().phase).toBe('closed');
    expect(getRecorder().message).toMatch(/address bar/);
    expect(logged).toHaveLength(1);
    expect(getVideo().sounds).toBe(before.sounds);
    expect(getVideo().tracks).toBe(before.tracks);
  });

  it('explains a browser that can’t record without asking for the microphone', async () => {
    supported = false;
    await openControls();
    expect(getRecorder().message).toMatch(/can’t record/);
    expect(devices.asked).toHaveLength(0);
    expect(logged).toHaveLength(1);
  });

  it('refuses to record with the playhead at the end, or onto a locked track', async () => {
    await openControls();
    setPlayhead(30);
    record();
    expect(getRecorder().message).toMatch(/end of the video/);
    expect(recorders).toHaveLength(0);
    setPlayhead(4);
    loadVideoProject({
      clips: [clip('a', 0, 30)],
      tracks: voiceTracks().map((track) => (track.id === 'A2' ? { ...track, locked: true } : track)),
    });
    record();
    expect(getRecorder().message).toMatch(/locked/);
    expect(recorders).toHaveLength(0);
  });
});

describe('count-in and recording (AC-1)', () => {
  it('counts in 3 s, then records with 1 s chunks and plays from the playhead on the recorder’s start', async () => {
    await openControls();
    record();
    expect(getRecorder()).toMatchObject({ phase: 'countIn', countdown: 3 });
    expect(getVideo().countIn).toBe(3);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getRecorder().countdown).toBe(2);
    expect(getVideo().countIn).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(recorder().timeslice).toBe(1_000);
    expect(getVideo().playing).toBe(false);
    recorder().emitStart();
    expect(getRecorder().phase).toBe('recording');
    expect(getVideo().playing).toBe(true);
    expect(getVideo().recording).toEqual({ track: 'A2', hear: false });
    await vi.advanceTimersByTimeAsync(2_500);
    expect(getRecorder().elapsed).toBeCloseTo(2.5, 1);
  });

  it('starts at once with the count-in off, and hears the video when asked', async () => {
    prefs({ countIn: 0, hear: true });
    await openControls();
    record();
    expect(recorders).toHaveLength(1);
    recorder().emitStart();
    expect(getVideo().recording).toEqual({ track: 'A2', hear: true });
  });

  it('counts in 5 s when chosen', async () => {
    prefs({ countIn: 5 });
    await openControls();
    record();
    await vi.advanceTimersByTimeAsync(4_900);
    expect(recorders).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(recorders).toHaveLength(1);
  });

  it('cancelling during the count-in records nothing', async () => {
    await openControls();
    record();
    await vi.advanceTimersByTimeAsync(1_500);
    await stop();
    expect(getRecorder().phase).toBe('ready');
    expect(getVideo().countIn).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(recorders).toHaveLength(0);
    expect(getVideo().playing).toBe(false);
  });
});

describe('the ways a take stops (AC-1, AC-6)', () => {
  /** Opens the controls and starts recording with the count-in off. */
  async function recording(): Promise<void> {
    prefs({ countIn: 0 });
    await openControls();
    record();
    recorder().emitStart();
  }

  it('Stop stops the recorder and the preview', async () => {
    await recording();
    await stop();
    expect(recorder().stopped).toBe(true);
    expect(getRecorder().phase).toBe('finishing');
    recorder().finishStop();
    await vi.advanceTimersByTimeAsync(0);
    expect(getRecorder().phase).not.toBe('recording');
    expect(getVideo().playing).toBe(false);
    expect(getVideo().recording).toBeNull();
  });

  it('stops when the preview stops (the end of the video, or Space)', async () => {
    await recording();
    setPlaying(false);
    expect(recorder().stopped).toBe(true);
  });

  it('stops at 60 minutes', async () => {
    expect(MAX_TAKE_SECONDS).toBe(3_600);
    await recording();
    await vi.advanceTimersByTimeAsync(3_599_000);
    expect(recorder().stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recorder().stopped).toBe(true);
  });

  it('stops when the microphone ends mid-take, saying so', async () => {
    await recording();
    await vi.advanceTimersByTimeAsync(3_000);
    devices.streams[0]?.track.end();
    expect(recorder().stopped).toBe(true);
    expect(getRecorder().message).toMatch(/the microphone stopped/);
    expect(logged).toHaveLength(1);
  });

  it('keeps recording when the tab is hidden (a phone pausing it ends the track instead)', async () => {
    await recording();
    hidden = true;
    visibility?.();
    expect(recorder().stopped).toBe(false);
    expect(devices.streams[0]?.track.readyState).toBe('live');
  });

  it('closing the controls while recording stops the take and the microphone', async () => {
    await recording();
    closeControls();
    expect(recorder().stopped).toBe(true);
    expect(devices.streams[0]?.track.readyState).toBe('ended');
    expect(meters[0]?.closed).toBe(true);
  });
});

describe('one take after another', () => {
  it('a take stopped early leaves no 60-minute stop behind for the next one', async () => {
    prefs({ countIn: 0 });
    await openControls();
    record();
    recorder().emitStart();
    await vi.advanceTimersByTimeAsync(600_000);
    await stop();
    recorder().finishStop();
    await vi.advanceTimersByTimeAsync(0);
    setPlayhead(4);
    record();
    recorder().emitStart();
    await vi.advanceTimersByTimeAsync(3_000_000 + 1_000);
    expect(recorder().stopped).toBe(false);
  });
});

describe('a finished take on the timeline (AC-1, AC-2, AC-6, AC-8)', () => {
  /**
   * Records a take with the count-in off: the stage starts its clock 16 ms after the recorder's start.
   * @param chunks the recorder's chunks (one a second)
   */
  async function recordTake(chunks = ['a', 'b', 'c']): Promise<void> {
    prefs({ countIn: 0 });
    await openControls();
    record();
    recorder().emitStart();
    setVideo({ playClock: { startTime: getVideo().t, startWall: Date.now() + 16 } });
    for (const chunk of chunks) {
      await vi.advanceTimersByTimeAsync(1_000);
      recorder().emitChunk(chunk);
    }
  }

  /** Stops the take and lets it be placed. */
  async function stopTake(): Promise<void> {
    await stop();
    recorder().finishStop('d');
    await vi.advanceTimersByTimeAsync(0);
  }

  /** @returns the take on the timeline */
  const takeClip = (): VSound =>
    defined(
      getVideo().sounds.find((sound) => sound.name === 'Voice 1'),
      'take',
    );

  it('is one sound clip at the playhead (less the input latency and the 16 ms the preview started late), as long as its file', async () => {
    await recordTake();
    await stopTake();
    const sound = takeClip();
    // Capture began at playhead 4 s, 16 ms before the preview's clock started; the microphone's latency is 20 ms.
    expect(sound.start).toBeCloseTo(4 - 0.016 - 0.02, 6);
    expect(sound).toMatchObject({ track: 'A2', in: 0, out: 8.6, srcDur: 8.6, toEnd: false, volume: 1 });
    expect(sound.file).toBeInstanceOf(Blob);
    expect(sound.file instanceof Blob && (await sound.file.text())).toBe('abcd');
    expect(scanned).toEqual([sound.file]);
    expect(getRecorder()).toMatchObject({ phase: 'ready', lastTake: { name: 'Voice 1', length: 8.6, replaced: [] } });
  });

  it('uses the meter’s base latency when the microphone reports none', async () => {
    prefs({ countIn: 0 });
    await openControls();
    defined(devices.streams[0]).track.getSettings().latency = undefined;
    record();
    recorder().emitStart();
    setVideo({ playClock: { startTime: 4, startWall: Date.now() } });
    await stopTake();
    expect(takeClip().start).toBeCloseTo(4 - 0.01, 6);
  });

  it('adds the Recording offset of the microphone in use', async () => {
    prefs({ countIn: 0, offsets: { default: 0.1 } });
    await openControls();
    record();
    recorder().emitStart();
    setVideo({ playClock: { startTime: 4, startWall: Date.now() } });
    await stopTake();
    expect(takeClip().start).toBeCloseTo(4 - 0.02 + 0.1, 6);
  });

  it('replaces what it overlaps and is one undo step', async () => {
    const earlier: VSound = {
      id: 's1',
      track: 'A2',
      start: 2,
      in: 0,
      out: 6,
      volume: 1,
      toEnd: false,
      srcDur: 6,
      name: 'Old voice',
      file: new Blob(),
      url: 'blob:old',
    };
    loadVideoProject({ clips: [clip('a', 0, 30)], tracks: voiceTracks(), sounds: [earlier], t: 4 });
    const before = getVideo();
    await recordTake();
    await stopTake();
    expect(getVideo().sounds.map((sound) => sound.name)).toEqual(['Old voice', 'Voice 1']);
    expect(getRecorder().lastTake?.replaced).toEqual([
      { name: 'Old voice', seconds: expect.closeTo(8 - (4 - 0.036), 6) as number },
    ]);
    undoV();
    expect(getVideo().sounds).toBe(before.sounds);
    expect(getVideo().tracks).toBe(before.tracks);
    redoV();
    expect(getVideo().sounds.map((sound) => sound.name)).toEqual(['Old voice', 'Voice 1']);
  });

  it('adds a Voice track with the take, undone together', async () => {
    loadVideoProject({ clips: [clip('a', 0, 30)], t: 4 });
    await recordTake();
    await stopTake();
    const voice = defined(
      getVideo().tracks.find((track) => track.name === 'Voice'),
      'Voice track',
    );
    expect(takeClip().track).toBe(voice.id);
    undoV();
    expect(getVideo().tracks.some((track) => track.name === 'Voice')).toBe(false);
    expect(getVideo().sounds).toEqual([]);
  });

  it('is edited like any sound clip, on a track whose sound counts as voice for ducking (AC-8)', async () => {
    await recordTake();
    await stopTake();
    const take = takeClip();
    const track = defined(
      getVideo().tracks.find((candidate) => candidate.id === take.track),
      'track',
    );
    expect(soundRole(track)).toBe('voice');
    expect(countsAsVoice(track)).toBe(true);
    expect(setSoundFades(take.id, { fadeIn: 0.5 })).toBeNull();
    setPlayhead(8);
    expect(splitSoundAt(take.id)).toBeNull();
    const parts = getVideo().sounds.filter((sound) => sound.track === take.track);
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => part.start + defined(part.out, 'out') - part.in)).toEqual([
      expect.closeTo(8, 6),
      expect.closeTo(take.start + 8.6, 6),
    ]);
  });

  it('keeps chunks on the device while recording and lets go of them once the take is kept with the project', async () => {
    await recordTake(['a', 'b']);
    const stored = await takes.list('p1');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Voice 1', track: 'A2', done: false, mime: 'audio/webm;codecs=opus' });
    expect(await (await takes.join(defined(stored[0]).id)).text()).toBe('ab');
    await stopTake();
    expect(await takes.list()).toEqual([]);
  });

  it('when the take can’t be kept with the project (no room), it stays on the timeline and on the device', async () => {
    kept = { error: 'No room' };
    await recordTake();
    await stopTake();
    expect(takeClip()).toBeDefined();
    expect(await takes.list('p1')).toEqual([expect.objectContaining({ done: true }) as unknown]);
  });

  it('a take cut short by the microphone keeps what was recorded and says how long it is', async () => {
    measured = 3;
    await recordTake();
    defined(devices.streams[0]).track.end();
    recorder().finishStop('d');
    await vi.advanceTimersByTimeAsync(0);
    expect(takeClip().out).toBe(3);
    expect(getRecorder().message).toBe('Voice 1 kept: 3.0 s, the microphone stopped.');
  });

  it('a take that can’t be read changes nothing and stays on the device for recovery', async () => {
    measured = new Error('bad file');
    const before = getVideo();
    await recordTake();
    await stopTake();
    expect(getVideo().sounds).toBe(before.sounds);
    expect(getRecorder().message).toMatch(/couldn’t be read/);
    expect(logged).toHaveLength(1);
    expect(await takes.list('p1')).toEqual([expect.objectContaining({ done: true }) as unknown]);
  });
});

describe('recovering a take after a crash (AC-9)', () => {
  const DAY = 86_400_000;

  /**
   * A take left on the device by a crash: its header and chunks, as an earlier visit wrote them.
   * @param id its id
   * @param extra other header fields
   * @returns when stored
   */
  async function leftBehind(
    id: string,
    extra: Partial<{ project: string; track: string; start: number; startedAt: number; name: string }> = {},
  ): Promise<void> {
    await takes.begin({
      id,
      project: 'p1',
      name: 'Voice 3',
      startedAt: Date.now() - DAY,
      track: 'A2',
      start: 6,
      mime: 'audio/webm;codecs=opus',
      ...extra,
    });
    await takes.append(id, new Blob(['a']));
    await takes.append(id, new Blob(['b']));
  }

  it('offers the open project’s takes with their name, length and time, and sweeps old ones', async () => {
    measured = 41;
    await leftBehind('t1');
    await leftBehind('t2', { project: 'p2' });
    await leftBehind('old', { startedAt: Date.now() - 31 * DAY });
    await checkRecovery();
    expect(getRecorder().recovery).toEqual([
      { id: 't1', name: 'Voice 3', length: 41, startedAt: Date.now() - DAY, done: false },
    ]);
    expect((await takes.list()).map((take) => take.id)).toEqual(['t1', 't2']);
  });

  it('Add to the timeline places it where it was recorded, with punch-in, as one undo step', async () => {
    measured = 4;
    const earlier: VSound = {
      id: 's1',
      track: 'A2',
      start: 5,
      in: 0,
      out: 3,
      volume: 1,
      toEnd: false,
      srcDur: 3,
      name: 'Old voice',
      file: new Blob(),
      url: 'blob:old',
    };
    loadVideoProject({ clips: [clip('a', 0, 30)], tracks: voiceTracks(), sounds: [earlier] });
    const before = getVideo();
    await leftBehind('t1');
    await checkRecovery();
    expect(await recoverTake('t1')).toBeNull();
    const sound = defined(
      getVideo().sounds.find((clip) => clip.name === 'Voice 3'),
      'recovered take',
    );
    expect(sound).toMatchObject({ track: 'A2', start: 6, out: 4 });
    expect(sound.file instanceof Blob && (await sound.file.text())).toBe('ab');
    expect(getVideo().sounds.find((clip) => clip.id === 's1')?.out).toBe(1);
    expect(getRecorder().recovery).toEqual([]);
    expect(await takes.list()).toEqual([]);
    undoV();
    expect(getVideo().sounds).toBe(before.sounds);
  });

  it('goes onto a Voice track when its track is no longer in the project', async () => {
    loadVideoProject({ clips: [clip('a', 0, 30)] });
    await leftBehind('t1', { track: 'A5' });
    await checkRecovery();
    expect(await recoverTake('t1')).toBeNull();
    const voice = defined(
      getVideo().tracks.find((track) => track.name === 'Voice'),
      'Voice track',
    );
    expect(getVideo().sounds[0]?.track).toBe(voice.id);
  });

  it('a take that can’t be read is offered without a length; it can be saved as a file but not placed', async () => {
    measured = new Error('cut mid-cluster');
    await leftBehind('t1');
    await checkRecovery();
    expect(getRecorder().recovery[0]).toMatchObject({ id: 't1', length: null });
    expect(await recoverTake('t1')).toMatch(/couldn’t be read/);
    const file = await takeFile('t1');
    expect(file.name).toBe('Voice 3.webm');
    expect(await file.text()).toBe('ab');
    expect(await takes.list()).toHaveLength(1);
  });

  it('Discard deletes it', async () => {
    await leftBehind('t1');
    await checkRecovery();
    await discardTake('t1');
    expect(getRecorder().recovery).toEqual([]);
    expect(await takes.list()).toEqual([]);
  });

  it('a take being recorded now isn’t offered', async () => {
    prefs({ countIn: 0 });
    await openControls();
    record();
    recorder().emitStart();
    await vi.advanceTimersByTimeAsync(1_000);
    recorder().emitChunk('a');
    await vi.advanceTimersByTimeAsync(0);
    await checkRecovery();
    expect(getRecorder().recovery).toEqual([]);
  });
});

describe('opening twice at once', () => {
  it('opens the microphone once when the controls ask again while it is opening', async () => {
    await Promise.all([openControls(), openControls('A2')]);
    expect(devices.streams).toHaveLength(1);
    expect(getRecorder()).toMatchObject({ phase: 'ready', track: 'A2' });
  });
});

describe('Shift + R (toggleRecording, AC-10)', () => {
  it('opens the microphone and records when closed, cancels the count-in, then stops a take', async () => {
    await toggleRecording();
    expect(getRecorder()).toMatchObject({ phase: 'countIn' });
    await toggleRecording();
    expect(getRecorder().phase).toBe('ready');
    prefs({ countIn: 0 });
    closeControls();
    await toggleRecording('A2');
    recorder().emitStart();
    expect(getRecorder()).toMatchObject({ phase: 'recording', track: 'A2' });
    await toggleRecording();
    expect(recorder().stopped).toBe(true);
  });
});

describe('announcements (AC-10)', () => {
  it('says the count-in, the start and the result', async () => {
    await openControls();
    record();
    await vi.advanceTimersByTimeAsync(3_000);
    recorder().emitStart();
    expect(told).toEqual(['Recording in 3', '2', '1', 'Recording on Audio 2']);
    setVideo({ playClock: { startTime: 4, startWall: Date.now() } });
    await stop();
    recorder().finishStop('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(told.at(-1)).toBe('Voice 1 added at 0:04.0, 8.6 s');
  });

  it('says Too loud at most once every 5 s', async () => {
    await openControls();
    const meter = defined(meters[0]);
    /**
     * A peak for a while.
     * @param db the peak, dBFS
     * @param ms how long
     */
    const peak = async (db: number, ms: number) => {
      meter.peakDb = db;
      await vi.advanceTimersByTimeAsync(ms);
    };
    await peak(0, 100);
    await peak(-20, 2_500);
    await peak(0, 100);
    expect(told.filter((text) => text === 'Too loud')).toHaveLength(1);
    await peak(-20, 2_500);
    await peak(0, 100);
    expect(told.filter((text) => text === 'Too loud')).toHaveLength(2);
  });
});
