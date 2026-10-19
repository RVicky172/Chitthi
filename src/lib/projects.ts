import { isRecord } from '../engine/guards';
import type { PhotoProjectDoc } from '../engine/photoProjectDoc';
import type { ProjectDoc } from '../engine/projectDoc';
import type { SavedScan } from '../engine/soundScan';
import type { VKind } from '../engine/videoFormats';

/*
 * The project library (408 §3): where saved photo and video projects live — the browser's own database, or project
 * files in the desktop app's data folder. One interface, an implementation per platform; tests use an in-memory one
 * (tests/support/memoryProjects.ts). Documents come back unvalidated: the gates (mergeProject, mergePhotoProject) check
 * them. Media isn't kept here (lib/mediaStore.ts).
 */

/** Which studio a project belongs to. */
export type Studio = 'photo' | 'video';

/** A project as the Projects list shows it. */
export interface ProjectEntry {
  id: string;
  studio: Studio;
  /** 1–80 characters. */
  name: string;
  kind: VKind | 'photo';
  /** A video's length, seconds (0 for photos). */
  length: number;
  /** A photo batch's photo count (0 for videos). */
  photos: number;
  /** When it was last saved, ms since 1970. */
  changed: number;
  /** The space its document and cache take, as stored (the library counts it; media not included). */
  bytes: number;
  /** A small JPEG data URL, or ''. */
  thumb: string;
  /** False when its document can't be read: listed as can't be opened, with Delete only (AC-6). */
  readable: boolean;
}

/**
 * What's slow to rebuild and small, kept beside a project (Q14), by media id: an entry follows its file, and a changed
 * file (a new id) leaves its old entries unused.
 */
export interface ProjectCache {
  /** A video's thumbnail, a JPEG data URL. */
  thumbs: Record<string, string>;
  /** A video's filmstrip frames, JPEG data URLs. */
  strips: Record<string, string[]>;
  /** A batch photo's preview, a JPEG data URL. */
  previews: Record<string, string>;
  /** A sound's scan: the waveform's peaks and the RMS ducking reads. */
  scans: Record<string, SavedScan>;
}

/** How much the library holds, and how much the device allows. */
export interface LibraryUsage {
  /** Bytes the projects take (documents and caches). */
  used: number;
  /** Bytes allowed, when the platform says (the browser's quota); null otherwise. */
  allowed: number | null;
  /** Whether the browser keeps the storage when space runs low; null where it doesn't apply. */
  persisted: boolean | null;
}

/** Where projects are kept. */
export interface ProjectLibrary {
  /** Every project, newest first. */
  list(): Promise<ProjectEntry[]>;
  /** A project's document as stored, unvalidated; rejects when it is missing or can't be read. */
  read(id: string): Promise<unknown>;
  /** Saves a project: all or nothing (an interrupted write leaves the last complete save, AC-1). */
  write(id: string, doc: ProjectDoc | PhotoProjectDoc, entry: ProjectEntry): Promise<void>;
  /** A project's cache as stored, unvalidated; null when it has none. */
  readCache(id: string): Promise<unknown>;
  writeCache(id: string, cache: ProjectCache): Promise<void>;
  /** Deletes a project and its cache; resolves to the bytes freed (0 when there was none). */
  remove(id: string): Promise<number>;
  usage(): Promise<LibraryUsage>;
}

/** A project id: what the desktop app's handlers also accept, so it is safe as a file name. */
const PROJECT_ID = /^[A-Za-z0-9_-]{1,100}$/;
/** Names Windows keeps for devices (electron/projects.cjs refuses them too). */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Whether a value is a project id.
 * @param id the value
 * @returns true for an id
 */
export const isProjectId = (id: unknown): id is string => typeof id === 'string' && PROJECT_ID.test(id) && !RESERVED.test(id);

/**
 * Refuses what isn't a project id.
 * @param id the id
 * @returns the id
 * @throws "Not a project id" for anything else
 */
export function checkProjectId(id: string): string {
  if (!isProjectId(id)) throw new Error(`Not a project id: ${JSON.stringify(id).slice(0, 40)}`);
  return id;
}

/**
 * The bytes a value takes as stored text.
 * @param text the stored JSON
 * @returns its UTF-8 length
 */
export const storedBytes = (text: string): number => new TextEncoder().encode(text).length;

/**
 * Entries newest first.
 * @param entries the entries
 * @returns them sorted, a copy
 */
export const newestFirst = (entries: readonly ProjectEntry[]): ProjectEntry[] => [...entries].sort((first, second) => second.changed - first.changed);

/**
 * The entry of a record that can't be read: listed with Delete only (AC-6).
 * @param id the record's key
 * @returns the entry
 */
export const unreadable = (id: string): ProjectEntry => ({
  id,
  studio: 'video',
  name: 'Project that can’t be opened',
  kind: 'reel',
  length: 0,
  photos: 0,
  changed: 0,
  bytes: 0,
  thumb: '',
  readable: false,
});

/**
 * A stored entry, if it is one.
 * @param id its key
 * @param value the record
 * @returns the entry, or null when the record isn't one
 */
export function entryOf(id: string, value: unknown): ProjectEntry | null {
  if (!isRecord(value) || value.id !== id || typeof value.name !== 'string' || typeof value.changed !== 'number') return null;
  return value as unknown as ProjectEntry;
}
