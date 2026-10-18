import { describe, expect, it } from 'vitest';
import { timeStretch, timeStretchChannels } from '@/engine/timeStretch';
import { defined } from '../../support/defined';

/* ---------- helpers ---------- */

/** The export's sample rate (videoExport.ts). */
const SAMPLE_RATE = 48000;
/** One video frame at 30 fps, in samples: the length's allowance (AC-6). */
const ONE_FRAME = SAMPLE_RATE / 30;
const RATES = [0.5, 0.75, 1.5, 2] as const;

/**
 * A sine.
 * @param frequency Hz
 * @param seconds its length
 * @param amplitude its peak
 * @returns the samples
 */
function sine(frequency: number, seconds: number, amplitude = 0.8): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let index = 0; index < samples.length; index++)
    samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  return samples;
}

/**
 * Zero crossings per second, away from the first and last 50 ms.
 * @param samples the signal
 * @returns crossings per second (twice the frequency of a sine)
 */
function crossingsPerSecond(samples: Float32Array): number {
  const edge = Math.round(0.05 * SAMPLE_RATE);
  let crossings = 0;
  let previous = samples[edge] ?? 0;
  for (let index = edge + 1; index < samples.length - edge; index++) {
    const value = samples[index] ?? 0;
    if ((previous < 0 && value >= 0) || (previous >= 0 && value < 0)) crossings++;
    previous = value;
  }
  return crossings / ((samples.length - 2 * edge) / SAMPLE_RATE);
}

/**
 * The largest step between neighbouring samples.
 * @param samples the signal
 * @returns the step
 */
function largestStep(samples: Float32Array): number {
  let largest = 0;
  for (let index = 1; index < samples.length; index++)
    largest = Math.max(largest, Math.abs((samples[index] ?? 0) - (samples[index - 1] ?? 0)));
  return largest;
}

/**
 * Root mean square, away from the first and last 50 ms.
 * @param samples the signal
 * @returns the RMS
 */
function rms(samples: Float32Array): number {
  const edge = Math.round(0.05 * SAMPLE_RATE);
  let sum = 0;
  for (let index = edge; index < samples.length - edge; index++) sum += (samples[index] ?? 0) ** 2;
  return Math.sqrt(sum / (samples.length - 2 * edge));
}

/* ---------- timeStretch ---------- */

describe('timeStretch: same pitch at another speed (207 AC-6, WSOLA)', () => {
  it.each(RATES)('at %s× a 220 Hz and a 440 Hz sine keep their pitch within 1 %', (rate) => {
    for (const frequency of [220, 440]) {
      const output = timeStretch(sine(frequency, 2), rate, SAMPLE_RATE);
      expect(crossingsPerSecond(output) / (2 * frequency), `${frequency} Hz`).toBeGreaterThan(0.99);
      expect(crossingsPerSecond(output) / (2 * frequency), `${frequency} Hz`).toBeLessThan(1.01);
    }
  });

  it.each(RATES)('at %s× the output lasts the input over the rate, within one frame (exactly, rounded)', (rate) => {
    for (const seconds of [2, 0.5, 10.25]) {
      const input = sine(330, seconds);
      const output = timeStretch(input, rate, SAMPLE_RATE);
      expect(Math.abs(output.length - input.length / rate)).toBeLessThanOrEqual(ONE_FRAME);
      expect(output).toHaveLength(Math.round(input.length / rate));
    }
  });

  it.each(RATES)('at %s× no step between samples is larger than the signal’s own, and the loudness stays', (rate) => {
    for (const frequency of [110, 440, 1000]) {
      const input = sine(frequency, 2);
      const output = timeStretch(input, rate, SAMPLE_RATE);
      expect(largestStep(output), `${frequency} Hz`).toBeLessThanOrEqual(largestStep(input) * 1.05);
      expect(rms(output) / rms(input), `${frequency} Hz`).toBeGreaterThan(0.9);
      expect(rms(output) / rms(input), `${frequency} Hz`).toBeLessThan(1.1);
    }
  });

  it('a chord keeps both notes: 2× on 220 + 330 Hz keeps its sum of sines’ crossings', () => {
    const chord = sine(220, 2, 0.4).map((value, index) => value + 0.4 * Math.sin((2 * Math.PI * 330 * index) / SAMPLE_RATE));
    const output = timeStretch(chord, 2, SAMPLE_RATE);
    expect(crossingsPerSecond(output) / crossingsPerSecond(chord)).toBeGreaterThan(0.98);
    expect(crossingsPerSecond(output) / crossingsPerSecond(chord)).toBeLessThan(1.02);
  });

  it('stereo channels are cut at the same places, so they stay in step', () => {
    const left = sine(220, 1);
    const right = left.map((value) => value * 0.5);
    const [outLeft, outRight] = timeStretchChannels([left, right], 1.5, SAMPLE_RATE);
    expect(outRight).toEqual(defined(outLeft).map((value) => value * 0.5));
  });

  it('1× returns the input itself', () => {
    const input = sine(440, 0.5);
    expect(timeStretch(input, 1, SAMPLE_RATE)).toBe(input);
  });

  it('silence stays silence; empty and very short inputs give the right length', () => {
    const silent = timeStretch(new Float32Array(SAMPLE_RATE), 1.5, SAMPLE_RATE);
    expect(silent).toHaveLength(Math.round(SAMPLE_RATE / 1.5));
    expect(silent.every((value) => value === 0)).toBe(true);
    expect(timeStretch(new Float32Array(0), 2, SAMPLE_RATE)).toHaveLength(0);
    const short = timeStretch(sine(440, 0.01), 0.5, SAMPLE_RATE);
    expect(short).toHaveLength(Math.round((0.01 * SAMPLE_RATE) / 0.5));
  });

  it('the same input gives the same output (no randomness)', () => {
    const input = sine(523, 1);
    expect(timeStretch(input, 0.75, SAMPLE_RATE)).toEqual(timeStretch(input, 0.75, SAMPLE_RATE));
  });
});
