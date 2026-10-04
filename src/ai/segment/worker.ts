/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

/*
 * Runs the segmentation models (P1.8) off the page's thread, with ONNX Runtime Web on WebAssembly. One thread: the
 * threaded build needs a cross-origin-isolated page, which Chitthi isn't, and a 320 × 320 map takes about a second
 * (U²-Net-p) or three (skyseg) anyway. Sessions stay open for the session, by model id.
 * In: {id, model, bytes?, input}. Out: {id, map} or {id, error}.
 */

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const sessions = new Map<string, Promise<ort.InferenceSession>>();

interface Req {
  id: number;
  model: string;
  /** The model file, sent once per model. */
  bytes?: ArrayBuffer;
  size: number;
  input: Float32Array;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, model, bytes, size, input } = e.data;
  try {
    let s = sessions.get(model);
    if (!s) {
      if (!bytes) throw new Error(`Model ${model} not loaded`);
      s = ort.InferenceSession.create(new Uint8Array(bytes));
      sessions.set(model, s);
      s.catch(() => sessions.delete(model));
    }
    const session = await s;
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, size, size]) });
    const t = out[session.outputNames[0]];
    const map = new Float32Array(t.data as Float32Array);
    for (const k of Object.keys(out)) out[k].dispose();
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, map }, [map.buffer]);
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
