import { mediaName, type OpenedMedia } from '../engine/mediaFile';
import { mediaKey } from '../engine/mediaKey';
import { keptAlready, noRoomMessage, type MediaStore } from './mediaStore';
import type { CopyReply, CopyRequest } from './mediaWeb.worker';

/*
 * The browser's media store (408 §4, D2): every file copied once into the Origin Private File System, `media/<id>`,
 * streamed so a 4 GB video never sits in memory — on the page with createWritable (Chrome, Firefox), in a worker with
 * a sync access handle where file handles can't be written on the page (Safari, lib/mediaWeb.worker.ts). Reopened,
 * a file is disk-backed: Mediabunny's BlobSource and <video> read it as a picked file.
 */

/** What the store needs of the browser (faked in tests). */
export interface OpfsEnv {
  /** The origin's OPFS root; rejects where there is none (a Firefox private window). */
  root(): Promise<FileSystemDirectoryHandle>;
  /** The storage manager, or null without one. */
  storage: Pick<StorageManager, 'estimate' | 'persist'> | null;
  /** Copies a file into `media/<id>` in a worker (sync access handle). */
  copyInWorker(id: string, file: Blob, progress: (share: number) => void): Promise<void>;
  objectUrl(file: Blob): string;
}

/** What a private window without OPFS says when a file is added (R2). */
export const PRIVATE_WINDOW =
  'Files aren’t kept in a private window: the project’s edits are saved, but its photos, videos and sounds stay only until this window closes.';

/**
 * Whether an error is the browser saying storage is full.
 * @param error the error
 * @returns true for a QuotaExceededError
 */
const isQuota = (error: unknown): boolean => error instanceof DOMException && error.name === 'QuotaExceededError';

/**
 * Copies a file on the page, streamed, counting its progress.
 * @param handle the file handle to write
 * @param file the file
 * @param progress told the share copied so far
 */
async function copyOnPage(handle: FileSystemFileHandle, file: Blob, progress?: (share: number) => void): Promise<void> {
  let copied = 0;
  const counting = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      copied += chunk.byteLength;
      if (file.size) progress?.(Math.min(1, copied / file.size));
      controller.enqueue(chunk);
    },
  });
  await file.stream().pipeThrough(counting).pipeTo(await handle.createWritable());
}

/**
 * Copies a file in a worker with a sync access handle.
 * @param id the media id
 * @param file the file
 * @param progress told the share copied so far
 * @returns resolves when it is copied
 */
function copyInWorker(id: string, file: Blob, progress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./mediaWeb.worker.ts', import.meta.url), { type: 'module', name: 'chitthi-media-copy' });
    worker.onmessage = (event: MessageEvent<CopyReply>) => {
      const reply = event.data;
      if ('share' in reply) {
        progress(reply.share);
        return;
      }
      worker.terminate();
      if ('done' in reply) resolve();
      else reject(reply.quota ? new DOMException(reply.error, 'QuotaExceededError') : new Error(reply.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'The copy failed.'));
    };
    worker.postMessage({ id, file } satisfies CopyRequest);
  });
}

/**
 * The real browser's OPFS and storage manager.
 * @returns the environment
 */
export const browserOpfs = (): OpfsEnv => ({
  root: () => navigator.storage.getDirectory(),
  storage: 'storage' in navigator ? navigator.storage : null,
  copyInWorker,
  objectUrl: (file) => URL.createObjectURL(file),
});

/**
 * The browser's media store.
 * @param env the browser's OPFS, storage manager and copiers
 * @returns the store
 */
export function webMedia(env: OpfsEnv = browserOpfs()): MediaStore {
  let folder: Promise<FileSystemDirectoryHandle | null> | null = null;
  const media = () => (folder ??= env.root().then((root) => root.getDirectoryHandle('media', { create: true })).catch(() => null));
  let askedPersist = false;
  const inFlight = new Map<string, Promise<string | { error: string }>>();
  // Never awaited: Firefox's prompt doesn't settle until it is answered (learnings 2026-10-19).
  const askPersistOnce = () => {
    if (askedPersist || !env.storage) return;
    askedPersist = true;
    env.storage.persist().catch(() => undefined);
  };
  const roomLeft = async (): Promise<number | null> => {
    const estimate = await env.storage?.estimate().catch(() => null);
    return estimate?.quota === undefined ? null : Math.max(0, estimate.quota - (estimate.usage ?? 0));
  };
  const sizeOn = async (dir: FileSystemDirectoryHandle, id: string): Promise<number | null> =>
    dir.getFileHandle(id).then((handle) => handle.getFile()).then((file) => file.size, () => null);
  const copy = async (dir: FileSystemDirectoryHandle, id: string, file: Blob, progress?: (share: number) => void): Promise<string | { error: string }> => {
    const name = mediaName(file, 'the file');
    if ((await sizeOn(dir, id)) === file.size) return id;
    askPersistOnce();
    const room = await roomLeft();
    if (room !== null && file.size > room) return { error: noRoomMessage(name, file.size, room) };
    try {
      const handle = await dir.getFileHandle(id, { create: true });
      if ('createWritable' in handle) await copyOnPage(handle, file, progress);
      else await env.copyInWorker(id, file, (share) => progress?.(share));
      return id;
    } catch (error) {
      await dir.removeEntry(id).catch(() => undefined);
      if (isQuota(error)) return { error: noRoomMessage(name, file.size, (await roomLeft()) ?? 0) };
      return { error: `“${name}” couldn’t be kept (${error instanceof Error ? error.message : String(error)}).` };
    }
  };
  return {
    async keep(file, _owned, progress) {
      if (!(file instanceof Blob)) return keptAlready(file);
      const dir = await media();
      if (!dir) return { error: PRIVATE_WINDOW };
      const id = await mediaKey(file);
      // The same file added twice at once is copied once.
      let kept = inFlight.get(id);
      if (!kept) {
        kept = copy(dir, id, file, progress).finally(() => inFlight.delete(id));
        inFlight.set(id, kept);
      }
      const result = await kept;
      if (typeof result === 'string') progress?.(1);
      return result;
    },
    async open(id, name, type = ''): Promise<OpenedMedia> {
      const dir = await media();
      const disk = dir ? await dir.getFileHandle(id).then((handle) => handle.getFile(), () => null) : null;
      if (!disk) return { missing: true, name };
      // OPFS keeps no name or type: given back, so the file shows its name and keeps its media id.
      const file = new File([disk], name, { type: type || disk.type });
      return { file, url: env.objectUrl(file) };
    },
    relink: () => Promise.resolve(null),
    async sweep(used) {
      const dir = await media();
      if (!dir) return 0;
      let freed = 0;
      const unused: string[] = [];
      for await (const name of dir.keys()) if (!used.has(name)) unused.push(name);
      for (const name of unused) {
        freed += (await sizeOn(dir, name)) ?? 0;
        await dir.removeEntry(name).catch(() => undefined);
      }
      return freed;
    },
  };
}
