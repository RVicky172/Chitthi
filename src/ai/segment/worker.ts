/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

/*
 * Runs the segmentation models (P1.8) off the page's thread, with ONNX Runtime Web on WebAssembly. One thread: the
 * threaded build needs a cross-origin-isolated page, which Chitthi isn't, and a 320 × 320 map takes about a second
 * (U²-Net-p) or three (skyseg) anyway. Sessions stay open for the session, by model id.
 * In: {id, model, bytes?, input}. Out: {id, map} or {id, error}.
 */

/** This file runs as a dedicated worker (the DOM types describe `self` as a window). */
declare const self: DedicatedWorkerGlobalScope;

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const sessions = new Map<string, Promise<ort.InferenceSession>>();

/** A request from the page. */
interface SegmentRequest {
  id: number;
  model: string;
  /** The model file, sent once per model. */
  bytes?: ArrayBuffer;
  /** The input's side in pixels. */
  size: number;
  input: Float32Array;
}

/**
 * The model's session, created from its bytes the first time.
 * @param model the model's id
 * @param bytes the model file (needed the first time)
 * @returns the session
 */
function sessionFor(model: string, bytes: ArrayBuffer | undefined): Promise<ort.InferenceSession> {
  let session = sessions.get(model);
  if (!session) {
    if (!bytes) throw new Error(`Model ${model} not loaded`);
    session = ort.InferenceSession.create(new Uint8Array(bytes));
    sessions.set(model, session);
    session.catch(() => sessions.delete(model));
  }
  return session;
}

/**
 * Runs a model on one input.
 * @param request the request
 * @returns the first output's map
 */
async function segment(request: SegmentRequest): Promise<Float32Array> {
  const session = await sessionFor(request.model, request.bytes);
  const [inputName] = session.inputNames;
  const [outputName] = session.outputNames;
  if (!inputName || !outputName) throw new Error('The model has no input or output.');
  const outputs = await session.run({ [inputName]: new ort.Tensor('float32', request.input, [1, 3, request.size, request.size]) });
  const output = Object.entries(outputs).find(([name]) => name === outputName)?.[1];
  const map = output?.data instanceof Float32Array ? new Float32Array(output.data) : null;
  for (const tensor of Object.values(outputs)) tensor.dispose();
  if (!map) throw new Error('The model’s output isn’t a float map.');
  return map;
}

self.onmessage = async (event: MessageEvent<SegmentRequest>) => {
  const { id } = event.data;
  try {
    const map = await segment(event.data);
    self.postMessage({ id, map }, [map.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
