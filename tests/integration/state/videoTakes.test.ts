import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { MAIN_VIDEO, MUSIC } from '@/engine/tracks';
import { addTake, soundIO, type TakeToPlace } from '@/state/videoSound';
import { getVideo, loadVideoProject, poolOf, undoV, type PoolItem, type VClip, type VSound } from '@/state/videoStore';
import { renameTake, takesOf } from '@/state/videoTakes';
import { defined } from '../../support/defined';

/*
 * 505: voice takes in the video store — their details (when, which microphone) and the Recordings list.
 */

/** A photo on the main track, so the project has a length to record over. */
const photo: VClip = {
  id: 'a',
  kind: 'photo',
  track: MAIN_VIDEO,
  start: 0,
  name: 'a.jpg',
  file: new Blob(['a']),
  url: 'blob:a',
  w: 10,
  h: 10,
  srcDur: 0,
  dur: 10,
  in: 0,
  out: 0,
  edit: { ...DEFAULT_EDIT },
  motion: 'none',
  fade: false,
  volume: 0,
  thumb: 'thumb:a',
  strip: [],
  still: null,
};

/**
 * A take to place on the Music track.
 * @param name its name (and file name)
 * @param details what else to set on it
 * @returns the take
 */
const take = (name: string, details: Partial<TakeToPlace> = {}): TakeToPlace => ({
  file: new File(['t'], `${name}.webm`, { type: 'audio/webm' }),
  name,
  track: MUSIC,
  tracks: getVideo().tracks,
  start: 0,
  length: 1,
  ...details,
});

beforeEach(() => {
  vi.spyOn(soundIO, 'length').mockResolvedValue(1);
  vi.stubGlobal('URL', { ...URL, createObjectURL: (file: File) => `blob:${file.name}`, revokeObjectURL: () => undefined });
  loadVideoProject({ clips: [photo] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('take details (AC-1, §1)', () => {
  it('a placed take carries when and with which microphone it was recorded onto its clip and pool item', () => {
    const recordedAt = Date.UTC(2026, 9, 20, 14, 2);
    expect(addTake(take('Voice 1', { recordedAt, microphone: 'MacBook Microphone' }))).not.toHaveProperty('error');
    expect(getVideo().sounds[0]).toMatchObject({ recorded: true, recordedAt, microphone: 'MacBook Microphone' });
    expect(poolOf(getVideo()).at(-1)).toMatchObject({ name: 'Voice 1', recorded: true, recordedAt, microphone: 'MacBook Microphone' });
  });

  it('a take without details has none', () => {
    addTake(take('Voice 1'));
    expect(getVideo().sounds[0]).not.toHaveProperty('recordedAt');
    expect(poolOf(getVideo()).at(-1)).not.toHaveProperty('microphone');
  });
});

/**
 * A take's sound clip on the Music track.
 * @param id its id
 * @param url its file's URL
 * @param start where it starts
 * @param details its take details (none: an imported sound)
 * @returns the sound clip
 */
const takeClip = (id: string, url: string, start: number, details: Partial<VSound> = { recorded: true }): VSound => ({
  id,
  track: MUSIC,
  start,
  in: 0,
  out: 1,
  volume: 1,
  toEnd: false,
  srcDur: 1,
  name: id,
  file: new Blob([id]),
  url,
  ...details,
});

/**
 * A take only in the pool.
 * @param url its URL
 * @param name its name
 * @param recordedAt when it was recorded
 * @returns the pool item
 */
const pooled = (url: string, name: string, recordedAt?: number): PoolItem => ({
  url,
  kind: 'audio',
  name,
  file: new Blob([name]),
  w: 0,
  h: 0,
  srcDur: 2,
  thumb: '',
  strip: [],
  recorded: true,
  ...(recordedAt === undefined ? {} : { recordedAt }),
});

describe('the takes in the store (AC-1, §2)', () => {
  beforeEach(() => {
    loadVideoProject({
      clips: [photo],
      sounds: [
        takeClip('late', 'blob:t2', 6, { recorded: true, recordedAt: 200 }),
        takeClip('song', 'blob:song', 0, {}),
        takeClip('early', 'blob:t2', 3, { recorded: true, recordedAt: 200 }),
        takeClip('first', 'blob:t1', 1, { recorded: true, recordedAt: 100 }),
      ],
      pool: [pooled('blob:u2', 'Voice 9'), pooled('blob:u1', 'Voice 10'), pooled('blob:new', 'Voice 4', 300)],
    });
  });

  it('lists only recorded files, newest first, the undated last by name', () => {
    expect(takesOf(getVideo()).map((row) => row.key)).toEqual(['blob:new', 'blob:t2', 'blob:t1', 'blob:u2', 'blob:u1']);
  });

  it('gives each take its uses and where the first of them sits on the timeline', () => {
    const rows = takesOf(getVideo());
    const used = defined(rows.find((row) => row.key === 'blob:t2'));
    expect(used.uses.map((use) => use.id)).toEqual(['late', 'early']);
    expect(used.place).toEqual({ sound: 'early', trackId: MUSIC, track: 'Music', start: 3 });
    expect(rows.find((row) => row.key === 'blob:new')?.place).toBeNull();
  });

  it('is a selector: the same rows until the project changes', () => {
    expect(takesOf(getVideo())).toBe(takesOf(getVideo()));
  });

  it('renames a take’s pool item and every clip of it in one undo step, trimmed', () => {
    loadVideoProject({ clips: [photo], sounds: [takeClip('a1', 'blob:t', 0), takeClip('a2', 'blob:t', 4)], pool: [pooled('blob:t', 'Voice 1')] });
    expect(renameTake('blob:t', '  Intro  ')).toBeNull();
    expect(getVideo().sounds.map((sound) => sound.name)).toEqual(['Intro', 'Intro']);
    expect(getVideo().pool.map((item) => item.name)).toEqual(['Intro']);
    undoV();
    expect(getVideo().sounds.map((sound) => sound.name)).toEqual(['a1', 'a2']);
    expect(getVideo().pool.map((item) => item.name)).toEqual(['Voice 1']);
  });

  it('refuses an empty name, with the reason, and changes nothing', () => {
    const before = getVideo();
    expect(renameTake('blob:t1', '   ')).toBe('Give the recording a name.');
    expect(getVideo()).toBe(before);
  });
});
