/*
 * The media of saved projects in the desktop app (408 T051, D1). A file the user picked or dropped is referenced where
 * it is, never copied, moved or deleted: `library/media-index.json` maps its media id to its path, size and
 * modification time, and only this process writes it; the page names files by id only. A file the app made is written
 * in pieces to `library/media/<id>.part`, then kept as `library/media/<id>` (owned). The page plays and decodes kept
 * files through chitthi-media://<id>, answered here with Range support for ids whose file still has the recorded size
 * and time (else 404, and the page shows the clip as missing). Find file… reconnects a moved file, and the other
 * missing files with the same name and size in the chosen folder.
 */
const fsp = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { BrowserWindow, dialog, protocol } = require('electron');
const { handle } = require('./ipc.cjs');

const ID = /^[A-Za-z0-9_-]{1,100}$/;
/** Names Windows keeps for devices, whatever the extension: media/CON would be the console, not a file. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const INDEX = 'media-index.json';
const PART = '.part';
/** The largest app-made file accepted, bytes. */
const OWNED_MAX = 64 * 1024 ** 3;
/** The most ids one status or sweep call may name. */
const IDS_MAX = 100_000;
const SCHEME = 'chitthi-media';

const TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
};

/**
 * A checked media id.
 * @param {unknown} id what the page sent
 * @returns {string} the id
 * @throws {Error} for anything that isn't an id, or is a name Windows keeps for a device
 */
function requireId(id) {
  if (typeof id !== 'string' || !ID.test(id) || RESERVED.test(id)) throw new Error('Invalid id');
  return id;
}

/**
 * A checked list of media ids.
 * @param {unknown} ids what the page sent
 * @returns {string[]} the ids
 * @throws {Error} when it isn't a list of ids
 */
function requireIds(ids) {
  if (!Array.isArray(ids) || ids.length > IDS_MAX) throw new Error('Invalid ids');
  return ids.map(requireId);
}

/**
 * A piece of an app-made file as bytes.
 * @param {unknown} data what the page sent (an ArrayBuffer over IPC)
 * @returns {Uint8Array} its bytes
 * @throws {Error} when it isn't binary data
 */
function requireBytes(data) {
  if (Object.prototype.toString.call(data) === '[object ArrayBuffer]') return new Uint8Array(/** @type {ArrayBuffer} */ (data));
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('Invalid data');
}

/**
 * @typedef {{ path: string, size: number, mtime: number, owned?: true }} MediaEntry
 * @typedef {{ state: 'ok' | 'missing' | 'changed', size: number }} MediaStatus
 */

/**
 * An index entry read from disk, or null when it isn't one.
 * @param {unknown} value the entry as parsed
 * @returns {MediaEntry | null} the entry
 */
function entryOf(value) {
  if (!value || typeof value !== 'object') return null;
  const { path: file, size, mtime, owned } = /** @type {Record<string, unknown>} */ (value);
  if (typeof file !== 'string' || !path.isAbsolute(file) || typeof size !== 'number' || typeof mtime !== 'number') return null;
  return owned === true ? { path: file, size, mtime, owned } : { path: file, size, mtime };
}

/**
 * A file's size and time, when it is a file.
 * @param {typeof fsp} fs the file system
 * @param {unknown} file a path
 * @returns {Promise<{ size: number, mtime: number } | null>} null when there is no such file
 */
async function fileInfo(fs, file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  const stats = await fs.stat(file).catch(() => null);
  return stats && stats.isFile() ? { size: stats.size, mtime: stats.mtimeMs } : null;
}

/**
 * How a kept file is now.
 * @param {typeof fsp} fs the file system
 * @param {MediaEntry | undefined} entry its index entry
 * @returns {Promise<MediaStatus>} ok, missing or changed
 */
async function check(fs, entry) {
  const info = entry ? await fileInfo(fs, entry.path) : null;
  if (!entry || !info) return { state: 'missing', size: 0 };
  const same = info.size === entry.size && info.mtime === entry.mtime;
  return { state: same ? 'ok' : 'changed', size: info.size };
}

/**
 * The index file, read once and written whole (to .tmp, then renamed), each write after the one before.
 * @param {string} library the library folder
 * @param {typeof fsp} fs the file system
 * @returns {{ load(): Promise<Map<string, MediaEntry>>, save(media: Map<string, MediaEntry>): Promise<void> }} the index
 */
function createIndex(library, fs) {
  const indexFile = path.join(library, INDEX);
  /** @type {Promise<Map<string, MediaEntry>> | null} */
  let loading = null;
  let saving = Promise.resolve();
  const read = async () => {
    const parsed = JSON.parse(await fs.readFile(indexFile, 'utf8'));
    const media = new Map();
    for (const [id, value] of Object.entries(parsed && typeof parsed.media === 'object' ? parsed.media : {})) {
      const entry = entryOf(value);
      if (ID.test(id) && entry) media.set(id, entry);
    }
    return media;
  };
  return {
    load() {
      loading ??= read().catch(() => new Map());
      return loading;
    },
    save(media) {
      const write = async () => {
        await fs.mkdir(library, { recursive: true });
        const tmp = `${indexFile}.${process.pid}.tmp`;
        try {
          await fs.writeFile(tmp, JSON.stringify({ version: 1, media: Object.fromEntries(media) }));
          await fs.rename(tmp, indexFile);
        } catch (error) {
          await fs.rm(tmp, { force: true }).catch(() => undefined);
          throw error;
        }
      };
      saving = saving.then(write, write);
      return saving;
    },
  };
}

/**
 * The bytes to serve for a Range header.
 * @param {string | null} range the header
 * @param {number} size the file's size
 * @returns {{ start: number, end: number } | null | 'unsatisfiable'} null for the whole file
 */
function rangeOf(range, size) {
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!match) return null;
  const [, from = '', to = ''] = match;
  if (!from && !to) return 'unsatisfiable';
  if (!from) {
    const length = Math.min(Number(to), size);
    return length > 0 ? { start: size - length, end: size - 1 } : 'unsatisfiable';
  }
  const start = Number(from);
  const end = to ? Math.min(Number(to), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : 'unsatisfiable';
}

/**
 * The chitthi-media://<id> handler: the kept file, whole or a range; 404 for anything else.
 * @param {ReturnType<typeof createIndex>} index the media index
 * @param {typeof fsp} fs the file system
 * @param {string} origin the page's origin (CORS)
 * @returns {(request: Request) => Promise<Response>} the handler
 */
function createServer(index, fs, origin) {
  const cors = { 'Access-Control-Allow-Origin': origin };
  const notFound = () => new Response('Not found', { status: 404, headers: cors });
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: cors });
    const url = URL.parse(request.url);
    const id = url ? url.hostname : '';
    if (!url || !ID.test(id) || (url.pathname !== '' && url.pathname !== '/')) return notFound();
    const entry = (await index.load()).get(id);
    if (!entry || (await check(fs, entry)).state !== 'ok') return notFound();
    const { size } = entry;
    const range = rangeOf(request.headers.get('Range'), size);
    const extension = /** @type {keyof typeof TYPES} */ (path.extname(entry.path).toLowerCase());
    const headers = { ...cors, 'Accept-Ranges': 'bytes', 'Content-Type': TYPES[extension] || 'application/octet-stream' };
    if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
    const { start, end } = range ?? { start: 0, end: size - 1 };
    const length = Math.max(0, end - start + 1);
    const read = () => /** @type {ReadableStream} */ (Readable.toWeb(createReadStream(entry.path, { start, end })));
    const body = request.method === 'HEAD' || length === 0 ? null : read();
    const sized = { ...headers, 'Content-Length': String(length) };
    if (!range) return new Response(body, { status: 200, headers: sized });
    return new Response(body, { status: 206, headers: { ...sized, 'Content-Range': `bytes ${start}-${end}/${size}` } });
  };
}

/**
 * App-made files, written in pieces to media/<id>.part and kept as media/<id> (owned).
 * @param {string} folder the media folder (library/media)
 * @param {ReturnType<typeof createIndex>} index the media index
 * @param {typeof fsp} fs the file system
 * @returns the writer, and the ids being written (which sweep leaves alone)
 */
function createOwnedWriter(folder, index, fs) {
  /** @type {Map<string, Promise<import('node:fs/promises').FileHandle>>} id → its open .part file */
  const writing = new Map();
  return {
    writing,
    /**
     * Writes a piece of an app-made file into media/<id>.part.
     * @param {string} id its media id
     * @param {number} position where the piece goes, bytes
     * @param {ArrayBuffer} data the piece
     */
    async writeOwned(id, position, data) {
      requireId(id);
      const bytes = requireBytes(data);
      if (!Number.isSafeInteger(position) || position < 0 || position + bytes.length > OWNED_MAX) throw new Error('Invalid position');
      let opening = writing.get(id);
      if (!opening) {
        opening = fs.mkdir(folder, { recursive: true }).then(() => fs.open(path.join(folder, `${id}${PART}`), 'w'));
        writing.set(id, opening);
      }
      await (await opening).write(bytes, 0, bytes.length, position);
    },
    /**
     * Finishes an app-made file: kept as media/<id>, or (keep = false) its .part removed.
     * @param {string} id its media id
     * @param {boolean} keep whether to keep it
     */
    async finishOwned(id, keep) {
      requireId(id);
      const opening = writing.get(id);
      if (!opening) throw new Error('Nothing written');
      writing.delete(id);
      const part = path.join(folder, `${id}${PART}`);
      await (await opening).close();
      if (keep !== true) {
        await fs.rm(part, { force: true });
        return;
      }
      const kept = path.join(folder, id);
      await fs.rename(part, kept);
      const info = await fileInfo(fs, kept);
      if (!info) throw new Error('Not kept');
      const media = await index.load();
      media.set(id, { path: kept, ...info, owned: true });
      await index.save(media);
    },
  };
}

/**
 * Find file…: the user chooses where a missing file is now; other missing files with the same name and size in that
 * folder are reconnected too (not app-made ones, which live in media/).
 * @param {{ index: ReturnType<typeof createIndex>, fs: typeof fsp, chooseFile: (name: string, folder: string) => Promise<string | null> }} deps the index, file system and dialog
 * @param {string} id the missing file's media id
 * @returns {Promise<{ found: string[] } | null>} the ids reconnected; null when cancelled
 */
async function findFile({ index, fs, chooseFile }, id) {
  requireId(id);
  const media = await index.load();
  const entry = media.get(id);
  if (!entry) throw new Error('Unknown media');
  const chosen = await chooseFile(path.basename(entry.path), path.dirname(entry.path));
  if (chosen === null) return null;
  const info = await fileInfo(fs, chosen);
  if (!info) throw new Error('Invalid file');
  // The user's own file now, never one sweep may delete.
  media.set(id, { path: chosen, ...info });
  const found = [id];
  const near = path.dirname(chosen);
  for (const [other, otherEntry] of media) {
    if (other === id || otherEntry.owned || (await check(fs, otherEntry)).state === 'ok') continue;
    const candidate = path.join(near, path.basename(otherEntry.path));
    const candidateInfo = await fileInfo(fs, candidate);
    if (!candidateInfo || candidateInfo.size !== otherEntry.size) continue;
    media.set(other, { path: candidate, ...candidateInfo });
    found.push(other);
  }
  await index.save(media);
  return { found };
}

/**
 * Forgets every id no project uses; deletes only app-made files in media/ (never the user's), and app-made files the
 * index lost (a crash between the rename and the index write) or stale .part files.
 * @param {{ index: ReturnType<typeof createIndex>, fs: typeof fsp, folder: string, writing: Map<string, unknown> }} deps the index, file system, media folder and the ids being written
 * @param {string[]} used the media ids saved projects still use
 * @returns {Promise<number>} bytes freed
 */
async function sweep({ index, fs, folder, writing }, used) {
  const keep = new Set(requireIds(used));
  const media = await index.load();
  let freed = 0;
  /** @param {string} file a file to delete, its size counted as freed */
  const remove = async (file) => {
    const info = await fileInfo(fs, file);
    await fs.rm(file, { force: true });
    freed += info ? info.size : 0;
  };
  /**
   * @param {string} file a path
   * @returns {boolean} true for a file directly in media/
   */
  const inFolder = (file) => path.dirname(path.resolve(file)) === path.resolve(folder);
  for (const [id, entry] of [...media]) {
    if (keep.has(id)) continue;
    media.delete(id);
    if (entry.owned && inFolder(entry.path)) await remove(entry.path);
  }
  await index.save(media);
  for (const name of await fs.readdir(folder).catch(() => [])) {
    const part = name.endsWith(PART);
    const id = part ? name.slice(0, -PART.length) : name;
    if (!ID.test(id) || writing.has(id) || (!part && (keep.has(id) || media.has(id)))) continue;
    await remove(path.join(folder, name));
  }
  return freed;
}

/**
 * The media handlers over the library folder.
 * @param {string} library the library folder (userData/library)
 * @param {{
 *   fs?: typeof fsp,
 *   chooseFile?: (name: string, folder: string) => Promise<string | null>,
 *   origin?: string,
 * }} [options] the file system, Find file…'s dialog (faked in tests) and the page's origin (CORS)
 * @returns the handlers
 */
function createMedia(library, { fs = fsp, chooseFile = () => Promise.resolve(null), origin = 'app://chitthi' } = {}) {
  const folder = path.join(library, 'media');
  const index = createIndex(library, fs);
  const owned = createOwnedWriter(folder, index, fs);
  return {
    serve: createServer(index, fs, origin),
    /**
     * References a file the user picked or dropped where it is.
     * @param {string} id its media id
     * @param {string} file its path, from the preload's webUtils.getPathForFile ('' for a file with no place on disk)
     * @returns {Promise<boolean>} false when it has no path (the page then keeps it as an app-made file)
     */
    async register(id, file) {
      requireId(id);
      if (file === '') return false;
      const info = await fileInfo(fs, file);
      if (!info) throw new Error('Invalid file');
      const media = await index.load();
      media.set(id, { path: file, ...info });
      await index.save(media);
      return true;
    },
    writeOwned: owned.writeOwned,
    finishOwned: owned.finishOwned,
    /**
     * How kept files are now.
     * @param {string[]} ids media ids
     * @returns {Promise<Record<string, MediaStatus>>} by id
     */
    async status(ids) {
      const checked = requireIds(ids);
      const media = await index.load();
      return Object.fromEntries(await Promise.all(checked.map(async (id) => [id, await check(fs, media.get(id))])));
    },
    /** @returns {Promise<number>} free bytes on the library's disk */
    async freeSpace() {
      await fs.mkdir(library, { recursive: true });
      const stats = await fs.statfs(library);
      return stats.bavail * stats.bsize;
    },
    /**
     * Find file… (see findFile).
     * @param {string} id the missing file's media id
     * @returns {Promise<{ found: string[] } | null>} the ids reconnected; null when cancelled
     */
    findFile: (id) => findFile({ index, fs, chooseFile }, id),
    /**
     * Forgets unused ids (see sweep).
     * @param {string[]} used the media ids saved projects still use
     * @returns {Promise<number>} bytes freed
     */
    sweep: (used) => sweep({ index, fs, folder, writing: owned.writing }, used),
  };
}

/**
 * Registers the media handlers (`media:*`) and the chitthi-media:// scheme (after the app is ready; the scheme itself
 * is made privileged in main.cjs before then).
 * @param {string} library the library folder (userData/library)
 * @param {{ origin?: string }} [options] the page's origin
 * @returns {ReturnType<typeof createMedia>} the handlers
 */
function registerMedia(library, { origin } = {}) {
  /**
   * Find file…'s dialog.
   * @param {string} name the missing file's name
   * @param {string} folder where it was
   * @returns {Promise<string | null>} the chosen path; null when cancelled
   */
  const chooseFile = async (name, folder) => {
    const extension = path.extname(name).slice(1);
    const window = BrowserWindow.getFocusedWindow();
    const options = {
      title: `Find “${name}”`,
      defaultPath: path.join(folder, name),
      properties: /** @type {const} */ (['openFile']),
      filters: extension ? [{ name: extension.toUpperCase(), extensions: [extension] }, { name: 'All files', extensions: ['*'] }] : [],
    };
    const { canceled, filePaths } = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    return canceled || !filePaths[0] ? null : filePaths[0];
  };
  const media = createMedia(library, { chooseFile, origin });
  protocol.handle(SCHEME, (request) => media.serve(request));
  handle('media:register', (_event, id, file) => media.register(id, file));
  handle('media:writeOwned', (_event, id, position, data) => media.writeOwned(id, position, data));
  handle('media:finishOwned', (_event, id, keep) => media.finishOwned(id, keep));
  handle('media:status', (_event, ids) => media.status(ids));
  handle('media:freeSpace', () => media.freeSpace());
  handle('media:findFile', (_event, id) => media.findFile(id));
  handle('media:sweep', (_event, used) => media.sweep(used));
  return media;
}

/**
 * The scheme's privileges (408 T001): a standard, secure origin that fetch, <video> and workers may read with Range
 * requests and CORS. Not bypassCSP: the page's CSP lists chitthi-media: in media-src and connect-src (csp.cjs).
 */
const MEDIA_PRIVILEGES = Object.freeze({ standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true });

module.exports = { createMedia, registerMedia, MEDIA_SCHEME: SCHEME, MEDIA_PRIVILEGES };
