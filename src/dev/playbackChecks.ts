/*
 * Development only: the video editor's playback on the decoder pool, measured on the real editor (VideoWorkspace,
 * mounted in StrictMode on the dev server as `npm run dev` runs it) with frame-coded clips (each frame's colour names
 * it: videoChecks.ts codeColour). 204 T032: the quick checks (AC-12's release, AC-13) run in `npm test`; the real-time
 * ones (AC-5, AC-7, AC-12's bounds) run on demand with `CHITTHI_TEST_ONLY=pooltiming npm test` (minutes of playback).
 */
import { codeColour, makeTestClip } from './videoChecks';

type Check = (ok: unknown, what: string) => void;
const FPS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const pct = (xs: number[], p: number) =>
  xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? NaN;

/** codeColour repeats every 180 frames (6 s at 30 fps): frame numbers are compared modulo this. */
const PERIOD = 180;

/** The coded frame a colour shows (its index modulo PERIOD), or -1 (black, a photo, something else). */
function frameOf(c: number[] | null): number {
  if (!c) return -1;
  for (let i = 0; i < PERIOD; i++) {
    const w = codeColour(i);
    if (w.every((v, k) => Math.abs(v - c[k]) <= 10)) return i;
  }
  return -1;
}

/** The real editor in StrictMode, full window, with helpers to add clips, read the stage and clean up. */
async function mountEditor() {
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { VideoWorkspace } = await import('../components/studio/VideoWorkspace');
  const v = await import('../state/video');
  const pf = await import('../components/studio/previewFrame');
  const { openFrames } = await import('../engine/frameSource');
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
  await sleep(300);
  const centre = (): number[] | null => {
    const c = host.querySelector<HTMLCanvasElement>('canvas.mst-canvas');
    const x = c?.getContext('2d', { willReadFrequently: true });
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
  const clear = () => {
    v.setPlaying(false);
    for (const c of [...v.getVideo().clips]) v.removeClip(c.id);
  };
  clear();
  // No fade to black at the end (the vlog default): it would dim the coded colours of the last half second.
  v.setVideoOptions({ fadeOut: false });
  const add = async (blobs: Blob[]) => {
    const before = new Set(v.getVideo().clips.map((c) => c.id));
    await v.addMedia(blobs.map((blob, i) => ({ name: `coded-${i}.mp4`, blob, type: 'video/mp4' })));
    return v.getVideo().clips.filter((c) => !before.has(c.id));
  };
  const stage = () => [...pf.liveStages][0];
  const waitFor = async (ok: () => boolean, ms: number) => {
    const end = performance.now() + ms;
    while (!ok() && performance.now() < end) await sleep(16);
    return ok();
  };
  return {
    v,
    host,
    centre,
    add,
    clear,
    stage,
    openFrames,
    waitFor,
    unmount() {
      clear();
      root.unmount();
      host.remove();
    },
  };
}

/** AC-12 (release) and AC-13, in npm test. */
export async function playbackChecks(check: Check): Promise<string[]> {
  const notes: string[] = [];
  const clip = await makeTestClip(4, 1920, 1080, 2, false, true);
  if (!clip) return ['playback: skipped (no H.264 encoder)'];
  const ed = await mountEditor();
  try {
    const [c] = await ed.add([clip]);
    // AC-13: paused away from a cut, then after playing and pausing: no decoding for 2 s, one frame held.
    for (const when of ['paused', 'after playing']) {
      if (when === 'after playing') {
        ed.v.setPlayhead(0.5);
        ed.v.setPlaying(true);
        // npm test's window is hidden, where Chromium runs animation frames about once a second: do what the stage's
        // playback ticks do (peek at the playing time) so the pool really plays before the pause.
        const pool = ed.stage()?.pool;
        const { poolClip } = await import('../components/studio/previewFrame');
        for (let k = 0; k < 24 && pool; k++) {
          pool.peek(poolClip(c), c.in + 0.5 + k / FPS);
          await sleep(33);
        }
        ed.v.setPlaying(false);
      }
      ed.v.setPlayhead(c.start + 1.5);
      await ed.waitFor(() => frameOf(ed.centre()) === 45, 3000);
      await sleep(400);
      const made = ed.openFrames().made,
        held = ed.openFrames().frames;
      await sleep(2000);
      const o = ed.openFrames();
      check(
        o.made === made && o.frames <= 1,
        `playback: idle for 2 s ${when}: no frame decoded (${o.made - made}), at most one held (${o.frames}; ${held} at the start) (AC-13)`,
      );
    }
    // AC-12: removing the clip gives its decoder and frames back within 1 s.
    ed.v.removeClip(c.id);
    const freed = await ed.waitFor(() => {
      const o = ed.openFrames();
      return !o.frames && !o.decoders;
    }, 1000);
    check(
      freed,
      `playback: removing a clip frees its frames and decoder within 1 s (${JSON.stringify(ed.openFrames())}) (AC-12)`,
    );
    await ed.add([clip]);
    ed.v.setPlayhead(1);
    await ed.waitFor(() => frameOf(ed.centre()) === 30, 3000);
  } finally {
    ed.unmount();
  }
  // AC-12: leaving the editor frees everything within 1 s.
  const end = performance.now() + 1000;
  const { openFrames } = await import('../engine/frameSource');
  const { liveStages } = await import('../components/studio/previewFrame');
  while ((openFrames().frames || openFrames().decoders || liveStages.size) && performance.now() < end) await sleep(20);
  check(
    !openFrames().frames && !openFrames().decoders && !liveStages.size,
    `playback: leaving the editor frees every frame and decoder within 1 s (${JSON.stringify(openFrames())}, stages ${liveStages.size}) (AC-12)`,
  );
  notes.push('playback: AC-12 release and AC-13 on the real editor (StrictMode)');
  return notes;
}

/** AC-5, AC-7 and AC-12's bounds, on demand (CHITTHI_TEST_ONLY=pooltiming). */
export async function playbackTiming(check: Check): Promise<string[]> {
  const notes: string[] = [];
  const t0 = performance.now();
  const [a, b] = await Promise.all([0, 1].map(() => makeTestClip(2, 1920, 1080, 2, false, true)));
  const long = await makeTestClip(10, 1920, 1080, 2, false, true);
  const short = await Promise.all([0, 1, 2].map(() => makeTestClip(0.5, 1920, 1080, 2, false, true)));
  if (!a || !b || !long || short.some((s) => !s)) return ['pool timing: skipped (no H.264 encoder)'];
  notes.push(`pool timing: fixtures made in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  const ed = await mountEditor();
  try {
    // AC-5: 20 × 2 s 1080p clips played in real time, 3 runs: each cut draws the new clip's first frame on the cut's frame.
    const clips = await ed.add(Array.from({ length: 20 }, (_, i) => (i % 2 ? b : a)));
    const cuts = clips.slice(1).map((c) => c.start);
    const runs: string[] = [];
    let allGood = true;
    for (let run = 0; run < 3; run++) {
      ed.v.setPlayhead(0);
      await sleep(500);
      const holds0 = ed.stage()?.pool?.stats().holds ?? 0;
      const samples: { t: number; f: number }[] = [];
      ed.v.setPlaying(true);
      while (ed.v.getVideo().playing) {
        await frame();
        samples.push({ t: ed.v.getVideo().t, f: frameOf(ed.centre()) });
      }
      const holds = (ed.stage()?.pool?.stats().holds ?? 0) - holds0;
      const want = (t: number) => {
        const c = [...clips].reverse().find((x) => t >= x.start - 1e-6) ?? clips[0];
        return Math.min(59, Math.floor((t - c.start) * FPS + 1e-6));
      };
      const late = cuts.filter((cut) => {
        const s = samples.find((x) => x.t >= cut);
        return !s || s.f !== want(s.t);
      }).length;
      const lagging = samples.filter((s) => s.f >= 0 && want(s.t) - s.f > 1 && s.t > 0.05);
      const lag = lagging.length;
      const unreadable = samples.filter((s) => s.f < 0 && s.t > 0.05);
      const detail =
        lag || unreadable.length
          ? ` [behind ${lagging.slice(0, 6).map((s) => `${s.t.toFixed(3)}:${s.f}/${want(s.t)}`).join(' ')}; unreadable at ${unreadable.slice(0, 6).map((s) => s.t.toFixed(3)).join(' ')}]`
          : '';
      const black = unreadable.length;
      allGood &&= late === 0 && black === 0 && lag === 0;
      runs.push(
        `run ${run + 1}: ${cuts.length - late}/${cuts.length} cuts on time, ${black} unreadable, ${lag} frames over 1 behind, ${holds} holds, ${samples.length} frames${detail}`,
      );
    }
    check(
      allGood,
      `pool timing: 20 × 2 s 1080p clips play through every cut on the cut's frame, nothing black, no hold over 1 frame (AC-5): ${runs.join('; ')}`,
    );
    notes.push(`pool timing AC-5: ${runs.join('; ')}`);
    ed.clear();

    // AC-7: 50 random seeks on a 10 s 1080p clip with key frames 2 s apart: the exact frame, median ≤ 100 ms, p95 ≤ 250 ms.
    const [lc] = await ed.add([long]);
    ed.v.setPlayhead(0.2);
    await ed.waitFor(() => frameOf(ed.centre()) === 6, 3000);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
    const times: number[] = [];
    let missed = 0;
    for (let i = 0; i < 50; i++) {
      const t = lc.start + rnd() * 9.9;
      const wantF = Math.floor((t - lc.start) * FPS + 1e-6);
      const s0 = performance.now();
      ed.v.setPlayhead(t);
      if (await ed.waitFor(() => frameOf(ed.centre()) === wantF % PERIOD, 2000)) times.push(performance.now() - s0);
      else missed++;
    }
    // Latest wins: five seeks at once; the last one is what stays.
    const burst = [1.1, 8.2, 3.3, 6.4, 2.5].map((x) => lc.start + x);
    for (const t of burst) ed.v.setPlayhead(t);
    await sleep(1200);
    const last = frameOf(ed.centre()) === Math.floor(2.5 * FPS + 1e-6) % PERIOD;
    const med = median(times),
      p95 = pct(times, 0.95);
    check(
      !missed && med <= 100 && p95 <= 250 && last,
      `pool timing: 50 random seeks show the exact frame, median ${med.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (≤ 100 / 250), ${missed} missed; after 5 fast seeks the last one shows: ${last} (AC-7)`,
    );
    notes.push(
      `pool timing AC-7: median ${med.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, max ${Math.max(...times).toFixed(0)} ms`,
    );
    ed.clear();

    // AC-12: 60 × 0.5 s 1080p clips played twice and scrubbed 100 times: decoders, frames and bytes within the limits.
    await ed.add(Array.from({ length: 60 }, (_, i) => short[i % 3]!));
    const st = ed.stage();
    const lim = st?.limits;
    let maxDec = 0,
      maxFrames = 0,
      maxBytes = 0,
      maxPoolDec = 0;
    const sample = () => {
      const o = ed.openFrames();
      maxDec = Math.max(maxDec, o.decoders);
      maxFrames = Math.max(maxFrames, o.frames);
      maxBytes = Math.max(maxBytes, o.bytes);
      maxPoolDec = Math.max(maxPoolDec, st?.pool?.stats().decoders ?? 0);
    };
    for (let pass = 0; pass < 2; pass++) {
      ed.v.setPlayhead(0);
      ed.v.setPlaying(true);
      while (ed.v.getVideo().playing) {
        await frame();
        sample();
      }
    }
    const total = ed.v.getVideo().clips.reduce((x, c) => Math.max(x, c.start + (c.out - c.in)), 0);
    for (let i = 0; i < 100; i++) {
      ed.v.setPlayhead(rnd() * total);
      await frame();
      sample();
      await sleep(20);
      sample();
    }
    const ok =
      !!lim &&
      maxPoolDec <= lim.decoders &&
      maxDec <= lim.decoders &&
      maxBytes <= lim.bytes &&
      maxFrames <= lim.decoders * (lim.ahead + 1);
    check(
      ok,
      `pool timing: 60 clips played twice and scrubbed 100 times stay within the limits: decoders ${maxPoolDec} (readers ${maxDec}) ≤ ${lim?.decoders}, frames ${maxFrames}, ${(maxBytes / 2 ** 20).toFixed(0)} MB ≤ ${((lim?.bytes ?? 0) / 2 ** 20).toFixed(0)} MB (AC-12)`,
    );
    notes.push(
      `pool timing AC-12: max decoders ${maxPoolDec}, readers ${maxDec}, frames ${maxFrames}, ${(maxBytes / 2 ** 20).toFixed(0)} MB`,
    );
  } finally {
    ed.unmount();
  }
  return notes;
}
