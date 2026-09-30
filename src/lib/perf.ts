import { desktop, type AppMetrics } from '../platform/desktop';
import { getState, historyStats } from '../state/store';

/*
 * Performance sampler for the performance monitor. It runs only while the monitor is open (start/stop), pauses while
 * the page is hidden, and keeps the last two minutes of one-second samples for the sparklines and the copied report.
 *
 * What can be measured depends on where Chitthi runs:
 *   - desktop: real CPU and memory per Electron process (app.getAppMetrics in the main process);
 *   - web: browsers don't expose CPU use, so "main thread busy" is estimated from long tasks (work that blocked the
 *     page for 50 ms or more) and timer delay; JS heap size is Chromium-only.
 */

export interface PerfSample {
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
  dom: number;
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

const KEEP = 120;
type Listener = (samples: PerfSample[], info: PerfInfo) => void;

interface HeapPerf {
  memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
}

const listeners = new Set<Listener>();
let samples: PerfSample[] = [];
const info: PerfInfo = {
  where: desktop?.metrics ? 'desktop' : 'web',
  cores: navigator.hardwareConcurrency || 1,
  longTaskSupported: typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask'),
  heapSupported: !!(performance as HeapPerf).memory,
};

let running = false,
  frames = 0,
  longMs = 0,
  longCount = 0,
  lagMax = 0,
  raf = 0,
  tick = 0,
  lagTimer = 0,
  storageTimer = 0,
  observer: PerformanceObserver | null = null,
  lastLag = 0;

function photoBytes(): { n: number; bytes: number } {
  let bytes = 0;
  const ps = getState().photos;
  for (const p of ps) {
    bytes += p.sw * p.sh * 4;
    const o = p.orig;
    if (o && o !== (p.src as unknown)) bytes += (o.naturalWidth || 0) * (o.naturalHeight || 0) * 4;
  }
  return { n: ps.length, bytes };
}

async function refreshStorage(): Promise<void> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e) {
      info.storageUsed = e.usage;
      info.storageQuota = e.quota;
    }
  } catch {
    /* not available */
  }
}

async function sample(): Promise<void> {
  if (document.hidden) {
    frames = longMs = longCount = lagMax = 0;
    return;
  }
  const mem = (performance as HeapPerf).memory,
    ph = photoBytes();
  const s: PerfSample = {
    t: Date.now(),
    fps: frames,
    busy: Math.min(100, Math.round(longMs / 10)),
    lag: Math.round(lagMax),
    longTasks: longCount,
    heap: mem?.usedJSHeapSize,
    heapLimit: mem?.jsHeapSizeLimit,
    dom: document.getElementsByTagName('*').length,
    photos: ph.n,
    photoBytes: ph.bytes,
    undoSteps: 0,
    undoBytes: 0,
  };
  const h = historyStats();
  s.undoSteps = h.steps;
  s.undoBytes = h.bytes;
  frames = longMs = longCount = lagMax = 0;
  if (desktop?.metrics) {
    try {
      const m: AppMetrics = await desktop.metrics();
      const by: Record<string, number> = {};
      let cpu = 0,
        memTotal = 0;
      for (const p of m.procs) {
        by[p.type] = Math.round(((by[p.type] ?? 0) + p.cpu) * 10) / 10;
        cpu += p.cpu;
        memTotal += p.mem;
      }
      info.cores = m.cores;
      info.systemMemory = m.systemMemory;
      s.cpu = Math.round((cpu / m.cores) * 10) / 10;
      s.cpuBy = by;
      s.mem = memTotal;
    } catch {
      /* main process busy: skip this second */
    }
  }
  if (!running) return;
  samples = [...samples.slice(-(KEEP - 1)), s];
  for (const l of listeners) l(samples, info);
}

function frame(): void {
  frames++;
  raf = requestAnimationFrame(frame);
}

function start(): void {
  if (running) return;
  running = true;
  raf = requestAnimationFrame(frame);
  if (info.longTaskSupported) {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longMs += e.duration;
        longCount++;
      }
    });
    observer.observe({ type: 'longtask' });
  }
  // Timer delay: a 100 ms interval that should fire on time; how late it runs is how long input would wait.
  lastLag = performance.now();
  lagTimer = window.setInterval(() => {
    const now = performance.now();
    lagMax = Math.max(lagMax, now - lastLag - 100);
    lastLag = now;
  }, 100);
  tick = window.setInterval(() => void sample(), 1000);
  void refreshStorage();
  storageTimer = window.setInterval(() => void refreshStorage(), 15000);
}

function stop(): void {
  running = false;
  cancelAnimationFrame(raf);
  clearInterval(tick);
  clearInterval(lagTimer);
  clearInterval(storageTimer);
  observer?.disconnect();
  observer = null;
}

/** Listen to samples; sampling runs while anyone listens. Returns the unsubscribe function. */
export function watchPerf(fn: Listener): () => void {
  listeners.add(fn);
  start();
  fn(samples, info);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) {
      stop();
      samples = [];
    }
  };
}

/** A plain JSON report of the samples so far, for copying into an issue or a spreadsheet. */
export function perfReport(): string {
  const avg = (k: keyof PerfSample) => {
    const v = samples.map((s) => s[k]).filter((x): x is number => typeof x === 'number');
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const max = (k: keyof PerfSample) => {
    const v = samples.map((s) => s[k]).filter((x): x is number => typeof x === 'number');
    return v.length ? Math.max(...v) : null;
  };
  return JSON.stringify(
    {
      app: 'Chitthi',
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      screen: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
      info,
      summary: {
        seconds: samples.length,
        cpuAvg: avg('cpu'),
        cpuMax: max('cpu'),
        busyAvg: avg('busy'),
        busyMax: max('busy'),
        lagMax: max('lag'),
        longTasks: samples.reduce((a, s) => a + s.longTasks, 0),
        fpsAvg: avg('fps'),
        heapMax: max('heap'),
        memMax: max('mem'),
        domMax: max('dom'),
        photoBytesMax: max('photoBytes'),
        undoBytesMax: max('undoBytes'),
      },
      samples,
    },
    null,
    1,
  );
}
