import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DecodePool,
  frameTime,
  poolLimits,
  type PoolClip,
  type PoolFrame,
  type PoolLimits,
} from '@/engine/decodePool';
import { lanePlan, laneWindow } from '@/engine/lanePlan';
import { MAIN_VIDEO, MUSIC, defaultTracks } from '@/engine/tracks';
import { type Project, type TimedClip } from '@/engine/timeline';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { sourceAt, type SpeedClip, type SpeedFields } from '@/engine/speed';
import { defined } from '../../support/defined';
import { FAKE_FPS as FPS, FRAME_BYTES, fakeDecoder, type FakeFrame, type KeyedSource } from '../../support/fakeDecoder';

const clip = (id: string, file: Blob, inT: number, outT: number, start = 0): PoolClip => ({
  id,
  file,
  in: inT,
  out: outT,
  start,
  track: MAIN_VIDEO,
});

/**
 * Lets every pending open and decode finish.
 * @returns a promise that settles when the fake timers have run
 */
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
    expect(frameTime(1.01, 60)).toBeCloseTo(1, 12);
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
      const roll = rnd();
      if (roll < 0.35) {
        const frame = pool.peek(pick(), 0) as FakeFrame | null;
        if (frame) expect(frame.closed).toBe(false);
        const poolClip = pick();
        const fakeFrame = pool.peek(poolClip, time(poolClip)) as FakeFrame | null;
        if (fakeFrame) expect(fakeFrame.closed).toBe(false);
      } else if (roll < 0.55) {
        const poolClip = pick();
        pending.push(
          pool.frame(poolClip, time(poolClip)).then((frame) => {
            if (frame) expect((frame as FakeFrame).closed).toBe(false);
            return frame;
          }),
        );
      } else if (roll < 0.7) pool.prepare(pick());
      else if (roll < 0.8) pool.want(clips.filter(() => rnd() < 0.3).map((poolClip) => poolClip.id));
      else if (roll < 0.85) pool.forget(pick().id);
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
    pool.frame(bad, 0).catch(() => undefined);
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
    void pool.frame(clipA, 3.5);
    void pool.frame(clipB, 2.5);
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

/* ---------- 207 spike (T020, risk 1): reverse in chunks and key-frame skips on a fake with key frames ---------- */

describe('207 spike: reverse in chunks and key-frame skips', () => {
  /** A chunk is at most the pool's `ahead` × 4 frames (plan, Techniques). */
  const CHUNK = LIMITS.ahead * 4;

  /**
   * Waits for a fake decode, letting the fake timers run.
   * @param pending what is being waited for
   * @returns its result
   */
  const waitFor = async <T>(pending: Promise<T>): Promise<T> => {
    await settle();
    return pending;
  };

  /**
   * The source of a fake file, with its key frames.
   * @param fake the fake decoder
   * @param file the file
   * @returns its keyed source
   */
  const keyedSource = (fake: ReturnType<typeof fakeDecoder>, file: Blob) =>
    waitFor(fake.open(file, {})) as Promise<KeyedSource>;

  /**
   * The prototype of a reversed lane: from the frame before `outTime` back to the one at `inTime`, in chunks of at most
   * `chunk` frames, each from the key frame before its last frame (or `chunk` frames before it) up to it, handed out
   * newest first.
   * @param source the keyed source
   * @param inTime the clip's in point
   * @param outTime the clip's out point
   * @param chunk most frames decoded and held at once
   * @yields the frames, newest first; the caller closes each
   */
  async function* reversed(source: KeyedSource, inTime: number, outTime: number, chunk: number) {
    const firstIndex = Math.floor(inTime * FPS + 1e-6);
    let lastIndex = Math.ceil(outTime * FPS - 1e-6) - 1;
    while (lastIndex >= firstIndex) {
      const keyIndex = Math.round((await source.keyBefore(at(lastIndex))) * FPS);
      const startIndex = Math.max(keyIndex, lastIndex - chunk + 1, firstIndex);
      const iterator = source.from(at(startIndex));
      const frames: PoolFrame[] = [];
      while (frames.length < lastIndex - startIndex + 1) {
        const result = await waitFor(iterator.next());
        if (result.done) break;
        frames.push(result.value);
      }
      await iterator.return?.();
      yield* frames.toReversed();
      lastIndex = startIndex - 1;
    }
  }

  /**
   * Plays a reversed clip the way a lane hands frames out: the frame shown is held until the next replaces it.
   * @param fake the fake decoder
   * @param file the file
   * @param inTime the clip's in point
   * @param outTime the clip's out point
   * @returns the frame indexes shown, in order, and the most frames open at once
   */
  async function playReversed(fake: ReturnType<typeof fakeDecoder>, file: Blob, inTime: number, outTime: number) {
    const source = await keyedSource(fake, file);
    const shown: number[] = [];
    let held: PoolFrame | null = null;
    let peak = 0;
    for await (const frame of reversed(source, inTime, outTime, CHUNK)) {
      held?.close();
      held = frame;
      shown.push(Math.round(frame.time * FPS));
      peak = Math.max(peak, fake.frames());
    }
    held?.close();
    source.close();
    return { shown, peak };
  }

  it('hands every frame from out back to in once, newest first', async () => {
    const fake = fakeDecoder();
    const { shown } = await playReversed(fake, fake.file({ name: 'a.mp4', dur: 4, gop: 30 }), 0.5, 3.5);
    expect(shown).toEqual(Array.from({ length: 90 }, (_, index) => 104 - index));
    expect(fake.frames()).toBe(0);
    expect(fake.counts.doubleClose).toBe(0);
  });

  it("holds at most a chunk plus the frame shown: within the pool's byte budget", async () => {
    for (const gop of [8, 30, 120]) {
      const fake = fakeDecoder();
      const { peak } = await playReversed(fake, fake.file({ name: 'a.mp4', dur: 10, gop }), 0, 10);
      expect(peak).toBeLessThanOrEqual(CHUNK + 1);
      expect(peak * FRAME_BYTES).toBeLessThanOrEqual(LIMITS.bytes);
    }
  });

  it('decodes each frame once when a key-frame group fits a chunk; a longer group costs about gop / (2 × chunk) times', async () => {
    const decodedFor = async (gop: number) => {
      const fake = fakeDecoder();
      const { shown } = await playReversed(fake, fake.file({ name: 'a.mp4', dur: 8, gop }), 0, 8);
      return fake.counts.decoded / shown.length;
    };
    expect(await decodedFor(8)).toBe(1);
    expect(await decodedFor(16)).toBe(1);
    // 1 s groups: [14–29] from 0, then [0–13]: 44 decodes for 30 frames.
    expect(await decodedFor(30)).toBeCloseTo(44 / 30, 9);
    // 4 s groups (some phones): about 4 decodes a frame, still bounded.
    const long = await decodedFor(120);
    expect(long).toBeGreaterThan(3);
    expect(long).toBeLessThanOrEqual(120 / (2 * CHUNK) + 1);
  });

  /**
   * An export at a constant speed: the frame at each drawn frame's source time, read forward on one reader, which
   * restarts only when `skip` says so.
   * @param speed source seconds per timeline second
   * @param gop the file's key-frame group
   * @param skip whether to restart at the wanted time when it is past the next key frame
   * @returns frames decoded per frame drawn, and the most decoded for one
   */
  async function exportAt(speed: number, gop: number, skip: boolean) {
    const fake = fakeDecoder();
    const source = await keyedSource(fake, fake.file({ name: 'a.mp4', dur: 40, gop }));
    const drawn = Math.floor((38 / speed) * FPS);
    let iterator: AsyncIterator<PoolFrame> | null = null;
    let pos = Infinity;
    let worst = 0;
    for (let index = 0; index < drawn; index++) {
      const wanted = (index / FPS) * speed;
      const nextKey = Number.isFinite(pos) ? await source.keyAfter(pos) : null;
      if (!iterator || wanted < pos - 1e-6 || (skip && nextKey !== null && wanted >= nextKey - 1e-6)) {
        await iterator?.return?.();
        iterator = source.from(wanted);
      }
      const before = fake.counts.decoded;
      for (;;) {
        const result = await waitFor(iterator.next());
        if (result.done) throw new Error('ran out of frames');
        const frame = result.value;
        frame.close();
        pos = frame.time + frame.duration;
        if (wanted < pos - 1e-6) break;
      }
      worst = Math.max(worst, fake.counts.decoded - before);
    }
    await iterator?.return?.();
    source.close();
    return { perFrame: fake.counts.decoded / drawn, worst };
  }

  it('at 10× a reader that jumps to the next key frame decodes less than one reading through, and never more than a group per frame', async () => {
    for (const gop of [5, 15, 30, 120]) {
      const through = await exportAt(10, gop, false);
      const skipping = await exportAt(10, gop, true);
      expect(through.perFrame).toBeCloseTo(10, 0);
      expect(skipping.perFrame).toBeLessThanOrEqual(through.perFrame + 1e-9);
      expect(skipping.worst).toBeLessThanOrEqual(Math.max(gop, 10));
    }
    // Short groups gain the most: every wanted frame of a 5-frame group is a key frame.
    expect((await exportAt(10, 5, true)).perFrame).toBe(1);
  });

  it('at 1× skipping never restarts: the next key frame is always met by reading on', async () => {
    const through = await exportAt(1, 30, false);
    const skipping = await exportAt(1, 30, true);
    expect(skipping.perFrame).toBe(1);
    expect(skipping.perFrame).toBe(through.perFrame);
  });
});

/* ---------- 207 (T021): lanes at speed, key-frame skips, reversed lanes and freeze frames ---------- */

describe('207: laneWindow, the source span a lane covers (AC-10)', () => {
  /**
   * A 4 s video clip of source 2–6 s.
   * @param fields its speed fields
   * @returns the clip
   */
  const speedClip = (fields: SpeedFields = {}): SpeedClip => ({ kind: 'video', dur: 0, in: 2, out: 6, ...fields });

  it('is in to out at 1× forwards, widened by the handles at the edge speed and never before 0', () => {
    expect(laneWindow(speedClip(), 0, 0)).toEqual({ in: 2, out: 6 });
    expect(laneWindow(speedClip(), 0.5, 0.25)).toEqual({ in: 1.5, out: 6.25 });
    expect(laneWindow(speedClip({ speed: 2 }), 0.5, 0.5)).toEqual({ in: 1, out: 7 });
    expect(laneWindow(speedClip({ speed: 10 }), 1, 0).in).toBe(0);
  });

  it('covers out → in for a reversed clip: its handles reach past out before it and past in after it', () => {
    expect(laneWindow(speedClip({ reverse: true }), 0, 0)).toEqual({ in: 2, out: 6, reverse: true });
    expect(laneWindow(speedClip({ reverse: true, speed: 2 }), 0.5, 0.25)).toEqual({ in: 1.5, out: 7, reverse: true });
  });

  it('follows a ramp: the handles run on at each edge’s own speed', () => {
    const ramp = [
      { at: 0, v: 1 },
      { at: 1, v: 4 },
    ];
    const window = laneWindow(speedClip({ ramp }), 0.5, 0.5);
    expect(window.in).toBeCloseTo(1.5, 9);
    expect(window.out).toBeCloseTo(8, 9);
    expect(window.reverse).toBeUndefined();
  });

  it('is one held source time for a freeze frame', () => {
    expect(laneWindow({ kind: 'video', dur: 2, in: 2, out: 6, freeze: 3.5 }, 0.5, 0.5)).toEqual({
      in: 3.5,
      out: 3.5,
      still: true,
    });
  });
});

describe('207: key-frame skips (D3, AC-10)', () => {
  /**
   * An export through the pool at a constant speed: the exact frame at each drawn frame's source time.
   * @param speed source seconds per timeline second
   * @param gop the file's key-frame group, in frames
   * @returns frames decoded per frame drawn, the most decoded for one, and the readers opened
   */
  async function exportThroughPool(speed: number, gop: number) {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const poolClip = clip('c', fake.file({ name: 'a.mp4', dur: 40, gop }), 0, 40);
    const timing: SpeedClip = { kind: 'video', dur: 0, in: 0, out: 40, speed };
    const drawn = Math.floor((38 / speed) * FPS);
    let worst = 0;
    for (let index = 0; index < drawn; index++) {
      const wanted = sourceAt(timing, index / FPS);
      const before = fake.counts.decoded;
      const pending = pool.frame(poolClip, wanted);
      await settle();
      expect((await pending)?.time).toBeCloseTo(frameTime(wanted, FPS), 9);
      worst = Math.max(worst, fake.counts.decoded - before);
    }
    pool.dispose();
    return { perFrame: fake.counts.decoded / drawn, worst, readers: fake.counts.readers };
  }

  it('at 10× jumps to the next key frame instead of decoding through: within a key-frame group per frame drawn', async () => {
    // Every wanted frame of a 5-frame group is a key frame: one decode each (reading through costs 10).
    expect((await exportThroughPool(10, 5)).perFrame).toBe(1);
    for (const [gop, most] of [
      [15, 6],
      [30, 7.5],
      [120, 9.5],
    ] as const) {
      const { perFrame, worst } = await exportThroughPool(10, gop);
      expect(perFrame).toBeLessThanOrEqual(most);
      expect(worst).toBeLessThanOrEqual(Math.max(gop, 10));
    }
  });

  it('at 1× never restarts: the next key frame is always met by reading on', async () => {
    const { perFrame, readers } = await exportThroughPool(1, 30);
    expect(perFrame).toBe(1);
    expect(readers).toBe(1);
  });
});

describe('207: a reversed lane (AC-3, AC-10)', () => {
  /** Most frames a reversed lane decodes at once: the pool's `ahead` × 4 (plan, Techniques). */
  const CHUNK = LIMITS.ahead * 4;

  /**
   * A reversed clip of source 0.5–3.5 s of a 4 s file.
   * @param fake the fake decoder
   * @param gop the file's key-frame group, in frames
   * @returns the pool clip
   */
  const reversedClip = (fake: ReturnType<typeof fakeDecoder>, gop = 30): PoolClip => ({
    ...clip('r', fake.file({ name: 'r.mp4', dur: 4, gop }), 0.5, 3.5),
    reverse: true,
  });

  /**
   * The source time of the frame a reversed clip shows i-th, newest first.
   * @param index frames into the clip
   * @returns the middle of frame 104 − index
   */
  const backwards = (index: number) => at(104 - index) + 0.5 / FPS;

  it('gives exact frames from out back to in, decoding each about once, never more than a chunk at a time', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const reversed = reversedClip(fake);
    let peak = 0;
    for (let index = 0; index < 90; index++) {
      const pending = pool.frame(reversed, backwards(index));
      await settle();
      expect((await pending)?.time).toBeCloseTo(at(104 - index), 9);
      peak = Math.max(peak, fake.frames());
    }
    // 1 s groups decoded in chunks of 16 from their key frames: about the spike's 44 decodes per 30 frames.
    expect(fake.counts.decoded / 90).toBeLessThanOrEqual(1.5);
    expect(peak).toBeLessThanOrEqual(CHUNK + 1);
    pool.dispose();
    expect(fake.frames()).toBe(0);
    expect(fake.counts.doubleClose).toBe(0);
  });

  it('stays within a byte budget smaller than a chunk: the chunk shrinks to fit', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, { ...LIMITS, bytes: 6 * FRAME_BYTES });
    const reversed = reversedClip(fake, 8);
    for (let index = 0; index < 60; index++) {
      const pending = pool.frame(reversed, backwards(index));
      await settle();
      expect((await pending)?.time).toBeCloseTo(at(104 - index), 9);
      expect(fake.bytes()).toBeLessThanOrEqual(6 * FRAME_BYTES);
    }
    pool.dispose();
  });

  it('primes at its out point: the first frame it shows is ready without a hold', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const reversed = reversedClip(fake);
    pool.prepare(reversed);
    await settle();
    const holds = pool.stats().holds;
    expect(pool.peek(reversed, backwards(0))?.time).toBeCloseTo(at(104), 9);
    expect(pool.stats().holds).toBe(holds);
    pool.dispose();
  });

  it('plays backwards in the preview: frames newest first, decoded ahead in chunks, no holds after the first second', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const reversed = reversedClip(fake);
    pool.prepare(reversed);
    await settle();
    const shown: number[] = [];
    let behind = 0;
    for (let index = 0; index < 90; index++) {
      const frame = pool.peek(reversed, backwards(index));
      const frameIndex = frame ? Math.round(frame.time * FPS) : -1;
      shown.push(frameIndex);
      if (index >= FPS && frameIndex !== 104 - index) behind++;
      expect(fake.frames()).toBeLessThanOrEqual(2 * CHUNK + 1);
      expect(pool.stats().bytes).toBeLessThanOrEqual(LIMITS.bytes);
      await vi.advanceTimersByTimeAsync(1000 / FPS);
    }
    for (const [index, frameIndex] of shown.entries())
      if (index > 0) expect(frameIndex).toBeLessThanOrEqual(defined(shown[index - 1]));
    expect(behind).toBe(0);
    pool.dispose();
    expect(fake.counts.doubleClose).toBe(0);
  });
});

describe('207: a freeze frame (AC-4, AC-10)', () => {
  it('decodes its frame once and holds it, playing or paused, decoding nothing ahead', async () => {
    const fake = fakeDecoder();
    const pool = new DecodePool(fake.open, LIMITS);
    const still: PoolClip = { ...clip('f', fake.file({ name: 'f.mp4', dur: 4, gop: 30 }), 2.5, 2.5), still: true };
    const first = pool.frame(still, 2.5);
    await settle();
    const frame = await first;
    expect(frame?.time).toBeCloseTo(2.5, 9);
    const decoded = fake.counts.decoded;
    for (let index = 0; index < 60; index++) {
      expect(pool.peek(still, 2.5)).toBe(frame);
      await vi.advanceTimersByTimeAsync(1000 / FPS);
    }
    const again = pool.frame(still, 2.5);
    await settle();
    expect(await again).toBe(frame);
    expect(fake.counts.decoded).toBe(decoded);
    expect(pool.stats().frames).toBe(1);
    pool.dispose();
  });
});
