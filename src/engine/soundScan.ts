/*
 * A sound file's scan (208 §3, D5), free of DOM and React: its samples folded, chunk by chunk as the decoder hands
 * them over, into peaks (the loudest sample of each 10 ms, for the waveform) and 50 ms RMS (for finding the voice).
 * A file is scanned once; waveforms and ducking read the scan and never decode again. A 3-hour file's scan is ~2 MB
 * (AC-4: under 10 MB).
 */
import { soundMuted, sourceAt, type SpeedClip } from './speed';
import type { AudioClip } from './timeline';

/** Peaks per second of source. */
export const SCAN_RATE = 100;
/** Seconds of sound in one RMS step. */
export const RMS_STEP = 0.05;
/** dBFS a peak byte of 0 stands for: quieter is silence on a waveform. */
export const PEAK_FLOOR = -96;
/** dBFS of a silent RMS step (so a step is never −∞). */
export const RMS_FLOOR = -120;

/** A file's scan: peaks as dB steps (`peakDb`), RMS in dBFS, and the length scanned. */
export interface SoundScan {
  rate: typeof SCAN_RATE;
  /** The loudest sample of each 1/100 s, 0 = `PEAK_FLOOR` … 255 = 0 dBFS. */
  peaks: Uint8Array;
  /** The mean power of each 50 ms over every channel, dBFS (`RMS_FLOOR` when silent). */
  rms: Float32Array;
  /** Seconds. */
  dur: number;
}

/** A scan as a saved project's cache keeps it (408 Q14): its arrays as base64 text. */
export interface SavedScan {
  dur: number;
  /** `peaks`' bytes, base64. */
  peaks: string;
  /** `rms`' Float32 bytes (little-endian), base64. */
  rms: string;
}

/**
 * Bytes as base64.
 * @param bytes the bytes
 * @returns the text
 */
function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(text);
}

/**
 * Base64 as bytes.
 * @param text the text
 * @returns the bytes, or null when it isn't base64
 */
function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * A scan as text, to keep with a saved project.
 * @param scan the scan
 * @returns its saved form
 */
export function encodeScan(scan: SoundScan): SavedScan {
  const rms = new Uint8Array(scan.rms.buffer, scan.rms.byteOffset, scan.rms.byteLength);
  return { dur: scan.dur, peaks: toBase64(scan.peaks), rms: toBase64(rms) };
}

/**
 * A saved scan read back, checked.
 * @param saved what the cache held
 * @returns the scan, or null when it isn't one
 */
export function decodeScan(saved: unknown): SoundScan | null {
  if (!saved || typeof saved !== 'object') return null;
  const { dur, peaks, rms } = saved as Record<string, unknown>;
  if (typeof dur !== 'number' || !Number.isFinite(dur) || dur < 0 || typeof peaks !== 'string' || typeof rms !== 'string') return null;
  const peakBytes = fromBase64(peaks);
  const rmsBytes = fromBase64(rms);
  if (!peakBytes || !rmsBytes || rmsBytes.length % 4 !== 0) return null;
  // A copy on its own aligned buffer: the Float32Array view needs an offset that's a multiple of 4.
  return { rate: SCAN_RATE, peaks: peakBytes, rms: new Float32Array(rmsBytes.slice().buffer), dur };
}

/**
 * A peak as a byte: its level in 255 steps from `PEAK_FLOOR` to 0 dBFS (~0.38 dB each).
 * @param amplitude the loudest |sample|
 * @returns 0–255
 */
const peakByte = (amplitude: number): number => {
  if (amplitude <= 0) return 0;
  const level = (20 * Math.log10(amplitude) - PEAK_FLOOR) / -PEAK_FLOOR;
  return Math.round(Math.min(1, Math.max(0, level)) * 255);
};

/**
 * A peak byte's level.
 * @param byte 0–255
 * @returns dBFS, `PEAK_FLOOR` for 0
 */
export const peakDb = (byte: number): number => PEAK_FLOOR + (byte / 255) * -PEAK_FLOOR;

/** A typed array that grows as values are pushed (the file's length isn't known while it is decoded). */
class Growing<T extends Uint8Array<ArrayBuffer> | Float32Array<ArrayBuffer>> {
  private values: T;
  private length = 0;

  /**
   * @param make makes an array of a length
   */
  constructor(private readonly make: (length: number) => T) {
    this.values = make(1024);
  }

  /**
   * Adds a value at the end.
   * @param value the value
   */
  push(value: number): void {
    if (this.length === this.values.length) {
      const bigger = this.make(this.values.length * 2);
      bigger.set(this.values);
      this.values = bigger;
    }
    this.values[this.length++] = value;
  }

  /**
   * The values pushed, in an array of their own length.
   * @returns the values
   */
  done(): T {
    return this.values.slice(0, this.length) as T;
  }
}

/** Folds a file's samples into its scan, one chunk at a time: the chunks' sizes don't change the scan. */
export class ScanBuilder {
  /** Frames seen so far. */
  private frames = 0;
  private readonly peaks = new Growing((length) => new Uint8Array(length));
  private readonly rms = new Growing((length) => new Float32Array(length));
  /** The current peak bin: its index, first frame, the frame it ends before, and its loudest |sample|. */
  private peakBin = 0;
  private peakStart = 0;
  private peakEnd: number;
  private peak = 0;
  /** The current RMS step: its index, first frame, the frame it ends before, its sum of squares and sample count. */
  private rmsBin = 0;
  private rmsStart = 0;
  private rmsEnd: number;
  private power = 0;
  private count = 0;

  /**
   * @param sampleRate the file's samples per second
   */
  constructor(private readonly sampleRate: number) {
    this.peakEnd = this.binEnd(0, SCAN_RATE);
    this.rmsEnd = this.binEnd(0, 1 / RMS_STEP);
  }

  /**
   * The frame a bin ends before (bins start on whole frames, so their sizes add up to the file exactly).
   * @param bin the bin's index
   * @param perSecond bins per second
   * @returns the frame index
   */
  private binEnd(bin: number, perSecond: number): number {
    return Math.ceil(((bin + 1) * this.sampleRate) / perSecond - 1e-9);
  }

  /**
   * Adds a chunk of samples.
   * @param channels each channel's samples, the same length (a longer one is read only as far as the shortest)
   */
  add(channels: readonly Float32Array[]): void {
    if (channels.length === 0) return;
    const length = Math.min(...channels.map((channel) => channel.length));
    for (let index = 0; index < length; index++) {
      const frame = this.frames + index;
      if (frame >= this.peakEnd) this.endPeak();
      if (frame >= this.rmsEnd) this.endRms();
      for (const channel of channels) {
        const sample = channel[index] ?? 0;
        const size = Math.abs(sample);
        if (size > this.peak) this.peak = size;
        this.power += sample * sample;
      }
      this.count += channels.length;
    }
    this.frames += length;
  }

  /** Closes the current peak bin and opens the next. */
  private endPeak(): void {
    this.peaks.push(peakByte(this.peak));
    this.peak = 0;
    this.peakStart = this.peakEnd;
    this.peakEnd = this.binEnd(++this.peakBin, SCAN_RATE);
  }

  /** Closes the current RMS step and opens the next. */
  private endRms(): void {
    this.rms.push(this.power > 0 ? Math.max(RMS_FLOOR, 10 * Math.log10(this.power / this.count)) : RMS_FLOOR);
    this.power = 0;
    this.count = 0;
    this.rmsStart = this.rmsEnd;
    this.rmsEnd = this.binEnd(++this.rmsBin, 1 / RMS_STEP);
  }

  /**
   * The scan, with the last part-filled bin and step closed.
   * @returns the scan
   */
  finish(): SoundScan {
    if (this.frames > this.peakStart) this.endPeak();
    if (this.frames > this.rmsStart) this.endRms();
    return { rate: SCAN_RATE, peaks: this.peaks.done(), rms: this.rms.done(), dur: this.frames / this.sampleRate };
  }
}

/** A clip whose waveform is drawn: a sound clip, or a video clip with its timing and speed (207). */
export type WaveClip = AudioClip | (SpeedClip & Pick<AudioClip, 'start'>);

/** What scales a waveform: the chain gain at a timeline time (`chainGainAt`), or why the clip is silent. */
export type WaveGain = ((time: number) => number) | { silent: string };

/** A waveform's columns: each one's loudest heard amplitude (1 = full scale; up to 4 at 200 % × 200 %). */
export interface Waveform {
  heights: Float32Array;
  /** Why it is a flat line (a muted track, 207's silent speeds), for its title and screen readers; null when heard. */
  silent: string | null;
}

/**
 * The loudest peak of a stretch of the source.
 * @param scan the file's scan
 * @param low the stretch's start, source seconds
 * @param high its end
 * @returns the amplitude, 0 outside the file
 */
function peakOver(scan: SoundScan, low: number, high: number): number {
  if (high <= 0 || low >= scan.dur || scan.peaks.length === 0) return 0;
  const last = scan.peaks.length - 1;
  const first = Math.min(last, Math.max(0, Math.floor(low * scan.rate)));
  const end = Math.min(last, Math.max(first, Math.ceil(high * scan.rate) - 1));
  let loudest = 0;
  for (let bin = first; bin <= end; bin++) loudest = Math.max(loudest, scan.peaks[bin] ?? 0);
  return loudest === 0 ? 0 : 10 ** (peakDb(loudest) / 20);
}

/**
 * A clip's waveform over a stretch of the timeline (208 AC-4): each column the loudest part of the source it plays
 * there (through `sourceAt` for a video clip, so a trimmed or sped-up clip shows its part at its speed), times the
 * chain gain at the column's middle, so the shape shows what is heard.
 * @param scan the source file's scan
 * @param clip the clip
 * @param gain the chain gain, or why the clip is silent
 * @param from the stretch's start, timeline seconds
 * @param to its end
 * @param columns how many columns
 * @returns the columns (all 0 with the reason when silent)
 */
export function waveformColumns(
  scan: SoundScan,
  clip: WaveClip,
  gain: WaveGain,
  from: number,
  to: number,
  columns: number,
): Waveform {
  const heights = new Float32Array(Math.max(0, Math.floor(columns)));
  if (typeof gain !== 'function') return { heights, silent: gain.silent };
  const silent = 'kind' in clip ? soundMuted(clip) : null;
  if (silent !== null || to <= from || heights.length === 0) return { heights, silent };
  const sourceTime = (time: number) =>
    'kind' in clip ? sourceAt(clip, time - clip.start) : clip.in + (time - clip.start);
  const width = (to - from) / heights.length;
  for (let column = 0; column < heights.length; column++) {
    const start = from + column * width;
    const first = sourceTime(start);
    const second = sourceTime(start + width);
    heights[column] = peakOver(scan, Math.min(first, second), Math.max(first, second)) * gain(start + width / 2);
  }
  return { heights, silent };
}

/** A decoded chunk of a file's sound, as the decoder hands it over. */
export interface SampleChunk {
  /** Each channel's samples. */
  channels: Float32Array[];
  sampleRate: number;
  /** Where the chunk ends in the file, seconds (for progress). */
  end: number;
}

/** How a scan reports and stops. */
export interface ScanOptions {
  /** The file's length, seconds, as its metadata says (for progress); 0 when not known. */
  dur: number;
  signal?: AbortSignal;
  /** Called with the share done, 0–1. */
  progress?: (share: number) => void;
}

/**
 * Scans a file's sound from its decoded chunks, in order (the worker's decoder, or a test's samples).
 * @param chunks the chunks
 * @param options the length, the abort signal and the progress callback
 * @returns the scan, or null when there were no samples
 * @throws {DOMException} an AbortError once the signal has fired
 */
export async function scanSamples(chunks: AsyncIterable<SampleChunk>, options: ScanOptions): Promise<SoundScan | null> {
  let builder: ScanBuilder | null = null;
  for await (const chunk of chunks) {
    if (options.signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
    builder ??= new ScanBuilder(chunk.sampleRate);
    builder.add(chunk.channels);
    if (options.dur > 0) options.progress?.(Math.min(1, chunk.end / options.dur));
  }
  if (options.signal?.aborted) throw new DOMException('Scan cancelled', 'AbortError');
  return builder?.finish() ?? null;
}
