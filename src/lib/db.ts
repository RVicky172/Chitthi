import type { PhotoMeta, SavedDesign } from '../types';

/* Everything is stored in the user's own browser (IndexedDB). */
let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('IndexedDB unavailable'));
      const r = indexedDB.open('chitthi', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('designs')) db.createObjectStore('designs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('work')) db.createObjectStore('work', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    dbp.catch(() => {
      dbp = null;
    });
  }
  return dbp;
}
function run<T>(store: 'designs' | 'work', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const t = db.transaction(store, mode),
          req = fn(t.objectStore(store));
        t.oncomplete = () => res(req.result);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
  );
}

/** Older builds stored the design under `state`; accept both. */
function normalise(d: SavedDesign & { state?: unknown }): SavedDesign {
  return d.design ? d : { ...d, design: d.state as SavedDesign['design'] };
}

export const db = {
  all: () => run<(SavedDesign & { state?: unknown })[]>('designs', 'readonly', (s) => s.getAll()).then((l) => l.map(normalise)),
  get: (id: string) =>
    run<(SavedDesign & { state?: unknown }) | undefined>('designs', 'readonly', (s) => s.get(id)).then((d) =>
      d ? normalise(d) : undefined,
    ),
  put: (d: SavedDesign) => run('designs', 'readwrite', (s) => s.put(d)),
  del: (id: string) => run('designs', 'readwrite', (s) => s.delete(id)),
  getWorkPhotos: () =>
    run<{ id: string; photos: PhotoMeta[] } | undefined>('work', 'readonly', (s) => s.get('photos')).then((r) => r?.photos ?? []),
  putWorkPhotos: (photos: PhotoMeta[]) => run('work', 'readwrite', (s) => s.put({ id: 'photos', photos })),
};
