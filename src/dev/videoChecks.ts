/*
 * Development only: the video editor's self-test checks (specs/features/201-track-model). Test clips are made here, in
 * memory, with Mediabunny (the export's own encoder), so no video file lives in the repository.
 */
import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { IDENTITY, presetTransform, type ClipTransform, type Project, type Track } from '../engine/timeline';
import type { ExportClip } from '../engine/videoExport';

type Check = (ok: unknown, what: string) => void;

/** The colour of a test clip at time t: red rises and blue falls over its length, so a decoded frame tells its time. */
export const clipColour = (t: number, dur: number): [number, number, number] => {
  const k = Math.max(0, Math.min(1, t / dur));
  return [Math.round(40 + 180 * k), 120, Math.round(220 - 180 * k)];
};

/** A frame-coded clip's colour for frame i: consecutive frames differ by 30+ levels per channel, so a decoded colour
 * names its frame exactly (204 AC-4: one frame off shows). With a clip code (0–6, 203) the frame is in red and green
 * (any two of a clip's 180 frames differ by 13+ levels, consecutive ones by 89) and the clip in blue (25 levels apart),
 * so one pixel names both its clip and its frame (nameCode). */
export const codeColour = (i: number, clip?: number): [number, number, number] =>
  clip === undefined
    ? [40 + ((i * 53) % 180), 40 + ((i * 97) % 180), 40 + ((i * 31) % 180)]
    : [40 + ((i * 77) % 180), 40 + ((i * 89) % 180), 40 + clip * 25];

/** The clip code and frame (mod 180) a colour from codeColour(i, clip) names: the nearest code, and how far it was.
 * Two frames' codes can be 13 levels apart, so the frame is reliable only within about ±6 levels (the pool checks' ±8
 * tolerance can name a neighbour); meaningless on blended pixels (a 50 % overlay): compute those from colourAt. */
export function nameCode(rgb: readonly number[]): { clip: number; frame: number; off: number } {
  const clip = Math.max(0, Math.min(6, Math.round((rgb[2] - 40) / 25)));
  let frame = 0,
    off = Infinity;
  for (let i = 0; i < 180; i++) {
    const c = codeColour(i, clip);
    const d = Math.max(Math.abs(c[0] - rgb[0]), Math.abs(c[1] - rgb[1]), Math.abs(c[2] - rgb[2]));
    if (d < off) [frame, off] = [i, d];
  }
  return { clip, frame, off };
}

/**
 * A dur-second W×H H.264 MP4 at 30 fps whose middle is one flat colour per frame (clipColour, or codeColour when
 * `coded`; a number is the clip code, codeColour(i, coded)), with a key frame every `keyEvery` seconds (204 Q9: 2 s, like phone video). `texture` adds moving noise
 * outside the middle third, so the clip costs about what real footage does to decode while its measured colour stays
 * exact. Null if this engine can't encode it.
 */
export async function makeTestClip(
  dur = 2,
  W = 320,
  H = 240,
  keyEvery = 1,
  texture = false,
  coded: boolean | number = false,
): Promise<Blob | null> {
  const bitrate = texture ? Math.round(W * H * 30 * 0.1) : coded !== false ? 4e6 : 1e6;
  if (!(await canEncodeVideo('avc', { width: W, height: H, bitrate }))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate }),
    keyFrameInterval: keyEvery,
  });
  output.addVideoTrack(source, { frameRate: 30 });
  await output.start();
  const frames = Math.round(dur * 30);
  // Noise tiles, shifted every frame (cheap to draw, expensive to encode and decode); the middle third stays flat.
  const noise = texture ? noiseTile(256) : null;
  for (let i = 0; i < frames; i++) {
    const [r, g, b] = typeof coded === 'number' ? codeColour(i, coded) : coded ? codeColour(i) : clipColour(i / 30, dur);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, W, H);
    if (noise) {
      const off = (i * 37) % 256;
      for (let y = -off; y < H; y += 256)
        for (let x = -off; x < W; x += 256) ctx.drawImage(noise, x, y);
      ctx.fillRect(W / 3, H / 3, W / 3, H / 3);
    }
    await source.add(i / 30, 1 / 30);
  }
  source.close();
  await output.finalize();
  return target.buffer ? new Blob([target.buffer], { type: 'video/mp4' }) : null;
}

/** A size × size canvas of grey noise, for textured test clips. */
function noiseTile(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const img = x.createImageData(size, size);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const v = seed >>> 24;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/**
 * A dur-second MP4 for picture–sound sync (204 AC-8): black frames with a white frame, and a 50 ms 1 kHz beep starting
 * on that frame, every 2 s (at 0, 2, 4 … s). Null if this engine can't encode H.264 with AAC.
 */
export async function makeSyncClip(dur = 30, W = 640, H = 360): Promise<Blob | null> {
  const rate = 48000;
  if (!(await canEncodeVideo('avc', { width: W, height: H, bitrate: 1e6 }))) return null;
  if (!(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: rate, bitrate: 128000 }))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const video = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: 1e6 }), keyFrameInterval: 2 });
  const sound = new AudioBufferSource({ codec: 'aac', quality: new Quality({ bitrate: 128000 }) });
  output.addVideoTrack(video, { frameRate: 30 });
  output.addAudioTrack(sound);
  await output.start();
  const buf = new AudioBuffer({ length: dur * rate, numberOfChannels: 2, sampleRate: rate });
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let s = 0; s < dur; s += 2) for (let i = 0; i < rate * 0.05; i++) d[s * rate + i] = 0.6 * Math.sin((2 * Math.PI * 1000 * i) / rate);
  }
  await sound.add(buf);
  sound.close();
  for (let i = 0; i < dur * 30; i++) {
    ctx.fillStyle = i % 60 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, W, H);
    await video.add(i / 30, 1 / 30);
  }
  video.close();
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
export async function testPhoto(i: number, W = 1600, H = 1067): Promise<{ blob: Blob; still: HTMLCanvasElement }> {
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

/* ---------- 203: overlay fixtures (AC-6, AC-13) ---------- */

/** A clip of an overlay fixture: an export clip with its transform (none = full frame) and, for a photo, its still. */
export interface OverlayClip extends ExportClip {
  still?: HTMLCanvasElement;
}

/** What a golden check needs to know about one clip of the AC-6 fixture. */
export interface OverlayExpect {
  id: string;
  track: string;
  kind: 'video' | 'photo';
  /** Its colour code: frame f of its source is codeColour(f, code); a photo is codeColour(0, code) everywhere. */
  code: number;
  /** The timeline frames it shows in, first and last inclusive (at the fixture's fps). */
  first: number;
  last: number;
  /** Source seconds at its first frame. */
  in: number;
  /** Its box: its transform, or IDENTITY when it has none. */
  tf: ClipTransform;
}

export interface OverlayFixture {
  format: '9:16' | '16:9';
  width: number;
  height: number;
  fps: number;
  /** The main track V1 (two videos with a cut at 2 s), Overlay 1 (V2) and Overlay 2 (V3) above it, the music track A1;
   * no layers, fades or fade-out, so every pixel is a clip's code (or a blend of two, at 50 % opacity). */
  project: Project<OverlayClip>;
  /** The 8 sample frames (every clip's first and last among them) and their times, frame / fps. */
  frames: number[];
  times: number[];
  /** Bottom track first, in drawing order within a time. */
  clips: OverlayExpect[];
  /** The colour clip `id`'s source shows at timeline time t, or null when it isn't on screen then. */
  colourAt(id: string, t: number): [number, number, number] | null;
}

const OVERLAY_FPS = 30;
const OVERLAY_SIZES = { '9:16': [270, 480], '16:9': [480, 270] } as const;

/** An overlay fixture's tracks: the picture tracks bottom first (drawing order), then the music. */
export const overlayTracks = (n = 2): Track[] => [
  { id: 'V1', kind: 'video', name: 'Video', hidden: false, muted: false, locked: false },
  ...Array.from({ length: n }, (_, i) => ({
    id: `V${i + 2}`,
    kind: 'overlay' as const,
    name: `Overlay ${i + 1}`,
    hidden: false,
    muted: false,
    locked: false,
  })),
  { id: 'A1', kind: 'audio', name: 'Music', hidden: false, muted: false, locked: false },
];

/** A W×H PNG of one flat colour (exact after decoding, unlike a JPEG), and the canvas it was drawn on. */
async function flatPhoto(rgb: readonly number[], W = 400, H = 300): Promise<{ blob: Blob; still: HTMLCanvasElement }> {
  const still = document.createElement('canvas');
  still.width = W;
  still.height = H;
  const x = still.getContext('2d')!;
  x.fillStyle = `rgb(${rgb.join(',')})`;
  x.fillRect(0, 0, W, H);
  const blob = await new Promise<Blob>((res) => still.toBlob((b) => res(b!), 'image/png'));
  return { blob, still };
}

/**
 * The AC-6 fixture's clips in frames at 30 fps (4 s): id, track, kind, colour code, first frame, end frame (exclusive),
 * source in (s), source file length (s). Main: m1 0–2 s, a cut, m2 2–4 s. Overlay 1: the full-frame B-roll 0.5–2 s, the
 * rotated rounded photo 2–3 s, the clip partly outside the frame 3–4 s. Overlay 2: the face-cam at 50 % 0.5–4 s. Both
 * overlays have a gap at 0–0.5 s (frame 0 is the main clip alone).
 */
const OVERLAY_PLAN = [
  ['m1', 'V1', 'video', 0, 0, 60, 0, 2],
  ['m2', 'V1', 'video', 1, 60, 120, 0.5, 2.5],
  ['broll', 'V2', 'video', 2, 15, 60, 0.3, 2],
  ['photo', 'V2', 'photo', 3, 60, 90, 0, 0],
  ['edge', 'V2', 'video', 4, 90, 120, 0.2, 1.5],
  ['face', 'V3', 'video', 5, 15, 120, 0, 3.5],
] as const;
/** Every clip's first and last frame, and one with B-roll and face-cam over m1. */
const OVERLAY_FRAMES = [0, 15, 37, 59, 60, 89, 90, 119];

/** The AC-6 fixture's source files, made once per run (the same files serve both formats). */
let overlaySources: Promise<Map<string, { blob: Blob; still?: HTMLCanvasElement }> | null> | null = null;
function overlayFiles() {
  overlaySources ??= (async () => {
    const out = new Map<string, { blob: Blob; still?: HTMLCanvasElement }>();
    for (const [id, , kind, code, , , , len] of OVERLAY_PLAN) {
      if (kind === 'photo') {
        out.set(id, await flatPhoto(codeColour(0, code)));
        continue;
      }
      const blob = await makeTestClip(len, 320, 240, 1, false, code);
      if (!blob) return null;
      out.set(id, { blob });
    }
    return out;
  })();
  return overlaySources;
}

/**
 * 203 AC-6's fixture at 9:16 (270×480) or 16:9 (480×270): a main track with two video clips and a cut, and two overlay
 * tracks with a full-frame B-roll video, a face-cam video in the top-right corner (plan §1's preset: width 0.35, 4 % of
 * the frame width from the top and right edges) at 50 % opacity, a photo rotated 15° with a 10 % corner radius, and a
 * video partly outside the frame (right and top). Every clip has its own colour code, so a pixel names its clip and
 * frame (nameCode). Null if this engine can't encode H.264.
 */
export async function makeOverlayProject(format: '9:16' | '16:9'): Promise<OverlayFixture | null> {
  const files = await overlayFiles();
  if (!files) return null;
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const [W, H] = OVERLAY_SIZES[format];
  const fps = OVERLAY_FPS;
  const tfs: Record<string, ClipTransform | undefined> = {
    photo: { x: 0.4, y: 0.6, w: 0.5, rot: 15, opacity: 1, radius: 0.1 },
    edge: { x: 0.9, y: 0.15, w: 0.5, rot: 0, opacity: 1, radius: 0 },
    face: { ...presetTransform('top-right', W, H), opacity: 0.5 },
  };
  const clips: OverlayClip[] = OVERLAY_PLAN.map(([id, track, kind, , f0, f1, inT]) => {
    const file = files.get(id)!;
    const len = (f1 - f0) / fps;
    const tf = tfs[id];
    return {
      id,
      track,
      start: f0 / fps,
      kind,
      dur: kind === 'photo' ? len : 0,
      in: inT,
      out: kind === 'photo' ? 0 : inT + len,
      edit: { ...DEFAULT_EDIT },
      motion: 'none',
      fade: false,
      file: file.blob,
      volume: 0,
      ...(file.still ? { still: file.still } : {}),
      ...(tf ? { tf } : {}),
    };
  });
  const expect: OverlayExpect[] = OVERLAY_PLAN.map(([id, track, kind, code, f0, f1, inT]) => ({
    id,
    track,
    kind,
    code,
    first: f0,
    last: f1 - 1,
    in: inT,
    tf: tfs[id] ?? IDENTITY,
  }));
  return {
    format,
    width: W,
    height: H,
    fps,
    project: { tracks: overlayTracks(2), clips, audio: [], layers: [], fadeOut: false },
    frames: [...OVERLAY_FRAMES],
    times: OVERLAY_FRAMES.map((k) => k / fps),
    clips: expect,
    colourAt(id, t) {
      const c = expect.find((e) => e.id === id);
      const k = Math.floor(t * fps + 1e-6);
      if (!c || k < c.first || k > c.last) return null;
      if (c.kind === 'photo') return codeColour(0, c.code);
      return codeColour(Math.floor((c.in + t - c.first / fps) * fps + 1e-6), c.code);
    },
  };
}

export interface LongOverlayFixture {
  width: number;
  height: number;
  fps: number;
  project: Project<OverlayClip>;
  /** The source files of the main track, Overlay 1 and Overlay 2 (codes 0, 1, 2; 6 s, so every frame's code differs). */
  sources: Blob[];
  /** Milliseconds spent encoding the sources. */
  made: number;
}

/**
 * 203 AC-13's fixture: a 2-minute 1080p project with the main track and two overlay video tracks, each from its own 6 s
 * 1920×1080 flat frame-coded source (codeColour(frame, track index)) with a key frame every 2 s. Main: 24 clips of 5 s
 * end to end. Overlay 1: 20 clips of 5 s every 6 s from 0.5 s, bottom-left at 35 %. Overlay 2: 24 clips of 4 s every
 * 5 s from 1 s, top-right at 35 % and 50 % opacity. Three videos show at once most of the time. Null if this engine
 * can't encode 1080p H.264.
 */
let longOverlay: Promise<LongOverlayFixture | null> | null = null;
/** Made once per run: the build check and the export checks (T032) share it. */
export const makeLongOverlayProject = (): Promise<LongOverlayFixture | null> => (longOverlay ??= buildLongOverlayProject());
async function buildLongOverlayProject(): Promise<LongOverlayFixture | null> {
  const { DEFAULT_EDIT } = await import('../engine/instagram');
  const W = 1920,
    H = 1080,
    fps = OVERLAY_FPS;
  const t0 = performance.now();
  const sources: Blob[] = [];
  for (const code of [0, 1, 2]) {
    const b = await makeTestClip(6, W, H, 2, false, code);
    if (!b) return null;
    sources.push(b);
  }
  const made = performance.now() - t0;
  const left = presetTransform('bottom-left', W, H);
  const right: ClipTransform = { ...presetTransform('top-right', W, H), opacity: 0.5 };
  const lane = (track: string, n: number, len: number, every: number, from: number, tf?: ClipTransform) =>
    Array.from({ length: n }, (_, i): OverlayClip => {
      const inT = Math.round(((i * 0.3) % 1) * fps) / fps;
      return {
        id: `${track}-${i}`,
        track,
        start: from + i * every,
        kind: 'video',
        dur: 0,
        in: inT,
        out: inT + len,
        edit: { ...DEFAULT_EDIT },
        motion: 'none',
        fade: false,
        file: sources[Number(track.slice(1)) - 1],
        volume: 0,
        ...(tf ? { tf } : {}),
      };
    });
  const clips = [...lane('V1', 24, 5, 5, 0), ...lane('V2', 20, 5, 6, 0.5, left), ...lane('V3', 24, 4, 5, 1, right)];
  return {
    width: W,
    height: H,
    fps,
    project: { tracks: overlayTracks(2), clips, audio: [], layers: [], fadeOut: false },
    sources,
    made,
  };
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
  const { MAIN_VIDEO, MUSIC, audioPlan, defaultTracks, framePlan, pack, projectLength, videoAt } =
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

  // AC-4 (202): a 1.5 s gap between two 1 s photos (Magnetic off) plays black with the layers, for 45 frames at 30 fps,
  // and the photos either side are still there.
  const base = job(defaultTracks(), false);
  const gapJob = { ...base, clips: base.clips.map((c, i) => ({ ...c, dur: 1, start: i ? 2.5 : 0 })) };
  const plan = framePlan(gapJob, 30);
  const black = plan.filter((s) => !s.clip).reduce((n, s) => n + s.f1 - s.f0, 0);
  const gapMp4 = (await encodeVideo(gapJob))!;
  const times = [0.5, 1.75, 3];
  const [corners, middles] = [await decodedColours(gapMp4, times, [0.08, 0.08]), await decodedColours(gapMp4, times)];
  const lit = (c?: number[]) => !!c?.some((v) => v > 30);
  const dark = (c?: number[]) => !!c?.every((v) => v < 12);
  const redish = (c?: number[]) => !!c && c[0] > 200 && c[1] < 50 && c[2] < 50;
  check(
    black === 45 &&
      plan.length === 3 &&
      lit(corners[0]) &&
      dark(corners[1]) &&
      redish(middles[1]) &&
      lit(corners[2]) &&
      projectLength(gapJob) === 3.5,
    `video: a 1.5 s gap exports 45 black frames with the layers, between the photos (${black} gap frames; corners ${corners.map((c) => c.map(Math.round).join('/')).join(' ')}; layer in the gap ${middles[1]?.map(Math.round).join('/')})`,
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

  // 204's fixtures: a textured 1080p clip with a key frame every 2 s (Q9) and the sync clip (AC-8).
  const t1 = performance.now();
  const hd = await makeTestClip(4, 1920, 1080, 2, true);
  const hdMade = performance.now() - t1;
  const hdTimes = [0, 1.9, 2, 3.95];
  const hdGot = hd ? await decodedColours(hd, hdTimes) : [];
  check(
    hdGot.length === hdTimes.length && hdGot.every((c, i) => clipColour(hdTimes[i], 4).every((v, k) => Math.abs(v - c[k]) <= 8)),
    `video: a textured 1080p test clip with 2 s key frames decodes to its colours (${hdGot.map((c) => c.map(Math.round).join('/')).join(' ')})`,
  );
  const t2 = performance.now();
  const sync = await makeSyncClip(4);
  const syncMade = performance.now() - t2;
  const flashes = sync ? await decodedColours(sync, [0, 0.5, 2, 2.5]) : [];
  check(
    !!sync &&
      (await hasSound(sync)) &&
      flashes.length === 4 &&
      flashes[0].every((v) => v > 240) &&
      flashes[1].every((v) => v < 12) &&
      flashes[2].every((v) => v > 240) &&
      flashes[3].every((v) => v < 12),
    `video: the sync clip has sound and a white frame every 2 s (${flashes.map((c) => Math.round(c[0])).join(' ')})`,
  );
  notes.push(`video: 204 fixtures: textured 1080p 4 s ${((hd?.size ?? 0) / 1e6).toFixed(1)} MB in ${hdMade.toFixed(0)} ms; sync clip 4 s in ${syncMade.toFixed(0)} ms`);
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

/** Do a track's clips follow one another without overlapping? */
const noOverlaps = (clips: OverlayClip[]) => {
  const end = (c: OverlayClip) => c.start + (c.kind === 'photo' ? c.dur : c.out - c.in);
  const tracks = new Set(clips.map((c) => c.track));
  return [...tracks].every((tr) => {
    const on = clips.filter((c) => c.track === tr).sort((a, b) => a.start - b.start);
    return on.every((c, i) => !i || c.start >= end(on[i - 1]) - 1e-9);
  });
};

/** The most video clips on screen at once (a sweep over the clips' intervals). */
function videosAtOnce(clips: OverlayClip[]): number {
  const ev = clips
    .filter((c) => c.kind === 'video')
    .flatMap((c) => [
      [c.start, 1],
      [c.start + c.out - c.in, -1],
    ])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0,
    most = 0;
  for (const [, d] of ev) most = Math.max(most, (n += d));
  return most;
}

/**
 * 203 T002: the overlay fixtures build. AC-6's at 9:16 and 16:9: the main track then two overlay tracks, no clip
 * overlapping another on its track, every clip's first and last frame among the 8 samples, every (clip, sample) colour
 * at least 13 levels from every other, and each source decodes to the colour the fixture expects at its first and
 * last frame (named back to its clip and frame). AC-13's: 2 minutes, three video tracks with three videos at once, its
 * sources decoding to their codes. One check per fixture. Returns notes for the report.
 */
export async function overlayFixtureChecks(check: Check): Promise<string[]> {
  const notes: string[] = [];
  const near = (a: readonly number[], b: readonly number[], tol = 8) => a.every((v, k) => Math.abs(v - b[k]) <= tol);
  const t0 = performance.now();
  for (const format of ['9:16', '16:9'] as const) {
    const fx = await makeOverlayProject(format);
    if (!fx) {
      notes.push(`video: 203 overlay fixture ${format} skipped (no H.264 encoder)`);
      continue;
    }
    const bad: string[] = [];
    const kinds = fx.project.tracks.map((t) => `${t.id}:${t.kind}`).join(' ');
    if (kinds !== 'V1:video V2:overlay V3:overlay A1:audio') bad.push(`tracks ${kinds}`);
    if (!noOverlaps(fx.project.clips)) bad.push('clips overlap on a track');
    if (fx.frames.length !== 8) bad.push(`${fx.frames.length} sample frames`);
    for (const c of fx.clips)
      if (!fx.frames.includes(c.first) || !fx.frames.includes(c.last)) bad.push(`${c.id}'s first or last frame not sampled`);
    const want = ['broll', 'face', 'photo', 'edge'].map((id) => fx.clips.find((c) => c.id === id)!.tf);
    if (want[0].w !== 1 || want[1].opacity !== 0.5 || want[2].rot !== 15 || want[2].radius !== 0.1 || want[3].x + want[3].w / 2 <= 1)
      bad.push('transforms');
    // Every colour a sample can show, distinct from every other.
    const shown = fx.clips.flatMap((c) =>
      fx.times.flatMap((t) => {
        const col = fx.colourAt(c.id, t);
        return col ? [{ id: c.id, t, col }] : [];
      }),
    );
    for (let i = 0; i < shown.length; i++)
      for (let j = i + 1; j < shown.length; j++)
        if (shown[i].id !== shown[j].id && near(shown[i].col, shown[j].col, 12))
          bad.push(`${shown[i].id} at ${shown[i].t.toFixed(3)} and ${shown[j].id} at ${shown[j].t.toFixed(3)} look alike`);
    // Each source at its first and last frame decodes to the expected colour, which names its clip and frame.
    for (const c of fx.clips) {
      const clip = fx.project.clips.find((x) => x.id === c.id)!;
      const ends = [c.first, c.last].map((k) => k / fx.fps);
      const exp = ends.map((t) => fx.colourAt(c.id, t)!);
      let got: number[][];
      if (c.kind === 'photo') {
        // The file the preview and the export load, decoded (not the still drawn from it).
        const bmp = await createImageBitmap(clip.file);
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const x = cv.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(bmp, 10, 10, 1, 1, 0, 0, 1, 1);
        bmp.close();
        const d = x.getImageData(0, 0, 1, 1).data;
        got = [[d[0], d[1], d[2]], [d[0], d[1], d[2]]];
      } else got = await decodedColours(clip.file, ends.map((t) => c.in + t - clip.start + 0.5 / fx.fps));
      exp.forEach((e, k) => {
        const g = got[k],
          named = g && nameCode(g);
        const frame = c.kind === 'photo' ? 0 : Math.floor((c.in + ends[k] - clip.start) * fx.fps + 1e-6);
        if (!g || !near(g, e) || named.clip !== c.code || named.frame !== frame)
          bad.push(`${c.id} at ${ends[k].toFixed(3)} s: ${g?.map(Math.round).join('/')} (want ${e.join('/')}, frame ${frame})`);
      });
    }
    check(
      !bad.length,
      `video: 203's overlay fixture builds at ${format} (main + 2 overlay tracks, 6 clips, 8 samples, colours name clip and frame)${bad.length ? `: ${bad.slice(0, 3).join('; ')}` : ''}`,
    );
  }
  notes.push(`video: 203 overlay fixtures (9:16, 16:9) built and checked in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  const t1 = performance.now();
  const long = await makeLongOverlayProject();
  if (!long) return [...notes, 'video: 203 long overlay fixture skipped (no 1080p H.264 encoder)'];
  const built = performance.now() - t1;
  const { clips } = long.project;
  const end = Math.max(...clips.map((c) => c.start + c.out - c.in));
  const per = ['V1', 'V2', 'V3'].map((tr) => clips.filter((c) => c.track === tr).length);
  const decoded = await Promise.all(long.sources.map((s) => decodedColours(s, [0.5 / 30, 179.5 / 30])));
  const named = decoded.map((cs) => cs.map((c) => nameCode(c)));
  const codesOk = named.every((ns, i) => ns.length === 2 && ns[0].clip === i && ns[0].frame === 0 && ns[1].clip === i && ns[1].frame === 179 && ns.every((n) => n.off <= 8));
  check(
    Math.abs(end - 120) < 1e-6 && per.join() === '24,20,24' && noOverlaps(clips) && videosAtOnce(clips) === 3 && codesOk,
    `video: 203's 2-minute 1080p overlay fixture builds (${end.toFixed(1)} s, clips ${per.join('/')}, ${videosAtOnce(clips)} videos at once, sources ${named.map((ns) => ns.map((n) => `${n.clip}:${n.frame}±${n.off.toFixed(0)}`).join(',')).join(' ')})`,
  );
  notes.push(
    `video: 203 long overlay fixture: 3 sources of 6 s 1920×1080 (${(long.sources.reduce((n, s) => n + s.size, 0) / 1e6).toFixed(1)} MB) encoded in ${(long.made / 1000).toFixed(1)} s, built and checked in ${((performance.now() - t1) / 1000).toFixed(1)} s (${(built / 1000).toFixed(1)} s to build)`,
  );
  return notes;
}
