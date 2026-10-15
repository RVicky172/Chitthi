import { useSyncExternalStore } from 'react';
import { onSegments, segmentOf, segmentsSeq, type AiTarget } from '../../engine/segments';
import { logError } from '../../lib/errors';
import type { IgItem } from '../../state/instagram';

/*
 * AI masks in the photo editor (P1.8): starting the segmenter for a photo (loaded with import() on first use), what it
 * is doing per photo and target (working, waiting for the user to agree to a download, failed), and a tick that
 * changes when a segmentation arrives, so the stage and thumbnails redraw with it.
 */

/** What the segmenter is doing for one photo and target: working (with progress), waiting for a download, or failed. */
export type AiStatus =
  { state: 'working'; progress?: number } | { state: 'download'; bytes: number } | { state: 'error'; message: string };

const statuses = new Map<string, AiStatus>();
const listeners = new Set<() => void>();
let version = 0;
const putStatus = (key: string, nextStatus: AiStatus | null) => {
  if (nextStatus) statuses.set(key, nextStatus);
  else statuses.delete(key);
  version++;
  listeners.forEach((listener) => {
    listener();
  });
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Finds a target in a photo. When its model isn't on the device yet, it stops at 'download' until called again with
 * allowDownload (the user agreed). Errors are shown in the panel, not thrown.
 * @param item the photo
 * @param target what to find (a person, the sky …)
 * @param allowDownload whether the user agreed to download the model
 */
export async function findWithAi(item: IgItem, target: AiTarget, allowDownload = false): Promise<void> {
  if (segmentOf(item.preview, target)) return;
  const key = `${item.id}:${target}`;
  putStatus(key, { state: 'working' });
  let segmenter: typeof import('../../ai/segment') | null = null;
  try {
    segmenter = await import('../../ai/segment');
    await segmenter.segmentPhoto(item.preview, target, {
      allowDownload,
      onProgress: (progress) => putStatus(key, { state: 'working', progress }),
    });
    putStatus(key, null);
  } catch (error) {
    if (segmenter && error instanceof segmenter.NeedsDownload)
      putStatus(key, { state: 'download', bytes: error.model.bytes });
    else {
      logError('handled', error);
      putStatus(key, { state: 'error', message: error instanceof Error ? error.message : 'The model couldn’t run.' });
    }
  }
}

/**
 * What the segmenter is doing for a photo and target.
 * @param itemId the photo's id
 * @param target the target
 * @returns the status; undefined when idle (found, or not asked)
 */
export function useAiStatus(itemId: string, target: AiTarget): AiStatus | undefined {
  useSyncExternalStore(subscribe, () => version);
  return statuses.get(`${itemId}:${target}`);
}

/**
 * Changes whenever a segmentation arrives: a dependency for drawing a photo with AI masks.
 * @returns the segmentation counter
 */
export const useSegmentsTick = (): number => useSyncExternalStore(onSegments, segmentsSeq);
