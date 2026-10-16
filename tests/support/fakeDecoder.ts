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

/** A fake `FrameSourceFactory` that counts what is open, as `frameSource.ts`'s registry will for the real one. */
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

  const open: FrameSourceFactory = (blob) => {
    const fakeFile = files.get(blob);
    if (!fakeFile) return Promise.reject(new Error('unknown file'));
    counts.sources++;
    return new Promise<FrameSource>((resolve, reject) =>
      setTimeout(() => {
        if (fakeFile.failOpen) {
          counts.sources--;
          reject(new Error(fakeFile.failOpen));
          return;
        }
        const count = Math.round(fakeFile.dur * FAKE_FPS);
        let closed = false;
        resolve({
          from(startTime: number): AsyncIterator<PoolFrame> {
            counts.readers++;
            let index = Math.min(count - 1, Math.max(0, Math.floor(startTime * FAKE_FPS + 1e-6))),
              done = false;
            return {
              next: () =>
                new Promise((ok, fail) =>
                  setTimeout(() => {
                    if (done || closed || index >= count) {
                      done = true;
                      ok({ done: true, value: undefined });
                      return;
                    }
                    const time = index / FAKE_FPS;
                    if (
                      fakeFile.reclaimAt !== undefined &&
                      time >= fakeFile.reclaimAt - 1e-9 &&
                      (fakeFile.reclaims ?? 1) > 0
                    ) {
                      fakeFile.reclaims = (fakeFile.reclaims ?? 1) - 1;
                      fail(new DOMException('Codec reclaimed due to inactivity.', 'QuotaExceededError'));
                      return;
                    }
                    if (fakeFile.failAt !== undefined && time >= fakeFile.failAt - 1e-9) {
                      fail(new Error(`Can't decode ${fakeFile.name} at ${time.toFixed(2)} s`));
                      return;
                    }
                    index++;
                    const fr: FakeFrame = {
                      file: fakeFile.name,
                      image: {} as CanvasImageSource,
                      width: FRAME_WIDTH,
                      height: FRAME_HEIGHT,
                      time,
                      duration: 1 / FAKE_FPS,
                      closed: false,
                      close() {
                        if (fr.closed) counts.doubleClose++;
                        fr.closed = true;
                        live.delete(fr);
                      },
                    };
                    live.add(fr);
                    ok({ done: false, value: fr });
                  }, frameMs),
                ),
              return: () => {
                done = true;
                return Promise.resolve({ done: true, value: undefined });
              },
            };
          },
          close() {
            if (!closed) counts.sources--;
            closed = true;
          },
        });
      }, openMs),
    );
  };

  return {
    open,
    file,
    counts,
    frames: () => live.size,
    bytes: () => [...live].reduce((sum, fr) => sum + fr.width * fr.height * 4, 0),
  };
}
