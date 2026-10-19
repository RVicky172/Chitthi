import type { SavedPreset } from '../engine/presets';
import type { PhotoMeta, SavedDesign, StoredPhoto } from '../types';

/*
 * The desktop (Electron) bridge from electron/preload.cjs. In a normal browser it's absent and every caller falls
 * back to the web behaviour, so one build of the app serves both.
 */

/** The native menu's commands (electron/main.cjs). */
export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'save-file'
  | 'export-pack'
  | 'backup'
  | 'restore'
  | 'undo'
  | 'redo'
  | 'home'
  | 'studio'
  | 'gallery'
  | '3d'
  | 'flip'
  | 'theme'
  | 'settings'
  | 'sizes'
  | 'paper'
  | 'instagram'
  | 'find'
  | 'perf';

/** An AI request sent through the main process, which attaches the key (electron/ai.cjs). */
export interface AiWireRequest {
  provider: string;
  url: string;
  base: string;
  noAuth: boolean;
  method: string;
  headers: Record<string, string>;
  json?: unknown;
  form?: [string, string | { data: ArrayBuffer; type: string; name: string }][];
}
/** The main process's answer to an AI request. */
export interface AiWireResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer | null;
  error?: string;
  kind?: 'key' | 'network';
}

/** A .chitthi file the user opened. */
export interface OpenedFile {
  name: string;
  text: string;
}

/** CPU and memory of every Chitthi process (electron app.getAppMetrics), for the performance monitor. */
export interface AppMetrics {
  cores: number;
  systemMemory: number;
  /** cpu: % of one core since the last call; mem: working set in bytes. */
  procs: { type: string; pid: number; cpu: number; mem: number }[];
}

/**
 * Saved projects in the data folder (electron/projects.cjs, 408 T050): JSON text both ways, so the main process never
 * holds the page's objects; ids are checked on both sides.
 */
export interface ProjectsBridge {
  /** Every project's entry as stored, with `bytes` and `readable` worked out by the main process (unvalidated). */
  list(): Promise<unknown[]>;
  /** A project's document text, or null when there is none. */
  read(id: string): Promise<string | null>;
  /** Saves the document and the entry together (to .tmp, then renamed: an interrupted write leaves the last one). */
  write(id: string, doc: string, entry: string): Promise<void>;
  readCache(id: string): Promise<string | null>;
  writeCache(id: string, cache: string): Promise<void>;
  /** Deletes the project's files; resolves to the bytes freed. */
  remove(id: string): Promise<number>;
  usage(): Promise<{ used: number }>;
  /**
   * Registers what saves the open project before the window closes (the autosave's flush; the window waits at most
   * 2 s). Returns a function that unregisters it.
   */
  onFlush?(save: () => Promise<void>): () => void;
}

/** How a kept file is now, by media id (electron/media.cjs). */
export interface MediaStatus {
  /** ok; missing (moved, deleted, never kept); changed (its size or modification time differs). */
  state: 'ok' | 'missing' | 'changed';
  /** Bytes. */
  size: number;
}

/**
 * Media in the data folder's index (electron/media.cjs, 408 T051): the page names files by media id only; paths stay in
 * the main process, which alone writes `library/media-index.json`.
 */
export interface MediaBridge {
  /** References a file the user picked or dropped where it is (its path through webUtils.getPathForFile); false when it has none (a file the app made). */
  register(id: string, file: File): Promise<boolean>;
  /** Writes a piece of an app-made file into `library/media/<id>` (a .part until it is finished). */
  writeOwned(id: string, position: number, data: ArrayBuffer): Promise<void>;
  /** Finishes an app-made file: kept, or (keep = false) its partial file removed. */
  finishOwned(id: string, keep: boolean): Promise<void>;
  status(ids: string[]): Promise<Record<string, MediaStatus>>;
  /** Free space on the data folder's disk, bytes. */
  freeSpace(): Promise<number>;
  /** Find file…: a dialog; the chosen file reconnects the id, and other missing files in its folder too (null: cancelled). */
  findFile(id: string): Promise<{ found: string[] } | null>;
  /** Forgets every id not in `used`, deleting only app-made files; resolves to the bytes freed. */
  sweep(used: string[]): Promise<number>;
}

/** What electron/preload.cjs exposes to the page. */
export interface DesktopBridge {
  info: { version: string; platform: string; localFonts: boolean };
  /** Shows a native save dialog; resolves to the saved path, or null if cancelled. */
  saveFile(name: string, data: ArrayBuffer): Promise<string | null>;
  /** Streaming save: a save dialog, then writes at byte positions; close(keep = false) deletes the partial file. */
  openWrite(name: string): Promise<{ id: number; path: string } | null>;
  writeAt(id: number, position: number, data: ArrayBuffer): Promise<void>;
  closeWrite(id: number, keep: boolean): Promise<string | null>;
  showInFolder(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  openDesignFile(): Promise<OpenedFile | null>;
  metrics?(): Promise<AppMetrics>;
  onMenu(cb: (action: MenuAction) => void): () => void;
  onOpenFile(cb: (file: OpenedFile) => void): () => void;
  /** AI requests and keys (electron/ai.cjs). Keys can be set, checked and deleted, never read back. */
  ai?: {
    keys(): Promise<Record<string, boolean>>;
    setKey(provider: string, key: string, base: string): Promise<void>;
    deleteKey(provider: string): Promise<void>;
    fetch(req: AiWireRequest): Promise<AiWireResponse>;
  };
  /** RAW photos (electron/raw.cjs): LibRaw develops the file's bytes to 16-bit linear RGB, sRGB primaries. */
  raw?: {
    available(): Promise<boolean>;
    develop(bytes: ArrayBuffer, name: string, opts?: { half?: boolean }): Promise<{ width: number; height: number; data: Uint16Array }>;
  };
  /** Agent (MCP) connection for the live app (electron/mcp.cjs). */
  agent?: {
    status(): Promise<{ on: boolean; url: string; token: string }>;
    setLive(on: boolean): Promise<{ on: boolean; url: string; token: string }>;
    onCall(cb: (call: { id: number; name: string; args: unknown }) => void): () => void;
    reply(id: number, result: unknown): void;
    /** Writes files an agent tool produced into the agent output folder; returns their paths. */
    writeFiles(files: { name: string; data: ArrayBuffer }[]): Promise<string[]>;
    readPhoto(path: string): Promise<{ name: string; data: ArrayBuffer; type: string }>;
  };
  /** Saved photo and video projects (408); missing in builds before it. */
  projects?: ProjectsBridge;
  /** The media of saved projects (408); missing in builds before it. */
  media?: MediaBridge;
  db: {
    all(): Promise<SavedDesign[]>;
    get(id: string): Promise<SavedDesign | undefined>;
    put(d: SavedDesign): Promise<unknown>;
    del(id: string): Promise<unknown>;
    getWorkPhotos(): Promise<PhotoMeta[]>;
    putWorkPhotos(photos: PhotoMeta[]): Promise<unknown>;
    /** Every stored photo without its full image (`url` is empty). */
    libAll(): Promise<StoredPhoto[]>;
    /** The full image of one stored photo. */
    libUrl(id: string): Promise<string>;
    libPut(p: StoredPhoto): Promise<unknown>;
    libDel(id: string): Promise<unknown>;
    /** Saved presets of the photo & video editors, as stored (unvalidated). */
    presetAll(): Promise<unknown[]>;
    presetPut(p: SavedPreset): Promise<unknown>;
    presetDel(id: string): Promise<unknown>;
  };
}

declare global {
  interface Window {
    chitthiDesktop?: DesktopBridge;
  }
}

/** The desktop bridge, or undefined in a browser. */
export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.chitthiDesktop : undefined;
/** Whether the app runs in the desktop app. */
export const isDesktop = !!desktop;
