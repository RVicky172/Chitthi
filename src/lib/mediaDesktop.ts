import { mediaName, type OpenedMedia } from '../engine/mediaFile';
import { mediaKey } from '../engine/mediaKey';
import type { MediaBridge } from '../platform/desktop';
import { keptAlready, noRoomMessage, type MediaStore } from './mediaStore';

/*
 * The desktop app's media store (408 §4, D1): a file the user picked or dropped is referenced where it is, never
 * copied, moved or deleted; a file the app made (or one with no place on disk) is written into the data folder in
 * pieces. Kept files play and decode through chitthi-media://<id>, served by the main process (electron/media.cjs),
 * which keeps the paths: the page knows ids only.
 */

/** The URL prefix of kept media. */
export const MEDIA_SCHEME = 'chitthi-media://';

/** App-made files cross the bridge in pieces of this many bytes. */
export const OWNED_PIECE = 4 * 1024 * 1024;

/**
 * The desktop app's media store.
 * @param bridge the media handlers of the desktop bridge
 * @returns the store
 */
export function desktopMedia(bridge: MediaBridge): MediaStore {
  const isKept = async (id: string): Promise<boolean> => (await bridge.status([id]))[id]?.state === 'ok';
  const writeOwned = async (id: string, file: Blob, progress?: (share: number) => void): Promise<string | { error: string }> => {
    const name = mediaName(file, 'the file');
    const free = await bridge.freeSpace();
    if (file.size > free) return { error: noRoomMessage(name, file.size, free) };
    try {
      for (let at = 0; at < file.size; at += OWNED_PIECE) {
        await bridge.writeOwned(id, at, await file.slice(at, at + OWNED_PIECE).arrayBuffer());
        progress?.(Math.min(1, (at + OWNED_PIECE) / file.size));
      }
      await bridge.finishOwned(id, true);
      return id;
    } catch (error) {
      await bridge.finishOwned(id, false).catch(() => undefined);
      return { error: `“${name}” couldn’t be kept (${error instanceof Error ? error.message : String(error)}).` };
    }
  };
  const open = async (id: string, name: string, type = ''): Promise<OpenedMedia> => {
    const status = (await bridge.status([id]))[id];
    if (status?.state !== 'ok') return { missing: true, name };
    const url = `${MEDIA_SCHEME}${id}`;
    return { file: { id, url, size: status.size, type, name }, url };
  };
  return {
    async keep(file, owned, progress) {
      if (!(file instanceof Blob)) return keptAlready(file);
      const id = await mediaKey(file);
      const kept = (await isKept(id)) || (!owned && file instanceof File && (await bridge.register(id, file)));
      const result = kept ? id : await writeOwned(id, file, progress);
      if (typeof result === 'string') progress?.(1);
      return result;
    },
    open,
    async relink(id, name = '', type = '') {
      const found = await bridge.findFile(id);
      return found?.found.includes(id) ? open(id, name, type) : null;
    },
    sweep: (used) => bridge.sweep([...used]),
  };
}
