import { openDatabase, runTransaction } from './idb';
import { checkProjectId, entryOf, newestFirst, storedBytes, unreadable, type LibraryUsage, type ProjectEntry, type ProjectLibrary } from './projects';

/*
 * The browser's project library (408 §3, D5): its own IndexedDB database, `chitthi-projects`, so the print database
 * (`chitthi`, lib/db.ts) and its upgrades never move. Three stores keyed by project id: `entries` (what the list shows),
 * `docs` and `cache` (the JSON text, so the bytes are exact and a damaged record is a parse failure, not a crash).
 * A save is one transaction over all three: all or nothing (AC-1).
 */

/** The database's name. */
export const PROJECTS_DB = 'chitthi-projects';
const VERSION = 1;

/** The database's stores. */
export type ProjectsStore = 'entries' | 'docs' | 'cache';
const STORES: readonly ProjectsStore[] = ['entries', 'docs', 'cache'];

/** The database as the library uses it (stubbed in tests). */
export interface ProjectsDb {
  /** Every record of a store, with its key. */
  all(store: ProjectsStore): Promise<[string, unknown][]>;
  get(store: ProjectsStore, key: string): Promise<unknown>;
  /** Puts and deletes in one transaction: all of them, or none. */
  commit(puts: readonly { store: ProjectsStore; key: string; value: unknown }[], deletes: readonly { store: ProjectsStore; key: string }[]): Promise<void>;
}

/** What the library asks of the browser's storage manager (`navigator.storage`). */
export type StorageAnswers = Pick<StorageManager, 'estimate' | 'persisted'>;

/**
 * Opens the projects database, creating its stores on first use.
 * @returns the database layer over it
 */
export async function openProjectsDb(): Promise<ProjectsDb> {
  const database = await openDatabase(PROJECTS_DB, VERSION, (request) => {
    for (const store of STORES) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
  });
  return {
    all: (store) =>
      runTransaction(database, [store], 'readonly', (storeOf) => {
        const keys = storeOf(store).getAllKeys();
        const values = storeOf(store).getAll();
        return () => keys.result.map((key, index): [string, unknown] => [typeof key === 'string' ? key : JSON.stringify(key), values.result[index]]);
      }),
    get: (store, key) =>
      runTransaction(database, [store], 'readonly', (storeOf) => {
        const request = storeOf(store).get(key);
        return () => request.result as unknown;
      }),
    commit: (puts, deletes) =>
      runTransaction(database, STORES, 'readwrite', (storeOf) => {
        for (const { store, key, value } of puts) storeOf(store).put(value, key);
        for (const { store, key } of deletes) storeOf(store).delete(key);
        return () => undefined;
      }),
  };
}

/**
 * Whether stored JSON text reads.
 * @param text the stored value
 * @returns true when it is text that parses
 */
function parses(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    // Damaged: the project is listed as can't be opened.
    return false;
  }
}

/**
 * The browser's storage manager, where it has one.
 * @returns it, or null
 */
const browserStorage = (): StorageAnswers | null => (typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : null);

/**
 * Every project's entry, newest first; each document parsed only after it changes (whether it reads is kept by
 * project and save time).
 * @param db the database
 * @returns the list
 */
function lister(db: () => Promise<ProjectsDb>): { list: () => Promise<ProjectEntry[]>; forget: (id: string) => void } {
  const reads = new Map<string, { changed: number; ok: boolean }>();
  const readable = async (base: ProjectsDb, entry: ProjectEntry): Promise<boolean> => {
    const known = reads.get(entry.id);
    if (known?.changed === entry.changed) return known.ok;
    const ok = parses(await base.get('docs', entry.id));
    reads.set(entry.id, { changed: entry.changed, ok });
    return ok;
  };
  const list = async (): Promise<ProjectEntry[]> => {
    const base = await db();
    const records = await base.all('entries');
    const entries = await Promise.all(
      records.map(async ([id, value]) => {
        const entry = entryOf(id, value);
        return entry ? { ...entry, readable: await readable(base, entry) } : unreadable(id);
      }),
    );
    return newestFirst(entries);
  };
  return { list, forget: (id) => reads.delete(id) };
}

/**
 * The browser's project library.
 * @param open opens the database (once, on first use)
 * @param storage the browser's storage manager, or null without one
 * @returns the library
 */
export function webProjects(open: () => Promise<ProjectsDb> = openProjectsDb, storage: StorageAnswers | null = browserStorage()): ProjectLibrary {
  let opened: Promise<ProjectsDb> | null = null;
  const db = () => (opened ??= open());
  const textOf = async (store: 'docs' | 'cache', id: string): Promise<string | null> => {
    const value = await (await db()).get(store, id);
    return typeof value === 'string' ? value : null;
  };
  const { list, forget } = lister(db);
  return {
    list,
    async read(id) {
      const text = await textOf('docs', checkProjectId(id));
      if (text === null) throw new Error(`No project ${id}.`);
      return JSON.parse(text) as unknown;
    },
    async write(id, doc, entry) {
      checkProjectId(id);
      const text = JSON.stringify(doc);
      const cache = await textOf('cache', id);
      const bytes = storedBytes(text) + (cache === null ? 0 : storedBytes(cache));
      await (await db()).commit(
        [
          { store: 'docs', key: id, value: text },
          { store: 'entries', key: id, value: { ...entry, id, bytes, readable: true } },
        ],
        [],
      );
    },
    async readCache(id) {
      const text = await textOf('cache', checkProjectId(id));
      return text === null ? null : (JSON.parse(text) as unknown);
    },
    async writeCache(id, cache) {
      checkProjectId(id);
      const base = await db();
      const entry = entryOf(id, await base.get('entries', id));
      const doc = await textOf('docs', id);
      if (!entry || doc === null) throw new Error(`No project ${id}.`);
      const text = JSON.stringify(cache);
      await base.commit(
        [
          { store: 'cache', key: id, value: text },
          { store: 'entries', key: id, value: { ...entry, bytes: storedBytes(doc) + storedBytes(text) } },
        ],
        [],
      );
    },
    async remove(id) {
      checkProjectId(id);
      const base = await db();
      const doc = await textOf('docs', id);
      const cache = await textOf('cache', id);
      const entry = await base.get('entries', id);
      if (doc === null && cache === null && entry === undefined) return 0;
      await base.commit([], STORES.map((store) => ({ store, key: id })));
      forget(id);
      return (doc === null ? 0 : storedBytes(doc)) + (cache === null ? 0 : storedBytes(cache));
    },
    async usage(): Promise<LibraryUsage> {
      const used = (await list()).reduce((sum, entry) => sum + entry.bytes, 0);
      if (!storage) return { used, allowed: null, persisted: null };
      const [estimate, persisted] = await Promise.all([storage.estimate().catch(() => null), storage.persisted().catch(() => null)]);
      return { used, allowed: estimate?.quota ?? null, persisted };
    },
  };
}
