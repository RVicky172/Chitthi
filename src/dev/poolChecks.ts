/*
 * Development only: the decoder pool's self-test checks on the real decoder (specs/features/204-decoder-pool). Test
 * clips are made in memory (videoChecks.ts makeTestClip: a flat colour per frame that tells its source time).
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { clipColour, codeColour, decodedColours, makeTestClip, testPhoto } from './videoChecks';
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
export function within<T>(p: Promise<T>, what: string, ms = 5000): Promise<T> {
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
  await group(check, 'preview AC-4', async () => {
    notes.push(await pausedPreviewIsExport(check));
  });
  await group(check, 'the editor stage', async () => {
    notes.push(await editorStageShowsVideo(check));
  });
  await group(check, 'fallback AC-14', async () => {
    notes.push(await fallbackOnTheEditor(check));
  });
  await group(check, 'stage stacks (203)', async () => {
    notes.push(await stageDrawsStacks(check));
  });
  await group(check, 'the editor stage overlay (203)', async () => {
    notes.push(await editorStageShowsOverlay(check));
  });
  return notes;
}

/**
 * 203 §5 on the stage's own paused path (previewFrame.ts: pausedFrame with the stage's source, then drawPreview), on
 * the AC-6 overlay fixture at 9:16 and 16:9 at its 8 times:
 * - every item of a paused stack has its picture when the frame resolves (they resolve together), and the drawn frame
 *   matches the colour-code reference (each clip's box, rotation, corners, opacity) as renderStack's golden frames do;
 * - two asks in a row: the newer one is complete (latest wins per lane) and the older one still resolves;
 * - the held picture is per clip (withHeld): an overlay arriving keeps the main clip's picture, the new clips wait.
 */
async function stageDrawsStacks(check: Check): Promise<string> {
  const { compareWithReference, makeOverlayProject } = await import('./videoChecks');
  const { drawPreview, pausedAt, pausedFrame, stageSource, withHeld } = await import('../components/studio/previewFrame');
  const { projectLength } = await import('../engine/timeline');
  let compared = 0;
  for (const format of ['9:16', '16:9'] as const) {
    const fx = await makeOverlayProject(format);
    if (!fx) return 'pool: 203 stage stacks skipped (no H.264 encoder)';
    const { width: W, height: H, fps } = fx;
    const urls: string[] = [];
    const project = {
      ...fx.project,
      clips: fx.project.clips.map((c) => {
        const url = URL.createObjectURL(c.file);
        urls.push(url);
        return { ...c, url };
      }),
    };
    const total = projectLength(project);
    const x = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    x.canvas.width = W;
    x.canvas.height = H;
    const stage = stageSource();
    const bad: string[] = [];
    try {
      for (const t of fx.times) {
        const frame = await within(pausedFrame(project, t, fps, stage.source), `203 stage at ${t.toFixed(3)} s`);
        const missing = frame.items.filter((it) => !it.pic).map((it) => it.clip.id);
        if (missing.length) bad.push(`no picture for ${missing.join(', ')} at frame ${Math.round(t * fps)}`);
        drawPreview(x, W, H, { layers: [], total, fadeOut: false }, frame);
        const ref = frame.items.map((it) => ({ tf: fx.clips.find((c) => c.id === it.clip.id)!.tf, rgb: fx.colourAt(it.clip.id, frame.at)! }));
        const r = compareWithReference(x.getImageData(0, 0, W, H).data, W, H, ref);
        compared++;
        if (r.max > 8 || r.mean > 2 || r.n < W * H * 0.95)
          bad.push(`frame ${Math.round(t * fps)}: worst ${r.max.toFixed(0)} at ${r.where}, mean ${r.mean.toFixed(2)}`);
      }
      check(!bad.length, `pool: the paused stage draws the ${format} overlay stack as the golden reference at 8 times${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`);

      // Latest wins: frame 37 (m1, B-roll, face-cam) then frame 59 at once; the newer has every picture.
      const [older, newer] = await within(
        Promise.all([37, 59].map((k) => pausedFrame(project, k / fps, fps, stage.source))),
        '203 two asks in a row',
      );
      check(
        newer.items.length === 3 && newer.items.every((it) => it.pic) && older.items.length === 3,
        `pool: of two paused asks in a row (${format}) the newer has all 3 pictures and the older resolves (newer ${newer.items.filter((it) => it.pic).length} of ${newer.items.length})`,
      );

      // Held per clip: frame 12 shows m1 alone; at frame 37 the B-roll and face-cam arrive, m1 keeps its picture.
      const before = await within(pausedFrame(project, 12 / fps, fps, stage.source), '203 frame 12');
      const { at, items } = pausedAt(project, 37 / fps, fps);
      const held = withHeld(at, items, before, () => null, (c) => c.kind === 'video');
      const m1 = held.items.find((it) => it.clip.id === 'm1');
      check(
        held.items.length === 3 && !!m1?.pic && m1.pic === before.items[0]?.pic && held.items.filter((it) => it.pic).length === 1,
        `pool: the held picture is per clip: an overlay arriving keeps the main clip's picture (${format})`,
      );
    } finally {
      stage.dispose();
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
  }
  return `pool: 203 stage compared ${compared} paused stacks with the golden reference`;
}

/**
 * 203 on the real editor (StrictMode, as `npm run dev`): a frame-coded main clip and, on a new overlay track, a clip
 * with its own code placed top-right by the preset. Paused, the stage shows the overlay inside its box and the main
 * clip outside it.
 */
async function editorStageShowsOverlay(check: Check): Promise<string> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('../components/studio/VideoWorkspace');
  const v = await import('../state/video');
  const [mainBlob, overBlob] = await Promise.all([makeTestClip(4, 640, 360, 1, false, true), makeTestClip(4, 320, 240, 1, false, 3)]);
  if (!mainBlob || !overBlob) return 'pool: overlay stage check skipped (no H.264 encoder)';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.append(host);
  const root = createRoot(host);
  root.render(React.createElement(React.StrictMode, null, React.createElement(VideoWorkspace, { mode: 'vlog', onMode: () => undefined })));
  /** The mean colour of an 8 × 8 patch at (fx, fy), shares of the stage canvas. */
  const at = (fx: number, fy: number) => {
    const c = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const x = c?.getContext('2d');
    if (!c || !x || !c.width) return null;
    const d = x.getImageData(Math.floor(c.width * fx) - 4, Math.floor(c.height * fy) - 4, 8, 8).data;
    const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k];
    return s.map((n) => n / 64);
  };
  const near = (a: number[] | null, want: readonly number[]) => !!a && want.every((w, k) => Math.abs(w - a[k]) <= 8);
  const waitFor = async (ok: () => boolean, ms: number) => {
    const end = performance.now() + ms;
    while (!ok() && performance.now() < end) await new Promise((r) => setTimeout(r, 50));
    return ok();
  };
  const tracksBefore = new Set(v.getVideo().tracks.map((t) => t.id));
  let ids: string[] = [];
  try {
    await new Promise((r) => setTimeout(r, 300));
    const before = new Set(v.getVideo().clips.map((c) => c.id));
    await v.addMedia([{ name: 'main.mp4', blob: mainBlob, type: 'video/mp4' }]);
    const main = v.getVideo().clips.find((c) => !before.has(c.id));
    if (!main) throw new Error('the main clip was not added');
    await v.addMedia([{ name: 'over.mp4', blob: overBlob, type: 'video/mp4' }], { track: v.NEW_TRACK, at: main.start });
    ids = v
      .getVideo()
      .clips.filter((c) => !before.has(c.id))
      .map((c) => c.id);
    const over = v.getVideo().clips.find((c) => ids.includes(c.id) && c.id !== main.id);
    if (!over) throw new Error('the overlay clip was not added');
    const why = v.applyPreset(over.id, 'top-right');
    if (why) throw new Error(why);
    const tf = v.getVideo().clips.find((c) => c.id === over.id)!.tf!;
    const t = main.start + 0.5;
    v.setPlayhead(t);
    const wantMain = codeColour(Math.floor((t - main.start + main.in) * FPS + 1e-6));
    const wantOver = codeColour(Math.floor((t - over.start + over.in) * FPS + 1e-6), 3);
    const ok = await waitFor(() => near(at(tf.x, tf.y), wantOver) && near(at(0.25, 0.8), wantMain), 5000);
    check(
      ok,
      `pool: the editor (StrictMode) shows an overlay clip in its top-right box over the main clip (box ${at(tf.x, tf.y)
        ?.map(Math.round)
        .join('/')}, want ${wantOver.join('/')}; outside ${at(0.25, 0.8)?.map(Math.round).join('/')}, want ${wantMain.join('/')})`,
    );
  } finally {
    v.setPlaying(false);
    for (const id of ids) v.removeClip(id);
    for (const tr of v.getVideo().tracks) if (!tracksBefore.has(tr.id)) v.deleteTrack(tr.id);
    root.unmount();
    host.remove();
  }
  return 'pool: the editor stage (StrictMode) shows an overlay clip';
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

/**
 * AC-4 (204): paused, the stage shows the frame the export encodes. Six frame-coded video clips (each frame's colour
 * names it) with lengths off the frame grid, at 9:16 and 16:9, paused at 20 playhead times off the grid: the stage's
 * own paused path (previewFrame.ts: pausedFrame with the stage's source, then drawPreview) and the decoded export frame
 * for that time (frame floor(t * fps)) must match within ±8 in the middle.
 */
async function pausedPreviewIsExport(check: Check): Promise<string> {
  const { encodeVideo } = await import('../engine/videoExport');
  const { MAIN_VIDEO, defaultTracks, pack, projectLength } = await import('../engine/timeline');
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const { drawPreview, pausedFrame, stageSource } = await import('../components/studio/previewFrame');
  const files = (await Promise.all([0, 1].map(() => makeTestClip(4, 640, 360, 2, false, true)))).filter(
    (f): f is Blob => !!f,
  );
  if (files.length < 2) return 'pool: AC-4 skipped (no H.264 encoder)';
  const urls = files.map((f) => URL.createObjectURL(f));
  const lengths = [1.37, 0.9, 1.53, 1.11, 0.77, 1.29],
    ins = [0.2, 1.1, 0.5, 1.9, 0.33, 0.7];
  const clips = pack(
    lengths.map((len, i) => ({
      id: `p${i}`,
      track: MAIN_VIDEO,
      start: 0,
      kind: 'video' as const,
      dur: 0,
      in: ins[i],
      out: ins[i] + len,
      edit: { ...DEFAULT_EDIT },
      motion: 'none' as const,
      fade: false,
      file: files[i % 2],
      url: urls[i % 2],
      volume: 0,
    })),
  );
  const project = { tracks: defaultTracks(), clips, audio: [], layers: [], fadeOut: false };
  const total = projectLength(project);
  const times = Array.from({ length: 20 }, (_, k) => ((k + 0.37) * total) / 20);
  const bad: string[] = [];
  let compared = 0;
  try {
    for (const [ratio, W, H] of [
      ['9:16', 270, 480],
      ['16:9', 480, 270],
    ] as const) {
      const mp4 = await encodeVideo({
        ...project,
        audio: [],
        width: W,
        height: H,
        fps: FPS,
        bitrate: 4e6,
        sink: { kind: 'memory' },
      });
      if (!mp4) throw new Error('no export');
      const exported = await decodedColours(
        mp4,
        times.map((t) => (Math.floor(t * FPS + 1e-6) + 0.5) / FPS),
      );
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const x = canvas.getContext('2d', { willReadFrequently: true })!;
      const stage = stageSource();
      try {
        for (const [k, t] of times.entries()) {
          const frame = await within(pausedFrame(project, t, FPS, stage.source), `AC-4 preview at ${t.toFixed(3)} s`);
          drawPreview(x, W, H, { layers: [], total, fadeOut: false }, frame);
          const shown = mean16(x, W, H),
            want = exported[k];
          compared++;
          if (!want || !shown.every((v, ch) => Math.abs(v - want[ch]) <= 8))
            bad.push(
              `${ratio} at ${t.toFixed(3)} s: preview ${shown.map(Math.round).join('/')}, export ${want?.map(Math.round).join('/')}`,
            );
        }
      } finally {
        stage.dispose();
      }
    }
  } finally {
    urls.forEach((u) => URL.revokeObjectURL(u));
  }
  check(
    !bad.length,
    `pool: the paused preview shows the export's frame at 20 times, 9:16 and 16:9 (${compared - bad.length} of ${compared} match)${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`,
  );
  return `pool: AC-4 compared ${compared} paused frames with the export`;
}

/**
 * The real video editor, mounted in StrictMode on the dev server as `npm run dev` runs it (StrictMode runs effects
 * twice): a video clip added with the store's own addMedia shows on the stage, paused at its exact frame and moving
 * while playing. (204 T031: a source kept in useMemo was disposed by StrictMode's second run and the stage stayed black;
 * only development showed it.)
 */
async function editorStageShowsVideo(check: Check): Promise<string> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('../components/studio/VideoWorkspace');
  const v = await import('../state/video');
  // 6 s, so playback is still running after a few of the hidden window's slow ticks (below).
  const clip = await makeTestClip(6, 640, 360, 1, false, true);
  if (!clip) return 'pool: stage check skipped (no H.264 encoder)';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VideoWorkspace, { mode: 'vlog', onMode: () => undefined }),
    ),
  );
  const centre = () => {
    const c = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const x = c?.getContext('2d');
    if (!c || !x || !c.width) return null;
    const d = x.getImageData(Math.floor(c.width / 2) - 4, Math.floor(c.height / 2) - 4, 8, 8).data;
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    return [r / 64, g / 64, b / 64];
  };
  const near = (a: number[] | null, want: number[]) => !!a && want.every((w, k) => Math.abs(w - a[k]) <= 8);
  const frameOf = (a: number[] | null) =>
    a ? (Array.from({ length: 180 }, (_, i) => i).find((i) => near(a, codeColour(i))) ?? -1) : -1;
  const waitFor = async (ok: () => boolean, ms: number) => {
    const end = performance.now() + ms;
    while (!ok() && performance.now() < end) await new Promise((r) => setTimeout(r, 50));
    return ok();
  };
  let ids: string[] = [];
  try {
    await new Promise((r) => setTimeout(r, 300));
    const before = new Set(v.getVideo().clips.map((c) => c.id));
    await v.addMedia([{ name: 'coded.mp4', blob: clip, type: 'video/mp4' }]);
    ids = v
      .getVideo()
      .clips.filter((c) => !before.has(c.id))
      .map((c) => c.id);
    const added = v.getVideo().clips.find((c) => ids.includes(c.id));
    if (!added) throw new Error('the clip was not added');
    const t = added.start + 0.5;
    v.setPlayhead(t);
    const want = codeColour(Math.floor((t - added.start + added.in) * FPS + 1e-6));
    const paused = await waitFor(() => near(centre(), want), 5000);
    const seen = centre();
    check(
      paused,
      `pool: the editor (StrictMode) shows an added video clip's exact frame paused (centre ${seen?.map(Math.round).join('/')}, want ${want.join('/')})`,
    );
    // npm test's window is hidden, where Chromium runs animation frames (the stage's playback ticks) about once a
    // second. A tick draws the frame the pool has ready for its time and holds the last one otherwise; ticks a second
    // apart always find the pool's reader a second behind, so the picture would stay put. Between ticks this asks the
    // pool for the playing time at 30 fps, as a shown window's ticks do (AC-5 in CHITTHI_TEST_ONLY=pooltiming plays in
    // one). Until 204 T034 the clip's <video>, playing for its sound, redrew the stage on its seek events, which hid this.
    const { liveStages, poolClip } = await import('../components/studio/previewFrame');
    const pool = [...liveStages][0]?.pool;
    const startWall = performance.now();
    let feeding = true;
    void (async () => {
      while (feeding && pool) {
        pool.peek(poolClip(added), added.in + 0.5 + (performance.now() - startWall) / 1000);
        await new Promise((r) => setTimeout(r, 33));
      }
    })();
    v.setPlaying(true);
    const moved = await waitFor(() => v.getVideo().playing && frameOf(centre()) > 15, 5000);
    feeding = false;
    const playing = frameOf(centre()),
      at = v.getVideo().t - added.start;
    v.setPlaying(false);
    check(
      moved,
      `pool: the editor (StrictMode) shows the video moving while it plays (frame ${playing} at ${at.toFixed(2)} s, from frame 15)`,
    );
  } finally {
    v.setPlaying(false);
    for (const id of ids) v.removeClip(id);
    root.unmount();
    host.remove();
  }
  return 'pool: the editor stage (StrictMode) shows and plays an added clip';
}

/** The note a clip the pool can't decode carries (the app writes ’; either apostrophe passes), with its reason. */
const NOTE = /This clip can[’']t be exported here: \S/;

/**
 * AC-14 (204 §7, Q6) on the real editor (StrictMode, as `npm run dev`): two copies of a frame-coded clip, one refused
 * by the decoder's source as if its codec couldn't be decoded (frameSource.ts `undecodableForTests`: what an HEVC
 * file the browser can play but WebCodecs can't decode meets). The refused clip previews from its <video>, the other
 * from the pool; the refused one carries the note (timeline title and accessible name, inspector), the preview logs
 * it, and the export refuses it naming the file.
 */
async function fallbackOnTheEditor(check: Check): Promise<string> {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('../components/studio/VideoWorkspace');
  const { liveStages } = await import('../components/studio/previewFrame');
  const v = await import('../state/video');
  const { undecodableForTests, openFrames } = await import('../engine/frameSource');
  const { recentErrors } = await import('../lib/errors');
  const { encodeVideo, ExportError } = await import('../engine/videoExport');
  const blob = await makeTestClip(2, 640, 360, 1, false, true);
  if (!blob) return 'pool: fallback check skipped (no H.264 encoder)';
  // Two files with the same frames: the source refuses the first, as it would an HEVC file the browser can play.
  const bad = new File([blob], 'cant-decode-here.mp4', { type: 'video/mp4' });
  const good = new File([blob], 'decodes-fine.mp4', { type: 'video/mp4' });
  undecodableForTests.add(bad);
  const since = new Date().toISOString();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(VideoWorkspace, { mode: 'vlog', onMode: () => undefined }),
    ),
  );
  const centre = () => {
    const c = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const x = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !x || !c.width) return null;
    const d = x.getImageData(Math.floor(c.width / 2) - 4, Math.floor(c.height / 2) - 4, 8, 8).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
    return sum.map((s) => s / 64);
  };
  // The coded frame on the stage (codeColour, ±10), or -1.
  const shown = () => {
    const a = centre();
    return a
      ? (Array.from({ length: 60 }, (_, i) => i).find((i) => codeColour(i).every((w, k) => Math.abs(w - a[k]) <= 10)) ?? -1)
      : -1;
  };
  const waitFor = async (ok: () => boolean, ms: number) => {
    const end = performance.now() + ms;
    while (!ok() && performance.now() < end) await new Promise((r) => setTimeout(r, 16));
    return ok();
  };
  let ids: string[] = [];
  try {
    await new Promise((r) => setTimeout(r, 300));
    v.setVideoOptions({ fadeOut: false });
    const before = new Set(v.getVideo().clips.map((c) => c.id));
    await v.addMedia([bad, good].map((f) => ({ name: f.name, blob: f, type: f.type })));
    const added = v.getVideo().clips.filter((c) => !before.has(c.id));
    ids = added.map((c) => c.id);
    const cb = added.find((c) => c.file === bad),
      cg = added.find((c) => c.file === good);
    if (!cb || !cg) throw new Error(`both clips added (${added.map((c) => c.name).join(', ')})`);

    // The refused clip from its <video> (frame 30, mid-frame so a <video> seek can't land a frame off), the other
    // from the pool (frame 15, with frames decoded by the pool).
    v.setPlayhead(cb.start + 30.5 / FPS);
    const badShown = await waitFor(() => shown() === 30, 5000);
    const pool = [...liveStages][0]?.pool;
    const reason = pool?.fallback(cb.id) ?? null;
    check(
      badShown && !!reason,
      `pool: a clip the pool can't decode previews from its <video> (frame ${shown()}, want 30; the pool's reason: ${reason}) (AC-14)`,
    );
    const made = openFrames().made;
    v.setPlayhead(cg.start + 15.5 / FPS);
    const goodShown = await waitFor(() => shown() === 15, 5000);
    check(
      goodShown && !!pool && pool.fallback(cg.id) === null && openFrames().made > made,
      `pool: the other clip still previews from the pool (frame ${shown()}, want 15; ${openFrames().made - made} frames decoded; its fallback: ${pool?.fallback(cg.id)}) (AC-14)`,
    );

    // The note: on the timeline clip (title and accessible name) and in the inspector; the other clip has none.
    v.selectClip(cb.id);
    await waitFor(() => NOTE.test(host.querySelector('aside.mst-inspector')?.textContent ?? ''), 1000);
    const block = (name: string) =>
      [...host.querySelectorAll<HTMLElement>('.tl-clip')].find((el) => el.title.startsWith(name));
    const label = (el?: HTMLElement) => el?.querySelector('button.vh')?.getAttribute('aria-label') ?? '';
    const bb = block(bad.name),
      gb = block(good.name);
    const inspector = host.querySelector('aside.mst-inspector')?.textContent ?? '';
    check(
      !!bb && NOTE.test(bb.title) && NOTE.test(label(bb)),
      `pool: the clip says "This clip can’t be exported here: <reason>" in its timeline title and accessible name (title "${bb?.title}", name "${label(bb)}") (AC-14)`,
    );
    check(
      NOTE.test(inspector),
      `pool: the inspector says the selected clip can’t be exported here, with the reason ("${inspector.slice(0, 160)}") (AC-14)`,
    );
    check(
      !!gb && !NOTE.test(gb.title) && !NOTE.test(label(gb)),
      `pool: a clip the pool decodes has no such note (title "${gb?.title}", name "${label(gb)}") (AC-14)`,
    );

    // Logged for reports by the preview (the export below hasn't run yet).
    const logged = recentErrors().filter(
      (e) => e.when >= since && e.source === 'handled' && e.message.includes(bad.name),
    );
    check(
      logged.length > 0,
      `pool: the preview logs the clip it can't decode with logError('handled') (${logged.length} entries naming ${bad.name}) (AC-14)`,
    );

    // The export refuses it with today's message, naming the file.
    let refusal: unknown = null;
    try {
      await encodeVideo({
        ...v.projectOf(v.getVideo()),
        audio: [],
        width: 640,
        height: 360,
        fps: FPS,
        bitrate: 2e6,
        sink: { kind: 'memory' },
      });
    } catch (e) {
      refusal = e;
    }
    check(
      refusal instanceof ExportError && refusal.message.includes(bad.name),
      `pool: the export refuses the clip, naming the file (${refusal instanceof Error ? `${refusal.constructor.name}: ${refusal.message}` : 'it exported'}) (AC-14)`,
    );
  } finally {
    undecodableForTests.delete(bad);
    v.setPlaying(false);
    for (const id of ids) v.removeClip(id);
    root.unmount();
    host.remove();
  }
  return 'pool: AC-14 on the editor (StrictMode), one clip refused by the decoder';
}
