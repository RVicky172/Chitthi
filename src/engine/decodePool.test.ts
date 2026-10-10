import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DecodePool,
  frameTime,
  lanePlan,
  poolLimits,
  type FrameSource,
  type FrameSourceFactory,
  type PoolClip,
  type PoolFrame,
  type PoolLimits,
} from './decodePool';
import { MAIN_VIDEO, MUSIC, defaultTracks, type Project, type TimedClip } from './timeline';
import { DEFAULT_EDIT } from './instagram';

/* ---------- A fake decoder: files of flat frames at 30 fps, with delays and failures ---------- */

const FPS = 30;
const W = 1920,
  H = 1080,
  FRAME_BYTES = W * H * 4;

interface FakeFile {
  name: string;
  /** Seconds of video. */
  dur: number;
  /** Opening fails with this message. */
  failOpen?: string;
  /** Decoding a frame at or after this source time fails. */
  failAt?: number;
}

interface FakeFrame extends PoolFrame {
  file: string;
  closed: boolean;
}

/** A fake `FrameSourceFactory` that counts what is open, as `frameSource.ts`'s registry will for the real one. */
function fakeDecoder(opts: { openMs?: number; frameMs?: number } = {}) {
  const openMs = opts.openMs ?? 5,
    frameMs = opts.frameMs ?? 2;
  const files = new Map<Blob, FakeFile>();
  const live = new Set<FakeFrame>();
  const counts = { sources: 0, readers: 0, doubleClose: 0 };

  const file = (f: FakeFile): Blob => {
    const b = new Blob([f.name]);
    files.set(b, f);
    return b;
  };

  const open: FrameSourceFactory = (blob) => {
    const f = files.get(blob);
    if (!f) return Promise.reject(new Error('unknown file'));
    counts.sources++;
    return new Promise<FrameSource>((resolve, reject) =>
      setTimeout(() => {
        if (f.failOpen) {
          counts.sources--;
          reject(new Error(f.failOpen));
          return;
        }
        const n = Math.round(f.dur * FPS);
        let closed = false;
        resolve({
          from(t: number): AsyncIterator<PoolFrame> {
            counts.readers++;
            let i = Math.min(n - 1, Math.max(0, Math.floor(t * FPS + 1e-6))),
              done = false;
            return {
              next: () =>
                new Promise((ok, fail) =>
                  setTimeout(() => {
                    if (done || closed || i >= n) {
                      done = true;
                      ok({ done: true, value: undefined });
                      return;
                    }
                    const time = i / FPS;
                    if (f.failAt !== undefined && time >= f.failAt - 1e-9) {
                      fail(new Error(`Can't decode ${f.name} at ${time.toFixed(2)} s`));
                      return;
                    }
                    i++;
                    const fr: FakeFrame = {
                      file: f.name,
                      image: {} as CanvasImageSource,
                      width: W,
                      height: H,
                      time,
                      duration: 1 / FPS,
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
    bytes: () => [...live].reduce((a, fr) => a + fr.width * fr.height * 4, 0),
  };
}

const clip = (id: string, file: Blob, inT: number, outT: number, start = 0): PoolClip => ({
  id,
  file,
  in: inT,
  out: outT,
  start,
  track: MAIN_VIDEO,
});

/** Lets every pending open and decode finish. */
const settle = () => vi.advanceTimersByTimeAsync(1000);
const at = (i: number) => i / FPS;
const LIMITS: PoolLimits = { decoders: 4, ahead: 4, bytes: 64 * FRAME_BYTES };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/* ---------- The pure parts ---------- */

describe('frameTime (D3: the export grid)', () => {
  it('puts a time on the frame the export encodes for it', () => {
    expect(frameTime(0, 30)).toBe(0);
    expect(frameTime(0.0999, 30)).toBeCloseTo(2 / 30, 12);
    expect(frameTime(0.1, 30)).toBeCloseTo(3 / 30, 12);
    expect(frameTime(1.01, 60)).toBeCloseTo(60 / 60, 12);
  });

  it("is exact for every frame of the export's plan (frame i at i / fps)", () => {
    for (const fps of [30, 60])
      for (let i = 0; i < 20000; i++) expect(Math.round(frameTime(i / fps, fps) * fps)).toBe(i);
  });
});

describe('poolLimits (Q3)', () => {
  it('opens the visible-video limit + 2 decoders, 4 frames ahead, 256 MB on the web and 1 GB on the desktop', () => {
    expect(poolLimits(3, false)).toEqual({ decoders: 5, ahead: 4, bytes: 256 * 2 ** 20 });
    expect(poolLimits(6, true)).toEqual({ decoders: 8, ahead: 4, bytes: 2 ** 30 });
    expect(poolLimits(1, false).decoders).toBe(3);
  });
});

describe('lanePlan (Q10)', () => {
  type C = TimedClip & { name: string };
  const v = (name: string, track: string, start: number, len: number): C => ({
    name,
    id: name,
    track,
    start,
    kind: 'video',
    in: 1,
    out: 1 + len,
    dur: 0,
  });
  const photo = (name: string, start: number, len: number): C => ({
    name,
    id: name,
    track: MAIN_VIDEO,
    start,
    kind: 'photo',
    in: 0,
    out: 0,
    dur: len,
  });
  // V1: a 0–4, photo 4–7, c 7–10, gap 10–11, d 11–13. V2 (overlay): ov 2–6.
  const a = v('a', MAIN_VIDEO, 0, 4),
    p = photo('p', 4, 3),
    c = v('c', MAIN_VIDEO, 7, 3),
    d = v('d', MAIN_VIDEO, 11, 2),
    ov = v('ov', 'V2', 2, 4);
  const project = (v2Hidden = false): Project<C> => ({
    tracks: [
      ...defaultTracks().filter((t) => t.id === MAIN_VIDEO),
      { id: 'V2', kind: 'overlay', name: 'Overlay', hidden: v2Hidden, muted: false, locked: false },
      ...defaultTracks().filter((t) => t.id === MUSIC),
    ],
    clips: [a, p, c, d, ov],
    audio: [],
    layers: [],
    fadeOut: false,
  });
  const names = (r: { visible: C[]; next: C[] }) => ({
    visible: r.visible.map((x) => x.name),
    next: r.next.map((x) => x.name),
  });

  it('lists the video clips visible at t on every picture track, bottom track first', () => {
    expect(names(lanePlan(project(), 3, 2))).toEqual({ visible: ['a', 'ov'], next: [] });
  });

  it("adds each track's next video clip starting less than `ahead` seconds away", () => {
    expect(names(lanePlan(project(), 1, 2))).toEqual({ visible: ['a'], next: ['ov'] });
    expect(names(lanePlan(project(), 1, 0.5))).toEqual({ visible: ['a'], next: [] });
    expect(names(lanePlan(project(), 5.5, 2))).toEqual({ visible: ['ov'], next: ['c'] });
    expect(names(lanePlan(project(), 5, 2))).toEqual({ visible: ['ov'], next: [] });
  });

  it('needs no lane for photos', () => {
    expect(names(lanePlan(project(), 6.5, 0.2))).toEqual({ visible: [], next: [] });
  });

  it('sees past a gap to the clip after it', () => {
    expect(names(lanePlan(project(), 10.5, 2))).toEqual({ visible: [], next: ['d'] });
  });

  it('leaves out a hidden track, both visible and next clips', () => {
    expect(names(lanePlan(project(true), 3, 2))).toEqual({ visible: ['a'], next: [] });
    expect(names(lanePlan(project(true), 1, 2))).toEqual({ visible: ['a'], next: [] });
  });

  it('shows the main track\'s last clip at the end of the video, as videoAt does', () => {
    expect(names(lanePlan(project(), 13, 2))).toEqual({ visible: ['d'], next: [] });
  });

  it('works on clips with any extra fields (generic over the clip type)', () => {
    const r = lanePlan({ ...project(), clips: [{ ...a, edit: DEFAULT_EDIT }] }, 1, 2);
    expect(r.visible[0].edit).toBe(DEFAULT_EDIT);
  });
});

/* ---------- The pool on a fake decoder ---------- */

describe('DecodePool.frame: exact frames', () => {
  it('returns the frame showing at a source time, reading forward in order on one reader', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 1, 9);
    for (let i = 30; i < 90; i++) {
      const p = pool.frame(c, at(i) + 0.001);
      await settle();
      const f = await p;
      expect(f?.time).toBeCloseTo(at(i), 9);
    }
    expect(fake.counts.readers).toBe(1);
    // Only the frame handed out is held; frames read past are closed.
    expect(fake.frames()).toBe(1);
    pool.dispose();
  });

  it('keeps reading forward for a jump under 2 s, restarts for a jump back or of 2 s or more', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    const get = async (t: number) => {
      const p = pool.frame(c, t);
      await settle();
      return p;
    };
    expect((await get(1))?.time).toBeCloseTo(1, 9);
    expect((await get(2.5))?.time).toBeCloseTo(2.5, 9);
    expect(fake.counts.readers).toBe(1);
    expect((await get(2))?.time).toBeCloseTo(2, 9);
    expect(fake.counts.readers).toBe(2);
    expect((await get(4.5))?.time).toBeCloseTo(4.5, 9);
    expect(fake.counts.readers).toBe(3);
    pool.dispose();
  });

  it('hands out the same frame for the same time, still open', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    const p1 = pool.frame(c, 1);
    await settle();
    const f1 = (await p1) as FakeFrame;
    const p2 = pool.frame(c, 1 + 0.01);
    await settle();
    const f2 = (await p2) as FakeFrame;
    expect(f2).toBe(f1);
    expect(f1.closed).toBe(false);
    pool.dispose();
  });

  it('closes the previous frame when a newer one replaces it', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    const p1 = pool.frame(c, 1);
    await settle();
    const f1 = (await p1) as FakeFrame;
    const p2 = pool.frame(c, 1.5);
    await settle();
    await p2;
    expect(f1.closed).toBe(true);
    expect(fake.frames()).toBe(1);
    pool.dispose();
  });

  it('holds the last frame past the end of the source (a source shorter than its trim)', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'short.mp4', dur: 2 }), 0, 3);
    const p = pool.frame(c, 2.6);
    await settle();
    expect((await p)?.time).toBeCloseTo(at(59), 9);
    pool.dispose();
  });

  it('gives two clips of the same file their own lanes at their own source times (AC-1)', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const f = fake.file({ name: 'one.mp4', dur: 10 });
    const a = clip('a', f, 0, 5),
      b = clip('b', f, 5, 10);
    const pa = pool.frame(a, 1),
      pb = pool.frame(b, 6);
    await settle();
    expect((await pa)?.time).toBeCloseTo(1, 9);
    expect((await pb)?.time).toBeCloseTo(6, 9);
    expect(pool.stats().decoders).toBe(2);
    pool.dispose();
  });
});

describe('DecodePool.frame: latest wins (AC-7)', () => {
  it('resolves a superseded request to null and closes its frame; the newest is the one returned', async () => {
    const fake = fakeDecoder({ frameMs: 10 });
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    const first = pool.frame(c, 1);
    await vi.advanceTimersByTimeAsync(8); // its open done, its decode under way
    const second = pool.frame(c, 5);
    const third = pool.frame(c, 3);
    await settle();
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    const f = (await third) as FakeFrame;
    expect(f.time).toBeCloseTo(3, 9);
    expect(f.closed).toBe(false);
    expect(fake.frames()).toBe(1);
    pool.dispose();
  });
});

describe('DecodePool.peek: never waits, holds the last frame (AC-6)', () => {
  it('returns null before a first frame, then the frame once decoded', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    expect(pool.peek(c, 0)).toBeNull();
    await settle();
    expect(pool.peek(c, 0)?.time).toBe(0);
    pool.dispose();
  });

  it('after prepare, the first frame is ready without a hold', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 1, 4);
    pool.prepare(c);
    await settle();
    expect(pool.peek(c, 1)?.time).toBeCloseTo(1, 9);
    expect(pool.stats().holds).toBe(0);
    pool.dispose();
  });

  it('holds the last frame while the next is decoding, counts the hold, then catches up', async () => {
    const fake = fakeDecoder({ frameMs: 20 });
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    pool.prepare(c);
    await settle();
    const first = pool.peek(c, 0) as FakeFrame;
    expect(first.time).toBe(0);
    const held = pool.peek(c, 0.2);
    expect(held).toBe(first);
    expect(first.closed).toBe(false);
    expect(pool.stats().holds).toBe(1);
    await settle();
    expect(pool.peek(c, 0.2)?.time).toBeCloseTo(0.2, 9);
    expect(first.closed).toBe(true);
    // Playing on, the frames decoded ahead cover the next steps: no hold.
    expect(pool.peek(c, 0.2 + at(1))?.time).toBeCloseTo(0.2 + at(1), 9);
    expect(pool.peek(c, 0.2 + at(2))?.time).toBeCloseTo(0.2 + at(2), 9);
    expect(pool.stats().holds).toBe(1);
    pool.dispose();
  });

  it('decodes at most `ahead` frames ahead of the one shown', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    pool.peek(c, 0);
    await settle();
    pool.peek(c, 0);
    await settle();
    expect(fake.frames()).toBe(1 + LIMITS.ahead);
    expect(pool.stats().frames).toBe(1 + LIMITS.ahead);
    pool.dispose();
  });

  it("never returns another clip's frame, even from the same file", async () => {
    const fake = fakeDecoder({ frameMs: 20 });
    const pool = new DecodePool(fake.open, LIMITS);
    const f = fake.file({ name: 'one.mp4', dur: 10 });
    const a = clip('a', f, 0, 5),
      b = clip('b', f, 5, 10);
    pool.prepare(a);
    await settle();
    expect(pool.peek(a, 0)?.time).toBe(0);
    expect(pool.peek(b, 5)).toBeNull();
    expect(pool.stats().holds).toBe(1);
    await settle();
    expect(pool.peek(b, 5)?.time).toBeCloseTo(5, 9);
    pool.dispose();
  });

  it('never returns null for a clip once it has shown a frame, however far the time jumps', async () => {
    const fake = fakeDecoder({ frameMs: 15 });
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    pool.prepare(c);
    await settle();
    for (const t of [3, 0.5, 9, 9.1, 1, 6]) {
      const f = pool.peek(c, t) as FakeFrame | null;
      expect(f).not.toBeNull();
      expect(f?.closed).toBe(false);
      await vi.advanceTimersByTimeAsync(7);
    }
    pool.dispose();
  });
});

describe('DecodePool: bounded whatever is asked (AC-12)', () => {
  it('closes the least recently used lane not wanted first, then the least recently used wanted', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, { ...LIMITS, decoders: 3 });
    const files = ['a', 'b', 'c', 'd'].map((n) => fake.file({ name: `${n}.mp4`, dur: 4 }));
    const [A, B, C, D] = files.map((f, i) => clip('ABCD'[i], f, 0, 4));
    for (const x of [A, B, C]) {
      const p = pool.frame(x, 1);
      await settle();
      await p;
    }
    pool.want(['A', 'C', 'D']);
    const pd = pool.frame(D, 1);
    await settle();
    await pd;
    expect(fake.counts.sources).toBe(3);
    expect(pool.stats().decoders).toBe(3);
    // B (not wanted) went, though A was used before it.
    const pb = pool.frame(B, 1);
    pool.want(['A', 'B', 'C', 'D']);
    await settle();
    await pb;
    expect(fake.counts.sources).toBe(3);
    // Every lane wanted: the least recently used (A) went.
    expect(pool.peek(C, 1)).not.toBeNull();
    expect(pool.peek(D, 1)).not.toBeNull();
    expect(pool.peek(B, 1)).not.toBeNull();
    expect(pool.peek(A, 1)).toBeNull();
    pool.dispose();
  });

  it('stays under the byte budget by decoding less ahead', async () => {
    const fake = fakeDecoder();
    const limits = { decoders: 4, ahead: 4, bytes: 6 * FRAME_BYTES };
    const pool = new DecodePool(fake.open, limits);
    const cs = ['a', 'b', 'c'].map((n, i) => clip(n, fake.file({ name: `${n}.mp4`, dur: 4 }), 0, 4, i));
    for (let step = 0; step < 10; step++) {
      for (const c of cs) pool.peek(c, at(step));
      await settle();
      expect(fake.bytes()).toBeLessThanOrEqual(limits.bytes);
    }
    for (const c of cs) expect(pool.peek(c, at(10))).not.toBeNull();
    pool.dispose();
  });

  it('never goes over its decoders, frames or bytes under random asks, and its stats are true', async () => {
    const rnd = mulberry32(204);
    const fake = fakeDecoder({ openMs: 3, frameMs: 2 });
    const limits: PoolLimits = { decoders: 4, ahead: 4, bytes: 12 * FRAME_BYTES };
    const pool = new DecodePool(fake.open, limits);
    const files = [0, 1, 2].map((i) => fake.file({ name: `f${i}.mp4`, dur: 8 }));
    const clips = Array.from({ length: 10 }, (_, i) => clip(`c${i}`, files[i % 3], (i % 4) * 1, (i % 4) + 4, i));
    const pick = () => clips[Math.floor(rnd() * clips.length)];
    const time = (c: PoolClip) => c.in + rnd() * (c.out - c.in);
    const check = () => {
      expect(fake.counts.sources).toBeLessThanOrEqual(limits.decoders);
      expect(fake.frames()).toBeLessThanOrEqual(limits.decoders * (limits.ahead + 1));
      expect(fake.bytes()).toBeLessThanOrEqual(limits.bytes);
      const s = pool.stats();
      expect(s.decoders).toBe(fake.counts.sources);
      expect(s.frames).toBe(fake.frames());
      expect(s.bytes).toBe(fake.bytes());
      expect(fake.counts.doubleClose).toBe(0);
    };
    const pending: Promise<PoolFrame | null>[] = [];
    for (let step = 0; step < 400; step++) {
      const r = rnd();
      if (r < 0.35) {
        const f = pool.peek(pick(), 0) as FakeFrame | null;
        if (f) expect(f.closed).toBe(false);
        const c = pick();
        const g = pool.peek(c, time(c)) as FakeFrame | null;
        if (g) expect(g.closed).toBe(false);
      } else if (r < 0.55) {
        const c = pick();
        pending.push(
          pool.frame(c, time(c)).then((f) => {
            if (f) expect((f as FakeFrame).closed).toBe(false);
            return f;
          }),
        );
      } else if (r < 0.7) pool.prepare(pick());
      else if (r < 0.8) pool.want(clips.filter(() => rnd() < 0.3).map((c) => c.id));
      else if (r < 0.85) pool.forget(pick().id);
      else await vi.advanceTimersByTimeAsync(Math.floor(rnd() * 20));
      check();
    }
    await settle();
    check();
    pool.dispose();
    await settle();
    await Promise.all(pending);
    expect(fake.frames()).toBe(0);
    expect(fake.counts.sources).toBe(0);
  });
});

describe('DecodePool: forget and dispose close everything', () => {
  it('forget closes one lane and leaves the others', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const a = clip('a', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4),
      b = clip('b', fake.file({ name: 'b.mp4', dur: 4 }), 0, 4);
    pool.peek(a, 0);
    pool.peek(b, 0);
    await settle();
    const fb = pool.peek(b, 0) as FakeFrame;
    pool.forget('a');
    expect(pool.stats().decoders).toBe(1);
    expect(fake.counts.sources).toBe(1);
    expect(fake.frames()).toBe(pool.stats().frames);
    expect(fb.closed).toBe(false);
    expect(pool.peek(a, 0)).toBeNull();
    pool.dispose();
  });

  it('dispose closes frames and decoders, including ones still opening or decoding', async () => {
    const fake = fakeDecoder({ openMs: 10, frameMs: 10 });
    const pool = new DecodePool(fake.open, LIMITS);
    const a = clip('a', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4),
      b = clip('b', fake.file({ name: 'b.mp4', dur: 4 }), 0, 4),
      c = clip('c', fake.file({ name: 'c.mp4', dur: 4 }), 0, 4);
    pool.peek(a, 0);
    await settle();
    pool.peek(a, 1); // a decoding
    const pb = pool.frame(b, 1); // b decoding after its open
    await vi.advanceTimersByTimeAsync(12);
    const pc = pool.frame(c, 1); // c still opening
    await vi.advanceTimersByTimeAsync(2);
    pool.dispose();
    await settle();
    expect(await pb).toBeNull();
    expect(await pc).toBeNull();
    expect(fake.frames()).toBe(0);
    expect(fake.counts.sources).toBe(0);
    expect(pool.stats()).toMatchObject({ decoders: 0, frames: 0, bytes: 0 });
    // A disposed pool hands out nothing and opens nothing.
    expect(pool.peek(a, 0)).toBeNull();
    expect(await pool.frame(a, 0)).toBeNull();
    expect(fake.counts.sources).toBe(0);
  });
});

describe('DecodePool: a source that fails (AC-14)', () => {
  it('puts a clip that fails to open in fallback with the reason, and leaves the others working', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const bad = clip('bad', fake.file({ name: 'bad.mp4', dur: 4, failOpen: 'No video track in bad.mp4' }), 0, 4),
      good = clip('good', fake.file({ name: 'good.mp4', dur: 4 }), 0, 4);
    const pb = expect(pool.frame(bad, 1)).rejects.toThrow('No video track in bad.mp4');
    const pg = pool.frame(good, 1);
    await settle();
    await pb;
    expect((await pg)?.time).toBeCloseTo(1, 9);
    expect(pool.fallback('bad')).toBe('No video track in bad.mp4');
    expect(pool.fallback('good')).toBeNull();
    expect(pool.peek(bad, 1)).toBeNull();
    expect(pool.stats().decoders).toBe(1);
    // Fallback clips are drawn elsewhere: no hold counted, no retry.
    await settle();
    expect(pool.stats().holds).toBe(0);
    pool.dispose();
  });

  it('puts a clip that fails while decoding in fallback and closes its frames', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const c = clip('c', fake.file({ name: 'broken.mp4', dur: 4, failAt: 1 }), 0, 4);
    const p1 = pool.frame(c, 0.5);
    await settle();
    expect((await p1)?.time).toBeCloseTo(0.5, 9);
    const p2 = expect(pool.frame(c, 1.5)).rejects.toThrow("Can't decode broken.mp4");
    await settle();
    await p2;
    expect(pool.fallback('c')).toMatch(/broken\.mp4/);
    expect(fake.frames()).toBe(0);
    expect(fake.counts.sources).toBe(0);
    pool.dispose();
  });

  it('forget clears a fallback, so a replaced file can be tried again', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const bad = clip('x', fake.file({ name: 'bad.mp4', dur: 4, failOpen: 'unsupported codec' }), 0, 4);
    pool.frame(bad, 0).catch(() => {});
    await settle();
    expect(pool.fallback('x')).toBe('unsupported codec');
    pool.forget('x');
    expect(pool.fallback('x')).toBeNull();
    const p = pool.frame(clip('x', fake.file({ name: 'fixed.mp4', dur: 4 }), 0, 4), 0);
    await settle();
    expect((await p)?.time).toBe(0);
    pool.dispose();
  });
});

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
