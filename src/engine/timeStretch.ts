/*
 * Sound at another speed with the same pitch (P2.7, specs/features/207-speed plan §5, AC-6), for the export: WSOLA,
 * waveform-similarity overlap-add. The output is built from 40 ms Hann-windowed frames of the input laid down every
 * 20 ms (50 % overlap, so the windows sum to 1); each frame is taken from around where the speed puts it in the input
 * (`rate` × its place in the output), moved by up to ±10 ms to where it best continues the frame before it, so the
 * waves line up and nothing beats or clicks. Pure Float32Array in and out; our own code, no dependency (D5).
 */

/** Frame length, seconds. */
const FRAME_SECONDS = 0.04;
/** How far a frame may move to line up with the one before, seconds. */
const SEARCH_SECONDS = 0.01;
/** The coarse search looks at every this many offsets and samples, then refines around the best. */
const COARSE = 4;

/** WSOLA's sizes in samples, for a sample rate. */
interface Sizes {
  /** Frame length. */
  frame: number;
  /** Output hop: half a frame. */
  hop: number;
  /** Largest move of a frame. */
  search: number;
  /** Periodic Hann window (sums to 1 at 50 % overlap). */
  window: Float32Array;
}

/**
 * WSOLA's sizes for a sample rate.
 * @param sampleRate samples per second
 * @returns the sizes
 */
function sizesFor(sampleRate: number): Sizes {
  const hop = Math.max(1, Math.round((FRAME_SECONDS * sampleRate) / 2));
  const frame = hop * 2;
  const window = new Float32Array(frame);
  for (let index = 0; index < frame; index++) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / frame);
  return { frame, hop, search: Math.round(SEARCH_SECONDS * sampleRate), window };
}

/**
 * How alike two stretches of the input are: their dot product over `length` samples, every `step`th.
 * @param mix the input (all channels summed)
 * @param first where the first stretch starts
 * @param second where the second starts
 * @param length samples compared
 * @param step compare every this many samples
 * @returns the dot product
 */
function likeness(mix: Float32Array, first: number, second: number, length: number, step: number): number {
  let sum = 0;
  for (let index = 0; index < length; index += step) sum += (mix[first + index] ?? 0) * (mix[second + index] ?? 0);
  return sum;
}

/**
 * The best input start for a frame: within ±`search` of where the speed puts it, the start whose first half frame is
 * most like the natural continuation of the frame before (coarse, then refined sample by sample).
 * @param mix the input (all channels summed)
 * @param nominal where the speed puts the frame
 * @param continuation where the frame before would go on
 * @param sizes WSOLA's sizes
 * @param last the latest start that keeps a frame inside the input
 * @returns the start
 */
function bestStart(mix: Float32Array, nominal: number, continuation: number, sizes: Sizes, last: number): number {
  const clamp = (start: number) => Math.min(last, Math.max(0, start));
  const low = clamp(nominal - sizes.search);
  const high = clamp(nominal + sizes.search);
  const target = clamp(continuation);
  let best = clamp(nominal);
  let bestScore = -Infinity;
  for (let start = low; start <= high; start += COARSE) {
    const score = likeness(mix, target, start, sizes.hop, COARSE);
    if (score > bestScore) [best, bestScore] = [start, score];
  }
  const coarse = best;
  bestScore = -Infinity;
  for (let start = Math.max(low, coarse - COARSE + 1); start <= Math.min(high, coarse + COARSE - 1); start++) {
    const score = likeness(mix, target, start, sizes.hop, 1);
    if (score > bestScore) [best, bestScore] = [start, score];
  }
  return best;
}

/**
 * Several channels at another speed with the same pitch, every channel cut at the same places (so stereo stays in
 * step): the frames are lined up on the channels' sum.
 * @param channels the input channels, all the same length
 * @param rate source seconds per output second (2 = twice as fast, half as long)
 * @param sampleRate samples per second
 * @returns the channels, each `round(length / rate)` samples; the input itself at 1×
 */
export function timeStretchChannels(channels: readonly Float32Array[], rate: number, sampleRate: number): Float32Array[] {
  const inputLength = channels[0]?.length ?? 0;
  if (rate === 1 || channels.length === 0) return [...channels];
  const outputLength = Math.round(inputLength / rate);
  const sizes = sizesFor(sampleRate);
  const outputs = channels.map(() => new Float32Array(outputLength + sizes.frame));
  const weights = new Float32Array(outputLength + sizes.frame);
  const mix = new Float32Array(inputLength);
  for (const channel of channels) for (let index = 0; index < inputLength; index++) mix[index] = (mix[index] ?? 0) + (channel[index] ?? 0);
  const last = Math.max(0, inputLength - sizes.frame);
  let previous = -1;
  for (let at = 0; at < outputLength; at += sizes.hop) {
    const nominal = Math.round(at * rate);
    const start = previous < 0 ? Math.min(last, nominal) : bestStart(mix, nominal, previous + sizes.hop, sizes, last);
    for (let index = 0; index < sizes.frame; index++) {
      const weight = sizes.window[index] ?? 0;
      weights[at + index] = (weights[at + index] ?? 0) + weight;
      channels.forEach((channel, channelIndex) => {
        const output = outputs[channelIndex];
        if (output) output[at + index] = (output[at + index] ?? 0) + weight * (channel[start + index] ?? 0);
      });
    }
    previous = start;
  }
  return outputs.map((output) => {
    // Where only one window covers a sample (the start), dividing by the weights gives the input back unscaled.
    for (let index = 0; index < outputLength; index++) {
      const weight = weights[index] ?? 0;
      output[index] = weight > 1e-6 ? (output[index] ?? 0) / weight : 0;
    }
    return output.slice(0, outputLength);
  });
}

/**
 * One channel at another speed with the same pitch (WSOLA, see `timeStretchChannels`).
 * @param input the samples
 * @param rate source seconds per output second
 * @param sampleRate samples per second
 * @returns `round(input.length / rate)` samples; the input itself at 1×
 */
export function timeStretch(input: Float32Array, rate: number, sampleRate: number): Float32Array {
  return timeStretchChannels([input], rate, sampleRate)[0] ?? input;
}
