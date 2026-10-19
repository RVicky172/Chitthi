import { describe, expect, it } from 'vitest';
import { PEAK_FLOOR, RMS_FLOOR, ScanBuilder, decodeScan, encodeScan, peakDb, waveformColumns, type SoundScan } from '@/engine/soundScan';
import type { AudioClip } from '@/engine/timeline';
import { defined } from '../../support/defined';
import { seededRandom } from '../../support/seededRandom';

/* 208 AC-4: a file's sound scanned once — peaks 100 per second for the waveform, 50 ms RMS for the voice. */

/** A 1 kHz tone at an amplitude between two times, seconds. */
interface Burst {
  from: number;
  to: number;
  amplitude: number;
}

const BURSTS: Burst[] = [
  { from: 0.5, to: 1, amplitude: 0.5 },
  { from: 1.5, to: 1.8, amplitude: 0.1 },
  { from: 2.25, to: 2.4, amplitude: 1 },
];
const LENGTH = 3;
const db = (amplitude: number) => 20 * Math.log10(amplitude);

/**
 * The bursts as samples, one channel per amplitude scale.
 * @param sampleRate samples per second
 * @param scales each channel's scale of the bursts' amplitude
 * @returns the channels
 */
function tones(sampleRate: number, scales: number[] = [1]): Float32Array[] {
  const frames = Math.round(LENGTH * sampleRate);
  return scales.map((scale) => {
    const channel = new Float32Array(frames);
    for (const burst of BURSTS)
      for (let frame = Math.round(burst.from * sampleRate); frame < Math.round(burst.to * sampleRate); frame++)
        channel[frame] = scale * burst.amplitude * Math.sin((2 * Math.PI * 1000 * frame) / sampleRate);
    return channel;
  });
}

/**
 * Scans channels fed in uneven chunks, as a decoder hands them over.
 * @param channels the samples
 * @param sampleRate samples per second
 * @param seed the chunk sizes' seed
 * @returns the scan
 */
function scanInChunks(channels: Float32Array[], sampleRate: number, seed = 1): SoundScan {
  const builder = new ScanBuilder(sampleRate);
  const random = seededRandom(seed);
  const frames = defined(channels[0]).length;
  for (let at = 0; at < frames; ) {
    const size = Math.min(frames - at, 1 + Math.floor(random() * 5000));
    builder.add(channels.map((channel) => channel.subarray(at, at + size)));
    at += size;
  }
  return builder.finish();
}

/**
 * The burst a stretch of time lies wholly inside, or whether it touches none.
 * @param from the stretch's start, seconds
 * @param to its end
 * @returns the burst, 'silent' when it touches none, null when it straddles an edge
 */
function stretchIn(from: number, to: number): Burst | 'silent' | null {
  for (const burst of BURSTS) {
    if (from >= burst.from && to <= burst.to) return burst;
    if (to > burst.from && from < burst.to) return null;
  }
  return 'silent';
}

describe.each([44_100, 48_000])('ScanBuilder at %i Hz', (sampleRate) => {
  const scan = scanInChunks(tones(sampleRate), sampleRate);

  it('has 100 peaks and 20 RMS steps per second, and the length', () => {
    expect(scan.rate).toBe(100);
    expect(scan.peaks).toHaveLength(LENGTH * 100);
    expect(scan.rms).toHaveLength(LENGTH * 20);
    expect(scan.dur).toBeCloseTo(LENGTH, 9);
  });

  it('peaks within 1 dB of each burst’s level, silence at the floor', () => {
    scan.peaks.forEach((peak, index) => {
      const where = stretchIn(index / 100, (index + 1) / 100);
      if (where === 'silent') expect(peakDb(peak)).toBe(PEAK_FLOOR);
      else if (where) expect(Math.abs(peakDb(peak) - db(where.amplitude))).toBeLessThan(1);
    });
  });

  it('each burst starts and ends within 10 ms of its time', () => {
    const loud = [...scan.peaks].map((peak) => peakDb(peak) > PEAK_FLOOR + 20);
    for (const burst of BURSTS) {
      const first = loud.findIndex((on, index) => on && index / 100 >= burst.from - 0.02);
      const last = loud.findLastIndex((on, index) => on && index / 100 < burst.to + 0.02);
      expect(Math.abs(first / 100 - burst.from)).toBeLessThanOrEqual(0.01);
      expect(Math.abs((last + 1) / 100 - burst.to)).toBeLessThanOrEqual(0.01);
    }
  });

  it('50 ms RMS within 0.1 dB of each burst’s (a sine’s: −3.01 dB under its peak), silence at the floor', () => {
    scan.rms.forEach((level, index) => {
      const where = stretchIn(index * 0.05, (index + 1) * 0.05);
      if (where === 'silent') expect(level).toBe(RMS_FLOOR);
      else if (where) expect(Math.abs(level - (db(where.amplitude) - 10 * Math.log10(2)))).toBeLessThan(0.1);
    });
  });

  it('gives the same scan whatever the chunks', () => {
    const again = scanInChunks(tones(sampleRate), sampleRate, 99);
    expect(again.peaks).toEqual(scan.peaks);
    expect([...again.rms].map((level) => level.toFixed(4))).toEqual([...scan.rms].map((level) => level.toFixed(4)));
  });
});

describe('ScanBuilder with two channels', () => {
  it('peaks follow the louder channel, RMS the mean power of both', () => {
    const sampleRate = 48_000;
    const scan = scanInChunks(tones(sampleRate, [1, 0.5]), sampleRate);
    const burst = defined(BURSTS[0]);
    const peakIndex = Math.round(burst.from * 100) + 10;
    expect(Math.abs(peakDb(defined(scan.peaks[peakIndex])) - db(burst.amplitude))).toBeLessThan(1);
    // Mean power of A sin and A/2 sin: (A²/2 + A²/8) / 2.
    const power = (burst.amplitude ** 2 / 2 + burst.amplitude ** 2 / 8) / 2;
    const rmsIndex = Math.round(burst.from * 20) + 2;
    expect(Math.abs(defined(scan.rms[rmsIndex]) - 10 * Math.log10(power))).toBeLessThan(0.1);
  });
});

describe('ScanBuilder size (208 AC-4)', () => {
  it('a 3-hour scan is under 10 MB', () => {
    // A low sample rate keeps the test fast: the scan's size depends on the length, not the rate.
    const sampleRate = 1000;
    const builder = new ScanBuilder(sampleRate);
    const chunk = new Float32Array(600_000).fill(0.25);
    for (let fed = 0; fed < 3 * 3600 * sampleRate; fed += chunk.length) builder.add([chunk, chunk]);
    const scan = builder.finish();
    expect(scan.dur).toBeCloseTo(3 * 3600, 6);
    expect(scan.peaks).toHaveLength(3 * 3600 * 100);
    expect(scan.peaks.byteLength + scan.rms.byteLength).toBeLessThan(10 * 1024 * 1024);
  });

  it('an empty file scans to nothing', () => {
    const scan = new ScanBuilder(48_000).finish();
    expect(scan).toMatchObject({ rate: 100, dur: 0 });
    expect(scan.peaks).toHaveLength(0);
    expect(scan.rms).toHaveLength(0);
  });
});

describe('waveformColumns (208 AC-4)', () => {
  // A file of steady levels: 0.5 from 0.5–1 s, 0.1 from 1.5–1.8 s, silent elsewhere, 3 s long.
  const sampleRate = 8000;
  const levels = new Float32Array(3 * sampleRate);
  for (const burst of BURSTS.slice(0, 2))
    levels.fill(burst.amplitude, Math.round(burst.from * sampleRate), Math.round(burst.to * sampleRate));
  const scan = scanInChunks([levels], sampleRate);
  const unity = () => 1;
  const sound: AudioClip = { id: 's', track: 'A2', start: 2, in: 1, out: 3, volume: 1, toEnd: false, srcDur: 3 };
  /**
   * The column a timeline time falls in.
   * @param heights the columns
   * @param from their start, seconds
   * @param width each column's width, seconds
   * @param time the time
   * @returns its height
   */
  const at = (heights: Float32Array, from: number, width: number, time: number) =>
    defined(heights[Math.floor((time - from) / width)]);

  it('a sound clip shows its source part from its in point, at its place on the timeline', () => {
    const { heights, silent } = waveformColumns(scan, sound, unity, 2, 4, 200);
    expect(silent).toBeNull();
    expect(heights).toHaveLength(200);
    expect(at(heights, 2, 0.01, 2.1)).toBe(0);
    expect(at(heights, 2, 0.01, 2.65)).toBeCloseTo(0.1, 2);
    expect(at(heights, 2, 0.01, 3.5)).toBe(0);
  });

  it('is scaled by the chain gain at each column', () => {
    const fade = (time: number) => Math.min(2, Math.max(0, time - 2));
    const { heights } = waveformColumns(scan, sound, fade, 2, 4, 200);
    expect(at(heights, 2, 0.01, 2.55)).toBeCloseTo(0.1 * 0.555, 2);
    const louder = waveformColumns(scan, sound, () => 2, 2, 4, 200).heights;
    expect(at(louder, 2, 0.01, 2.65)).toBeCloseTo(0.2, 1);
  });

  it('a video clip at 2× shows its source twice as fast (207), through sourceAt', () => {
    const fast = { start: 0, kind: 'video' as const, in: 0, out: 3, dur: 0, speed: 2 };
    const { heights, silent } = waveformColumns(scan, fast, unity, 0, 1.5, 150);
    expect(silent).toBeNull();
    expect(at(heights, 0, 0.01, 0.1)).toBe(0);
    expect(at(heights, 0, 0.01, 0.35)).toBeCloseTo(0.5, 1);
    expect(at(heights, 0, 0.01, 0.8)).toBeCloseTo(0.1, 2);
  });

  it('a silent clip is a flat line with its reason: a reversed clip, a muted track', () => {
    const reversed = { start: 0, kind: 'video' as const, in: 0, out: 3, dur: 0, reverse: true as const };
    const flat = waveformColumns(scan, reversed, unity, 0, 3, 30);
    expect(flat.silent).toBe('A reversed clip plays without sound.');
    expect(flat.heights.every((height) => height === 0)).toBe(true);
    const muted = waveformColumns(scan, sound, { silent: 'The Audio 2 track is muted.' }, 2, 4, 20);
    expect(muted.silent).toBe('The Audio 2 track is muted.');
    expect(muted.heights.every((height) => height === 0)).toBe(true);
  });

  it('an empty stretch or no columns gives nothing to draw', () => {
    expect(waveformColumns(scan, sound, unity, 3, 3, 10).heights.every((height) => height === 0)).toBe(true);
    expect(waveformColumns(scan, sound, unity, 2, 4, 0).heights).toHaveLength(0);
  });
});

describe('a scan saved with a project (408 T063, Q14)', () => {
  const scan: SoundScan = { rate: 100, peaks: Uint8Array.from([0, 1, 128, 255, 7]), rms: Float32Array.from([RMS_FLOOR, -60.5, -3.25]), dur: 0.05 };

  it('encodes as text and decodes to the same scan', () => {
    const saved = encodeScan(scan);
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
    const back = decodeScan(saved);
    expect(back).toEqual(scan);
    expect(back?.peaks).toBeInstanceOf(Uint8Array);
    expect(back?.rms).toBeInstanceOf(Float32Array);
  });

  it('anything else decodes to null', () => {
    for (const bad of [null, 'x', { dur: 1, peaks: 'AA', rms: 'AAA' }, { dur: -1, peaks: '', rms: '' }, { dur: 1, peaks: '!!', rms: '' }, { dur: 1, peaks: 'AA==', rms: 4 }]) {
      expect(decodeScan(bad)).toBeNull();
    }
  });
});
