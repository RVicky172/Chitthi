import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { missingMedia } from '@/engine/mediaFile';
import { MAIN_VIDEO, MUSIC, soundRole } from '@/engine/tracks';
import { addMedia, mediaIO } from '@/state/videoMedia';
import { addFromPool, importToPool, removeFromPool } from '@/state/videoPool';
import { addTake, soundIO } from '@/state/videoSound';
import {
  getVideo,
  loadVideoProject,
  poolKey,
  poolOf,
  setPlayhead,
  undoV,
  usesOf,
  type PoolItem,
  type VClip,
  type VSound,
} from '@/state/videoStore';

/*
 * 504: the media pool in the video store. Files are read through mediaIO stand-ins (Node decodes no media); each
 * file gets its own URL, the pool's key.
 */

/**
 * A picture clip as the store holds it.
 * @param id the clip's id
 * @param url its file's URL
 * @param start where it starts
 * @param kind photo or video
 * @returns the clip
 */
const clip = (id: string, url: string, start = 0, kind: VClip['kind'] = 'photo'): VClip => ({
  id,
  kind,
  track: MAIN_VIDEO,
  start,
  name: `${id}.jpg`,
  file: new Blob([id]),
  url,
  w: 10,
  h: 10,
  srcDur: kind === 'video' ? 4 : 0,
  dur: kind === 'video' ? 0 : 2,
  in: 0,
  out: kind === 'video' ? 4 : 0,
  edit: { ...DEFAULT_EDIT },
  motion: 'none',
  fade: false,
  volume: kind === 'video' ? 1 : 0,
  thumb: `thumb:${id}`,
  strip: [],
  still: null,
});

/**
 * A sound clip on the Music track.
 * @param id its id
 * @param url its file's URL
 * @returns the sound clip
 */
const sound = (id: string, url: string): VSound => ({
  id,
  track: MUSIC,
  start: 0,
  in: 0,
  volume: 1,
  toEnd: false,
  srcDur: 5,
  name: `${id}.mp3`,
  file: new Blob([id]),
  url,
});

/**
 * A pool item.
 * @param url its URL
 * @param kind what it is
 * @returns the item
 */
const item = (url: string, kind: PoolItem['kind'] = 'photo'): PoolItem => ({
  url,
  kind,
  name: url,
  file: new Blob([url]),
  w: 10,
  h: 10,
  srcDur: 0,
  thumb: '',
  strip: [],
});

/**
 * Undoes every step.
 * @returns how many there were
 */
function undoAll(): number {
  let steps = 0;
  while (getVideo().canUndo) {
    undoV();
    steps++;
  }
  return steps;
}

/**
 * A picture file to import.
 * @param name its name (.mp4 for a video)
 * @returns the file
 */
function picture(name: string): File {
  const types: Record<string, string> = { mp4: 'video/mp4', gif: 'image/gif' };
  return new File(['x'], name, { type: types[name.split('.').at(-1) ?? ''] ?? 'image/jpeg' });
}

describe('the pool the user sees (AC-1)', () => {
  it('is the imported files, then each file a clip or sound clip uses, once', () => {
    loadVideoProject({
      clips: [clip('a', 'blob:a'), clip('b', 'blob:a', 2), clip('c', 'blob:c', 4, 'video')],
      sounds: [sound('s', 'blob:s')],
      pool: [item('blob:p'), item('blob:c', 'video')],
    });
    expect(poolOf(getVideo()).map((entry) => [entry.url, entry.kind])).toEqual([
      ['blob:p', 'photo'],
      ['blob:c', 'video'],
      ['blob:a', 'photo'],
      ['blob:s', 'audio'],
    ]);
  });

  it('takes what a used file shows from its clip', () => {
    loadVideoProject({ clips: [clip('c', 'blob:c', 0, 'video')], sounds: [sound('s', 'blob:s')] });
    const [video, music] = poolOf(getVideo());
    expect(video).toMatchObject({ kind: 'video', name: 'c.jpg', thumb: 'thumb:c', srcDur: 4, w: 10 });
    expect(music).toMatchObject({ kind: 'audio', name: 's.mp3', srcDur: 5, thumb: '' });
  });

  it('keeps two missing files (which have no URL) apart, by their media ids', () => {
    const lost = (id: string): PoolItem => ({ ...item(''), name: id, file: missingMedia({ id, name: id, size: 1, type: 'video/mp4' }) });
    loadVideoProject({ clips: [{ ...clip('a', ''), file: lost('m1').file }], pool: [lost('m1'), lost('m2')] });
    expect(poolOf(getVideo()).map(poolKey)).toEqual(['missing:m1', 'missing:m2']);
    expect(usesOf(getVideo(), 'missing:m1').map((use) => use.id)).toEqual(['a']);
    removeFromPool('missing:m2');
    expect(poolOf(getVideo()).map(poolKey)).toEqual(['missing:m1']);
  });

  it('starts empty, and a project loaded without one has none', () => {
    loadVideoProject({ clips: [], pool: [item('blob:p')] });
    expect(getVideo().pool).toHaveLength(1);
    loadVideoProject({ clips: [] });
    expect(getVideo().pool).toEqual([]);
  });
});

describe('importing into the pool (AC-1, D2)', () => {
  beforeEach(() => {
    vi.spyOn(mediaIO, 'photo').mockImplementation((name) => Promise.resolve({ ...clip(name, `blob:${name}`), name }));
    vi.spyOn(mediaIO, 'video').mockImplementation((name) => Promise.resolve({ ...clip(name, `blob:${name}`, 0, 'video'), name }));
    vi.spyOn(mediaIO, 'strip').mockResolvedValue(undefined);
    loadVideoProject({ clips: [clip('a', 'blob:a')] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('adds the files to the pool and none to the timeline, as one undo step', async () => {
    expect(await importToPool([picture('p.jpg'), picture('q.mp4')])).toEqual([]);
    expect(getVideo().clips.map((entry) => entry.id)).toEqual(['a']);
    expect(getVideo().pool.map((entry) => [entry.url, entry.kind, entry.name])).toEqual([
      ['blob:p.jpg', 'photo', 'p.jpg'],
      ['blob:q.mp4', 'video', 'q.mp4'],
    ]);
    expect(undoAll()).toBe(1);
    expect(getVideo().pool).toEqual([]);
  });

  it('keeps no preview copy of a photo', async () => {
    vi.spyOn(mediaIO, 'photo').mockImplementation((name) =>
      Promise.resolve({ ...clip(name, `blob:${name}`), name, still: {} as HTMLCanvasElement }),
    );
    await importToPool([picture('p.jpg')]);
    expect(getVideo().pool[0]).not.toHaveProperty('still');
  });

  it('says why a file is left out, and records no step when nothing is added', async () => {
    const messages = await importToPool([picture('x.gif')]);
    expect(messages).toHaveLength(1);
    expect(getVideo().pool).toEqual([]);
    expect(getVideo().canUndo).toBe(false);
  });

  it('the timeline’s drop and the stage’s button still place the files, which the pool then shows', async () => {
    expect(await addMedia([{ name: 'p.jpg', blob: picture('p.jpg') }])).toEqual([]);
    expect(getVideo().clips.map((entry) => entry.name)).toEqual(['a.jpg', 'p.jpg']);
    expect(getVideo().pool).toEqual([]);
    expect(poolOf(getVideo()).map((entry) => entry.url)).toEqual(['blob:a', 'blob:p.jpg']);
  });
});

describe('importing sound, and recordings (AC-1, D3)', () => {
  beforeEach(() => {
    vi.spyOn(mediaIO, 'photo').mockImplementation((name) => Promise.resolve({ ...clip(name, `blob:${name}`), name }));
    vi.spyOn(soundIO, 'length').mockImplementation((file) =>
      file instanceof File && file.name.startsWith('bad') ? Promise.reject(new Error('unplayable')) : Promise.resolve(7),
    );
    vi.stubGlobal('URL', { ...URL, createObjectURL: (file: File) => `blob:${file.name}`, revokeObjectURL: () => undefined });
    loadVideoProject({ clips: [clip('a', 'blob:a')] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('puts sound files in the pool and no sound clip on the timeline; pictures and sound are one undo step', async () => {
    expect(await importToPool([new File(['s'], 'song.mp3', { type: 'audio/mpeg' }), picture('p.jpg')])).toEqual([]);
    expect(getVideo().sounds).toEqual([]);
    expect(getVideo().pool.map((entry) => [entry.url, entry.kind, entry.srcDur])).toEqual([
      ['blob:song.mp3', 'audio', 7],
      ['blob:p.jpg', 'photo', 0],
    ]);
    expect(undoAll()).toBe(1);
  });

  it('takes a sound file known by its name alone, and says why one can’t be played', async () => {
    const messages = await importToPool([new File(['s'], 'voice.m4a'), new File(['s'], 'bad.wav', { type: 'audio/wav' })]);
    expect(getVideo().pool.map((entry) => entry.url)).toEqual(['blob:voice.m4a']);
    expect(messages).toEqual(['bad.wav couldn’t be played here.']);
  });

  it('a placed voice take is a sound marked recorded, in the pool as a recording', () => {
    const placed = addTake({ file: new File(['t'], 'Voice 1 take 1.webm', { type: 'audio/webm' }), name: 'Voice 1 take 1', track: MUSIC, tracks: getVideo().tracks, start: 0, length: 1 });
    expect(placed).not.toHaveProperty('error');
    expect(getVideo().sounds[0]).toMatchObject({ recorded: true });
    expect(poolOf(getVideo()).at(-1)).toMatchObject({ kind: 'audio', name: 'Voice 1 take 1', recorded: true });
  });
});

describe('adding from the pool (AC-3, D1)', () => {
  const video = { ...item('blob:v', 'video'), name: 'v.mp4', srcDur: 3, thumb: 'thumb:v', strip: ['f1', 'f2'] };
  const photo = { ...item('blob:p'), name: 'p.jpg' };
  const song = { ...item('blob:s', 'audio'), name: 's.mp3', srcDur: 5 };
  const take = { ...item('blob:r', 'audio'), name: 'Voice 1', srcDur: 1, recorded: true as const };
  beforeEach(() => {
    vi.spyOn(mediaIO, 'photo').mockImplementation((name) =>
      Promise.resolve({ ...clip(name, `blob:reread-${name}`), name, still: {} as HTMLCanvasElement }),
    );
    vi.spyOn(mediaIO, 'strip').mockResolvedValue(undefined);
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:new', revokeObjectURL: () => undefined });
    loadVideoProject({ clips: [clip('a', 'blob:a'), clip('b', 'blob:b', 2)], pool: [video, photo, song, take] });
    setPlayhead(2);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('puts a video on the main track at the playhead, as one undo step, sharing the pool’s file', async () => {
    expect(await addFromPool('blob:v')).toEqual([]);
    const main = getVideo().clips.filter((entry) => entry.track === MAIN_VIDEO);
    expect(main.map((entry) => [entry.url, entry.start])).toEqual([
      ['blob:a', 0],
      ['blob:v', 2],
      ['blob:b', 5],
    ]);
    expect(main[1]).toMatchObject({ kind: 'video', name: 'v.mp4', file: video.file, srcDur: 3, in: 0, out: 3, strip: ['f1', 'f2'] });
    expect(undoAll()).toBe(1);
  });

  it('puts a photo there too, its preview made again from the file, the pool’s URL kept', async () => {
    expect(await addFromPool('blob:p')).toEqual([]);
    expect(mediaIO.photo).toHaveBeenCalledWith('p.jpg', photo.file);
    const added = getVideo().clips.find((entry) => entry.name === 'p.jpg');
    expect(added).toMatchObject({ url: 'blob:p', file: photo.file, start: 2 });
    expect(added?.still).toBeTruthy();
  });

  it('puts a sound on the Music track and a recording on a Voice track (made when missing), each one step', async () => {
    expect(await addFromPool('blob:s')).toEqual([]);
    expect(getVideo().sounds.map((entry) => [entry.url, entry.track, entry.start])).toEqual([['blob:s', MUSIC, 2]]);
    expect(await addFromPool('blob:r')).toEqual([]);
    const voiced = getVideo().sounds.find((entry) => entry.url === 'blob:r');
    const track = getVideo().tracks.find((entry) => entry.id === voiced?.track);
    expect(track && soundRole(track)).toBe('voice');
    expect(voiced).toMatchObject({ recorded: true, name: 'Voice 1', file: take.file });
    expect(undoAll()).toBe(2);
  });

  it('goes on the track and at the time given (a drop)', async () => {
    expect(await addFromPool('blob:s', { track: MUSIC, at: 0.5 })).toEqual([]);
    expect(getVideo().sounds[0]).toMatchObject({ track: MUSIC, start: 0.5 });
  });

  it('refuses a picture on a sound track, a sound on a picture track, and a file no longer there', async () => {
    expect(await addFromPool('blob:v', { track: MUSIC, at: 0 })).toEqual(['Photos and videos go on a picture track.']);
    expect(await addFromPool('blob:s', { track: MAIN_VIDEO, at: 0 })).toEqual(['Sound goes on a sound track.']);
    expect(await addFromPool('blob:gone')).toEqual(['That file is no longer in the project’s media.']);
    expect(getVideo().canUndo).toBe(false);
  });
});

describe('removing from the pool (AC-4, D4)', () => {
  beforeEach(() =>
    loadVideoProject({
      clips: [clip('a', 'blob:a'), clip('b', 'blob:b', 2), clip('c', 'blob:a', 4)],
      sounds: [sound('s', 'blob:a')],
      pool: [item('blob:p'), item('blob:b')],
    }),
  );

  it('takes an unused file out in one undo step', () => {
    removeFromPool('blob:p');
    expect(poolOf(getVideo()).map((entry) => entry.url)).toEqual(['blob:b', 'blob:a']);
    expect(undoAll()).toBe(1);
    expect(getVideo().pool.map((entry) => entry.url)).toEqual(['blob:p', 'blob:b']);
  });

  it('takes a used file out with every clip and sound clip using it, in one undo step', () => {
    removeFromPool('blob:a');
    expect(getVideo().clips.map((entry) => entry.id)).toEqual(['b']);
    expect(getVideo().sounds).toEqual([]);
    expect(poolOf(getVideo()).map((entry) => entry.url)).toEqual(['blob:p', 'blob:b']);
    expect(undoAll()).toBe(1);
    expect(getVideo().clips.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(getVideo().sounds.map((entry) => entry.id)).toEqual(['s']);
  });

  it('takes a file both imported and used out of the list and off the timeline', () => {
    removeFromPool('blob:b');
    expect(getVideo().pool.map((entry) => entry.url)).toEqual(['blob:p']);
    expect(getVideo().clips.map((entry) => entry.id)).toEqual(['a', 'c']);
  });
});

describe('usesOf (AC-4)', () => {
  it('lists the clips and sound clips that use a file', () => {
    loadVideoProject({ clips: [clip('a', 'blob:a'), clip('b', 'blob:a', 2), clip('c', 'blob:c', 4)], sounds: [sound('s', 'blob:a')] });
    expect(usesOf(getVideo(), 'blob:a')).toEqual([
      { kind: 'clip', id: 'a', track: MAIN_VIDEO },
      { kind: 'clip', id: 'b', track: MAIN_VIDEO },
      { kind: 'sound', id: 's', track: MUSIC },
    ]);
    expect(usesOf(getVideo(), 'blob:nothing')).toEqual([]);
  });
});
