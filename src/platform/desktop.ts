import type { PhotoMeta, SavedDesign, StoredPhoto } from '../types';

/*
 * The desktop (Electron) bridge from electron/preload.cjs. In a normal browser it's absent and every caller falls
 * back to the web behaviour, so one build of the app serves both.
 */
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
export interface AiWireResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ArrayBuffer | null;
  error?: string;
  kind?: 'key' | 'network';
}

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
  };
}

declare global {
  interface Window {
    chitthiDesktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.chitthiDesktop : undefined;
export const isDesktop = !!desktop;
