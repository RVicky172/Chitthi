// A stand-in for an <audio> element in tests (Node has no DOM): what the preview's sound reads and writes. Moved out of
// the preview sound test (407 T012) so other tests can use it.

/** A stand-in for <audio> (unit tests have no DOM): what previewSound reads and writes. */
export class FakeAudio {
  paused = true;
  currentTime = 0;
  playbackRate = 1;
  preservesPitch = false;
  volume = 1;
  muted = false;
  preload = '';
  src = '';
  dataset: Record<string, string> = {};
  /** Events are never fired: a test plays, pauses and seeks the element itself. */
  addEventListener() {
    // never fires: the tests play, pause and seek the element themselves
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = '';
  }
  load() {
    // nothing to load: there is no media
  }
}

/** One automation call on a fake AudioParam, as the export scheduled it. */
export type ParamCall =
  | { kind: 'cancel'; time: number }
  | { kind: 'set'; value: number; time: number }
  | { kind: 'ramp'; value: number; time: number }
  | { kind: 'curve'; curve: Float32Array; time: number; duration: number };

/** A stand-in for AudioParam that records what is scheduled on it. */
export class FakeParam {
  readonly calls: ParamCall[] = [];
  value = 1;
  cancelScheduledValues(time: number) {
    this.calls.push({ kind: 'cancel', time });
  }
  setValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push({ kind: 'ramp', value, time });
    this.value = value;
  }
  setValueCurveAtTime(curve: Float32Array, time: number, duration: number) {
    this.calls.push({ kind: 'curve', curve: curve.slice(), time, duration });
  }
}

/** A stand-in for AudioBuffer: its channels' samples. */
export class FakeBuffer {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.channels[channel] ?? new Float32Array(this.length);
  }
}

/**
 * A fake param's value at a time, as Web Audio plays its events: a curve linearly between its points (its last value
 * after it), a set value held, a linear ramp from the event before it.
 * @param calls the param's events, in time order
 * @param time seconds
 * @returns the value (1, the gain's default, before any event)
 */
export function paramAt(calls: readonly ParamCall[], time: number): number {
  let value = 1;
  let since = { time: -Infinity, value: 1 };
  for (const call of calls) {
    if (call.kind === 'cancel') continue;
    if (call.kind === 'curve') {
      if (time < call.time) return value;
      const last = call.curve.length - 1;
      const position = Math.min(last, ((time - call.time) / call.duration) * last);
      const index = Math.floor(position);
      const from = call.curve[index] ?? 0;
      const to = call.curve[Math.min(last, index + 1)] ?? from;
      value = from + (to - from) * (position - index);
      since = { time: call.time + call.duration, value: call.curve[last] ?? 0 };
      continue;
    }
    if (call.kind === 'set') {
      if (time < call.time) return value;
      value = call.value;
      since = { time: call.time, value };
      continue;
    }
    // A ramp from the event before it to its value at its time.
    if (time < call.time) return since.value + ((call.value - since.value) * (time - since.time)) / (call.time - since.time);
    value = call.value;
    since = { time: call.time, value };
  }
  return value;
}

/** A gain node of the fake context. */
export interface FakeGain {
  gain: FakeParam;
  connect: () => void;
}

/** A buffer source of the fake context, the gain it plays into, and when it was started. */
export interface FakeSourceNode {
  buffer: FakeBuffer | null;
  target: FakeGain | null;
  connect: (target: FakeGain) => void;
  start: (when: number, offset: number, duration: number) => void;
  starts: [number, number, number][];
}

/**
 * A stand-in for OfflineAudioContext (Node has no Web Audio): records each window's gains and buffer sources, and
 * renders them (each buffer from its offset, at its time, times its gain node's automation). Every context made is
 * kept in `FakeOfflineContext.made` (empty it with `length = 0`).
 */
export class FakeOfflineContext {
  static readonly made: FakeOfflineContext[] = [];
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSourceNode[] = [];
  readonly destination = {};
  constructor(
    readonly channels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    FakeOfflineContext.made.push(this);
  }
  createGain(): FakeGain {
    const node = { gain: new FakeParam(), connect: () => undefined };
    this.gains.push(node);
    return node;
  }
  createBufferSource(): FakeSourceNode {
    const node: FakeSourceNode = {
      buffer: null,
      target: null,
      connect: (target) => (node.target = target),
      starts: [],
      start: (when, offset, duration) => node.starts.push([when, offset, duration]),
    };
    this.sources.push(node);
    return node;
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeBuffer(channels, length, sampleRate);
  }
  startRendering() {
    const out = new FakeBuffer(this.channels, this.length, this.sampleRate);
    for (const node of this.sources) {
      const { buffer, target } = node;
      if (!buffer || !target) continue;
      for (const [when, offset, duration] of node.starts) {
        const first = Math.max(0, Math.round(when * this.sampleRate));
        const last = Math.min(this.length, Math.round((when + duration) * this.sampleRate));
        for (let index = first; index < last; index++) {
          const time = index / this.sampleRate;
          const from = Math.round((time - when + offset) * buffer.sampleRate);
          if (from < 0 || from >= buffer.length) continue;
          const gain = paramAt(target.gain.calls, time);
          for (let channel = 0; channel < this.channels; channel++) {
            const samples = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
            const mixed = out.getChannelData(channel);
            mixed[index] = (mixed[index] ?? 0) + (samples[from] ?? 0) * gain;
          }
        }
      }
    }
    return Promise.resolve(out);
  }
}

/** A node of the fake live graph, and where it was connected. */
export interface FakeNode {
  to: unknown;
  connect: (target: unknown) => void;
  disconnect?: () => void;
}

/**
 * A fake node that remembers its one connection.
 * @param extra the node's own fields
 * @returns the node
 */
function fakeNode<T extends object>(extra: T): FakeNode & T {
  const node = {
    ...extra,
    to: null as unknown,
    connect: (target: unknown) => {
      node.to = target;
    },
    disconnect: () => {
      node.to = null;
    },
  };
  return node;
}

/** A stand-in for AudioWorkletNode: its name and the messages posted to it. */
export class FakeWorkletNode {
  readonly posted: unknown[] = [];
  readonly port = { postMessage: (message: unknown) => this.posted.push(message) };
  to: unknown = null;
  constructor(
    readonly context: unknown,
    readonly name: string,
  ) {}
  connect(target: unknown) {
    this.to = target;
  }
}

/**
 * A stand-in for the preview's AudioContext (Node has no Web Audio): media element sources and gain nodes that remember
 * what they connect to, a clock the test moves, and whether it was resumed.
 */
export class FakeLiveContext {
  currentTime = 0;
  state: 'suspended' | 'running' = 'suspended';
  readonly destination = { name: 'destination' };
  readonly gains: (FakeNode & { gain: FakeParam })[] = [];
  readonly sources: (FakeNode & { element: unknown })[] = [];
  readonly compressors: (FakeNode & Record<'threshold' | 'knee' | 'ratio' | 'attack' | 'release', { value: number }>)[] = [];
  /** The worklet modules added; `failWorklet` makes adding one fail (a CSP refusal, an old browser). */
  readonly modules: string[] = [];
  failWorklet = false;
  readonly audioWorklet = {
    addModule: (url: string) => {
      this.modules.push(url);
      return this.failWorklet ? Promise.reject(new Error('blocked')) : Promise.resolve();
    },
  };
  createMediaElementSource(element: unknown) {
    const node = fakeNode({ element });
    this.sources.push(node);
    return node;
  }
  createGain() {
    const node = fakeNode({ gain: new FakeParam() });
    this.gains.push(node);
    return node;
  }
  createDynamicsCompressor() {
    const param = () => ({ value: 0 });
    const node = fakeNode({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
    this.compressors.push(node);
    return node;
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}
