import { isMissing, type MediaFile } from '../engine/mediaFile';
import { mediaKey } from '../engine/mediaKey';
import { photoDocument, type PhotoProjectDoc } from '../engine/photoProjectDoc';
import { videoDocument, type ProjectDoc } from '../engine/projectDoc';
import { encodeScan, type SavedScan, type SoundScan } from '../engine/soundScan';
import { logError } from '../lib/errors';
import { broadcastLock, projectLock, type ProjectLock } from '../lib/projectLock';
import { sizeText, type MediaStore } from '../lib/mediaStore';
import type { ProjectCache, ProjectEntry, ProjectLibrary, Studio } from '../lib/projects';
import { desktop } from '../platform/desktop';
import { getIg, subscribeIg, type IgState } from './instagram';
import { scanOf, scanSnapshot, subscribeScans } from './soundScan';
import { getVideo, subscribeVideo, videoLength, type VState } from './videoStore';

/*
 * Autosave for saved photo and video projects (408 §6, AC-1, AC-9). Each studio's open project is saved 2 s after the
 * last change to its document (a drag: once, when it ends); the playhead and track heights ride along with the next
 * save; hiding the tab, leaving the page and closing the desktop window save at once (`flush`). A failing save keeps
 * the project in memory, says why in the status, and retries on the next change and every 30 s. Media is kept when it
 * is added (`keepMedia`), so a save only waits for a copy already under way.
 */

/** How long after the last change a save starts, ms. */
export const SAVE_DELAY = 2000;
/** How often a failed save is tried again, ms. */
export const RETRY_DELAY = 30_000;
/** The share of the allowed space that brings the warning (once per session). */
const WARN_SHARE = 0.9;

/** The top bar's save status. */
export type SaveStatus =
  | { state: 'saved' }
  | { state: 'saving' }
  | { state: 'failed'; reason: string }
  /** The project was opened in another tab or window, which saves it now (AC-8): Open here again takes it back. */
  | { state: 'elsewhere'; studio: Studio; id: string };

/** What the autosave works with: injected so tests use in-memory stores and their own events. */
export interface AutosaveDeps {
  library: ProjectLibrary;
  media: MediaStore;
  /** Calls `save` when the tab is hidden or the page left (default: visibilitychange and pagehide); returns an unsubscribe. */
  onHide?: (save: () => void) => () => void;
  /** Shows a one-off warning (storage nearly full, a file that couldn't be kept). */
  warn?: (message: string) => void;
  /** One editor per project (default: a BroadcastChannel to the app's other tabs and windows). */
  lock?: ProjectLock;
}

/** The autosave while it runs. */
export interface Autosave {
  /**
   * From now on, saves the studio's editor into this project (its name as given).
   * @param unsaved the editor holds what the library doesn't yet (a new project): saved by the next flush
   */
  open(studio: Studio, id: string, name: string, unsaved?: boolean): void;
  /** Stops saving the studio's editor (before another project is loaded into it). */
  close(studio: Studio): void;
  /** The studio's open project, or null. */
  current(studio: Studio): { id: string; name: string } | null;
  /** Renames the studio's open project (saved by the next flush, or 2 s from now). */
  rename(studio: Studio, name: string): void;
  /** Saves every pending change now; resolves when written (or failed). */
  flush(): Promise<void>;
  /** Stops saving (a save under way still finishes). */
  stop(): void;
}

/* ------------------------------------------------------------------ opened */

/** Called with a project each time one opens (or is started) in a studio. */
type OpenedListener = (studio: Studio, id: string) => void;
const openedListeners = new Set<OpenedListener>();

/**
 * Listens for projects opening, e.g. so the video editor can offer voice takes left by a crash (209 AC-9).
 * @param listener called with the studio and the project's id
 * @returns the unsubscribe function
 */
export function onProjectOpened(listener: OpenedListener): () => void {
  openedListeners.add(listener);
  return () => openedListeners.delete(listener);
}

/* ------------------------------------------------------------------ status */

let status: SaveStatus = { state: 'saved' };
const statusListeners = new Set<() => void>();

/**
 * The save status now.
 * @returns the status; replaced, never changed
 */
export const saveStatus = (): SaveStatus => status;

/**
 * Listens to the save status.
 * @param listener called after it changes
 * @returns the unsubscribe function
 */
export function subscribeSaveStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/**
 * Changes the status, telling the listeners when it is new.
 * @param next the status
 */
function setStatus(next: SaveStatus): void {
  if (JSON.stringify(next) === JSON.stringify(status)) return;
  status = next;
  statusListeners.forEach((listener) => {
    listener();
  });
}

/**
 * The status in words, for the top bar.
 * @param value the status
 * @returns “Saved”, “Saving…” or “Not saved: <reason>”
 */
export function saveStatusText(value: SaveStatus): string {
  if (value.state === 'failed') return `Not saved: ${value.reason}`;
  if (value.state === 'elsewhere') return 'This project is open in another window';
  return value.state === 'saving' ? 'Saving…' : 'Saved';
}

/**
 * Why a save failed, for people.
 * @param error what the library threw
 * @returns the reason
 */
function failureReason(error: unknown): string {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  const message = error instanceof Error || error instanceof DOMException ? error.message : String(error);
  if (name === 'QuotaExceededError' || /ENOSPC|quota|disk (is )?full/i.test(message)) return 'storage is full';
  return message || 'the project couldn’t be written';
}

/* ------------------------------------------------------------------ media ids */

/** Media ids by file, once kept (or being kept). */
const keptIds = new WeakMap<Blob, Promise<string>>();
/** The autosave running now, whose media store keeps files. */
let active: { deps: AutosaveDeps; stop: () => void } | null = null;

/**
 * Keeps a file in the media store as it is added to a project, so the save that references it has its id (408 §4).
 * Nothing happens while no autosave runs. A file that can't be kept (no room) is warned about and saved under its
 * fingerprint anyway: it opens as missing, by name.
 * @param file the file
 * @param owned the app made it (a recording, a download): always kept, also on desktop
 * @returns its media id, or why it couldn't be kept
 */
export async function keepMedia(file: MediaFile, owned: boolean): Promise<string | { error: string }> {
  if (!(file instanceof Blob)) return file.id;
  const running = active;
  if (!running) return { error: 'Projects aren’t being saved.' };
  const keeping = running.deps.media.keep(file, owned);
  keptIds.set(
    file,
    keeping.then(
      (kept) => (typeof kept === 'string' ? kept : mediaKey(file)),
      () => mediaKey(file),
    ),
  );
  const kept = await keeping.catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  if (typeof kept !== 'string') running.deps.warn?.(kept.error);
  return kept;
}

/**
 * Tells the autosave a file's media id when it is already kept (a reopened project's files).
 * @param file the file
 * @param id its media id
 */
export function rememberMedia(file: MediaFile, id: string): void {
  if (file instanceof Blob) keptIds.set(file, Promise.resolve(id));
}

/**
 * A file's media id: disk media carries it; a Blob's comes from its keep (started now if it never was).
 * @param file the file
 * @returns its media id
 */
async function idOf(file: MediaFile): Promise<string> {
  if (!(file instanceof Blob)) return file.id;
  if (!keptIds.has(file)) await keepMedia(file, false);
  return (await keptIds.get(file)) ?? mediaKey(file);
}

/**
 * Every file's media id.
 * @param files the project's files
 * @returns the ids by file
 */
async function idsOf(files: readonly MediaFile[]): Promise<Map<MediaFile, string>> {
  return new Map(await Promise.all(files.map(async (file) => [file, await idOf(file)] as const)));
}

/**
 * The media ids the editors use now, saved or not (a delete's sweep keeps them).
 * @returns the ids
 */
export async function editorMediaIds(): Promise<Set<string>> {
  const video = getVideo();
  const files = [
    ...video.clips.map((clip) => clip.file),
    ...video.sounds.map((sound) => sound.file),
    ...getIg().items.map((item) => item.file),
  ];
  return new Set((await idsOf(files)).values());
}

/* ------------------------------------------------------------------ documents */

/** One studio's open project. */
interface OpenProject {
  id: string;
  name: string;
  /** Something unsaved: a document change, or the playhead / track heights. */
  dirty: boolean;
  /** The last document written, as text: the same text isn't written again. */
  lastText: string;
  /** The last cache written, as text. */
  lastCache: string;
  /** The last save failed: tried again every 30 s. */
  failed: boolean;
}

/** How the cache's pictures are made (tests put a stand-in here: Node has no canvas). */
export const cacheIO = {
  /**
   * A batch photo's preview as a JPEG data URL.
   * @param canvas the preview
   * @returns the data URL
   */
  previewData: (canvas: HTMLCanvasElement): string => canvas.toDataURL('image/jpeg', 0.85),
  /**
   * A small copy of a photo for the Projects list: a JPEG data URL of at most 160 px.
   * @param canvas the photo's preview
   * @returns the data URL
   */
  thumbData(canvas: HTMLCanvasElement): string {
    const small = document.createElement('canvas');
    const scale = Math.min(1, 160 / Math.max(canvas.width, canvas.height, 1));
    small.width = Math.max(1, Math.round(canvas.width * scale));
    small.height = Math.max(1, Math.round(canvas.height * scale));
    small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.7);
  },
};

/** Small copies for the list, made once per canvas. */
const thumbTexts = new WeakMap<object, string>();

/**
 * A photo's small copy for the Projects list, made once.
 * @param canvas its preview
 * @returns the data URL, or '' when it can't be made
 */
function thumbText(canvas: HTMLCanvasElement): string {
  const known = thumbTexts.get(canvas);
  if (known !== undefined) return known;
  try {
    const text = cacheIO.thumbData(canvas);
    thumbTexts.set(canvas, text);
    return text;
  } catch (error) {
    logError('handled', error);
    return '';
  }
}

/** Previews as data URLs, made once per canvas. */
const previewTexts = new WeakMap<object, string>();
/** Scans as saved, made once per scan. */
const savedScans = new WeakMap<SoundScan, SavedScan>();

/** A cache with nothing in it, as text (what a project starts with). */
const EMPTY_CACHE = JSON.stringify({ thumbs: {}, strips: {}, previews: {}, scans: {} } satisfies ProjectCache);

/**
 * A preview's data URL, made once.
 * @param canvas the preview
 * @returns the data URL, or null when it can't be made
 */
function previewText(canvas: HTMLCanvasElement): string | null {
  const known = previewTexts.get(canvas);
  if (known !== undefined) return known;
  try {
    const text = cacheIO.previewData(canvas);
    previewTexts.set(canvas, text);
    return text;
  } catch (error) {
    logError('handled', error);
    return null;
  }
}

/**
 * The video editor's cache: each video's thumbnail and filmstrip and each sound's scan, by media id.
 * @param video the editor
 * @param ids the media ids by file
 * @returns the cache
 */
function videoCache(video: VState, ids: ReadonlyMap<MediaFile, string>): ProjectCache {
  const cache: ProjectCache = { thumbs: {}, strips: {}, previews: {}, scans: {} };
  const scanned = (url: string, id: string): void => {
    const scan = url ? scanOf(url) : undefined;
    if (!scan) return;
    const saved = savedScans.get(scan) ?? encodeScan(scan);
    savedScans.set(scan, saved);
    cache.scans[id] = saved;
  };
  for (const clip of video.clips) {
    const id = ids.get(clip.file);
    if (!id || clip.kind !== 'video') continue;
    if (clip.thumb) cache.thumbs[id] = clip.thumb;
    if (clip.strip.length) cache.strips[id] = clip.strip;
    scanned(clip.url, id);
  }
  for (const sound of video.sounds) {
    const id = ids.get(sound.file);
    if (id) scanned(sound.url, id);
  }
  return cache;
}

/**
 * The photo editor's cache: each photo's preview, by media id.
 * @param batch the editor
 * @param ids the media ids by file
 * @returns the cache
 */
function photoCache(batch: IgState, ids: ReadonlyMap<MediaFile, string>): ProjectCache {
  const cache: ProjectCache = { thumbs: {}, strips: {}, previews: {}, scans: {} };
  for (const item of batch.items) {
    const id = ids.get(item.file);
    const text = id && !isMissing(item.file) ? previewText(item.preview) : null;
    if (id && text) cache.previews[id] = text;
  }
  return cache;
}

/** What a save writes: the document, its entry and its cache. */
interface Saving {
  doc: ProjectDoc | PhotoProjectDoc;
  entry: ProjectEntry;
  cache: ProjectCache;
}

/**
 * A studio's document, entry and cache, from its editor now.
 * @param studio the studio
 * @param project its open project
 * @returns what to write
 */
async function documentOf(studio: Studio, project: OpenProject): Promise<Saving> {
  const base = { id: project.id, studio, name: project.name, changed: Date.now(), bytes: 0, thumb: '', readable: true };
  if (studio === 'video') {
    const video = getVideo();
    const ids = await idsOf([...video.clips.map((clip) => clip.file), ...video.sounds.map((sound) => sound.file)]);
    const doc = videoDocument(video, project.name, (file) => ids.get(file) ?? '');
    const first = video.clips.at(0);
    const thumb = first ? first.thumb || (first.strip.at(0) ?? '') : '';
    return {
      doc,
      entry: { ...base, thumb, kind: video.kind, length: videoLength(video), photos: 0 },
      cache: videoCache(video, ids),
    };
  }
  const batch = getIg();
  const ids = await idsOf(batch.items.map((item) => item.file));
  const doc = photoDocument(batch, project.name, (file) => ids.get(file) ?? '');
  const cover = batch.items.at(0);
  const thumb = cover && !isMissing(cover.file) ? thumbText(cover.preview) : '';
  return {
    doc,
    entry: { ...base, thumb, kind: 'photo', length: 0, photos: batch.items.length },
    cache: photoCache(batch, ids),
  };
}

/** The video fields a saved document holds (the playhead and track heights only ride along). */
const VIDEO_FIELDS = [
  'kind',
  'tracks',
  'clips',
  'sounds',
  'layers',
  'loudness',
  'magnetic',
  'format',
  'fps',
  'quality',
  'fadeOut',
] as const;
/** The video fields saved with the next save, which don't call for one. */
const VIDEO_RIDERS = ['t', 'trackView'] as const;
/** The photo fields a saved document holds (the selected photo rides along). */
const PHOTO_FIELDS = ['items', 'format', 'limit', 'fileType', 'quality', 'caption'] as const;
const PHOTO_RIDERS = ['selected'] as const;

/**
 * Whether any of the fields changed (by reference: the stores replace what they change).
 * @param before the state before
 * @param after the state after
 * @param fields the fields
 * @returns true when one differs
 */
const changed = <S>(before: S, after: S, fields: readonly (keyof S)[]): boolean =>
  fields.some((field) => before[field] !== after[field]);

/* ------------------------------------------------------------------ the autosave */

/** The running autosave's own state. */
interface Session {
  deps: AutosaveDeps;
  projects: Map<Studio, OpenProject>;
  timers: Map<Studio, ReturnType<typeof setTimeout>>;
  retry: ReturnType<typeof setTimeout> | null;
  /** Saves run one after another. */
  chain: Promise<void>;
  warned: boolean;
  stopped: boolean;
}

/**
 * Warns once per session when projects take 90 % of the space allowed.
 * @param session the autosave
 */
async function warnIfNearlyFull(session: Session): Promise<void> {
  if (session.warned) return;
  const usage = await session.deps.library.usage();
  if (usage.allowed === null || usage.used < WARN_SHARE * usage.allowed) return;
  session.warned = true;
  session.deps.warn?.(
    `Projects use over 90 % of the space allowed here (${sizeText(usage.used)} of ${sizeText(usage.allowed)}). Delete projects you no longer need to keep saving.`,
  );
}

/**
 * Writes a project's document when it changed (or the last write failed).
 * @param session the autosave
 * @param project the project
 * @param saving what to write
 * @returns false when the write failed
 */
async function writeDocument(session: Session, project: OpenProject, saving: Saving): Promise<boolean> {
  const text = JSON.stringify(saving.doc);
  if (text === project.lastText && !project.failed) return true;
  setStatus({ state: 'saving' });
  try {
    await session.deps.library.write(project.id, saving.doc, saving.entry);
    project.lastText = text;
    project.failed = false;
  } catch (error) {
    project.dirty = true;
    project.failed = true;
    logError('handled', error);
    setStatus({ state: 'failed', reason: failureReason(error) });
    return false;
  }
  if (![...session.projects.values()].some((open) => open.failed)) setStatus({ state: 'saved' });
  await warnIfNearlyFull(session).catch((error: unknown) => {
    logError('handled', error);
  });
  return true;
}

/**
 * Writes a project's cache when it changed. A cache that can't be written is only logged: it is made again on opening.
 * @param session the autosave
 * @param project the project
 * @param cache the cache
 */
async function writeCache(session: Session, project: OpenProject, cache: ProjectCache): Promise<void> {
  const text = JSON.stringify(cache);
  if (text === project.lastCache) return;
  try {
    await session.deps.library.writeCache(project.id, cache);
    project.lastCache = text;
  } catch (error) {
    logError('handled', error);
  }
}

/**
 * Saves a studio's project when it has something unsaved: the document, then the cache.
 * @param session the autosave
 * @param studio the studio
 */
async function saveStudio(session: Session, studio: Studio): Promise<void> {
  const project = session.projects.get(studio);
  if (!project?.dirty) return;
  project.dirty = false;
  const saving = await documentOf(studio, project);
  if (await writeDocument(session, project, saving)) await writeCache(session, project, saving.cache);
}

/**
 * Saves the studios now, after any save under way; arms the retry while one fails.
 * @param session the autosave
 * @param studios the studios to save
 * @returns when they are written (or failed)
 */
function saveNow(session: Session, studios: readonly Studio[]): Promise<void> {
  for (const studio of studios) {
    clearTimeout(session.timers.get(studio));
    session.timers.delete(studio);
  }
  session.chain = session.chain
    .then(async () => {
      for (const studio of studios) await saveStudio(session, studio);
    })
    .catch((error: unknown) => {
      logError('handled', error);
    })
    .then(() => {
      armRetry(session);
    });
  return session.chain;
}

/**
 * Tries failed saves again every 30 s, until they work.
 * @param session the autosave
 */
function armRetry(session: Session): void {
  const failing = [...session.projects].filter(([, open]) => open.failed).map(([studio]) => studio);
  if (session.retry !== null || session.stopped || !failing.length) return;
  session.retry = setTimeout(() => {
    session.retry = null;
    void saveNow(session, failing);
  }, RETRY_DELAY);
}

/**
 * Notes a change in a studio: a document change saves 2 s after the last one; a rider waits for the next save.
 * @param session the autosave
 * @param studio the studio
 * @param soon whether the change calls for a save
 */
function noteChange(session: Session, studio: Studio, soon: boolean): void {
  const project = session.projects.get(studio);
  if (!project || session.stopped) return;
  project.dirty = true;
  if (!soon) return;
  clearTimeout(session.timers.get(studio));
  session.timers.set(
    studio,
    setTimeout(() => {
      void saveNow(session, [studio]);
    }, SAVE_DELAY),
  );
}

/**
 * Listens to both stores, telling changes that call for a save from those that ride along.
 * @param session the autosave
 * @returns the unsubscribe function
 */
function watchStores(session: Session): () => void {
  let video: VState = getVideo();
  let photos: IgState = getIg();
  const stopVideo = subscribeVideo(() => {
    const next = getVideo();
    if (changed(video, next, VIDEO_FIELDS)) noteChange(session, 'video', true);
    else if (changed(video, next, VIDEO_RIDERS)) noteChange(session, 'video', false);
    video = next;
  });
  const stopPhotos = subscribeIg(() => {
    const next = getIg();
    if (changed(photos, next, PHOTO_FIELDS)) noteChange(session, 'photo', true);
    else if (changed(photos, next, PHOTO_RIDERS)) noteChange(session, 'photo', false);
    photos = next;
  });
  // A sound scan finished: the cache has something new.
  let scans = scanSnapshot().scans;
  const stopScans = subscribeScans(() => {
    const next = scanSnapshot().scans;
    if (next !== scans) noteChange(session, 'video', true);
    scans = next;
  });
  return () => {
    stopVideo();
    stopPhotos();
    stopScans();
  };
}

/**
 * The page's own hide events: the tab hidden, the page left.
 * @param save called on either
 * @returns the unsubscribe function
 */
function pageHide(save: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') save();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', save);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', save);
  };
}

/**
 * Starts autosaving both studios (one autosave runs at a time: starting another stops the last).
 * @param deps the library, media store, hide events and warnings
 * @returns the autosave
 */
export function startAutosave(deps: AutosaveDeps): Autosave {
  active?.stop();
  const session: Session = {
    deps,
    projects: new Map(),
    timers: new Map(),
    retry: null,
    chain: Promise.resolve(),
    warned: false,
    stopped: false,
  };
  const flush = (): Promise<void> => (session.stopped ? session.chain : saveNow(session, ['video', 'photo']));
  const stopWatching = watchStores(session);
  const stopHide = (deps.onHide ?? pageHide)(() => {
    void flush();
  });
  const stopFlush = desktop?.projects?.onFlush?.(flush);
  const lock = deps.lock ?? projectLock(broadcastLock());
  // Opened in another tab or window: stop saving it here at once, and say so.
  const stopTaken = lock.onTaken((studio, id) => {
    clearTimeout(session.timers.get(studio));
    session.timers.delete(studio);
    session.projects.delete(studio);
    setStatus({ state: 'elsewhere', studio, id });
  });
  const autosave: Autosave = {
    open(studio, id, name, unsaved = false) {
      clearTimeout(session.timers.get(studio));
      session.timers.delete(studio);
      session.projects.set(studio, { id, name, dirty: unsaved, lastText: '', lastCache: EMPTY_CACHE, failed: false });
      lock.hold(studio, id);
      openedListeners.forEach((listener) => {
        listener(studio, id);
      });
    },
    close(studio) {
      clearTimeout(session.timers.get(studio));
      session.timers.delete(studio);
      session.projects.delete(studio);
      lock.release(studio);
    },
    current(studio) {
      const project = session.projects.get(studio);
      return project ? { id: project.id, name: project.name } : null;
    },
    rename(studio, name) {
      const project = session.projects.get(studio);
      if (!project) return;
      project.name = name;
      noteChange(session, studio, true);
    },
    flush,
    stop() {
      if (session.stopped) return;
      session.stopped = true;
      for (const timer of session.timers.values()) clearTimeout(timer);
      if (session.retry !== null) clearTimeout(session.retry);
      stopWatching();
      stopHide();
      stopFlush?.();
      stopTaken();
      lock.close();
      if (active?.deps === deps) active = null;
    },
  };
  active = { deps, stop: () => autosave.stop() };
  return autosave;
}
