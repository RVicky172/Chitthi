import type { DiskMedia, MediaFile, OpenedMedia } from '../engine/mediaFile';

/*
 * The media store (408 §4): where a project's photo, video and sound files are kept, once each by media id
 * (engine/mediaKey.ts). In the browser every file is copied into the device's storage (OPFS, lib/mediaWeb.ts); in the
 * desktop app the user's own files are referenced where they are and never copied, moved or deleted, and only files
 * the app made (recordings, generated or downloaded media) are kept, in the data folder (lib/mediaDesktop.ts).
 */

/** Where media is kept. */
export interface MediaStore {
  /**
   * Keeps a file (once: the same file gives the same id, whichever project adds it). A file this store already gave
   * back (disk media) is kept already: its id.
   * @param file the file
   * @param owned the app made it, so nothing else has it (always kept, also on desktop)
   * @param progress told the share copied so far, 0–1
   * @returns its media id, or why it couldn't be kept (no room)
   */
  keep(file: MediaFile, owned: boolean, progress?: (share: number) => void): Promise<string | { error: string }>;
  /**
   * A kept file, to play and decode.
   * @param id the media id
   * @param name the file's name, for a missing file's placeholder
   * @param type its MIME type, given back on the file (OPFS keeps none), so the file keeps its media id
   * @returns the file and its URL, or that it is missing
   */
  open(id: string, name: string, type?: string): Promise<OpenedMedia>;
  /**
   * Desktop: asks the user where a missing file is now (Find file…; other missing files in the same folder reconnect
   * too, so open them again). The browser can't: null.
   * @param id the media id
   * @param name the file's name, given back on it
   * @param type its MIME type, given back on it
   * @returns the file found, or null when none was chosen (or the platform can't)
   */
  relink(id: string, name?: string, type?: string): Promise<OpenedMedia | null>;
  /**
   * Lets go of every kept file no project uses (a user's own files on desktop are only forgotten, never deleted).
   * @param used the media ids the projects still use
   * @returns the bytes freed
   */
  sweep(used: ReadonlySet<string>): Promise<number>;
}

const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * A size for people.
 * @param bytes the size
 * @returns e.g. "300 MB", "1.2 GB"
 */
export function sizeText(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit] ?? 'bytes'}`;
}

/**
 * Why a file can't be kept (AC-4).
 * @param name the file's name
 * @param needs its size, bytes
 * @param free the space left, bytes
 * @returns the message, with both sizes
 */
export const noRoomMessage = (name: string, needs: number, free: number): string =>
  `There isn’t room for “${name}”: it needs ${sizeText(needs)}, and ${sizeText(free)} is left on this device.`;

/**
 * A file a store gave back from disk is kept already (408 T042): its id; a missing one can't be kept again.
 * @param file the disk file
 * @returns its id, or why not
 */
export const keptAlready = (file: DiskMedia): string | { error: string } => (file.missing ? { error: `“${file.name}” is missing.` } : file.id);
