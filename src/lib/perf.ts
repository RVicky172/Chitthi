import { isObjectLike } from '../engine/guards';
import { desktop, type AppMetrics } from '../platform/desktop';
import { getState, historyStats } from '../state/store';
import { recentErrors } from './errors';

/*
 * Performance sampler for the performance monitor. It runs only while the monitor is open (start/stop), pauses while
 * the page is hidden, and keeps the last two minutes of one-second samples for the sparklines and the copied report.
 *
 * What can be measured depends on where Chitthi runs:
 *   - desktop: real CPU and memory per Electron process (app.getAppMetrics in the main process);
 *   - web: browsers don't expose CPU use, so "main thread busy" is estimated from long tasks (work that blocked the
 *     page for 50 ms or more) and timer delay; JS heap size is Chromium-only.
 */

/** One second of measurements. */
export interface PerfSample {
  /** When it was taken, ms since 1970. */
  t: number;
  /** Frames drawn in the last second (the page draws only when something changes, so idle is low by design). */
  fps: number;
  /** Share of the last second spent in long tasks, 0-100 (estimate of main-thread load). */
  busy: number;
  /** Worst timer delay in the last second, ms (how long input would have waited). */
  lag: number;
  longTasks: number;
  /** JS heap in use, bytes (Chromium only). */
  heap?: number;
  heapLimit?: number;
  /** Elements in the page. */
  dom: number;
  /** Photos on the design. */
  photos: number;
  /** Decoded photo pixels held in memory (original + prepared image), bytes, estimated at 4 bytes a pixel. */
  photoBytes: number;
  /** Undo steps, and bytes of processed photo canvases only the undo history still holds. */
  undoSteps: number;
  undoBytes: number;
  /** Desktop: CPU of all Chitthi processes as a share of the whole machine, 0-100. */
  cpu?: number;
  /** Desktop: CPU per process type, % of one core. */
  cpuBy?: Record<string, number>;
  /** Desktop: working set of all Chitthi processes, bytes. */
  mem?: number;
}

/** What the monitor knows about the machine and what it can measure. */
export interface PerfInfo {
  where: 'desktop' | 'web';
  cores: number;
  /** Storage used by this site / the app's data, bytes. */
  storageUsed?: number;
  storageQuota?: number;
  systemMemory?: number;
  longTaskSupported: boolean;
  heapSupported: boolean;
}

/** Samples kept: two minutes. */
const KEEP = 120;
/** Called with every new sample. */
type Listener = (samples: PerfSample[], info: PerfInfo) => void;

/** Chromium's heap figures (`performance.memory`). */
interface HeapMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/**
 * Chromium's heap figures.
 * @returns them, or undefined in other browsers
 */
function heapMemory(): HeapMemory | undefined {
  if (!('memory' in performance)) return undefined;
  const { memory } = performance;
  if (!isObjectLike(memory) || typeof memory.usedJSHeapSize !== 'number' || typeof memory.jsHeapSizeLimit !== 'number') return undefined;
  return { usedJSHeapSize: memory.usedJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit };
}

const listeners = new Set<Listener>();
let samples: PerfSample[] = [];
const info: PerfInfo = {
  where: desktop?.metrics ? 'desktop' : 'web',
  cores: navigator.hardwareConcurrency || 1,
  // Older browsers lack the PerformanceObserver or its list of entry types.
  longTaskSupported:
    typeof PerformanceObserver !== 'undefined' && 'supportedEntryTypes' in PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('longtask'),
  heapSupported: !!heapMemory(),
};

/** What the current second has counted so far. */
const counts = { frames: 0, longMs: 0, longTasks: 0, lagMax: 0 };
/** The sampler's timers and observer while it runs. */
const timers = { running: false, animationFrame: 0, sampleTimer: 0, lagTimer: 0, storageTimer: 0, lastLag: 0 };
let observer: PerformanceObserver | null = null;

/** Starts a new second's counts. */
function resetCounts(): void {
  counts.frames = 0;
  counts.longMs = 0;
  counts.longTasks = 0;
  counts.lagMax = 0;
}

/**
 * The decoded photos the design holds.
 * @returns how many, and their pixels' bytes
 */
function photoBytes(): { count: number; bytes: number } {
  let bytes = 0;
  const { photos } = getState();
  for (const photo of photos) {
    bytes += photo.sw * photo.sh * 4;
    const original = photo.orig;
    // The original counts too when the drawing source is a processed copy of it.
    if (!Object.is(original, photo.src)) bytes += original.naturalWidth * original.naturalHeight * 4;
  }
  return { count: photos.length, bytes };
}

/** Reads the storage used and the quota (every 15 s while the monitor is open). */
async function refreshStorage(): Promise<void> {
  // Not available outside secure contexts.
  if (!('storage' in navigator)) return;
  try {
    const estimate = await navigator.storage.estimate();
    info.storageUsed = estimate.usage;
    info.storageQuota = estimate.quota;
  } catch {
    /* not available */
  }
}

/**
 * Adds the desktop app's CPU and memory figures to a sample.
 * @param metrics every Chitthi process's CPU and memory
 * @param perfSample the sample to fill in
 */
function addMetrics(metrics: AppMetrics, perfSample: PerfSample): void {
  const cpuByType: Record<string, number> = {};
  let cpu = 0;
  let memory = 0;
  for (const process of metrics.procs) {
    cpuByType[process.type] = Math.round(((cpuByType[process.type] ?? 0) + process.cpu) * 10) / 10;
    cpu += process.cpu;
    memory += process.mem;
  }
  info.cores = metrics.cores;
  info.systemMemory = metrics.systemMemory;
  perfSample.cpu = Math.round((cpu / metrics.cores) * 10) / 10;
  perfSample.cpuBy = cpuByType;
  perfSample.mem = memory;
}

/** Takes one second's sample and hands the list to the listeners (skipped while the page is hidden). */
async function sample(): Promise<void> {
  if (document.hidden) {
    resetCounts();
    return;
  }
  const heap = heapMemory();
  const photos = photoBytes();
  const history = historyStats();
  const perfSample: PerfSample = {
    t: Date.now(),
    fps: counts.frames,
    busy: Math.min(100, Math.round(counts.longMs / 10)),
    lag: Math.round(counts.lagMax),
    longTasks: counts.longTasks,
    heap: heap?.usedJSHeapSize,
    heapLimit: heap?.jsHeapSizeLimit,
    dom: document.getElementsByTagName('*').length,
    photos: photos.count,
    photoBytes: photos.bytes,
    undoSteps: history.steps,
    undoBytes: history.bytes,
  };
  resetCounts();
  if (desktop?.metrics) {
    try {
      addMetrics(await desktop.metrics(), perfSample);
    } catch {
      /* main process busy: skip this second */
    }
  }
  if (!timers.running) return;
  samples = [...samples.slice(-(KEEP - 1)), perfSample];
  for (const listener of listeners) listener(samples, info);
}

/** Counts a frame and asks for the next. */
function frame(): void {
  counts.frames++;
  timers.animationFrame = requestAnimationFrame(frame);
}

/** Starts sampling (once). */
function start(): void {
  if (timers.running) return;
  timers.running = true;
  timers.animationFrame = requestAnimationFrame(frame);
  if (info.longTaskSupported) {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        counts.longMs += entry.duration;
        counts.longTasks++;
      }
    });
    observer.observe({ type: 'longtask' });
  }
  // Timer delay: a 100 ms interval that should fire on time; how late it runs is how long input would wait.
  timers.lastLag = performance.now();
  timers.lagTimer = window.setInterval(() => {
    const now = performance.now();
    counts.lagMax = Math.max(counts.lagMax, now - timers.lastLag - 100);
    timers.lastLag = now;
  }, 100);
  timers.sampleTimer = window.setInterval(() => void sample(), 1000);
  void refreshStorage();
  timers.storageTimer = window.setInterval(() => void refreshStorage(), 15000);
}

/** Stops sampling. */
function stop(): void {
  timers.running = false;
  cancelAnimationFrame(timers.animationFrame);
  clearInterval(timers.sampleTimer);
  clearInterval(timers.lagTimer);
  clearInterval(timers.storageTimer);
  observer?.disconnect();
  observer = null;
}

/**
 * Listen to samples; sampling runs while anyone listens.
 * @param listener called at once and with every new sample
 * @returns the unsubscribe function
 */
export function watchPerf(listener: Listener): () => void {
  listeners.add(listener);
  start();
  listener(samples, info);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stop();
      samples = [];
    }
  };
}

/**
 * One figure of every sample that has it.
 * @param field the figure
 * @returns its values
 */
const valuesOf = (field: keyof PerfSample): number[] =>
  samples.map((perfSample) => perfSample[field]).filter((value): value is number => typeof value === 'number');

/**
 * The average of a figure, to one decimal.
 * @param field the figure
 * @returns the average, or null when no sample has it
 */
function average(field: keyof PerfSample): number | null {
  const values = valuesOf(field);
  return values.length ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10 : null;
}

/**
 * The highest value of a figure.
 * @param field the figure
 * @returns the highest, or null when no sample has it
 */
function highest(field: keyof PerfSample): number | null {
  const values = valuesOf(field);
  return values.length ? Math.max(...values) : null;
}

/**
 * A plain JSON report of the samples so far, for copying into an issue or a spreadsheet.
 * @returns the report: the machine, a summary, the recent errors and every sample
 */
export function perfReport(): string {
  return JSON.stringify(
    {
      app: 'Chitthi',
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
      info,
      summary: {
        seconds: samples.length,
        cpuAvg: average('cpu'),
        cpuMax: highest('cpu'),
        busyAvg: average('busy'),
        busyMax: highest('busy'),
        lagMax: highest('lag'),
        longTasks: samples.reduce((total, perfSample) => total + perfSample.longTasks, 0),
        fpsAvg: average('fps'),
        heapMax: highest('heap'),
        memMax: highest('mem'),
        domMax: highest('dom'),
        photoBytesMax: highest('photoBytes'),
        undoBytesMax: highest('undoBytes'),
      },
      errors: recentErrors(),
      samples,
    },
    null,
    1,
  );
}
