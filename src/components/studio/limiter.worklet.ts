/*
 * The preview's output limiter (208 §6, D3): engine/limiter.ts run on the audio thread, so the preview limits as the
 * export does (true peak at −1 dBTP, 5 ms look-ahead, 100 ms release). Loaded with `audioWorklet.addModule` from its
 * own same-origin file (Vite's `?worker&url`, 208 T001), which the production CSP and the desktop app's `app://` both
 * allow. While Loudness is Off it passes the sound through untouched, as the export does.
 */
import { Limiter } from '../../engine/limiter';

/** The audio thread's sample rate (an AudioWorkletGlobalScope global). */
declare const sampleRate: number;

/** The audio thread's processor base class (the DOM library doesn't describe the worklet's side). */
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/**
 * Registers a processor by name (an AudioWorkletGlobalScope global).
 * @param name the name the main thread's AudioWorkletNode asks for
 * @param processor the processor's class
 */
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

/** What the main thread tells the limiter: whether to limit (Loudness on) or pass the sound through. */
interface LimiterMessage {
  limit: boolean;
}

/** One stereo limiter on the audio thread, its state carried from block to block. */
class LimiterProcessor extends AudioWorkletProcessor {
  private readonly limiter = new Limiter(sampleRate);
  private limit = true;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<LimiterMessage>) => {
      this.limit = event.data.limit;
    };
  }

  /**
   * One block: the input copied to the output (mono to both sides) and, while limiting, limited in place.
   * @param inputs the blocks coming in
   * @param outputs the blocks going out
   * @returns true: keep running
   */
  // eslint-disable-next-line sonarjs/no-invariant-returns -- Web Audio's contract: returning true keeps the processor alive
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    const left = output?.[0];
    if (!output || !left) return true;
    const right = output[1] ?? left;
    const input = inputs[0] ?? [];
    // No input (nothing connected yet, or silence): silence out, without making a block per call.
    const first = input[0];
    if (first) left.set(first);
    else left.fill(0);
    if (right !== left) {
      const second = input[1] ?? first;
      if (second) right.set(second);
      else right.fill(0);
    }
    if (this.limit) this.limiter.process(left, right);
    return true;
  }
}

registerProcessor('chitthi-limiter', LimiterProcessor);
