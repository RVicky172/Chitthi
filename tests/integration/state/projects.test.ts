import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { isMissing } from '@/engine/mediaFile';
import { mediaKey } from '@/engine/mediaKey';
import type { PhotoProjectDoc } from '@/engine/photoProjectDoc';
import type { ProjectDoc } from '@/engine/projectDoc';
import { encodeScan, type SoundScan } from '@/engine/soundScan';
import { MAIN_VIDEO, MUSIC } from '@/engine/tracks';
import { recentErrors } from '@/lib/errors';
import type { MediaStore } from '@/lib/mediaStore';
import { projectLock } from '@/lib/projectLock';
import type { LibraryUsage, ProjectCache, ProjectEntry, ProjectLibrary } from '@/lib/projects';
import { LAST_KEY, configureProjects, deleteProject, duplicateProject, listProjects, findMissing, newProject, openIO, openProject, projectsUsage, recentProject, renameProject, spaceFreed, startStudio } from '@/state/projects';
import { change as changePhotos, getIg, selectPhoto, setIgState, type IgItem } from '@/state/instagram';
import { cacheIO, keepMedia, saveStatus, saveStatusText, startAutosave, subscribeSaveStatus, type Autosave, type SaveStatus } from '@/state/projectSave';
import { change, getVideo, loadVideoProject, selectClip, setPlayhead, setPlaying, setVideoOptions, setZoom, shareStrip, type VClip, type VSound } from '@/state/videoStore';
import { addScan, clearScans, scanIO, scanOf } from '@/state/soundScan';
import { lockHub } from '../../support/lockHub';
import { memoryMedia } from '../../support/memoryMedia';
import { memoryProjects, type MemoryProjects } from '../../support/memoryProjects';

/*
 * 408 T060 (AC-1, AC-9): autosave over the video and photo stores, with an in-memory library and media store and a
 * fake clock. A change saves 2 s after the last one (a drag once, when it ends); selections, play and zoom don't save;
 * hiding the tab saves at once; the status goes saving → saved; a failing write keeps the project in memory, says why,
 * logs it and retries on the next change and every 30 s; the 90 % warning comes once per session.
 */

/** A library that counts writes and can be made full, over the in-memory one. */
interface TestLibrary extends ProjectLibrary {
  writes: { id: string; doc: unknown; entry: ProjectEntry }[];
  full: boolean;
  usageIs: LibraryUsage;
}

/**
 * The in-memory library, watched.
 * @returns the library
 */
function testLibrary(): TestLibrary {
  const inner = memoryProjects();
  const library: TestLibrary = {
    ...inner,
    writes: [],
    full: false,
    usageIs: { used: 0, allowed: null, persisted: null },
    async write(id, doc, entry) {
      library.writes.push({ id, doc: JSON.parse(JSON.stringify(doc)) as unknown, entry });
      if (library.full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      await inner.write(id, doc, entry);
    },
    usage: () => Promise.resolve(library.usageIs),
  };
  return library;
}

/**
 * A photo clip on the main track, made by hand (no decoding in Node).
 * @param id its id
 * @param dur its length, seconds
 * @param file its file
 * @returns the clip
 */
const clip = (id: string, dur: number, file: Blob = new Blob([id], { type: 'image/jpeg' })): VClip => ({
  id,
  kind: 'photo',
  track: MAIN_VIDEO,
  start: 0,
  name: `${id}.jpg`,
  file,
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
 * A photo in the batch, made by hand.
 * @param id its id
 * @returns the photo
 */
const photo = (id: string): IgItem => ({
  id,
  name: `${id}.jpg`,
  file: new Blob([id], { type: 'image/jpeg' }),
  w: 10,
  h: 10,
  edit: { ...DEFAULT_EDIT },
  layers: [],
  preview: {} as HTMLCanvasElement,
});

let library: TestLibrary;
let media: MediaStore;
let hide: () => void;
let warnings: string[];
let autosave: Autosave;

/**
 * Starts the autosave on a fresh video project p1.
 * @returns the autosave
 */
function start(): Autosave {
  autosave = startAutosave({
    library,
    media,
    onHide: (save) => {
      hide = save;
      return () => undefined;
    },
    warn: (message) => warnings.push(message),
  });
  return autosave;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 14, 2));
  library = testLibrary();
  media = memoryMedia('copies', 1e9).store;
  hide = () => undefined;
  warnings = [];
  loadVideoProject({ clips: [clip('a', 2)] });
  setIgState({ items: [], selected: null });
  start().open('video', 'p1', 'Reel · 19 Oct 14:02');
});
afterEach(() => {
  autosave.stop();
  vi.useRealTimers();
});

const videoWrites = () => library.writes.filter((write) => write.id === 'p1');

describe('autosave (408 T060, AC-1)', () => {
  it('opening a project doesn’t save; a change saves 2 s after it, the document and its entry', async () => {
    await vi.advanceTimersByTimeAsync(5000);
    expect(library.writes).toEqual([]);
    change('', { clips: [...getVideo().clips, clip('b', 3)] });
    await vi.advanceTimersByTimeAsync(1999);
    expect(library.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(videoWrites()).toHaveLength(1);
    const doc = (await library.read('p1')) as ProjectDoc;
    expect(doc.name).toBe('Reel · 19 Oct 14:02');
    expect(doc.clips.map((saved) => saved.id)).toEqual(['a', 'b']);
    expect(videoWrites()[0]?.entry).toMatchObject({ id: 'p1', studio: 'video', name: 'Reel · 19 Oct 14:02', kind: 'reel', length: 5, photos: 0, readable: true, changed: Date.now() });
  });

  it('changes in a row (a drag) save once, 2 s after the last', async () => {
    for (let step = 1; step <= 30; step++) {
      change('drag', { clips: [clip('a', 2 + step / 10)] });
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(library.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1900);
    expect(videoWrites()).toHaveLength(1);
    expect(((await library.read('p1')) as ProjectDoc).clips[0]?.dur).toBe(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(videoWrites()).toHaveLength(1);
  });

  it('selections, play, the playhead and zoom don’t save; hiding the tab saves them at once', async () => {
    selectClip('a');
    setPlaying(true);
    setPlayhead(1.5);
    setPlaying(false);
    setZoom(120);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(library.writes).toEqual([]);
    hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(videoWrites()).toHaveLength(1);
    expect(((await library.read('p1')) as ProjectDoc).playhead).toBe(1.5);
    // Nothing new: hiding again writes nothing.
    hide();
    await vi.advanceTimersByTimeAsync(3000);
    expect(videoWrites()).toHaveLength(1);
  });

  it('hiding the tab saves a pending change at once, and the timer then has nothing left to do', async () => {
    change('', { clips: [clip('a', 4)] });
    await vi.advanceTimersByTimeAsync(500);
    hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(videoWrites()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(videoWrites()).toHaveLength(1);
  });

  it('flush() saves at once and resolves when it is written (the desktop window waits for it)', async () => {
    change('', { clips: [clip('a', 4)] });
    await autosave.flush();
    expect(videoWrites()).toHaveLength(1);
    expect(((await library.read('p1')) as ProjectDoc).clips[0]?.dur).toBe(4);
  });

  it('the status goes saving → saved, and tells its subscribers', async () => {
    const seen: SaveStatus['state'][] = [];
    const stop = subscribeSaveStatus(() => seen.push(saveStatus().state));
    expect(saveStatus()).toEqual({ state: 'saved' });
    change('', { clips: [clip('a', 4)] });
    await vi.advanceTimersByTimeAsync(2000);
    stop();
    expect(seen).toEqual(['saving', 'saved']);
    expect(saveStatusText(saveStatus())).toBe('Saved');
    expect(saveStatusText({ state: 'saving' })).toBe('Saving…');
  });

  it('the photo batch saves to its own project, and a video change doesn’t write it', async () => {
    autosave.open('photo', 'q1', 'Photos · 19 Oct 14:02');
    changePhotos('', [photo('p'), photo('q')], { selected: 'p' });
    await vi.advanceTimersByTimeAsync(2000);
    const photoWrites = library.writes.filter((write) => write.id === 'q1');
    expect(photoWrites).toHaveLength(1);
    expect(photoWrites[0]?.entry).toMatchObject({ studio: 'photo', kind: 'photo', photos: 2, length: 0 });
    const doc = (await library.read('q1')) as PhotoProjectDoc;
    expect(doc.items.map((item) => item.id)).toEqual(['p', 'q']);
    expect(doc.selected).toBe('p');
    expect(videoWrites()).toEqual([]);
    // Picking another photo is a selection: it waits for the next save.
    selectPhoto('q');
    await vi.advanceTimersByTimeAsync(5000);
    expect(library.writes).toHaveLength(1);
    expect(getIg().selected).toBe('q');
  });

  it('with no project open, changes save nothing; stop() ends saving', async () => {
    autosave.stop();
    start();
    change('', { clips: [clip('a', 4)] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(library.writes).toEqual([]);
    autosave.open('video', 'p1', 'Trip');
    autosave.stop();
    change('', { clips: [clip('a', 6)] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(library.writes).toEqual([]);
  });
});

describe('autosave and media (408 T060, AC-4)', () => {
  it('a file kept when added is saved under its media id; a save waits for a keep under way', async () => {
    let release: (value?: unknown) => void = () => undefined;
    const inner = media;
    const slow: MediaStore = {
      ...inner,
      keep: async (file, owned) => {
        await new Promise((resolve) => (release = resolve));
        return inner.keep(file, owned);
      },
    };
    autosave.stop();
    media = slow;
    start().open('video', 'p1', 'Trip');
    const file = new Blob(['a picture'], { type: 'image/png' });
    const keeping = keepMedia(file, false);
    change('', { clips: [clip('pic', 3, file)] });
    await vi.advanceTimersByTimeAsync(3000);
    expect(library.writes).toEqual([]);
    release();
    const id = await keeping;
    await vi.advanceTimersByTimeAsync(0);
    expect(videoWrites()).toHaveLength(1);
    expect(id).toBe(await mediaKey(file));
    expect(((await library.read('p1')) as ProjectDoc).media.map((entry) => entry.id)).toEqual([id]);
  });
});

describe('a failing save (408 T060, AC-9)', () => {
  it('keeps the project in memory, says “Not saved: storage is full”, logs it, and retries every 30 s', async () => {
    library.full = true;
    change('', { clips: [clip('a', 4)] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveStatus()).toEqual({ state: 'failed', reason: 'storage is full' });
    expect(saveStatusText(saveStatus())).toBe('Not saved: storage is full');
    expect(recentErrors().at(-1)).toMatchObject({ source: 'handled' });
    expect(getVideo().clips[0]?.dur).toBe(4);
    expect(videoWrites()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(videoWrites()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(videoWrites()).toHaveLength(2);
    library.full = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(videoWrites()).toHaveLength(3);
    expect(saveStatus()).toEqual({ state: 'saved' });
    expect(((await library.read('p1')) as ProjectDoc).clips[0]?.dur).toBe(4);
    // Saved: no more retries.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(videoWrites()).toHaveLength(3);
  });

  it('retries on the next change too, and another failure gives its own reason', async () => {
    library.full = true;
    change('', { clips: [clip('a', 4)] });
    await vi.advanceTimersByTimeAsync(2000);
    library.full = false;
    change('', { clips: [clip('a', 5)] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(videoWrites()).toHaveLength(2);
    expect(saveStatus()).toEqual({ state: 'saved' });

    const broken: ProjectLibrary = { ...library, write: () => Promise.reject(new Error('EIO: i/o error')) };
    autosave.stop();
    library = { ...library, ...broken };
    start().open('video', 'p1', 'Trip');
    change('', { clips: [clip('a', 6)] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveStatus()).toEqual({ state: 'failed', reason: 'EIO: i/o error' });
  });

  it('warns once per session when projects reach 90 % of the space allowed', async () => {
    library.usageIs = { used: 85, allowed: 100, persisted: false };
    change('', { clips: [clip('a', 4)] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(warnings).toEqual([]);
    library.usageIs = { used: 91, allowed: 100, persisted: false };
    change('', { clips: [clip('a', 5)] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/90 %/);
    change('', { clips: [clip('a', 6)] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(warnings).toHaveLength(1);
  });
});

describe('projects: new, open, rename, duplicate, delete (408 T062, AC-3, AC-7)', () => {
  let routes: string[];
  let stored: Map<string, string>;

  /** Configures projects over this test's library, media, autosave, storage and routes. */
  const configure = (): void => {
    configureProjects({
      library,
      media,
      autosave,
      desktop: false,
      storage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
      navigate: (hash) => routes.push(hash),
    });
  };

  beforeEach(() => {
    autosave.stop();
    start();
    routes = [];
    stored = new Map();
    configure();
    // Node decodes no pictures: stand-ins for the thumbnails, stills and previews.
    vi.spyOn(openIO, 'look').mockResolvedValue({ thumb: 'thumb', strip: ['thumb'], still: null });
    vi.spyOn(openIO, 'strip').mockImplementation(() => undefined);
    vi.spyOn(openIO, 'preview').mockResolvedValue({} as HTMLCanvasElement);
  });
  afterEach(() => {
    configureProjects(null);
    vi.restoreAllMocks();
  });

  const last = () => JSON.parse(stored.get(LAST_KEY) ?? '{}') as Record<string, string>;
  const names = async (studio?: 'photo' | 'video') => (await listProjects(studio)).map((entry) => entry.name);

  it('a new project is named after its kind and the time, saved at once (listed newest first), and opens in its route', async () => {
    const reel = await newProject('video', 'reel');
    expect(await names()).toEqual(['Reel · 19 Oct 14:02']);
    expect(routes).toEqual(['#/instagram/video']);
    await vi.advanceTimersByTimeAsync(60_000);
    const youtube = await newProject('video', 'vlog');
    expect(getVideo().kind).toBe('vlog');
    expect(getVideo().clips).toEqual([]);
    const photos = await newProject('photo');
    expect(routes).toEqual(['#/instagram/video', '#/instagram/youtube', '#/instagram']);
    expect(await names('video')).toEqual(['YouTube · 19 Oct 14:03', 'Reel · 19 Oct 14:02']);
    expect(await names('photo')).toEqual(['Photos · 19 Oct 14:03']);
    expect(last()).toEqual({ video: youtube, photo: photos });
    expect(reel).not.toBe(youtube);
  });

  it('opening saves the project left, then restores the other with its settings and playhead, no history, in its route', async () => {
    const trip = await newProject('video', 'vlog');
    change('', { clips: [clip('a', 2), clip('b', 3)] });
    setVideoOptions({ fadeOut: false, quality: 'high' });
    setPlayhead(1.5);
    const other = await newProject('video', 'reel');
    expect(getVideo().clips).toEqual([]);
    expect(getVideo().kind).toBe('reel');
    expect(await openProject(trip)).toEqual({ studio: 'video', dropped: [] });
    const video = getVideo();
    expect(video.clips.map((saved) => saved.id)).toEqual(['a', 'b']);
    expect(await (video.clips[0]?.file as Blob).text()).toBe('a');
    expect(video.clips[0]?.url).toMatch(/^memory:/);
    expect(video.clips[0]?.thumb).toBe('thumb');
    expect({ kind: video.kind, fadeOut: video.fadeOut, quality: video.quality, t: video.t, canUndo: video.canUndo }).toEqual({ kind: 'vlog', fadeOut: false, quality: 'high', t: 1.5, canUndo: false });
    expect(routes.at(-1)).toBe('#/instagram/youtube');
    expect(last().video).toBe(trip);
    // The project it left is kept as it was: empty.
    await openProject(other);
    expect(getVideo().clips).toEqual([]);
    // An edit right before opening another isn't lost: the one left is saved first.
    change('', { clips: [clip('c', 2)] });
    await openProject(trip);
    await openProject(other);
    expect(getVideo().clips.map((saved) => saved.id)).toEqual(['c']);
  });

  it('opens a photo project: its photos, the selected one and its settings', async () => {
    const batch = await newProject('photo');
    changePhotos('', [photo('p'), photo('q')], { selected: 'q', caption: 'Sunday' });
    await newProject('photo');
    expect(getIg().items).toEqual([]);
    await openProject(batch);
    expect(getIg().items.map((item) => item.id)).toEqual(['p', 'q']);
    expect({ selected: getIg().selected, caption: getIg().caption, canUndo: getIg().canUndo }).toEqual({ selected: 'q', caption: 'Sunday', canUndo: false });
    expect(routes.at(-1)).toBe('#/instagram');
  });

  it('a file no longer kept opens as missing, by name; a damaged project can’t be opened', async () => {
    const trip = await newProject('video');
    change('', { clips: [clip('a', 2)] });
    await newProject('video');
    await media.sweep(new Set());
    await openProject(trip);
    const opened = getVideo().clips[0];
    expect(isMissing(opened.file)).toBe(true);
    expect(opened.name).toBe('a.jpg');
    (library as unknown as MemoryProjects).faults.spoil(trip);
    expect(await openProject(trip)).toEqual({ error: 'This project can’t be opened.' });
  });

  it('renames with 1–80 characters, the open project and another', async () => {
    const first = await newProject('video');
    const second = await newProject('video');
    expect(await renameProject(second, '   ')).toMatch(/1 to 80/);
    expect(await renameProject(second, 'x'.repeat(81))).toMatch(/1 to 80/);
    expect(await renameProject(second, '  Hills  ')).toBeNull();
    expect(await renameProject(first, 'Sea')).toBeNull();
    expect((await listProjects()).map((entry) => [entry.id, entry.name])).toEqual(
      expect.arrayContaining([
        [second, 'Hills'],
        [first, 'Sea'],
      ]),
    );
    expect(((await library.read(second)) as ProjectDoc).name).toBe('Hills');
    expect(((await library.read(first)) as ProjectDoc).name).toBe('Sea');
    // The open one keeps its new name in later saves.
    change('', { clips: [clip('a', 2)] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(((await library.read(second)) as ProjectDoc).name).toBe('Hills');
  });

  it('duplicates a project as “<name> copy”, sharing its media and copying its cache', async () => {
    const trip = await newProject('video');
    change('', { clips: [clip('a', 2)] });
    await library.writeCache(trip, { thumbs: { a: 'data:x' }, strips: {}, previews: {}, scans: {} });
    const copy = await duplicateProject(trip);
    if (typeof copy !== 'string') throw new Error(copy.error);
    const original = (await library.read(trip)) as ProjectDoc;
    const copied = (await library.read(copy)) as ProjectDoc;
    expect(copied.name).toBe(`${original.name ?? ''} copy`);
    expect(copied.media.map((entry) => entry.id)).toEqual(original.media.map((entry) => entry.id));
    expect(await library.readCache(copy)).toEqual({ thumbs: { a: 'data:x' }, strips: {}, previews: {}, scans: {} });
  });

  it('deleting frees the media no other project uses, keeps shared media, and starts a new project if it was open (AC-7)', async () => {
    const shared = new Blob(['shared picture'], { type: 'image/jpeg' });
    const own = new Blob(['y'.repeat(5000)], { type: 'image/jpeg' });
    const first = await newProject('video');
    change('', { clips: [clip('s', 2, shared), clip('o', 2, own)] });
    const second = await newProject('video');
    change('', { clips: [clip('s', 2, shared)] });
    await newProject('video');
    const docBytes = (await listProjects()).find((entry) => entry.id === first)?.bytes ?? 0;
    expect(await deleteProject(first)).toBe(docBytes + own.size);
    expect(await names()).toHaveLength(2);
    expect('missing' in (await media.open(await mediaKey(shared), 's.jpg'))).toBe(false);
    expect('missing' in (await media.open(await mediaKey(own), 'o.jpg'))).toBe(true);

    await openProject(second);
    await deleteProject(second);
    const left = (await listProjects('video')).map((entry) => entry.id);
    expect(left).not.toContain(second);
    expect(getVideo().clips).toEqual([]);
    const opened = autosave.current('video')?.id ?? '';
    expect(left).toContain(opened);
    expect(last().video).toBe(opened);
  });

  it('opening a studio reopens the last project used; the first visit starts a new one', async () => {
    const first = await startStudio('video');
    expect(await names('video')).toHaveLength(1);
    expect(await startStudio('video')).toBe(first);
    const trip = await newProject('video');
    change('', { clips: [clip('a', 2)] });
    await autosave.flush();
    // A new session: nothing open, the last one remembered.
    autosave.stop();
    start();
    configure();
    loadVideoProject({ clips: [] });
    expect(await startStudio('video')).toBe(trip);
    expect(getVideo().clips.map((saved) => saved.id)).toEqual(['a']);
    // Its last project gone: a new one.
    stored.set(LAST_KEY, JSON.stringify({ photo: 'gone' }));
    const photos = await startStudio('photo');
    expect(photos).not.toBe('gone');
    expect(await names('photo')).toHaveLength(1);
  });
});

describe('the cache: thumbnails, filmstrips, previews and sound scans (408 T063, Q14)', () => {
  let routes: string[];
  let cacheWrites: { id: string; cache: ProjectCache }[];
  const scanned: SoundScan = { rate: 100, peaks: Uint8Array.from([10, 200, 30]), rms: Float32Array.from([-20, -18]), dur: 0.03 };

  /**
   * A video clip with its thumbnail and filmstrip, made by hand.
   * @param id its id
   * @param file its file
   * @returns the clip
   */
  const videoClip = (id: string, file: Blob): VClip => ({ ...clip(id, 0, file), kind: 'video', url: `blob:${id}`, srcDur: 4, in: 0, out: 4, volume: 1, thumb: `thumb-${id}`, strip: [`${id}-1`, `${id}-2`] });

  beforeEach(() => {
    autosave.stop();
    cacheWrites = [];
    const inner = library.writeCache.bind(library);
    library.writeCache = async (id, cache) => {
      cacheWrites.push({ id, cache: JSON.parse(JSON.stringify(cache)) as ProjectCache });
      await inner(id, cache);
    };
    start();
    routes = [];
    configureProjects({ library, media, autosave, desktop: false, storage: null, navigate: (hash) => routes.push(hash) });
    clearScans();
    vi.spyOn(openIO, 'look').mockResolvedValue({ thumb: 'look', strip: ['look'], still: null });
    vi.spyOn(openIO, 'strip').mockImplementation(() => undefined);
    vi.spyOn(openIO, 'preview').mockResolvedValue({ from: 'file' } as unknown as HTMLCanvasElement);
    vi.spyOn(openIO, 'previewFromData').mockResolvedValue({ from: 'cache' } as unknown as HTMLCanvasElement);
    vi.spyOn(cacheIO, 'previewData').mockImplementation(() => 'data:image/jpeg;base64,UFJFVklFVw==');
    vi.spyOn(scanIO, 'scan').mockResolvedValue(null);
  });
  afterEach(() => {
    configureProjects(null);
    clearScans();
    vi.restoreAllMocks();
  });

  it('a save writes the video clips’ thumbnails, filmstrips and sound scans by media id, and only when they change', async () => {
    const file = new Blob(['a video'], { type: 'video/mp4' });
    const id = await mediaKey(file);
    const trip = await newProject('video');
    cacheWrites.length = 0;
    change('', { clips: [videoClip('v', file)] });
    addScan('blob:v', scanned);
    await vi.advanceTimersByTimeAsync(2000);
    expect(cacheWrites).toHaveLength(1);
    expect(cacheWrites[0]).toEqual({ id: trip, cache: { thumbs: { [id]: 'thumb-v' }, strips: { [id]: ['v-1', 'v-2'] }, previews: {}, scans: { [id]: encodeScan(scanned) } } });
    // Nothing new: nothing written.
    hide();
    await vi.advanceTimersByTimeAsync(3000);
    expect(cacheWrites).toHaveLength(1);
    // A filmstrip filled in later is written; the document, unchanged, isn't.
    const docWrites = library.writes.length;
    shareStrip('v', ['n-1', 'n-2', 'n-3']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(cacheWrites).toHaveLength(2);
    expect(cacheWrites[1]?.cache.strips[id]).toEqual(['n-1', 'n-2', 'n-3']);
    expect(library.writes).toHaveLength(docWrites);
  });

  it('a sound scan finished after the save is written 2 s later', async () => {
    const song = new Blob(['a song'], { type: 'audio/mpeg' });
    await newProject('video');
    change('', { sounds: [{ id: 's1', track: MUSIC, start: 0, in: 0, out: 3, srcDur: 3, toEnd: false, volume: 1, name: 'song.mp3', file: song, url: 'blob:song' } satisfies VSound] });
    await vi.advanceTimersByTimeAsync(2000);
    const before = cacheWrites.length;
    addScan('blob:song', scanned);
    await vi.advanceTimersByTimeAsync(2000);
    expect(cacheWrites).toHaveLength(before + 1);
    expect(cacheWrites.at(-1)?.cache.scans).toEqual({ [await mediaKey(song)]: encodeScan(scanned) });
  });

  it('a photo batch writes each preview once, by media id', async () => {
    await newProject('photo');
    changePhotos('', [photo('p'), photo('q')]);
    await vi.advanceTimersByTimeAsync(2000);
    changePhotos('', [...getIg().items].reverse());
    await vi.advanceTimersByTimeAsync(2000);
    expect(cacheIO.previewData).toHaveBeenCalledTimes(2);
    const ids = await Promise.all(getIg().items.map((item) => mediaKey(item.file as Blob)));
    expect(Object.keys(cacheWrites.at(-1)?.cache.previews ?? {}).sort((first, second) => first.localeCompare(second))).toEqual([...ids].sort((first, second) => first.localeCompare(second)));
  });

  it('opening reads the cache: thumbnails, filmstrips and scans come back without decoding the files', async () => {
    const file = new Blob(['a video'], { type: 'video/mp4' });
    const trip = await newProject('video');
    change('', { clips: [videoClip('v', file)] });
    addScan('blob:v', scanned);
    await vi.advanceTimersByTimeAsync(2000);
    await newProject('video');
    await openProject(trip);
    const reopened = getVideo().clips[0];
    expect({ thumb: reopened.thumb, strip: reopened.strip }).toEqual({ thumb: 'thumb-v', strip: ['v-1', 'v-2'] });
    expect(openIO.strip).not.toHaveBeenCalled();
    expect(scanOf(reopened.url)).toEqual(scanned);
    await vi.advanceTimersByTimeAsync(100);
    expect(scanIO.scan).not.toHaveBeenCalled();
  });

  it('what the cache lacks is made again in the background: the filmstrip and the sound scan', async () => {
    const file = new Blob(['a video'], { type: 'video/mp4' });
    const trip = await newProject('video');
    change('', { clips: [{ ...videoClip('v', file), thumb: '', strip: [] }] });
    await vi.advanceTimersByTimeAsync(2000);
    await newProject('video');
    await openProject(trip);
    const reopened = getVideo().clips[0];
    expect(openIO.strip).toHaveBeenCalledWith('v', reopened.url, 4);
    await vi.advanceTimersByTimeAsync(100);
    expect(scanIO.scan).toHaveBeenCalledTimes(1);
  });

  it('opening a photo project makes its previews from the cache, and from the file only when not cached', async () => {
    const batch = await newProject('photo');
    changePhotos('', [photo('p')]);
    await vi.advanceTimersByTimeAsync(2000);
    changePhotos('', [...getIg().items, photo('q')]);
    vi.mocked(cacheIO.previewData).mockImplementation(() => {
      throw new Error('no canvas');
    });
    await vi.advanceTimersByTimeAsync(2000);
    await newProject('photo');
    await openProject(batch);
    expect(getIg().items.map((item) => (item.preview as unknown as { from: string }).from)).toEqual(['cache', 'file']);
  });
});

describe('one editor per project: the autosave and the lock (408 T064, AC-8)', () => {
  it('another window opening the project stops saving here at once and says so; opening it here again takes it back', async () => {
    const channel = lockHub();
    autosave.stop();
    autosave = startAutosave({ library, media, onHide: () => () => undefined, lock: projectLock(channel()) });
    autosave.open('video', 'p1', 'Trip');
    const otherWindow = projectLock(channel());
    change('', { clips: [clip('a', 4)] });
    otherWindow.hold('video', 'p1');
    expect(saveStatus()).toEqual({ state: 'elsewhere', studio: 'video', id: 'p1' });
    expect(saveStatusText(saveStatus())).toBe('This project is open in another window');
    await vi.advanceTimersByTimeAsync(5000);
    await autosave.flush();
    expect(library.writes).toEqual([]);
    expect(autosave.current('video')).toBeNull();
    // Open here again: this window holds it, the other one is told.
    const told: string[] = [];
    otherWindow.onTaken((studio, id) => told.push(`${studio}:${id}`));
    autosave.open('video', 'p1', 'Trip', true);
    expect(told).toEqual(['video:p1']);
    await autosave.flush();
    expect(videoWrites()).toHaveLength(1);
    expect(saveStatus()).toEqual({ state: 'saved' });
  });
});

describe('what the Projects panel shows (408 T070, AC-3, AC-7, AC-9)', () => {
  beforeEach(() => {
    autosave.stop();
    start();
    configureProjects({ library, media, autosave, desktop: false, storage: null, navigate: () => undefined });
    vi.spyOn(cacheIO, 'previewData').mockImplementation(() => 'data:preview');
    vi.spyOn(cacheIO, 'thumbData').mockImplementation(() => 'data:small');
  });
  afterEach(() => {
    configureProjects(null);
    vi.restoreAllMocks();
  });

  it('an entry’s thumbnail is its first clip’s, or its first photo’s small copy', async () => {
    const trip = await newProject('video');
    change('', { clips: [{ ...clip('a', 2), thumb: 'data:first' }, { ...clip('b', 2), thumb: 'data:second' }] });
    await autosave.flush();
    const batch = await newProject('photo');
    changePhotos('', [photo('p'), photo('q')]);
    await autosave.flush();
    const thumbs = Object.fromEntries((await listProjects()).map((entry) => [entry.id, entry.thumb]));
    expect(thumbs[trip]).toBe('data:first');
    expect(thumbs[batch]).toBe('data:small');
  });

  it('the space a delete frees: the project and the media no other project uses', async () => {
    const shared = new Blob(['shared'], { type: 'image/jpeg' });
    const own = new Blob(['o'.repeat(3000)], { type: 'image/jpeg' });
    const first = await newProject('video');
    change('', { clips: [clip('s', 2, shared), clip('o', 2, own)] });
    const second = await newProject('video');
    change('', { clips: [clip('s', 2, shared)] });
    await newProject('video');
    const entry = (await listProjects()).find((listed) => listed.id === first);
    expect(await spaceFreed(first)).toBe((entry?.bytes ?? 0) + own.size);
    expect(await deleteProject(first)).toBe(await Promise.resolve((entry?.bytes ?? 0) + own.size));
    // On desktop the user's own files are never deleted: only the project counts.
    configureProjects({ library, media, autosave, desktop: true, storage: null, navigate: () => undefined });
    const secondEntry = (await listProjects()).find((listed) => listed.id === second);
    expect(await spaceFreed(second)).toBe(secondEntry?.bytes ?? -1);
  });

  it('the space projects use counts their media once, beside what the browser allows', async () => {
    library.usageIs = { used: 100, allowed: 10_000, persisted: false };
    const shared = new Blob(['x'.repeat(500)], { type: 'image/jpeg' });
    await newProject('video');
    change('', { clips: [clip('a', 2, shared)] });
    await newProject('video');
    change('', { clips: [clip('b', 2, shared)] });
    await autosave.flush();
    expect(await projectsUsage()).toEqual({ used: 100 + shared.size, allowed: 10_000, persisted: false });
  });
});

describe('Find file… and Continue (408 T071, AC-3, AC-5)', () => {
  let desk: ReturnType<typeof memoryMedia>;

  beforeEach(() => {
    autosave.stop();
    desk = memoryMedia('references', 1e9);
    media = desk.store;
    start();
    configureProjects({ library, media, autosave, desktop: true, storage: null, navigate: () => undefined });
    vi.spyOn(openIO, 'look').mockImplementation((name, file) => Promise.resolve({ thumb: isMissing(file) ? 'hatched' : `look-${name}`, strip: [], still: null }));
    vi.spyOn(openIO, 'strip').mockImplementation(() => undefined);
    vi.spyOn(scanIO, 'scan').mockResolvedValue(null);
  });
  afterEach(() => {
    configureProjects(null);
    clearScans();
    vi.restoreAllMocks();
  });

  it('a missing file found again replaces its placeholder in the editor, wherever it is used', async () => {
    const hills = new File(['hills'], 'hills.jpg', { type: 'image/jpeg' });
    const sea = new File(['sea'], 'sea.jpg', { type: 'image/jpeg' });
    const trip = await newProject('video');
    change('', { clips: [clip('a', 2, hills), clip('b', 2, sea), clip('c', 2, hills)] });
    await newProject('video');
    desk.underTest.lose(await mediaKey(hills));
    desk.underTest.lose(await mediaKey(sea));
    await openProject(trip);
    expect(getVideo().clips.map((saved) => isMissing(saved.file))).toEqual([true, true, true]);
    const moved = new File(['hills'], 'hills.jpg', { type: 'image/jpeg' });
    desk.underTest.pickNext(moved);
    expect(await findMissing(await mediaKey(hills))).toEqual([await mediaKey(hills)]);
    const clips = getVideo().clips;
    expect(clips.map((saved) => isMissing(saved.file))).toEqual([false, true, false]);
    expect(clips[0]?.file).toBe(moved);
    expect(clips[0]?.url).toMatch(/^memory:/);
    expect(clips[0]?.thumb).toBe('look-a.jpg');
    // Nothing chosen: nothing changes.
    desk.underTest.pickNext(null);
    expect(await findMissing(await mediaKey(sea))).toBeNull();
    expect(isMissing(getVideo().clips[1]?.file ?? hills)).toBe(true);
  });

  it('Continue offers the most recent project that can be opened', async () => {
    expect(await recentProject()).toBeNull();
    await newProject('video');
    await vi.advanceTimersByTimeAsync(60_000);
    const batch = await newProject('photo');
    expect(await recentProject()).toMatchObject({ id: batch, studio: 'photo', name: 'Photos · 19 Oct 14:03' });
    (library as unknown as MemoryProjects).faults.spoil(batch);
    expect((await recentProject())?.studio).toBe('video');
  });
});
