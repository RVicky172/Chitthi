import { describe, expect, it } from 'vitest';
import { Limiter } from '@/engine/limiter';
import { Oversampler } from '@/engine/loudness';
import { seededRandom } from '../../support/seededRandom';

/* 208 AC-8, Q13: a streaming true-peak limiter at −1 dBTP, 5 ms look-ahead, 100 ms release. */

const RATE = 48_000;
const CEILING = 10 ** (-1 / 20);

/** A stereo signal. */
type Stereo = [Float32Array, Float32Array];

/**
 * Runs a signal through a limiter in windows (and flushes it).
 * @param signal the input
 * @param windows the window sizes' seed, or 0 for one buffer
 * @returns the limiter and its output: the input's length plus the look-ahead
 */
function limit(signal: Stereo, windows = 0): { limiter: Limiter; out: Stereo } {
  const limiter = new Limiter(RATE);
  const [left, right] = signal.map((channel) => channel.slice()) as Stereo;
  const random = seededRandom(windows || 1);
  for (let at = 0; at < left.length; ) {
    const size = windows ? Math.min(left.length - at, 1 + Math.floor(random() * 3000)) : left.length;
    limiter.process(left.subarray(at, at + size), right.subarray(at, at + size));
    at += size;
  }
  const [tailLeft, tailRight] = limiter.flush();
  const join = (head: Float32Array, tail: Float32Array) => {
    const all = new Float32Array(head.length + tail.length);
    all.set(head);
    all.set(tail, head.length);
    return all;
  };
  return { limiter, out: [join(left, tailLeft), join(right, tailRight)] };
}

/**
 * The true peak of a signal, as the meter measures it.
 * @param signal the signal
 * @returns the largest 4× oversampled |value|
 */
function truePeak(signal: Stereo): number {
  let peak = 0;
  for (const channel of signal) {
    const oversampler = new Oversampler();
    for (const sample of channel) peak = Math.max(peak, oversampler.push(sample));
    for (let tail = 0; tail < 12; tail++) peak = Math.max(peak, oversampler.push(0));
  }
  return peak;
}

const frames = (seconds: number) => Math.round(seconds * RATE);
const sineOf = (amplitude: number, hertz: number, seconds: number, phase = 0) =>
  Float32Array.from({ length: frames(seconds) }, (_, index) => amplitude * Math.sin((2 * Math.PI * hertz * index) / RATE + phase));
const both = (channel: Float32Array): Stereo => [channel, channel.slice()];

const HOT: [string, Stereo][] = [
  ['a 1 kHz sine at +6 dBFS', both(sineOf(2, 1000, 1))],
  ['a sine at a quarter of the rate, 45° off the samples (peaks between them)', both(sineOf(1, RATE / 4, 1, Math.PI / 4))],
  [
    'transients: clicks out of silence and a sudden loud burst',
    both(
      Float32Array.from({ length: frames(1) }, (_, index) => {
        if (index % 4801 === 100) return 1.6;
        if (index > frames(0.6) && index < frames(0.65)) return 1.4 * Math.sin(index / 3);
        return 0.05 * Math.sin(index / 20);
      }),
    ),
  ],
  [
    'loud noise, different in each channel',
    (() => {
      const random = seededRandom(13);
      const noise = () => Float32Array.from({ length: frames(1) }, () => 3 * (random() - 0.5));
      return [noise(), noise()] as Stereo;
    })(),
  ],
];

describe('Limiter (208 AC-8, Q13)', () => {
  it.each(HOT)('%s: no 4× oversampled sample over −1 dBTP', (_, signal) => {
    const { out, limiter } = limit(signal);
    expect(truePeak(signal)).toBeGreaterThan(CEILING);
    expect(truePeak(out)).toBeLessThanOrEqual(CEILING * (1 + 1e-6));
    expect(limiter.reduction()).toBeGreaterThan(0);
  });

  it('under the ceiling the sound comes out unchanged, bit for bit, 5 ms later', () => {
    const signal: Stereo = [sineOf(0.5, 440, 0.5), sineOf(0.3, 1000, 0.5)];
    const { out, limiter } = limit(signal, 7);
    expect(limiter.delay).toBe(frames(0.005));
    for (const [channel, input] of signal.entries()) {
      const output = out[channel] ?? new Float32Array();
      expect(output.subarray(0, limiter.delay).every((sample) => sample === 0)).toBe(true);
      expect(output.subarray(limiter.delay)).toEqual(input);
    }
    expect(limiter.reduction()).toBe(0);
  });

  it('the sound stays on time: a click comes out exactly `delay` samples later', () => {
    const click = new Float32Array(frames(0.1));
    click[1000] = 0.5;
    const { out, limiter } = limit(both(click));
    expect(out[0].findIndex((sample) => sample !== 0)).toBe(1000 + limiter.delay);
  });

  it('carried across windows, it gives exactly the output of one buffer', () => {
    for (const [, signal] of HOT) expect(limit(signal, 5).out).toEqual(limit(signal).out);
  });

  it('lets go over about 100 ms after a loud part, not at once', () => {
    const loud = sineOf(2, 1000, 0.2);
    const quiet = sineOf(0.25, 1000, 0.8);
    const signal = new Float32Array(loud.length + quiet.length);
    signal.set(loud);
    signal.set(quiet, loud.length);
    const { out, limiter } = limit(both(signal));
    // The quiet part's level (0.25) in 1 ms windows after the loud part ends, coming back up.
    const levelAt = (seconds: number) => {
      const from = frames(0.2 + seconds) + limiter.delay;
      return Math.max(...out[0].subarray(from, from + frames(0.001)).map(Math.abs)) / 0.25;
    };
    expect(levelAt(0.02)).toBeLessThan(0.75);
    expect(levelAt(0.1)).toBeGreaterThan(levelAt(0.02));
    expect(levelAt(0.6)).toBeGreaterThan(0.99);
  });

  it('reduction() is the most it turned the sound down, dB', () => {
    const { limiter } = limit(both(sineOf(2, 1000, 0.5)));
    // +6.02 dBFS down to −1 dBTP: 7.02 dB.
    expect(limiter.reduction()).toBeCloseTo(7.02, 1);
  });
});
