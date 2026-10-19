/*
 * Loudness to ITU-R BS.1770-4 / EBU R 128 (208 §4, AC-8), free of DOM and React: K-weighting (the standard's two
 * biquads, made for the sample rate), mean square in 400 ms blocks every 100 ms, the −70 LUFS absolute and −10 LU
 * relative gates, and true peak by 4× oversampling with the standard's 48-tap polyphase FIR (`Oversampler`, which the
 * limiter shares). The meter streams: window after window, with every filter's state carried, gives exactly the
 * result of one feed.
 */

export { LOUDNESS_PRESETS, LOUDNESS_RANGE } from './loudnessTargets';

/** The absolute gate, LUFS, and the relative gate under the ungated loudness, LU. */
const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;
/** BS.1770's offset, so a 1 kHz sine at full scale in one channel reads −3.01 LUFS. */
const OFFSET = -0.691;

/** A biquad's coefficients, a0 = 1. */
interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * The K-weighting filters at a sample rate: the high shelf (stage 1) and the high pass (stage 2), from the analogue
 * prototypes behind the standard's 48 kHz coefficients (as libebur128 derives them).
 * @param sampleRate samples per second
 * @returns the two stages
 */
function kWeighting(sampleRate: number): [Biquad, Biquad] {
  let warp = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  const gain = 10 ** (3.999843853973347 / 20);
  const boost = gain ** 0.4996667741545416;
  let quality = 0.7071752369554196;
  let a0 = 1 + warp / quality + warp * warp;
  const shelf = {
    b0: (gain + (boost * warp) / quality + warp * warp) / a0,
    b1: (2 * (warp * warp - gain)) / a0,
    b2: (gain - (boost * warp) / quality + warp * warp) / a0,
    a1: (2 * (warp * warp - 1)) / a0,
    a2: (1 - warp / quality + warp * warp) / a0,
  };
  warp = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  quality = 0.5003270373238773;
  a0 = 1 + warp / quality + warp * warp;
  const highPass = { b0: 1, b1: -2, b2: 1, a1: (2 * (warp * warp - 1)) / a0, a2: (1 - warp / quality + warp * warp) / a0 };
  return [shelf, highPass];
}

/** One channel's K-weighting state: each stage's last two inputs and outputs (fields, not an array: this runs per sample). */
class KFilter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private v1 = 0;
  private v2 = 0;

  /**
   * @param stages the K-weighting stages
   */
  constructor(private readonly stages: [Biquad, Biquad]) {}

  /**
   * Filters a sample through both stages (the high pass's input is the shelf's output, so it shares `y1`, `y2`).
   * @param sample the sample
   * @returns the K-weighted sample
   */
  run(sample: number): number {
    const [shelf, highPass] = this.stages;
    const first = shelf.b0 * sample + shelf.b1 * this.x1 + shelf.b2 * this.x2 - shelf.a1 * this.y1 - shelf.a2 * this.y2;
    const second =
      highPass.b0 * first + highPass.b1 * this.y1 + highPass.b2 * this.y2 - highPass.a1 * this.v1 - highPass.a2 * this.v2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = first;
    this.v2 = this.v1;
    this.v1 = second;
    return second;
  }
}

/** BS.1770-4 Annex 2: the 4× interpolation filter, 48 taps as 4 phases of 12. */
const PHASES: readonly (readonly number[])[] = [
  [0.001708984375, 0.010986328125, -0.0196533203125, 0.033203125, -0.0594482421875, 0.1373291015625, 0.97216796875, -0.102294921875, 0.047607421875, -0.026611328125, 0.014892578125, -0.00830078125],
  [-0.0291748046875, 0.029296875, -0.0517578125, 0.089111328125, -0.166503906250, 0.465087890625, 0.77978515625, -0.2003173828125, 0.1015625, -0.0582275390625, 0.0330810546875, -0.0189208984375],
  [-0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625, -0.2003173828125, 0.77978515625, 0.465087890625, -0.166503906250, 0.089111328125, -0.0517578125, 0.029296875, -0.0291748046875],
  [-0.00830078125, 0.014892578125, -0.026611328125, 0.047607421875, -0.102294921875, 0.97216796875, 0.1373291015625, -0.0594482421875, 0.033203125, -0.0196533203125, 0.010986328125, 0.001708984375],
];
const TAPS = 12;

/** One channel's 4× oversampler (true peak): each new sample gives the loudest of the 4 points it adds. */
export class Oversampler {
  /** The last 12 samples, twice over, so each window is one run of the array. */
  private readonly history = new Float64Array(2 * TAPS);
  private at = 0;

  /**
   * Adds a sample.
   * @param sample the sample
   * @returns the largest |value| of the 4 oversampled points it brings (delayed by the filter's 6 samples)
   */
  push(sample: number): number {
    this.at = (this.at + TAPS - 1) % TAPS;
    this.history[this.at] = sample;
    this.history[this.at + TAPS] = sample;
    let loudest = 0;
    for (const phase of PHASES) {
      let sum = 0;
      for (let tap = 0; tap < TAPS; tap++) sum += (phase[tap] ?? 0) * (this.history[this.at + tap] ?? 0);
      loudest = Math.max(loudest, Math.abs(sum));
    }
    return loudest;
  }
}

/** A streaming BS.1770-4 meter of a stereo mix: integrated loudness and true peak. */
export class LoudnessMeter {
  private readonly filters: [KFilter, KFilter];
  private readonly oversamplers = [new Oversampler(), new Oversampler()] as const;
  /** Samples in 100 ms, the step between blocks. */
  private readonly stepFrames: number;
  /** The current 100 ms step's K-weighted sum of squares (both channels) and its samples so far. */
  private sum = 0;
  private frames = 0;
  /** The last four steps' sums: a block is 400 ms. */
  private readonly steps: number[] = [];
  /** Each full block's mean square (power). */
  private readonly blocks: number[] = [];
  private peak = 0;

  /**
   * @param sampleRate samples per second
   */
  constructor(sampleRate: number) {
    const stages = kWeighting(sampleRate);
    this.filters = [new KFilter(stages), new KFilter(stages)];
    this.stepFrames = Math.round(sampleRate / 10);
  }

  /**
   * Adds a window of the mix.
   * @param left the left channel
   * @param right the right channel, the same length
   */
  add(left: Float32Array, right: Float32Array): void {
    const [leftFilter, rightFilter] = this.filters;
    const [leftPeak, rightPeak] = this.oversamplers;
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index++) {
      const leftSample = left[index] ?? 0;
      const rightSample = right[index] ?? 0;
      const weightedLeft = leftFilter.run(leftSample);
      const weightedRight = rightFilter.run(rightSample);
      this.sum += weightedLeft * weightedLeft + weightedRight * weightedRight;
      this.peak = Math.max(this.peak, leftPeak.push(leftSample), rightPeak.push(rightSample));
      if (++this.frames === this.stepFrames) this.endStep();
    }
  }

  /** Closes a 100 ms step and, once four are in, the 400 ms block ending with it. */
  private endStep(): void {
    this.steps.push(this.sum);
    this.sum = 0;
    this.frames = 0;
    if (this.steps.length > 4) this.steps.shift();
    if (this.steps.length === 4)
      this.blocks.push(this.steps.reduce((total, step) => total + step, 0) / (4 * this.stepFrames));
  }

  /**
   * The integrated loudness of everything added (BS.1770-4: gated at −70 LUFS, then 10 LU under the gated mean).
   * @returns LUFS, −∞ when nothing passes the absolute gate
   */
  integrated(): number {
    const loudness = (power: number) => OFFSET + 10 * Math.log10(power);
    const meanOf = (powers: number[]) => powers.reduce((total, power) => total + power, 0) / powers.length;
    const audible = this.blocks.filter((power) => power > 0 && loudness(power) > ABSOLUTE_GATE);
    if (audible.length === 0) return -Infinity;
    const gate = loudness(meanOf(audible)) + RELATIVE_GATE;
    const gated = audible.filter((power) => loudness(power) > gate);
    return loudness(meanOf(gated));
  }

  /**
   * The true peak of everything added (4× oversampled).
   * @returns dBTP, −∞ for silence
   */
  truePeak(): number {
    return this.peak > 0 ? 20 * Math.log10(this.peak) : -Infinity;
  }
}
