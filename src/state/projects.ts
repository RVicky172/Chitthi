import { blobOf, isMissing, missingMedia, type DiskMedia, type MediaFile } from '../engine/mediaFile';
import { missingPicture } from '../engine/missingDraw';
import { mergePhotoProject, photoFromDocument, type PhotoProjectDoc } from '../engine/photoProjectDoc';
import { videoFromDocument, type DocMedia, type ProjectDoc } from '../engine/projectDoc';
import { mergeProject } from '../engine/projectGate';
import { loadImage } from '../engine/photo';
import { decodeScan, encodeScan } from '../engine/soundScan';
import { LOUDNESS_PRESETS } from '../engine/loudnessTargets';
import { formatsFor, type VKind } from '../engine/videoFormats';
import { isRecord } from '../engine/guards';
import { logError } from '../lib/errors';
import type { MediaStore } from '../lib/mediaStore';
import type { ProjectCache, ProjectEntry, ProjectLibrary, Studio } from '../lib/projects';
import { toast } from '../lib/toast';
import { isDesktop } from '../platform/desktop';
import { getIg, loadPhotoBatch, setIgState, type IgItem } from './instagram';
import { previewOf } from './instagramMedia';
import { addScan, clearScans, scanMedia } from './soundScan';
import { editorMediaIds, rememberMedia, startAutosave, type Autosave } from './projectSave';
import { mediaIO } from './videoMedia';
import { getVideo, loadVideoProject, setVideo, type VClip, type VSound } from './videoStore';

/*
 * Saved projects for the photo and video studios (408 §7, AC-3, AC-7): new, open, rename, duplicate and delete, the
 * open project per studio (the autosave writes it) and the last one used, reopened with the studio. Opening goes
 * through the gates (mergeProject, mergePhotoProject), opens each file from the media store (a file that isn't there
 * any more is a placeholder, D4) and starts the editor with no history; the route follows the project's kind (D6).
 */

/** What projects work with: injected so tests use in-memory stores. */
export interface ProjectsDeps {
  library: ProjectLibrary;
  media: MediaStore;
  autosave: Autosave;
  /** The desktop app (the gates' limits). */
  desktop: boolean;
  /** Where the last project per studio is remembered. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Shows a route (the studio and mode a project opens in). */
  navigate: (hash: string) => void;
}

/** What opening a project says: what the gate dropped or changed, for the user; or why it can't be opened. */
export type OpenResult = { studio: Studio; dropped: string[] } | { error: string };

/** The key of the last project per studio in localStorage. */
export const LAST_KEY = 'chitthi-projects-last';
/** The longest project name. */
export const NAME_MAX = 80;
/** The routes a project opens in (components/studio/Shell.tsx MODES). */
export const ROUTES = { photo: '#/instagram', reel: '#/instagram/video', vlog: '#/instagram/youtube' } as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const LABELS = { reel: 'Reel', vlog: 'YouTube', photo: 'Photos' } as const;

/**
 * How reopened files get their pictures back (tests put stand-ins here: Node decodes no media).
 * `look`: a photo clip's thumbnail and still; `strip`: a video clip's filmstrip, in the background; `preview`: a batch
 * photo's preview. A missing file gets a placeholder.
 */
export const openIO = {
  /**
   * A photo clip’s thumbnail and still, made again from its file.
   * @param name the file’s name
   * @param file the file
   * @returns the thumbnail, its filmstrip and the still
   */
  async look(name: string, file: MediaFile): Promise<Pick<VClip, 'thumb' | 'strip' | 'still'>> {
    if (isMissing(file)) return { thumb: '', strip: [], still: missingPicture(name) };
    const clip = await mediaIO.photo(name, await blobOf(file));
    URL.revokeObjectURL(clip.url);
    return { thumb: clip.thumb, strip: clip.strip, still: clip.still };
  },
  /**
   * Fills a video clip’s filmstrip in the background.
   * @param id the clip
   * @param url its URL
   * @param seconds its source’s length
   */
  strip: (id: string, url: string, seconds: number): void => {
    void mediaIO.strip(id, url, seconds);
  },
  /**
   * A batch photo’s preview, made again from its file.
   * @param name the file’s name
   * @param file the file
   * @param raw it is a camera RAW
   * @returns the preview
   */
  async preview(name: string, file: MediaFile, raw: boolean): Promise<HTMLCanvasElement> {
    return isMissing(file) ? missingPicture(name) : previewOf(name, await blobOf(file), raw);
  },
  /**
   * A batch photo’s preview from the JPEG the cache kept.
   * @param data the data URL
   * @returns the preview
   */
  async previewFromData(data: string): Promise<HTMLCanvasElement> {
    const image = await loadImage(data);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    return canvas;
  },
};

let configured: ProjectsDeps | null = null;
let starting: Promise<ProjectsDeps> | null = null;

/**
 * Sets what projects work with (tests; the app's are made by `ensureProjects`).
 * @param deps the library, media store, autosave, storage and navigation
 */
export function configureProjects(deps: ProjectsDeps | null): void {
  configured = deps;
  starting = null;
}

/**
 * The device's library, media store and a running autosave, made once (loaded on demand: none of it is in the entry).
 * @returns what projects work with
 */
export function ensureProjects(): Promise<ProjectsDeps> {
  if (configured) return Promise.resolve(configured);
  starting ??= Promise.all([import('../lib/projectLibrary'), import('../lib/mediaLibrary')]).then(([{ projects }, { media }]) => {
    let storage: Storage | null = null;
    try {
      storage = localStorage;
    } catch {
      /* storage blocked: the last project isn't remembered */
    }
    const navigate = (hash: string): void => {
      if (location.hash !== hash) location.hash = hash;
    };
    configured = { library: projects, media, autosave: startAutosave({ library: projects, media, warn: toast }), desktop: isDesktop, storage, navigate };
    return configured;
  });
  return starting;
}

/**
 * A new project's id.
 * @returns the id: a letter, the time and a random part (a safe file name)
 */
const newProjectId = (): string => `p${Date.now().toString(36)}${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;

/**
 * A new project's name: its kind and the time, “Reel · 19 Oct 14:02”.
 * @param kind the video's kind, or photo
 * @param at the time
 * @returns the name
 */
export function projectName(kind: VKind | 'photo', at: Date = new Date()): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${LABELS[kind]} · ${at.getDate()} ${MONTHS[at.getMonth()] ?? ''} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/**
 * A name as typed, checked.
 * @param name the name
 * @returns the name trimmed, or why not
 */
function checkedName(name: string): string | { error: string } {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX ? trimmed : { error: `A project’s name has 1 to ${NAME_MAX} characters.` };
}

/**
 * The route a project opens in.
 * @param studio its studio
 * @param kind a video's kind
 * @returns the hash
 */
const routeOf = (studio: Studio, kind: VKind): string => (studio === 'photo' ? ROUTES.photo : ROUTES[kind]);

/* ------------------------------------------------------------------ the last project per studio */

/**
 * The last project used, per studio.
 * @param deps the storage
 * @returns the ids
 */
function lastProjects(deps: ProjectsDeps): Partial<Record<Studio, string>> {
  try {
    const value: unknown = JSON.parse(deps.storage?.getItem(LAST_KEY) ?? '{}');
    return isRecord(value) ? { ...(typeof value.photo === 'string' ? { photo: value.photo } : {}), ...(typeof value.video === 'string' ? { video: value.video } : {}) } : {};
  } catch {
    return {};
  }
}

/**
 * Remembers (or forgets) the last project of a studio.
 * @param deps the storage
 * @param studio the studio
 * @param id the project, or null to forget it
 */
function rememberLast(deps: ProjectsDeps, studio: Studio, id: string | null): void {
  const last = Object.fromEntries(Object.entries({ ...lastProjects(deps), [studio]: id }).filter(([, value]) => value));
  try {
    deps.storage?.setItem(LAST_KEY, JSON.stringify(last));
  } catch {
    /* storage full or blocked: not remembered */
  }
}

/* ------------------------------------------------------------------ opening */

/** A reopened file and the URL to play it from ('' when it is missing). */
interface Opened {
  file: MediaFile;
  url: string;
}

/**
 * Opens a document's files from the media store; a file that isn't there is a placeholder that keeps its id.
 * @param deps the media store
 * @param entries the document's media
 * @returns the files by media id
 */
async function openMedia(deps: ProjectsDeps, entries: readonly DocMedia[]): Promise<Map<string, Opened>> {
  const opened = await Promise.all(
    entries.map(async (entry): Promise<[string, Opened]> => {
      const found = await deps.media.open(entry.id, entry.name, entry.type).catch(() => ({ missing: true as const, name: entry.name }));
      if ('missing' in found) return [entry.id, { file: missingMedia(entry), url: '' }];
      rememberMedia(found.file, entry.id);
      return [entry.id, found];
    }),
  );
  return new Map(opened);
}

/**
 * A cache as stored, checked: what isn't the right shape is left out (and made again).
 * @param raw what the library returned
 * @returns the cache
 */
export function cacheFrom(raw: unknown): ProjectCache {
  const cache: ProjectCache = { thumbs: {}, strips: {}, previews: {}, scans: {} };
  if (!isRecord(raw)) return cache;
  const each = (field: string, keep: (id: string, value: unknown) => void): void => {
    const value = raw[field];
    if (isRecord(value)) for (const [id, entry] of Object.entries(value)) keep(id, entry);
  };
  each('thumbs', (id, value) => {
    if (typeof value === 'string') cache.thumbs[id] = value;
  });
  each('strips', (id, value) => {
    if (Array.isArray(value) && value.every((frame) => typeof frame === 'string')) cache.strips[id] = value;
  });
  each('previews', (id, value) => {
    if (typeof value === 'string') cache.previews[id] = value;
  });
  each('scans', (id, value) => {
    const scan = decodeScan(value);
    if (scan) cache.scans[id] = encodeScan(scan);
  });
  return cache;
}

/** A reopened file, the URL to play it from and its media id. */
interface Reopened extends Opened {
  id: string;
}

/**
 * Puts back the sound scans the cache kept and scans the rest in the background (waveforms and ducking read them).
 * @param cache the project's cache
 * @param sounding every file with sound, by URL
 */
function restoreScans(cache: ProjectCache, sounding: ReadonlyMap<string, Reopened>): void {
  clearScans();
  for (const [url, { file, id }] of sounding) {
    if (!url || isMissing(file)) continue;
    const scan = decodeScan(cache.scans[id]);
    if (scan) addScan(url, scan);
    else scanMedia(url, file);
  }
}

/**
 * Puts a video document in the editor: thumbnails, filmstrips and scans from the cache, the rest made again in the
 * background.
 * @param deps the media store
 * @param doc the document, after the gate
 * @param cache the project's cache
 */
async function openVideo(deps: ProjectsDeps, doc: ProjectDoc, cache: ProjectCache): Promise<void> {
  const files = await openMedia(deps, doc.media);
  const byFile = new Map([...files].map(([id, opened]): [MediaFile, Reopened] => [opened.file, { ...opened, id }]));
  const { video } = videoFromDocument(doc, (entry) => files.get(entry.id)?.file ?? missingMedia(entry));
  const clips = await Promise.all(
    video.clips.map(async (clip): Promise<VClip> => {
      const { url = '', id = '' } = byFile.get(clip.file) ?? {};
      if (clip.kind === 'photo') return { ...clip, url, ...(await openIO.look(clip.name, clip.file)) };
      const strip = cache.strips[id] ?? [];
      return { ...clip, url, thumb: cache.thumbs[id] ?? strip[0] ?? '', strip, still: null };
    }),
  );
  const sounds = video.sounds.map((sound): VSound => ({ ...sound, url: byFile.get(sound.file)?.url ?? '' }));
  const { kind, format, fps, quality, fadeOut, tracks, layers, magnetic, loudness, t } = video;
  const trackView = Object.fromEntries(Object.entries(video.trackView).flatMap(([track, height]) => (height ? [[track, height] as const] : [])));
  loadVideoProject({ clips, sounds, kind, format, fps, quality, fadeOut, tracks, layers, magnetic, loudness, t, trackView });
  const sounding = new Map<string, Reopened>();
  for (const item of [...clips.filter((clip) => clip.kind === 'video'), ...sounds]) {
    const reopened = byFile.get(item.file);
    if (reopened) sounding.set(item.url, reopened);
  }
  restoreScans(cache, sounding);
  for (const clip of clips) if (clip.kind === 'video' && clip.url && !clip.strip.length) openIO.strip(clip.id, clip.url, clip.srcDur);
}

/**
 * Puts a photo document in the editor, each photo's preview from the cache, else made again from its file.
 * @param deps the media store
 * @param doc the document, after the gate
 * @param cache the project's cache
 */
async function openPhotos(deps: ProjectsDeps, doc: PhotoProjectDoc, cache: ProjectCache): Promise<void> {
  const files = await openMedia(deps, doc.media);
  const ids = new Map([...files].map(([id, opened]) => [opened.file, id]));
  const { batch } = photoFromDocument(doc, (entry) => files.get(entry.id)?.file ?? missingMedia(entry));
  const previewOf = async (item: (typeof batch.items)[number]): Promise<HTMLCanvasElement> => {
    const saved = isMissing(item.file) ? undefined : cache.previews[ids.get(item.file) ?? ''];
    const fromFile = (): Promise<HTMLCanvasElement> => openIO.preview(item.name, item.file, item.raw === true);
    return saved ? openIO.previewFromData(saved).catch(fromFile) : fromFile();
  };
  const items = await Promise.all(batch.items.map(async (item): Promise<IgItem> => ({ ...item, preview: await previewOf(item) })));
  loadPhotoBatch({ ...batch, items });
}

/**
 * A project's entry, if it is listed.
 * @param deps the library
 * @param id the project
 * @returns the entry, or null
 */
const entryOf = async (deps: ProjectsDeps, id: string): Promise<ProjectEntry | null> => (await deps.library.list()).find((entry) => entry.id === id) ?? null;

/**
 * A project's document through its gate.
 * @param deps the library and the platform
 * @param entry the project
 * @returns the gated document and what was dropped
 */
async function gatedDocument(deps: ProjectsDeps, entry: ProjectEntry): Promise<{ doc: ProjectDoc | PhotoProjectDoc; dropped: string[] }> {
  const raw = await deps.library.read(entry.id);
  return entry.studio === 'video' ? mergeProject(raw, deps.desktop) : mergePhotoProject(raw, deps.desktop);
}

/**
 * Opens a saved project in its studio (saving the one open there first); the route follows its kind.
 * @param id the project
 * @returns what the gate dropped, or why it can't be opened
 */
export async function openProject(id: string): Promise<OpenResult> {
  const deps = await ensureProjects();
  const entry = await entryOf(deps, id);
  if (!entry?.readable) return { error: 'This project can’t be opened.' };
  let opened: { doc: ProjectDoc | PhotoProjectDoc; dropped: string[] };
  try {
    opened = await gatedDocument(deps, entry);
  } catch {
    return { error: 'This project can’t be opened.' };
  }
  await deps.autosave.flush();
  deps.autosave.close(entry.studio);
  const { doc, dropped } = opened;
  const cache = cacheFrom(await deps.library.readCache(id).catch(() => null));
  if (entry.studio === 'video') await openVideo(deps, doc as ProjectDoc, cache);
  else await openPhotos(deps, doc as PhotoProjectDoc, cache);
  deps.autosave.open(entry.studio, id, doc.name ?? entry.name);
  rememberLast(deps, entry.studio, id);
  deps.navigate(routeOf(entry.studio, entry.studio === 'video' ? (doc as ProjectDoc).kind : 'reel'));
  return { studio: entry.studio, dropped };
}

/* ------------------------------------------------------------------ new, rename, duplicate, delete */

/**
 * Starts a new, empty project in a studio (saving the one open there first), named after its kind and the time, and
 * saves it at once so it is listed.
 * @param studio the studio
 * @param kind a video's kind (Reel or YouTube)
 * @returns the new project's id
 */
export async function newProject(studio: Studio, kind: VKind = 'reel'): Promise<string> {
  const deps = await ensureProjects();
  await deps.autosave.flush();
  deps.autosave.close(studio);
  if (studio === 'video') {
    clearScans();
    const format = formatsFor(kind).at(0)?.id;
    loadVideoProject({ clips: [], kind, ...(format ? { format } : {}), fps: 30, quality: 'standard', fadeOut: true, loudness: LOUDNESS_PRESETS.youtube, trackView: {} });
  } else {
    const { format, limit, fileType, quality } = getIg();
    loadPhotoBatch({ items: [], format, limit, fileType, quality, caption: '', selected: null });
  }
  const id = newProjectId();
  deps.autosave.open(studio, id, projectName(studio === 'video' ? kind : 'photo'), true);
  await deps.autosave.flush();
  rememberLast(deps, studio, id);
  deps.navigate(routeOf(studio, kind));
  return id;
}

/**
 * Opens a studio's project: the one open already, else the last one used, else a new one (the first visit).
 * @param studio the studio
 * @param kind a new video's kind
 * @returns the project's id
 */
export async function startStudio(studio: Studio, kind: VKind = 'reel'): Promise<string> {
  const deps = await ensureProjects();
  const open = deps.autosave.current(studio);
  if (open) return open.id;
  const last = lastProjects(deps)[studio];
  if (last && !('error' in (await openProject(last)))) return last;
  return newProject(studio, kind);
}

/**
 * Opens a studio's project when the studio is shown (`startStudio`); a library that can't be opened (storage blocked)
 * is said and logged: the editor still works, unsaved.
 * @param studio the studio
 * @param kind a new video's kind
 */
export function showStudio(studio: Studio, kind: VKind = 'reel'): void {
  startStudio(studio, kind).catch((error: unknown) => {
    logError('handled', error);
    toast('Projects can’t be saved here: this browser’s storage isn’t available.');
  });
}

/**
 * Every project of a studio (or all), newest first.
 * @param studio the studio, or every project
 * @returns the entries
 */
export async function listProjects(studio?: Studio): Promise<ProjectEntry[]> {
  const deps = await ensureProjects();
  const entries = await deps.library.list();
  return studio ? entries.filter((entry) => entry.studio === studio || !entry.readable) : entries;
}

/**
 * Renames a project (1–80 characters).
 * @param id the project
 * @param name the new name
 * @returns null once renamed, else why not
 */
export async function renameProject(id: string, name: string): Promise<string | null> {
  const deps = await ensureProjects();
  const checked = checkedName(name);
  if (typeof checked !== 'string') return checked.error;
  const entry = await entryOf(deps, id);
  if (!entry?.readable) return 'This project can’t be opened.';
  if (deps.autosave.current(entry.studio)?.id === id) {
    deps.autosave.rename(entry.studio, checked);
    await deps.autosave.flush();
    return null;
  }
  const { doc } = await gatedDocument(deps, entry);
  await deps.library.write(id, { ...doc, name: checked }, { ...entry, name: checked });
  return null;
}

/**
 * Copies a project: its document and cache under a new id, named “<name> copy”; the media is shared, not copied.
 * @param id the project
 * @returns the copy's id, or why not
 */
export async function duplicateProject(id: string): Promise<string | { error: string }> {
  const deps = await ensureProjects();
  await deps.autosave.flush();
  const entry = await entryOf(deps, id);
  if (!entry?.readable) return { error: 'This project can’t be opened.' };
  const { doc } = await gatedDocument(deps, entry);
  const copy = newProjectId();
  const name = `${(doc.name ?? entry.name).slice(0, NAME_MAX - 5)} copy`;
  await deps.library.write(copy, { ...doc, name }, { ...entry, id: copy, name, changed: Date.now() });
  const cache = await deps.library.readCache(id).catch(() => null);
  if (isRecord(cache)) await deps.library.writeCache(copy, cache as never);
  return copy;
}

/**
 * Every saved project's media: id → size, by project; null when a project can't be read (its media unknown).
 * @param deps the library
 * @returns the media by project, or null
 */
async function savedMedia(deps: ProjectsDeps): Promise<Map<string, Map<string, number>> | null> {
  const byProject = new Map<string, Map<string, number>>();
  for (const entry of await deps.library.list()) {
    if (!entry.readable) return null;
    const raw: unknown = await deps.library.read(entry.id).catch(() => null);
    if (!isRecord(raw) || !Array.isArray(raw.media)) return null;
    const sizes = new Map<string, number>();
    for (const media of raw.media) if (isRecord(media) && typeof media.id === 'string') sizes.set(media.id, typeof media.size === 'number' ? media.size : 0);
    byProject.set(entry.id, sizes);
  }
  return byProject;
}

/**
 * The media ids every saved project and the open editors use; null when a project can't be read (its media unknown).
 * @param deps the library
 * @returns the ids, or null
 */
async function mediaInUse(deps: ProjectsDeps): Promise<Set<string> | null> {
  const saved = await savedMedia(deps);
  if (!saved) return null;
  const used = await editorMediaIds();
  for (const sizes of saved.values()) for (const id of sizes.keys()) used.add(id);
  return used;
}

/**
 * The space deleting a project would free, to show before asking (AC-7): its document and cache, and in the browser
 * the copies of media no other project (or open editor) uses. The desktop app never deletes the user's own files.
 * @param id the project
 * @returns bytes
 */
export async function spaceFreed(id: string): Promise<number> {
  const deps = await ensureProjects();
  const entry = await entryOf(deps, id);
  if (!entry) return 0;
  const saved = deps.desktop ? null : await savedMedia(deps);
  const own = saved?.get(id);
  if (!saved || !own) return entry.bytes;
  const open = deps.autosave.current(entry.studio)?.id === id ? new Set<string>() : await editorMediaIds();
  let bytes = entry.bytes;
  for (const [media, size] of own) if (!open.has(media) && ![...saved].some(([other, sizes]) => other !== id && sizes.has(media))) bytes += size;
  return bytes;
}

/** The space projects take on this device, and what the platform allows. */
export interface ProjectsUsage {
  /** Bytes: documents and caches, and in the browser each media copy once. */
  used: number;
  /** Bytes the browser allows this site; null where it doesn't say (the desktop app). */
  allowed: number | null;
  /** Whether the browser keeps the storage when space runs low; null where it doesn't apply. */
  persisted: boolean | null;
}

/**
 * The space projects take, for the Projects list (AC-9).
 * @returns the usage
 */
export async function projectsUsage(): Promise<ProjectsUsage> {
  const deps = await ensureProjects();
  const library = await deps.library.usage();
  const saved = deps.desktop ? null : await savedMedia(deps);
  const media = new Map<string, number>();
  for (const sizes of saved?.values() ?? []) for (const [id, size] of sizes) media.set(id, size);
  const mediaBytes = [...media.values()].reduce((sum, size) => sum + size, 0);
  return { used: library.used + mediaBytes, allowed: library.allowed, persisted: library.persisted };
}

/**
 * Asks the browser to keep this site's storage when space runs low (from a click: Firefox asks the user).
 * @returns whether it will
 */
export async function askToKeepStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) return false;
  return navigator.storage.persist().catch(() => false);
}

/**
 * Deletes a project and the stored media no other project uses (AC-7: on desktop only the app's own files, never the
 * user's). Deleting the open project starts a new one in its studio. While a project can't be read, its media can't
 * be told apart, so nothing is swept.
 * @param id the project
 * @returns the bytes freed
 */
export async function deleteProject(id: string): Promise<number> {
  const deps = await ensureProjects();
  const entry = await entryOf(deps, id);
  if (entry && deps.autosave.current(entry.studio)?.id === id) {
    const kind = entry.kind === 'photo' ? 'reel' : entry.kind;
    await newProject(entry.studio, kind);
  }
  let freed = await deps.library.remove(id);
  if (entry && lastProjects(deps)[entry.studio] === id) rememberLast(deps, entry.studio, null);
  const used = await mediaInUse(deps);
  if (used) freed += await deps.media.sweep(used);
  return freed;
}

/* ------------------------------------------------------------------ Find file…, Continue */

/**
 * The files the editors show as missing, by media id.
 * @returns the placeholders
 */
function missingFiles(): Map<string, DiskMedia> {
  const missing = new Map<string, DiskMedia>();
  const video = getVideo();
  for (const file of [...video.clips.map((clip) => clip.file), ...video.sounds.map((sound) => sound.file), ...getIg().items.map((item) => item.file)]) {
    if (!(file instanceof Blob) && file.missing) missing.set(file.id, file);
  }
  return missing;
}

/**
 * Puts files found again in place of their placeholders, wherever the editors use them (not an undo step): pictures,
 * filmstrips, scans and previews made again.
 * @param found the files found, by media id
 */
async function replaceMissing(found: ReadonlyMap<string, Opened>): Promise<void> {
  const foundFor = (file: MediaFile): Opened | undefined => (file instanceof Blob || !file.missing ? undefined : found.get(file.id));
  for (const [id, opened] of found) rememberMedia(opened.file, id);
  const video = getVideo();
  const clips = await Promise.all(
    video.clips.map(async (clip): Promise<VClip> => {
      const opened = foundFor(clip.file);
      if (!opened) return clip;
      const look = clip.kind === 'photo' ? await openIO.look(clip.name, opened.file) : {};
      return { ...clip, ...look, file: opened.file, url: opened.url };
    }),
  );
  const sounds = video.sounds.map((sound): VSound => {
    const opened = foundFor(sound.file);
    return opened ? { ...sound, file: opened.file, url: opened.url } : sound;
  });
  const items = await Promise.all(
    getIg().items.map(async (item): Promise<IgItem> => {
      const opened = foundFor(item.file);
      return opened ? { ...item, file: opened.file, preview: await openIO.preview(item.name, opened.file, item.raw === true) } : item;
    }),
  );
  setVideo({ clips, sounds });
  setIgState({ items });
  for (const clip of clips) if (clip.kind === 'video' && found.has(mediaIdOf(clip.file))) openIO.strip(clip.id, clip.url, clip.srcDur);
  for (const item of [...clips.filter((clip) => clip.kind === 'video'), ...sounds]) if (found.has(mediaIdOf(item.file))) scanMedia(item.url, item.file);
}

/**
 * The media id a reopened file carries ('' for a picked one).
 * @param file the file
 * @returns its id
 */
const mediaIdOf = (file: MediaFile): string => (file instanceof Blob ? '' : file.id);

/**
 * Find file… (desktop, AC-5): asks where a missing file is now; it and every other missing file that came back with
 * it (the desktop app reconnects the chosen folder's files) replace their placeholders.
 * @param id the missing file's media id
 * @returns the media ids found again; null when nothing was chosen (or the platform can't)
 */
export async function findMissing(id: string): Promise<string[] | null> {
  const deps = await ensureProjects();
  const missing = missingFiles();
  const target = missing.get(id);
  if (!target) return [];
  const found = await deps.media.relink(id, target.name, target.type);
  if (!found || 'missing' in found) return null;
  const reopened = new Map<string, Opened>([[id, found]]);
  for (const [other, file] of missing) {
    if (other === id) continue;
    const again = await deps.media.open(other, file.name, file.type).catch(() => null);
    if (again && !('missing' in again)) reopened.set(other, again);
  }
  await replaceMissing(reopened);
  return [...reopened.keys()];
}

/**
 * The most recent project that can be opened, for the home screen's Continue.
 * @returns its entry, or null
 */
export async function recentProject(): Promise<ProjectEntry | null> {
  return (await listProjects()).find((entry) => entry.readable) ?? null;
}
