/*
 * The output limiter (208 §4, Q13), free of DOM and React: a streaming true-peak limiter that holds the mix at or
 * under −1 dBTP at 4× oversampling (the meter's `Oversampler`), after the loudness gain. Look-ahead 5 ms, release
 * 100 ms, state carried across windows, so the export (window by window) and the preview's worklet limit alike.
 *
 * For each sample, the gain its oversampled peak needs; that gain held at its lowest over the look-ahead (so the gain
 * is already down when the peak comes out of the delay), let go exponentially (the release), then averaged over the
 * look-ahead less the filter's 12 taps. The lengths line up so the gain is flat at the needed value over every sample
 * the peak's oversampled points are made of: the peak comes out at the ceiling, never over, and no step is heard.
 * Where nothing needs limiting the gain is exactly 1, so the sound comes out bit for bit, `delay` samples later.
 */
import { Oversampler } from './loudness';

/** The oversampler's taps: a peak it reports was made of the 12 samples before it. */
const TAPS = 12;
/** Under the ceiling by this much (dB), so rounding in the oversampled sum never lands a hair over it. */
const MARGIN_DB = 0.02;

/** A fixed-length ring of numbers. */
class Ring {
  private readonly values: Float64Array;
  private at = 0;

  /**
   * @param length how many values
   * @param fill the starting value
   */
  constructor(length: number, fill: number) {
    this.values = new Float64Array(length).fill(fill);
  }

  /**
   * Puts a value in, taking out the oldest.
   * @param value the new value
   * @returns the oldest, now out
   */
  swap(value: number): number {
    const oldest = this.values[this.at] ?? 0;
    this.values[this.at] = value;
    this.at = (this.at + 1) % this.values.length;
    return oldest;
  }
}

/** A streaming stereo true-peak limiter. */
export class Limiter {
  /** Samples the sound comes out later (5 ms): the export starts this much early and flushes it at the end. */
  readonly delay: number;
  private readonly ceiling: number;
  private readonly releaseStep: number;
  private readonly delayLines: [Ring, Ring];
  private readonly oversamplers = [new Oversampler(), new Oversampler()] as const;
  /** The needed gains over the hold, as a monotonic queue of [index, gain], lowest first. */
  private readonly hold: [number, number][] = [];
  private readonly holdLength: number;
  /** The released gains being averaged, their sum, and how many of them aren't exactly 1. */
  private readonly average: Ring;
  private readonly averageLength: number;
  private averageSum: number;
  private belowOne = 0;
  private released = 1;
  private index = 0;
  private lowest = 1;

  /**
   * @param sampleRate samples per second
   * @param ceilingDb the true-peak ceiling, dBTP
   * @param lookahead seconds
   * @param release seconds for the gain to come back most of the way (a time constant)
   */
  constructor(sampleRate: number, ceilingDb = -1, lookahead = 0.005, release = 0.1) {
    this.delay = Math.max(TAPS + 1, Math.round(lookahead * sampleRate));
    this.ceiling = 10 ** ((ceilingDb - MARGIN_DB) / 20);
    this.releaseStep = 1 - Math.exp(-1 / (release * sampleRate));
    this.delayLines = [new Ring(this.delay, 0), new Ring(this.delay, 0)];
    this.holdLength = this.delay + 1;
    this.averageLength = this.delay - TAPS + 1;
    this.average = new Ring(this.averageLength, 1);
    this.averageSum = this.averageLength;
  }

  /**
   * Limits a window in place: what comes out is the sound `delay` samples earlier, turned down where needed.
   * @param left the left channel
   * @param right the right channel, the same length
   */
  process(left: Float32Array, right: Float32Array): void {
    const length = Math.min(left.length, right.length);
    for (let at = 0; at < length; at++) {
      const gain = this.gainFor(left[at] ?? 0, right[at] ?? 0);
      const [leftLine, rightLine] = this.delayLines;
      const leftOut = leftLine.swap(left[at] ?? 0);
      const rightOut = rightLine.swap(right[at] ?? 0);
      left[at] = gain === 1 ? leftOut : leftOut * gain;
      right[at] = gain === 1 ? rightOut : rightOut * gain;
    }
  }

  /**
   * The last `delay` samples, still in the limiter at the end of the sound.
   * @returns left and right
   */
  flush(): [Float32Array, Float32Array] {
    const tail: [Float32Array, Float32Array] = [new Float32Array(this.delay), new Float32Array(this.delay)];
    this.process(...tail);
    return tail;
  }

  /**
   * The most it has turned the sound down.
   * @returns dB, 0 when it never had to
   */
  reduction(): number {
    return this.lowest < 1 ? -20 * Math.log10(this.lowest) : 0;
  }

  /**
   * The gain for the sample now coming out of the delay, from the samples going in.
   * @param left the left sample going in
   * @param right the right sample going in
   * @returns the gain, exactly 1 where nothing is limited
   */
  private gainFor(left: number, right: number): number {
    const [leftPeak, rightPeak] = this.oversamplers;
    const peak = Math.max(leftPeak.push(left), rightPeak.push(right));
    const needed = peak > this.ceiling ? this.ceiling / peak : 1;
    // The lowest needed gain over the hold (a monotonic queue: each gain in and out once).
    const index = this.index++;
    while (this.hold.length > 0 && (this.hold.at(-1)?.[1] ?? 1) >= needed) this.hold.pop();
    this.hold.push([index, needed]);
    while ((this.hold[0]?.[0] ?? index) <= index - this.holdLength) this.hold.shift();
    const held = this.hold[0]?.[1] ?? 1;
    // Down at once, back up exponentially; snapped to 1 when within a millionth, so the gain becomes exactly 1 again.
    let released = this.released + (1 - this.released) * this.releaseStep;
    if (released > 1 - 1e-6) released = 1;
    this.released = Math.min(held, released);
    const out = this.average.swap(this.released);
    if (out !== 1) this.belowOne--;
    if (this.released !== 1) this.belowOne++;
    this.averageSum += this.released - out;
    if (this.belowOne === 0) {
      // Every gain averaged is 1: start the sum again exactly (no rounding carried).
      this.averageSum = this.averageLength;
      return 1;
    }
    const gain = this.averageSum / this.averageLength;
    this.lowest = Math.min(this.lowest, gain);
    return gain;
  }
}

/**
 * The export's master stage (208 §4, §5): the loudness gain, then the limiter, with its delay taken out, so the sound
 * stays on its frames: the first `delay` samples out are dropped and the limiter is flushed at the end, so as many
 * samples come out as go in.
 */
export class MasterStage {
  private readonly limiter: Limiter;
  private readonly gain: number;
  /** Samples still to drop from the front: the limiter's delay. */
  private toDrop: number;

  /**
   * @param gainDb the loudness gain, dB
   * @param sampleRate samples per second
   */
  constructor(gainDb: number, sampleRate: number) {
    this.limiter = new Limiter(sampleRate);
    this.gain = 10 ** (gainDb / 20);
    this.toDrop = this.limiter.delay;
  }

  /**
   * A window through the stage (the input is left as it is).
   * @param left the left channel
   * @param right the right channel
   * @returns the window out: shorter than the input at the start, by the limiter's delay
   */
  process(left: Float32Array, right: Float32Array): [Float32Array, Float32Array] {
    const out: [Float32Array, Float32Array] = [left.map((sample) => sample * this.gain), right.map((sample) => sample * this.gain)];
    this.limiter.process(...out);
    return this.dropped(out);
  }

  /**
   * The end of the sound: what is still in the limiter.
   * @returns the last samples, so the total out equals the total in
   */
  finish(): [Float32Array, Float32Array] {
    return this.dropped(this.limiter.flush());
  }

  /**
   * The most the limiter turned the sound down.
   * @returns dB
   */
  reduction(): number {
    return this.limiter.reduction();
  }

  /**
   * A window with what is still owed to the delay dropped from its front.
   * @param window the window
   * @returns it, shorter when samples were dropped
   */
  private dropped([left, right]: [Float32Array, Float32Array]): [Float32Array, Float32Array] {
    const drop = Math.min(this.toDrop, left.length);
    this.toDrop -= drop;
    return drop ? [left.subarray(drop), right.subarray(drop)] : [left, right];
  }
}
