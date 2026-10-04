import { useSyncExternalStore } from 'react';
import { onSegments, segmentOf, segmentsSeq, type AiTarget } from '../../engine/segments';
import { logError } from '../../lib/errors';
import type { IgItem } from '../../state/instagram';

/*
 * AI masks in the photo editor (P1.8): starting the segmenter for a photo (loaded with import() on first use), what it
 * is doing per photo and target (working, waiting for the user to agree to a download, failed), and a tick that
 * changes when a segmentation arrives, so the stage and thumbnails redraw with it.
 */

export type AiStatus =
  | { state: 'working'; progress?: number }
  | { state: 'download'; bytes: number }
  | { state: 'error'; message: string };

const status = new Map<string, AiStatus>();
const subs = new Set<() => void>();
let version = 0;
const put = (key: string, s: AiStatus | null) => {
  if (s) status.set(key, s);
  else status.delete(key);
  version++;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

/**
 * Finds a target in a photo. When its model isn't on the device yet, it stops at 'download' until called again with
 * allowDownload (the user agreed). Errors are shown in the panel, not thrown.
 */
export async function findWithAi(item: IgItem, target: AiTarget, allowDownload = false): Promise<void> {
  if (segmentOf(item.preview, target)) return;
  const key = `${item.id}:${target}`;
  put(key, { state: 'working' });
  let seg: typeof import('../../ai/segment') | null = null;
  try {
    seg = await import('../../ai/segment');
    await seg.segmentPhoto(item.preview, target, {
      allowDownload,
      onProgress: (progress) => put(key, { state: 'working', progress }),
    });
    put(key, null);
  } catch (e) {
    if (seg && e instanceof seg.NeedsDownload) put(key, { state: 'download', bytes: e.model.bytes });
    else {
      logError('handled', e);
      put(key, { state: 'error', message: e instanceof Error ? e.message : 'The model couldn’t run.' });
    }
  }
}

/** What the segmenter is doing for a photo and target; undefined when idle (found, or not asked). */
export function useAiStatus(itemId: string, target: AiTarget): AiStatus | undefined {
  useSyncExternalStore(subscribe, () => version);
  return status.get(`${itemId}:${target}`);
}

/** Changes whenever a segmentation arrives: a dependency for drawing a photo with AI masks. */
export const useSegmentsTick = (): number => useSyncExternalStore(onSegments, segmentsSeq);
