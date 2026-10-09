/*
 * Development only: the video editor's self-test checks (specs/features/201-track-model). Test clips are made here, in
 * memory, with Mediabunny (the export's own encoder), so no video file lives in the repository.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeVideo,
} from 'mediabunny';

type Check = (ok: unknown, what: string) => void;

/** The colour of a test clip at time t: red rises and blue falls over its length, so a decoded frame tells its time. */
export const clipColour = (t: number, dur: number): [number, number, number] => {
  const k = Math.max(0, Math.min(1, t / dur));
  return [Math.round(40 + 180 * k), 120, Math.round(220 - 180 * k)];
};

/** A dur-second W×H H.264 MP4 at 30 fps, every frame one flat colour (clipColour). Null if this engine can't encode it. */
export async function makeTestClip(dur = 2, W = 320, H = 240): Promise<Blob | null> {
  if (!(await canEncodeVideo('avc', { width: W, height: H, bitrate: 1e6 }))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate: 1e6 }),
    keyFrameInterval: 1,
  });
  output.addVideoTrack(source, { frameRate: 30 });
  await output.start();
  const frames = Math.round(dur * 30);
  for (let i = 0; i < frames; i++) {
    const [r, g, b] = clipColour(i / 30, dur);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, W, H);
    await source.add(i / 30, 1 / 30);
  }
  source.close();
  await output.finalize();
  return target.buffer ? new Blob([target.buffer], { type: 'video/mp4' }) : null;
}

/** The mean colour of the frames of `file` at the given times around a point (shares of the frame; the middle by
 * default), decoded as the export decodes them. */
export async function decodedColours(
  file: Blob,
  times: number[],
  at: [number, number] = [0.5, 0.5],
): Promise<[number, number, number][]> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const sink = new CanvasSink(track, { poolSize: 1 });
    const out: [number, number, number][] = [];
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      const c = wc?.canvas as HTMLCanvasElement | OffscreenCanvas | undefined;
      const x = c?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!c || !x) {
        out.push([-1, -1, -1]);
        continue;
      }
      const px = Math.max(0, Math.min(c.width - 16, Math.round(c.width * at[0]) - 8)),
        py = Math.max(0, Math.min(c.height - 16, Math.round(c.height * at[1]) - 8));
      const d = x.getImageData(px, py, 16, 16).data;
      let r = 0,
        g = 0,
        b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      const n = d.length / 4;
      out.push([r / n, g / n, b / n]);
    }
    return out;
  } finally {
    input.dispose();
  }
}

/** A W×H JPEG photo for test clips: a gradient with a few shapes, different per index. */
async function testPhoto(i: number, W = 1600, H = 1067): Promise<{ blob: Blob; still: HTMLCanvasElement }> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, `hsl(${(i * 47) % 360} 60% 55%)`);
  g.addColorStop(1, `hsl(${(i * 47 + 120) % 360} 50% 30%)`);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.beginPath();
  x.arc(W * (0.2 + (i % 5) * 0.15), H * 0.4, H * 0.2, 0, Math.PI * 2);
  x.fill();
  const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.85));
  // The editor previews photos from a copy of at most 1080 px (state/video.ts PREVIEW_MAX).
  const k = 1080 / Math.max(W, H);
  const still = document.createElement('canvas');
  still.width = Math.round(W * k);
  still.height = Math.round(H * k);
  still.getContext('2d')!.drawImage(c, 0, 0, still.width, still.height);
  return { blob, still };
}

/** A mono 16-bit 48 kHz WAV tone, for music in export checks. */
function toneWav(seconds = 2, rate = 48000): Blob {
  const n = Math.round(seconds * rate),
    buf = new ArrayBuffer(44 + n * 2),
    v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 8000), true);
  return new Blob([buf], { type: 'audio/wav' });
}

/** Does an MP4 carry an AAC sound track? */
const hasSound = async (mp4: Blob) => new TextDecoder('latin1').decode(await mp4.arrayBuffer()).includes('mp4a');

/**
 * AC-3 and AC-9 (201). Pixel identity: for 2.x project shapes at 9:16, 4:5, 1:1 and 16:9 (with layers, fades, the
 * fade-out and music), the frame at 10 times drawn through the frozen 2.x placement (legacyTimeline / legacyClipAt)
 * and through the track model (videoAt) must be the same bytes. Then the hidden video track (black with the layers, in
 * the preview's renderFrame and in a decoded export) and the muted music track (no sound in the export).
 */
async function trackChecks(check: Check): Promise<string[]> {
  const { renderFrame, NO_PICTURE } = await import('../engine/video');
  const { legacyClipAt, legacyFixtures, legacyTimeline, legacyTotal } = await import('../engine/timeline.testkit');
  const { MAIN_VIDEO, MUSIC, audioPlan, defaultTracks, pack, projectLength, videoAt } =
    await import('../engine/timeline');
  const { newShape } = await import('../engine/layers');
  const { encodeVideo } = await import('../engine/videoExport');
  const notes: string[] = [];
  const photos = await Promise.all([0, 1, 2].map((i) => testPhoto(i, 640, 427)));
  const film = document.createElement('canvas');
  film.width = 320;
  film.height = 240;
  const fx = film.getContext('2d')!;
  fx.fillStyle = '#3a7bd5';
  fx.fillRect(0, 0, 320, 240);
  fx.fillStyle = '#ffd166';
  fx.fillRect(40, 60, 120, 90);
  // Each clip's picture: the same source for both paths (placement is what's compared, not decoding).
  const srcOf = (c: { kind: string; id: string }) =>
    c.kind === 'video' ? film : photos[[...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % photos.length].still;
  const canvas = (W: number, H: number) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c.getContext('2d', { willReadFrequently: true })!;
  };

  const fx2 = legacyFixtures();
  const shapes = {
    photoOnly: fx2.photoOnly,
    mixed: fx2.mixed,
    musicOffset: fx2.musicOffset,
    timedLayers: fx2.timedLayers,
    noFadeOut: fx2.noFadeOut,
  };
  const formats: [string, number, number][] = [
    ['9:16', 270, 480],
    ['4:5', 270, 338],
    ['1:1', 270, 270],
    ['16:9', 480, 270],
  ];
  let frames = 0;
  for (const [ratio, W, H] of formats) {
    const a = canvas(W, H),
      b = canvas(W, H);
    const bad: string[] = [];
    for (const [name, lp] of Object.entries(shapes)) {
      const tl = legacyTimeline(lp.clips),
        total = legacyTotal(lp.clips);
      const project = {
        tracks: defaultTracks(),
        clips: pack(lp.clips.map((c) => ({ ...c, track: MAIN_VIDEO, start: 0 }))),
        audio: [],
        layers: lp.layers,
        fadeOut: lp.fadeOut,
      };
      // 10 times: the cuts (and just before them), then evenly through the video.
      const cuts = tl.slice(1).flatMap((q) => [q.start, q.start - 1e-4]);
      const times = [...cuts.slice(0, 4), ...Array.from({ length: 10 }, (_, k) => (k / 9) * (total - 1e-3))].slice(
        0,
        10,
      );
      for (const t of times) {
        const l = legacyClipAt(tl, t)!;
        const s = l.clip.kind === 'video' ? film : srcOf(l.clip);
        renderFrame(a, W, H, l.clip, s, s.width, s.height, t - l.start, lp.layers, t, total, lp.fadeOut);
        const p = videoAt(project, t)!;
        const s2 = p.clip.kind === 'video' ? film : srcOf(p.clip);
        renderFrame(
          b,
          W,
          H,
          p.clip,
          s2,
          s2.width,
          s2.height,
          p.local,
          project.layers,
          t,
          projectLength(project),
          project.fadeOut,
        );
        const da = a.getImageData(0, 0, W, H).data,
          db = b.getImageData(0, 0, W, H).data;
        let diff = 0;
        for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) diff++;
        if (diff) bad.push(`${name} at ${t.toFixed(4)} s: ${diff} bytes`);
        frames++;
      }
    }
    check(
      !bad.length,
      `video: preview frames at ${ratio} are pixel-identical to 2.x (5 projects × 10 times)${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`,
    );
  }
  notes.push(`video: ${frames} frames compared with the 2.x placement, pixel for pixel`);

  // Hidden video track in the preview: black, with the layers on top.
  const red = { ...newShape('rect'), fill: '#ff0000', x: 0.5, y: 0.5, w: 0.3, h: 0.3 };
  const lp = fx2.mixed;
  const shown = {
    tracks: defaultTracks(),
    clips: pack(lp.clips.map((c) => ({ ...c, track: MAIN_VIDEO, start: 0 }))),
    audio: [],
    layers: [red],
    fadeOut: false,
  };
  const hidden = { ...shown, tracks: shown.tracks.map((tr) => (tr.id === MAIN_VIDEO ? { ...tr, hidden: true } : tr)) };
  const c = canvas(270, 480);
  const pick = (x: number, y: number) => [
    ...c.getImageData(Math.round(270 * x), Math.round(480 * y), 1, 1).data.slice(0, 3),
  ];
  const hp = videoAt(hidden, 4);
  renderFrame(c, 270, 480, hp?.clip ?? NO_PICTURE, null, 0, 0, 4, hidden.layers, 4, projectLength(hidden), false);
  const corner = pick(0.05, 0.05),
    middle = pick(0.5, 0.5);
  check(
    hp === null && corner.every((v) => v < 4) && middle[0] > 240 && middle[1] < 16 && middle[2] < 16,
    `video: a hidden video track draws black with the layers on top (corner ${corner.join('/')}, layer ${middle.join('/')})`,
  );

  // The export: hidden → black frames with the layers; muted music → no sound track; shown and heard otherwise.
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const shownEdit = { ...DEFAULT_EDIT };
  const job = (tracks: ReturnType<typeof defaultTracks>, music: boolean) => ({
    tracks,
    clips: pack(
      [0, 1].map((i) => ({
        id: `x${i}`,
        track: MAIN_VIDEO,
        start: 0,
        kind: 'photo' as const,
        dur: 0.5,
        in: 0,
        out: 0,
        edit: shownEdit,
        motion: 'none' as const,
        fade: false,
        file: photos[i].blob,
        volume: 0,
      })),
    ),
    audio: music
      ? [{ id: 'music', track: MUSIC, start: 0, in: 0, volume: 0.8, toEnd: true, srcDur: 2, file: toneWav() }]
      : [],
    layers: [red],
    width: 320,
    height: 320,
    fps: 30,
    bitrate: 1e6,
    fadeOut: false,
    sink: { kind: 'memory' as const },
  });
  const off = (field: 'hidden' | 'muted', id: string) =>
    defaultTracks().map((tr) => (tr.id === id ? { ...tr, [field]: true } : tr));
  const hiddenMp4 = (await encodeVideo(job(off('hidden', MAIN_VIDEO), false)))!;
  const [hc, hm] = [await decodedColours(hiddenMp4, [0.5], [0.08, 0.08]), await decodedColours(hiddenMp4, [0.5])];
  const shownMp4 = (await encodeVideo(job(defaultTracks(), false)))!;
  const [sc] = await decodedColours(shownMp4, [0.5], [0.08, 0.08]);
  check(
    hc[0]?.every((v) => v < 12) && hm[0]?.[0] > 200 && hm[0][1] < 50 && sc?.some((v) => v > 30),
    `video: an export with the video track hidden is black with the layers (corner ${hc[0]?.map(Math.round).join('/')}, layer ${hm[0]?.map(Math.round).join('/')}; shown corner ${sc?.map(Math.round).join('/')})`,
  );
  const heard = await encodeVideo(job(defaultTracks(), true)),
    muted = await encodeVideo(job(off('muted', MUSIC), true));
  const mutedPlan = audioPlan({ ...job(off('muted', MUSIC), true) });
  check(
    (await hasSound(heard!)) && !(await hasSound(muted!)) && mutedPlan.length === 0,
    'video: an export with the music track muted has no music (no sound track here: the photos have none); unmuted it has',
  );
  return notes;
}

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * AC-5's timing (201): a 60-clip 1080p YouTube project (0.4 s photos, every tenth clip a video), with the GPU path as
 * the app opens it. The preview: the frame at 300 times through the editor's own path (the clip at t, then
 * renderFrame); the export: the whole video encoded in memory. Median of 3 each.
 */
async function videoTiming(clip: Blob): Promise<string> {
  const { renderFrame } = await import('../engine/video');
  const { encodeVideo } = await import('../engine/videoExport');
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const { MAIN_VIDEO, defaultTracks, pack, projectLength, videoAt } = await import('../engine/timeline');
  const { openGpu, gpu } = await import('../engine/gpu/device');
  await openGpu();
  const W = 1920,
    H = 1080;
  const photos = await Promise.all(Array.from({ length: 6 }, (_, i) => testPhoto(i)));
  const frame = document.createElement('canvas');
  frame.width = 320;
  frame.height = 240;
  const decoded = (await decodedColours(clip, [0.2])).length ? frame : null;
  const clips = pack(
    Array.from({ length: 60 }, (_, i) => {
      const video = i % 10 === 9;
      const p = photos[i % photos.length];
      return {
        id: `c${i}`,
        track: MAIN_VIDEO,
        start: 0,
        kind: (video ? 'video' : 'photo') as 'photo' | 'video',
        dur: video ? 0 : 0.4,
        in: 0,
        out: video ? 0.4 : 0,
        edit: { ...DEFAULT_EDIT },
        motion: (video ? 'none' : 'zoom-in') as 'none' | 'zoom-in',
        fade: i % 7 === 0,
        file: video ? clip : p.blob,
        volume: 1,
        still: video ? decoded : p.still,
      };
    }),
  );
  const project = { tracks: defaultTracks(), clips, audio: [], layers: [], fadeOut: true };
  const total = projectLength(project);
  const ctx = (() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c.getContext('2d')!;
  })();
  const previewRuns: number[] = [];
  for (let run = 0; run < 3; run++) {
    const each: number[] = [];
    for (let k = 0; k < 300; k++) {
      const t = (k / 300) * total;
      const s0 = performance.now();
      const p = videoAt(project, t);
      if (p) {
        const src = p.clip.still;
        renderFrame(ctx, W, H, p.clip, src, src?.width ?? 0, src?.height ?? 0, p.local, [], t, total, true);
      }
      ctx.getImageData(0, 0, 1, 1);
      each.push(performance.now() - s0);
    }
    previewRuns.push(median(each));
  }
  const exportRuns: number[] = [];
  for (let run = 0; run < 3; run++) {
    const s0 = performance.now();
    await encodeVideo({
      tracks: defaultTracks(),
      clips,
      audio: [],
      layers: [],
      width: W,
      height: H,
      fps: 30,
      bitrate: 8e6,
      fadeOut: true,
      sink: { kind: 'memory' },
    });
    exportRuns.push(performance.now() - s0);
  }
  const backend = gpu()?.backend ?? 'Canvas 2D';
  // The fastest run is the steady number to compare (later runs in one session can be slower: GPU read-back, GC).
  return `video timing (60 clips, ${total.toFixed(1)} s at 1920×1080, ${backend}): preview frame median ${median(previewRuns).toFixed(1)} ms, fastest run ${Math.min(...previewRuns).toFixed(1)} ms (runs ${previewRuns.map((x) => x.toFixed(1)).join(', ')}); export median ${(median(exportRuns) / 1000).toFixed(2)} s, fastest ${(Math.min(...exportRuns) / 1000).toFixed(2)} s (runs ${exportRuns.map((x) => (x / 1000).toFixed(2)).join(', ')})`;
}

/** The video editor's checks. Returns notes for the report. */
export async function videoChecks(check: Check): Promise<string[]> {
  const notes: string[] = [];
  const t0 = performance.now();
  const clip = await makeTestClip();
  check(clip && clip.size > 1000, 'video: a test clip is made in memory');
  if (!clip) return ['video: this engine cannot encode H.264; video clip checks skipped'];
  const made = performance.now() - t0;
  const times = [0, 0.5, 1, 1.5, 1.95];
  const got = await decodedColours(clip, times);
  const near =
    got.length === times.length &&
    got.every((c, i) => clipColour(times[i], 2).every((v, k) => Math.abs(v - c[k]) <= 8));
  check(
    near,
    `video: the test clip decodes to its colours at ${times.join(', ')} s (${got.map((c) => c.map(Math.round).join('/')).join(' ')})`,
  );
  notes.push(`video: test clip ${(clip.size / 1024).toFixed(0)} KB made in ${made.toFixed(0)} ms`);
  try {
    notes.push(...(await trackChecks(check)));
  } catch (e) {
    check(false, `video track checks threw: ${e instanceof Error ? e.message : e}`);
  }
  try {
    notes.push(await videoTiming(clip));
  } catch (e) {
    check(false, `video timing threw: ${e instanceof Error ? e.message : e}`);
  }
  return notes;
}
