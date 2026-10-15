import { segmentOf, setSegment, type AiTarget } from '../../engine/segments';
import { SEG_INPUT, SEG_MEAN, SEG_MODELS, SEG_STD, sizeText, type ModelState, type SegModel } from './models';

/*
 * The segmenter (P1.8), loaded with import() the first time an AI mask is used: finds a photo's subject or sky with an
 * on-device model in a worker (worker.ts) and keeps the map in engine/segments.ts, where AI mask parts read it. Models
 * come from the app (U²-Net-p) or, after the user agrees, from a one-time download that is checked against its SHA-256
 * and kept in the origin's private file system (OPFS; in the desktop app that lives in its data folder). Without OPFS
 * (a private window) a download lasts for the session. Photos never leave the device.
 */

/** A failure the user can act on: a download that stopped, a model that couldn't run. */
export class SegmentError extends Error {}

/** The model for this target has to be downloaded first; ask the user, then call again with allowDownload. */
export class NeedsDownload extends SegmentError {
  /** @param model the model to download */
  constructor(readonly model: SegModel) {
    super(`Finding the ${model.id === 'skyseg' ? 'sky' : 'subject'} needs a one-time download of ${sizeText(model.bytes)}.`);
  }
}

/** How a search may get its model. */
export interface SegmentOptions {
  /** May download a model that isn't on the device yet (the user agreed). */
  allowDownload?: boolean;
  /** Download progress, 0–1. */
  onProgress?: (share: number) => void;
}

export { SEG_MODELS, modelRow, type ModelState } from './models';
export { sizeText };

/* ---------- models on the device ---------- */

const inMemory = new Map<string, ArrayBuffer>();
/** Longest wait for the next piece of a download. */
const STALL_MS = 60_000;

/**
 * The models folder in the origin's private file system.
 * @returns the folder, or null without OPFS
 */
async function modelDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle('models', { create: true });
  } catch {
    return null;
  }
}

/**
 * A model's stored file.
 * @param model the model
 * @returns the file when it is there whole, else null
 */
async function storedFile(model: SegModel): Promise<File | null> {
  try {
    const file = await (await (await modelDir())?.getFileHandle(`${model.id}.onnx`))?.getFile();
    return file?.size === model.bytes ? file : null;
  } catch {
    return null;
  }
}

/**
 * Whether the model for a target can be used without downloading anything.
 * @param target subject or sky
 * @returns true when it is part of the app, in memory or stored
 */
export async function modelOnDevice(target: AiTarget): Promise<boolean> {
  const model = SEG_MODELS[target];
  return model.bundled || inMemory.has(model.id) || !!(await storedFile(model));
}

/**
 * Bytes as hexadecimal.
 * @param buffer the bytes
 * @returns two lower-case digits per byte
 */
const hex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Reads a download into a buffer of the model's size, giving up when it stalls or runs long.
 * @param model the model
 * @param body the response's body
 * @param watchdog restarts the stall timer for each piece; stopped when the download ends
 * @param onProgress download progress, 0–1
 * @returns the bytes and how many arrived
 */
async function readDownload(
  model: SegModel,
  body: ReadableStream<Uint8Array>,
  watchdog: { restart(): void; stop(): void },
  onProgress?: (share: number) => void,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; received: number }> {
  const bytes = new Uint8Array(model.bytes);
  const reader = body.getReader();
  let received = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      watchdog.stop();
      throw new SegmentError('The download stopped. Check the internet connection and try again.');
    }
    watchdog.stop();
    if (chunk.done) return { bytes, received };
    watchdog.restart();
    if (received + chunk.value.length > model.bytes) {
      watchdog.stop();
      await reader.cancel();
      throw new SegmentError('The downloaded model isn’t the expected file.');
    }
    bytes.set(chunk.value, received);
    received += chunk.value.length;
    onProgress?.(received / model.bytes);
  }
}

/**
 * Keeps a downloaded model in the private file system (best effort).
 * @param model the model
 * @param bytes its file
 */
async function keepModel(model: SegModel, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
  try {
    const writable = await (await (await modelDir())?.getFileHandle(`${model.id}.onnx`, { create: true }))?.createWritable();
    if (writable) {
      await writable.write(bytes);
      await writable.close();
    }
  } catch {
    /* no OPFS here: the model lasts for this session */
  }
}

/**
 * Downloads a model, checks its size and SHA-256, and keeps it.
 * @param model the model
 * @param onProgress download progress, 0–1
 * @returns the model file
 */
async function download(model: SegModel, onProgress?: (share: number) => void): Promise<ArrayBuffer> {
  // A download that stops sending (a dropped connection that never closes) is given up after STALL_MS without data.
  const abort = new AbortController();
  let stall = setTimeout(() => abort.abort(), STALL_MS);
  const watchdog = {
    restart: () => {
      stall = setTimeout(() => abort.abort(), STALL_MS);
    },
    stop: () => clearTimeout(stall),
  };
  let response: Response;
  try {
    response = await fetch(model.url, { credentials: 'omit', signal: abort.signal });
  } catch {
    watchdog.stop();
    throw new SegmentError('The model couldn’t be downloaded. Check the internet connection and try again.');
  }
  if (!response.ok || !response.body) {
    watchdog.stop();
    throw new SegmentError(`The model couldn’t be downloaded (${response.status}).`);
  }
  const { bytes, received } = await readDownload(model, response.body, watchdog, onProgress);
  if (received !== model.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== model.sha256)
    throw new SegmentError('The downloaded model was damaged or has changed, so it wasn’t used. Try again later.');
  // Kept on the device; a copy in memory too, so this session doesn't read it back.
  inMemory.set(model.id, bytes.buffer);
  await keepModel(model, bytes);
  return bytes.buffer;
}

/**
 * A model's file: from the app, memory, the device, or a download.
 * @param model the model
 * @param options whether it may be downloaded, and its progress
 * @returns the file
 * @throws NeedsDownload when it must be downloaded and that isn't allowed
 */
async function modelBytes(model: SegModel, options: SegmentOptions): Promise<ArrayBuffer> {
  if (model.bundled) {
    const response = await fetch(model.url);
    if (!response.ok) throw new SegmentError(`The ${model.title} model couldn’t be loaded (${response.status}).`);
    return response.arrayBuffer();
  }
  const hit = inMemory.get(model.id) ?? (await (await storedFile(model))?.arrayBuffer());
  if (hit) return hit;
  if (!options.allowDownload) throw new NeedsDownload(model);
  return download(model, options.onProgress);
}

/**
 * Where the model for a target is (Settings › AI models on this device, 401).
 * @param target subject or sky
 * @returns part of the app, stored, in memory for this session, or none
 */
export async function modelState(target: AiTarget): Promise<ModelState> {
  const model = SEG_MODELS[target];
  if (model.bundled) return 'bundled';
  if (await storedFile(model)) return 'stored';
  return inMemory.has(model.id) ? 'session' : 'none';
}

/**
 * Deletes a downloaded model from the device and from memory, ending the worker if it loaded it (it is downloaded
 * again, after asking, when next needed).
 * @param target subject or sky
 * @returns null, or why it didn't: a model that is part of the app, or a search running (the worker is in use)
 */
export async function deleteModel(target: AiTarget): Promise<string | null> {
  const model = SEG_MODELS[target];
  if (model.bundled) return `The ${model.title} model is part of the app and can’t be deleted.`;
  if (busy > 0) return 'A search with an AI model is running. Try again when it has finished.';
  inMemory.delete(model.id);
  await (await modelDir())?.removeEntry(`${model.id}.onnx`).catch(() => undefined);
  if (worker && sent.has(model.id)) {
    worker.terminate();
    worker = null;
    sent.clear();
  }
  return null;
}

/* ---------- the worker ---------- */

let worker: Worker | null = null;
/** Models the worker has been sent. */
const sent = new Set<string>();
const pending = new Map<number, { resolve: (map: Float32Array) => void; reject: (error: Error) => void }>();
let lastId = 0;
/** Searches running, downloads included: a model isn't deleted under them. */
let busy = 0;
/** Longest wait for one map, model loading included (the 176 MB sky model loads in seconds). */
const RUN_TIMEOUT = 120_000;

/**
 * The worker, started once (and again after it failed).
 * @returns the worker
 */
function getWorker(): Worker {
  if (worker) return worker;
  const started = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'chitthi-segment' });
  started.onmessage = (event: MessageEvent<{ id: number; map?: Float32Array; error?: string }>) => {
    const waiting = pending.get(event.data.id);
    pending.delete(event.data.id);
    if (event.data.map) waiting?.resolve(event.data.map);
    else waiting?.reject(new SegmentError(`The model couldn’t run: ${event.data.error ?? 'unknown error'}`));
  };
  started.onerror = (event) => {
    // The worker itself failed (it couldn't load): start a new one next time.
    for (const waiting of pending.values()) waiting.reject(new SegmentError(`The model couldn’t start: ${event.message || 'worker error'}`));
    pending.clear();
    sent.clear();
    worker = null;
    started.terminate();
  };
  worker = started;
  return started;
}

/**
 * Runs a model, counted as busy while it runs.
 * @param model the model
 * @param input the photo as the model takes it
 * @param options whether its file may be downloaded
 * @returns the map
 */
async function run(model: SegModel, input: Float32Array, options: SegmentOptions): Promise<Float32Array> {
  busy++;
  try {
    return await runModel(model, input, options);
  } finally {
    busy--;
  }
}

/**
 * Sends a photo to the worker (with the model's file the first time) and waits for the map.
 * @param model the model
 * @param input the photo as the model takes it (moved to the worker)
 * @param options whether its file may be downloaded
 * @returns the map
 */
async function runModel(model: SegModel, input: Float32Array, options: SegmentOptions): Promise<Float32Array> {
  const bytes = sent.has(model.id) ? undefined : await modelBytes(model, options);
  const target = getWorker();
  const id = ++lastId;
  // Marked before the reply: the worker handles messages in order, so a later request finds the session.
  if (bytes) sent.add(model.id);
  return new Promise((resolve, reject) => {
    // A worker that never answers (it ran out of memory, say) must not leave a mask waiting for ever.
    const timer = setTimeout(() => pending.get(id)?.reject(new SegmentError('The model took too long. Try again.')), RUN_TIMEOUT);
    pending.set(id, {
      resolve: (map) => {
        clearTimeout(timer);
        resolve(map);
      },
      reject: (error) => {
        clearTimeout(timer);
        pending.delete(id);
        sent.delete(model.id);
        reject(error);
      },
    });
    target.postMessage({ id, model: model.id, bytes, size: SEG_INPUT, input }, [input.buffer]);
  });
}

/**
 * The photo as the models take it: SEG_INPUT square (stretched), RGB planes normalised by ImageNet mean and deviation.
 * @param source the photo
 * @returns the three planes, one after the other
 */
function modelInput(source: CanvasImageSource): Float32Array {
  const side = SEG_INPUT;
  const plane = side * side;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new SegmentError('The photo couldn’t be read.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, side, side);
  const pixels = context.getImageData(0, 0, side, side).data;
  const input = new Float32Array(3 * plane);
  const [redMean, greenMean, blueMean] = SEG_MEAN;
  const [redDeviation, greenDeviation, blueDeviation] = SEG_STD;
  for (let index = 0; index < plane; index++) {
    const at = index * 4;
    input[index] = ((pixels[at] ?? 0) / 255 - redMean) / redDeviation;
    input[plane + index] = ((pixels[at + 1] ?? 0) / 255 - greenMean) / greenDeviation;
    input[2 * plane + index] = ((pixels[at + 2] ?? 0) / 255 - blueMean) / blueDeviation;
  }
  canvas.width = canvas.height = 0;
  return input;
}

/**
 * Stretches a map to 0–1, as the models' reference code does (rembg for U²-Net-p, VGGT for skyseg): on many photos
 * the raw map is right in shape but low in value (a lotus peaks at 0.08). A flat map (nothing found) stays empty.
 * @param map the model's map (changed in place)
 * @returns the map
 */
export function normalise(map: Float32Array): Float32Array {
  let low = Infinity;
  let high = -Infinity;
  for (const value of map) {
    if (value < low) low = value;
    if (value > high) high = value;
  }
  const range = high - low;
  if (Number.isNaN(range) || range <= 0.01) return map.fill(0);
  const scale = 1 / range;
  for (let index = 0; index < map.length; index++) map[index] = ((map[index] ?? 0) - low) * scale;
  return map;
}

/* ---------- segmenting photos ---------- */

const inFlight = new WeakMap<object, Map<AiTarget, Promise<void>>>();

/**
 * Finds the target in a photo (once per photo source) and keeps the map for its AI mask parts.
 * @param source the photo
 * @param target subject or sky
 * @param options whether the model may be downloaded, and its progress
 * @returns resolves when the map is kept
 * @throws NeedsDownload when the model must be downloaded first and allowDownload isn't set; SegmentError when it fails
 */
export function segmentPhoto(source: CanvasImageSource, target: AiTarget, options: SegmentOptions = {}): Promise<void> {
  if (segmentOf(source, target)) return Promise.resolve();
  const runs = inFlight.get(source) ?? new Map<AiTarget, Promise<void>>();
  const hit = runs.get(target);
  if (hit) return hit;
  const search = run(SEG_MODELS[target], modelInput(source), options)
    .then((map) => setSegment(source, target, { w: SEG_INPUT, h: SEG_INPUT, data: normalise(map) }))
    .finally(() => runs.delete(target));
  runs.set(target, search);
  inFlight.set(source, runs);
  return search;
}

/**
 * Every target in turn (export and agent tools wait for these before drawing).
 * @param source the photo
 * @param targets the targets (repeats once)
 * @param options whether models may be downloaded, and their progress
 */
export async function ensureSegments(source: CanvasImageSource, targets: Iterable<AiTarget>, options: SegmentOptions = {}): Promise<void> {
  for (const target of new Set(targets)) await segmentPhoto(source, target, options);
}
