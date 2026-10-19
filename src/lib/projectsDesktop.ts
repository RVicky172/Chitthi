import { isRecord } from '../engine/guards';
import type { ProjectsBridge } from '../platform/desktop';
import { checkProjectId, entryOf, isProjectId, newestFirst, unreadable, type ProjectEntry, type ProjectLibrary } from './projects';

/*
 * The desktop app's project library (408 §3): project files in the data folder's `library/projects/`, kept by the main
 * process (electron/projects.cjs) behind the bridge. Only JSON text crosses it; what comes back is checked here.
 */

/**
 * JSON text read back, parsed.
 * @param text the text, or null when there is none
 * @returns the value, or null
 */
const parsed = (text: string | null): unknown => (text === null ? null : (JSON.parse(text) as unknown));

/**
 * An entry the main process listed: a valid entry, else one that can't be opened when it at least has an id.
 * @param value what was listed
 * @returns the entry, or null for something without an id
 */
function listedEntry(value: unknown): ProjectEntry | null {
  if (!isRecord(value) || !isProjectId(value.id)) return null;
  const entry = entryOf(value.id, value);
  return entry ? { ...entry, readable: value.readable === true } : unreadable(value.id);
}

/**
 * The desktop app's project library.
 * @param bridge the project handlers of the desktop bridge
 * @returns the library
 */
export function desktopProjects(bridge: ProjectsBridge): ProjectLibrary {
  return {
    async list() {
      return newestFirst((await bridge.list()).flatMap((value) => listedEntry(value) ?? []));
    },
    async read(id) {
      const text = await bridge.read(checkProjectId(id));
      if (text === null) throw new Error(`No project ${id}.`);
      return parsed(text);
    },
    write: async (id, doc, entry) => bridge.write(checkProjectId(id), JSON.stringify(doc), JSON.stringify({ ...entry, id })),
    readCache: async (id) => parsed(await bridge.readCache(checkProjectId(id))),
    writeCache: async (id, cache) => bridge.writeCache(checkProjectId(id), JSON.stringify(cache)),
    remove: async (id) => bridge.remove(checkProjectId(id)),
    async usage() {
      return { used: (await bridge.usage()).used, allowed: null, persisted: null };
    },
  };
}
