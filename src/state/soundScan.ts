/*
 * The background scanner (208 §3, D5): every media file with sound is scanned once, one file at a time, in a module
 * Worker (soundScan.worker.ts), so an import never waits for it. Scans are kept in memory by media id (the media's
 * object URL, which a clip's splits and copies share) and dropped with the media; they aren't saved.
 */
import type { SoundScan } from '../engine/soundScan';
import { logError } from '../lib/errors';

/** What the scanner shows: whether it is working, how far into which file, and the scans so far. */
export interface ScanSnapshot {
  busy: boolean;
  progress: { media: string; share: number } | null;
  scans: ReadonlyMap<string, SoundScan>;
}

/** A file waiting for its scan. */
interface Waiting {
  media: string;
  file: Blob;
}

let snapshot: ScanSnapshot = { busy: false, progress: null, scans: new Map() };
const listeners = new Set<() => void>();
let queue: Waiting[] = [];
let current: { media: string; controller: AbortController } | null = null;

/**
 * Replaces the snapshot and tells the listeners.
 * @param patch what changed
 */
function publish(patch: Partial<ScanSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

/**
 * The scanner's state, for `useSyncExternalStore`.
 * @returns the snapshot (a new object after each change)
 */
export const scanSnapshot = (): ScanSnapshot => snapshot;

/**
 * Listens to the scanner.
 * @param listener called after each change
 * @returns the unsubscribe function
 */
export function subscribeScans(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A media file's scan.
 * @param media the media id
 * @returns its scan, or undefined while it is measured (or when it has no sound)
 */
export const scanOf = (media: string): SoundScan | undefined => snapshot.scans.get(media);

/* ---------- the worker ---------- */

let worker: Worker | null = null;
let lastId = 0;
const pending = new Map<number, { resolve: (scan: SoundScan | null) => void; reject: (error: Error) => void; progress: (share: number) => void }>();

/** The worker's replies. */
interface ScanReply {
  id: number;
  scan?: SoundScan | null;
  share?: number;
  error?: string;
}

/**
 * The worker, started once (and again after it failed).
 * @returns the worker
 */
function getWorker(): Worker {
  if (worker) return worker;
  const started = new Worker(new URL('./soundScan.worker.ts', import.meta.url), { type: 'module', name: 'chitthi-scan' });
  started.onmessage = (event: MessageEvent<ScanReply>) => {
    const { id, scan, share, error } = event.data;
    const waiting = pending.get(id);
    if (!waiting) return;
    if (share !== undefined) {
      waiting.progress(share);
      return;
    }
    pending.delete(id);
    if (error === undefined) waiting.resolve(scan ?? null);
    else waiting.reject(new Error(error));
  };
  started.onerror = (event) => {
    for (const waiting of pending.values()) waiting.reject(new Error(`The sound scanner couldn’t start: ${event.message || 'worker error'}`));
    pending.clear();
    worker = null;
    started.terminate();
  };
  worker = started;
  return started;
}

/**
 * Scans a file in the worker.
 * @param file the file
 * @param signal stops the scan
 * @param progress called with the share done
 * @returns the scan, or null when the file has no sound the browser can decode (or there are no workers here)
 */
function scanInWorker(file: Blob, signal: AbortSignal, progress: (share: number) => void): Promise<SoundScan | null> {
  if (typeof Worker === 'undefined') return Promise.resolve(null);
  const target = getWorker();
  const id = ++lastId;
  return new Promise<SoundScan | null>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    signal.addEventListener(
      'abort',
      () => {
        pending.delete(id);
        target.postMessage({ id, cancel: true });
        reject(new DOMException('Scan cancelled', 'AbortError'));
      },
      { once: true },
    );
    target.postMessage({ id, file });
  });
}

/** How files are scanned (tests put a fake decoder here: Node has no Worker or decoders). */
export const scanIO = { scan: scanInWorker };

/* ---------- the queue ---------- */

/** Scans the next file in the queue, after the current one. */
function next(): void {
  if (current) return;
  const waiting = queue.shift();
  if (!waiting) {
    publish({ busy: false, progress: null });
    return;
  }
  const { media, file } = waiting;
  const controller = new AbortController();
  current = { media, controller };
  publish({ busy: true, progress: { media, share: 0 } });
  const progress = (share: number) => {
    if (current?.controller === controller) publish({ progress: { media, share } });
  };
  // Through a promise, so a scanner that throws at once is handled like one that rejects.
  Promise.resolve()
    .then(() => scanIO.scan(file, controller.signal, progress))
    .then((scan) => {
      if (scan && !controller.signal.aborted) publish({ scans: new Map(snapshot.scans).set(media, scan) });
    })
    .catch((error: unknown) => {
      if (!controller.signal.aborted) logError('handled', error);
    })
    .finally(() => {
      if (current?.controller === controller) current = null;
      next();
    });
}

/**
 * Scans a media file in the background (D5): queued behind the files before it, and only once.
 * @param media the media id
 * @param file the file
 */
export function scanMedia(media: string, file: Blob): void {
  if (snapshot.scans.has(media) || current?.media === media || queue.some((waiting) => waiting.media === media)) return;
  queue.push({ media, file });
  if (!current) publish({ busy: true });
  // After this task: the import that asked returns first.
  setTimeout(next, 0);
}

/**
 * Drops a media file's scan, stopping it when it is running or waiting.
 * @param media the media id
 */
export function dropScan(media: string): void {
  queue = queue.filter((waiting) => waiting.media !== media);
  if (current?.media === media) {
    current.controller.abort();
    current = null;
    setTimeout(next, 0);
  }
  if (snapshot.scans.has(media)) {
    const scans = new Map(snapshot.scans);
    scans.delete(media);
    publish({ scans });
  }
}

/** Drops every scan and stops the scanner (a new project). */
export function clearScans(): void {
  queue = [];
  current?.controller.abort();
  current = null;
  publish({ busy: false, progress: null, scans: new Map() });
}
