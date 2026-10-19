import {
  ALL_FORMATS,
  CanvasSink,
  EncodedPacketSink,
  Input,
  VideoSampleSink,
  type InputVideoTrack,
  type VideoSample,
  type WrappedCanvas,
} from 'mediabunny';
import { isDesktop } from '../platform/desktop';
import type { FrameSource, FrameSourceFactory, PoolFrame } from './decodePool';
import { mediaInput, mediaName, type MediaFile } from './mediaFile';

/*
 * The decoder pool's frames from Mediabunny (204 §2). One `Input` per file, shared by every lane on it and disposed
 * with the last; each reader (`from`) is one Mediabunny iterator, so one `VideoDecoder` until its `return()` (T001).
 * The preview gets `VideoFrame`s at full size; export lanes (`maxWidth`, D5) get canvases resized as the export always
 * decoded them. Every frame goes through one registry, so `openFrames()` tells any self-test what is still open.
 * Speed (207 §3): a source tells where its key frames are (Mediabunny's key packets), and a reversed lane's canvases
 * are its own (a chunk holds more frames than a ring would keep), freed when the pool closes them.
 */

/** What is open right now across every pool, as `openFrames` returns it. */
export interface OpenCounts {
  decoders: number;
  frames: number;
  /** The open frames' bytes: width × height × 4 (D2). */
  bytes: number;
  /** Every frame ever decoded (a self-test tells from it that frames went through the pool). */
  made: number;
}

const open: OpenCounts = { decoders: 0, frames: 0, bytes: 0, made: 0 };

/**
 * Frames, their bytes and decoders open right now, across every pool.
 * @returns a copy of the counts
 */
export const openFrames = (): OpenCounts => ({ ...open });

/**
 * Counts a decoded frame as open until it is closed (once).
 * @param frame the frame without its `close`
 * @param release frees the frame's memory when it is closed
 * @returns the frame with a `close` that counts it closed and releases it
 */
function trackFrame(frame: Omit<PoolFrame, 'close'>, release: () => void): PoolFrame {
  const bytes = frame.width * frame.height * 4;
  let closed = false;
  open.frames++;
  open.made++;
  open.bytes += bytes;
  return {
    ...frame,
    close() {
      if (closed) return;
      closed = true;
      open.frames--;
      open.bytes -= bytes;
      release();
    },
  };
}

const nameOf = (file: MediaFile) => mediaName(file, 'A clip');

/** Files refused as if their codec couldn't be decoded (self-tests only). */
const undecodable = new WeakSet<MediaFile>();

/**
 * Self-tests only (204 T040, poolChecks.ts): refuses a file here as if its codec couldn't be decoded, so a check can
 * give the preview and the export a clip the pool can't decode. Never called in the app.
 * @param file the file
 */
export function refuseDecodingForTests(file: MediaFile): void {
  undecodable.add(file);
}

/**
 * Self-tests only: decodes a file refused by `refuseDecodingForTests` again.
 * @param file the file
 */
export function allowDecodingForTests(file: MediaFile): void {
  undecodable.delete(file);
}

/** One file's input, shared by every lane reading it. */
interface SharedInput {
  input: Input;
  track: Promise<InputVideoTrack>;
  /** The lanes using it; the input is disposed with the last. */
  refs: number;
}
const inputs = new Map<MediaFile, SharedInput>();

/**
 * The file's video track, opened once per file and refused (naming the file) when it has none or can't be decoded.
 * @param file the video file
 * @returns its shared input, with one more user counted
 */
function share(file: MediaFile): SharedInput {
  let shared = inputs.get(file);
  if (!shared) {
    const input = new Input({ source: mediaInput(file), formats: ALL_FORMATS });
    const track = (async () => {
      const videoTrack = await input.getPrimaryVideoTrack().catch(() => {
        throw new Error(`${nameOf(file)} couldn’t be read. It may be damaged, or not a video file.`);
      });
      if (!videoTrack) throw new Error(`${nameOf(file)} has no video track.`);
      if (undecodable.has(file) || !(await videoTrack.canDecode()))
        throw new Error(
          `${nameOf(file)} uses a video format this ${isDesktop ? 'computer' : 'browser'} can’t decode (often HEVC from an iPhone).`,
        );
      return videoTrack;
    })();
    track.catch(() => undefined);
    shared = { input, track, refs: 0 };
    inputs.set(file, shared);
  }
  shared.refs++;
  return shared;
}

/**
 * One user of a file's input is done; the last one disposes it.
 * @param file the video file
 * @param shared its shared input
 */
function unshare(file: MediaFile, shared: SharedInput): void {
  shared.refs--;
  if (shared.refs > 0) return;
  if (inputs.get(file) === shared) inputs.delete(file);
  shared.input.dispose();
}

/**
 * A frame the pool can keep from a decoded sample (the sample is closed).
 * @param sample the decoded sample
 * @returns a `VideoFrame` of its own, or a canvas when the file asks for a rotation or flip that a bare `VideoFrame`
 *   wouldn't show
 */
function fromSample(sample: VideoSample): PoolFrame {
  const width = sample.displayWidth;
  const height = sample.displayHeight;
  try {
    if (!sample.rotation && !sample.flip) {
      const videoFrame = sample.toVideoFrame();
      return trackFrame({ image: videoFrame, width, height, time: sample.timestamp, duration: sample.duration }, () =>
        videoFrame.close(),
      );
    }
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas isn’t available to turn the video frame.');
    sample.draw(context, 0, 0);
    return trackFrame({ image: canvas, width, height, time: sample.timestamp, duration: sample.duration }, () => {
      canvas.width = 0;
      canvas.height = 0;
    });
  } finally {
    sample.close();
  }
}

/**
 * A frame the pool can keep from an export lane's resized canvas (the sink's ring owns it, so closing frees nothing).
 * @param wrapped the canvas and its timing
 * @returns the frame
 */
function fromCanvas(wrapped: WrappedCanvas): PoolFrame {
  const { canvas } = wrapped;
  return trackFrame(
    { image: canvas, width: canvas.width, height: canvas.height, time: wrapped.timestamp, duration: wrapped.duration },
    () => undefined,
  );
}

/**
 * A frame the pool can keep from a canvas of its own (a reversed lane's: no ring), freed when it is closed.
 * @param wrapped the canvas and its timing
 * @returns the frame
 */
function fromOwnCanvas(wrapped: WrappedCanvas): PoolFrame {
  const { canvas } = wrapped;
  return trackFrame(
    { image: canvas, width: canvas.width, height: canvas.height, time: wrapped.timestamp, duration: wrapped.duration },
    () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  );
}

/**
 * Where a track's key frames are, from its key packets (no packet data read).
 * @param track the video track
 * @returns `keyBefore` and `keyAfter` as `FrameSource` has them
 */
function keyFrames(track: InputVideoTrack): Pick<FrameSource, 'keyBefore' | 'keyAfter'> {
  const packets = new EncodedPacketSink(track);
  const options = { metadataOnly: true } as const;
  const keyAt = async (time: number) =>
    (await packets.getKeyPacket(time, options)) ?? (await packets.getFirstPacket(options));
  return {
    keyBefore: async (time) => (await keyAt(time))?.timestamp ?? 0,
    async keyAfter(time) {
      const key = await keyAt(time);
      if (!key) return null;
      // Before the first frame, the first key frame is the next one.
      if (key.timestamp > time) return key.timestamp;
      return (await packets.getNextKeyPacket(key, options))?.timestamp ?? null;
    },
  };
}

/**
 * Wraps one Mediabunny iterator as a reader: counted as a decoder until it ends or is stopped.
 * @param frames the iterator
 * @param toFrame turns what it yields into a pool frame
 * @param file the video file, named in a decoding error
 * @returns the reader
 */
function reader<T>(
  frames: AsyncGenerator<T, void, unknown>,
  toFrame: (value: T) => PoolFrame,
  file: MediaFile,
): AsyncIterator<PoolFrame> {
  open.decoders++;
  let live = true;
  const stop = () => {
    if (live) {
      live = false;
      open.decoders--;
    }
  };
  return {
    async next() {
      try {
        const result = await frames.next();
        if (result.done) {
          stop();
          return { done: true, value: undefined };
        }
        return { done: false, value: toFrame(result.value) };
      } catch (error) {
        stop();
        throw new Error(
          `${nameOf(file)} couldn’t be decoded: ${error instanceof Error ? error.message : String(error)}`,
          {
            cause: error,
          },
        );
      }
    },
    async return() {
      try {
        await frames.return(undefined);
      } finally {
        stop();
      }
      return { done: true, value: undefined };
    },
  };
}

/**
 * The decoder pool's frame source from Mediabunny.
 * @param file the video file
 * @param options `maxWidth` for an export lane (resized canvases), none for the preview (full-size `VideoFrame`s)
 * @returns the source; it refuses (naming the file) a file it can't read or decode
 */
export const mediabunnySource: FrameSourceFactory = async (file, options) => {
  const shared = share(file);
  let track: InputVideoTrack;
  try {
    track = await shared.track;
  } catch (error) {
    unshare(file, shared);
    throw error;
  }
  let closed = false;
  let readFrom: (time: number, end?: number) => AsyncIterator<PoolFrame>;
  if (options.maxWidth) {
    // Export lanes: resized canvases from a ring larger than the frames a lane holds (the last + 4 ahead + 1 decoding);
    // a reversed lane holds a chunk, so its canvases are new ones (poolSize 0), freed as the pool closes them.
    const width = Math.min(await track.getDisplayWidth(), Math.round(options.maxWidth));
    const canvases = new CanvasSink(track, { width, poolSize: options.reverse ? 0 : 8 });
    const toFrame = options.reverse ? fromOwnCanvas : fromCanvas;
    readFrom = (time, end) => reader(canvases.canvases(Math.max(0, time), end), toFrame, file);
  } else {
    const samples = new VideoSampleSink(track);
    readFrom = (time, end) => reader(samples.samples(Math.max(0, time), end), fromSample, file);
  }
  const source: FrameSource = {
    from(time, end) {
      if (closed) throw new Error('The video was closed.');
      return readFrom(time, end);
    },
    ...keyFrames(track),
    close() {
      if (closed) return;
      closed = true;
      unshare(file, shared);
    },
  };
  return source;
};
