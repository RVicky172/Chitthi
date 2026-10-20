import { openDatabase, runRequest, runTransaction } from './idb';

/*
 * Voice takes in progress, kept on the device for crash recovery (209 §6, AC-9, D-061): a header per take and its
 * recorder chunks, one write a second, in IndexedDB on web and desktop (`chitthi-takes`, its own database). A take
 * leaves the store once it is on the timeline, where the project keeps it (408). The logic runs over a small backend,
 * so tests use one in memory (D3).
 */

/** A take in progress, as stored. */
export interface TakeHeader {
  id: string;
  /** The project it was recorded in: recovery is offered when that project opens. */
  project: string;
  name: string;
  /** When recording began, ms since 1970. */
  startedAt: number;
  /** The track it was recorded onto. */
  track: string;
  /** Its place on the timeline, s. */
  start: number;
  mime: string;
  /** Whether recording stopped normally (false: cut short by a crash). */
  done: boolean;
}

/** Where takes are kept: IndexedDB in the app, a map in tests. */
export interface TakeBackend {
  putTake(take: TakeHeader): Promise<void>;
  addChunk(id: string, index: number, blob: Blob): Promise<void>;
  /** Every header, as stored (unchecked). */
  takes(): Promise<unknown[]>;
  /** A take's chunks in index order. */
  chunks(id: string): Promise<Blob[]>;
  /** Deletes a take and its chunks. */
  remove(id: string): Promise<void>;
}

/** Days a take not recovered or discarded is kept (AC-9). */
export const TAKE_KEEP_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Whether the sweep deletes a take.
 * @param take the take
 * @param now the time now, ms since 1970
 * @returns true when it began more than 30 days ago
 */
const expired = (take: Pick<TakeHeader, 'startedAt'>, now: number): boolean =>
  now - take.startedAt > TAKE_KEEP_DAYS * DAY_MS;

/**
 * How many takes each project has to recover (AC-9), so opening a project can say so: those the sweep keeps.
 * @param headers the takes kept
 * @param now the time now, ms since 1970
 * @returns the count per project id (projects with none left out)
 */
export function takesToRecover(headers: readonly TakeHeader[], now: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const take of headers) if (!expired(take, now)) counts.set(take.project, (counts.get(take.project) ?? 0) + 1);
  return counts;
}

/**
 * A stored header, checked.
 * @param value what was read
 * @returns the header, or null when it can't be one
 */
function asHeader(value: unknown): TakeHeader | null {
  if (!value || typeof value !== 'object') return null;
  const take = value as Record<string, unknown>;
  const texts = [take.id, take.project, take.name, take.track, take.mime].every((field) => typeof field === 'string');
  const numbers = [take.startedAt, take.start].every((field) => typeof field === 'number' && Number.isFinite(field));
  if (!texts || !numbers || typeof take.done !== 'boolean') return null;
  return value as TakeHeader;
}

/** The take store's operations. */
export interface TakeStore {
  /** Starts keeping a take. */
  begin(take: Omit<TakeHeader, 'done'>): Promise<void>;
  /** Keeps the next chunk; chunks join in the order this is called, whatever order the writes land in. */
  append(id: string, chunk: Blob): Promise<void>;
  /** Marks a take as stopped normally. */
  finish(id: string): Promise<void>;
  /** The takes kept, for one project or all. */
  list(project?: string): Promise<TakeHeader[]>;
  /** A take's chunks joined into one file. */
  join(id: string): Promise<Blob>;
  remove(id: string): Promise<void>;
  /** Deletes takes older than 30 days; resolves to how many. */
  sweep(now: number): Promise<number>;
}

/**
 * The take store over a backend.
 * @param backend where takes are kept
 * @returns the store
 */
export function makeTakeStore(backend: TakeBackend): TakeStore {
  // Each take's next chunk index, claimed in call order; after a restart it starts from the chunks already kept.
  const nextIndex = new Map<string, Promise<number>>();
  const all = async () => (await backend.takes()).map(asHeader).filter((take): take is TakeHeader => take !== null);
  const store: TakeStore = {
    async begin(take) {
      nextIndex.set(take.id, Promise.resolve(0));
      await backend.putTake({ ...take, done: false });
    },
    async append(id, chunk) {
      const index = nextIndex.get(id) ?? backend.chunks(id).then((kept) => kept.length);
      nextIndex.set(
        id,
        index.then(
          (claimed) => claimed + 1,
          () => 0,
        ),
      );
      await backend.addChunk(id, await index, chunk);
    },
    async finish(id) {
      const take = (await all()).find((candidate) => candidate.id === id);
      if (take) await backend.putTake({ ...take, done: true });
    },
    async list(project) {
      return (await all()).filter((take) => project === undefined || take.project === project);
    },
    async join(id) {
      const take = (await all()).find((candidate) => candidate.id === id);
      return new Blob(await backend.chunks(id), { type: take?.mime ?? '' });
    },
    async remove(id) {
      nextIndex.delete(id);
      await backend.remove(id);
    },
    async sweep(now) {
      const old = (await all()).filter((take) => expired(take, now));
      for (const take of old) await store.remove(take.id);
      return old.length;
    },
  };
  return store;
}

const DB_NAME = 'chitthi-takes';
const TAKES = 'takes';
const CHUNKS = 'chunks';

/**
 * The IndexedDB backend: headers by id, chunks by `[take, index]`.
 * @returns the backend (the database opens on first use)
 */
export function indexedDbTakes(): TakeBackend {
  let opened: Promise<IDBDatabase> | null = null;
  const db = () =>
    (opened ??= openDatabase(DB_NAME, 1, (request) => {
      request.result.createObjectStore(TAKES, { keyPath: 'id' });
      request.result.createObjectStore(CHUNKS, { keyPath: ['take', 'index'] });
    }));
  const range = (id: string) => IDBKeyRange.bound([id, 0], [id, Infinity]);
  return {
    async putTake(take) {
      await runRequest(await db(), TAKES, 'readwrite', (store) => store.put(take));
    },
    async addChunk(id, index, blob) {
      await runRequest(await db(), CHUNKS, 'readwrite', (store) => store.put({ take: id, index, blob }));
    },
    async takes() {
      const found = await runRequest(await db(), TAKES, 'readonly', (store) => store.getAll());
      return Array.isArray(found) ? (found as unknown[]) : [];
    },
    async chunks(id) {
      const found = await runRequest(await db(), CHUNKS, 'readonly', (store) => store.getAll(range(id)));
      const rows = Array.isArray(found) ? (found as { blob?: unknown }[]) : [];
      return rows.map((row) => row.blob).filter((blob): blob is Blob => blob instanceof Blob);
    },
    async remove(id) {
      await runTransaction(await db(), [TAKES, CHUNKS], 'readwrite', (store) => {
        store(TAKES).delete(id);
        store(CHUNKS).delete(range(id));
        return () => undefined;
      });
    },
  };
}
