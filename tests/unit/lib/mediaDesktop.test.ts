import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopMedia, MEDIA_SCHEME, OWNED_PIECE } from '@/lib/mediaDesktop';
import type { MediaBridge, MediaStatus } from '@/platform/desktop';
import { mediaContract, testFile } from '../../support/mediaContract';

/*
 * 408 T042 (AC-5, AC-7): the desktop app's media store over the bridge. The fake main process does what
 * electron/media.cjs will (T051): user files referenced by path (a File from disk has one; a made-up Blob has none),
 * app-made files written in pieces into the data folder, status by id, Find file…, sweep deleting only app-made files,
 * and chitthi-media:// answering for indexed files (fetch stubbed).
 */

/** The fake main process and what the tests do around it. */
interface FakeMain extends MediaBridge {
  /** The user's files on disk, untouched by the app. */
  disk: Set<Blob>;
  /** App-made files in library/media/, by id. */
  owned: Map<string, Uint8Array>;
  lose(id: string): void;
  pickNext(file: Blob | null): void;
  /** Files without a path (as getPathForFile gives '' for them). */
  pathless: Set<Blob>;
  writes: number[];
}

/**
 * The media handlers as the main process runs them, in memory.
 * @param room free space on the data folder's disk, bytes
 * @returns the fake
 */
function fakeMain(room: number): FakeMain {
  const index = new Map<string, { file: Blob; owned: boolean; lost: boolean }>();
  const owned = new Map<string, Uint8Array>();
  const parts = new Map<string, Uint8Array[]>();
  const disk = new Set<Blob>();
  const pathless = new Set<Blob>();
  const writes: number[] = [];
  let next: Blob | null = null;
  const ownedBytes = () => [...owned.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  return {
    disk,
    owned,
    pathless,
    writes,
    register(id, file) {
      if (pathless.has(file)) return Promise.resolve(false);
      disk.add(file);
      index.set(id, { file, owned: false, lost: false });
      return Promise.resolve(true);
    },
    writeOwned(id, position, data) {
      writes.push(data.byteLength);
      const list = parts.get(id) ?? [];
      list.push(new Uint8Array(data));
      parts.set(id, list);
      expect(position).toBe(list.slice(0, -1).reduce((sum, part) => sum + part.length, 0));
      return Promise.resolve();
    },
    finishOwned(id, keep) {
      const list = parts.get(id) ?? [];
      parts.delete(id);
      if (keep) {
        const bytes = new Uint8Array(list.reduce((sum, part) => sum + part.length, 0));
        let at = 0;
        for (const part of list) {
          bytes.set(part, at);
          at += part.length;
        }
        owned.set(id, bytes);
        index.set(id, { file: new Blob([bytes]), owned: true, lost: false });
      }
      return Promise.resolve();
    },
    status(ids) {
      const states: Record<string, MediaStatus> = {};
      for (const id of ids) {
        const entry = index.get(id);
        states[id] = entry && !entry.lost ? { state: 'ok', size: entry.file.size } : { state: entry ? 'changed' : 'missing', size: 0 };
      }
      return Promise.resolve(states);
    },
    freeSpace: () => Promise.resolve(room - ownedBytes()),
    findFile(id) {
      const entry = index.get(id);
      if (!next || !entry) return Promise.resolve(null);
      disk.add(next);
      index.set(id, { file: next, owned: false, lost: false });
      return Promise.resolve({ found: [id] });
    },
    sweep(used) {
      let freed = 0;
      for (const [id, entry] of index)
        if (!used.includes(id)) {
          if (entry.owned) {
            freed += owned.get(id)?.length ?? 0;
            owned.delete(id);
          }
          index.delete(id);
        }
      return Promise.resolve(freed);
    },
    lose: (id) => {
      const entry = index.get(id);
      if (entry) entry.lost = true;
    },
    pickNext: (file) => {
      next = file;
    },
    /** What chitthi-media://<id> answers. */
    serve(url: string): Response {
      const entry = index.get(url.slice(MEDIA_SCHEME.length));
      return entry && !entry.lost ? new Response(entry.file) : new Response(null, { status: 404 });
    },
  } as FakeMain & { serve(url: string): Response };
}

let main: FakeMain & { serve?: (url: string) => Response };
beforeEach(() => {
  vi.stubGlobal('fetch', (url: string) => Promise.resolve((main as FakeMain & { serve(url: string): Response }).serve(url)));
});
afterEach(() => vi.unstubAllGlobals());

mediaContract('desktop (fake main process)', (room) => {
  main = fakeMain(room);
  const fake = main;
  return {
    store: desktopMedia(fake),
    kind: 'references',
    ownBytes: () => [...fake.owned.values()].reduce((sum, bytes) => sum + bytes.length, 0),
    userFileIntact: (file) => fake.disk.has(file),
    lose: (id) => fake.lose(id),
    pickNext: (file) => fake.pickNext(file),
  };
});

describe('the desktop media store (408 T042)', () => {
  it('opens a kept file as disk media on its chitthi-media URL, with its name and type', async () => {
    main = fakeMain(10_000_000);
    const store = desktopMedia(main);
    const clip = testFile('beach.mp4', 5000, 1);
    const id = (await store.keep(clip, false)) as string;
    expect(await store.open(id, 'beach.mp4', 'video/mp4')).toEqual({
      file: { id, url: `${MEDIA_SCHEME}${id}`, size: 5000, type: 'video/mp4', name: 'beach.mp4' },
      url: `${MEDIA_SCHEME}${id}`,
    });
  });

  it('a file that changed since it was added opens as missing', async () => {
    main = fakeMain(10_000_000);
    const store = desktopMedia(main);
    const id = (await store.keep(testFile('beach.mp4', 5000, 1), false)) as string;
    main.lose(id);
    expect(await store.open(id, 'beach.mp4')).toEqual({ missing: true, name: 'beach.mp4' });
  });

  it('a file without a place on disk is kept in the data folder, written in pieces', async () => {
    main = fakeMain(100_000_000);
    const store = desktopMedia(main);
    const made = testFile('pasted.png', OWNED_PIECE * 2 + 10, 5, 'image/png');
    main.pathless.add(made);
    const shares: number[] = [];
    const id = (await store.keep(made, false, (share) => shares.push(share))) as string;
    expect(main.writes).toEqual([OWNED_PIECE, OWNED_PIECE, 10]);
    expect(main.owned.get(id)?.length).toBe(made.size);
    expect(main.disk.has(made)).toBe(false);
    expect(shares.at(-1)).toBe(1);
  });

  it('an app-made file that fails part way leaves nothing behind', async () => {
    main = fakeMain(100_000_000);
    const finished: boolean[] = [];
    const bridge: MediaBridge = {
      ...main,
      writeOwned: (id, position, data) => (position > 0 ? Promise.reject(new Error('ENOSPC: no space left')) : main.writeOwned(id, position, data)),
      finishOwned: (id, keep) => (finished.push(keep), main.finishOwned(id, keep)),
    };
    const kept = await desktopMedia(bridge).keep(testFile('voice.webm', OWNED_PIECE + 5, 3, 'audio/webm'), true);
    expect(kept).toEqual({ error: '“voice.webm” couldn’t be kept (ENOSPC: no space left).' });
    expect(finished).toEqual([false]);
    expect(main.owned.size).toBe(0);
  });
});
