import { ALL_FORMATS, AudioBufferSink, Input, type AudioBufferSource } from 'mediabunny';
import type { DuckCurves } from './ducking';
import { gainCurve } from './keyframes';
import { MasterStage } from './limiter';
import { LoudnessMeter } from './loudness';
import { chainCurve, trackGain } from './mixGain';
import { mediaInput, type MediaFile } from './mediaFile';
import { audioPlan, type SoundSource } from './soundPlan';
import { projectLength, type AudioClip, type Project, type TimedClip } from './timeline';
import { timeStretchChannels } from './timeStretch';

/*
 * The export's sound (videoExport.ts, split out in 208): every sound of `audioPlan` (clips' own sound plus every sound
 * clip, unless its track is muted) opened for windowed decoding and mixed in 10-second windows through the gain chain
 * (mixGain.ts), then, with a loudness target, through the loudness gain and the limiter (the master stage). Memory is
 * one window's, whatever the number of tracks.
 */

/** A clip's sound to export: its timing, its file and its own sound's volume (0–1). */
export interface SoundClip extends TimedClip {
  file: MediaFile;
  volume: number;
}

/** A sound clip with its file. */
export interface ExportAudio extends AudioClip {
  file: MediaFile;
}

/** What the export's sound needs of the job: the project with its files, and the sound settings. */
export interface SoundJob extends Project<SoundClip> {
  audio: ExportAudio[];
  /** Each ducked track's duck curve (208 AC-6), from the scans; missing = nothing ducked. */
  ducks?: DuckCurves;
  /** The loudness target, LUFS (208 AC-8); missing = Off, the mix exactly as before. */
  loudness?: number;
  /** A stored measurement (the panel's, AC-9): used when its key is this mix's, else the mix is measured first. */
  measured?: MixMeasure;
  onProgress?: (fraction: number, phase: string) => void;
  signal?: AbortSignal;
}

/** A mix's loudness measurement and the gain that brings it to its target (208 §4). */
export interface MixMeasure {
  /** `mixKey`: the sound plan, tracks, duck curves and target it was measured for. */
  key: string;
  /** The mix's integrated loudness, LUFS, and true peak, dBTP, before the gain. */
  lufs: number;
  peak: number;
  /** The loudness gain, dB (±24). */
  gain: number;
  /** How far the limiter turns the loudest part down, dB (the panel warns over 6, AC-9). */
  reduction: number;
}

/** An export that can't be made, with a message for the user. */
export class ExportError extends Error {}

/** The export's sound: stereo at 48 kHz. */
export const SAMPLE_RATE = 48000;
/** Seconds of sound mixed at a time. */
export const AUDIO_WINDOW = 10;
/** Source seconds decoded before a stretched stretch, so its first frames have something to line up with (D5). */
const STRETCH_CARRY = 0.05;

/**
 * Stops the export when it was cancelled.
 * @param signal the job's abort signal
 * @throws {DOMException} an AbortError once the signal has fired
 */
export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
};

/** A file opened for decoding its sound. */
export interface OpenSound {
  sink: AudioBufferSink;
  input: Input;
}

/** A sound the mix plays (timeline times, source time, volume and its ramps), opened for decoding. */
export interface AudioSource extends SoundSource, OpenSound {}

/**
 * Opens a file's sound for decoding.
 * @param file the file
 * @returns its sound, or null when it has none the browser can decode
 */
async function openSound(file: MediaFile): Promise<OpenSound | null> {
  const input = new Input({ source: mediaInput(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack().catch(() => null);
  if (!track || !(await track.canDecode())) {
    input.dispose();
    return null;
  }
  return { input, sink: new AudioBufferSink(track) };
}

/**
 * Opens the sounds of `audioPlan` for windowed decoding.
 * @param job the export
 * @param open opens a file's sound (tests pass a fake decoder: Node decodes no media)
 * @returns the sources; clips without sound are left out
 * @throws {ExportError} when a sound clip's file can't be read
 */
export async function openAudio(job: SoundJob, open: (file: MediaFile) => Promise<OpenSound | null> = openSound): Promise<AudioSource[]> {
  const sources: AudioSource[] = [];
  const clipFiles = new Map(job.clips.map((clip) => [clip.id, clip.file]));
  const sounds = new Map(job.audio.map((audioClip) => [audioClip.id, audioClip]));
  for (const planned of audioPlan(job)) {
    const soundClip = sounds.get(planned.ref);
    const file = soundClip?.file ?? clipFiles.get(planned.ref);
    if (!file) continue;
    const sound = await open(file);
    if (!sound && soundClip) {
      const what = soundClip.name ? `The sound file “${soundClip.name}”` : 'The music file';
      throw new ExportError(`${what} couldn’t be read. Try an MP3, M4A or WAV file.`);
    }
    if (sound) sources.push({ ...planned, ...sound });
  }
  return sources;
}

/**
 * A source's volume at a time, with its fade-in and fade-out ramps.
 * @param source the sound source
 * @param time timeline seconds
 * @returns the gain
 */
function rampedVolume(source: SoundSource, time: number): number {
  let volume = source.volume;
  if (source.fadeIn > 0 && time < source.start + source.fadeIn) volume *= Math.max(0, (time - source.start) / source.fadeIn);
  if (source.fadeOut > 0 && time > source.end - source.fadeOut) volume *= Math.max(0, (source.end - time) / source.fadeOut);
  return volume;
}

/** A stretch of the timeline, seconds. */
interface Stretch {
  from: number;
  to: number;
}

/** What the gain chain reads besides the source (208): the tracks' volumes and the duck curves. */
export type MixSettings = Pick<SoundJob, 'tracks' | 'ducks'>;

const NO_DUCKS: DuckCurves = new Map();

/**
 * Schedules a source's volume over the part of a window it plays, as one curve when it changes along the way: the
 * whole gain chain (208: a track volume or ducking), or volume keyframes (205) or transition edges (206) alone, the
 * only automation on this gain node, so events never overlap; else its volume with its ramps, as before 208.
 * @param gain the source's gain parameter
 * @param source the sound source
 * @param playing the part of the window it plays, timeline seconds
 * @param windowStart the window's start, timeline seconds (the context's time 0)
 * @param mixing the tracks and duck curves
 */
function scheduleGain(gain: AudioParam, source: SoundSource, playing: Stretch, windowStart: number, mixing: MixSettings): void {
  const { from, to } = playing;
  const ducks = mixing.ducks ?? NO_DUCKS;
  const ducked = source.track !== undefined && ducks.has(source.track);
  if (ducked || trackGain(source, mixing.tracks) !== 1) {
    gain.setValueCurveAtTime(chainCurve(source, mixing.tracks, ducks, from, to - from), from - windowStart, to - from);
    return;
  }
  if (source.gain || source.lead || source.trail) {
    gain.setValueCurveAtTime(gainCurve(source, from, to - from), from - windowStart, to - from);
    return;
  }
  gain.setValueAtTime(rampedVolume(source, from), from - windowStart);
  for (const edge of [source.start + source.fadeIn, source.end - source.fadeOut, to]) {
    if (edge > from && edge <= to) gain.linearRampToValueAtTime(rampedVolume(source, edge), edge - windowStart);
  }
}

/**
 * Decodes a source's sound for the part of a window it plays and schedules each buffer at its place.
 * @param mix the window's audio context
 * @param gain the source's gain node
 * @param source the sound source
 * @param playing the part of the window it plays, timeline seconds
 * @param windowStart the window's start, timeline seconds (the context's time 0)
 */
async function scheduleBuffers(
  mix: OfflineAudioContext,
  gain: GainNode,
  source: AudioSource,
  playing: Stretch,
  windowStart: number,
): Promise<void> {
  const { from, to } = playing;
  if (source.rate !== undefined && source.rate !== 1) {
    await scheduleStretched(mix, gain, source, playing, windowStart);
    return;
  }
  // Source seconds covering the stretch. Before the source's own start (an incoming handle past the file's start)
  // there is nothing to play.
  const sourceFrom = Math.max(0, source.from + (from - source.start));
  const sourceTo = source.from + (to - source.start);
  for await (const decoded of source.sink.buffers(sourceFrom, sourceTo)) {
    const node = mix.createBufferSource();
    node.buffer = decoded.buffer;
    node.connect(gain);
    // Where this decoded buffer lands on the timeline, trimmed to the stretch.
    const lands = source.start + (decoded.timestamp - source.from);
    const offset = Math.max(0, from - lands);
    const duration = Math.min(decoded.duration - offset, to - Math.max(from, lands));
    if (duration > 0) node.start(Math.max(from, lands) - windowStart, offset, duration);
  }
}

/**
 * Decodes a source's sound between two source times into one buffer per channel, at the file's own sample rate.
 * @param source the sound source
 * @param sourceFrom source seconds
 * @param sourceTo source seconds
 * @returns the channels and their sample rate, or null when nothing decoded there
 */
async function decodeSpan(
  source: AudioSource,
  sourceFrom: number,
  sourceTo: number,
): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  let channels: Float32Array[] | null = null;
  let sampleRate = SAMPLE_RATE;
  for await (const decoded of source.sink.buffers(sourceFrom, sourceTo)) {
    const { buffer } = decoded;
    if (!channels) {
      sampleRate = buffer.sampleRate;
      const length = Math.max(1, Math.round((sourceTo - sourceFrom) * sampleRate));
      channels = Array.from({ length: buffer.numberOfChannels }, () => new Float32Array(length));
    }
    const at = Math.round((decoded.timestamp - sourceFrom) * sampleRate);
    channels.forEach((channel, index) => {
      const samples = buffer.getChannelData(Math.min(index, buffer.numberOfChannels - 1));
      const skip = Math.max(0, -at);
      channel.set(samples.subarray(skip, skip + Math.max(0, channel.length - at - skip)), Math.max(0, at));
    });
  }
  return channels ? { channels, sampleRate } : null;
}

/**
 * A source at a speed (207 AC-6): its source part for the stretch decoded (with STRETCH_CARRY before it), stretched to
 * the timeline's length with the same pitch (`timeStretchChannels`, WSOLA), and scheduled at its place; the carried
 * part is skipped.
 * @param mix the window's audio context
 * @param gain the source's gain node
 * @param source the sound source, with its `rate`
 * @param playing the part of the window it plays, timeline seconds
 * @param windowStart the window's start, timeline seconds (the context's time 0)
 */
async function scheduleStretched(
  mix: OfflineAudioContext,
  gain: GainNode,
  source: AudioSource,
  playing: Stretch,
  windowStart: number,
): Promise<void> {
  const rate = source.rate ?? 1;
  const { from, to } = playing;
  // Before the file's start (an incoming handle) there is nothing to play.
  const sourceFrom = Math.max(0, source.from + (from - source.start) * rate);
  const sourceTo = source.from + (to - source.start) * rate;
  if (sourceTo <= sourceFrom) return;
  const decodeFrom = Math.max(0, sourceFrom - STRETCH_CARRY);
  const span = await decodeSpan(source, decodeFrom, sourceTo);
  if (!span) return;
  const stretched = timeStretchChannels(span.channels, rate, span.sampleRate);
  const buffer = mix.createBuffer(stretched.length, Math.max(1, stretched[0]?.length ?? 0), span.sampleRate);
  stretched.forEach((channel, index) => buffer.getChannelData(index).set(channel));
  const node = mix.createBufferSource();
  node.buffer = buffer;
  node.connect(gain);
  // The stretched sound starts at decodeFrom's timeline time; the carried part before `from` is skipped.
  const lands = source.start + (decodeFrom - source.from) / rate;
  const offset = Math.max(0, from - lands);
  const duration = Math.min(buffer.duration - offset, to - Math.max(from, lands));
  if (duration > 0) node.start(Math.max(from, lands) - windowStart, offset, duration);
}

/**
 * Mixes the sound of a window of the timeline into one stereo 48 kHz buffer: memory is the window's, whatever the
 * number of tracks (each source is decoded only for its part of the window).
 * @param sources the opened sound sources
 * @param windowStart the window's start, timeline seconds
 * @param windowLength its length, seconds
 * @param mixing the tracks and duck curves (the gain chain)
 * @returns the mixed sound
 */
export async function mixWindow(
  sources: AudioSource[],
  windowStart: number,
  windowLength: number,
  mixing: MixSettings,
): Promise<AudioBuffer> {
  const mix = new OfflineAudioContext(2, Math.max(1, Math.round(windowLength * SAMPLE_RATE)), SAMPLE_RATE);
  const windowEnd = windowStart + windowLength;
  for (const source of sources) {
    // A source plays into its transitions' handles (206): from half the one leading in, to half its own.
    const first = source.start - (source.lead ?? 0);
    const last = source.end + (source.trail ?? 0);
    if (last <= windowStart || first >= windowEnd) continue;
    const playing = { from: Math.max(windowStart, first), to: Math.min(windowEnd, last) };
    const gain = mix.createGain();
    gain.connect(mix.destination);
    scheduleGain(gain.gain, source, playing, windowStart, mixing);
    await scheduleBuffers(mix, gain, source, playing, windowStart);
  }
  return mix.startRendering();
}

/** The loudness gain's limit either way, dB. */
const LOUDNESS_GAIN = 24;
/** The limiter's ceiling, dBTP, and the reduction past which the gain is corrected by a second pass (D4), dB. */
const CEILING = -1;
const CORRECT_OVER = 1;

/**
 * A short hash of a text (FNV-1a), for keys.
 * @param text the text
 * @returns 8 hex digits and the text's length
 */
function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return `${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
}

/**
 * What a mix's loudness depends on (208 AC-9): the sound plan, the tracks' sound settings, the duck curves and the
 * target. Equal keys measure alike, so a stored measurement is reused.
 * @param job the export
 * @returns the key
 */
export function mixKey(job: SoundJob): string {
  const tracks = job.tracks.map(({ id, kind, muted, volume, role, voice, duck }) => [id, kind, muted, volume, role, voice, duck]);
  const ducks = [...(job.ducks ?? NO_DUCKS)].map(([track, curve]) => [
    track,
    curve.length,
    curve.reduce((sum, value, index) => sum + value * ((index % 97) + 1), 0),
  ]);
  return hashOf(JSON.stringify([audioPlan(job), tracks, ducks, job.loudness ?? 'off']));
}

/** A window of the export's sound: the mix as it is (Loudness Off), or through the master stage. */
export type SoundWindow = { buffer: AudioBuffer } | { channels: [Float32Array, Float32Array] };

/**
 * Two runs of samples, one after the other.
 * @param head the first
 * @param tail the second
 * @returns them joined
 */
function joined(head: Float32Array, tail: Float32Array): Float32Array {
  const all = new Float32Array(head.length + tail.length);
  all.set(head);
  all.set(tail, head.length);
  return all;
}

/**
 * The export's sound, window by window (10 s, mixed as the file needs it): the mix, through the loudness gain and the
 * limiter when a measurement is given (the limiter's delay taken out, so it stays on the frames).
 * @param sources the opened sound sources
 * @param job the export (tracks and duck curves)
 * @param total the video's length, seconds
 * @param measure the loudness gain to apply; null = Off
 * @yields the windows in order; through the master stage the last one carries the limiter's tail
 */
export async function* soundWindows(
  sources: AudioSource[],
  job: MixSettings,
  total: number,
  measure: Pick<MixMeasure, 'gain'> | null,
): AsyncGenerator<SoundWindow> {
  const stage = measure ? new MasterStage(measure.gain, SAMPLE_RATE) : null;
  for (let from = 0; from < total; from += AUDIO_WINDOW) {
    const buffer = await mixWindow(sources, from, Math.min(AUDIO_WINDOW, total - from), job);
    if (!stage) {
      yield { buffer };
      continue;
    }
    let channels = stage.process(buffer.getChannelData(0), buffer.getChannelData(1));
    if (from + AUDIO_WINDOW >= total) {
      const [left, right] = stage.finish();
      channels = [joined(channels[0], left), joined(channels[1], right)];
    }
    yield { channels };
  }
}

/** A mix's measurement: loudness and true peak, and the limiter's reduction (0 without it). */
type Measured = Pick<MixMeasure, 'lufs' | 'peak' | 'reduction'>;

/**
 * Measures a mix (sound only, no pictures), window by window: only the meter's state is kept.
 * @param sources the opened sound sources
 * @param job the export
 * @param total the video's length, seconds
 * @param gain the loudness gain to measure through (with the limiter), or null for the plain mix
 * @returns the measurement
 */
async function measureMix(sources: AudioSource[], job: SoundJob, total: number, gain: number | null): Promise<Measured> {
  const meter = new LoudnessMeter(SAMPLE_RATE);
  const stage = gain === null ? null : new MasterStage(gain, SAMPLE_RATE);
  for (let from = 0; from < total; from += AUDIO_WINDOW) {
    throwIfAborted(job.signal);
    const buffer = await mixWindow(sources, from, Math.min(AUDIO_WINDOW, total - from), job);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    if (stage) meter.add(...stage.process(left, right));
    else meter.add(left, right);
  }
  if (stage) meter.add(...stage.finish());
  return { lufs: meter.integrated(), peak: meter.truePeak(), reduction: stage ? stage.reduction() : 0 };
}

/**
 * A loudness gain within its limit.
 * @param gain dB
 * @returns dB, ±24
 */
const clampGain = (gain: number) => Math.min(LOUDNESS_GAIN, Math.max(-LOUDNESS_GAIN, gain));

/**
 * The loudness gain for the export (D4): a stored measurement of the same mix when there is one, else the mix
 * measured; target − measured, clamped to ±24 dB; and when the limiter would turn the loudest part down more than
 * 1 dB, measured again through the gain and the limiter and the gain corrected once, so heavy limiting still lands on
 * the target.
 * @param sources the opened sound sources
 * @param job the export
 * @param total the video's length, seconds
 * @returns the measurement, or null when Loudness is Off
 */
export async function planLoudness(sources: AudioSource[], job: SoundJob, total: number): Promise<MixMeasure | null> {
  const target = job.loudness;
  if (target === undefined) return null;
  const key = mixKey(job);
  if (job.measured?.key === key) return job.measured;
  job.onProgress?.(0, 'Measuring loudness…');
  const plain = await measureMix(sources, job, total, null);
  // Silence stays silence: nothing to turn up.
  if (!Number.isFinite(plain.lufs)) return { key, lufs: plain.lufs, peak: plain.peak, gain: 0, reduction: 0 };
  let gain = clampGain(target - plain.lufs);
  let reduction = Math.max(0, gain + plain.peak - CEILING);
  if (reduction > CORRECT_OVER) {
    const limited = await measureMix(sources, job, total, gain);
    gain = clampGain(gain + target - limited.lufs);
    reduction = limited.reduction + Math.max(0, target - limited.lufs);
  }
  return { key, lufs: plain.lufs, peak: plain.peak, gain, reduction };
}

/** Adds the export's sound a window ahead of the frames, so the two tracks interleave in the file. */
export class SoundFeed {
  /** Timeline seconds of sound added so far. */
  private until = 0;
  private readonly windows: AsyncGenerator<SoundWindow> | null;

  /**
   * @param track the sound track, or null for a video without sound
   * @param sources the opened sound sources
   * @param total the project's length, seconds
   * @param mixing the tracks and duck curves
   * @param measure the loudness gain, or null for Off
   */
  constructor(
    private readonly track: AudioBufferSource | null,
    sources: AudioSource[],
    private readonly total: number,
    mixing: MixSettings,
    measure: MixMeasure | null,
  ) {
    this.windows = track ? soundWindows(sources, mixing, total, measure) : null;
  }

  /**
   * Adds sound windows until they reach a second past a time (or the end).
   * @param time timeline seconds
   */
  async feedUntil(time: number): Promise<void> {
    while (this.track && this.windows && this.until < this.total && this.until <= time + 1) {
      const next = await this.windows.next();
      if (next.done) break;
      await this.track.add(audioBufferOf(next.value));
      this.until += AUDIO_WINDOW;
    }
  }
}

/**
 * A sound window as the encoder takes it: the mix's own buffer when untouched, else a new one.
 * @param window the window
 * @returns the buffer
 */
function audioBufferOf(window: SoundWindow): AudioBuffer {
  if ('buffer' in window) return window.buffer;
  const [left, right] = window.channels;
  const buffer = new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, left.length), sampleRate: SAMPLE_RATE });
  buffer.getChannelData(0).set(left);
  buffer.getChannelData(1).set(right);
  return buffer;
}

/**
 * The panel's background measurement (AC-9): the job's stored measurement when it is of this mix, else the mix opened
 * and measured as the export would (`planLoudness`), its files closed again.
 * @param job the sound of the export, with the last measurement as `measured` and an abort signal
 * @param open opens a file's sound (tests pass a fake decoder)
 * @returns the measurement, or null when Loudness is Off
 */
export async function measureLoudness(job: SoundJob, open: (file: MediaFile) => Promise<OpenSound | null> = openSound): Promise<MixMeasure | null> {
  if (job.loudness === undefined) return null;
  if (job.measured?.key === mixKey(job)) return job.measured;
  const sources = await openAudio(job, open);
  try {
    return await planLoudness(sources, job, projectLength(job));
  } finally {
    for (const source of sources) source.input.dispose();
  }
}
