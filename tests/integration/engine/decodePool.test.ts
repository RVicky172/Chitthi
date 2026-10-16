import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DecodePool,
  frameTime,
  lanePlan,
  poolLimits,
  type PoolClip,
  type PoolFrame,
  type PoolLimits,
} from '@/engine/decodePool';
import { MAIN_VIDEO, MUSIC, defaultTracks } from '@/engine/tracks';
import { type Project, type TimedClip } from '@/engine/timeline';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { FAKE_FPS as FPS, FRAME_BYTES, fakeDecoder, type FakeFrame } from '../../support/fakeDecoder';

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
const at = (index: number) => index / FPS;
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
      for (let index = 0; index < 20000; index++) expect(Math.round(frameTime(index / fps, fps) * fps)).toBe(index);
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
  const videoClip = (name: string, track: string, start: number, len: number): C => ({
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
  const vA = videoClip('a', MAIN_VIDEO, 0, 4),
    photoP = photo('p', 4, 3),
    vC = videoClip('c', MAIN_VIDEO, 7, 3),
    vD = videoClip('d', MAIN_VIDEO, 11, 2),
    ov = videoClip('ov', 'V2', 2, 4);
  const project = (v2Hidden = false): Project<C> => ({
    tracks: [
      ...defaultTracks().filter((defaultTrack) => defaultTrack.id === MAIN_VIDEO),
      { id: 'V2', kind: 'overlay', name: 'Overlay', hidden: v2Hidden, muted: false, locked: false },
      ...defaultTracks().filter((defaultTrack) => defaultTrack.id === MUSIC),
    ],
    clips: [vA, photoP, vC, vD, ov],
    audio: [],
    layers: [],
    fadeOut: false,
  });
  const names = (result: { visible: C[]; next: C[] }) => ({
    visible: result.visible.map((x) => x.name),
    next: result.next.map((x) => x.name),
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

  it("shows the main track's last clip at the end of the video, as videoAt does", () => {
    expect(names(lanePlan(project(), 13, 2))).toEqual({ visible: ['d'], next: [] });
  });

  it('works on clips with any extra fields (generic over the clip type)', () => {
    const plan = lanePlan({ ...project(), clips: [{ ...vA, edit: DEFAULT_EDIT }] }, 1, 2);
    expect(plan.visible[0].edit).toBe(DEFAULT_EDIT);
  });
});

/* ---------- The pool on a fake decoder ---------- */

describe('DecodePool.frame: exact frames', () => {
  it('returns the frame showing at a source time, reading forward in order on one reader', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 1, 9);
    for (let index = 30; index < 90; index++) {
      const pending = pool.frame(clipC, at(index) + 0.001);
      await settle();
      const poolFrame = await pending;
      expect(poolFrame?.time).toBeCloseTo(at(index), 9);
    }
    expect(fake.counts.readers).toBe(1);
    // Only the frame handed out is held; frames read past are closed.
    expect(fake.frames()).toBe(1);
    pool.dispose();
  });

  it('keeps reading forward for a jump under 2 s, restarts for a jump back or of 2 s or more', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    const get = async (time: number) => {
      const pending = pool.frame(clipC, time);
      await settle();
      return pending;
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
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    const p1 = pool.frame(clipC, 1);
    await settle();
    const f1 = (await p1) as FakeFrame;
    const p2 = pool.frame(clipC, 1 + 0.01);
    await settle();
    const f2 = (await p2) as FakeFrame;
    expect(f2).toBe(f1);
    expect(f1.closed).toBe(false);
    pool.dispose();
  });

  it('closes the previous frame when a newer one replaces it', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    const p1 = pool.frame(clipC, 1);
    await settle();
    const f1 = (await p1) as FakeFrame;
    const p2 = pool.frame(clipC, 1.5);
    await settle();
    await p2;
    expect(f1.closed).toBe(true);
    expect(fake.frames()).toBe(1);
    pool.dispose();
  });

  it('holds the last frame past the end of the source (a source shorter than its trim)', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'short.mp4', dur: 2 }), 0, 3);
    const pending = pool.frame(clipC, 2.6);
    await settle();
    expect((await pending)?.time).toBeCloseTo(at(59), 9);
    pool.dispose();
  });

  it('gives two clips of the same file their own lanes at their own source times (AC-1)', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const blob = fake.file({ name: 'one.mp4', dur: 10 });
    const clipA = clip('a', blob, 0, 5),
      clipB = clip('b', blob, 5, 10);
    const pa = pool.frame(clipA, 1),
      pb = pool.frame(clipB, 6);
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
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    const first = pool.frame(clipC, 1);
    await vi.advanceTimersByTimeAsync(8); // its open done, its decode under way
    const second = pool.frame(clipC, 5);
    const third = pool.frame(clipC, 3);
    await settle();
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    const fakeFrame = (await third) as FakeFrame;
    expect(fakeFrame.time).toBeCloseTo(3, 9);
    expect(fakeFrame.closed).toBe(false);
    expect(fake.frames()).toBe(1);
    pool.dispose();
  });
});

describe('DecodePool.peek: never waits, holds the last frame (AC-6)', () => {
  it('returns null before a first frame, then the frame once decoded', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    expect(pool.peek(clipC, 0)).toBeNull();
    await settle();
    expect(pool.peek(clipC, 0)?.time).toBe(0);
    pool.dispose();
  });

  it('after prepare, the first frame is ready without a hold', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 1, 4);
    pool.prepare(clipC);
    await settle();
    expect(pool.peek(clipC, 1)?.time).toBeCloseTo(1, 9);
    expect(pool.stats().holds).toBe(0);
    pool.dispose();
  });

  it('holds the last frame while the next is decoding, counts the hold, then catches up', async () => {
    const fake = fakeDecoder({ frameMs: 20 });
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4);
    pool.prepare(clipC);
    await settle();
    const first = pool.peek(clipC, 0) as FakeFrame;
    expect(first.time).toBe(0);
    const held = pool.peek(clipC, 0.2);
    expect(held).toBe(first);
    expect(first.closed).toBe(false);
    expect(pool.stats().holds).toBe(1);
    await settle();
    expect(pool.peek(clipC, 0.2)?.time).toBeCloseTo(0.2, 9);
    expect(first.closed).toBe(true);
    // Playing on, the frames decoded ahead cover the next steps: no hold.
    expect(pool.peek(clipC, 0.2 + at(1))?.time).toBeCloseTo(0.2 + at(1), 9);
    expect(pool.peek(clipC, 0.2 + at(2))?.time).toBeCloseTo(0.2 + at(2), 9);
    expect(pool.stats().holds).toBe(1);
    pool.dispose();
  });

  it('decodes at most `ahead` frames ahead of the one shown', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    pool.peek(clipC, 0);
    await settle();
    pool.peek(clipC, 0);
    await settle();
    expect(fake.frames()).toBe(1 + LIMITS.ahead);
    expect(pool.stats().frames).toBe(1 + LIMITS.ahead);
    pool.dispose();
  });

  it("never returns another clip's frame, even from the same file", async () => {
    const fake = fakeDecoder({ frameMs: 20 });
    const pool = new DecodePool(fake.open, LIMITS);
    const blob = fake.file({ name: 'one.mp4', dur: 10 });
    const clipA = clip('a', blob, 0, 5),
      clipB = clip('b', blob, 5, 10);
    pool.prepare(clipA);
    await settle();
    expect(pool.peek(clipA, 0)?.time).toBe(0);
    expect(pool.peek(clipB, 5)).toBeNull();
    expect(pool.stats().holds).toBe(1);
    await settle();
    expect(pool.peek(clipB, 5)?.time).toBeCloseTo(5, 9);
    pool.dispose();
  });

  it('never returns null for a clip once it has shown a frame, however far the time jumps', async () => {
    const fake = fakeDecoder({ frameMs: 15 });
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 0, 10);
    pool.prepare(clipC);
    await settle();
    for (const time of [3, 0.5, 9, 9.1, 1, 6]) {
      const frame = pool.peek(clipC, time) as FakeFrame | null;
      expect(frame).not.toBeNull();
      expect(frame?.closed).toBe(false);
      await vi.advanceTimersByTimeAsync(7);
    }
    pool.dispose();
  });
});

describe('DecodePool: bounded whatever is asked (AC-12)', () => {
  it('closes the least recently used lane not wanted first, then the least recently used wanted', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, { ...LIMITS, decoders: 3 });
    const files = ['a', 'b', 'c', 'd'].map((letter) => fake.file({ name: `${letter}.mp4`, dur: 4 }));
    const [clipA, clipB, clipC, clipD] = files.map((file, index) => clip('ABCD'[index], file, 0, 4));
    for (const x of [clipA, clipB, clipC]) {
      const pending = pool.frame(x, 1);
      await settle();
      await pending;
    }
    pool.want(['A', 'C', 'D']);
    const pd = pool.frame(clipD, 1);
    await settle();
    await pd;
    expect(fake.counts.sources).toBe(3);
    expect(pool.stats().decoders).toBe(3);
    // B (not wanted) went, though A was used before it.
    const pb = pool.frame(clipB, 1);
    pool.want(['A', 'B', 'C', 'D']);
    await settle();
    await pb;
    expect(fake.counts.sources).toBe(3);
    // Every lane wanted: the least recently used (A) went.
    expect(pool.peek(clipC, 1)).not.toBeNull();
    expect(pool.peek(clipD, 1)).not.toBeNull();
    expect(pool.peek(clipB, 1)).not.toBeNull();
    expect(pool.peek(clipA, 1)).toBeNull();
    pool.dispose();
  });

  it('stays under the byte budget by decoding less ahead', async () => {
    const fake = fakeDecoder();
    const limits = { decoders: 4, ahead: 4, bytes: 6 * FRAME_BYTES };
    const pool = new DecodePool(fake.open, limits);
    const cs = ['a', 'b', 'c'].map((letter, index) =>
      clip(letter, fake.file({ name: `${letter}.mp4`, dur: 4 }), 0, 4, index),
    );
    for (let step = 0; step < 10; step++) {
      for (const poolClip of cs) pool.peek(poolClip, at(step));
      await settle();
      expect(fake.bytes()).toBeLessThanOrEqual(limits.bytes);
    }
    for (const poolClip of cs) expect(pool.peek(poolClip, at(10))).not.toBeNull();
    pool.dispose();
  });

  it('never goes over its decoders, frames or bytes under random asks, and its stats are true', async () => {
    const rnd = mulberry32(204);
    const fake = fakeDecoder({ openMs: 3, frameMs: 2 });
    const limits: PoolLimits = { decoders: 4, ahead: 4, bytes: 12 * FRAME_BYTES };
    const pool = new DecodePool(fake.open, limits);
    const files = [0, 1, 2].map((index) => fake.file({ name: `f${index}.mp4`, dur: 8 }));
    const clips = Array.from({ length: 10 }, (_, index) =>
      clip(`c${index}`, files[index % 3], (index % 4) * 1, (index % 4) + 4, index),
    );
    const pick = () => clips[Math.floor(rnd() * clips.length)];
    const time = (poolClip: PoolClip) => poolClip.in + rnd() * (poolClip.out - poolClip.in);
    const check = () => {
      expect(fake.counts.sources).toBeLessThanOrEqual(limits.decoders);
      expect(fake.frames()).toBeLessThanOrEqual(limits.decoders * (limits.ahead + 1));
      expect(fake.bytes()).toBeLessThanOrEqual(limits.bytes);
      const poolStats = pool.stats();
      expect(poolStats.decoders).toBe(fake.counts.sources);
      expect(poolStats.frames).toBe(fake.frames());
      expect(poolStats.bytes).toBe(fake.bytes());
      expect(fake.counts.doubleClose).toBe(0);
    };
    const pending: Promise<PoolFrame | null>[] = [];
    for (let step = 0; step < 400; step++) {
      const ratio = rnd();
      if (ratio < 0.35) {
        const frame = pool.peek(pick(), 0) as FakeFrame | null;
        if (frame) expect(frame.closed).toBe(false);
        const poolClip = pick();
        const fakeFrame = pool.peek(poolClip, time(poolClip)) as FakeFrame | null;
        if (fakeFrame) expect(fakeFrame.closed).toBe(false);
      } else if (ratio < 0.55) {
        const poolClip = pick();
        pending.push(
          pool.frame(poolClip, time(poolClip)).then((frame) => {
            if (frame) expect((frame as FakeFrame).closed).toBe(false);
            return frame;
          }),
        );
      } else if (ratio < 0.7) pool.prepare(pick());
      else if (ratio < 0.8) pool.want(clips.filter(() => rnd() < 0.3).map((poolClip) => poolClip.id));
      else if (ratio < 0.85) pool.forget(pick().id);
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
    const clipA = clip('a', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4),
      clipB = clip('b', fake.file({ name: 'b.mp4', dur: 4 }), 0, 4);
    pool.peek(clipA, 0);
    pool.peek(clipB, 0);
    await settle();
    const fb = pool.peek(clipB, 0) as FakeFrame;
    pool.forget('a');
    expect(pool.stats().decoders).toBe(1);
    expect(fake.counts.sources).toBe(1);
    expect(fake.frames()).toBe(pool.stats().frames);
    expect(fb.closed).toBe(false);
    expect(pool.peek(clipA, 0)).toBeNull();
    pool.dispose();
  });

  it('dispose closes frames and decoders, including ones still opening or decoding', async () => {
    const fake = fakeDecoder({ openMs: 10, frameMs: 10 });
    const pool = new DecodePool(fake.open, LIMITS);
    const clipA = clip('a', fake.file({ name: 'a.mp4', dur: 4 }), 0, 4),
      clipB = clip('b', fake.file({ name: 'b.mp4', dur: 4 }), 0, 4),
      clipC = clip('c', fake.file({ name: 'c.mp4', dur: 4 }), 0, 4);
    pool.peek(clipA, 0);
    await settle();
    pool.peek(clipA, 1); // a decoding
    const pb = pool.frame(clipB, 1); // b decoding after its open
    await vi.advanceTimersByTimeAsync(12);
    const pc = pool.frame(clipC, 1); // c still opening
    await vi.advanceTimersByTimeAsync(2);
    pool.dispose();
    await settle();
    expect(await pb).toBeNull();
    expect(await pc).toBeNull();
    expect(fake.frames()).toBe(0);
    expect(fake.counts.sources).toBe(0);
    expect(pool.stats()).toMatchObject({ decoders: 0, frames: 0, bytes: 0 });
    // A disposed pool hands out nothing and opens nothing.
    expect(pool.peek(clipA, 0)).toBeNull();
    expect(await pool.frame(clipA, 0)).toBeNull();
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
    const clipC = clip('c', fake.file({ name: 'broken.mp4', dur: 4, failAt: 1 }), 0, 4);
    const p1 = pool.frame(clipC, 0.5);
    await settle();
    expect((await p1)?.time).toBeCloseTo(0.5, 9);
    const p2 = expect(pool.frame(clipC, 1.5)).rejects.toThrow("Can't decode broken.mp4");
    await settle();
    await p2;
    expect(pool.fallback('c')).toMatch(/broken\.mp4/);
    expect(fake.frames()).toBe(0);
    expect(fake.counts.sources).toBe(0);
    pool.dispose();
  });

  it('reopens a clip whose decoder was taken back: not a fault of the file, so no fallback', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'idle.mp4', dur: 4, reclaimAt: 1 }), 0, 4);
    const pending = pool.frame(clipC, 1.5);
    await settle();
    expect((await pending)?.time).toBeCloseTo(1.5, 9);
    expect(pool.fallback('c')).toBeNull();
    expect(fake.counts.sources).toBe(1);
    pool.dispose();
    expect(fake.frames()).toBe(0);
  });

  it('gives up on a decoder taken back again and again, with the reason', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'idle.mp4', dur: 4, reclaimAt: 1, reclaims: 99 }), 0, 4);
    const rejection = expect(pool.frame(clipC, 1.5)).rejects.toThrow('reclaimed');
    await settle();
    await rejection;
    expect(pool.fallback('c')).toMatch(/reclaimed/);
    expect(fake.counts.sources).toBe(0);
    expect(fake.frames()).toBe(0);
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
    const pending = pool.frame(clip('x', fake.file({ name: 'fixed.mp4', dur: 4 }), 0, 4), 0);
    await settle();
    expect((await pending)?.time).toBe(0);
    pool.dispose();
  });
});

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let time = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    time = (time + Math.imul(time ^ (time >>> 7), 61 | time)) ^ time;
    return ((time ^ (time >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 206 T010 spike: frames outside a clip's in–out (transition handles) ---------- */

describe('206 spike: a transition reads past a clip’s ends', () => {
  it('gives the frames before a clip’s in point and after its out point', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'a.mp4', dur: 10 }), 2, 4);
    for (const [asked, expected] of [
      [1.7, at(51)],
      [4.4, at(132)],
    ]) {
      const pending = pool.frame(clipC, asked + 0.001);
      await settle();
      expect((await pending)?.time).toBeCloseTo(expected, 9);
    }
    pool.dispose();
  });

  it('holds the source’s first frame before it and its last frame after it', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipC = clip('c', fake.file({ name: 'five.mp4', dur: 5 }), 0, 5);
    const before = pool.frame(clipC, -0.2);
    await settle();
    expect((await before)?.time).toBe(0);
    const after = pool.frame(clipC, 5.3);
    await settle();
    expect((await after)?.time).toBeCloseTo(at(149), 9);
    pool.dispose();
  });

  it('plays two clips of one track side by side through a 1 s transition, each from its handles', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const clipA = clip('a', fake.file({ name: 'a.mp4', dur: 10 }), 0, 4, 0),
      clipB = clip('b', fake.file({ name: 'b.mp4', dur: 10 }), 3, 8, 4);
    // The transition runs from 3.5 s to 4.5 s on the timeline: a plays 3.5–4.5 of its source, b 2.5–3.5 of its.
    pool.frame(clipA, 3.5);
    pool.frame(clipB, 2.5);
    await settle();
    let behind = 0;
    for (let index = 0; index < 30; index++) {
      const askedAt = 3.5 + at(index) + 0.001;
      const fa = pool.peek(clipA, askedAt),
        fb = pool.peek(clipB, askedAt - 1);
      if (!fa || !fb || fa.time < at(Math.floor((askedAt + 1e-9) * FPS)) - 1e-9) behind++;
      await vi.advanceTimersByTimeAsync(1000 / FPS);
    }
    expect(behind).toBe(0);
    expect(pool.stats().decoders).toBe(2);
    pool.dispose();
  });

  it('prepare primes a lane at the pool clip’s in point, so an incoming clip is handed over with its handle (T021)', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const file = fake.file({ name: 'b.mp4', dur: 10 });
    // As stored: primed at in (3 s); the transition's first frame (2.5 s) would show that held frame.
    const stored = clip('b', file, 3, 8, 4);
    pool.prepare(stored);
    await settle();
    expect(pool.peek(stored, 2.5)?.time).toBeCloseTo(3, 9);
    pool.forget('b');
    const holdsBefore = pool.stats().holds;
    // Widened by the half before its start: primed at 2.5 s, the transition's first frame is ready.
    const widened = clip('b', file, 2.5, 8, 4);
    pool.prepare(widened);
    await settle();
    expect(pool.peek(widened, 2.5)?.time).toBeCloseTo(2.5, 9);
    expect(pool.stats().holds).toBe(holdsBefore);
    pool.dispose();
  });
});

describe('206: lanePlan with transitions (AC-2, AC-3)', () => {
  const videoClip = (id: string, start: number, len: number, transitionTo?: string): TimedClip => ({
    id,
    track: MAIN_VIDEO,
    start,
    kind: 'video',
    in: 1,
    out: 1 + len,
    dur: 0,
    ...(transitionTo ? { transition: { kind: 'dissolve' as const, dur: 1, to: transitionTo } } : {}),
  });
  // a 0–4, a 1 s dissolve into b 4–8 (it plays 3.5–4.5).
  const project: Project = {
    tracks: defaultTracks(),
    clips: [videoClip('a', 0, 4, 'b'), videoClip('b', 4, 4)],
    audio: [],
    layers: [],
    fadeOut: false,
  };
  const ids = (clips: TimedClip[]) => clips.map((clip) => clip.id);

  it('lists both clips of a playing transition as visible', () => {
    expect(ids(lanePlan(project, 3.7, 2).visible)).toEqual(['a', 'b']);
    expect(ids(lanePlan(project, 4.3, 2).visible)).toEqual(['a', 'b']);
    expect(ids(lanePlan(project, 4.6, 2).visible)).toEqual(['b']);
  });

  it('gets the incoming clip ready 2 s before its transition starts, not before its own start', () => {
    // At 1.6 s b starts in 2.4 s, but its transition in 1.9 s.
    expect(ids(lanePlan(project, 1.6, 2).next)).toEqual(['b']);
    expect(ids(lanePlan(project, 1.4, 2).next)).toEqual([]);
  });
});
