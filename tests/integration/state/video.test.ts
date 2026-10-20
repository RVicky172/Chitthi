import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { clipLength, IDENTITY, presetTransform } from '@/engine/timeline';
import { RAMP_PRESETS, edgeSpeed, playLength, sourceAt } from '@/engine/speed';
import { REVERSE_DROPS_RAMP } from '@/engine/speedEdits';
import {
  addRampPoint,
  freezeFrameAtPlayhead,
  moveRampPoint,
  removeRampPoint,
  resetSpeed,
  setClipRamp,
  setClipReverse,
  setClipSpeed,
  type SpeedOutcome,
} from '@/state/videoSpeed';
import { TEXT_STYLES } from '@/data/layers';
import { layerAt, type Ease, type Keyframe } from '@/engine/keyframes';
import { newSticker, newText, scaleLayer, type Layer, type TextLayer } from '@/engine/layers';
import { DUCK_DEFAULTS, MAIN_VIDEO, defaultTracks, tooManyTracks, type Track } from '@/engine/tracks';
import { applyPreset, setClipTransform, setClipTransformAt, setClipVolume } from '@/state/videoBox';
import {
  deleteGap,
  duplicateClip,
  duplicateClipWhy,
  moveClip,
  moveClipTo,
  moveClipToTime,
  moveClipToTrack,
  nudgeClip,
  removeClip,
  rippleDeleteClip,
  rippleTrimToPlayhead,
  rollClip,
  slideClip,
  slipClip,
  splitAtPlayhead,
  splitAtPlayheadWhy,
  trimClip,
  updateClip,
  updateClipWhy,
} from '@/state/videoClips';
import { deleteKeys, moveKeys, removeAnimation, setKeyEase, toggleKey } from '@/state/videoKeys';
import { setLayerTimes, setVLayers, updateLayerAt } from '@/state/videoLayers';
import { addMedia, mediaIO, NEW_TRACK } from '@/state/videoMedia';
import {
  addSoundFiles,
  setSoundToEnd,
  setSoundVolumeAt,
  soundVolumeAt,
  duplicateSoundClip,
  moveSoundTo,
  removeSound,
  setLoudness,
  setSoundFades,
  setSoundIn,
  setSoundVolume,
  masterGainDb,
  measureIO,
  slipMusic,
  soundIO,
  watchLoudness,
  splitSoundAt,
  trimSoundEdge,
} from '@/state/videoSound';
import { scanIO } from '@/state/soundScan';
import { audioPlan } from '@/engine/soundPlan';
import { mixKey, planLoudness, type MixMeasure } from '@/engine/exportSound';
import { exportVideo, soundJob } from '@/state/videoExportJob';
import { missingMedia } from '@/engine/mediaFile';
import { soundLength } from '@/engine/soundClips';
import { MUSIC } from '@/engine/tracks';
import {
  endVStep,
  getVideo,
  loadVideoProject,
  selectClip,
  setMagnetic,
  setPlayhead,
  setSnapping,
  setTool,
  undoV,
  type VClip,
  videoLength,
  projectOf,
  redoV,
  type VSound,
} from '@/state/videoStore';
import {
  addSoundTrack,
  addTrack,
  clipPlace,
  deleteTrack,
  lowerMusicUnderVoice,
  moveTrack,
  renameTrack,
  setCountsAsVoice,
  setDucking,
  setLowerMusicUnderVoice,
  setTrack,
  setTrackRole,
  setTrackVolume,
} from '@/state/videoTracks';
import { removeTransition, setTransition, transitionEveryCut } from '@/state/videoTransitions';
import { defined } from '../../support/defined';
import { seededRandom } from '../../support/seededRandom';

/*
 * The video store's Magnetic switch, tool and Snap (202 T020). Clips are made by hand (no media decoding in Node):
 * photos of the given lengths at the given starts on the main track (or another).
 */
const clip = (id: string, start: number, dur: number, track = MAIN_VIDEO): VClip => ({
  id,
  kind: 'photo',
  track,
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
const starts = () => getVideo().clips.map((vClip) => [vClip.id, vClip.start]);

describe('Magnetic on (the default): every edit as before', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('c', 5, 1)] }));

  it('starts on, with the Select tool and Snap on', () => {
    expect(getVideo().magnetic).toBe(true);
    expect(getVideo().tool).toBe('select');
    expect(getVideo().snapping).toBe(true);
    expect(getVideo().canUndo).toBe(false);
  });
  it('delete and reorder pack the track, one undo step each', () => {
    expect(removeClip('b')).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['c', 2],
    ]);
    undoV();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 5],
    ]);
    expect(moveClipTo('a', 2)).toBe(true);
    expect(starts()).toEqual([
      ['b', 0],
      ['c', 3],
      ['a', 4],
    ]);
  });
  it('a project loaded with gaps while magnetic is packed', () => {
    loadVideoProject({ clips: [clip('a', 1, 2), clip('b', 4, 3)] });
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });
});

describe('Magnetic off', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 3, 3), clip('c', 7, 1)], magnetic: false }));

  it('keeps gaps through other changes; the length is where the last clip ends', () => {
    expect(updateClip('b', { fade: true }, '')).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 3],
      ['c', 7],
    ]);
    expect(videoLength(getVideo())).toBe(8);
  });
  it('switching it off is not an undo step and changes no clip', () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3)] });
    setMagnetic(false);
    expect(getVideo().magnetic).toBe(false);
    expect(getVideo().canUndo).toBe(false);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });
  it('switching it on closes the gaps in one undo step; undo brings back the gaps and Magnetic off (D1)', () => {
    setMagnetic(true);
    expect(getVideo().magnetic).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 5],
    ]);
    expect(getVideo().canUndo).toBe(true);
    undoV();
    expect(getVideo().magnetic).toBe(false);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 3],
      ['c', 7],
    ]);
  });
});

describe('the tool and Snap are view settings (D4)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2)] }));
  it('change without an undo step or making the export stale', () => {
    const before = getVideo().result;
    setTool('roll');
    setSnapping(false);
    expect(getVideo().tool).toBe('roll');
    expect(getVideo().snapping).toBe(false);
    expect(getVideo().canUndo).toBe(false);
    expect(getVideo().result).toBe(before);
  });
});

/* ---------- 202 T021: the actions with Magnetic off, and the new tools ---------- */

const len = (id: string) => {
  const vClip = defined(getVideo().clips.find((x) => x.id === id));
  return vClip.kind === 'photo' ? vClip.dur : vClip.out - vClip.in;
};

describe('Magnetic off: nothing moves unless asked', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 3, 3), clip('c', 7, 1)], magnetic: false }));

  it('Delete lifts (a gap stays); Shift + Delete ripples', () => {
    expect(removeClip('b')).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['c', 7],
    ]);
    undoV();
    expect(rippleDeleteClip('b')).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['c', 4],
    ]);
  });
  it('a trim ripples only when asked (Shift)', () => {
    expect(trimClip('a', 'end', 0.5)).toBeNull();
    expect([len('a'), ...starts().map((x) => x[1])]).toEqual([2.5, 0, 3, 7]);
    expect(trimClip('b', 'end', 1, { ripple: true })).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 3],
      ['c', 8],
    ]);
  });
  it('a duplicate goes into the first gap after the original that fits, else after the last clip (D2)', () => {
    expect(duplicateClip('a')).toBe(true);
    expect(defined(getVideo().clips.at(-1)).start).toBe(8);
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 5, 1)], magnetic: false });
    expect(duplicateClip('a')).toBe(true);
    expect(getVideo().clips.map((vClip) => vClip.start)).toEqual([0, 2, 5]);
    expect(getVideo().selected).toBe(getVideo().clips[1].id);
  });
  it('a clip moves to a time, or the nearest free spot', () => {
    expect(moveClipToTime('c', 6.5)).toBeNull();
    expect(starts().at(-1)).toEqual(['c', 6.5]);
    expect(moveClipToTime('a', 4)).toBeNull();
    expect(starts()[0]).toEqual(['a', 1]);
  });
  it('a gap is closed on its own', () => {
    expect(deleteGap(2.5)).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 6],
    ]);
    expect(deleteGap(0.5)).toMatch(/no gap/i);
  });
  it('split keeps the times of a clip after a gap', () => {
    setPlayhead(4);
    expect(splitAtPlayhead()).toBe(true);
    expect(getVideo().clips.map((vClip) => [vClip.start, vClip.dur])).toEqual([
      [0, 2],
      [3, 1],
      [4, 2],
      [7, 1],
    ]);
  });
  it('Select + Alt + arrows moves the clip by frames', () => {
    setTool('select');
    expect(nudgeClip('b', 3)).toBeNull();
    expect(getVideo().clips[1].start).toBeCloseTo(3.1, 9);
  });
});

describe('Magnetic on: trims always ripple', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('c', 5, 1)] }));
  it('without Shift too', () => {
    expect(trimClip('a', 'end', 0.5)).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2.5],
      ['c', 5.5],
    ]);
  });
  it('roll, slide and the tool keys keep the length; slip refuses a photo with its reason', () => {
    expect(rollClip('a', 0.5)).toBeNull();
    expect([len('a'), len('b'), videoLength(getVideo())]).toEqual([2.5, 2.5, 6]);
    expect(slideClip('b', -0.5)).toBeNull();
    expect([len('a'), getVideo().clips[1].start, len('c'), videoLength(getVideo())]).toEqual([2, 2, 1.5, 6]);
    expect(slipClip('b', 1)).toMatch(/photo/i);
    setTool('roll');
    expect(nudgeClip('a', 30)).toBeNull();
    expect(len('a')).toBeCloseTo(3, 9);
    setTool('select');
    expect(nudgeClip('a', 1)).toBeNull();
    expect(getVideo().clips.map((vClip) => vClip.id)).toEqual(['b', 'a', 'c']);
  });
  it('Q / W ripple-trim the selected clip’s start / end to the playhead', () => {
    selectClip('b');
    setPlayhead(3);
    expect(rippleTrimToPlayhead('start')).toBeNull();
    expect([len('b'), ...starts().map((x) => x[1])]).toEqual([2, 0, 2, 4]);
    setPlayhead(3);
    expect(rippleTrimToPlayhead('end')).toBeNull();
    expect([len('b'), ...starts().map((x) => x[1])]).toEqual([1, 0, 2, 3]);
    setPlayhead(0.5);
    expect(rippleTrimToPlayhead('end')).toMatch(/playhead/i);
  });
  it('every tool refuses on a locked track with the reason', () => {
    setTrack(MAIN_VIDEO, { locked: true });
    for (const why of [
      trimClip('a', 'end', 1),
      rollClip('a', 1),
      slideClip('b', 1),
      rippleDeleteClip('b'),
      moveClipToTime('a', 3),
      nudgeClip('a', 1),
      deleteGap(1),
    ])
      expect(why).toMatch(/locked/);
  });
});

describe('the music under the Slip keys (Q8)', () => {
  const song: VSound = {
    id: 'music',
    track: MUSIC,
    start: 0,
    in: 1,
    volume: 1,
    toEnd: true,
    srcDur: 30,
    file: new Blob(),
    url: '',
  };
  it('moves the song’s in point within the file', () => {
    loadVideoProject({ clips: [clip('a', 0, 5)], sounds: [song] });
    expect(slipMusic(2)).toBeNull();
    expect(defined(getVideo().sounds[0]).in).toBe(3);
    expect(slipMusic(-10)).toBeNull();
    expect(defined(getVideo().sounds[0]).in).toBe(0);
    expect(slipMusic(100)).toBeNull();
    expect(defined(getVideo().sounds[0]).in).toBe(25);
  });
});

/* ---------- 208 T070: sounds in the store (D1) ---------- */

describe('208: the sounds in the store (D1, Q4, Q7, Q12)', () => {
  const song: VSound = {
    id: 'music',
    track: MUSIC,
    start: 0,
    in: 2,
    volume: 0.6,
    toEnd: true,
    srcDur: 60,
    file: new Blob(),
    url: 'blob:song',
  };
  /** Sound files by name: their length, seconds (undefined: can't be played). */
  const lengths: Record<string, number | undefined> = {
    'song.mp3': 60,
    'whoosh.wav': 2,
    'theme.m4a': 40,
    'Voice 3.webm': 8.6,
    'ambience.weba': 30,
  };
  const fileOf = (name: string, type = 'audio/mpeg') => new File([name], name, { type });
  beforeEach(() => {
    vi.spyOn(soundIO, 'length').mockImplementation((file) => {
      const length = lengths[file instanceof File ? file.name : ''];
      return length === undefined ? Promise.reject(new Error('unplayable')) : Promise.resolve(length);
    });
    vi.spyOn(scanIO, 'scan').mockResolvedValue(null);
    loadVideoProject({ clips: [clip('a', 0, 6)] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('a 201–207 project’s music is one sound clip on the Music track: the same sound plan as before', () => {
    loadVideoProject({ clips: [clip('a', 0, 6)], sounds: [song] });
    expect(projectOf().audio).toEqual([song]);
    expect(audioPlan(projectOf())).toEqual([
      { ref: 'music', track: MUSIC, role: 'music', start: 0, end: 6, from: 2, volume: 0.6, fadeIn: 0, fadeOut: 1.5 },
    ]);
  });

  it('a project loaded without a loudness is Off (from before 208); with one, it keeps it', () => {
    expect(getVideo().loudness).toBe('off');
    loadVideoProject({ clips: [clip('a', 0, 6)], loudness: -16 });
    expect(getVideo().loudness).toBe(-16);
  });

  it('adds several sound files at the playhead: the first song longer than the video plays to its end on Music (Q7)', async () => {
    expect(await addSoundFiles([fileOf('song.mp3'), fileOf('whoosh.wav', 'audio/wav')])).toEqual([]);
    const { sounds, tracks } = getVideo();
    expect(sounds.map(({ track, start, toEnd, name }) => ({ track, start, toEnd, name }))).toEqual([
      { track: MUSIC, start: 0, toEnd: true, name: 'song.mp3' },
      { track: 'A2', start: 0, toEnd: false, name: 'whoosh.wav' },
    ]);
    expect(tracks.find((track) => track.id === 'A2')).toMatchObject({
      kind: 'audio',
      name: 'Audio 2',
      role: 'effects',
    });
    expect(defined(sounds[1]).out).toBe(2);
    expect(sounds.every((sound) => sound.url.startsWith('blob:') && sound.file instanceof Blob)).toBe(true);
    // Each file is scanned in the background (the waveform and ducking read it).
    await vi.waitFor(() => expect(scanIO.scan).toHaveBeenCalledTimes(2));
  });

  it('adding is one undo step (the clips and the new track together)', async () => {
    await addSoundFiles([fileOf('song.mp3'), fileOf('whoosh.wav', 'audio/wav')]);
    undoV();
    expect(getVideo().sounds).toEqual([]);
    expect(getVideo().tracks.some((track) => track.id === 'A2')).toBe(false);
    redoV();
    expect(getVideo().sounds).toHaveLength(2);
  });

  it('a second song on the Music track doesn’t play to the end: it goes where there is room, as it is', async () => {
    await addSoundFiles([fileOf('song.mp3')]);
    setPlayhead(1);
    await addSoundFiles([fileOf('theme.m4a')]);
    expect(defined(getVideo().sounds.find((sound) => sound.name === 'theme.m4a'))).toMatchObject({
      track: 'A2',
      start: 1,
      toEnd: false,
      out: 40,
    });
  });

  it('refuses files that aren’t sound, are over 100 MB or can’t be played, with the reason, adding the rest', async () => {
    const big = fileOf('song.mp3');
    Object.defineProperty(big, 'size', { value: 101 * 1048576 });
    const messages = await addSoundFiles([
      fileOf('notes.txt', 'text/plain'),
      big,
      fileOf('broken.mp3'),
      fileOf('whoosh.wav', 'audio/wav'),
    ]);
    expect(messages).toEqual([
      'notes.txt isn’t a sound file. Use MP3, M4A, WAV, OGG, WebM or FLAC.',
      'song.mp3 is too large. Sound files up to 100 MB can be added.',
      'broken.mp3 couldn’t be played here.',
    ]);
    expect(getVideo().sounds.map((sound) => sound.name)).toEqual(['whoosh.wav']);
  });

  it('takes WebM sound (Q7, D-062): a saved voice take, typed video/webm by the system, and .weba', async () => {
    expect(await addSoundFiles([fileOf('Voice 3.webm', 'video/webm'), fileOf('ambience.weba', '')])).toEqual([]);
    expect(getVideo().sounds.map(({ name, srcDur }) => ({ name, srcDur }))).toEqual([
      { name: 'Voice 3.webm', srcDur: 8.6 },
      { name: 'ambience.weba', srcDur: 30 },
    ]);
  });

  it('a locked Music track takes nothing: the song goes on another sound track', async () => {
    setTrack(MUSIC, { locked: true });
    await addSoundFiles([fileOf('song.mp3')]);
    expect(defined(getVideo().sounds[0])).toMatchObject({ track: 'A2', toEnd: false });
  });

  it('volume 0–200 %, the song’s in point, removing: each an undo step', async () => {
    await addSoundFiles([fileOf('whoosh.wav', 'audio/wav')]);
    const id = defined(getVideo().sounds[0]).id;
    expect(setSoundVolume(id, 3)).toBeNull();
    expect(defined(getVideo().sounds[0]).volume).toBe(2);
    expect(setSoundIn(id, 0.5)).toBeNull();
    expect(defined(getVideo().sounds[0])).toMatchObject({ in: 0, out: 2 });
    expect(removeSound(id)).toBeNull();
    expect(getVideo().sounds).toEqual([]);
    undoV();
    expect(getVideo().sounds).toHaveLength(1);
    expect(removeSound('nope')).toMatch(/isn’t/);
  });

  it('T104: a sound clip’s volume keys (0–2): the keyframe button, the keyed volume at the playhead, Remove animation', () => {
    const effect: VSound = {
      id: 's',
      track: MUSIC,
      start: 1,
      in: 0,
      out: 4,
      volume: 1.5,
      toEnd: false,
      srcDur: 4,
      file: new Blob(),
      url: 'blob:s',
    };
    loadVideoProject({ clips: [clip('a', 0, 6)], sounds: [effect] });
    setPlayhead(2);
    expect(toggleKey({ sound: 's' }, 'volume')).toBeNull();
    expect(defined(getVideo().sounds[0]).keys?.volume).toEqual([{ t: 1, v: 1.5, ease: 'ease-in-out' }]);
    setPlayhead(4);
    // Keyed: the volume sets (or adds) the key at the playhead, up to 200 %.
    expect(setSoundVolumeAt('s', 3)).toBeNull();
    expect(defined(getVideo().sounds[0]).keys?.volume?.map((key) => [key.t, key.v])).toEqual([
      [1, 1.5],
      [3, 2],
    ]);
    expect(soundVolumeAt(defined(getVideo().sounds[0]), 3)).toBe(2);
    // A key added between keys holds the value there, above 100 % (a sound clip's range is 0–2).
    setPlayhead(3.5);
    expect(toggleKey({ sound: 's' }, 'volume')).toBeNull();
    expect(defined(defined(getVideo().sounds[0]).keys?.volume?.[1]).v).toBeGreaterThan(1.5);
    setPlayhead(4);
    expect(removeAnimation({ sound: 's' }, 'volume')).toBeNull();
    expect(defined(getVideo().sounds[0])).toMatchObject({ volume: 2, keys: undefined });
    setTrack(MUSIC, { locked: true });
    expect(toggleKey({ sound: 's' }, 'volume')).toMatch(/locked/);
    expect(toggleKey({ sound: 'nope' }, 'volume')).toMatch(/isn’t/);
  });

  it('T072: a Play to the end song stops at the next sound on its track in the export’s plan (option A)', () => {
    const fx: VSound = {
      id: 'fx',
      track: MUSIC,
      start: 3,
      in: 0,
      out: 1,
      volume: 1,
      toEnd: false,
      srcDur: 1,
      file: new Blob(),
      url: 'blob:fx',
    };
    loadVideoProject({ clips: [clip('a', 0, 6)], sounds: [song, fx] });
    expect(audioPlan(projectOf()).map(({ ref, start, end }) => [ref, start, end])).toEqual([
      ['music', 0, 3],
      ['fx', 3, 4],
    ]);
  });

  it('T104: Play to the end of the video, on and off, one undo step each', () => {
    const effect: VSound = {
      id: 's',
      track: MUSIC,
      start: 1,
      in: 0,
      out: 2,
      volume: 1,
      toEnd: false,
      srcDur: 30,
      file: new Blob(),
      url: 'blob:s',
    };
    loadVideoProject({ clips: [clip('a', 0, 6)], sounds: [effect] });
    expect(setSoundToEnd('s', true)).toBeNull();
    expect(defined(getVideo().sounds[0]).toEnd).toBe(true);
    expect(defined(getVideo().sounds[0]).out).toBeUndefined();
    expect(setSoundToEnd('s', false)).toBeNull();
    expect(defined(getVideo().sounds[0])).toMatchObject({ toEnd: false, out: 5 });
    undoV();
    expect(defined(getVideo().sounds[0]).toEnd).toBe(true);
  });
});

/* ---------- 203 T040: tracks, overlay clips, transforms and the videos-at-once limit ---------- */

const ov = (id: string): Track => ({
  id,
  kind: 'overlay',
  name: `Overlay ${id.slice(1)}`,
  hidden: false,
  muted: false,
  locked: false,
});
/**
 * Tracks: the main video track, the given overlay tracks (bottom first), the music.
 * @param ids the overlay tracks' ids
 * @returns the tracks
 */
const withOverlays = (...ids: string[]): Track[] => {
  const [main, music] = defaultTracks();
  return [main, ...ids.map(ov), music];
};
/**
 * A video clip playing `len` seconds (its whole source) at `start` on `track`.
 * @param id the clip's id
 * @param start where it starts on the timeline
 * @param len its length in seconds
 * @param track its track
 * @returns the clip
 */
const vid = (id: string, start: number, len: number, track = MAIN_VIDEO): VClip => ({
  ...clip(id, start, 0, track),
  kind: 'video',
  srcDur: len,
  in: 0,
  out: len,
  volume: 1,
});
const on = (track: string) =>
  getVideo()
    .clips.filter((vClip) => vClip.track === track)
    .map((vClip) => [vClip.id, vClip.start]);
const trackIds = () => getVideo().tracks.map((track) => track.id);
/**
 * Undoes everything: the number of steps (each action here is one).
 * @returns how many undo steps there were
 */
const undos = () => {
  let count = 0;
  while (getVideo().canUndo) {
    undoV();
    count++;
  }
  return count;
};
// Chrome's limit (3 videos at once in the browser) needs WebCodecs' VideoDecoder; Node has none (1 at a time).
const withDecoder = () =>
  vi.stubGlobal(
    'VideoDecoder',
    class VideoDecoderStub {
      readonly stub = true;
    },
  );

describe('203: tracks (AC-1, AC-2)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2)], tracks: withOverlays() }));

  it('Add track: "Overlay N" at the top of the picture tracks, one undo step each, refused at the limit with the reason', () => {
    expect(addTrack()).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
    expect(getVideo().tracks[1].name).toBe('Overlay 1');
    expect(addTrack()).toBeNull();
    expect(addTrack()).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', 'A1']);
    // The browser's limit, 4 picture tracks, with what the desktop app allows.
    expect(addTrack()).toBe(tooManyTracks(false));
    expect(trackIds()).toHaveLength(5);
    expect(undos()).toBe(3);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'A1']);
  });
  it('rename (trimmed, 1–40 characters) and move among the overlays, one undo step each; refusals give the reason', () => {
    loadVideoProject({
      clips: [clip('a', 0, 2), clip('x', 0, 1, 'O1'), clip('y', 1, 1, 'O2')],
      tracks: withOverlays('O1', 'O2'),
    });
    expect(renameTrack('O1', '  Face cam ')).toBeNull();
    expect(getVideo().tracks[1].name).toBe('Face cam');
    expect(renameTrack('O1', '   ')).toMatch(/name/);
    expect(renameTrack('O1', 'x'.repeat(41))).toMatch(/40/);
    expect(renameTrack('O1', 'Face cam')).toBeNull(); // unchanged: no step
    expect(moveTrack('O1', 1)).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O2', 'O1', 'A1']);
    // The clips stay grouped in the tracks' order, the main track first.
    expect(getVideo().clips.map((vClip) => vClip.id)).toEqual(['a', 'y', 'x']);
    expect(moveTrack('O1', 1)).toMatch(/top track/);
    expect(moveTrack(MAIN_VIDEO, 1)).toMatch(/bottom picture track/);
    expect(undos()).toBe(2);
    expect(getVideo().tracks[1].name).toBe('Overlay 1');
    expect(getVideo().clips.map((vClip) => vClip.id)).toEqual(['a', 'x', 'y']);
  });
  it('delete takes the track’s clips in one undo step; the main track, the music and a locked track are refused', () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('x', 0, 1, 'O1')], tracks: withOverlays('O1') });
    selectClip('x');
    expect(deleteTrack(MAIN_VIDEO)).toMatch(/can’t be deleted/);
    expect(deleteTrack('A1')).toMatch(/at least one sound track/);
    setTrack('O1', { locked: true });
    expect(deleteTrack('O1')).toMatch(/locked/);
    setTrack('O1', { locked: false });
    expect(deleteTrack('O1')).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'A1']);
    expect(getVideo().clips.map((vClip) => vClip.id)).toEqual(['a']);
    expect(getVideo().selected).toBe('a');
    undoV();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
    expect(getVideo().clips.map((vClip) => vClip.id)).toEqual(['a', 'x']);
  });
  it('Mute is for overlay tracks (their clips’ sound), not the main track (Hide only)', () => {
    loadVideoProject({ clips: [clip('a', 0, 2)], tracks: withOverlays('O1') });
    setTrack('O1', { muted: true });
    setTrack(MAIN_VIDEO, { muted: true });
    expect(getVideo().tracks.map((track) => track.muted)).toEqual([false, true, false]);
    expect(undos()).toBe(1);
  });
  it('clipPlace numbers clips per track (the inspector’s "Clip N")', () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 2), clip('x', 3, 1, 'O1')], tracks: withOverlays('O1') });
    expect(clipPlace('b')).toMatchObject({ n: 2, track: { id: MAIN_VIDEO } });
    expect(clipPlace('x')).toMatchObject({ n: 1, track: { id: 'O1' } });
    expect(clipPlace('nope')).toBeNull();
  });
});

describe('203: adding photos and videos to a track (AC-3)', () => {
  const lengths: Record<string, number> = {};
  const file = (name: string, len: number, type = name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg') => {
    lengths[name] = len;
    return { name, blob: new Blob(['x'], { type }), type };
  };
  beforeEach(() => {
    vi.spyOn(mediaIO, 'photo').mockImplementation((name) =>
      Promise.resolve({ ...clip(`${name}#`, 0, lengths[name]), name }),
    );
    vi.spyOn(mediaIO, 'video').mockImplementation((name) =>
      Promise.resolve({ ...vid(`${name}#`, 0, lengths[name]), name }),
    );
    vi.spyOn(mediaIO, 'strip').mockResolvedValue(undefined);
    withDecoder();
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('x', 2, 1, 'O1')], tracks: withOverlays('O1') });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('without options: at the end of the main track as before, one undo step; main clips stay first', async () => {
    expect(await addMedia([file('p.jpg', 3), file('q.mp4', 4)])).toEqual([]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 2],
      ['p.jpg#', 5],
      ['q.mp4#', 8],
    ]);
    expect(getVideo().clips.map((vClip) => vClip.id)).toEqual(['a', 'b', 'p.jpg#', 'q.mp4#', 'x']);
    expect(undos()).toBe(1);
  });
  it('on an overlay track: from the playhead, each after the clips there when it doesn’t fit; never packed', async () => {
    setPlayhead(1);
    expect(await addMedia([file('p.jpg', 3), file('q.mp4', 1)], { track: 'O1' })).toEqual([]);
    // p (3 s) doesn't fit before x (2–3): it goes after x; q follows p.
    expect(on('O1')).toEqual([
      ['x', 2],
      ['p.jpg#', 3],
      ['q.mp4#', 6],
    ]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
    expect(await addMedia([file('r.jpg', 1)], { track: 'O1', at: 0.5 })).toEqual([]);
    expect(on('O1')[0]).toEqual(['r.jpg#', 0.5]);
    expect(undos()).toBe(2);
  });
  it('dropped above the top track: a new overlay track first, with the clips, in one undo step', async () => {
    expect(await addMedia([file('p.jpg', 2)], { track: NEW_TRACK, at: 4 })).toEqual([]);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'O2', 'A1']);
    expect(on('O2')).toEqual([['p.jpg#', 4]]);
    expect(undos()).toBe(1);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
    // Nothing added: no track either.
    expect(await addMedia([file('bad.gif', 1, 'image/gif')], { track: NEW_TRACK })).toHaveLength(1);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
  });
  it('on the main track at a time with Magnetic on: inserted where it falls in the order', async () => {
    expect(await addMedia([file('p.jpg', 1)], { track: MAIN_VIDEO, at: 2.5 })).toEqual([]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['p.jpg#', 2],
      ['b', 3],
    ]);
  });
  it('with Magnetic off and no time: after the main track’s last clip, its gaps kept', async () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 3, 1)], magnetic: false });
    expect(await addMedia([file('p.jpg', 1)])).toEqual([]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 3],
      ['p.jpg#', 4],
    ]);
  });
  it('refused on a locked track, a sound track or a missing one', async () => {
    setTrack('O1', { locked: true });
    expect(await addMedia([file('p.jpg', 1)], { track: 'O1' })).toEqual([expect.stringMatching(/locked/)]);
    expect(await addMedia([file('p.jpg', 1)], { track: 'A1' })).toEqual([expect.stringMatching(/picture track/)]);
    expect(await addMedia([file('p.jpg', 1)], { track: 'O9' })).toEqual([expect.stringMatching(/picture track/)]);
  });
  it('a video that would show more than 3 at once is left out with the reason; photos still go in', async () => {
    loadVideoProject({
      clips: [vid('m', 0, 10), vid('x', 0, 5, 'O1'), vid('y', 0, 5, 'O2')],
      tracks: withOverlays('O1', 'O2', 'O3'),
    });
    const msgs = await addMedia([file('q.mp4', 2), file('p.jpg', 2)], { track: 'O3', at: 1 });
    expect(msgs).toEqual([
      expect.stringMatching(/^q\.mp4 wasn’t added\. At most 3 videos can show at the same time in the browser/),
    ]);
    expect(on('O3')).toEqual([['p.jpg#', 1]]);
    // Once the other overlay videos have ended, a video fits.
    expect(await addMedia([file('r.mp4', 2)], { track: 'O3', at: 6 })).toEqual([]);
    expect(on('O3')).toEqual([
      ['p.jpg#', 1],
      ['r.mp4#', 6],
    ]);
  });
  it('the length limit applies to where the clips end', async () => {
    expect(await addMedia([file('q.mp4', 200)], { track: 'O1', at: 80 })).toEqual([
      expect.stringMatching(/trimmed to 10 seconds/),
    ]);
    expect(defined(getVideo().clips.find((vClip) => vClip.id === 'q.mp4#')).out).toBe(10);
    expect(await addMedia([file('p.jpg', 2)], { track: 'O1', at: 89.8 })).toEqual([
      expect.stringMatching(/end after 90 seconds/),
    ]);
  });
});

describe('203: overlay clips under the edits (AC-3, Q8)', () => {
  beforeEach(() => {
    withDecoder();
    loadVideoProject({
      clips: [clip('a', 0, 2), clip('b', 2, 3), clip('x', 1, 1, 'O1'), clip('y', 4, 1, 'O1')],
      tracks: withOverlays('O1'),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Delete lifts an overlay clip even with Magnetic on; the main track still closes up', () => {
    expect(removeClip('x')).toBe(true);
    expect(on('O1')).toEqual([['y', 4]]);
    expect(removeClip('a')).toBe(true);
    expect(on(MAIN_VIDEO)).toEqual([['b', 0]]);
  });
  it('a clip moves between picture tracks: onto an overlay where it fits, onto the main track inserted (Magnetic)', () => {
    expect(moveClipToTrack('b', 'O1', 2)).toBeNull();
    expect(on(MAIN_VIDEO)).toEqual([['a', 0]]);
    // b (3 s) doesn't fit between x and y: the nearest free spot is after y.
    expect(on('O1')).toEqual([
      ['x', 1],
      ['y', 4],
      ['b', 5],
    ]);
    undoV();
    expect(moveClipToTrack('y', MAIN_VIDEO, 0)).toBeNull();
    expect(on(MAIN_VIDEO)).toEqual([
      ['y', 0],
      ['a', 1],
      ['b', 3],
    ]);
    expect(getVideo().clips.map((vClip) => vClip.track)).toEqual([MAIN_VIDEO, MAIN_VIDEO, MAIN_VIDEO, 'O1']);
    expect(getVideo().selected).toBe('y');
  });
  it('refuses a target that isn’t a picture track, and locked tracks', () => {
    expect(moveClipToTrack('x', 'A1', 0)).toMatch(/picture track/);
    expect(moveClipToTrack('x', 'O7', 0)).toMatch(/picture track/);
    setTrack(MAIN_VIDEO, { locked: true });
    expect(moveClipToTrack('x', MAIN_VIDEO, 0)).toMatch(/locked/);
  });
  it('split takes the selected overlay clip under the playhead, else the main track’s', () => {
    setPlayhead(1.5);
    selectClip('x');
    expect(splitAtPlayheadWhy()).toBeNull();
    expect(
      getVideo()
        .clips.filter((vClip) => vClip.track === 'O1')
        .map((vClip) => [vClip.start, vClip.dur]),
    ).toEqual([
      [1, 0.5],
      [1.5, 0.5],
      [4, 1],
    ]);
    selectClip('b');
    setPlayhead(1);
    expect(splitAtPlayheadWhy()).toBeNull();
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      [getVideo().clips[1].id, 1],
      ['b', 2],
    ]);
    setPlayhead(0.1);
    expect(splitAtPlayheadWhy()).toMatch(/playhead inside a clip/);
  });
  it('duplicate on an overlay track goes into the next gap that fits, with Magnetic on too', () => {
    expect(duplicateClipWhy('x')).toBeNull();
    expect(on('O1').map((span) => span[1])).toEqual([1, 2, 4]);
    expect(duplicateClipWhy('y')).toBeNull();
    expect(on('O1').map((span) => span[1])).toEqual([1, 2, 4, 5]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });
  it('moveClip steps within the clip’s own track', () => {
    expect(moveClip('b', -1)).toBe(true);
    expect(on(MAIN_VIDEO)).toEqual([
      ['b', 0],
      ['a', 3],
    ]);
    expect(moveClip('x', 1)).toBe(false); // overlay tracks keep times, not an order
  });
});

describe('203: the videos-at-once limit on what the store makes (AC-9)', () => {
  beforeEach(withDecoder);
  afterEach(() => vi.unstubAllGlobals());
  const many = /At most 3 videos can show at the same time in the browser.*desktop app allows 5/;
  const four = () =>
    loadVideoProject({
      clips: [vid('m', 0, 10), vid('x', 0, 2, 'O1'), vid('y', 2, 2, 'O2'), vid('z', 2, 2, 'O3')],
      tracks: withOverlays('O1', 'O2', 'O3'),
    });

  it('duplicate and moves are refused when they would show a 4th video; allowed elsewhere, one step', () => {
    four();
    expect(duplicateClipWhy('x')).toMatch(many);
    expect(duplicateClip('x')).toBe(false);
    expect(moveClipToTrack('x', 'O1', 2)).toMatch(many);
    expect(getVideo().canUndo).toBe(false);
    expect(moveClipToTrack('x', 'O1', 4)).toBeNull();
    expect(undos()).toBe(1);
  });
  it('switching Magnetic on is refused when closing the gaps would show a 4th video', () => {
    loadVideoProject({
      clips: [vid('a', 0, 2), vid('b', 5, 2), vid('x', 2, 2, 'O1'), vid('y', 2, 2, 'O2'), vid('z', 2, 2, 'O3')],
      tracks: withOverlays('O1', 'O2', 'O3'),
      magnetic: false,
    });
    expect(setMagnetic(true)).toMatch(many);
    expect(getVideo().magnetic).toBe(false);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 5],
    ]);
  });
  it('the inspector’s own changes too (a main video lengthened under three overlay videos)', () => {
    loadVideoProject({
      clips: [{ ...vid('a', 0, 2), srcDur: 10 }, vid('x', 2, 2, 'O1'), vid('y', 2, 2, 'O2'), vid('z', 2, 2, 'O3')],
      tracks: withOverlays('O1', 'O2', 'O3'),
    });
    expect(updateClip('a', { out: 3 })).toBe(false);
    expect(getVideo().clips[0].out).toBe(2);
    expect(updateClip('a', { out: 1.5 })).toBe(true);
  });
  it('an older project already over the limit can still be edited down', () => {
    loadVideoProject({
      clips: [vid('m', 0, 10), vid('w', 0, 2, 'O1'), vid('x', 0, 2, 'O2'), vid('y', 0, 2, 'O3')],
      tracks: withOverlays('O1', 'O2', 'O3'),
    });
    expect(removeClip('y')).toBe(true);
    expect(moveClipToTrack('x', 'O2', 3)).toBeNull();
  });
  it('without WebCodecs (Firefox; Node here): one video at a time, with the reason', () => {
    vi.unstubAllGlobals();
    loadVideoProject({ clips: [vid('m', 0, 10), vid('x', 12, 2, 'O1')], tracks: withOverlays('O1') });
    expect(moveClipToTrack('x', 'O1', 4)).toMatch(/one video at a time/);
    expect(moveClipToTrack('x', MAIN_VIDEO)).toBeNull();
  });
});

describe('203: a clip’s place in the frame (AC-4, AC-5)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('x', 0, 2, 'O1')], tracks: withOverlays('O1') }));
  const tf = (id = 'x') => defined(getVideo().clips.find((vClip) => vClip.id === id)).tf;

  it('new and main clips have no transform (the whole frame)', () => {
    expect(tf('a')).toBeUndefined();
    expect(tf()).toBeUndefined();
  });
  it('a drag is one undo step however many changes it makes; values are clamped', () => {
    for (let index = 1; index <= 20; index++)
      expect(setClipTransform('x', { x: 0.5 + index / 100, y: 0.5 - index / 100 }, 'drag:x')).toBeNull();
    expect(tf()).toMatchObject({ x: 0.7, y: 0.3, w: 1 });
    expect(setClipTransform('x', { w: 9, opacity: -1, rot: 400 })).toBeNull();
    expect(tf()).toMatchObject({ w: 4, opacity: 0, rot: 180 });
    expect(undos()).toBe(2);
    expect(tf()).toBeUndefined();
  });
  it('back to the whole frame stores no transform; an unchanged value records nothing', () => {
    setClipTransform('x', { w: 0.5 }, '');
    setClipTransform('x', { w: 1 }, '');
    expect(tf()).toBeUndefined();
    endVStep();
    setClipTransform('x', { w: 1 }, '');
    expect(undos()).toBe(2);
  });
  it('presets: a corner at 35 % with a 4 % margin, upright, keeping opacity; Full frame', () => {
    setClipTransform('x', { opacity: 0.5, rot: 30 }, '');
    expect(applyPreset('x', 'top-right')).toBeNull();
    expect(tf()).toEqual({ ...presetTransform('top-right', 1080, 1920), opacity: 0.5 });
    expect(defined(tf()).x).toBeCloseTo(0.785, 9);
    expect(defined(tf()).w).toBe(0.35);
    expect(applyPreset('x', 'full')).toBeNull();
    expect(tf()).toEqual({ ...presetTransform('full', 1080, 1920), opacity: 0.5 });
    expect(undos()).toBe(3);
  });
  it('a main clip can be transformed too (Q3); locked tracks and missing clips are refused', () => {
    expect(setClipTransform('a', { w: 0.5 })).toBeNull();
    expect(defined(tf('a')).w).toBe(0.5);
    setTrack('O1', { locked: true });
    expect(setClipTransform('x', { w: 0.5 })).toMatch(/locked/);
    expect(applyPreset('x', 'top-left')).toMatch(/locked/);
    expect(setClipTransform('nope', { w: 0.5 })).toMatch(/isn’t on the timeline/);
  });
});

describe('203: the inspector shows why a clip change was refused (T054)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2)] }));
  it('says the track is locked', () => {
    setTrack(MAIN_VIDEO, { locked: true });
    expect(updateClipWhy('a', { dur: 3 })).toMatch(/locked/);
    expect(updateClip('a', { dur: 3 })).toBe(false);
  });
  it('says the project would be too long', () => {
    expect(updateClipWhy('a', { dur: 100_000 })).toMatch(/up to/);
    expect(getVideo().clips[0].dur).toBe(2);
  });
  it('is null when the change is made', () => {
    expect(updateClipWhy('a', { dur: 3 })).toBeNull();
    expect(getVideo().clips[0].dur).toBe(3);
  });
});

/* ---------- 205 T050: keyframes in the store (AC-3, AC-5) ---------- */

describe('205: keyframes in the store (AC-3, AC-5)', () => {
  const keyframe = (time: number, value: number, ease: Ease = 'linear'): Keyframe => ({ t: time, v: value, ease });
  const sticker = (id: string, start: number, end: number, keys?: Layer['keys']): Layer => ({
    ...newSticker('⭐'),
    id,
    start,
    end,
    ...(keys ? { keys } : {}),
  });
  const getClip = (id: string) => defined(getVideo().clips.find((vClip) => vClip.id === id));
  const getLayer = (id: string) => defined(getVideo().layers.find((layer) => layer.id === id));
  /**
   * a: photo 0–4 on the main track with x keys (0.25 → 0.75); x: photo 1–3 on O1 without keys; v: video 4–8, volume 1.
   */
  const load = () => {
    loadVideoProject({
      clips: [
        { ...clip('a', 0, 4), keys: { x: [keyframe(0, 0.25), keyframe(4, 0.75)] } },
        clip('x', 1, 2, 'O1'),
        vid('v', 4, 4),
      ],
      tracks: withOverlays('O1'),
      layers: [sticker('L', 1, 5, { opacity: [keyframe(0, 1), keyframe(2, 0)] }), sticker('M', 0, 3)],
    });
  };
  beforeEach(load);

  it('split gives each part its keys, with one at the cut holding the value there', () => {
    selectClip('a');
    setPlayhead(1);
    expect(splitAtPlayheadWhy()).toBeNull();
    const [left, right] = getVideo().clips.filter((vClip) => vClip.track === MAIN_VIDEO);
    expect(left.keys).toEqual({ x: [keyframe(0, 0.25), keyframe(1, 0.375)] });
    expect(right.keys).toEqual({ x: [keyframe(0, 0.375), keyframe(3, 0.75)] });
    expect(undos()).toBe(1);
  });

  it('duplicate copies the keys', () => {
    expect(duplicateClipWhy('a')).toBeNull();
    const copy = defined(
      getVideo().clips.find((vClip) => vClip.id !== 'a' && vClip.track === MAIN_VIDEO && vClip.kind === 'photo'),
    );
    expect(copy.keys).toEqual(getClip('a').keys);
  });

  it('setLayerTimes shifts the keys when the start edge moves, and not when the layer moves whole', () => {
    expect(setLayerTimes('L', { start: 1.5 }, 'drag:L')).toBeNull();
    expect(getLayer('L').keys).toEqual({ opacity: [keyframe(-0.5, 1), keyframe(1.5, 0)] });
    expect(setLayerTimes('L', { start: 2, end: 6 }, '')).toBeNull();
    expect([getLayer('L').start, getLayer('L').end]).toEqual([2, 6]);
    expect(getLayer('L').keys).toEqual({ opacity: [keyframe(-0.5, 1), keyframe(1.5, 0)] });
    // A layer without keys just moves.
    expect(setLayerTimes('M', { start: 1 }, '')).toBeNull();
    expect('keys' in getLayer('M')).toBe(false);
    expect(undos()).toBe(3);
  });

  it('toggleKey: starts animating at the playhead, adds at the animated value, and removes', () => {
    setPlayhead(2);
    expect(toggleKey({ clip: 'x' }, 'w')).toBeNull();
    expect(getClip('x').keys).toEqual({ w: [keyframe(1, 1, 'ease-in-out')] });
    expect(toggleKey({ clip: 'a' }, 'x')).toBeNull();
    expect(defined(getClip('a').keys).x).toEqual([
      keyframe(0, 0.25),
      keyframe(2, 0.5, 'ease-in-out'),
      keyframe(4, 0.75),
    ]);
    // At a key: removed.
    expect(toggleKey({ clip: 'a' }, 'x')).toBeNull();
    expect(defined(getClip('a').keys).x).toEqual([keyframe(0, 0.25), keyframe(4, 0.75)]);
    // Removing a value's last key keeps its value there as the stored one: nothing jumps.
    setPlayhead(1.5);
    expect(toggleKey({ layer: 'M' }, 'rot')).toBeNull();
    expect(getLayer('M').keys).toEqual({ rot: [keyframe(1.5, 0, 'ease-in-out')] });
    expect(toggleKey({ layer: 'M' }, 'rot')).toBeNull();
    expect(getLayer('M').keys).toBeUndefined();
    expect(getLayer('M').rot).toBe(0);
    expect(undos()).toBe(5);
  });

  it('toggleKey and removeAnimation take several values at once (a layer’s position: X and Y), one step each', () => {
    setPlayhead(2);
    expect(toggleKey({ layer: 'M' }, ['x', 'y'])).toBeNull();
    expect(getLayer('M').keys).toEqual({ x: [keyframe(2, 0.5, 'ease-in-out')], y: [keyframe(2, 0.5, 'ease-in-out')] });
    setPlayhead(1);
    updateLayerAt('M', { x: 0.2, y: 0.3 }, '');
    expect(toggleKey({ layer: 'M' }, ['x', 'y'])).toBeNull();
    expect(defined(getLayer('M').keys).x).toHaveLength(1);
    expect(removeAnimation({ layer: 'M' }, ['x', 'y'])).toBeNull();
    expect(getLayer('M').keys).toBeUndefined();
    expect(undos()).toBe(4);
  });

  it('removeAnimation keeps the value at the playhead as the stored one', () => {
    setPlayhead(1);
    expect(removeAnimation({ clip: 'a' }, 'x')).toBeNull();
    expect(getClip('a').keys).toBeUndefined();
    expect(getClip('a').tf).toEqual({ ...IDENTITY, x: 0.375 });
    setPlayhead(2);
    expect(removeAnimation({ layer: 'L' }, 'opacity')).toBeNull();
    expect(getLayer('L').opacity).toBeCloseTo(0.5, 12);
    expect(getLayer('L').keys).toBeUndefined();
    expect(undos()).toBe(2);
  });

  it('moveKeys: a drag is one undo step; moving onto a key replaces it', () => {
    for (let index = 1; index <= 10; index++)
      expect(moveKeys({ clip: 'a' }, 'x', 4 - (index - 1) * 0.1, 4 - index * 0.1, 'drag:key')).toBeNull();
    expect(defined(defined(getClip('a').keys).x).map((key) => +key.t.toFixed(9))).toEqual([0, 3]);
    endVStep();
    expect(moveKeys({ clip: 'a' }, 'all', 3, 0, '')).toBeNull();
    expect(defined(getClip('a').keys).x).toEqual([keyframe(0, 0.75)]);
    expect(undos()).toBe(2);
  });

  it('setKeyEase and deleteKeys, for one value or all at a time', () => {
    toggleKey({ layer: 'L' }, 'x');
    expect(defined(getLayer('L').keys).x).toEqual([keyframe(-1, 0.5, 'ease-in-out')]);
    setPlayhead(1);
    expect(setKeyEase({ layer: 'L' }, 'all', 0, 'hold')).toBeNull();
    expect(defined(defined(getLayer('L').keys).opacity)[0].ease).toBe('hold');
    expect(deleteKeys({ layer: 'L' }, 'opacity', 2)).toBeNull();
    expect(defined(getLayer('L').keys).opacity).toEqual([keyframe(0, 1, 'hold')]);
    expect(deleteKeys({ layer: 'L' }, 'all', -1)).toBeNull();
    expect(getLayer('L').keys).toEqual({ opacity: [keyframe(0, 1, 'hold')] });
    expect(undos()).toBe(4);
  });

  it('setClipTransformAt writes keys for animated values and the box for the rest, in one undo step', () => {
    setPlayhead(2);
    expect(setClipTransformAt('a', { x: 0.6, y: 0.3 }, 'drag:a')).toBeNull();
    expect(setClipTransformAt('a', { x: 0.65, y: 0.35 }, 'drag:a')).toBeNull();
    expect(defined(getClip('a').keys).x).toEqual([
      keyframe(0, 0.25),
      keyframe(2, 0.65, 'ease-in-out'),
      keyframe(4, 0.75),
    ]);
    expect(getClip('a').tf).toEqual({ ...IDENTITY, y: 0.35 });
    // Not animated: as setClipTransform.
    expect(setClipTransformAt('x', { w: 0.4 }, '')).toBeNull();
    expect(getClip('x').tf).toEqual({ ...IDENTITY, w: 0.4 });
    expect(getClip('x').keys).toBeUndefined();
    expect(undos()).toBe(2);
  });

  it('updateLayerAt routes a patch or a function on the layer as shown at the playhead', () => {
    setPlayhead(2);
    updateLayerAt('L', { opacity: 0.25, x: 0.1 }, 'drag:L');
    expect(defined(getLayer('L').keys).opacity).toEqual([
      keyframe(0, 1),
      keyframe(1, 0.25, 'ease-in-out'),
      keyframe(2, 0),
    ]);
    expect(getLayer('L').x).toBe(0.1);
    expect(getLayer('L').opacity).toBe(1);
    setPlayhead(3);
    // The function sees the layer as drawn (opacity 0 at 3 s) and its changes are routed the same way.
    updateLayerAt('L', (shown) => ({ ...shown, opacity: shown.opacity + 0.5, y: 0.9 }), '');
    expect(defined(defined(getLayer('L').keys).opacity).at(-1)).toEqual(keyframe(2, 0.5));
    expect(getLayer('L').y).toBe(0.9);
    expect(undos()).toBe(2);
  });

  it('updateLayerAt with an animated size: the Size slider keys w and leaves the stored font size alone', () => {
    const title = {
      ...newText(TEXT_STYLES[0], 'Hi'),
      id: 'T',
      w: 0.4,
      start: 0,
      keys: { w: [keyframe(0, 0.4), keyframe(2, 0.8)] },
    } as Layer;
    setVLayers([title], '');
    setPlayhead(1);
    updateLayerAt('T', (shown) => scaleLayer(shown, 0.9 / shown.w), '');
    const stored = getLayer('T') as TextLayer;
    expect(defined(stored.keys).w).toEqual([keyframe(0, 0.4), keyframe(1, 0.9, 'ease-in-out'), keyframe(2, 0.8)]);
    expect(stored.w).toBe(0.4);
    expect(stored.size).toBeCloseTo((title as TextLayer).size, 12);
    // Drawn at 1 s: 0.9 wide, its font scaled with it.
    expect(layerAt(stored, 1).size).toBeCloseTo(((title as TextLayer).size * 0.9) / 0.4, 12);
  });

  it('setClipVolume keys an animated volume and stores an unanimated one', () => {
    setPlayhead(5);
    expect(setClipVolume('v', 0.5, '')).toBeNull();
    expect(getClip('v').volume).toBe(0.5);
    expect(toggleKey({ clip: 'v' }, 'volume')).toBeNull();
    setPlayhead(7);
    expect(setClipVolume('v', 0, 'slider:v')).toBeNull();
    expect(defined(getClip('v').keys).volume).toEqual([keyframe(1, 0.5, 'ease-in-out'), keyframe(3, 0, 'ease-in-out')]);
    expect(getClip('v').volume).toBe(0.5);
    expect(undos()).toBe(3);
  });

  it('refuses on a locked track and over the limits, with the reason, recording nothing', () => {
    setTrack('O1', { locked: true });
    endVStep();
    const before = getVideo().clips;
    expect(toggleKey({ clip: 'x' }, 'x')).toMatch(/locked/);
    expect(setClipTransformAt('x', { x: 0.1 }, '')).toMatch(/locked/);
    expect(moveKeys({ clip: 'x' }, 'all', 0, 1, '')).toMatch(/locked/);
    expect(getVideo().clips).toBe(before);
    loadVideoProject({
      clips: [
        { ...clip('a', 0, 4), keys: { x: Array.from({ length: 100 }, (_, index) => keyframe(index / 100, 0.5)) } },
      ],
    });
    setPlayhead(3);
    expect(toggleKey({ clip: 'a' }, 'x')).toMatch(/at most 100/);
    expect(setClipTransformAt('a', { x: 0.3 }, '')).toMatch(/at most 100/);
    expect(getVideo().canUndo).toBe(false);
    expect(toggleKey({ clip: 'nope' }, 'x')).toMatch(/isn’t on the timeline/);
  });
});

/* ---------- 206: transitions in the store (AC-3, AC-4, AC-7) ---------- */

describe('206: transitions in the store', () => {
  const transitionOf = (id: string) => getVideo().clips.find((vClip) => vClip.id === id)?.transition;
  const ids = () => getVideo().clips.map((vClip) => vClip.id);

  describe('adding, changing and removing (AC-7)', () => {
    beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('c', 5, 1)] }));

    it('setTransition adds a 0.5 s cross-dissolve into the next clip, one undo step', () => {
      expect(setTransition('a', {})).toBeNull();
      expect(transitionOf('a')).toEqual({ kind: 'dissolve', dur: 0.5, to: 'b' });
      expect(undos()).toBe(1);
      expect(transitionOf('a')).toBeUndefined();
    });

    it('changes its kind (with that kind’s defaults), options and length; a length drag is one step, held to its room', () => {
      setTransition('a', { kind: 'wipe' });
      expect(transitionOf('a')).toEqual({ kind: 'wipe', dur: 0.5, to: 'b', dir: 'left' });
      setTransition('a', { dir: 'up' });
      setTransition('a', { kind: 'dip', colour: 'white' });
      expect(transitionOf('a')).toEqual({ kind: 'dip', dur: 0.5, to: 'b', colour: 'white' });
      for (const dur of [1, 2, 5]) setTransition('a', { dur }, 'length:a');
      endVStep();
      // a is 2 s and b 3 s: room for 3 s at most... and the 3 s cap.
      expect(defined(transitionOf('a')).dur).toBe(3);
      expect(undos()).toBe(4);
    });

    it('removeTransition is one step; with none there is nothing to undo', () => {
      setTransition('b', { kind: 'zoom' });
      expect(removeTransition('b')).toBeNull();
      expect(transitionOf('b')).toBeUndefined();
      expect(removeTransition('b')).toBeNull();
      expect(undos()).toBe(2);
    });

    it('transitionEveryCut puts the kind on every cut of the track where it fits, one step', () => {
      expect(transitionEveryCut(MAIN_VIDEO, 'slide')).toBeNull();
      expect([transitionOf('a'), transitionOf('b'), transitionOf('c')]).toEqual([
        { kind: 'slide', dur: 0.5, to: 'b', dir: 'left' },
        { kind: 'slide', dur: 0.5, to: 'c', dir: 'left' },
        undefined,
      ]);
      expect(undos()).toBe(1);
    });
  });

  describe('refusals record nothing (AC-3)', () => {
    it('no cut after the clip (the last clip, a gap after it)', () => {
      loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 3, 3)], magnetic: false });
      expect(setTransition('b', {})).toMatch(/cut between two clips that touch/);
      expect(setTransition('a', {})).toMatch(/cut between two clips that touch/);
      expect(transitionEveryCut(MAIN_VIDEO, 'dissolve')).toMatch(/no cuts between touching clips/);
      expect(undos()).toBe(0);
    });

    it('a locked track', () => {
      loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3)] });
      setTransition('a', {});
      setTrack(MAIN_VIDEO, { locked: true });
      for (const refusal of [
        setTransition('a', { dur: 1 }),
        removeTransition('a'),
        transitionEveryCut(MAIN_VIDEO, 'zoom'),
      ])
        expect(refusal).toMatch(/locked/);
      expect(defined(transitionOf('a')).dur).toBe(0.5);
      expect(undos()).toBe(2);
    });

    it('more videos at once than the app allows while it plays (Q7)', () => {
      withDecoder();
      try {
        // a 0–4, b 4–8 on the main track; x and y on two overlays over the cut: 3 videos at once, the browser’s limit.
        loadVideoProject({
          clips: [vid('a', 0, 4), vid('b', 4, 4), vid('x', 3, 2, 'O1'), vid('y', 3, 2, 'O2')],
          tracks: withOverlays('O1', 'O2'),
        });
        expect(setTransition('a', {})).toMatch(/videos/);
        expect(transitionOf('a')).toBeUndefined();
        expect(undos()).toBe(0);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('edits keep or drop them by the one rule (AC-4)', () => {
    beforeEach(() => {
      loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('c', 5, 1)] });
      setTransition('a', { dur: 1 });
    });

    it('a trim shortens one that no longer fits; undo brings it back', () => {
      expect(trimClip('a', 'end', -1.6)).toBeNull();
      // a is 0.4 s: room for 0.8 s.
      expect(defined(transitionOf('a')).dur).toBeCloseTo(0.8, 9);
      undoV();
      expect(defined(transitionOf('a')).dur).toBe(1);
    });

    it('deleting the next clip drops it (Magnetic packs c against a: another clip)', () => {
      expect(removeClip('b')).toBe(true);
      expect(transitionOf('a')).toBeUndefined();
      undoV();
      expect(transitionOf('a')).toEqual({ kind: 'dissolve', dur: 1, to: 'b' });
    });

    it('Magnetic off: a delete leaves a gap and drops it; a reorder that keeps the pair together keeps it', () => {
      expect(moveClipTo('c', 0)).toBe(true);
      expect(ids()).toEqual(['c', 'a', 'b']);
      expect(transitionOf('a')).toEqual({ kind: 'dissolve', dur: 1, to: 'b' });
      setMagnetic(false);
      removeClip('b');
      expect(transitionOf('a')).toBeUndefined();
    });

    it('split moves a clip’s outgoing transition to its right part; the one leading in stays on the left', () => {
      setTransition('b', { kind: 'wipe' });
      setPlayhead(3.5);
      selectClip('b');
      expect(splitAtPlayheadWhy()).toBeNull();
      const right = defined(getVideo().clips.find((vClip) => vClip.start === 3.5));
      expect(transitionOf('a')).toEqual({ kind: 'dissolve', dur: 1, to: 'b' });
      expect(transitionOf('b')).toBeUndefined();
      expect(right.transition).toEqual({ kind: 'wipe', dur: 0.5, to: 'c', dir: 'left' });
    });

    it('duplicate: the copy, now before the next clip, keeps the transition at the old cut', () => {
      expect(duplicateClipWhy('a')).toBeNull();
      const copy = getVideo().clips[1];
      expect(transitionOf('a')).toBeUndefined();
      expect(copy.transition).toEqual({ kind: 'dissolve', dur: 1, to: 'b' });
      expect(undos()).toBe(2);
    });
  });

  it('a seeded 1,000-edit property test never leaves a transition off a cut or beyond its room (AC-4)', () => {
    let seed = 2061;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let time = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      time = (time + Math.imul(time ^ (time >>> 7), 61 | time)) ^ time;
      return ((time ^ (time >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
    const fresh = () =>
      loadVideoProject({
        clips: ['a', 'b', 'c', 'd', 'e'].map((id, index) => clip(id, index * 2, 1 + random() * 3)),
        magnetic: random() < 0.7,
      });
    fresh();
    const kinds = ['dissolve', 'dip', 'wipe', 'slide', 'zoom'] as const;
    for (let step = 0; step < 1000; step++) {
      const state = getVideo();
      if (state.clips.length < 2) fresh();
      const id = pick(getVideo().clips).id;
      const edit = pick([
        () => setTransition(id, { kind: pick(kinds), dur: 0.1 + random() * 3.5 }),
        () => setTransition(id, {}),
        () => removeTransition(id),
        () => transitionEveryCut(MAIN_VIDEO, pick(kinds)),
        () => trimClip(id, pick(['start', 'end'] as const), (random() - 0.5) * 2, { ripple: random() < 0.5 }),
        () => removeClip(id),
        () => moveClipTo(id, Math.floor(random() * getVideo().clips.length)),
        () => duplicateClipWhy(id),
        () => {
          setPlayhead(random() * videoLength(getVideo()));
          return splitAtPlayheadWhy();
        },
        () => setMagnetic(!getVideo().magnetic),
        () => (undoV(), null),
      ]);
      edit();
      endVStep();
      const clips = getVideo().clips,
        fps = getVideo().fps;
      for (const vClip of clips) {
        const tr = vClip.transition;
        if (!tr) continue;
        const next = clips.find((other) => other.id === tr.to);
        const where = `step ${step}: ${vClip.id} → ${tr.to}`;
        expect(next, where).toBeDefined();
        expect(defined(next).track, where).toBe(vClip.track);
        expect(Math.abs(vClip.start + clipLength(vClip) - defined(next).start), where).toBeLessThanOrEqual(1e-6);
        expect(tr.dur, where).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(tr.dur, where).toBeLessThanOrEqual(3);
        expect(Math.abs(tr.dur * fps - Math.round(tr.dur * fps)), where).toBeLessThan(1e-6);
        const before = clips.find((other) => other.transition?.to === vClip.id)?.transition?.dur ?? 0;
        expect(before / 2 + tr.dur / 2, where).toBeLessThanOrEqual(clipLength(vClip) + 1e-9);
        expect(tr.dur / 2, where).toBeLessThanOrEqual(clipLength(defined(next)) + 1e-9);
      }
    }
  });
});

describe('207: split gives each part its speed, reverse and part of the ramp (AC-2, D2)', () => {
  const video = (fields: Partial<VClip>): VClip => ({
    ...clip('a', 0, 0),
    kind: 'video',
    srcDur: 10,
    in: 1,
    out: 5,
    ...fields,
  });
  const parts = () => getVideo().clips.filter((vClip) => vClip.track === MAIN_VIDEO);

  it('at 2×: the cut is at the source time showing there, both parts at 2×', () => {
    loadVideoProject({ clips: [video({ speed: 2 }), clip('b', 2, 1)] });
    setPlayhead(0.5);
    expect(splitAtPlayheadWhy()).toBeNull();
    const [left, right, after] = parts();
    expect([left.in, left.out, left.speed, clipLength(left)]).toEqual([1, 2, 2, 0.5]);
    expect([right.start, right.in, right.out, right.speed, clipLength(right)]).toEqual([0.5, 2, 5, 2, 1.5]);
    expect(after.start).toBe(2);
  });

  it('reversed: the left part plays from out back to the cut, the right part on to in', () => {
    loadVideoProject({ clips: [video({ reverse: true })] });
    setPlayhead(1);
    expect(splitAtPlayheadWhy()).toBeNull();
    const [left, right] = parts();
    expect([left.in, left.out, left.reverse, clipLength(left)]).toEqual([4, 5, true, 1]);
    expect([right.start, right.in, right.out, right.reverse, clipLength(right)]).toEqual([1, 1, 4, true, 3]);
  });

  it('ramped: both parts keep the curve over its span, the cut on the source time shown there (D-050)', () => {
    const ramp = [
      { at: 0, v: 1 },
      { at: 0.5, v: 0.5 },
      { at: 1, v: 3 },
    ];
    const whole = video({ ramp });
    loadVideoProject({ clips: [whole] });
    setPlayhead(2);
    expect(splitAtPlayheadWhy()).toBeNull();
    const [left, right] = parts();
    const cut = sourceAt(whole, 2);
    expect(left.out).toBeCloseTo(cut, 9);
    expect(right.in).toBeCloseTo(cut, 9);
    expect([left.in, right.out]).toEqual([1, 5]);
    expect(edgeSpeed(left, 'end')).toBeCloseTo(edgeSpeed(right, 'start'), 9);
    expect(Math.abs(clipLength(left) + clipLength(right) - clipLength(whole))).toBeLessThan(1e-6);
    expect([left.ramp, left.rampSpan, right.ramp, right.rampSpan]).toEqual([ramp, [1, 5], ramp, [1, 5]]);
    for (const local of [0.2, 1, 2.5])
      expect(Math.abs(sourceAt(right, local) - sourceAt(whole, 2 + local))).toBeLessThan(1e-6);
    expect(right.start).toBeCloseTo(2, 9);
  });
});

/* ---------- 207 T070: speed actions in the store (AC-8) ---------- */

describe('207: speed actions, one undo step each, refusals change nothing (AC-8)', () => {
  /**
   * A video clip of a 10 s file on a track.
   * @param id its id
   * @param start its start
   * @param part its source part
   * @param track its track
   * @returns the clip
   */
  const video = (id: string, start: number, part: [number, number], track = MAIN_VIDEO): VClip => ({
    ...clip(id, start, 0, track),
    kind: 'video',
    srcDur: 10,
    in: part[0],
    out: part[1],
    volume: 1,
  });
  const byId = (id: string) => defined(getVideo().clips.find((vClip) => vClip.id === id));
  const done = (outcome: SpeedOutcome) => {
    if ('error' in outcome) throw new Error(`refused: ${outcome.error}`);
    return outcome;
  };
  const load = () => loadVideoProject({ clips: [video('a', 0, [1, 5]), clip('b', 4, 3), video('c', 7, [0, 2])] });
  beforeEach(load);

  it('a speed is one step; a slider drag (one key) is one step however many changes', () => {
    done(setClipSpeed('a', 2));
    expect([byId('a').speed, byId('b').start]).toEqual([2, 2]);
    expect(undos()).toBe(1);
    load();
    for (const speed of [1.5, 1.8, 2.2, 2.5]) done(setClipSpeed('a', speed, 'speed:a'));
    expect(byId('a').speed).toBe(2.5);
    expect(undos()).toBe(1);
  });

  it('reverse on and off are a step each', () => {
    done(setClipReverse('a', true));
    expect(byId('a').reverse).toBe(true);
    done(setClipReverse('a', false));
    expect('reverse' in byId('a')).toBe(false);
    expect(undos()).toBe(2);
  });

  it('a ramp preset is one step; reverse then drops it and says so (Q7)', () => {
    done(setClipRamp('a', 'hero'));
    expect(byId('a').ramp).toEqual(RAMP_PRESETS.hero);
    expect(done(setClipReverse('a', true)).note).toBe(REVERSE_DROPS_RAMP);
    expect('ramp' in byId('a')).toBe(false);
    expect(undos()).toBe(2);
  });

  it('a point drag is one step; adding and removing a point are a step each', () => {
    done(setClipRamp('a', 'hero'));
    endVStep();
    for (const speed of [0.8, 0.6, 0.4]) done(moveRampPoint('a', 2, { at: 0.5, v: speed }, 'ramp:a:2'));
    expect(defined(byId('a').ramp)[2]).toEqual({ at: 0.5, v: 0.4 });
    done(addRampPoint('a', 0.2));
    expect(defined(byId('a').ramp)).toHaveLength(6);
    expect(defined(defined(byId('a').ramp)[1]).at).toBe(0.2);
    done(removeRampPoint('a', 1));
    expect(defined(byId('a').ramp)).toHaveLength(5);
    expect(undos()).toBe(4);
  });

  it('a point stays between its neighbours and within 0.1–10×; the end points keep their places', () => {
    done(setClipRamp('a', 'hero'));
    done(moveRampPoint('a', 2, { at: 0.9, v: 50 }));
    // Hero's neighbours are at 0.35 and 0.65: it stops 0.01 short of the next one.
    expect(defined(defined(byId('a').ramp)[2]).at).toBeCloseTo(0.64, 12);
    expect(defined(defined(byId('a').ramp)[2]).v).toBe(10);
    done(moveRampPoint('a', 0, { at: 0.3, v: 2 }));
    expect(defined(byId('a').ramp)[0]).toEqual({ at: 0, v: 2 });
    done(moveRampPoint('a', 4, { at: 0.2, v: 3 }));
    expect(defined(byId('a').ramp)[4]).toEqual({ at: 1, v: 3 });
  });

  it('point edits keep the ramp over its span (D-050)', () => {
    done(setClipRamp('a', 'hero'));
    setPlayhead(2);
    expect(splitAtPlayheadWhy()).toBeNull();
    const left = byId('a');
    expect(left.rampSpan).toEqual([1, 5]);
    done(moveRampPoint('a', 2, { at: 0.5, v: 0.5 }));
    expect(byId('a').rampSpan).toEqual([1, 5]);
  });

  it('Reset speed is one step back to 1× forwards', () => {
    done(setClipRamp('a', 'bullet'));
    done(setClipReverse('a', true));
    done(setClipSpeed('a', 3));
    done(resetSpeed('a'));
    const reset = byId('a');
    expect(['speed', 'reverse', 'ramp', 'rampSpan'].filter((field) => field in reset)).toEqual([]);
    expect(clipLength(reset)).toBe(4);
    expect(undos()).toBe(4);
  });

  it('Freeze frame is one step and selects the still', () => {
    setPlayhead(1.5);
    done(freezeFrameAtPlayhead());
    const still = defined(getVideo().clips.find((vClip) => vClip.freeze !== undefined));
    expect([still.freeze, still.start, getVideo().selected]).toEqual([2.5, 1.5, still.id]);
    expect(undos()).toBe(1);
  });

  it('a freeze frame splits like a photo: both parts keep the still', () => {
    setPlayhead(1.5);
    done(freezeFrameAtPlayhead());
    const still = defined(getVideo().selected);
    setPlayhead(2.5);
    expect(splitAtPlayheadWhy()).toBeNull();
    const parts = getVideo().clips.filter((vClip) => vClip.freeze !== undefined);
    expect(parts.map((part) => [part.start, part.dur, part.freeze, part.in, part.out])).toEqual([
      [1.5, 1, 2.5, 1, 5],
      [2.5, 1, 2.5, 1, 5],
    ]);
    expect(parts[0]?.id).toBe(still);
  });

  it('refusals leave the state as it was and give the reason', () => {
    loadVideoProject({
      clips: [video('a', 0, [1, 5]), clip('b', 4, 3), video('o', 1, [0, 1], 'V2'), clip('q', 2.2, 1, 'V2')],
      tracks: [
        ...defaultTracks().slice(0, 1),
        { id: 'V2', kind: 'overlay', name: 'V2', hidden: false, muted: false, locked: false },
        ...defaultTracks().slice(1),
      ],
    });
    const before = getVideo().clips;
    const refusals: [SpeedOutcome, RegExp][] = [
      [setClipSpeed('o', 0.5), /1\.2 s of room before the next clip/],
      [setClipSpeed('b', 2), /Only video clips have a speed/],
      [(setPlayhead(5), freezeFrameAtPlayhead()), /video clip/i],
      [removeRampPoint('a', 0), /ramp/i],
    ];
    for (const [outcome, reason] of refusals) expect('error' in outcome && outcome.error).toMatch(reason);
    done(setClipRamp('a', 'hero'));
    endVStep();
    for (let point = 0; point < 5; point++) done(addRampPoint('a', 0.05 + point * 0.02));
    const eleventh = addRampPoint('a', 0.99);
    expect('error' in eleventh && eleventh.error).toMatch(/10 points/);
    expect('error' in removeRampPoint('a', 0)).toBe(true);
    expect('error' in removeRampPoint('a', 9)).toBe(true);
    // Back to the state before the refusals: the ramp and the five points were the only steps.
    for (let step = 0; step < 6; step++) undoV();
    expect(getVideo().clips).toEqual(before);
  });

  it('a locked track refuses every speed action', () => {
    setTrack(MAIN_VIDEO, { locked: true });
    const before = getVideo().clips;
    for (const outcome of [setClipSpeed('a', 2), setClipReverse('a', true), setClipRamp('a', 'hero'), resetSpeed('a')])
      expect('error' in outcome && outcome.error).toMatch(/locked/i);
    expect(getVideo().clips).toBe(before);
  });

  it('a seeded 1,000-edit property test keeps every clip inside its source, its length its speed’s, no overlaps', () => {
    const random = seededRandom(2070);
    const pick = <T>(list: readonly T[]): T => defined(list[Math.floor(random() * list.length)]);
    const fresh = () =>
      loadVideoProject({
        clips: [video('a', 0, [1, 5]), clip('b', 4, 2), video('c', 6, [0, 3]), video('d', 9, [2, 8])],
        magnetic: random() < 0.7,
      });
    fresh();
    let applied = 0;
    const presets = Object.keys(RAMP_PRESETS) as (keyof typeof RAMP_PRESETS)[];
    for (let step = 0; step < 1000; step++) {
      if (getVideo().clips.filter((vClip) => vClip.kind === 'video').length < 2) fresh();
      const id = pick(getVideo().clips).id;
      const before = getVideo().clips;
      const [name, edit] = pick<[string, () => unknown]>([
        ['speed', () => setClipSpeed(id, 0.1 + random() * 4)],
        ['reverse', () => setClipReverse(id, random() < 0.5)],
        ['preset', () => setClipRamp(id, pick(presets))],
        ['move point', () => moveRampPoint(id, Math.floor(random() * 4), { at: random(), v: 0.1 + random() * 5 })],
        ['add point', () => addRampPoint(id, random())],
        ['remove point', () => removeRampPoint(id, Math.floor(random() * 4))],
        ['reset', () => resetSpeed(id)],
        [
          'freeze',
          () => {
            setPlayhead(random() * videoLength(getVideo()));
            return freezeFrameAtPlayhead();
          },
        ],
        ['trim', () => trimClip(id, pick(['start', 'end'] as const), (random() - 0.5) * 2, { ripple: random() < 0.5 })],
        [
          'split',
          () => {
            setPlayhead(random() * videoLength(getVideo()));
            return splitAtPlayheadWhy();
          },
        ],
        ['move', () => moveClipTo(id, Math.floor(random() * getVideo().clips.length))],
        ['undo', () => (undoV(), null)],
      ]);
      edit();
      endVStep();
      if (getVideo().clips !== before) applied++;
      const where = `step ${step} (${name} ${id})`;
      const tracks = new Map<string, VClip[]>();
      for (const vClip of getVideo().clips) {
        tracks.set(vClip.track, [...(tracks.get(vClip.track) ?? []), vClip]);
        if (vClip.kind !== 'video') continue;
        const length = clipLength(vClip);
        expect(length, where).toBeCloseTo(Math.max(0.1, playLength(vClip)), 12);
        expect(vClip.in, where).toBeGreaterThanOrEqual(0);
        expect(vClip.out, where).toBeLessThanOrEqual(vClip.srcDur + 1e-9);
        expect(vClip.in, where).toBeLessThan(vClip.out);
        if (vClip.freeze !== undefined) {
          expect(vClip.freeze, where).toBeGreaterThanOrEqual(0);
          expect(vClip.freeze, where).toBeLessThanOrEqual(vClip.srcDur);
          expect(
            ['speed', 'reverse', 'ramp'].filter((field) => field in vClip),
            where,
          ).toEqual([]);
          continue;
        }
        if (vClip.speed !== undefined) expect(vClip.speed >= 0.1 && vClip.speed <= 10, where).toBe(true);
        if (vClip.ramp) {
          expect(vClip.reverse, where).toBeUndefined();
          expect(vClip.ramp.length >= 2 && vClip.ramp.length <= 10, where).toBe(true);
          expect([vClip.ramp.at(0)?.at, vClip.ramp.at(-1)?.at], where).toEqual([0, 1]);
        }
        for (const share of [0, 0.25, 0.5, 0.75, 1]) {
          const source = sourceAt(vClip, share * length);
          expect(source, `${where} ${vClip.id}`).toBeGreaterThanOrEqual(vClip.in - 1e-6);
          expect(source, `${where} ${vClip.id}`).toBeLessThanOrEqual(vClip.out + 1e-6);
        }
      }
      for (const [track, onTrack] of tracks) {
        const ordered = [...onTrack].sort((left, right) => left.start - right.start);
        for (let index = 1; index < ordered.length; index++) {
          const previous = defined(ordered[index - 1]);
          expect(defined(ordered[index]).start, `${where} ${track}`).toBeGreaterThanOrEqual(
            previous.start + clipLength(previous) - 1e-6,
          );
        }
      }
    }
    expect(applied).toBeGreaterThan(300);
  });
});

/* ---------- 208 T071: sound and audio track actions, each one undo step (AC-10) ---------- */

describe('208: sound clip and audio track actions as undo steps (AC-10)', () => {
  const sound = (id: string, track: string, start: number, length: number): VSound => ({
    id,
    track,
    start,
    in: 0,
    out: length,
    volume: 1,
    toEnd: false,
    srcDur: 30,
    file: new Blob(),
    url: `blob:${id}`,
  });
  const voice: Track = {
    id: 'A2',
    kind: 'audio',
    name: 'Voice',
    hidden: false,
    muted: false,
    locked: false,
    role: 'voice',
  };
  beforeEach(() =>
    loadVideoProject({
      clips: [clip('a', 0, 10)],
      tracks: [...defaultTracks(), voice],
      sounds: [sound('s1', MUSIC, 0, 4), sound('s2', 'A2', 1, 2)],
      loudness: -14,
    }),
  );
  const soundOf = (id: string) => defined(getVideo().sounds.find((candidate) => candidate.id === id));
  const trackOf = (id: string) => defined(getVideo().tracks.find((candidate) => candidate.id === id));

  it('move, trim, split, duplicate and delete: one step each', () => {
    expect(moveSoundTo('s1', 5)).toBeNull();
    endVStep();
    expect(trimSoundEdge('s1', 'end', -1)).toBeNull();
    endVStep();
    setPlayhead(6);
    expect(splitSoundAt('s1')).toBeNull();
    expect(duplicateSoundClip('s2')).toBeNull();
    expect(removeSound('s2')).toBeNull();
    expect(
      getVideo()
        .sounds.filter((candidate) => candidate.track === MUSIC)
        .map(({ start, out }) => [start, out]),
    ).toEqual([
      [5, 1],
      [6, 3],
    ]);
    expect(undos()).toBe(5);
    expect(getVideo().sounds.map((candidate) => candidate.id)).toEqual(['s1', 's2']);
  });

  it('a drag is one step: moving, a volume slider, fades, a track volume, ducking, the loudness', () => {
    for (const start of [1, 2, 3, 4]) moveSoundTo('s2', start);
    endVStep();
    for (const volume of [0.5, 1.2, 1.8]) setSoundVolume('s2', volume);
    endVStep();
    for (const fadeIn of [0.1, 0.2, 0.3]) setSoundFades('s2', { fadeIn });
    endVStep();
    for (const volume of [0.4, 0.6]) setTrackVolume(MUSIC, volume);
    endVStep();
    for (const amount of [6, 9, 18]) setDucking(MUSIC, { amount, threshold: -40 });
    endVStep();
    for (const lufs of [-15, -16, -20]) setLoudness(lufs);
    expect(soundOf('s2')).toMatchObject({ start: 4, volume: 1.8, fadeIn: 0.3 });
    expect(trackOf(MUSIC)).toMatchObject({ volume: 0.6, duck: { amount: 18, threshold: -40 } });
    expect(getVideo().loudness).toBe(-20);
    // Ducking turned on is a step of its own; its amount dragged after it, another.
    expect(undos()).toBe(7);
    expect(getVideo().loudness).toBe(-14);
    expect(trackOf(MUSIC).duck).toBeUndefined();
  });

  it('fades are 0–10 s each and together no longer than the clip: refused with the reason, no step', () => {
    expect(setSoundFades('s2', { fadeIn: 1.5, fadeOut: 1 })).toMatch(/fade/i);
    expect(getVideo().canUndo).toBe(false);
  });

  it('audio tracks: add, rename, reorder, mute, solo, lock, delete (with its sounds): one step each', () => {
    expect(addSoundTrack()).toBeNull();
    expect(renameTrack('A3', 'Whooshes')).toBeNull();
    expect(moveTrack('A3', -1)).toBeNull();
    setTrack('A2', { muted: true });
    setTrack('A2', { solo: true });
    setTrack('A2', { locked: true });
    setTrack('A2', { locked: false });
    expect(
      getVideo()
        .tracks.filter((track) => track.kind === 'audio')
        .map((track) => track.id),
    ).toEqual([MUSIC, 'A3', 'A2']);
    expect(trackOf('A2')).toMatchObject({ muted: true, solo: true, locked: false });
    expect(deleteTrack('A2')).toBeNull();
    expect(getVideo().sounds.map((candidate) => candidate.id)).toEqual(['s1']);
    expect(undos()).toBe(8);
    expect(getVideo().sounds).toHaveLength(2);
  });

  it('role, Counts as voice, ducking off: one step each; a Voice track can’t duck', () => {
    expect(setTrackRole(MUSIC, 'effects')).toBeNull();
    expect(setCountsAsVoice('A2', false)).toBeNull();
    expect(setDucking(MUSIC, { amount: 12, threshold: -40 })).toBeNull();
    expect(setDucking(MUSIC, null)).toBeNull();
    expect(setDucking('A2', { amount: 12, threshold: -40 })).toMatch(/Voice/);
    expect(trackOf(MUSIC).role).toBe('effects');
    expect(trackOf('A2').voice).toBe(false);
    expect(undos()).toBe(4);
  });

  it('Lower music under voice: ducking on for every Music track at the defaults, in one step; off again', () => {
    expect(addSoundTrack()).toBeNull();
    setTrackRole('A3', 'music');
    endVStep();
    expect(lowerMusicUnderVoice()).toBe(false);
    setLowerMusicUnderVoice(true);
    expect(trackOf(MUSIC).duck).toEqual(DUCK_DEFAULTS);
    expect(trackOf('A3').duck).toEqual(DUCK_DEFAULTS);
    expect(trackOf('A2').duck).toBeUndefined();
    expect(lowerMusicUnderVoice()).toBe(true);
    setLowerMusicUnderVoice(false);
    expect(lowerMusicUnderVoice()).toBe(false);
    expect(undos()).toBe(4);
  });

  it('the loudness: Off or −24…−9 LUFS (clamped)', () => {
    setLoudness('off');
    expect(getVideo().loudness).toBe('off');
    endVStep();
    setLoudness(-40);
    expect(getVideo().loudness).toBe(-24);
    endVStep();
    setLoudness(0);
    expect(getVideo().loudness).toBe(-9);
    expect(undos()).toBe(3);
  });

  it('a locked sound track refuses its clips’ edits and adds no step', () => {
    loadVideoProject({
      clips: [clip('a', 0, 10)],
      tracks: [...defaultTracks(), { ...voice, locked: true }],
      sounds: [sound('s2', 'A2', 1, 2)],
    });
    for (const why of [
      moveSoundTo('s2', 3),
      trimSoundEdge('s2', 'start', 0.5),
      setSoundVolume('s2', 0.5),
      setSoundFades('s2', { fadeIn: 0.5 }),
      duplicateSoundClip('s2'),
      removeSound('s2'),
    ])
      expect(why).toMatch(/locked/);
    expect(undos()).toBe(0);
  });
});

/* ---------- 208 T072: a seeded property test over sound, track, ducking and picture edits (AC-10) ---------- */

describe('208: 1,000 random sound and track edits keep the sound model whole (AC-10)', () => {
  // A "Play to the end of the video" clip plays to the video's end or the next sound on its track, whichever is first
  // (T072, option A), so lengthening the video never runs it into that sound.
  it('no overlap on a track, no clip outside its file, no fade longer than its clip, at most 8 sound tracks', () => {
    const random = seededRandom(2080);
    const pick = <T>(list: readonly T[]): T => defined(list[Math.floor(random() * list.length)]);
    const sound = (id: string, track: string, start: number, length: number, srcDur = 20): VSound => ({
      id,
      track,
      start,
      in: 0,
      out: length,
      volume: 1,
      toEnd: false,
      srcDur,
      file: new Blob(),
      url: `blob:${id}`,
    });
    const fresh = () =>
      loadVideoProject({
        clips: [clip('a', 0, 12)],
        tracks: [
          ...defaultTracks(),
          { id: 'A2', kind: 'audio', name: 'Voice', hidden: false, muted: false, locked: false, role: 'voice' },
        ],
        sounds: [
          { ...sound('song', MUSIC, 0, 0, 90), toEnd: true, out: undefined },
          sound('v1', 'A2', 1, 3),
          sound('v2', 'A2', 6, 2),
          sound('fx', MUSIC, 14, 1),
        ],
        loudness: -14,
      });
    fresh();
    let applied = 0;
    for (let step = 0; step < 1000; step++) {
      if (getVideo().sounds.length < 2) fresh();
      const ids = getVideo().sounds.map((candidate) => candidate.id);
      const id = pick(ids);
      const soundTracks = () =>
        getVideo()
          .tracks.filter((track) => track.kind === 'audio')
          .map((track) => track.id);
      const before = getVideo();
      const [name, edit] = pick<[string, () => unknown]>([
        ['move', () => moveSoundTo(id, random() * 15, random() < 0.3 ? pick(soundTracks()) : undefined)],
        ['trim', () => trimSoundEdge(id, pick(['start', 'end'] as const), (random() - 0.5) * 4)],
        [
          'split',
          () => {
            setPlayhead(random() * 15);
            return splitSoundAt(id);
          },
        ],
        ['duplicate', () => duplicateSoundClip(id)],
        ['delete', () => removeSound(id)],
        ['volume', () => setSoundVolume(id, random() * 2.5)],
        ['fades', () => setSoundFades(id, { fadeIn: random() * 12, fadeOut: random() * 12 })],
        ['slip', () => setSoundIn(id, random() * 25)],
        ['add track', () => addSoundTrack()],
        ['delete track', () => deleteTrack(pick(soundTracks()))],
        ['role', () => setTrackRole(pick(soundTracks()), pick(['music', 'voice', 'effects'] as const))],
        ['track volume', () => setTrackVolume(pick(soundTracks()), random() * 2.5)],
        [
          'ducking',
          () =>
            setDucking(
              pick(soundTracks()),
              random() < 0.3 ? null : { amount: random() * 40, threshold: -80 + random() * 70 },
            ),
        ],
        ['lower music', () => setLowerMusicUnderVoice(random() < 0.5)],
        ['loudness', () => setLoudness(random() < 0.2 ? 'off' : -30 + random() * 25)],
        ['picture trim', () => trimClip('a', 'end', (random() - 0.6) * 6)],
        ['undo', () => (undoV(), null)],
      ]);
      edit();
      endVStep();
      if (getVideo() !== before) applied++;
      const where = `step ${step} (${name} ${id})`;
      const { sounds, tracks, loudness } = getVideo();
      const videoEnd = videoLength(getVideo());
      const audioTracks = tracks.filter((track) => track.kind === 'audio');
      expect(audioTracks.length, where).toBeGreaterThanOrEqual(1);
      expect(audioTracks.length, where).toBeLessThanOrEqual(8);
      expect(loudness === 'off' || (loudness >= -24 && loudness <= -9), where).toBe(true);
      for (const track of audioTracks) {
        expect(track.volume ?? 1, where).toBeLessThanOrEqual(2);
        if (track.duck) expect(track.role, where).not.toBe('voice');
        const onTrack = sounds
          .filter((candidate) => candidate.track === track.id)
          .sort((first, second) => first.start - second.start);
        for (let index = 1; index < onTrack.length; index++) {
          const previous = defined(onTrack[index - 1]);
          expect(previous.start + soundLength(previous, videoEnd, sounds), where).toBeLessThanOrEqual(
            defined(onTrack[index]).start + 1e-9,
          );
        }
      }
      for (const current of sounds) {
        expect(
          audioTracks.some((track) => track.id === current.track),
          where,
        ).toBe(true);
        expect(current.in, where).toBeGreaterThanOrEqual(0);
        expect(current.volume, where).toBeLessThanOrEqual(2);
        if (current.toEnd) expect(current.in, where).toBeLessThan(current.srcDur);
        else {
          expect(current.in, where).toBeLessThan(defined(current.out));
          expect(defined(current.out), where).toBeLessThanOrEqual(current.srcDur + 1e-9);
        }
        const fadeIn = current.fadeIn ?? 0;
        const fadeOut = current.fadeOut ?? 0;
        expect(Math.max(fadeIn, fadeOut), where).toBeLessThanOrEqual(10);
        if (!current.toEnd)
          expect(fadeIn + fadeOut, where).toBeLessThanOrEqual(soundLength(current, videoEnd, sounds) + 1e-9);
      }
    }
    expect(applied).toBeGreaterThan(400);
  });
});

/* ---------- 208 T073: the background loudness measurement (AC-9) ---------- */

describe('208: the loudness measured in the background (AC-9)', () => {
  const sound: VSound = {
    id: 's',
    track: MUSIC,
    start: 0,
    in: 0,
    out: 4,
    volume: 1,
    toEnd: false,
    srcDur: 30,
    file: new Blob(),
    url: 'blob:s',
  };
  /** The measurements asked for: the job, the measurement handed in to reuse, and the abort signal. */
  let asked: {
    job: Parameters<typeof measureIO.measure>[0];
    previous: MixMeasure | null;
    signal: AbortSignal;
    done: (measure: MixMeasure) => void;
  }[] = [];
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    asked = [];
    vi.spyOn(measureIO, 'measure').mockImplementation(
      (job, previous, signal) =>
        new Promise<MixMeasure | null>((resolve) => {
          asked.push({ job, previous, signal, done: resolve });
        }),
    );
    loadVideoProject({ clips: [clip('a', 0, 6)], sounds: [sound], loudness: -14 });
    stop = watchLoudness();
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const measured = (job: Parameters<typeof measureIO.measure>[0], gain: number): MixMeasure => ({
    key: mixKey(job),
    lufs: -14 - gain,
    peak: -6,
    gain,
    reduction: 0,
  });

  it('measures 500 ms after the last sound edit, once for a run of edits', async () => {
    setSoundVolume('s', 0.5);
    await vi.advanceTimersByTimeAsync(300);
    setSoundVolume('s', 0.6);
    await vi.advanceTimersByTimeAsync(499);
    expect(asked).toHaveLength(0);
    expect(getVideo().measuring).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(asked).toHaveLength(1);
    const job = defined(asked[0]).job;
    expect(job.audio.map((clipped) => clipped.volume)).toEqual([0.6]);
    expect(job.loudness).toBe(-14);
    defined(asked[0]).done(measured(job, 4.4));
    await vi.advanceTimersByTimeAsync(0);
    expect(getVideo()).toMatchObject({ measuring: false, measure: { gain: 4.4 } });
  });

  it('an edit while measuring cancels it and measures again; the last measurement is handed in to reuse', async () => {
    setSoundVolume('s', 0.5);
    await vi.advanceTimersByTimeAsync(500);
    defined(asked[0]).done(measured(defined(asked[0]).job, 2));
    await vi.advanceTimersByTimeAsync(0);
    setSoundVolume('s', 0.7);
    await vi.advanceTimersByTimeAsync(500);
    expect(asked).toHaveLength(2);
    expect(defined(asked[1]).previous?.gain).toBe(2);
    endVStep();
    setSoundVolume('s', 0.8);
    expect(defined(asked[1]).signal.aborted).toBe(true);
    // The cancelled one finishing late changes nothing.
    defined(asked[1]).done(measured(defined(asked[1]).job, 99));
    await vi.advanceTimersByTimeAsync(500);
    expect(asked).toHaveLength(3);
    expect(getVideo().measure?.gain).toBe(2);
  });

  it('measures once at the start; a view change (the playhead, a selection) doesn’t measure; Off doesn’t', async () => {
    await vi.advanceTimersByTimeAsync(500);
    expect(asked).toHaveLength(1);
    setPlayhead(2);
    selectClip(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toHaveLength(1);
    setLoudness('off');
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toHaveLength(1);
    expect(defined(asked[0]).signal.aborted).toBe(true);
    expect(getVideo().measuring).toBe(false);
  });

  it('the preview’s master gain is the export’s: the stored measurement, reused by the export for the same mix', async () => {
    expect(masterGainDb(getVideo())).toBe(0);
    setSoundVolume('s', 0.5);
    await vi.advanceTimersByTimeAsync(500);
    defined(asked[0]).done(measured(defined(asked[0]).job, 5.5));
    await vi.advanceTimersByTimeAsync(0);
    expect(masterGainDb(getVideo())).toBe(5.5);
    const job = { ...soundJob(getVideo()), measured: defined(getVideo().measure) };
    expect(defined(await planLoudness([], job, 6)).gain).toBe(masterGainDb(getVideo()));
    setLoudness('off');
    expect(masterGainDb(getVideo())).toBe(0);
  });
});

describe('408: the export is refused while files are missing (D4)', () => {
  const goneClip = missingMedia({ id: 'm1', name: 'beach.mp4', size: 10, type: 'video/mp4' });
  const goneVoice = missingMedia({ id: 'm2', name: 'voice.wav', size: 10, type: 'audio/wav' });

  it('lists the missing clips and sounds, once each, before anything starts', async () => {
    const voice: VSound = {
      id: 's1',
      track: MUSIC,
      start: 0,
      in: 0,
      out: 2,
      volume: 1,
      toEnd: false,
      srcDur: 2,
      file: goneVoice,
      url: '',
    };
    loadVideoProject({
      clips: [{ ...clip('a', 0, 2), file: goneClip }, clip('b', 2, 2), { ...clip('c', 4, 2), file: goneClip }],
      sounds: [voice],
    });
    await expect(exportVideo()).rejects.toThrow('Find the missing files first: beach.mp4, voice.wav.');
    expect(getVideo().progress).toBeNull();
  });
});

describe('a sound file’s length (208, 209 Q7)', () => {
  const file = new File(['take'], 'Voice 3.webm', { type: 'video/webm' });
  afterEach(() => vi.restoreAllMocks());

  it('is the <audio> element’s duration when it has one', async () => {
    vi.spyOn(soundIO, 'element').mockResolvedValue(12.5);
    const packets = vi.spyOn(soundIO, 'packets');
    expect(await soundIO.length(file, 'blob:take')).toBe(12.5);
    expect(packets).not.toHaveBeenCalled();
  });

  it('is measured from the packets when the element has none (a MediaRecorder WebM)', async () => {
    vi.spyOn(soundIO, 'element').mockRejectedValue(new Error('no duration'));
    vi.spyOn(soundIO, 'packets').mockResolvedValue(8.6);
    expect(await soundIO.length(file, 'blob:take')).toBe(8.6);
  });

  it('rejects a file neither can read', async () => {
    vi.spyOn(soundIO, 'element').mockRejectedValue(new Error('no duration'));
    vi.spyOn(soundIO, 'packets').mockRejectedValue(new Error('unreadable'));
    await expect(soundIO.length(file, 'blob:take')).rejects.toThrow('unreadable');
  });

  it('doesn’t try the packets for a file the element can’t play', async () => {
    vi.spyOn(soundIO, 'element').mockRejectedValue(new Error('unplayable'));
    const packets = vi.spyOn(soundIO, 'packets').mockResolvedValue(1);
    await expect(soundIO.length(file, 'blob:take')).rejects.toThrow('unplayable');
    expect(packets).not.toHaveBeenCalled();
  });
});
