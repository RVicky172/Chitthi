// A fake decoder for the decoder pool's tests (tests/integration/engine/decodePool.test.ts and any later ones): files of
// flat frames at 30 fps, with delays and failures, counting what is open as frameSource.ts's registry does for the real
// one. Moved out of the pool's test file (407 T012) so other tests can use it instead of copying it.
import type { FrameSource, FrameSourceFactory, PoolFrame } from '@/engine/decodePool';

/** Frames per second of every fake file. */
export const FAKE_FPS = 30;
/** Every fake frame is 1920 × 1080; its size in bytes (RGBA), as the pool counts it. */
const FRAME_WIDTH = 1920,
  FRAME_HEIGHT = 1080;
export const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 4;

/** A fake video file: its length and how it fails. */
export interface FakeFile {
  name: string;
  /** Seconds of video. */
  dur: number;
  /** Opening fails with this message. */
  failOpen?: string;
  /** Decoding a frame at or after this source time fails. */
  failAt?: number;
  /** The first `reclaims` decodes at or after `reclaimAt` fail as Chrome does when it takes back an idle decoder. */
  reclaimAt?: number;
  reclaims?: number;
}

/** A frame the fake hands out: which file it came from, and whether it was closed. */
export interface FakeFrame extends PoolFrame {
  file: string;
  closed: boolean;
}

/** Where a reader of a fake file is: its next frame, whether it stopped, and whether its file was closed. */
interface ReaderState {
  index: number;
  done: boolean;
  /** Frames in the file. */
  count: number;
  isClosed: () => boolean;
}

/**
 * The end of a reader's frames.
 * @returns a new end result
 */
const end = (): IteratorResult<PoolFrame> => ({ done: true, value: undefined });

/**
 * Runs `work` after a delay, as a timer would, and settles with what it returns or throws.
 * @param ms the delay
 * @param work what to run
 * @returns a promise of its result
 */
const afterDelay = <T>(ms: number, work: () => T): Promise<T> =>
  new Promise<T>((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(work());
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, ms),
  );

/**
 * A fake `FrameSourceFactory` that counts what is open, as `frameSource.ts`'s registry will for the real one.
 * @param opts how long opening a file and decoding a frame take, in ms
 * @returns the factory, a maker of fake files and counters of what is open
 */
export function fakeDecoder(opts: { openMs?: number; frameMs?: number } = {}) {
  const openMs = opts.openMs ?? 5,
    frameMs = opts.frameMs ?? 2;
  const files = new Map<Blob, FakeFile>();
  const live = new Set<FakeFrame>();
  const counts = { sources: 0, readers: 0, doubleClose: 0 };

  const file = (fakeFile: FakeFile): Blob => {
    const blob = new Blob([fakeFile.name]);
    files.set(blob, fakeFile);
    return blob;
  };

  /**
   * A frame of a fake file, counted as live until it is closed (closing it twice is counted too).
   * @param fakeFile the file
   * @param time its source time
   * @returns the frame
   */
  const makeFrame = (fakeFile: FakeFile, time: number): FakeFrame => {
    const frame: FakeFrame = {
      file: fakeFile.name,
      image: {} as CanvasImageSource,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      time,
      duration: 1 / FAKE_FPS,
      closed: false,
      close() {
        if (frame.closed) counts.doubleClose++;
        frame.closed = true;
        live.delete(frame);
      },
    };
    live.add(frame);
    return frame;
  };

  /**
   * One decode: the reader's next frame, the end, or the failure the file is set up with at that time.
   * @param fakeFile the file
   * @param state the reader
   * @returns the next frame or the end; throws as the file fails
   */
  const step = (fakeFile: FakeFile, state: ReaderState): IteratorResult<PoolFrame> => {
    if (state.done || state.isClosed() || state.index >= state.count) {
      state.done = true;
      return end();
    }
    const time = state.index / FAKE_FPS;
    if (fakeFile.reclaimAt !== undefined && time >= fakeFile.reclaimAt - 1e-9 && (fakeFile.reclaims ?? 1) > 0) {
      fakeFile.reclaims = (fakeFile.reclaims ?? 1) - 1;
      throw new DOMException('Codec reclaimed due to inactivity.', 'QuotaExceededError');
    }
    if (fakeFile.failAt !== undefined && time >= fakeFile.failAt - 1e-9)
      throw new Error(`Can't decode ${fakeFile.name} at ${time.toFixed(2)} s`);
    state.index++;
    return { done: false, value: makeFrame(fakeFile, time) };
  };

  /**
   * A reader of a fake file from a source time: one frame every `frameMs`.
   * @param fakeFile the file
   * @param startTime where it starts reading, in source seconds
   * @param isClosed whether the file was closed
   * @returns the reader
   */
  const reader = (fakeFile: FakeFile, startTime: number, isClosed: () => boolean): AsyncIterator<PoolFrame> => {
    counts.readers++;
    const count = Math.round(fakeFile.dur * FAKE_FPS);
    const state: ReaderState = {
      index: Math.min(count - 1, Math.max(0, Math.floor(startTime * FAKE_FPS + 1e-6))),
      done: false,
      count,
      isClosed,
    };
    return {
      next: () => afterDelay(frameMs, () => step(fakeFile, state)),
      return: () => {
        state.done = true;
        return Promise.resolve(end());
      },
    };
  };

  const open: FrameSourceFactory = (blob) => {
    const fakeFile = files.get(blob);
    if (!fakeFile) return Promise.reject(new Error('unknown file'));
    counts.sources++;
    return afterDelay(openMs, (): FrameSource => {
      if (fakeFile.failOpen) {
        counts.sources--;
        throw new Error(fakeFile.failOpen);
      }
      let closed = false;
      return {
        from: (startTime: number) => reader(fakeFile, startTime, () => closed),
        close() {
          if (!closed) counts.sources--;
          closed = true;
        },
      };
    });
  };

  return {
    open,
    file,
    counts,
    frames: () => live.size,
    bytes: () => [...live].reduce((sum, frame) => sum + frame.width * frame.height * 4, 0),
  };
}
