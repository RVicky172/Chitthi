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

/** The mean colour of the frames of `file` at the given times, decoded as the export decodes them. */
export async function decodedColours(file: Blob, times: number[]): Promise<[number, number, number][]> {
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
      const d = x.getImageData(c.width / 2 - 8, c.height / 2 - 8, 16, 16).data;
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

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * AC-5's timing (201): a 60-clip 1080p YouTube project (0.4 s photos, every tenth clip a video), with the GPU path as
 * the app opens it. The preview: the frame at 300 times through the editor's own path (the clip at t, then
 * renderFrame); the export: the whole video encoded in memory. Median of 3 each.
 */
async function videoTiming(clip: Blob): Promise<string> {
  const { renderFrame, timeline, clipAt, totalLength } = await import('../engine/video');
  const { encodeVideo } = await import('../engine/videoExport');
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const { openGpu, gpu } = await import('../engine/gpu/device');
  await openGpu();
  const W = 1920,
    H = 1080;
  const photos = await Promise.all(Array.from({ length: 6 }, (_, i) => testPhoto(i)));
  const frame = document.createElement('canvas');
  frame.width = 320;
  frame.height = 240;
  const decoded = (await decodedColours(clip, [0.2])).length ? frame : null;
  const clips = Array.from({ length: 60 }, (_, i) => {
    const video = i % 10 === 9;
    const p = photos[i % photos.length];
    return {
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
  });
  const total = totalLength(clips);
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
      const p = clipAt(timeline(clips), t);
      if (p) {
        const src = p.clip.still;
        renderFrame(ctx, W, H, p.clip, src, src?.width ?? 0, src?.height ?? 0, t - p.start, [], t, total, true);
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
      clips,
      layers: [],
      width: W,
      height: H,
      fps: 30,
      bitrate: 8e6,
      fadeOut: true,
      music: null,
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
    notes.push(await videoTiming(clip));
  } catch (e) {
    check(false, `video timing threw: ${e instanceof Error ? e.message : e}`);
  }
  return notes;
}
