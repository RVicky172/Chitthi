import { mediaName, type OpenedMedia } from '@/engine/mediaFile';
import { mediaKey } from '@/engine/mediaKey';
import { keptAlready, noRoomMessage, type MediaStore } from '@/lib/mediaStore';
import type { MediaUnderTest } from './mediaContract';

/*
 * The media store in memory (408 T040), for unit and integration tests. `copies` keeps a copy of every file, as the
 * browser does in OPFS; `references` keeps only app-made files and points at the user's own (a "disk" of them the
 * store never touches), as the desktop app does.
 */

/** One kept file. */
interface Kept {
  file: Blob;
  /** The store holds its own copy (counted in its bytes, freed by a sweep). */
  copy: boolean;
  /** References: the user's file moved or changed since. */
  lost: boolean;
}

/**
 * A media store in memory.
 * @param kind copies (the browser) or references (the desktop app)
 * @param room the bytes the store may take
 * @returns the store and the contract's view of it
 */
export function memoryMedia(kind: MediaUnderTest['kind'], room: number): { store: MediaStore; underTest: MediaUnderTest } {
  const kept = new Map<string, Kept>();
  /** The user's own files the store points at (references), as they are on disk. */
  const disk = new Set<Blob>();
  let nextPick: Blob | null = null;
  const ownBytes = (): number => [...kept.values()].reduce((sum, entry) => sum + (entry.copy ? entry.file.size : 0), 0);
  const opened = (id: string, entry: Kept): OpenedMedia => ({ file: entry.file, url: `memory:${id}` });
  const store: MediaStore = {
    async keep(file, owned, progress) {
      if (!(file instanceof Blob)) return keptAlready(file);
      const id = await mediaKey(file);
      if (!kept.has(id)) {
        const copy = kind === 'copies' || owned;
        const free = room - ownBytes();
        if (copy && file.size > free) return { error: noRoomMessage(mediaName(file, 'the file'), file.size, free) };
        for (const share of [0.25, 0.5, 0.75]) progress?.(share);
        if (copy) kept.set(id, { file: new Blob([await file.arrayBuffer()], { type: file.type }), copy, lost: false });
        else {
          disk.add(file);
          kept.set(id, { file, copy, lost: false });
        }
      }
      progress?.(1);
      return id;
    },
    open(id, name) {
      const entry = kept.get(id);
      return Promise.resolve(entry && !entry.lost ? opened(id, entry) : { missing: true, name });
    },
    relink(id) {
      const entry = kept.get(id);
      if (kind === 'copies' || !entry || !nextPick) return Promise.resolve(null);
      const found: Kept = { file: nextPick, copy: false, lost: false };
      disk.add(nextPick);
      kept.set(id, found);
      return Promise.resolve(opened(id, found));
    },
    sweep(used) {
      let freed = 0;
      for (const [id, entry] of kept)
        if (!used.has(id)) {
          if (entry.copy) freed += entry.file.size;
          kept.delete(id);
        }
      return Promise.resolve(freed);
    },
  };
  return {
    store,
    underTest: {
      store,
      kind,
      ownBytes,
      userFileIntact: (file) => kind === 'copies' || disk.has(file),
      lose: (id) => {
        const entry = kept.get(id);
        if (entry) entry.lost = true;
      },
      pickNext: (file) => {
        nextPick = file;
      },
    },
  };
}
