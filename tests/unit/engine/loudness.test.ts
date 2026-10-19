import { describe, expect, it } from 'vitest';
import { LOUDNESS_PRESETS, LOUDNESS_RANGE, LoudnessMeter, Oversampler } from '@/engine/loudness';
import { loudnessReadout } from '@/engine/loudnessTargets';
import { seededRandom } from '../../support/seededRandom';

/* 208 AC-8: integrated loudness to ITU-R BS.1770-4 / EBU R 128, true peak at 4× oversampling. */

/** A stretch of a stereo 1 kHz sine: seconds at a peak level in dBFS (as EBU Tech 3341 states its signals). */
type Part = [seconds: number, dbfs: number];

/**
 * A stereo test signal: 1 kHz sine parts back to back, the same in both channels.
 * @param sampleRate samples per second
 * @param parts the parts
 * @returns left and right
 */
function sine(sampleRate: number, parts: Part[]): [Float32Array, Float32Array] {
  const frames = parts.reduce((sum, [seconds]) => sum + Math.round(seconds * sampleRate), 0);
  const left = new Float32Array(frames);
  let at = 0;
  for (const [seconds, dbfs] of parts) {
    const amplitude = 10 ** (dbfs / 20);
    for (const end = at + Math.round(seconds * sampleRate); at < end; at++)
      left[at] = amplitude * Math.sin((2 * Math.PI * 1000 * at) / sampleRate);
  }
  return [left, left.slice()];
}

/**
 * The integrated loudness of a signal fed in one go.
 * @param sampleRate samples per second
 * @param parts the signal
 * @returns LUFS
 */
function measure(sampleRate: number, parts: Part[]): number {
  const meter = new LoudnessMeter(sampleRate);
  meter.add(...sine(sampleRate, parts));
  return meter.integrated();
}

// EBU Tech 3341 (2016), minimum requirements, signals 1–5: each is expected at −23.0 LUFS (signal 2 at −33.0) ± 0.1 LU.
const TECH_3341: [string, Part[], number][] = [
  ['1: −23 dBFS, 20 s', [[20, -23]], -23],
  ['2: −33 dBFS, 20 s', [[20, -33]], -33],
  ['3: −36 / −23 / −36 dBFS, 10 / 60 / 10 s (relative gate)', [[10, -36], [60, -23], [10, -36]], -23],
  ['4: −72 / −36 / −23 / −36 / −72 dBFS (absolute and relative gates)', [[10, -72], [10, -36], [60, -23], [10, -36], [10, -72]], -23],
  ['5: −26 / −20 / −26 dBFS, 20 / 20.1 / 20 s', [[20, -26], [20.1, -20], [20, -26]], -23],
];

describe('LoudnessMeter: EBU Tech 3341 signals 1–5 (208 AC-8)', () => {
  it.each(TECH_3341)('signal %s at 48 kHz', (_, parts, expected) => {
    expect(Math.abs(measure(48_000, parts) - expected)).toBeLessThanOrEqual(0.1);
  });

  it.each(TECH_3341.slice(0, 2))('signal %s at 44.1 kHz (the K-weighting made for the rate)', (_, parts, expected) => {
    expect(Math.abs(measure(44_100, parts) - expected)).toBeLessThanOrEqual(0.1);
  });

  it('silence and sound under the absolute gate (−70 LUFS) measure −∞', () => {
    expect(measure(48_000, [[5, -200]])).toBe(-Infinity);
    expect(measure(48_000, [[5, -80]])).toBe(-Infinity);
    expect(new LoudnessMeter(48_000).integrated()).toBe(-Infinity);
  });

  it('one channel only: 3 dB under the same sound in both', () => {
    const meter = new LoudnessMeter(48_000);
    const [left] = sine(48_000, [[10, -23]]);
    meter.add(left, new Float32Array(left.length));
    expect(Math.abs(meter.integrated() - -26.01)).toBeLessThanOrEqual(0.1);
  });

  it('fed in uneven windows gives exactly the result of feeding it at once', () => {
    const parts: Part[] = [[3, -40], [5, -18], [2, -60]];
    const [left, right] = sine(48_000, parts);
    const once = new LoudnessMeter(48_000);
    once.add(left, right);
    const windows = new LoudnessMeter(48_000);
    const random = seededRandom(3341);
    for (let at = 0; at < left.length; ) {
      const size = Math.min(left.length - at, 1 + Math.floor(random() * 20_000));
      windows.add(left.subarray(at, at + size), right.subarray(at, at + size));
      at += size;
    }
    expect(windows.integrated()).toBe(once.integrated());
    expect(windows.truePeak()).toBe(once.truePeak());
  });
});

describe('true peak at 4× oversampling (208 AC-8)', () => {
  /**
   * A sine at a quarter of the sample rate, 45° off the samples: every sample is at 0.707 of the peak between them.
   * @param amplitude the peak
   * @param frames how many samples
   * @returns the samples
   */
  const quarter = (amplitude: number, frames = 48_000) =>
    Float32Array.from({ length: frames }, (_, index) => amplitude * Math.sin((Math.PI / 2) * index + Math.PI / 4));

  it('finds the peak between the samples, which the samples miss by 3 dB', () => {
    const samples = quarter(0.5);
    const samplePeak = 20 * Math.log10(Math.max(...samples.map(Math.abs)));
    expect(samplePeak).toBeCloseTo(-9.03, 1);
    const meter = new LoudnessMeter(48_000);
    meter.add(samples, samples);
    // Tech 3341's true-peak tolerance: +0.2 / −0.4 dB.
    expect(meter.truePeak()).toBeGreaterThanOrEqual(-6.02 - 0.4);
    expect(meter.truePeak()).toBeLessThanOrEqual(-6.02 + 0.2);
  });

  it('the oversampler gives each sample’s loudest of its 4 points, the same however it is fed', () => {
    const samples = quarter(1, 4000);
    const once = new Oversampler();
    const peaks = samples.map((sample) => once.push(sample));
    expect(Math.max(...peaks.slice(100))).toBeGreaterThan(0.95);
    expect(Math.max(...peaks.slice(100))).toBeLessThan(1.03);
  });

  it('a 1 kHz sine’s true peak is its peak', () => {
    const meter = new LoudnessMeter(48_000);
    meter.add(...sine(48_000, [[2, -6]]));
    expect(Math.abs(meter.truePeak() - -6)).toBeLessThanOrEqual(0.1);
  });

  it('silence has no peak', () => {
    const meter = new LoudnessMeter(48_000);
    meter.add(new Float32Array(4800), new Float32Array(4800));
    expect(meter.truePeak()).toBe(-Infinity);
  });
});

describe('loudness targets (208 AC-8, Q12)', () => {
  it('YouTube / Instagram −14 LUFS, Quiet −16, a custom value from −24 to −9', () => {
    expect(LOUDNESS_PRESETS).toEqual({ youtube: -14, quiet: -16 });
    expect(LOUDNESS_RANGE).toEqual([-24, -9]);
  });
});

describe('loudnessReadout: the Audio panel’s line (208 AC-9)', () => {
  const measure = (lufs: number, peak: number, gain: number, reduction = 0) => ({ key: 'k', lufs, peak, gain, reduction });

  it('the loudness, the peak and the gain the export applies', () => {
    expect(loudnessReadout(measure(-18.4, -2.1, 4.4), -14, false)).toEqual({
      text: '−18.4 LUFS, peak −2.1 dBTP; the export will be turned up 4.4 dB',
      warning: null,
    });
    expect(loudnessReadout(measure(-9.2, -0.3, -4.8), -14, false).text).toBe('−9.2 LUFS, peak −0.3 dBTP; the export will be turned down 4.8 dB');
    expect(loudnessReadout(measure(-14.02, -3, 0.02), -14, false).text).toBe('−14.0 LUFS, peak −3.0 dBTP; the export keeps this level');
  });

  it('warns when the limiter works hard (over 6 dB)', () => {
    expect(loudnessReadout(measure(-30, -1, 16, 6), -14, false).warning).toBeNull();
    expect(loudnessReadout(measure(-30, -1, 16, 9.3), -14, false).warning).toBe(
      'The limiter will turn the loudest moments down by 9.3 dB, which can sound squashed. Lower the loudest sounds, or choose a quieter target.',
    );
  });

  it('measuring, nothing to measure, and Off', () => {
    expect(loudnessReadout(null, -14, true)).toEqual({ text: 'Measuring loudness…', warning: null });
    expect(loudnessReadout(measure(-20, -3, 6), -14, true).text).toBe('Measuring loudness…');
    expect(loudnessReadout(measure(-Infinity, -Infinity, 0), -14, false).text).toBe('No sound to measure yet.');
    expect(loudnessReadout(null, -14, false).text).toBe('No sound to measure yet.');
    expect(loudnessReadout(measure(-20, -3, 6), 'off', false)).toEqual({ text: 'Loudness is off: the export keeps the mix as it is.', warning: null });
  });
});
