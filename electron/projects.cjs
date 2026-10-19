/*
 * Saved photo and video projects in the desktop app's data folder (408 T050): `library/projects/<id>.project`, one
 * file per project — its entry (what the Projects list shows) as a JSON header on the first line, then the document
 * text as the page sent it. Writes go to a .tmp file that is then renamed, so an interrupted write leaves the last
 * complete project (AC-1). Listing reads only each header, the file's size and its last byte: a damaged or cut-short
 * file is listed as can't be opened (AC-6), never thrown. The cache sits beside it, `<id>.cache.json`.
 */
const fsp = require('node:fs/promises');
const path = require('node:path');
const { handle, on } = require('./ipc.cjs');

const ID = /^[A-Za-z0-9_-]{1,100}$/;
/** Names Windows keeps for devices, whatever the extension: CON.project would be the console, not a file. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const PROJECT = '.project';
const CACHE = '.cache.json';
/** The longest header line read when listing (an entry with its thumbnail). */
const HEADER_MAX = 1024 * 1024;
/** The largest document or cache accepted from the page. */
const TEXT_MAX = 256 * 1024 * 1024;

/**
 * A checked project id.
 * @param {unknown} id what the page sent
 * @returns {string} the id
 * @throws {Error} for anything that isn't an id, or is a name Windows keeps for a device
 */
function requireId(id) {
  if (typeof id !== 'string' || !ID.test(id) || RESERVED.test(id)) throw new Error('Invalid id');
  return id;
}

/**
 * Checked text from the page.
 * @param {unknown} text what the page sent
 * @returns {string} the text
 * @throws {Error} when it isn't text, or is too long
 */
function requireText(text) {
  if (typeof text !== 'string' || text.length > TEXT_MAX) throw new Error('Invalid project');
  return text;
}

/**
 * The page's entry, as one line of JSON.
 * @param {unknown} text what the page sent
 * @returns {Record<string, unknown>} the entry
 * @throws {Error} when it isn't a JSON object
 */
function requireEntry(text) {
  let entry;
  try {
    entry = JSON.parse(requireText(text));
  } catch {
    throw new Error('Invalid project');
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid project');
  return entry;
}

/**
 * The project handlers over a folder.
 * @param {string} folder the projects folder (library/projects)
 * @param {Pick<typeof fsp, 'mkdir' | 'writeFile' | 'rename' | 'rm' | 'readFile' | 'readdir' | 'stat' | 'open'>} [fs] the file system (a failing one in tests)
 * @returns {{
 *   list(): Promise<Record<string, unknown>[]>,
 *   read(id: string): Promise<string | null>,
 *   write(id: string, doc: string, entry: string): Promise<void>,
 *   readCache(id: string): Promise<string | null>,
 *   writeCache(id: string, cache: string): Promise<void>,
 *   remove(id: string): Promise<number>,
 *   usage(): Promise<{ used: number }>,
 * }} the handlers
 */
function createProjects(folder, fs = fsp) {
  const fileOf = (id, suffix) => path.join(folder, `${requireId(id)}${suffix}`);

  /**
   * Writes a file whole: to .tmp, then renamed over the old one.
   * @param {string} file the file
   * @param {string} text its text
   */
  async function writeWhole(file, text) {
    await fs.mkdir(folder, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      await fs.writeFile(tmp, text);
      await fs.rename(tmp, file);
    } catch (error) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * A file's text, or null when there is none.
   * @param {string} file the file
   * @returns {Promise<string | null>} the text
   */
  const textOf = (file) => fs.readFile(file, 'utf8').catch(() => null);

  /**
   * A file's size, 0 when there is none.
   * @param {string} file the file
   * @returns {Promise<number>} bytes
   */
  const sizeOf = (file) => fs.stat(file).then((stats) => stats.size, () => 0);

  /**
   * A project file's header (its entry and the document's length), its size and its last byte, read without the
   * document.
   * @param {string} file the project file
   * @returns {Promise<{ entry: Record<string, unknown>, docBytes: number, whole: boolean } | null>} null when unreadable
   */
  async function headerOf(file) {
    const handleOf = await fs.open(file, 'r');
    try {
      const { size } = await handleOf.stat();
      const start = Buffer.alloc(Math.min(size, HEADER_MAX));
      await handleOf.read(start, 0, start.length, 0);
      const end = start.indexOf(10);
      if (end < 0) return null;
      const header = JSON.parse(start.subarray(0, end).toString('utf8'));
      if (!header || typeof header !== 'object' || typeof header.docBytes !== 'number' || !header.entry || typeof header.entry !== 'object') return null;
      const last = Buffer.alloc(1);
      if (size > end + 1) await handleOf.read(last, 0, 1, size - 1);
      // Whole: as long as written, ending as a JSON document ends.
      const whole = size === end + 1 + header.docBytes && (last[0] === 0x7d || last[0] === 0x5d);
      return { entry: header.entry, docBytes: header.docBytes, whole };
    } catch {
      return null;
    } finally {
      await handleOf.close();
    }
  }

  /**
   * One listed project.
   * @param {string} id the project's id
   * @returns {Promise<Record<string, unknown>>} its entry with bytes and readable
   */
  async function listed(id) {
    const header = await headerOf(fileOf(id, PROJECT)).catch(() => null);
    if (!header) return { id, readable: false, bytes: await sizeOf(fileOf(id, PROJECT)) };
    const bytes = header.docBytes + (await sizeOf(fileOf(id, CACHE)));
    return { ...header.entry, id, bytes, readable: header.whole };
  }

  async function list() {
    const names = await fs.readdir(folder).catch(() => []);
    const ids = names.filter((name) => name.endsWith(PROJECT) && ID.test(name.slice(0, -PROJECT.length)) && !RESERVED.test(name.slice(0, -PROJECT.length))).map((name) => name.slice(0, -PROJECT.length));
    return Promise.all(ids.map(listed));
  }

  return {
    list,
    async read(id) {
      const text = await textOf(fileOf(id, PROJECT));
      if (text === null) return null;
      const end = text.indexOf('\n');
      return end < 0 ? '' : text.slice(end + 1);
    },
    async write(id, doc, entry) {
      const file = fileOf(id, PROJECT);
      const text = requireText(doc);
      const header = JSON.stringify({ entry: { ...requireEntry(entry), id }, docBytes: Buffer.byteLength(text) });
      await writeWhole(file, `${header}\n${text}`);
    },
    readCache: (id) => textOf(fileOf(id, CACHE)),
    async writeCache(id, cache) {
      await writeWhole(fileOf(id, CACHE), requireText(cache));
    },
    async remove(id) {
      const project = fileOf(id, PROJECT);
      const header = await headerOf(project).catch(() => null);
      const bytes = (header ? header.docBytes : await sizeOf(project)) + (await sizeOf(fileOf(id, CACHE)));
      await fs.rm(project, { force: true });
      await fs.rm(fileOf(id, CACHE), { force: true });
      return bytes;
    },
    async usage() {
      const entries = await list();
      return { used: entries.reduce((sum, item) => sum + (typeof item.bytes === 'number' ? item.bytes : 0), 0) };
    },
  };
}

/**
 * Asks the page to save what it hasn't yet (its autosave's flush) before the window closes, and waits for its answer
 * or the time limit, whichever comes first: a page that hangs never keeps the window open.
 * @param {(id: number) => void} send sends `projects:flush` with a request id to the page
 * @returns {{ ask(limit: number): Promise<boolean>, answered(id: unknown): void }} ask resolves true when the page answered in time
 */
function createFlusher(send) {
  let next = 1;
  /** Requests waiting for the page: id → resolve. */
  const waiting = new Map();
  return {
    ask(limit) {
      const id = next++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          resolve(false);
        }, limit);
        waiting.set(id, () => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve(true);
        });
        try {
          send(id);
        } catch {
          // The page is gone (or going): nothing left to save.
          clearTimeout(timer);
          waiting.delete(id);
          resolve(false);
        }
      });
    },
    answered(id) {
      waiting.get(id)?.();
    },
  };
}

/**
 * Registers the project handlers (`projects:*`) for the app's page.
 * @param {string} folder the projects folder (library/projects)
 * @param {() => Electron.WebContents | null} contents the window's page, asked to flush before it closes
 * @returns {ReturnType<typeof createFlusher>} the flusher (main.cjs asks it when the window closes)
 */
function registerProjects(folder, contents) {
  const projects = createProjects(folder);
  handle('projects:list', () => projects.list());
  handle('projects:read', (_event, id) => projects.read(id));
  handle('projects:write', (_event, id, doc, entry) => projects.write(id, doc, entry));
  handle('projects:readCache', (_event, id) => projects.readCache(id));
  handle('projects:writeCache', (_event, id, cache) => projects.writeCache(id, cache));
  handle('projects:remove', (_event, id) => projects.remove(id));
  handle('projects:usage', () => projects.usage());
  const flusher = createFlusher((id) => {
    const page = contents();
    if (!page || page.isDestroyed()) throw new Error('No page');
    page.send('projects:flush', id);
  });
  on('projects:flushed', (_event, id) => flusher.answered(id));
  return flusher;
}

module.exports = { createFlusher, createProjects, registerProjects };
