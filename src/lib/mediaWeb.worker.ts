/*
 * Copies one file into OPFS `media/<id>` through a sync access handle (408 T041), for browsers whose file handles
 * can't be written on the page (Safari has no createWritable). Reads the file in 4 MB pieces, so a 4 GB video never
 * sits in memory. A failure removes the partial file.
 */

/** What the page asks: the media id and the file. */
export interface CopyRequest {
  id: string;
  file: Blob;
}

/** What the worker answers: progress, done, or why it failed. */
export type CopyReply = { share: number } | { done: true } | { error: string; quota: boolean };

/** A sync access handle, as far as the copy uses it (not in TypeScript's DOM lib for workers here). */
interface SyncHandle {
  write(buffer: ArrayBuffer, options: { at: number }): number;
  flush(): void;
  close(): void;
}

const PIECE = 4 * 1024 * 1024;

/**
 * Copies the file.
 * @param request the media id and the file
 */
async function copy({ id, file }: CopyRequest): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const media = await root.getDirectoryHandle('media', { create: true });
  const handle = await media.getFileHandle(id, { create: true });
  const access = (await (handle as FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncHandle> }).createSyncAccessHandle());
  try {
    for (let at = 0; at < file.size; at += PIECE) {
      access.write(await file.slice(at, at + PIECE).arrayBuffer(), { at });
      postMessage({ share: Math.min(1, (at + PIECE) / file.size) } satisfies CopyReply);
    }
    access.flush();
    access.close();
    postMessage({ done: true } satisfies CopyReply);
  } catch (error) {
    access.close();
    await media.removeEntry(id).catch(() => undefined);
    throw error;
  }
}

self.onmessage = (event: MessageEvent<CopyRequest>) => {
  copy(event.data).catch((error: unknown) => {
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
    postMessage({ error: error instanceof Error ? error.message : String(error), quota } satisfies CopyReply);
  });
};
