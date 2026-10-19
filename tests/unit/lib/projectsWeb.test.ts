import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROJECTS_DB, openProjectsDb, webProjects, type ProjectsDb, type ProjectsStore } from '@/lib/projectsWeb';
import { libraryContract } from '../../support/projectsContract';

/*
 * 408 T032 (AC-1, AC-6, D5): the browser's project library, over its own IndexedDB database `chitthi-projects` (the
 * print `chitthi` database is never opened). The database layer is stubbed in memory: each commit is all or nothing,
 * as one IndexedDB transaction is.
 */

/** The stubbed database and the faults the tests cause in it. */
interface FakeDb extends ProjectsDb {
  breakCommits(): void;
  set(store: ProjectsStore, key: string, value: unknown): void;
}

/**
 * The database layer in memory.
 * @returns the fake
 */
function fakeDb(): FakeDb {
  const stores: Record<ProjectsStore, Map<string, unknown>> = { entries: new Map(), docs: new Map(), cache: new Map() };
  let broken = false;
  return {
    all: (store) => Promise.resolve([...stores[store].entries()]),
    get: (store, key) => Promise.resolve(stores[store].get(key)),
    commit: (puts, deletes) => {
      const before = Object.fromEntries(Object.entries(stores).map(([name, map]) => [name, new Map(map)])) as typeof stores;
      for (const { store, key, value } of puts) {
        // The fault is a crash after the document lands and before the entry does: a transaction writing an entry
        // aborts there, and IndexedDB puts back every store it touched (a document written on its own stays).
        if (broken && store === 'entries') {
          for (const name of Object.keys(stores) as ProjectsStore[]) stores[name] = before[name];
          return Promise.reject(new DOMException('The transaction was aborted.', 'AbortError'));
        }
        stores[store].set(key, value);
      }
      for (const { store, key } of deletes) stores[store].delete(key);
      return Promise.resolve();
    },
    breakCommits: () => {
      broken = true;
    },
    set: (store, key, value) => stores[store].set(key, value),
  };
}

/** A storage manager answering as a browser would. */
const storage = { estimate: () => Promise.resolve({ usage: 123_456, quota: 10_000_000 }), persisted: () => Promise.resolve(true) };

libraryContract('browser (IndexedDB stubbed)', () => {
  const db = fakeDb();
  return {
    library: webProjects(() => Promise.resolve(db), storage),
    breakWrites: () => db.breakCommits(),
    spoil: (id) => db.set('docs', id, '{"version":1,'),
  };
});

afterEach(() => vi.unstubAllGlobals());

describe('the browser library (408 T032)', () => {
  it('usage: its own bytes, with the browser’s quota and whether storage is persistent', async () => {
    const library = webProjects(() => Promise.resolve(fakeDb()), storage);
    expect(await library.usage()).toEqual({ used: 0, allowed: 10_000_000, persisted: true });
  });

  it('usage without a storage manager (old browsers): nothing allowed or persisted is known', async () => {
    const library = webProjects(() => Promise.resolve(fakeDb()), null);
    expect(await library.usage()).toEqual({ used: 0, allowed: null, persisted: null });
  });

  it('an entry record that isn’t an entry is listed as can’t be opened, by its key', async () => {
    const db = fakeDb();
    db.set('entries', 'junk', 'not an entry');
    const [listed] = await webProjects(() => Promise.resolve(db), storage).list();
    expect(listed).toMatchObject({ id: 'junk', readable: false, name: 'Project that can’t be opened' });
  });

  it('opens only its own database, chitthi-projects, with the entries, docs and cache stores (D5)', async () => {
    const created: string[] = [];
    const opened: [string, number][] = [];
    const database = { objectStoreNames: { contains: (name: string) => created.includes(name) }, createObjectStore: (name: string) => created.push(name) };
    const fakeIndexedDB = {
      open(name: string, version: number) {
        opened.push([name, version]);
        const request: Partial<IDBOpenDBRequest> = { result: database as unknown as IDBDatabase };
        queueMicrotask(() => {
          request.onupgradeneeded?.call(request as IDBOpenDBRequest, { oldVersion: 0 } as IDBVersionChangeEvent);
          request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'));
        });
        return request;
      },
    };
    vi.stubGlobal('indexedDB', fakeIndexedDB);
    vi.stubGlobal('window', { indexedDB: fakeIndexedDB });
    await openProjectsDb();
    expect(opened).toEqual([[PROJECTS_DB, 1]]);
    expect(PROJECTS_DB).toBe('chitthi-projects');
    expect(created).toEqual(['entries', 'docs', 'cache']);
  });
});
