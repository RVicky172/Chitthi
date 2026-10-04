import { segmentOf, setSegment, type AiTarget } from '../../engine/segments';
import { SEG_INPUT, SEG_MEAN, SEG_MODELS, SEG_STD, sizeText, type SegModel } from './models';

/*
 * The segmenter (P1.8), loaded with import() the first time an AI mask is used: finds a photo's subject or sky with an
 * on-device model in a worker (worker.ts) and keeps the map in engine/segments.ts, where AI mask parts read it. Models
 * come from the app (U²-Net-p) or, after the user agrees, from a one-time download that is checked against its SHA-256
 * and kept in the origin's private file system (OPFS; in the desktop app that lives in its data folder). Without OPFS
 * (a private window) a download lasts for the session. Photos never leave the device.
 */

export class SegmentError extends Error {}
/** The model for this target has to be downloaded first; ask the user, then call again with allowDownload. */
export class NeedsDownload extends SegmentError {
  constructor(readonly model: SegModel) {
    super(`Finding the ${model.id === 'skyseg' ? 'sky' : 'subject'} needs a one-time download of ${sizeText(model.bytes)}.`);
  }
}

export interface SegmentOptions {
  /** May download a model that isn't on the device yet (the user agreed). */
  allowDownload?: boolean;
  /** Download progress, 0–1. */
  onProgress?: (share: number) => void;
}

export { SEG_MODELS, sizeText };

/* ---------- models on the device ---------- */

const inMemory = new Map<string, ArrayBuffer>();
/** Longest wait for the next piece of a download. */
const STALL_MS = 60_000;

async function modelDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle('models', { create: true });
  } catch {
    return null;
  }
}

async function storedFile(m: SegModel): Promise<File | null> {
  try {
    const f = await (await (await modelDir())?.getFileHandle(`${m.id}.onnx`))?.getFile();
    return f && f.size === m.bytes ? f : null;
  } catch {
    return null;
  }
}

/** True when the model for a target can be used without downloading anything. */
export async function modelOnDevice(target: AiTarget): Promise<boolean> {
  const m = SEG_MODELS[target];
  return m.bundled || inMemory.has(m.id) || !!(await storedFile(m));
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function download(m: SegModel, onProgress?: (share: number) => void): Promise<ArrayBuffer> {
  // A download that stops sending (a dropped connection that never closes) is given up after STALL_MS without data.
  const abort = new AbortController();
  let stall = setTimeout(() => abort.abort(), STALL_MS);
  const lost = () => new SegmentError('The download stopped. Check the internet connection and try again.');
  let r: Response;
  try {
    r = await fetch(m.url, { credentials: 'omit', signal: abort.signal });
  } catch {
    clearTimeout(stall);
    throw new SegmentError('The model couldn’t be downloaded. Check the internet connection and try again.');
  }
  if (!r.ok || !r.body) {
    clearTimeout(stall);
    throw new SegmentError(`The model couldn’t be downloaded (${r.status}).`);
  }
  const buf = new Uint8Array(m.bytes),
    reader = r.body.getReader();
  let got = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      clearTimeout(stall);
      throw lost();
    }
    clearTimeout(stall);
    const { done, value } = chunk;
    if (done) break;
    stall = setTimeout(() => abort.abort(), STALL_MS);
    if (got + value.length > m.bytes) {
      clearTimeout(stall);
      await reader.cancel();
      throw new SegmentError('The downloaded model isn’t the expected file.');
    }
    buf.set(value, got);
    got += value.length;
    onProgress?.(got / m.bytes);
  }
  if (got !== m.bytes || hex(await crypto.subtle.digest('SHA-256', buf)) !== m.sha256)
    throw new SegmentError('The downloaded model was damaged or has changed, so it wasn’t used. Try again later.');
  // Kept on the device; a copy in memory too, so this session doesn't read it back.
  inMemory.set(m.id, buf.buffer);
  try {
    const w = await (await (await modelDir())?.getFileHandle(`${m.id}.onnx`, { create: true }))?.createWritable();
    if (w) {
      await w.write(buf);
      await w.close();
    }
  } catch {
    /* no OPFS here: the model lasts for this session */
  }
  return buf.buffer;
}

async function modelBytes(m: SegModel, opts: SegmentOptions): Promise<ArrayBuffer> {
  if (m.bundled) {
    const r = await fetch(m.url);
    if (!r.ok) throw new SegmentError(`The ${m.title} model couldn’t be loaded (${r.status}).`);
    return r.arrayBuffer();
  }
  const hit = inMemory.get(m.id) ?? (await (await storedFile(m))?.arrayBuffer());
  if (hit) return hit;
  if (!opts.allowDownload) throw new NeedsDownload(m);
  return download(m, opts.onProgress);
}

/** Deletes a downloaded model from the device (it is downloaded again when next needed). */
export async function forgetModel(target: AiTarget): Promise<void> {
  const m = SEG_MODELS[target];
  inMemory.delete(m.id);
  await (await modelDir())?.removeEntry(`${m.id}.onnx`).catch(() => undefined);
}

/* ---------- the worker ---------- */

let worker: Worker | null = null;
const sent = new Set<string>();
const pending = new Map<number, { ok: (m: Float32Array) => void; fail: (e: Error) => void }>();
let seq = 0;
/** Longest wait for one map, model loading included (the 176 MB sky model loads in seconds). */
const RUN_TIMEOUT = 120_000;

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'chitthi-segment' });
  w.onmessage = (e: MessageEvent<{ id: number; map?: Float32Array; error?: string }>) => {
    const p = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (e.data.map) p?.ok(e.data.map);
    else p?.fail(new SegmentError(`The model couldn’t run: ${e.data.error ?? 'unknown error'}`));
  };
  w.onerror = (e) => {
    // The worker itself failed (it couldn't load): start a new one next time.
    for (const p of pending.values()) p.fail(new SegmentError(`The model couldn’t start: ${e.message || 'worker error'}`));
    pending.clear();
    sent.clear();
    worker = null;
    w.terminate();
  };
  worker = w;
  return w;
}

async function run(m: SegModel, input: Float32Array, opts: SegmentOptions): Promise<Float32Array> {
  const bytes = sent.has(m.id) ? undefined : await modelBytes(m, opts);
  const w = getWorker(),
    id = ++seq;
  // Marked before the reply: the worker handles messages in order, so a later request finds the session.
  if (bytes) sent.add(m.id);
  return new Promise((ok, fail) => {
    // A worker that never answers (it ran out of memory, say) must not leave a mask waiting for ever.
    const timer = setTimeout(() => pending.get(id)?.fail(new SegmentError('The model took too long. Try again.')), RUN_TIMEOUT);
    pending.set(id, {
      ok: (map) => {
        clearTimeout(timer);
        ok(map);
      },
      fail: (e) => {
        clearTimeout(timer);
        pending.delete(id);
        sent.delete(m.id);
        fail(e);
      },
    });
    w.postMessage({ id, model: m.id, bytes, size: SEG_INPUT, input }, [input.buffer]);
  });
}

/** The photo as the models take it: SEG_INPUT square (stretched), RGB planes normalised by ImageNet mean and deviation. */
function modelInput(src: CanvasImageSource): Float32Array {
  const S = SEG_INPUT,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) throw new SegmentError('The photo couldn’t be read.');
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, S, S);
  const px = x.getImageData(0, 0, S, S).data,
    out = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++)
    for (let k = 0; k < 3; k++) out[k * S * S + i] = (px[i * 4 + k] / 255 - SEG_MEAN[k]) / SEG_STD[k];
  c.width = c.height = 0;
  return out;
}

/**
 * Stretches a map to 0–1, as the models' reference code does (rembg for U²-Net-p, VGGT for skyseg): on many photos
 * the raw map is right in shape but low in value (a lotus peaks at 0.08). A flat map (nothing found) stays empty.
 */
export function normalise(map: Float32Array): Float32Array {
  let lo = Infinity,
    hi = -Infinity;
  for (const v of map) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(hi - lo > 0.01)) return map.fill(0);
  const k = 1 / (hi - lo);
  for (let i = 0; i < map.length; i++) map[i] = (map[i] - lo) * k;
  return map;
}

/* ---------- segmenting photos ---------- */

const inFlight = new WeakMap<object, Map<AiTarget, Promise<void>>>();

/**
 * Finds the target in a photo (once per photo source) and keeps the map for its AI mask parts. Throws NeedsDownload
 * when the model must be downloaded first and allowDownload isn't set, SegmentError when it fails.
 */
export function segmentPhoto(src: CanvasImageSource, target: AiTarget, opts: SegmentOptions = {}): Promise<void> {
  if (segmentOf(src, target)) return Promise.resolve();
  const runs = inFlight.get(src) ?? new Map<AiTarget, Promise<void>>();
  const hit = runs.get(target);
  if (hit) return hit;
  const p = run(SEG_MODELS[target], modelInput(src), opts)
    .then((map) => setSegment(src, target, { w: SEG_INPUT, h: SEG_INPUT, data: normalise(map) }))
    .finally(() => runs.delete(target));
  runs.set(target, p);
  inFlight.set(src, runs);
  return p;
}

/** Every target in turn (export and agent tools wait for these before drawing). */
export async function ensureSegments(src: CanvasImageSource, targets: Iterable<AiTarget>, opts: SegmentOptions = {}): Promise<void> {
  for (const t of new Set(targets)) await segmentPhoto(src, t, opts);
}
