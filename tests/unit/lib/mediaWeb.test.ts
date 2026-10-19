import { describe, expect, it, vi } from 'vitest';
import { PRIVATE_WINDOW, webMedia, type OpfsEnv } from '@/lib/mediaWeb';
import { fakeOpfs, type FakeDirectory, type FakeOpfsOptions } from '../../support/fakeOpfs';
import { mediaContract, testFile } from '../../support/mediaContract';

/*
 * 408 T041 (AC-4, D2): the browser's media store: each file copied once into OPFS `media/<id>`, streamed, after
 * checking the space left; persistent storage asked once (never awaited: Firefox's prompt doesn't settle unanswered);
 * a private window without OPFS keeps no files and says so. Run on a fake OPFS.
 */

/** A fake browser: its OPFS, its storage manager and its worker copier. */
interface FakeBrowser {
  env: OpfsEnv;
  root: FakeDirectory;
  persist: ReturnType<typeof vi.fn>;
  workerCopies: string[];
}

/**
 * A value that must be there.
 * @param value the value
 * @returns it
 */
function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

/**
 * The bytes in the fake's media folder.
 * @param root the fake OPFS
 * @returns the total
 */
const mediaBytes = (root: FakeDirectory): number => [...(root.dirs.get('media')?.files.values() ?? [])].reduce((sum, bytes) => sum + bytes.length, 0);

/**
 * A browser with a fake OPFS.
 * @param room the bytes the storage estimate says the origin may take
 * @param options the fake's capacity and features
 * @returns the browser
 */
function fakeBrowser(room: number, options: FakeOpfsOptions = {}): FakeBrowser {
  const root = fakeOpfs(options);
  const persist = vi.fn(() => new Promise<boolean>(() => undefined));
  const workerCopies: string[] = [];
  const env: OpfsEnv = {
    root: () => Promise.resolve(root.handle),
    storage: { estimate: () => Promise.resolve({ usage: mediaBytes(root), quota: room }), persist },
    copyInWorker: async (id, file, progress) => {
      workerCopies.push(id);
      const media = await root.handle.getDirectoryHandle('media', { create: true });
      await media.getFileHandle(id, { create: true });
      defined(root.dirs.get('media')).files.set(id, new Uint8Array(await file.arrayBuffer()));
      progress(1);
    },
    objectUrl: (file) => `blob:fake/${file.size}`,
  };
  return { env, root, persist, workerCopies };
}

/**
 * The files in the fake's media folder.
 * @param browser the fake browser
 * @returns their names (media ids)
 */
const mediaFiles = (browser: FakeBrowser): string[] => [...(browser.root.dirs.get('media')?.files.keys() ?? [])];

mediaContract('browser (fake OPFS)', (room) => {
  const browser = fakeBrowser(room);
  return {
    store: webMedia(browser.env),
    kind: 'copies',
    ownBytes: () => mediaBytes(browser.root),
    userFileIntact: () => true,
    lose: () => undefined,
    pickNext: () => undefined,
  };
});

describe('the browser media store (408 T041)', () => {
  const clip = testFile('beach.mp4', 300_000, 1);

  it('asks for persistent storage once, without waiting for the answer', async () => {
    const browser = fakeBrowser(10_000_000);
    const store = webMedia(browser.env);
    await store.keep(clip, false);
    await store.keep(testFile('b.mp4', 1000, 2), false);
    expect(browser.persist).toHaveBeenCalledTimes(1);
  });

  it('streams the copy and gives back a disk file with its name and type, through an object URL', async () => {
    const browser = fakeBrowser(10_000_000);
    const store = webMedia(browser.env);
    const id = (await store.keep(clip, false)) as string;
    expect(mediaFiles(browser)).toEqual([id]);
    expect(browser.workerCopies).toEqual([]);
    const opened = await store.open(id, 'beach.mp4', 'video/mp4');
    expect(opened).toMatchObject({ url: 'blob:fake/300000', file: { name: 'beach.mp4', type: 'video/mp4', size: 300_000 } });
  });

  it('where a file handle can’t be written on the page (Safari), copies in the worker', async () => {
    const browser = fakeBrowser(10_000_000, { noWritable: true });
    const id = (await webMedia(browser.env).keep(clip, false)) as string;
    expect(browser.workerCopies).toEqual([id]);
    expect(mediaFiles(browser)).toEqual([id]);
  });

  it('a write refused for lack of space (the estimate was old) says so and leaves no partial file', async () => {
    const browser = fakeBrowser(10_000_000, { capacity: 100_000 });
    const kept = await webMedia(browser.env).keep(clip, false);
    expect(kept).toEqual({ error: expect.stringContaining('There isn’t room for “beach.mp4”') as unknown });
    expect(mediaFiles(browser)).toEqual([]);
  });

  it('a file that can’t be read part way leaves no partial file', async () => {
    const browser = fakeBrowser(10_000_000);
    const broken = new File([clip], 'broken.mp4', { type: 'video/mp4' });
    vi.spyOn(broken, 'stream').mockReturnValue(
      new ReadableStream({
        pull(controller) {
          controller.error(new DOMException('The file changed.', 'NotReadableError'));
        },
      }),
    );
    const kept = await webMedia(browser.env).keep(broken, false);
    expect(kept).toEqual({ error: '“broken.mp4” couldn’t be kept (The file changed.).' });
    expect(mediaFiles(browser)).toEqual([]);
  });

  it('a private window without OPFS keeps no files and says so; nothing opens', async () => {
    const browser = fakeBrowser(10_000_000);
    const store = webMedia({ ...browser.env, root: () => Promise.reject(new DOMException('Private window', 'SecurityError')) });
    expect(await store.keep(clip, false)).toEqual({ error: PRIVATE_WINDOW });
    expect(await store.open('m1', 'beach.mp4')).toEqual({ missing: true, name: 'beach.mp4' });
    expect(await store.sweep(new Set())).toBe(0);
  });

  it('without a storage manager (old browsers), copies without checking the space', async () => {
    const browser = fakeBrowser(0);
    const id = await webMedia({ ...browser.env, storage: null }).keep(clip, false);
    expect(typeof id).toBe('string');
  });
});
