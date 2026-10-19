import { describe, expect, it } from 'vitest';
import { storedBytes } from '@/lib/projects';
import { desktopProjects } from '@/lib/projectsDesktop';
import type { ProjectsBridge } from '@/platform/desktop';
import { libraryContract } from '../../support/projectsContract';

/*
 * 408 T033: the desktop app's project library over the bridge (electron/projects.cjs, T050). The fake bridge does what
 * the main process does: one file per project written to .tmp then renamed (a failed write leaves the last one), a
 * cache file beside it, bytes and readability worked out when listing. The page sends and receives JSON text only.
 */

/** The fake main process and the faults the tests cause in it. */
interface FakeMain extends ProjectsBridge {
  breakWrites(): void;
  spoil(id: string): void;
}

/**
 * The project handlers as the main process runs them, in memory.
 * @returns the fake
 */
function fakeMain(): FakeMain {
  const files = new Map<string, { doc: string; entry: string; cache: string | null }>();
  let broken = false;
  const bytesOf = (file: { doc: string; cache: string | null }) => storedBytes(file.doc) + (file.cache === null ? 0 : storedBytes(file.cache));
  const parses = (text: string): boolean => {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  };
  return {
    list: () => Promise.resolve([...files.values()].map((file) => ({ ...(JSON.parse(file.entry) as object), bytes: bytesOf(file), readable: parses(file.doc) }))),
    read: (id) => Promise.resolve(files.get(id)?.doc ?? null),
    write: (id, doc, entry) => {
      // .tmp then rename: an interrupted write never replaces the file.
      if (broken) return Promise.reject(new Error('EIO: the write was interrupted'));
      files.set(id, { doc, entry, cache: files.get(id)?.cache ?? null });
      return Promise.resolve();
    },
    readCache: (id) => Promise.resolve(files.get(id)?.cache ?? null),
    writeCache: (id, cache) => {
      const file = files.get(id);
      if (!file) return Promise.reject(new Error(`No project ${id}.`));
      files.set(id, { ...file, cache });
      return Promise.resolve();
    },
    remove: (id) => {
      const file = files.get(id);
      files.delete(id);
      return Promise.resolve(file ? bytesOf(file) : 0);
    },
    usage: () => Promise.resolve({ used: [...files.values()].reduce((sum, file) => sum + bytesOf(file), 0) }),
    breakWrites: () => {
      broken = true;
    },
    spoil: (id) => {
      const file = files.get(id);
      if (file) files.set(id, { ...file, doc: '{"version":1,' });
    },
  };
}

libraryContract('desktop (fake bridge)', () => {
  const main = fakeMain();
  return { library: desktopProjects(main), breakWrites: () => main.breakWrites(), spoil: (id) => main.spoil(id) };
});

describe('the desktop library (408 T033)', () => {
  it('sends the main process JSON text, never objects', async () => {
    const sent: unknown[][] = [];
    const main = fakeMain();
    const library = desktopProjects({ ...main, write: (...args) => (sent.push(args), main.write(...args)) });
    await library.write('p1', { version: 1, name: 'Post', format: 'portrait', limit: 4, fileType: 'jpeg', quality: 92, caption: '', selected: null, items: [], media: [] }, {
      id: 'p1',
      studio: 'photo',
      name: 'Post',
      kind: 'photo',
      length: 0,
      photos: 0,
      changed: 1,
      bytes: 0,
      thumb: '',
      readable: true,
    });
    expect(sent[0]?.map((arg) => typeof arg)).toEqual(['string', 'string', 'string']);
  });

  it('entries the main process lists that aren’t entries: by their id as can’t be opened, else left out', async () => {
    const library = desktopProjects({ ...fakeMain(), list: () => Promise.resolve([{ id: 'odd', name: 7 }, 'junk', { id: '../x' }]) });
    const listed = await library.list();
    expect(listed.map((item) => [item.id, item.readable])).toEqual([['odd', false]]);
  });

  it('usage: the bytes on disk; no quota or persistence applies', async () => {
    expect(await desktopProjects(fakeMain()).usage()).toEqual({ used: 0, allowed: null, persisted: null });
  });
});
