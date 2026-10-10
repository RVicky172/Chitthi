import {
  ALL_FORMATS,
  BlobSource,
  CanvasSink,
  Input,
  VideoSampleSink,
  type InputVideoTrack,
  type VideoSample,
} from 'mediabunny';
import type { FrameSource, FrameSourceFactory, PoolFrame } from './decodePool';

/*
 * The decoder pool's frames from Mediabunny (204 §2). One `Input` per file, shared by every lane on it and disposed
 * with the last; each reader (`from`) is one Mediabunny iterator, so one `VideoDecoder` until its `return()` (T001).
 * The preview gets `VideoFrame`s at full size; export lanes (`maxWidth`, D5) get canvases resized as the export always
 * decoded them. Every frame goes through one registry, so `openFrames()` tells any self-test what is still open.
 */

const open = { decoders: 0, frames: 0, bytes: 0, made: 0 };

/** Frames, their bytes (width × height × 4, D2) and decoders open right now, across every pool; `made` counts every
 * frame ever decoded (a self-test tells from it that frames went through the pool). */
export const openFrames = () => ({ ...open });

function trackFrame(f: Omit<PoolFrame, 'close'>, release: () => void): PoolFrame {
  const bytes = f.width * f.height * 4;
  let closed = false;
  open.frames++;
  open.made++;
  open.bytes += bytes;
  return {
    ...f,
    close() {
      if (closed) return;
      closed = true;
      open.frames--;
      open.bytes -= bytes;
      release();
    },
  };
}

const nameOf = (b: Blob) => (b instanceof File ? b.name : 'A clip');

interface Shared {
  input: Input;
  track: Promise<InputVideoTrack>;
  refs: number;
}
const inputs = new Map<Blob, Shared>();

/** The file's video track, opened once per file; refused (naming the file) when it has none or can't be decoded. */
function share(file: Blob): Shared {
  let s = inputs.get(file);
  if (!s) {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const track = (async () => {
      const t = await input.getPrimaryVideoTrack().catch(() => {
        throw new Error(`${nameOf(file)} couldn’t be read. It may be damaged, or not a video file.`);
      });
      if (!t) throw new Error(`${nameOf(file)} has no video track.`);
      if (!(await t.canDecode()))
        throw new Error(
          `${nameOf(file)} uses a video format this ${'chitthiDesktop' in window ? 'computer' : 'browser'} can’t decode (often HEVC from an iPhone).`,
        );
      return t;
    })();
    track.catch(() => undefined);
    s = { input, track, refs: 0 };
    inputs.set(file, s);
  }
  s.refs++;
  return s;
}

function unshare(file: Blob, s: Shared): void {
  if (--s.refs > 0) return;
  if (inputs.get(file) === s) inputs.delete(file);
  s.input.dispose();
}

/** A frame the pool can keep: a `VideoFrame` of its own (the sample is closed), or a canvas when the file asks for a
 * rotation or flip that a bare `VideoFrame` wouldn't show. */
function fromSample(s: VideoSample): PoolFrame {
  const width = s.displayWidth,
    height = s.displayHeight;
  try {
    if (!s.rotation && !s.flip) {
      const vf = s.toVideoFrame();
      return trackFrame({ image: vf, width, height, time: s.timestamp, duration: s.duration }, () => vf.close());
    }
    const c = new OffscreenCanvas(width, height);
    s.draw(c.getContext('2d')!, 0, 0);
    return trackFrame({ image: c, width, height, time: s.timestamp, duration: s.duration }, () => {
      c.width = c.height = 0;
    });
  } finally {
    s.close();
  }
}

/** Wraps one Mediabunny iterator as a reader: counted as a decoder until it ends or is stopped. A decoding error
 * names the file. */
function reader<T>(
  gen: AsyncGenerator<T, void, unknown>,
  wrap: (v: T) => PoolFrame,
  file: Blob,
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
        const r = await gen.next();
        if (r.done) {
          stop();
          return { done: true, value: undefined };
        }
        return { done: false, value: wrap(r.value) };
      } catch (e) {
        stop();
        throw new Error(`${nameOf(file)} couldn’t be decoded: ${e instanceof Error ? e.message : String(e)}`, {
          cause: e,
        });
      }
    },
    async return() {
      try {
        await gen.return(undefined);
      } finally {
        stop();
      }
      return { done: true, value: undefined };
    },
  };
}

export const mediabunnySource: FrameSourceFactory = async (file, opts) => {
  const s = share(file);
  let track: InputVideoTrack;
  try {
    track = await s.track;
  } catch (e) {
    unshare(file, s);
    throw e;
  }
  let closed = false;
  // Export lanes: resized canvases from a ring larger than the frames a lane holds (the last + 4 ahead + 1 decoding).
  const canvases = opts.maxWidth
    ? new CanvasSink(track, { width: Math.min(track.displayWidth, Math.round(opts.maxWidth)), poolSize: 8 })
    : null;
  const samples = canvases ? null : new VideoSampleSink(track);
  const source: FrameSource = {
    from(t) {
      if (closed) throw new Error('The video was closed.');
      if (canvases)
        return reader(
          canvases.canvases(Math.max(0, t)),
          (wc) =>
            trackFrame(
              {
                image: wc.canvas,
                width: wc.canvas.width,
                height: wc.canvas.height,
                time: wc.timestamp,
                duration: wc.duration,
              },
              () => undefined,
            ),
          file,
        );
      return reader(samples!.samples(Math.max(0, t)), fromSample, file);
    },
    close() {
      if (closed) return;
      closed = true;
      unshare(file, s);
    },
  };
  return source;
};
