import { desktop, type DesktopBridge } from '../platform/desktop';
import { isObjectLike } from '../engine/guards';
import type { SavedPreset } from '../engine/presets';
import type { PhotoMeta, SavedDesign, StoredPhoto } from '../types';
import { openDatabase, runRequest } from './idb';

/* In the browser, everything is stored in the user's own browser (IndexedDB). */

/** The object stores of the browser database. */
type StoreName = 'designs' | 'work' | 'library' | 'libfull' | 'presets';

/** A saved design as read from storage: older builds stored the design under `state`. */
type StoredDesign = Omit<SavedDesign, 'design'> & { design?: SavedDesign['design']; state?: unknown };

/** The database's open, shared by every call (null after a failed open, so the next call tries again). */
let databaseOpen: Promise<IDBDatabase> | null = null;

/**
 * v4: full images move from `library` to their own store, so listing the library reads only names and thumbnails.
 * @param transaction the upgrade's transaction
 */
function moveFullImages(transaction: IDBTransaction): void {
  const library = transaction.objectStore('library');
  const fullImages = transaction.objectStore('libfull');
  const cursorRequest = library.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    const record: unknown = cursor.value;
    if (isObjectLike(record) && typeof record.url === 'string' && record.url) {
      fullImages.put({ id: record.id, url: record.url });
      cursor.update({ ...record, url: '' });
    }
    cursor.continue();
  };
}

/**
 * Creates the stores a database of an older version lacks.
 * @param request the open request (its result is the database)
 * @param oldVersion the version on this device (0 for a new database)
 */
function upgrade(request: IDBOpenDBRequest, oldVersion: number): void {
  const database = request.result;
  for (const name of ['designs', 'work', 'library', 'presets'] satisfies StoreName[])
    // v5 added 'presets': saved presets of the photo & video editors (P1.5).
    if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
  if (database.objectStoreNames.contains('libfull')) return;
  database.createObjectStore('libfull', { keyPath: 'id' });
  if (oldVersion > 0 && request.transaction) moveFullImages(request.transaction);
}

/**
 * The browser database, opened once.
 * @returns the database
 */
function open(): Promise<IDBDatabase> {
  if (!databaseOpen) {
    databaseOpen = openDatabase('chitthi', 5, upgrade);
    databaseOpen.catch(() => {
      databaseOpen = null;
    });
  }
  return databaseOpen;
}

/**
 * Runs one request in a transaction of its own.
 * @param storeName the store
 * @param mode read only or read-write
 * @param makeRequest makes the request on the store
 * @returns the request's result once the transaction completes (as stored: unchecked)
 */
async function run(storeName: StoreName, mode: IDBTransactionMode, makeRequest: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return runRequest(await open(), storeName, mode, makeRequest);
}

/**
 * Whether a stored value looks like a saved design (its design goes through mergeDesign() when opened).
 * @param value a record from the designs store
 * @returns true when it has an id and a name
 */
function isStoredDesign(value: unknown): value is StoredDesign {
  return isObjectLike(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

/**
 * Whether a stored value looks like a library photo.
 * @param value a record from the library store
 * @returns true when it has an id, a name and a url field
 */
function isStoredPhoto(value: unknown): value is StoredPhoto {
  return isObjectLike(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.url === 'string';
}

/**
 * Whether a stored value looks like the details of a photo on the design being worked on.
 * @param value one entry of the work store's photo list
 * @returns true when it has a name and a url
 */
function isPhotoMeta(value: unknown): value is PhotoMeta {
  return isObjectLike(value) && typeof value.name === 'string' && typeof value.url === 'string';
}

/**
 * Older builds stored the design under `state`; accept both.
 * @param stored the stored record
 * @returns the record with its design under `design`
 */
function normalise(stored: StoredDesign): SavedDesign {
  // The legacy field is as unchecked as `design`: opening a design passes it through mergeDesign().
  return { ...stored, design: stored.design ?? (stored.state as SavedDesign['design']) };
}

/**
 * The records of a list that pass a check.
 * @param stored what the store returned
 * @param isValid the check
 * @returns the valid records (none when the result isn't a list)
 */
const validList = <T>(stored: unknown, isValid: (value: unknown) => value is T): T[] => (Array.isArray(stored) ? stored.filter(isValid) : []);

/** The browser's storage, with the desktop bridge's shape. */
const browserDB: DesktopBridge['db'] = {
  all: async () => validList(await run('designs', 'readonly', (store) => store.getAll()), isStoredDesign).map(normalise),
  get: async (id) => {
    const stored = await run('designs', 'readonly', (store) => store.get(id));
    return isStoredDesign(stored) ? normalise(stored) : undefined;
  },
  put: (design) => run('designs', 'readwrite', (store) => store.put(design)),
  del: (id) => run('designs', 'readwrite', (store) => store.delete(id)),
  getWorkPhotos: async () => {
    const stored = await run('work', 'readonly', (store) => store.get('photos'));
    return isObjectLike(stored) ? validList(stored.photos, isPhotoMeta) : [];
  },
  putWorkPhotos: (photos) => run('work', 'readwrite', (store) => store.put({ id: 'photos', photos })),
  /* photo store: every uploaded photo, kept across cards */
  libAll: async () => validList(await run('library', 'readonly', (store) => store.getAll()), isStoredPhoto),
  libUrl: async (id) => {
    const stored = await run('libfull', 'readonly', (store) => store.get(id));
    return isObjectLike(stored) && typeof stored.url === 'string' ? stored.url : '';
  },
  // Saves a stored photo; a record with an empty url updates the details and keeps the full image.
  libPut: async (photo) => {
    if (photo.url) await run('libfull', 'readwrite', (store) => store.put({ id: photo.id, url: photo.url }));
    return run('library', 'readwrite', (store) => store.put({ ...photo, url: '' }));
  },
  libDel: async (id) => {
    await run('libfull', 'readwrite', (store) => store.delete(id));
    return run('library', 'readwrite', (store) => store.delete(id));
  },
  /* saved presets of the photo & video editors; read through mergePreset() by state/presets.ts */
  presetAll: async () => {
    const stored = await run('presets', 'readonly', (store) => store.getAll());
    return Array.isArray(stored) ? Array.from<unknown>(stored) : [];
  },
  presetPut: (preset: SavedPreset) => run('presets', 'readwrite', (store) => store.put(preset)),
  presetDel: (id) => run('presets', 'readwrite', (store) => store.delete(id)),
};

/**
 * The desktop app keeps its own library as files on disk (see electron/main.cjs), separate from any browser.
 * @param bridge the desktop bridge's storage
 * @returns the bridge, with saved designs normalised like the browser's
 */
function desktopDB(bridge: DesktopBridge['db']): DesktopBridge['db'] {
  return {
    ...bridge,
    all: () => bridge.all().then((designs) => designs.map(normalise)),
    get: (id: string) => bridge.get(id).then((design) => (design ? normalise(design) : undefined)),
  };
}

/** The device's storage: IndexedDB in the browser, the data folder in the desktop app. */
export const db: DesktopBridge['db'] = desktop ? desktopDB(desktop.db) : browserDB;
