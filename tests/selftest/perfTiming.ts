/*
 * Development only: microbenchmarks of the hot paths for 407's performance review (T072, AC-10), run with
 * `CHITTHI_TEST_ONLY=perf npm test`. Self-contained on purpose (only engine functions whose names and signatures are
 * the same before and after 407, and videoChecks.ts' fixtures), so the same file can be dropped into a worktree of
 * `main` and timed back to back with this branch.
 */
import { makeSyncClip, testPhoto } from './videoChecks';

/** How many timed rounds each path runs (after one warm-up round); the median round is the number to compare. */
const ROUNDS = 7;

/**
 * The middle value.
 * @param values numbers
 * @returns their median
 */
const median = (values: number[]): number => {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/**
 * Times a piece of work: one warm-up round, then ROUNDS rounds of `repeats` calls.
 * @param name what is timed, for the report
 * @param repeats calls per round
 * @param work the work, given the call's index
 * @returns the report line: the median time per call in milliseconds, and the spread of the rounds
 */
async function bench(name: string, repeats: number, work: (index: number) => unknown): Promise<string> {
  const rounds: number[] = [];
  for (let round = 0; round <= ROUNDS; round++) {
    const started = performance.now();
    for (let index = 0; index < repeats; index++) await work(index);
    if (round > 0) rounds.push((performance.now() - started) / repeats);
  }
  const shown = (ms: number) => (ms < 1 ? ms.toFixed(4) : ms.toFixed(2));
  return `perf: ${name}: median ${shown(median(rounds))} ms (min ${shown(Math.min(...rounds))}, max ${shown(Math.max(...rounds))})`;
}

/**
 * A 2D context, or an error.
 * @param canvas the canvas
 * @returns its context
 */
function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  return ctx;
}

/**
 * The hot paths of plan §7: a frame's stack (`frameStack`), drawing it at 1080p (`renderStack`, transitions through
 * `drawPair`), the volume curve (`gainCurve`), an export with sound (`mixWindow`), the photo pipeline
 * (`adjustPixels`, `detailPixels`) and the print renderer (`renderCard` per page at 300 dpi, `buildPDF`).
 * @returns one report line per path
 */
export async function perfTiming(): Promise<string[]> {
  const { renderStack } = await import('@/engine/video');
  const { frameStack } = await import('@/engine/stack');
  const { gainCurve } = await import('@/engine/keyframes');
  const { pack } = await import('@/engine/timeline');
  const { DEFAULT_EDIT, adjustPixels } = await import('@/engine/instagram');
  const { DEFAULT_ADJUST } = await import('@/engine/adjust');
  const { detailPixels } = await import('@/engine/detail');
  const { newShape, newSticker, newText } = await import('@/engine/layers');
  const { TEXT_STYLES } = await import('@/data/layers');
  const { renderCard } = await import('@/engine/render');
  const { productDesign } = await import('@/engine/design');
  const { samplePhoto } = await import('@/engine/sample');
  const { buildPDF } = await import('@/engine/export');
  const { encodeVideo } = await import('@/engine/videoExport');
  const out: string[] = [];

  /* ---------- The video project: 40 photos on the main track (transitions on every other cut), 10 overlays ---------- */
  type Clip = Parameters<typeof pack>[0][number] & Parameters<typeof renderStack>[3][number]['clip'] & { file: Blob };
  const stills = await Promise.all(Array.from({ length: 6 }, (_, index) => testPhoto(index)));
  const stillOf = (index: number) => stills[index % stills.length] ?? stills[0];
  const kinds = ['dissolve', 'dip', 'wipe', 'slide', 'zoom'] as const;
  const main: Clip[] = pack(
    Array.from({ length: 40 }, (_, index) => ({
      id: `m${String(index)}`,
      track: 'V1',
      start: 0,
      kind: 'photo' as const,
      dur: 3,
      in: 0,
      out: 0,
      edit: { ...DEFAULT_EDIT },
      motion: index % 2 ? ('zoom-in' as const) : ('pan-left' as const),
      fade: index === 0,
      overlay: false,
      file: stillOf(index)?.blob ?? new Blob(),
      ...(index % 2 === 0 && index < 39
        ? { transition: { kind: kinds[(index / 2) % kinds.length] ?? 'dissolve', dur: 0.5, to: `m${String(index + 1)}`, dir: 'left' as const, colour: 'black' as const } }
        : {}),
    })),
  );
  const overlays: Clip[] = Array.from({ length: 10 }, (_, index) => ({
    id: `o${String(index)}`,
    track: 'V2',
    start: index * 12 + 1,
    kind: 'photo' as const,
    dur: 6,
    in: 0,
    out: 0,
    edit: { ...DEFAULT_EDIT },
    motion: 'none' as const,
    fade: true,
    overlay: true,
    file: stillOf(index + 3)?.blob ?? new Blob(),
    tf: { x: 0.75, y: 0.25, w: 0.35, rot: 5, opacity: 0.8, radius: 0.05 },
    keys: { x: [{ t: 0, v: 0.7, ease: 'ease-in-out' as const }, { t: 6, v: 0.8, ease: 'linear' as const }] },
  }));
  const flags = { hidden: false, muted: false, locked: false };
  const project = {
    tracks: [
      { id: 'V1', kind: 'video' as const, name: 'Video', ...flags },
      { id: 'V2', kind: 'overlay' as const, name: 'Overlay 1', ...flags },
      { id: 'A1', kind: 'audio' as const, name: 'Music', ...flags },
    ],
    clips: [...main, ...overlays],
    audio: [],
    layers: [],
    fadeOut: true,
  };
  const total = 40 * 3;
  const times = Array.from({ length: 997 }, (_, index) => (index * total) / 997);
  out.push(await bench('frameStack, 50 clips on 2 tracks (per call)', 2000, (index) => frameStack(project, times[index % times.length] ?? 0)));

  // Drawing: 30 frames spread over the video (transitions, overlays, motion), with a title, a shape and a sticker.
  const style = TEXT_STYLES[0];
  const layers = [...(style ? [newText(style, 'A title over the video')] : []), newShape('round'), newSticker('🌼')];
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = context(canvas);
  const pictureOf = new Map([...main, ...overlays].map((clip, index) => [clip.id, stillOf(index)?.still]));
  const frames = Array.from({ length: 30 }, (_, index) => {
    // Every third frame sits inside a transition (the even clips' cuts at 3 s, 9 s, 15 s …, 0.2 s before).
    const time = index % 3 === 0 ? 6 * (index / 3) + 3 - 0.2 : (index * total) / 30 + 0.37;
    const items = frameStack(project, time).map((item) => {
      const still = pictureOf.get(item.clip.id) ?? null;
      return { ...item, src: still, sw: still?.width ?? 0, sh: still?.height ?? 0 };
    });
    return { time, items };
  });
  const transitions = frames.filter((frame) => frame.items.some((item) => item.mix)).length;
  out.push(
    await bench(`renderStack 1920×1080, 30 frames (${String(transitions)} in transitions; per frame)`, 30, (index) => {
      const frame = frames[index % frames.length];
      if (!frame) return;
      renderStack(ctx, 1920, 1080, frame.items, layers, frame.time, total, true);
      ctx.getImageData(0, 0, 1, 1);
    }),
  );

  /* ---------- Sound: the volume curve, and an export with sound ---------- */
  const gain = Array.from({ length: 8 }, (_, index) => ({ t: index * 1.5, v: index % 2 ? 0.4 : 1, ease: 'ease-in-out' as const }));
  const source = { ref: 'c', start: 2, end: 14, from: 0, volume: 1, gain, fadeIn: 0.5, fadeOut: 0.5, lead: 0.25, trail: 0.25, edgeIn: 'power' as const, edgeOut: 'dip' as const };
  out.push(await bench('gainCurve, a 10 s window with 8 keys (per call)', 200, () => gainCurve(source, 0, 10)));

  const sync = await makeSyncClip(8);
  if (sync) {
    const clips = pack(
      Array.from({ length: 6 }, (_, index) => ({
        id: `s${String(index)}`,
        track: 'V1',
        start: 0,
        kind: 'video' as const,
        dur: 0,
        in: (index % 3) * 1.3,
        out: (index % 3) * 1.3 + 4,
        edit: { ...DEFAULT_EDIT },
        motion: 'none' as const,
        fade: false,
        file: sync,
        volume: 1,
        keys: { volume: [{ t: 0, v: 0.2, ease: 'linear' as const }, { t: 2, v: 1, ease: 'linear' as const }] },
        ...(index < 5 ? { transition: { kind: 'dissolve' as const, dur: 0.5, to: `s${String(index + 1)}` } } : {}),
      })),
    );
    const runs: number[] = [];
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      await encodeVideo({
        tracks: project.tracks,
        clips,
        audio: [],
        layers: [],
        width: 640,
        height: 360,
        fps: 30,
        bitrate: 2e6,
        fadeOut: true,
        sink: { kind: 'memory' },
      });
      runs.push(performance.now() - started);
    }
    out.push(`perf: export with sound, 6 × 4 s clips, 5 dissolves, volume keys, 640×360: fastest ${(Math.min(...runs) / 1000).toFixed(2)} s (runs ${runs.map((ms) => (ms / 1000).toFixed(2)).join(', ')})`);
  }

  /* ---------- The photo pipeline at 1080×1350 ---------- */
  const photo = samplePhoto(2, 1080, 1350);
  const photoCanvas = document.createElement('canvas');
  photoCanvas.width = 1080;
  photoCanvas.height = 1350;
  const photoContext = context(photoCanvas);
  photoContext.drawImage(photo.src, 0, 0, 1080, 1350);
  const source2d = photoContext.getImageData(0, 0, 1080, 1350).data;
  const pixels = new Uint8ClampedArray(source2d.length);
  const light = { ...DEFAULT_ADJUST, exposure: 0.3, highlights: -30, shadows: 25, temperature: 12, tint: -4, contrast: 10, saturation: 8 };
  const looked = { ...light, look: 'warm' as typeof light.look };
  const detail = { ...DEFAULT_ADJUST, clarity: 30, sharpen: 40, dehaze: 15, noise: 20 };
  out.push(await bench('adjustPixels 1080×1350, light + white balance + basic (per call)', 5, () => { pixels.set(source2d); adjustPixels(pixels, light); }));
  out.push(await bench('adjustPixels 1080×1350, the same with a look (per call)', 5, () => { pixels.set(source2d); adjustPixels(pixels, looked); }));
  out.push(await bench('detailPixels 1080×1350, clarity + sharpen + dehaze + noise (per call)', 3, () => { pixels.set(source2d); detailPixels(pixels, 1080, 1350, detail, 1); }));
  for (const [step, value] of [['noise', 20], ['dehaze', 15], ['clarity', 30], ['sharpen', 40]] as const) {
    const alone = { ...DEFAULT_ADJUST, [step]: value };
    out.push(await bench(`detailPixels 1080×1350, ${step} alone (per call)`, 3, () => { pixels.set(source2d); detailPixels(pixels, 1080, 1350, alone, 1); }));
  }

  /* ---------- The print renderer: a page at 300 dpi, and a PDF ---------- */
  const prints = [0, 1, 2, 3].map((index) => samplePhoto(index, 1800, 1200));
  const pxPerMm = 300 / 25.4;
  const page = document.createElement('canvas');
  for (const product of ['postcard', 'calendar', 'magnet'] as const) {
    const design = { ...productDesign(product), insta: 'someone' };
    const input = { d: design, photos: prints };
    out.push(await bench(`renderCard ${product} front + back at 300 dpi (per page)`, 4, (index) => {
      renderCard(page, index % 2 ? 'back' : 'front', pxPerMm, 3, input, { page: index % 12 });
      // Canvas drawing is queued on the GPU: reading a pixel waits for it, so the time is the page's.
      context(page).getImageData(0, 0, 1, 1);
    }));
  }
  const postcard = productDesign('postcard');
  out.push(await bench('buildPDF postcard (per file)', 1, () => buildPDF({ d: postcard, photos: prints }, 'pdf')));
  return out;
}
