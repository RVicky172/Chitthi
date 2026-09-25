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
  | 'theme';

export interface OpenedFile {
  name: string;
  text: string;
}

export interface DesktopBridge {
  info: { version: string; platform: string; localFonts: boolean };
  /** Shows a native save dialog; resolves to the saved path, or null if cancelled. */
  saveFile(name: string, data: ArrayBuffer): Promise<string | null>;
  showInFolder(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  openDesignFile(): Promise<OpenedFile | null>;
  onMenu(cb: (action: MenuAction) => void): () => void;
  onOpenFile(cb: (file: OpenedFile) => void): () => void;
  db: {
    all(): Promise<SavedDesign[]>;
    get(id: string): Promise<SavedDesign | undefined>;
    put(d: SavedDesign): Promise<unknown>;
    del(id: string): Promise<unknown>;
    getWorkPhotos(): Promise<PhotoMeta[]>;
    putWorkPhotos(photos: PhotoMeta[]): Promise<unknown>;
    libAll(): Promise<StoredPhoto[]>;
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
