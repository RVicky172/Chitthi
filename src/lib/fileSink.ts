import { desktop } from '../platform/desktop';

/*
 * A file the video exporter can stream into, piece by piece at given positions, so a long video never has to fit in
 * memory. Desktop: a native save dialog, then writes through the main process. Chrome and Edge: the File System Access
 * API's save picker. Other browsers can't stream; callers fall back to building the file in memory.
 */

export interface PositionedChunk {
  type: 'write';
  data: Uint8Array;
  position: number;
}

export interface FileSink {
  writable: WritableStream<PositionedChunk>;
  /** The file's name (or full path on desktop). */
  name: string;
  /** Closes the file; keep = false deletes (desktop) or discards (browser) a partial file. Returns the saved name. */
  finish(keep: boolean): Promise<string | null>;
}

interface SaveFilePicker {
  showSaveFilePicker(o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }): Promise<{
    name: string;
    createWritable(): Promise<{ write(c: PositionedChunk): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
  }>;
}

export const canStreamToDisk = (): boolean => !!desktop || (typeof window !== 'undefined' && 'showSaveFilePicker' in window);

const copy = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/**
 * Asks where to save and opens the file. Must be called straight from a click (the browser picker needs it).
 * Resolves null if the user cancels.
 */
export async function openFileSink(suggestedName: string): Promise<FileSink | null> {
  if (desktop) {
    const f = await desktop.openWrite(suggestedName);
    if (!f) return null;
    let done = false;
    return {
      name: f.path,
      writable: new WritableStream<PositionedChunk>({ write: (c) => desktop!.writeAt(f.id, c.position, copy(c.data)) }),
      finish: async (keep) => {
        if (done) return keep ? f.path : null;
        done = true;
        return desktop!.closeWrite(f.id, keep);
      },
    };
  }
  const w = window as unknown as SaveFilePicker;
  let handle;
  try {
    handle = await w.showSaveFilePicker({ suggestedName, types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
  const fw = await handle.createWritable();
  let done = false;
  return {
    name: handle.name,
    writable: new WritableStream<PositionedChunk>({ write: (c) => fw.write({ type: 'write', position: c.position, data: c.data }) }),
    finish: async (keep) => {
      if (done) return keep ? handle.name : null;
      done = true;
      if (keep) await fw.close();
      else await fw.abort().catch(() => undefined);
      return keep ? handle.name : null;
    },
  };
}
