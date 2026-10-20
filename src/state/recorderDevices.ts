import { peakDbfs } from '../engine/voiceLevel';

/*
 * The browser's microphone, MediaRecorder and level meter in the shapes the voice-over recorder (voiceRecorder.ts)
 * uses, so tests replace them with fakes (tests/support/fakeMicrophone.ts).
 */

/** An input track, as the recorder uses it (a MediaStreamTrack). */
export interface MicTrack {
  readonly readyState: MediaStreamTrackState;
  stop(): void;
  getSettings(): MediaTrackSettings & { latency?: number };
  addEventListener(type: 'ended', listener: () => void): void;
  removeEventListener(type: 'ended', listener: () => void): void;
}

/** A microphone stream, as the recorder uses it (a MediaStream). */
export interface MicStream {
  getTracks(): MicTrack[];
}

/** A MediaRecorder, reduced to what a take needs. */
export interface TakeRecorder {
  start(timeslice: number): void;
  stop(): void;
  onstart: (() => void) | null;
  ondata: ((chunk: Blob) => void) | null;
  onstop: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
}

/** The level meter on the microphone (an AnalyserNode on its own AudioContext). */
export interface RecorderMeter {
  /** The last window's peak, dBFS. */
  peak(): number;
  /** The audio context's base latency, s (a fallback for the input latency). */
  readonly latency: number;
  close(): void;
}

/**
 * The real MediaRecorder behind the `TakeRecorder` shape.
 * @param stream the microphone
 * @param mime the format
 * @returns the recorder
 */
export function mediaRecorder(stream: MicStream, mime: string): TakeRecorder {
  const recorder = new MediaRecorder(stream as MediaStream, { mimeType: mime, audioBitsPerSecond: 128_000 });
  const take: TakeRecorder = {
    start: (timeslice) => recorder.start(timeslice),
    stop: () => {
      if (recorder.state !== 'inactive') recorder.stop();
    },
    onstart: null,
    ondata: null,
    onstop: null,
    onerror: null,
  };
  recorder.addEventListener('start', () => take.onstart?.());
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) take.ondata?.(event.data);
  });
  recorder.addEventListener('stop', () => take.onstop?.());
  recorder.addEventListener('error', (event) => take.onerror?.(event));
  return take;
}

/**
 * The real meter: an AnalyserNode (2048 samples) on its own AudioContext.
 * @param stream the microphone
 * @returns the meter
 */
export function analyserMeter(stream: MicStream): RecorderMeter {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  context.createMediaStreamSource(stream as MediaStream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  return {
    peak: () => {
      analyser.getFloatTimeDomainData(samples);
      return peakDbfs(samples);
    },
    latency: context.baseLatency,
    close: () => void context.close().catch(() => undefined),
  };
}
