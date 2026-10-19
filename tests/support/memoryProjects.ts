import { checkProjectId, newestFirst, storedBytes, type ProjectEntry, type ProjectLibrary } from '@/lib/projects';

/*
 * The project library in memory (408 T031), for unit and integration tests: documents and caches kept as the JSON text
 * a real library stores, with faults the tests can cause — a write broken half way, a spoiled document, a quota.
 */

/** What a test can do to the in-memory library. */
export interface MemoryFaults {
  /** From now on, a write fails after its document is stored and before its entry is. */
  breakWrites(): void;
  /** Writes work again. */
  mendWrites(): void;
  /** Spoils a stored document, so it can't be read. */
  spoil(id: string): void;
}

/** The in-memory library and its faults. */
export interface MemoryProjects extends ProjectLibrary {
  faults: MemoryFaults;
}

/** One stored project. */
interface Stored {
  entry: ProjectEntry;
  doc: string;
  cache: string | null;
}

/**
 * A storage-full error, as a browser throws it.
 * @returns the error
 */
const quotaError = (): DOMException => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

/**
 * Work run as a promise, so a throw is a rejection as in a real library.
 * @param work the work
 * @returns its result
 */
const later = <T>(work: () => T): Promise<T> => Promise.resolve().then(work);

/**
 * A project library in memory.
 * @param options a quota in bytes (unlimited when missing)
 * @param options.quota the most the projects may take
 * @returns the library
 */
export function memoryProjects(options: { quota?: number } = {}): MemoryProjects {
  const stored = new Map<string, Stored>();
  let broken = false;
  const bytesOf = (project: Stored): number => storedBytes(project.doc) + (project.cache === null ? 0 : storedBytes(project.cache));
  const used = (): number => [...stored.values()].reduce((sum, project) => sum + bytesOf(project), 0);
  const fits = (id: string, next: Stored): boolean => {
    const before = stored.get(id);
    return options.quota === undefined || used() - (before ? bytesOf(before) : 0) + bytesOf(next) <= options.quota;
  };
  const readable = (project: Stored): boolean => {
    try {
      JSON.parse(project.doc);
      return true;
    } catch {
      // Spoiled: listed as can't be opened.
      return false;
    }
  };
  return {
    list: () =>
      later(() => newestFirst([...stored.values()].map((project) => ({ ...project.entry, bytes: bytesOf(project), readable: readable(project) })))),
    read: (id) =>
      later(() => {
        const project = stored.get(checkProjectId(id));
        if (!project) throw new Error(`No project ${id}.`);
        return JSON.parse(project.doc) as unknown;
      }),
    write: (id, doc, entry) =>
      later(() => {
        checkProjectId(id);
        const before = stored.get(id);
        const next: Stored = { entry: { ...entry, id }, doc: JSON.stringify(doc), cache: before?.cache ?? null };
        if (!fits(id, next)) throw quotaError();
        // The document lands first; a fault before the entry puts back what was there (all or nothing).
        stored.set(id, { ...(before ?? next), doc: next.doc });
        if (broken) {
          if (before) stored.set(id, before);
          else stored.delete(id);
          throw new Error('The write was interrupted.');
        }
        stored.set(id, next);
      }),
    readCache: (id) =>
      later(() => {
        const cache = stored.get(checkProjectId(id))?.cache ?? null;
        return cache === null ? null : (JSON.parse(cache) as unknown);
      }),
    writeCache: (id, cache) =>
      later(() => {
        const project = stored.get(checkProjectId(id));
        if (!project) throw new Error(`No project ${id}.`);
        const next = { ...project, cache: JSON.stringify(cache) };
        if (!fits(id, next)) throw quotaError();
        stored.set(id, next);
      }),
    remove: (id) =>
      later(() => {
        const project = stored.get(checkProjectId(id));
        if (!project) return 0;
        stored.delete(id);
        return bytesOf(project);
      }),
    usage: () => later(() => ({ used: used(), allowed: options.quota ?? null, persisted: null })),
    faults: {
      breakWrites: () => {
        broken = true;
      },
      mendWrites: () => {
        broken = false;
      },
      spoil: (id) => {
        const project = stored.get(id);
        if (project) stored.set(id, { ...project, doc: '{"version":1,' });
      },
    },
  };
}
