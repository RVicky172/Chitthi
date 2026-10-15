import { desktop, type DesktopBridge } from '../platform/desktop';

/*
 * A file the video exporter can stream into, piece by piece at given positions, so a long video never has to fit in
 * memory. Desktop: a native save dialog, then writes through the main process. Chrome and Edge: the File System Access
 * API's save picker. Other browsers can't stream; callers fall back to building the file in memory.
 */

/** A piece of the file and where it goes. */
export interface PositionedChunk {
  type: 'write';
  data: Uint8Array;
  /** The byte offset in the file. */
  position: number;
}

/** An open file to stream into. */
export interface FileSink {
  writable: WritableStream<PositionedChunk>;
  /** The file's name (or full path on desktop). */
  name: string;
  /** Closes the file; keep = false deletes (desktop) or discards (browser) a partial file. Returns the saved name. */
  finish(keep: boolean): Promise<string | null>;
}

/** The writable file the browser's save picker opens. */
interface PickedWritable {
  write(chunk: PositionedChunk): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/** The File System Access API's save picker (Chrome and Edge). */
interface SaveFilePicker {
  showSaveFilePicker(options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<{
    name: string;
    createWritable(): Promise<PickedWritable>;
  }>;
}

/**
 * Whether this browser has the save picker.
 * @param scope the window
 * @returns true in Chrome and Edge
 */
const hasSavePicker = (scope: Window): scope is Window & SaveFilePicker => 'showSaveFilePicker' in scope;

/**
 * Whether a video can be streamed to a file here.
 * @returns true in the desktop app and in browsers with the save picker
 */
export const canStreamToDisk = (): boolean => !!desktop || (typeof window !== 'undefined' && hasSavePicker(window));

/**
 * A chunk's bytes in an ArrayBuffer of their own, to send to the main process.
 * @param bytes the chunk's bytes (possibly a view into a larger buffer)
 * @returns a copy
 */
const copyOf = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

/**
 * A file chosen in the desktop app's save dialog.
 * @param api the desktop bridge
 * @param suggestedName the file name offered
 * @returns the open file, or null if the user cancels
 */
async function openDesktopSink(api: DesktopBridge, suggestedName: string): Promise<FileSink | null> {
  const file = await api.openWrite(suggestedName);
  if (!file) return null;
  let isFinished = false;
  return {
    name: file.path,
    writable: new WritableStream<PositionedChunk>({ write: (chunk) => api.writeAt(file.id, chunk.position, copyOf(chunk.data)) }),
    finish: async (keep) => {
      if (isFinished) return keep ? file.path : null;
      isFinished = true;
      return api.closeWrite(file.id, keep);
    },
  };
}

/**
 * A file chosen in the browser's save picker.
 * @param picker the window, with the save picker
 * @param suggestedName the file name offered
 * @returns the open file, or null if the user cancels
 */
async function openPickedSink(picker: SaveFilePicker, suggestedName: string): Promise<FileSink | null> {
  let handle;
  try {
    handle = await picker.showSaveFilePicker({ suggestedName, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
  const { name } = handle;
  const fileWritable = await handle.createWritable();
  let isFinished = false;
  return {
    name,
    writable: new WritableStream<PositionedChunk>({ write: (chunk) => fileWritable.write({ type: 'write', position: chunk.position, data: chunk.data }) }),
    finish: async (keep) => {
      if (isFinished) return keep ? name : null;
      isFinished = true;
      if (keep) await fileWritable.close();
      else await fileWritable.abort().catch(() => undefined);
      return keep ? name : null;
    },
  };
}

/**
 * Asks where to save and opens the file. Must be called straight from a click (the browser picker needs it).
 * @param suggestedName the file name offered
 * @returns the open file, or null if the user cancels
 * @throws when this browser has no save picker (check canStreamToDisk() first)
 */
export async function openFileSink(suggestedName: string): Promise<FileSink | null> {
  if (desktop) return openDesktopSink(desktop, suggestedName);
  if (!hasSavePicker(window)) throw new TypeError('This browser can’t save a file while it is written.');
  return openPickedSink(window, suggestedName);
}
