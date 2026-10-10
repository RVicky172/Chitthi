/*
 * Development only: the decoder pool's self-test checks on the real decoder (specs/features/204-decoder-pool). Test
 * clips are made in memory (videoChecks.ts makeTestClip: a flat colour per frame that tells its source time).
 */
import { clipColour, makeTestClip } from './videoChecks';
import type { PoolClip, PoolFrame } from '../engine/decodePool';

type Check = (ok: unknown, what: string) => void;

const FPS = 30;
/** The frame showing at source time t in a 30 fps test clip. */
const frameAt = (t: number) => Math.floor(t * FPS + 1e-6) / FPS;

/** The mean colour of a 16 × 16 patch in the middle of a frame. */
function colourOf(f: PoolFrame): [number, number, number] {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(f.image, f.width / 2 - 8, f.height / 2 - 8, 16, 16, 0, 0, 16, 16);
  const d = x.getImageData(0, 0, 16, 16).data;
  let r = 0,
    g = 0,
    b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  return [r / 256, g / 256, b / 256];
}

/** Is f the frame for source time t of a clip `dur` seconds long: the right frame, and its colour within ±8? */
function exact(f: PoolFrame | null, t: number, dur: number): string | null {
  if (!f) return `no frame at ${t.toFixed(3)} s`;
  const want = frameAt(t);
  if (Math.abs(f.time - want) > 1e-3)
    return `frame ${f.time.toFixed(3)} s for ${t.toFixed(3)} s (want ${want.toFixed(3)})`;
  const got = colourOf(f),
    exp = clipColour(want, dur);
  if (!exp.every((v, k) => Math.abs(v - got[k]) <= 8))
    return `colour ${got.map(Math.round).join('/')} at ${t.toFixed(3)} s (want ${exp.join('/')})`;
  return null;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** p, or a failure naming `what` after `ms`: a pool that never answers fails its check instead of stalling the run. */
function within<T>(p: Promise<T>, what: string, ms = 5000): Promise<T> {
  let timer = 0;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`no answer in ${ms / 1000} s: ${what}`)), ms);
    }),
  ]);
}

/** Runs one group of checks; if it throws (or times out) that is one failed check, and the others still run. */
async function group(check: Check, name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (e) {
    check(false, `pool: ${name} threw: ${e instanceof Error ? e.message : e}`);
  }
}

/** Waits until every frame and decoder is closed (readers stop asynchronously), at most `ms`. */
async function drained(open: () => { decoders: number; frames: number; bytes: number }, ms = 1000) {
  const end = performance.now() + ms;
  let o = open();
  while ((o.decoders || o.frames || o.bytes) && performance.now() < end) {
    await new Promise((r) => setTimeout(r, 20));
    o = open();
  }
  return o;
}

/** AC-1, AC-2 and AC-3 (204) through a pool on Mediabunny. Returns notes for the report. */
export async function poolChecks(check: Check): Promise<string[]> {
  const { DecodePool, poolLimits } = await import('../engine/decodePool');
  const { mediabunnySource, openFrames } = await import('../engine/frameSource');
  const DUR = 10;
  const [A, B] = await Promise.all([makeTestClip(DUR, 640, 360, 2), makeTestClip(DUR, 640, 360, 2)]);
  if (!A || !B) return ['pool: this engine cannot encode H.264; pool checks skipped'];
  const notes: string[] = [];
  const clip = (id: string, file: Blob, inT: number, outT: number, start: number, track = 'V1'): PoolClip => ({
    id,
    file,
    in: inT,
    out: outT,
    start,
    track,
  });
  const src = (c: PoolClip, t: number) => c.in + (t - c.start);
  const t0 = performance.now();

  // AC-1: three clips overlapping in time, two of them from the same file at different source times.
  await group(check, 'AC-1', async () => {
    const pool = new DecodePool(mediabunnySource, poolLimits(6, true));
    const cs = [clip('a1', A, 1, 7, 0), clip('a2', A, 3, 9, 1, 'V2'), clip('b', B, 0, 6, 0.5, 'V3')];
    const end = (c: PoolClip) => c.start + (c.out - c.in);
    // Each clip's first and last frame, then evenly through the span where all three show.
    const firstLast = cs.flatMap((c) => [c.start, end(c) - 1 / FPS]);
    const times = [...firstLast, ...Array.from({ length: 30 - firstLast.length }, (_, k) => 1 + (k / 23) * 4.9)];
    const bad: string[] = [];
    let frames = 0;
    for (const t of times) {
      const on = cs.filter((c) => t >= c.start - 1e-9 && t < end(c) - 1e-9);
      const got = await within(
        Promise.all(on.map((c) => pool.frame(c, src(c, t)))),
        `AC-1 frames at ${t.toFixed(3)} s`,
      );
      on.forEach((c, i) => {
        const e = exact(got[i], src(c, t), DUR);
        if (e) bad.push(`${c.id} at ${t.toFixed(3)} s: ${e}`);
        frames++;
      });
    }
    const s = pool.stats();
    pool.dispose();
    check(
      !bad.length && frames >= 60,
      `pool: 3 overlapping clips (2 from one file) give their exact frames at 30 times (${frames} frames, ${s.decoders} decoders)${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`,
    );
  });

  // AC-2: the last 15 frames of one clip and the first 15 of the next, at the same moments (a 0.5 s transition).
  await group(check, 'AC-2', async () => {
    const pool = new DecodePool(mediabunnySource, poolLimits(6, true));
    const c1 = clip('c1', A, 0, 3, 0),
      c2 = clip('c2', B, 2, 5, 3);
    const bad: string[] = [];
    for (let k = 0; k < 15; k++) {
      const s1 = c1.out - (15 - k) / FPS + 1e-4,
        s2 = c2.in + k / FPS + 1e-4;
      const [f1, f2] = await within(Promise.all([pool.frame(c1, s1), pool.frame(c2, s2)]), `AC-2 pair ${k}`);
      const e1 = exact(f1, s1, DUR),
        e2 = exact(f2, s2, DUR);
      if (e1) bad.push(`out ${k}: ${e1}`);
      if (e2) bad.push(`in ${k}: ${e2}`);
    }
    pool.dispose();
    check(
      !bad.length,
      `pool: the last 15 frames of a clip and the first 15 of the next decode together, all 30 exact${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`,
    );
  });

  // AC-3: 50 random times within 3 clips, backwards and forwards across key frames.
  await group(check, 'AC-3', async () => {
    const pool = new DecodePool(mediabunnySource, poolLimits(6, true));
    const cs = [clip('r1', A, 0, 10, 0), clip('r2', A, 2, 8, 0, 'V2'), clip('r3', B, 1, 9, 0, 'V3')];
    const rnd = mulberry32(2043);
    const bad: string[] = [];
    let back = 0,
      prev = 0;
    for (let i = 0; i < 50; i++) {
      const c = cs[Math.floor(rnd() * cs.length)];
      const s = c.in + rnd() * (c.out - c.in - 1 / FPS);
      if (s < prev) back++;
      prev = s;
      const e = exact(await within(pool.frame(c, s), `AC-3 ${c.id} at ${s.toFixed(3)} s`), s, DUR);
      if (e) bad.push(`${c.id}: ${e}`);
    }
    pool.dispose();
    check(
      !bad.length && back >= 10,
      `pool: 50 random seeks (${back} backwards) across 3 clips are exact${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`,
    );
  });

  const left = await drained(openFrames);
  check(
    !left.decoders && !left.frames && !left.bytes,
    `pool: no frame or decoder left open after dispose (${left.decoders} decoders, ${left.frames} frames)`,
  );
  notes.push(
    `pool: AC-1–AC-3 on 2 × 10 s 640×360 clips (2 s key frames) in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
  return notes;
}
