import type { MicStream, MicTrack, RecorderMeter, TakeRecorder } from '@/state/voiceRecorder';

/*
 * Stand-ins for the microphone, MediaRecorder and the level meter (209 T030): the recorder's tests drive them by hand
 * (the recorder's start, a chunk, the microphone unplugged) with Vitest's fake timers for time.
 */

/** An input track that can be stopped or can end by itself (unplugged). */
export class FakeTrack implements MicTrack {
  readyState: MediaStreamTrackState = 'live';
  private readonly ended = new Set<() => void>();

  /**
   * @param settings what `getSettings` reports
   */
  constructor(private readonly settings: MediaTrackSettings & { latency?: number } = {}) {}

  /** Stops it, as the recorder does. */
  stop(): void {
    this.readyState = 'ended';
  }

  /** @returns its settings */
  getSettings(): MediaTrackSettings & { latency?: number } {
    return this.settings;
  }

  /**
   * @param type 'ended'
   * @param listener called when it ends by itself
   */
  addEventListener(type: 'ended', listener: () => void): void {
    this.ended.add(listener);
  }

  /**
   * @param type 'ended'
   * @param listener the listener to drop
   */
  removeEventListener(type: 'ended', listener: () => void): void {
    this.ended.delete(listener);
  }

  /** The microphone was unplugged or failed. */
  end(): void {
    this.readyState = 'ended';
    for (const listener of this.ended) listener();
  }
}

/** A microphone stream with one input track. */
export class FakeStream implements MicStream {
  readonly track: FakeTrack;

  /** @param settings the track's settings */
  constructor(settings: MediaTrackSettings & { latency?: number } = {}) {
    this.track = new FakeTrack(settings);
  }

  /** @returns its tracks */
  getTracks(): FakeTrack[] {
    return [this.track];
  }
}

/** A MediaRecorder stand-in; the test fires its events. */
export class FakeRecorder implements TakeRecorder {
  onstart: (() => void) | null = null;
  ondata: ((chunk: Blob) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  timeslice: number | null = null;
  stopped = false;

  /**
   * @param stream what it records
   * @param mime its format
   */
  constructor(
    readonly stream: MicStream,
    readonly mime: string,
  ) {}

  /** @param timeslice ms between chunks */
  start(timeslice: number): void {
    this.timeslice = timeslice;
  }

  /** Asks it to stop: the test answers with `finishStop`. */
  stop(): void {
    this.stopped = true;
  }

  /** Capture began. */
  emitStart(): void {
    this.onstart?.();
  }

  /**
   * One chunk of the recording.
   * @param text its content
   */
  emitChunk(text = 'x'): void {
    this.ondata?.(new Blob([text], { type: this.mime }));
  }

  /**
   * The last chunk and the stop event, as MediaRecorder sends them after `stop()`.
   * @param text the last chunk's content
   */
  finishStop(text = 'z'): void {
    this.emitChunk(text);
    this.onstop?.();
  }
}

/** A level meter stand-in whose peak the test sets. */
export class FakeMeter implements RecorderMeter {
  peakDb = -60;
  closed = false;
  latency = 0.01;

  /** @returns the peak, dBFS */
  peak(): number {
    return this.peakDb;
  }

  /** Closes it. */
  close(): void {
    this.closed = true;
  }
}

/** `navigator.mediaDevices` stand-in: lists microphones and opens them (or fails). */
export class FakeDevices {
  microphones: MediaDeviceInfo[] = [
    { kind: 'audioinput', deviceId: 'default', label: 'Default - Built-in', groupId: 'g', toJSON: () => ({}) },
    { kind: 'audioinput', deviceId: 'usb', label: 'USB Mic', groupId: 'g', toJSON: () => ({}) },
  ];
  /** Set to make the next `getUserMedia` fail. */
  failNext: Error | null = null;
  readonly asked: MediaStreamConstraints[] = [];
  readonly streams: FakeStream[] = [];

  /** @returns the devices */
  enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return Promise.resolve(this.microphones);
  }

  /**
   * @param constraints what is asked for
   * @returns a new stream, or the failure set
   */
  getUserMedia(constraints: MediaStreamConstraints): Promise<FakeStream> {
    this.asked.push(constraints);
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      return Promise.reject(error);
    }
    const stream = new FakeStream({ latency: 0.02 });
    this.streams.push(stream);
    return Promise.resolve(stream);
  }
}

/**
 * A DOMException-like error.
 * @param name its name
 * @returns the error
 */
export const mediaError = (name: string): Error => Object.assign(new Error(name), { name });
