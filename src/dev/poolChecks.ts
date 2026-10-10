/*
 * Development only: the decoder pool's self-test checks on the real decoder (specs/features/204-decoder-pool). Test
 * clips are made in memory (videoChecks.ts makeTestClip: a flat colour per frame that tells its source time).
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { clipColour, decodedColours, makeTestClip, testPhoto } from './videoChecks';
import type { PoolClip, PoolFrame } from '../engine/decodePool';
import type { ExportClip, ExportJob } from '../engine/videoExport';

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
  await group(check, 'export AC-9', async () => {
    notes.push(await exportSameFrames(check, A, B));
  });
  await group(check, 'export AC-11', async () => {
    notes.push(await exportNoLeaks(check));
  });
  return notes;
}

/** The mean colour of the 16 × 16 patch in the middle of a W × H canvas. */
function mean16(x: CanvasRenderingContext2D, W: number, H: number): [number, number, number] {
  const d = x.getImageData(Math.round(W / 2) - 8, Math.round(H / 2) - 8, 16, 16).data;
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

/**
 * AC-9 (204): the export shows the same source frames as it always did. 201's project shapes (video clips from the
 * test clips, photos from test photos) and 202's gap are exported at 16:9; at 10 frames each the decoded middle must
 * match (±8) that frame drawn by `renderFrame` from a source frame decoded on its own (`CanvasSink.getCanvas`, as the
 * export decoded before the pool): an oracle that holds on today's code and after.
 */
async function exportSameFrames(check: Check, A: Blob, B: Blob): Promise<string> {
  const { encodeVideo } = await import('../engine/videoExport');
  const { renderFrame, NO_PICTURE } = await import('../engine/video');
  const { legacyFixtures } = await import('../engine/timeline.testkit');
  const { MAIN_VIDEO, defaultTracks, framePlan, pack, projectLength } = await import('../engine/timeline');
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const { loadImage } = await import('../engine/photo');
  const W = 480,
    H = 270;
  const photos = await Promise.all([0, 1, 2].map((i) => testPhoto(i, 640, 427)));
  const images = new Map<Blob, HTMLImageElement>();
  for (const p of photos) {
    const url = URL.createObjectURL(p.blob);
    images.set(p.blob, await loadImage(url));
    URL.revokeObjectURL(url);
  }
  const lf = legacyFixtures();
  const shapes = {
    videoOnly: lf.videoOnly,
    mixed: lf.mixed,
    musicOffset: lf.musicOffset,
    noFadeOut: lf.noFadeOut,
    tinyClips: lf.tinyClips,
    clips20: lf.clips20,
  };
  const base = { tracks: defaultTracks(), audio: [], width: W, height: H, fps: FPS, bitrate: 1.5e6 };
  const jobs: [string, ExportJob][] = Object.entries(shapes).map(([name, lp]) => {
    let k = 0;
    const clips = pack(
      lp.clips.map((c): ExportClip => ({
        ...c,
        track: MAIN_VIDEO,
        start: 0,
        file: c.kind === 'video' ? (k++ % 2 ? B : A) : photos[k++ % 3].blob,
      })),
    );
    return [name, { ...base, clips, layers: lp.layers, fadeOut: lp.fadeOut, sink: { kind: 'memory' } }];
  });
  // 202's gap: two 1 s photos 1.5 s apart.
  const gapClips = [0, 1].map((i): ExportClip => ({
    id: `g${i}`,
    track: MAIN_VIDEO,
    start: i ? 2.5 : 0,
    kind: 'photo',
    dur: 1,
    in: 0,
    out: 0,
    edit: { ...DEFAULT_EDIT },
    motion: 'none',
    fade: false,
    file: photos[i].blob,
    volume: 0,
  }));
  jobs.push(['gap', { ...base, clips: gapClips, layers: [], fadeOut: false, sink: { kind: 'memory' } }]);

  const ox = document.createElement('canvas');
  ox.width = W;
  ox.height = H;
  const octx = ox.getContext('2d', { willReadFrequently: true })!;
  const bad: string[] = [];
  let compared = 0;
  for (const [name, job] of jobs) {
    const mp4 = await encodeVideo(job);
    if (!mp4) throw new Error(`${name}: no file`);
    const total = projectLength(job);
    const frames = Math.max(1, Math.round(total * FPS));
    const idx = Array.from({ length: 10 }, (_, k) => Math.min(frames - 1, Math.floor(((k + 0.5) / 10) * frames)));
    const got = await decodedColours(
      mp4,
      idx.map((i) => (i + 0.5) / FPS),
    );
    const plan = framePlan(job, FPS);
    const inputs = new Map<Blob, { input: Input; sink: CanvasSink }>();
    try {
      for (const [n, i] of idx.entries()) {
        const span = plan.find((p) => i >= p.f0 && i < p.f1);
        const t = i / FPS;
        const c = span?.clip ?? null;
        if (!c)
          renderFrame(octx, W, H, NO_PICTURE, null, 0, 0, t - (span?.start ?? 0), job.layers, t, total, job.fadeOut);
        else if (c.kind === 'photo') {
          const img = images.get(c.file)!;
          renderFrame(
            octx,
            W,
            H,
            c,
            img,
            img.naturalWidth,
            img.naturalHeight,
            t - c.start,
            job.layers,
            t,
            total,
            job.fadeOut,
          );
        } else {
          let o = inputs.get(c.file);
          if (!o) {
            const input = new Input({ source: new BlobSource(c.file), formats: ALL_FORMATS });
            const track = (await input.getPrimaryVideoTrack())!;
            const width = Math.min(track.displayWidth, Math.round(Math.max(W, H) * 1.8));
            o = { input, sink: new CanvasSink(track, { width }) };
            inputs.set(c.file, o);
          }
          const wc = await o.sink.getCanvas(c.in + t - c.start);
          const cv = wc?.canvas ?? null;
          renderFrame(
            octx,
            W,
            H,
            c,
            cv,
            cv?.width ?? 0,
            cv?.height ?? 0,
            t - c.start,
            job.layers,
            t,
            total,
            job.fadeOut,
          );
        }
        const want = mean16(octx, W, H);
        compared++;
        if (!got[n] || !want.every((v, ch) => Math.abs(v - got[n][ch]) <= 8))
          bad.push(`${name} frame ${i}: ${got[n]?.map(Math.round).join('/')} (want ${want.map(Math.round).join('/')})`);
      }
    } finally {
      for (const o of inputs.values()) o.input.dispose();
    }
  }
  check(
    !bad.length,
    `pool: exports of 201's shapes and 202's gap show the expected source frames (${compared} frames)${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`,
  );
  return `pool: AC-9 compared ${compared} exported frames in ${jobs.length} projects`;
}

/**
 * AC-11 (204): a 2-minute 1080p 16:9 export (24 clips of 5 s from 3 source files, a hidden track's span, a 1.5 s gap)
 * decodes its frames through the pool and leaves no frame or decoder open: after it, after 3 in a row, after a cancel
 * at 50 % and after a clip that can't be read at about 1 minute.
 */
async function exportNoLeaks(check: Check): Promise<string> {
  const { encodeVideo, ExportError } = await import('../engine/videoExport');
  const { openFrames } = await import('../engine/frameSource');
  const { MAIN_VIDEO, defaultTracks } = await import('../engine/timeline');
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const t0 = performance.now();
  const srcs = await Promise.all([0, 1, 2].map(() => makeTestClip(10, 1920, 1080, 2)));
  const files = srcs.filter((s): s is Blob => !!s);
  if (files.length < 3) return 'pool: AC-11 skipped (no 1080p H.264 encoder)';
  const made = performance.now() - t0;
  let start = 0;
  const clips: ExportClip[] = Array.from({ length: 24 }, (_, i) => {
    const inT = (i * 1.3) % 5;
    const c: ExportClip = {
      id: `l${i}`,
      track: MAIN_VIDEO,
      start,
      kind: 'video',
      dur: 0,
      in: inT,
      out: inT + 5,
      edit: { ...DEFAULT_EDIT },
      motion: 'none',
      fade: false,
      file: files[i % 3],
      volume: 1,
    };
    start += 5 + (i === 11 ? 1.5 : 0);
    return c;
  });
  const overlay = { id: 'V2', kind: 'overlay' as const, name: 'Overlay', hidden: true, muted: false, locked: false };
  clips.push({ ...clips[3], id: 'hidden', track: 'V2', start: 30 });
  const job = (cs: ExportClip[], extra: Partial<ExportJob> = {}): ExportJob => ({
    tracks: [...defaultTracks(), overlay],
    clips: cs,
    audio: [],
    layers: [],
    fadeOut: false,
    width: 1920,
    height: 1080,
    fps: FPS,
    bitrate: 4e6,
    sink: { kind: 'memory' },
    ...extra,
  });
  const zero = async (what: string) => {
    const o = await drained(openFrames);
    check(
      !o.decoders && !o.frames && !o.bytes,
      `pool: no frame or decoder open after ${what} (${o.decoders} decoders, ${o.frames} frames, ${(o.bytes / 2 ** 20).toFixed(0)} MB)`,
    );
  };
  const times: number[] = [];
  for (let run = 0; run < 3; run++) {
    const before = openFrames().made,
      s0 = performance.now();
    const mp4 = await encodeVideo(job(clips));
    times.push(performance.now() - s0);
    const through = openFrames().made - before;
    check(
      !!mp4 && mp4.size > 1e5 && through >= 24 * 5 * FPS,
      `pool: a 2-minute 1080p export decodes its video frames through the pool (run ${run + 1}: ${through} frames)`,
    );
    await zero(`a 2-minute export (run ${run + 1})`);
  }
  // Cancelled half way.
  const ac = new AbortController();
  let cancelled = false;
  try {
    await encodeVideo(job(clips, { signal: ac.signal, onProgress: (f) => (f >= 0.5 ? ac.abort() : undefined) }));
  } catch (e) {
    cancelled = e instanceof DOMException && e.name === 'AbortError';
  }
  check(cancelled, 'pool: an export cancelled at 50 % stops with AbortError');
  await zero('an export cancelled at 50 %');
  // A clip that can't be read at about 1 minute.
  const broken = new File([new Uint8Array(4096).fill(7)], 'broken.mp4', { type: 'video/mp4' });
  let refused = '';
  try {
    await encodeVideo(job(clips.map((c, i) => (i === 12 ? { ...c, file: broken } : c))));
  } catch (e) {
    refused = e instanceof ExportError ? e.message : `${e}`;
  }
  check(
    refused.includes('broken.mp4'),
    `pool: an export refuses a clip it can't read, naming the file (${refused || 'no error'})`,
  );
  await zero('an export that failed at 1 minute');
  const secs = (ms: number) => (ms / 1000).toFixed(1);
  return `pool: AC-11 sources made in ${secs(made)} s; 2-minute 1080p exports ${times.map(secs).join(', ')} s; all in ${secs(performance.now() - t0)} s`;
}
