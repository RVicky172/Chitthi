/*
 * Development only: the video editor's self-test checks (specs/features/201-track-model). Test clips are made here, in
 * memory, with Mediabunny (the export's own encoder), so no video file lives in the repository.
 */
import {
  ALL_FORMATS,
  AudioBufferSink,
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
import { renderIg } from '@/engine/instagram';
import { drawLayers } from '@/engine/layerDraw';
import { newShape, type Layer } from '@/engine/layers';
import { mediaInput, type MediaFile } from '@/engine/mediaFile';
import { clipLength, IDENTITY, isIdentity, presetTransform, type ClipTransform, type Project } from '@/engine/timeline';
import { type Track } from '@/engine/tracks';
import { fadeAmount, motionEdit, type FrameClip } from '@/engine/video';
import type { ExportClip } from '@/engine/videoExport';
import {
  canvasBlob,
  context2d,
  cycleOf,
  entryAt,
  firstFew,
  isNear,
  meanRgb,
  messageOf,
  required,
  sleep,
} from './helpers';
import { blobFile } from '../support/blobFile';

/** Records one check: passed when `ok` is truthy, described by `what`. */
type Check = (ok: unknown, what: string) => void;

/**
 * The colour of a test clip at time t: red rises and blue falls over its length, so a decoded frame tells its time.
 * @param time the time in the clip, seconds
 * @param dur the clip's length, seconds
 * @returns its red, green and blue
 */
export const clipColour = (time: number, dur: number): [number, number, number] => {
  const share = Math.max(0, Math.min(1, time / dur));
  return [Math.round(40 + 180 * share), 120, Math.round(220 - 180 * share)];
};

/**
 * A frame-coded clip's colour for frame i: consecutive frames differ by 30+ levels per channel, so a decoded colour
 * names its frame exactly (204 AC-4: one frame off shows). With a clip code (0–6, 203) the frame is in red and green
 * (any two of a clip's 180 frames differ by 13+ levels, consecutive ones by 89) and the clip in blue (25 levels apart),
 * so one pixel names both its clip and its frame (nameCode).
 * @param frame the frame number
 * @param clip the clip code (0–6), or none for a clip without one
 * @returns its red, green and blue
 */
export const codeColour = (frame: number, clip?: number): [number, number, number] =>
  clip === undefined
    ? [40 + ((frame * 53) % 180), 40 + ((frame * 97) % 180), 40 + ((frame * 31) % 180)]
    : [40 + ((frame * 77) % 180), 40 + ((frame * 89) % 180), 40 + clip * 25];

/**
 * The clip code and frame (mod 180) a colour from codeColour(i, clip) names: the nearest code, and how far it was.
 * Two frames' codes can be 13 levels apart, so the frame is reliable only within about ±6 levels (the pool checks' ±8
 * tolerance can name a neighbour); meaningless on blended pixels (a 50 % overlay): compute those from colourAt.
 * @param rgb a decoded colour
 * @returns the clip code, the frame (mod 180) and how many levels off the nearest code it was
 */
export function nameCode(rgb: readonly number[]): { clip: number; frame: number; off: number } {
  const [red = NaN, green = NaN, blue = NaN] = rgb;
  const clip = Math.max(0, Math.min(6, Math.round((blue - 40) / 25)));
  let frame = 0,
    off = Infinity;
  for (let index = 0; index < 180; index++) {
    const code = codeColour(index, clip);
    const distance = Math.max(Math.abs(code[0] - red), Math.abs(code[1] - green), Math.abs(code[2] - blue));
    if (distance < off) [frame, off] = [index, distance];
  }
  return { clip, frame, off };
}

/**
 * A dur-second W×H H.264 MP4 at 30 fps whose middle is one flat colour per frame (clipColour, or codeColour when
 * `coded`; a number is the clip code, codeColour(i, coded)), with a key frame every `keyEvery` seconds (204 Q9: 2 s, like phone video). `texture` adds moving noise
 * outside the middle third, so the clip costs about what real footage does to decode while its measured colour stays
 * exact. Null if this engine can't encode it.
 * @param dur its length, seconds
 * @param width its width, px
 * @param height its height, px
 * @param keyEvery seconds between key frames
 * @param texture add moving noise outside the middle third
 * @param coded frame-coded colours (true), with a clip code (a number), or clipColour (false)
 * @returns the MP4, or null
 */
export async function makeTestClip(
  dur = 2,
  width = 320,
  height = 240,
  keyEvery = 1,
  texture = false,
  coded: boolean | number = false,
): Promise<Blob | null> {
  let bitrate = coded === false ? 1e6 : 4e6;
  if (texture) bitrate = Math.round(width * height * 30 * 0.1);
  if (!(await canEncodeVideo('avc', { width, height, bitrate }))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = context2d(canvas);
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
  for (let frame = 0; frame < frames; frame++) {
    let colour = clipColour(frame / 30, dur);
    if (typeof coded === 'number') colour = codeColour(frame, coded);
    else if (coded) colour = codeColour(frame);
    const [red, green, blue] = colour;
    ctx.fillStyle = `rgb(${red},${green},${blue})`;
    ctx.fillRect(0, 0, width, height);
    if (noise) {
      const off = (frame * 37) % 256;
      for (let y = -off; y < height; y += 256) for (let x = -off; x < width; x += 256) ctx.drawImage(noise, x, y);
      ctx.fillRect(width / 3, height / 3, width / 3, height / 3);
    }
    await source.add(frame / 30, 1 / 30);
  }
  source.close();
  await output.finalize();
  return target.buffer ? new Blob([target.buffer], { type: 'video/mp4' }) : null;
}

/**
 * A size × size canvas of grey noise, for textured test clips.
 * @param size its width and height, px
 * @returns the canvas
 */
function noiseTile(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const x = context2d(canvas);
  const img = x.createImageData(size, size);
  let seed = 7;
  for (let offset = 0; offset < img.data.length; offset += 4) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const grey = seed >>> 24;
    img.data[offset] = img.data[offset + 1] = img.data[offset + 2] = grey;
    img.data[offset + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return canvas;
}

/**
 * A dur-second MP4 for picture–sound sync (204 AC-8): black frames with a white frame, and a 50 ms 1 kHz beep starting
 * on that frame, every 2 s (at 0, 2, 4 … s). Null if this engine can't encode H.264 with AAC.
 * @param dur its length, seconds
 * @param width its width, px
 * @param height its height, px
 * @returns the MP4, or null
 */
export async function makeSyncClip(dur = 30, width = 640, height = 360): Promise<Blob | null> {
  const rate = 48000;
  if (!(await canEncodeVideo('avc', { width: width, height: height, bitrate: 1e6 }))) return null;
  if (!(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: rate, bitrate: 128000 }))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = context2d(canvas);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const video = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: 1e6 }), keyFrameInterval: 2 });
  const sound = new AudioBufferSource({ codec: 'aac', quality: new Quality({ bitrate: 128000 }) });
  output.addVideoTrack(video, { frameRate: 30 });
  output.addAudioTrack(sound);
  await output.start();
  const buf = new AudioBuffer({ length: dur * rate, numberOfChannels: 2, sampleRate: rate });
  for (let ch = 0; ch < 2; ch++) {
    const samples = buf.getChannelData(ch);
    for (let second = 0; second < dur; second += 2)
      for (let sample = 0; sample < rate * 0.05; sample++)
        samples[second * rate + sample] = 0.6 * Math.sin((2 * Math.PI * 1000 * sample) / rate);
  }
  await sound.add(buf);
  sound.close();
  for (let frame = 0; frame < dur * 30; frame++) {
    ctx.fillStyle = frame % 60 === 0 ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, width, height);
    await video.add(frame / 30, 1 / 30);
  }
  video.close();
  await output.finalize();
  return target.buffer ? new Blob([target.buffer], { type: 'video/mp4' }) : null;
}

/**
 * The mean colour of the frames of `file` at the given times around a point (shares of the frame; the middle by
 * default), decoded as the export decodes them.
 * @param file the video
 * @param times the source times, seconds
 * @param at the point, as shares of the frame's width and height
 * @returns one mean colour per time ([-1, -1, -1] when a frame can't be read); none when the file can't be decoded
 */
export async function decodedColours(
  file: MediaFile,
  times: number[],
  at: [number, number] = [0.5, 0.5],
): Promise<[number, number, number][]> {
  const input = new Input({ source: mediaInput(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const sink = new CanvasSink(track, { poolSize: 1 });
    const out: [number, number, number][] = [];
    for await (const wc of sink.canvasesAtTimestamps(times)) {
      const canvas = wc?.canvas;
      const x = canvas?.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!canvas || !x) {
        out.push([-1, -1, -1]);
        continue;
      }
      const px = Math.max(0, Math.min(canvas.width - 16, Math.round(canvas.width * at[0]) - 8)),
        py = Math.max(0, Math.min(canvas.height - 16, Math.round(canvas.height * at[1]) - 8));
      out.push(meanRgb(x.getImageData(px, py, 16, 16).data));
    }
    return out;
  } finally {
    input.dispose();
  }
}

/**
 * A W×H JPEG photo for test clips: a gradient with a few shapes, different per index.
 * @param index which photo (colours and shapes vary with it)
 * @param width its width, px
 * @param height its height, px
 * @returns the JPEG and the editor's preview copy of it
 */
export async function testPhoto(
  index: number,
  width = 1600,
  height = 1067,
): Promise<{ blob: Blob; still: HTMLCanvasElement }> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const x = context2d(canvas);
  const gradient = x.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${(index * 47) % 360} 60% 55%)`);
  gradient.addColorStop(1, `hsl(${(index * 47 + 120) % 360} 50% 30%)`);
  x.fillStyle = gradient;
  x.fillRect(0, 0, width, height);
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.beginPath();
  x.arc(width * (0.2 + (index % 5) * 0.15), height * 0.4, height * 0.2, 0, Math.PI * 2);
  x.fill();
  const blob = await canvasBlob(canvas, 'image/jpeg', 0.85);
  // The editor previews photos from a copy of at most 1080 px (state/video.ts PREVIEW_MAX).
  const scale = 1080 / Math.max(width, height);
  const still = document.createElement('canvas');
  still.width = Math.round(width * scale);
  still.height = Math.round(height * scale);
  context2d(still).drawImage(canvas, 0, 0, still.width, still.height);
  return { blob, still };
}

/* ---------- 203: overlay fixtures (AC-6, AC-13) ---------- */

/**
 * Each clip's picture in the placement checks: the film for a video, else a test photo picked by its id (the same for
 * both paths compared: placement is what's compared, not decoding).
 * @param clip the clip
 * @param film the video clips' picture
 * @param photos the test photos
 * @returns the picture
 */
function pictureOf(
  clip: { kind: string; id: string },
  film: HTMLCanvasElement,
  photos: readonly { still: HTMLCanvasElement }[],
): HTMLCanvasElement {
  if (clip.kind === 'video') return film;
  const sum = Array.from(clip.id).reduce((total, ch) => total + ch.charCodeAt(0), 0);
  return cycleOf(photos, sum, 'test photo').still;
}

/**
 * Some of the 2.x project shapes (timeline.testkit), by name.
 * @param fixtures all of them
 * @param names the ones wanted
 * @returns the wanted ones by name
 * @throws when one is missing
 */
function pickFixtures<T>(fixtures: Record<string, T>, names: readonly string[]): Record<string, T> {
  return Object.fromEntries(names.map((name) => [name, required(fixtures[name], `${name} fixture`)]));
}

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

/** 203 AC-6's overlay fixture at one format: the project, its sample frames and the colours its clips show. */
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

/**
 * An overlay fixture's tracks: the picture tracks bottom first (drawing order), then the music.
 * @param count how many overlay tracks
 * @returns the tracks
 */
export const overlayTracks = (count = 2): Track[] => [
  { id: 'V1', kind: 'video', name: 'Video', hidden: false, muted: false, locked: false },
  ...Array.from({ length: count }, (_, index) => ({
    id: `V${index + 2}`,
    kind: 'overlay' as const,
    name: `Overlay ${index + 1}`,
    hidden: false,
    muted: false,
    locked: false,
  })),
  { id: 'A1', kind: 'audio', name: 'Music', hidden: false, muted: false, locked: false },
];

/**
 * A W×H PNG of one flat colour (exact after decoding, unlike a JPEG), and the canvas it was drawn on.
 * @param rgb its colour
 * @param width its width, px
 * @param height its height, px
 * @returns the PNG and the canvas
 */
async function flatPhoto(
  rgb: readonly number[],
  width = 400,
  height = 300,
): Promise<{ blob: Blob; still: HTMLCanvasElement }> {
  const still = document.createElement('canvas');
  still.width = width;
  still.height = height;
  const x = context2d(still);
  x.fillStyle = `rgb(${rgb.join(',')})`;
  x.fillRect(0, 0, width, height);
  const blob = await canvasBlob(still);
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
 * @param format the frame's shape
 * @returns the fixture, or null
 */
export async function makeOverlayProject(format: '9:16' | '16:9'): Promise<OverlayFixture | null> {
  const files = await overlayFiles();
  if (!files) return null;
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const [width, height] = OVERLAY_SIZES[format];
  const fps = OVERLAY_FPS;
  const tfs: Record<string, ClipTransform | undefined> = {
    photo: { x: 0.4, y: 0.6, w: 0.5, rot: 15, opacity: 1, radius: 0.1 },
    edge: { x: 0.9, y: 0.15, w: 0.5, rot: 0, opacity: 1, radius: 0 },
    face: { ...presetTransform('top-right', width, height), opacity: 0.5 },
  };
  const clips: OverlayClip[] = OVERLAY_PLAN.map(([id, track, kind, , f0, f1, inT]) => {
    const file = required(files.get(id), `source ${id}`);
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
    width: width,
    height: height,
    fps,
    project: { tracks: overlayTracks(2), clips, audio: [], layers: [], fadeOut: false },
    frames: [...OVERLAY_FRAMES],
    times: OVERLAY_FRAMES.map((frame) => frame / fps),
    clips: expect,
    colourAt(id, time) {
      const expected = expect.find((entry) => entry.id === id);
      const frame = Math.floor(time * fps + 1e-6);
      if (!expected || frame < expected.first || frame > expected.last) return null;
      if (expected.kind === 'photo') return codeColour(0, expected.code);
      return codeColour(Math.floor((expected.in + time - expected.first / fps) * fps + 1e-6), expected.code);
    },
  };
}

/** 203 AC-13's 2-minute 1080p fixture with two overlay tracks. */
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
/**
 * Made once per run: the build check and the export checks (T032) share it.
 * @returns the fixture, or null
 */
export const makeLongOverlayProject = (): Promise<LongOverlayFixture | null> =>
  (longOverlay ??= buildLongOverlayProject());
async function buildLongOverlayProject(): Promise<LongOverlayFixture | null> {
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const WIDTH = 1920,
    HEIGHT = 1080,
    fps = OVERLAY_FPS;
  const t0 = performance.now();
  const sources: Blob[] = [];
  for (const code of [0, 1, 2]) {
    const blob = await makeTestClip(6, WIDTH, HEIGHT, 2, false, code);
    if (!blob) return null;
    sources.push(blob);
  }
  const made = performance.now() - t0;
  const left = presetTransform('bottom-left', WIDTH, HEIGHT);
  const right: ClipTransform = { ...presetTransform('top-right', WIDTH, HEIGHT), opacity: 0.5 };
  const lane = (track: string, count: number, len: number, every: number, from: number, tf?: ClipTransform) =>
    Array.from({ length: count }, (_, index): OverlayClip => {
      const inT = Math.round(((index * 0.3) % 1) * fps) / fps;
      return {
        id: `${track}-${index}`,
        track,
        start: from + index * every,
        kind: 'video',
        dur: 0,
        in: inT,
        out: inT + len,
        edit: { ...DEFAULT_EDIT },
        motion: 'none',
        fade: false,
        file: entryAt(sources, Number(track.slice(1)) - 1, 'source'),
        volume: 0,
        ...(tf ? { tf } : {}),
      };
    });
  const clips = [...lane('V1', 24, 5, 5, 0), ...lane('V2', 20, 5, 6, 0.5, left), ...lane('V3', 24, 4, 5, 1, right)];
  return {
    width: WIDTH,
    height: HEIGHT,
    fps,
    project: { tracks: overlayTracks(2), clips, audio: [], layers: [], fadeOut: false },
    sources,
    made,
  };
}

/**
 * A mono 16-bit 48 kHz WAV tone, for music in export checks.
 * @param seconds its length
 * @param rate its sample rate, Hz
 * @returns the WAV file
 */
function toneWav(seconds = 2, rate = 48000): Blob {
  const samples = Math.round(seconds * rate),
    buf = new ArrayBuffer(44 + samples * 2),
    view = new DataView(buf);
  const str = (offset: number, text: string) =>
    Array.from(text).forEach((ch, index) => view.setUint8(offset + index, ch.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let sample = 0; sample < samples; sample++)
    view.setInt16(44 + sample * 2, Math.round(Math.sin((sample / rate) * 2 * Math.PI * 440) * 8000), true);
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Does an MP4 carry an AAC sound track?
 * @param mp4 the file
 * @returns whether it has an `mp4a` track
 */
const hasSound = async (mp4: Blob) => new TextDecoder('latin1').decode(await mp4.arrayBuffer()).includes('mp4a');

/**
 * AC-3 and AC-9 (201). Pixel identity: for 2.x project shapes at 9:16, 4:5, 1:1 and 16:9 (with layers, fades, the
 * fade-out and music), the frame at 10 times drawn through the frozen 2.x placement (legacyTimeline / legacyClipAt)
 * and through the track model (videoAt) must be the same bytes. Then the hidden video track (black with the layers, in
 * the preview's renderFrame and in a decoded export) and the muted music track (no sound in the export).
 * @param check records a check
 * @returns notes for the report
 */
async function trackChecks(check: Check): Promise<string[]> {
  const { renderFrame, NO_PICTURE } = await import('@/engine/video');
  const { legacyClipAt, legacyFixtures, legacyTimeline, legacyTotal } = await import('../support/timeline.testkit');
  const { MAIN_VIDEO, MUSIC, defaultTracks } = await import('@/engine/tracks');
  const { audioPlan } = await import('@/engine/soundPlan');
  const { framePlan, pack, projectLength, videoAt } = await import('@/engine/timeline');
  const { newShape } = await import('@/engine/layers');
  const { encodeVideo } = await import('@/engine/videoExport');
  const notes: string[] = [];
  const photos = await Promise.all([0, 1, 2].map((index) => testPhoto(index, 640, 427)));
  const film = document.createElement('canvas');
  film.width = 320;
  film.height = 240;
  const fx = context2d(film);
  fx.fillStyle = '#3a7bd5';
  fx.fillRect(0, 0, 320, 240);
  fx.fillStyle = '#ffd166';
  fx.fillRect(40, 60, 120, 90);
  // Each clip's picture: the same source for both paths (placement is what's compared, not decoding).
  const srcOf = (clip: { kind: string; id: string }) => pictureOf(clip, film, photos);
  const canvas = (width: number, height: number) => {
    const element = document.createElement('canvas');
    element.width = width;
    element.height = height;
    return context2d(element, { willReadFrequently: true });
  };

  const fx2 = legacyFixtures();
  const shapes = pickFixtures(fx2, ['photoOnly', 'mixed', 'musicOffset', 'timedLayers', 'noFadeOut']);
  const formats: [string, number, number][] = [
    ['9:16', 270, 480],
    ['4:5', 270, 338],
    ['1:1', 270, 270],
    ['16:9', 480, 270],
  ];
  let frames = 0;
  for (const [ratio, width, height] of formats) {
    const legacyContext = canvas(width, height),
      trackContext = canvas(width, height);
    const bad: string[] = [];
    for (const [name, lp] of Object.entries(shapes)) {
      const tl = legacyTimeline(lp.clips),
        total = legacyTotal(lp.clips);
      const project = {
        tracks: defaultTracks(),
        clips: pack(lp.clips.map((clip) => ({ ...clip, track: MAIN_VIDEO, start: 0 }))),
        audio: [],
        layers: lp.layers,
        fadeOut: lp.fadeOut,
      };
      // 10 times: the cuts (and just before them), then evenly through the video.
      const cuts = tl.slice(1).flatMap((placed) => [placed.start, placed.start - 1e-4]);
      const times = [
        ...cuts.slice(0, 4),
        ...Array.from({ length: 10 }, (_, step) => (step / 9) * (total - 1e-3)),
      ].slice(0, 10);
      for (const time of times) {
        const legacy = required(legacyClipAt(tl, time), 'legacy clip');
        const source = legacy.clip.kind === 'video' ? film : srcOf(legacy.clip);
        renderFrame(
          legacyContext,
          width,
          height,
          legacy.clip,
          source,
          source.width,
          source.height,
          time - legacy.start,
          lp.layers,
          time,
          total,
          lp.fadeOut,
        );
        const placed = required(videoAt(project, time), 'clip at the time');
        const s2 = placed.clip.kind === 'video' ? film : srcOf(placed.clip);
        renderFrame(
          trackContext,
          width,
          height,
          placed.clip,
          s2,
          s2.width,
          s2.height,
          placed.local,
          project.layers,
          time,
          projectLength(project),
          project.fadeOut,
        );
        const da = legacyContext.getImageData(0, 0, width, height).data,
          db = trackContext.getImageData(0, 0, width, height).data;
        let diff = 0;
        for (let index = 0; index < da.length; index++) if (da[index] !== db[index]) diff++;
        if (diff) bad.push(`${name} at ${time.toFixed(4)} s: ${diff} bytes`);
        frames++;
      }
    }
    check(
      !bad.length,
      `video: preview frames at ${ratio} are pixel-identical to 2.x (5 projects × 10 times)${firstFew(bad)}`,
    );
  }
  notes.push(`video: ${frames} frames compared with the 2.x placement, pixel for pixel`);

  // Hidden video track in the preview: black, with the layers on top.
  const red = { ...newShape('rect'), fill: '#ff0000', x: 0.5, y: 0.5, w: 0.3, h: 0.3 };
  const lp = required(fx2.mixed, 'mixed fixture');
  const shown = {
    tracks: defaultTracks(),
    clips: pack(lp.clips.map((clip) => ({ ...clip, track: MAIN_VIDEO, start: 0 }))),
    audio: [],
    layers: [red],
    fadeOut: false,
  };
  const hidden = { ...shown, tracks: shown.tracks.map((tr) => (tr.id === MAIN_VIDEO ? { ...tr, hidden: true } : tr)) };
  const context = canvas(270, 480);
  const pick = (x: number, y: number) =>
    meanRgb(context.getImageData(Math.round(270 * x), Math.round(480 * y), 1, 1).data);
  const hp = videoAt(hidden, 4);
  renderFrame(context, 270, 480, hp?.clip ?? NO_PICTURE, null, 0, 0, 4, hidden.layers, 4, projectLength(hidden), false);
  const corner = pick(0.05, 0.05),
    middle = pick(0.5, 0.5);
  check(
    hp === null && corner.every((channel) => channel < 4) && middle[0] > 240 && middle[1] < 16 && middle[2] < 16,
    `video: a hidden video track draws black with the layers on top (corner ${corner.join('/')}, layer ${middle.join('/')})`,
  );

  // The export: hidden → black frames with the layers; muted music → no sound track; shown and heard otherwise.
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const shownEdit = { ...DEFAULT_EDIT };
  const job = (tracks: ReturnType<typeof defaultTracks>, music: boolean) => ({
    tracks,
    clips: pack(
      [0, 1].map((index) => ({
        id: `x${index}`,
        track: MAIN_VIDEO,
        start: 0,
        kind: 'photo' as const,
        dur: 0.5,
        in: 0,
        out: 0,
        edit: shownEdit,
        motion: 'none' as const,
        fade: false,
        file: entryAt(photos, index, 'test photo').blob,
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
  const hiddenMp4 = required(await encodeVideo(job(off('hidden', MAIN_VIDEO), false)), 'export');
  const hiddenCorner = (await decodedColours(hiddenMp4, [0.5], [0.08, 0.08])).at(0),
    hiddenMiddle = (await decodedColours(hiddenMp4, [0.5])).at(0);
  const shownMp4 = required(await encodeVideo(job(defaultTracks(), false)), 'export');
  const shownCorner = (await decodedColours(shownMp4, [0.5], [0.08, 0.08])).at(0);
  const describe = (colour?: readonly number[]) => colour?.map(Math.round).join('/') ?? 'none';
  check(
    hiddenCorner?.every((channel) => channel < 12) &&
      hiddenMiddle !== undefined &&
      hiddenMiddle[0] > 200 &&
      hiddenMiddle[1] < 50 &&
      shownCorner?.some((channel) => channel > 30),
    `video: an export with the video track hidden is black with the layers (corner ${describe(hiddenCorner)}, layer ${describe(hiddenMiddle)}; shown corner ${describe(shownCorner)})`,
  );
  const heard = await encodeVideo(job(defaultTracks(), true)),
    muted = await encodeVideo(job(off('muted', MUSIC), true));
  const mutedPlan = audioPlan({ ...job(off('muted', MUSIC), true) });
  check(
    (await hasSound(required(heard, 'export'))) &&
      !(await hasSound(required(muted, 'export'))) &&
      mutedPlan.length === 0,
    'video: an export with the music track muted has no music (no sound track here: the photos have none); unmuted it has',
  );

  // AC-4 (202): a 1.5 s gap between two 1 s photos (Magnetic off) plays black with the layers, for 45 frames at 30 fps,
  // and the photos either side are still there.
  const base = job(defaultTracks(), false);
  const gapJob = { ...base, clips: base.clips.map((clip, index) => ({ ...clip, dur: 1, start: index ? 2.5 : 0 })) };
  const plan = framePlan(gapJob, 30);
  const black = plan.filter((span) => !span.clip).reduce((sum, span) => sum + span.f1 - span.f0, 0);
  const gapMp4 = required(await encodeVideo(gapJob), 'export');
  const times = [0.5, 1.75, 3];
  const [corners, middles] = [await decodedColours(gapMp4, times, [0.08, 0.08]), await decodedColours(gapMp4, times)];
  const lit = (colour?: number[]) => !!colour?.some((channel) => channel > 30);
  const dark = (colour?: number[]) => !!colour?.every((channel) => channel < 12);
  const redish = (colour?: readonly [number, number, number]) =>
    !!colour && colour[0] > 200 && colour[1] < 50 && colour[2] < 50;
  check(
    black === 45 &&
      plan.length === 3 &&
      lit(corners[0]) &&
      dark(corners[1]) &&
      redish(middles[1]) &&
      lit(corners[2]) &&
      projectLength(gapJob) === 3.5,
    `video: a 1.5 s gap exports 45 black frames with the layers, between the photos (${black} gap frames; corners ${corners.map((colour) => colour.map(Math.round).join('/')).join(' ')}; layer in the gap ${middles[1]?.map(Math.round).join('/')})`,
  );
  return notes;
}

/**
 * The median of some numbers.
 * @param xs the numbers
 * @returns the middle one once sorted (the upper of two), NaN for none
 */
const median = (xs: number[]) =>
  xs
    .slice()
    .sort((left, right) => left - right)
    .at(Math.floor(xs.length / 2)) ?? NaN;

/**
 * AC-5's timing (201): a 60-clip 1080p YouTube project (0.4 s photos, every tenth clip a video), with the GPU path as
 * the app opens it. The preview: the frame at 300 times through the editor's own path (the clip at t, then
 * renderFrame); the export: the whole video encoded in memory. Median of 3 each.
 * @param clip a test clip, for the video clips
 * @returns the timing note
 */
async function videoTiming(clip: Blob): Promise<string> {
  const { renderFrame } = await import('@/engine/video');
  const { encodeVideo } = await import('@/engine/videoExport');
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const { MAIN_VIDEO, defaultTracks } = await import('@/engine/tracks');
  const { pack, projectLength, videoAt } = await import('@/engine/timeline');
  const { openGpu, gpu } = await import('@/engine/gpu/device');
  await openGpu();
  const WIDTH = 1920,
    HEIGHT = 1080;
  const photos = await Promise.all(Array.from({ length: 6 }, (_, index) => testPhoto(index)));
  const frame = document.createElement('canvas');
  frame.width = 320;
  frame.height = 240;
  const decoded = (await decodedColours(clip, [0.2])).length ? frame : null;
  const clips = pack(
    Array.from({ length: 60 }, (_, index) => {
      const video = index % 10 === 9;
      const photo = cycleOf(photos, index, 'test photo');
      return {
        id: `c${index}`,
        track: MAIN_VIDEO,
        start: 0,
        kind: video ? ('video' as const) : ('photo' as const),
        dur: video ? 0 : 0.4,
        in: 0,
        out: video ? 0.4 : 0,
        edit: { ...DEFAULT_EDIT },
        motion: video ? ('none' as const) : ('zoom-in' as const),
        fade: index % 7 === 0,
        file: video ? clip : photo.blob,
        volume: 1,
        still: video ? decoded : photo.still,
      };
    }),
  );
  const project = { tracks: defaultTracks(), clips, audio: [], layers: [], fadeOut: true };
  const total = projectLength(project);
  const ctx = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    return context2d(canvas);
  })();
  const previewRuns: number[] = [];
  for (let run = 0; run < 3; run++) {
    const each: number[] = [];
    for (let step = 0; step < 300; step++) {
      const time = (step / 300) * total;
      const s0 = performance.now();
      const placed = videoAt(project, time);
      if (placed) {
        const src = placed.clip.still;
        renderFrame(
          ctx,
          WIDTH,
          HEIGHT,
          placed.clip,
          src,
          src?.width ?? 0,
          src?.height ?? 0,
          placed.local,
          [],
          time,
          total,
          true,
        );
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
      width: WIDTH,
      height: HEIGHT,
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

/**
 * The video editor's checks. Returns notes for the report.
 * @param check records a check
 * @returns notes for the report
 */
export async function videoChecks(check: Check): Promise<string[]> {
  const notes: string[] = [];
  const t0 = performance.now();
  const clip = await makeTestClip();
  check(clip && clip.size > 1000, 'video: a test clip is made in memory');
  if (!clip) return ['video: this engine cannot encode H.264; video clip checks skipped'];
  const made = performance.now() - t0;
  const times = [0, 0.5, 1, 1.5, 1.95];
  const got = await decodedColours(clip, times);
  const near = got.length === times.length && times.every((time, index) => isNear(got.at(index), clipColour(time, 2)));
  check(
    near,
    `video: the test clip decodes to its colours at ${times.join(', ')} s (${got.map((colour) => colour.map(Math.round).join('/')).join(' ')})`,
  );
  notes.push(`video: test clip ${(clip.size / 1024).toFixed(0)} KB made in ${made.toFixed(0)} ms`);

  // 204's fixtures: a textured 1080p clip with a key frame every 2 s (Q9) and the sync clip (AC-8).
  const t1 = performance.now();
  const hd = await makeTestClip(4, 1920, 1080, 2, true);
  const hdMade = performance.now() - t1;
  const hdTimes = [0, 1.9, 2, 3.95];
  const hdGot = hd ? await decodedColours(hd, hdTimes) : [];
  check(
    hdGot.length === hdTimes.length && hdTimes.every((time, index) => isNear(hdGot.at(index), clipColour(time, 4))),
    `video: a textured 1080p test clip with 2 s key frames decodes to its colours (${hdGot.map((colour) => colour.map(Math.round).join('/')).join(' ')})`,
  );
  const t2 = performance.now();
  const sync = await makeSyncClip(4);
  const syncMade = performance.now() - t2;
  const flashes = sync ? await decodedColours(sync, [0, 0.5, 2, 2.5]) : [];
  check(
    !!sync &&
      (await hasSound(sync)) &&
      flashes.length === 4 &&
      flashes.every((colour, index) =>
        index % 2 ? colour.every((channel) => channel < 12) : colour.every((channel) => channel > 240),
      ),
    `video: the sync clip has sound and a white frame every 2 s (${flashes.map((colour) => Math.round(colour[0])).join(' ')})`,
  );
  notes.push(
    `video: 204 fixtures: textured 1080p 4 s ${((hd?.size ?? 0) / 1e6).toFixed(1)} MB in ${hdMade.toFixed(0)} ms; sync clip 4 s in ${syncMade.toFixed(0)} ms`,
  );
  try {
    notes.push(...(await trackChecks(check)));
  } catch (error) {
    check(false, `video track checks threw: ${messageOf(error)}`);
  }
  try {
    notes.push(await videoTiming(clip));
  } catch (error) {
    check(false, `video timing threw: ${messageOf(error)}`);
  }
  return notes;
}

/**
 * Do a track's clips follow one another without overlapping?
 * @param clips the clips
 * @returns whether no two on one track overlap
 */
const noOverlaps = (clips: OverlayClip[]) => {
  const end = (clip: OverlayClip) => clip.start + (clip.kind === 'photo' ? clip.dur : clip.out - clip.in);
  const tracks = new Set(clips.map((clip) => clip.track));
  return [...tracks].every((tr) => {
    const on = clips.filter((clip) => clip.track === tr).sort((left, right) => left.start - right.start);
    return on.every((clip, index) => {
      const previous = on.at(index - 1);
      return !index || !previous || clip.start >= end(previous) - 1e-9;
    });
  });
};

/**
 * The most video clips on screen at once (a sweep over the clips' intervals).
 * @param clips the clips
 * @returns the largest number of videos showing at one time
 */
function videosAtOnce(clips: OverlayClip[]): number {
  const ev = clips
    .filter((clip) => clip.kind === 'video')
    .flatMap((clip): [number, number][] => [
      [clip.start, 1],
      [clip.start + clip.out - clip.in, -1],
    ])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let showing = 0,
    most = 0;
  for (const [, change] of ev) {
    showing += change;
    most = Math.max(most, showing);
  }
  return most;
}

/**
 * 203 T002: the overlay fixtures build. AC-6's at 9:16 and 16:9: the main track then two overlay tracks, no clip
 * overlapping another on its track, every clip's first and last frame among the 8 samples, every (clip, sample) colour
 * at least 13 levels from every other, and each source decodes to the colour the fixture expects at its first and
 * last frame (named back to its clip and frame). AC-13's: 2 minutes, three video tracks with three videos at once, its
 * sources decoding to their codes. One check per fixture. Returns notes for the report.
 * @param check records a check
 * @returns notes for the report
 */
export async function overlayFixtureChecks(check: Check): Promise<string[]> {
  const notes: string[] = [];
  const t0 = performance.now();
  for (const format of ['9:16', '16:9'] as const) {
    const fx = await makeOverlayProject(format);
    if (!fx) {
      notes.push(`video: 203 overlay fixture ${format} skipped (no H.264 encoder)`);
      continue;
    }
    const bad: string[] = [];
    const kinds = fx.project.tracks.map((track) => `${track.id}:${track.kind}`).join(' ');
    if (kinds !== 'V1:video V2:overlay V3:overlay A1:audio') bad.push(`tracks ${kinds}`);
    if (!noOverlaps(fx.project.clips)) bad.push('clips overlap on a track');
    if (fx.frames.length !== 8) bad.push(`${fx.frames.length} sample frames`);
    for (const expected of fx.clips)
      if (!fx.frames.includes(expected.first) || !fx.frames.includes(expected.last))
        bad.push(`${expected.id}'s first or last frame not sampled`);
    const boxOf = (id: string) =>
      required(
        fx.clips.find((expected) => expected.id === id),
        `clip ${id}`,
      ).tf;
    const [broll, face, photo, edge] = [boxOf('broll'), boxOf('face'), boxOf('photo'), boxOf('edge')];
    if (
      broll.w !== 1 ||
      face.opacity !== 0.5 ||
      photo.rot !== 15 ||
      Math.abs(photo.radius - 0.1) > 1e-9 ||
      edge.x + edge.w / 2 <= 1
    )
      bad.push('transforms');
    // Every colour a sample can show, distinct from every other.
    const shown = fx.clips.flatMap((expected) =>
      fx.times.flatMap((time) => {
        const col = fx.colourAt(expected.id, time);
        return col ? [{ id: expected.id, t: time, col }] : [];
      }),
    );
    for (const [firstIndex, first] of shown.entries())
      for (const second of shown.slice(firstIndex + 1))
        if (first.id !== second.id && isNear(first.col, second.col, 12))
          bad.push(`${first.id} at ${first.t.toFixed(3)} and ${second.id} at ${second.t.toFixed(3)} look alike`);
    // Each source at its first and last frame decodes to the expected colour, which names its clip and frame.
    for (const expected of fx.clips) {
      const clip = required(
        fx.project.clips.find((x) => x.id === expected.id),
        'clip',
      );
      const ends = [expected.first, expected.last].map((frame) => frame / fx.fps);
      const exp = ends.map((time) => required(fx.colourAt(expected.id, time), 'reference colour'));
      let got: (readonly number[])[];
      if (expected.kind === 'photo') {
        // The file the preview and the export load, decoded (not the still drawn from it).
        const bmp = await createImageBitmap(blobFile(clip.file));
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const x = context2d(cv, { willReadFrequently: true });
        x.drawImage(bmp, 10, 10, 1, 1, 0, 0, 1, 1);
        bmp.close();
        const pixel = meanRgb(x.getImageData(0, 0, 1, 1).data);
        got = [pixel, pixel];
      } else
        got = await decodedColours(
          clip.file,
          ends.map((time) => expected.in + time - clip.start + 0.5 / fx.fps),
        );
      ends.forEach((endTime, endIndex) => {
        const wanted = entryAt(exp, endIndex, 'reference colour');
        const decodedColour = got.at(endIndex),
          named = decodedColour && nameCode(decodedColour);
        const frame = expected.kind === 'photo' ? 0 : Math.floor((expected.in + endTime - clip.start) * fx.fps + 1e-6);
        if (!named || !isNear(decodedColour, wanted) || named.clip !== expected.code || named.frame !== frame)
          bad.push(
            `${expected.id} at ${endTime.toFixed(3)} s: ${decodedColour?.map(Math.round).join('/')} (want ${wanted.join('/')}, frame ${frame})`,
          );
      });
    }
    check(
      !bad.length,
      `video: 203's overlay fixture builds at ${format} (main + 2 overlay tracks, 6 clips, 8 samples, colours name clip and frame)${firstFew(bad)}`,
    );
  }
  notes.push(
    `video: 203 overlay fixtures (9:16, 16:9) built and checked in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );

  const t1 = performance.now();
  const long = await makeLongOverlayProject();
  if (!long) return [...notes, 'video: 203 long overlay fixture skipped (no 1080p H.264 encoder)'];
  const built = performance.now() - t1;
  const { clips } = long.project;
  const end = Math.max(...clips.map((clip) => clip.start + clip.out - clip.in));
  const per = ['V1', 'V2', 'V3'].map((tr) => clips.filter((clip) => clip.track === tr).length);
  const decoded = await Promise.all(long.sources.map((source) => decodedColours(source, [0.5 / 30, 179.5 / 30])));
  const named = decoded.map((cs) => cs.map((colour) => nameCode(colour)));
  const codesOk = named.every(
    (ns, code) =>
      ns.length === 2 &&
      ns.at(0)?.clip === code &&
      ns.at(0)?.frame === 0 &&
      ns.at(1)?.clip === code &&
      ns.at(1)?.frame === 179 &&
      ns.every((codeName) => codeName.off <= 8),
  );
  const sourceCodes = named
    .map((ns) => ns.map((codeName) => `${codeName.clip}:${codeName.frame}±${codeName.off.toFixed(0)}`).join(','))
    .join(' ');
  check(
    Math.abs(end - 120) < 1e-6 &&
      per.join() === '24,20,24' &&
      noOverlaps(clips) &&
      videosAtOnce(clips) === 3 &&
      codesOk,
    `video: 203's 2-minute 1080p overlay fixture builds (${end.toFixed(1)} s, clips ${per.join('/')}, ${videosAtOnce(clips)} videos at once, sources ${sourceCodes})`,
  );
  notes.push(
    `video: 203 long overlay fixture: 3 sources of 6 s 1920×1080 (${(long.sources.reduce((sum, source) => sum + source.size, 0) / 1e6).toFixed(1)} MB) encoded in ${(long.made / 1000).toFixed(1)} s, built and checked in ${((performance.now() - t1) / 1000).toFixed(1)} s (${(built / 1000).toFixed(1)} s to build)`,
  );
  return notes;
}

/* ---------- 203: drawing a stack of clips (AC-6, AC-7, AC-10, D2) ---------- */

/**
 * THE 202 REFERENCE — never edit. engine/video.ts renderFrame as of 284b688 (before 203 made it renderStack with one
 * item), so AC-10 compares renderStack with the old drawing and not with itself. motionEdit, fadeAmount, renderIg and
 * drawLayers are shared: 203 doesn't change them.
 * @param ctx the canvas to draw on
 * @param width the frame's width
 * @param height the frame's height
 * @param clip the clip
 * @param src its picture, or null
 * @param sw the picture's width
 * @param sh the picture's height
 * @param local the time in the clip, seconds
 * @param layers the layers
 * @param time the timeline time, seconds
 * @param total the video's length, seconds
 * @param fadeOut whether the video fades out at its end
 */
function legacyRenderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: FrameClip,
  src: CanvasImageSource | null,
  sw: number,
  sh: number,
  local: number,
  layers: Layer[],
  time: number,
  total: number,
  fadeOut: boolean,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  if (src && sw > 0 && sh > 0) {
    const edit = clip.kind === 'photo' ? motionEdit(clip.edit, clip.motion, local / clipLength(clip)) : clip.edit;
    renderIg(ctx, src, sw, sh, edit, width, height);
  }
  const dark = fadeAmount(local, clip.fade, time, total, fadeOut);
  drawLayers(ctx, layers, width, height, time);
  if (dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.fillRect(0, 0, width, height);
  }
}

type Backend = 'Canvas 2D' | 'webgpu' | 'webgl2';

/**
 * Switches renderIg to a backend (Canvas 2D = no GPU device). False if this machine doesn't have it.
 * @param backend the backend
 * @returns whether it is on
 */
async function switchBackend(backend: Backend): Promise<boolean> {
  const { closeGpu, openGpu } = await import('@/engine/gpu/device');
  closeGpu();
  if (backend === 'Canvas 2D') return true;
  return (await openGpu(backend))?.backend === backend;
}

/**
 * A pixel centre's signed distance (frame pixels) from the edge of a clip's box: its transform's centre, width w·W ×
 * w·H (the frame's aspect, D1), rotation (clockwise) and corner radius (a share of the shorter side). Negative inside.
 * @param tf the clip's box
 * @param width the frame's width
 * @param height the frame's height
 * @param px the pixel centre's x
 * @param py the pixel centre's y
 * @returns the distance, negative inside
 */
function boxDistance(tf: ClipTransform, width: number, height: number, px: number, py: number): number {
  const hw = (tf.w * width) / 2,
    hh = (tf.w * height) / 2,
    radius = tf.radius * Math.min(2 * hw, 2 * hh);
  const angle = (tf.rot * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const dx = px - tf.x * width,
    dy = py - tf.y * height;
  // Back through the rotation into the box's own axes.
  const qx = Math.abs(dx * cos + dy * sin) - (hw - radius),
    qy = Math.abs(-dx * sin + dy * cos) - (hh - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * Compares a drawn frame with the one its flat-coloured items make: black, then each item's colour inside its box
 * blended by its opacity (bottom first), then `dark` (a fade). Pixels within `edge` px of a box edge are skipped
 * (antialiasing); an identity box is the whole frame and has none. Max and mean channel error, pixels compared.
 * @param data the drawn frame's RGBA pixels
 * @param width its width
 * @param height its height
 * @param items each item's box and flat colour, bottom first
 * @param dark the fade to black over it all (0–1)
 * @param edge pixels this close to a box edge are skipped
 * @returns the largest and mean channel error, the pixels compared and where the largest was
 */
export function compareWithReference(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  items: { tf: ClipTransform; rgb: readonly number[] }[],
  dark = 0,
  edge = 2,
): { max: number; mean: number; n: number; where: string } {
  let max = 0,
    sum = 0,
    count = 0,
    where = '';
  const want: [number, number, number] = [0, 0, 0];
  for (let py = 0; py < height; py++)
    pixels: for (let px = 0; px < width; px++) {
      want.fill(0);
      for (const it of items) {
        if (it.tf.opacity <= 0) continue;
        const distance = isIdentity(it.tf) ? -Infinity : boxDistance(it.tf, width, height, px + 0.5, py + 0.5);
        if (Math.abs(distance) < edge) continue pixels;
        if (distance < 0)
          for (let channel = 0; channel < 3; channel++)
            want[channel] = (want.at(channel) ?? 0) * (1 - it.tf.opacity) + (it.rgb.at(channel) ?? NaN) * it.tf.opacity;
      }
      const offset = (py * width + px) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const error = Math.abs((data.at(offset + channel) ?? NaN) - (want.at(channel) ?? 0) * (1 - dark));
        sum += error;
        if (error > max) {
          max = error;
          where = `${px},${py}: ${[...data.slice(offset, offset + 3)].join('/')} want ${want.map((level) => Math.round(level * (1 - dark))).join('/')}`;
        }
      }
      count++;
    }
  return { max, mean: count ? sum / (count * 3) : 0, n: count, where };
}

/**
 * Copies of a video's frames at the given source times, decoded as the export decodes them.
 * @param file the video
 * @param times the source times, seconds
 * @returns one canvas per time (1 × 1 when a frame can't be read); none when the file can't be decoded
 */
async function decodeFrames(file: MediaFile, times: number[]): Promise<HTMLCanvasElement[]> {
  const input = new Input({ source: mediaInput(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const out: HTMLCanvasElement[] = [];
    for await (const wc of new CanvasSink(track).canvasesAtTimestamps(times)) {
      const canvas = document.createElement('canvas');
      canvas.width = wc?.canvas.width ?? 1;
      canvas.height = wc?.canvas.height ?? 1;
      if (wc) context2d(canvas).drawImage(wc.canvas, 0, 0);
      out.push(canvas);
    }
    return out;
  } finally {
    input.dispose();
  }
}

const ctx2d = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return context2d(canvas, { willReadFrequently: true });
};
const bytesDiffering = (left: Uint8ClampedArray, right: Uint8ClampedArray) => {
  let diff = 0;
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) diff++;
  return diff;
};

/**
 * 203's drawing checks, on every backend this machine has (Canvas 2D, WebGPU, WebGL2):
 * - AC-6 golden frames: renderStack of the overlay fixture (9:16, 16:9) at its 8 times, from decoded source frames,
 * matches the reference made from the colour codes (each clip's box, rotation, corners, opacity) within ±8.
 * - AC-7: a full-frame opaque overlay leaves no pixel of the main clip; an overlay at 0 % and a hidden track draw nothing.
 * - D2: an overlay's fade-in ramps its own opacity from 0 over V_FADE; the main clip's darkens the whole frame,
 * overlays and layers included.
 * - AC-10: renderStack with one identity item (no transform, or IDENTITY) and with none (a gap) gives the same bytes as
 * the 202 renderFrame (legacyRenderFrame) on 201's fixtures at 4 ratios and 10 times.
 * Returns notes for the report.
 * @param check records a check
 * @returns notes for the report
 */
export async function stackChecks(check: Check): Promise<string[]> {
  const { renderStack, V_FADE, NO_PICTURE } = await import('@/engine/video');
  const { frameStack } = await import('@/engine/stack');
  const { MAIN_VIDEO, defaultTracks } = await import('@/engine/tracks');
  const { pack, projectLength, videoAt } = await import('@/engine/timeline');
  const { legacyClipAt, legacyFixtures, legacyTimeline, legacyTotal } = await import('../support/timeline.testkit');
  const { closeGpu, gpu, openGpu } = await import('@/engine/gpu/device');
  const notes: string[] = [];
  const t0 = performance.now();
  const before = gpu()?.backend;
  const backends: Backend[] = [];
  for (const backend of ['Canvas 2D', 'webgpu', 'webgl2'] as const)
    if (await switchBackend(backend)) backends.push(backend);

  /* The overlay fixtures and their decoded pictures (the same clips and source frames in both formats). */
  const fixtures = (await Promise.all((['9:16', '16:9'] as const).map((format) => makeOverlayProject(format)))).filter(
    (fixture): fixture is OverlayFixture => !!fixture,
  );
  const fps = OVERLAY_FPS;
  const key = (clip: OverlayClip, local: number) => `${clip.id}@${Math.round((clip.in + local) * fps * 2)}`;
  const pics = new Map<string, HTMLCanvasElement>();
  if (fixtures.length) {
    const fx = entryAt(fixtures, 0, 'overlay fixture');
    const wanted = new Map<OverlayClip, number[]>();
    for (const time of fx.times)
      for (const it of frameStack(fx.project, time))
        if (it.clip.kind === 'video') wanted.set(it.clip, [...(wanted.get(it.clip) ?? []), it.local]);
    for (const [clip, locals] of wanted) {
      // Half a frame in, so a time on a frame boundary can't land on the frame before.
      const got = await decodeFrames(
        clip.file,
        locals.map((local) => clip.in + local + 0.5 / fps),
      );
      locals.forEach((local, index) => {
        const picture = got.at(index);
        if (picture) pics.set(key(clip, local), picture);
      });
    }
  }
  const picOf = (clip: OverlayClip, local: number) => (clip.kind === 'photo' ? clip.still : pics.get(key(clip, local)));
  type Item = Parameters<typeof renderStack>[3][number];
  const itemOf = (clip: OverlayClip, local: number, patch: Partial<OverlayClip> = {}): Item => {
    const src = picOf(clip, local) ?? null;
    return {
      clip: { ...clip, ...patch, overlay: clip.track !== MAIN_VIDEO },
      src,
      sw: src?.width ?? 0,
      sh: src?.height ?? 0,
      local,
    };
  };

  for (const backend of backends) {
    await switchBackend(backend);
    /* AC-6: golden frames. */
    for (const fx of fixtures) {
      const { width: frameWidth, height: frameHeight } = fx;
      const x = ctx2d(frameWidth, frameHeight);
      let max = 0,
        sum = 0,
        count = 0,
        where = '';
      const bad: string[] = [];
      for (const sampleTime of fx.times) {
        const stack = frameStack(fx.project, sampleTime);
        if (stack.some((it) => !picOf(it.clip, it.local))) bad.push(`no picture at ${sampleTime.toFixed(3)} s`);
        renderStack(
          x,
          frameWidth,
          frameHeight,
          stack.map((it) => itemOf(it.clip, it.local)),
          [],
          sampleTime,
          projectLength(fx.project),
          false,
        );
        const ref = stack.map((it) => ({
          tf: required(
            fx.clips.find((expected) => expected.id === it.clip.id),
            'clip',
          ).tf,
          rgb: required(fx.colourAt(it.clip.id, sampleTime), 'reference colour'),
        }));
        const result = compareWithReference(
          x.getImageData(0, 0, frameWidth, frameHeight).data,
          frameWidth,
          frameHeight,
          ref,
        );
        if (result.max > max) [max, where] = [result.max, `frame ${Math.round(sampleTime * fps)} ${result.where}`];
        sum += result.mean * result.n;
        count += result.n;
        if (result.n < frameWidth * frameHeight * 0.95)
          bad.push(`only ${result.n} pixels compared at ${sampleTime.toFixed(3)} s`);
      }
      const mean = count ? sum / count : 0;
      check(
        !bad.length && max <= 8 && mean <= 2,
        `video (${backend}): 203 golden frames at ${fx.format} (main + 2 overlays, 8 times) match the colour-code reference (worst ${max.toFixed(0)} at ${where}, mean ${mean.toFixed(2)})${firstFew(bad)}`,
      );
      notes.push(
        `video (${backend}): 203 golden frames ${fx.format}: worst ${max.toFixed(0)}, mean ${mean.toFixed(2)} levels over ${count} pixels`,
      );
    }

    const fx = fixtures.find((fixture) => fixture.format === '9:16');
    if (!fx) continue;
    const { width, height, project } = fx;
    const total = projectLength(project);
    const clip = (id: string) =>
      required(
        project.clips.find((candidate) => candidate.id === id),
        'clip',
      );
    // Frame 37: m1 under the B-roll and the face-cam.
    const time = 37 / fps;
    const m1 = clip('m1'),
      broll = clip('broll'),
      face = clip('face');
    const faceBox = required(face.tf, 'face-cam box');
    const at = (overlayClip: OverlayClip) => time - overlayClip.start;
    const draw = (items: Item[], layers: Layer[] = []) => {
      const x = ctx2d(width, height);
      renderStack(x, width, height, items, layers, time, total, false);
      return x.getImageData(0, 0, width, height).data;
    };
    const main = itemOf(m1, at(m1));
    const mainOnly = draw([main]);
    const m1rgb = required(fx.colourAt('m1', time), 'reference colour');

    /* AC-7: a full-frame opaque overlay covers the main clip; 0 % and hidden draw nothing. */
    const cov = draw([main, itemOf(broll, at(broll))]);
    const covered = compareWithReference(cov, width, height, [
      { tf: IDENTITY, rgb: required(fx.colourAt('broll', time), 'reference colour') },
    ]);
    let mainPixels = 0;
    for (let offset = 0; offset < cov.length; offset += 4)
      if (isNear(cov.slice(offset, offset + 3), m1rgb)) mainPixels++;
    check(
      covered.max <= 8 && covered.n === width * height && mainPixels === 0,
      `video (${backend}): a full-frame opaque overlay leaves no pixel of the main clip (worst ${covered.max} from the overlay's colour, ${mainPixels} main-clip pixels)`,
    );
    const zero = bytesDiffering(draw([main, itemOf(face, at(face), { tf: { ...faceBox, opacity: 0 } })]), mainOnly);
    const hiddenProject = {
      ...project,
      tracks: project.tracks.map((tr) => (tr.id === MAIN_VIDEO ? tr : { ...tr, hidden: true })),
    };
    const hiddenStack = frameStack(hiddenProject, time);
    const hidden = bytesDiffering(draw(hiddenStack.map((it) => itemOf(it.clip, it.local))), mainOnly);
    check(
      zero === 0 && hidden === 0 && hiddenStack.length === 1,
      `video (${backend}): an overlay at 0 % opacity and hidden overlay tracks draw nothing (${zero} and ${hidden} bytes differ; ${hiddenStack.length} clip drawn)`,
    );

    /* D2: an overlay's fade-in is its opacity; the main clip's darkens everything. The face-cam's picture is the one
     * for frame 37 whatever local time it's given here (picOf by the clip's own time would have none decoded). */
    const facePic = itemOf(face, at(face));
    const faceAt = (local: number): Item => ({
      ...facePic,
      clip: { ...facePic.clip, tf: { ...faceBox, opacity: 1 }, fade: true },
      local,
    });
    const faceRgb = required(fx.colourAt('face', time), 'reference colour');
    const atStart = bytesDiffering(draw([main, faceAt(0)]), mainOnly);
    const ramp = compareWithReference(draw([main, faceAt(V_FADE / 2)]), width, height, [
      { tf: IDENTITY, rgb: m1rgb },
      { tf: { ...faceBox, opacity: 0.5 }, rgb: faceRgb },
    ]);
    const done = compareWithReference(draw([main, faceAt(V_FADE)]), width, height, [
      { tf: IDENTITY, rgb: m1rgb },
      { tf: { ...faceBox, opacity: 1 }, rgb: faceRgb },
    ]);
    check(
      atStart === 0 && ramp.max <= 8 && done.max <= 8,
      `video (${backend}): an overlay's fade-in ramps its own opacity from 0 over ${V_FADE} s (start: ${atStart} bytes differ from no overlay; half way worst ${ramp.max}; done worst ${done.max})`,
    );
    const fading: Item = { ...main, clip: { ...main.clip, fade: true }, local: V_FADE / 2 };
    const darkened = compareWithReference(
      draw([fading, facePic]),
      width,
      height,
      [
        { tf: IDENTITY, rgb: m1rgb },
        { tf: faceBox, rgb: faceRgb },
      ],
      0.5,
    );
    // A see-through clip lays its finished picture down once: the whole photo on a white background at 50 % shows the
    // main clip half through the photo and half through the white, never the white through the photo.
    const photo = clip('photo');
    const fitted = itemOf(photo, 0, {
      edit: { ...photo.edit, fit: 'fit', bg: '#ffffff' },
      tf: { ...faceBox, opacity: 0.5 },
    });
    const seen = draw([main, fitted]);
    const box = faceBox;
    const px = (fx: number, fy: number) => {
      const offset = (Math.floor(fy) * width + Math.floor(fx)) * 4;
      return meanRgb(seen.slice(offset, offset + 4));
    };
    const photoRgb = codeColour(0, 3);
    const inPhoto = px(box.x * width, box.y * height),
      inBand = px(box.x * width, box.y * height - 0.4 * box.w * height);
    const half = (left: readonly number[], right: readonly number[]) =>
      left.map((channel, channelIndex) => (channel + (right.at(channelIndex) ?? NaN)) / 2);
    check(
      isNear(inPhoto, half(m1rgb, photoRgb)) && isNear(inBand, half(m1rgb, [255, 255, 255])),
      `video (${backend}): a see-through clip's background doesn't show through its photo (photo ${inPhoto.join('/')}, want ${half(m1rgb, photoRgb).map(Math.round).join('/')}; background ${inBand.join('/')}, want ${half(m1rgb, [255, 255, 255]).map(Math.round).join('/')})`,
    );
    // A red layer over the face-cam's box: layers sit above every track (pure red), and fade with the main clip.
    const red: Layer = { ...newShape('rect'), fill: '#ff0000', x: faceBox.x, y: faceBox.y, w: 0.1, h: 0.1 };
    const mid = (Math.floor(faceBox.y * height) * width + Math.floor(faceBox.x * width)) * 4;
    const pixel = (pixels: Uint8ClampedArray) => meanRgb(pixels.slice(mid, mid + 4));
    const onTop = pixel(draw([main, facePic], [red]));
    const layer = pixel(draw([fading, facePic], [red]));
    check(
      onTop[0] >= 250 && onTop[1] <= 4 && onTop[2] <= 4,
      `video (${backend}): layers draw above the overlays (a red layer over the face-cam: ${onTop.join('/')})`,
    );
    check(
      darkened.max <= 8 && Math.abs(layer[0] - 128) <= 8 && layer[1] <= 8 && layer[2] <= 8,
      `video (${backend}): the main clip's fade-in darkens the whole frame, overlays and layers included (worst ${darkened.max}; red layer at half fade ${layer.join('/')})`,
    );
  }

  /* AC-10: one identity item (or none, in a gap) draws exactly as the 202 renderFrame. */
  const photos = await Promise.all([0, 1, 2].map((index) => testPhoto(index, 640, 427)));
  const film = document.createElement('canvas');
  film.width = 320;
  film.height = 240;
  const fl = context2d(film);
  fl.fillStyle = '#3a7bd5';
  fl.fillRect(0, 0, 320, 240);
  fl.fillStyle = '#ffd166';
  fl.fillRect(40, 60, 120, 90);
  const srcOf = (clip: { kind: string; id: string }) => pictureOf(clip, film, photos);
  const lf = legacyFixtures();
  const shapes = pickFixtures(lf, ['photoOnly', 'videoOnly', 'mixed', 'musicOffset', 'timedLayers', 'noFadeOut']);
  const formats: [string, number, number][] = [
    ['9:16', 270, 480],
    ['4:5', 270, 338],
    ['1:1', 270, 270],
    ['16:9', 480, 270],
  ];
  let frames = 0;
  for (const backend of backends) {
    await switchBackend(backend);
    const bad: string[] = [];
    for (const [ratio, width, height] of formats) {
      const legacyContext = ctx2d(width, height),
        stackContext = ctx2d(width, height);
      for (const [name, lp] of Object.entries(shapes)) {
        const tl = legacyTimeline(lp.clips),
          total = legacyTotal(lp.clips);
        const project = {
          tracks: defaultTracks(),
          clips: pack(lp.clips.map((clip) => ({ ...clip, track: MAIN_VIDEO, start: 0 }))),
          audio: [],
          layers: lp.layers,
          fadeOut: lp.fadeOut,
        };
        const len = projectLength(project);
        const cuts = tl.slice(1).flatMap((placed) => [placed.start, placed.start - 1e-4]);
        // 10 times: the cuts (and just before them), into the video's fade-out, then evenly through the video.
        const even = Array.from({ length: 10 }, (_, step) => (step / 9) * (total - 1e-3));
        const times = [...cuts.slice(0, 3), total - V_FADE / 2, total - 1e-3, ...even].slice(0, 10);
        for (const time of times) {
          const legacy = required(legacyClipAt(tl, time), 'legacy clip');
          const source = srcOf(legacy.clip);
          legacyRenderFrame(
            legacyContext,
            width,
            height,
            legacy.clip,
            source,
            source.width,
            source.height,
            time - legacy.start,
            lp.layers,
            time,
            total,
            lp.fadeOut,
          );
          const want = legacyContext.getImageData(0, 0, width, height).data;
          const placed = required(videoAt(project, time), 'clip at the time');
          const s2 = srcOf(placed.clip);
          for (const [variant, clip] of [
            ['no transform', { ...placed.clip, overlay: false }],
            ['IDENTITY', { ...placed.clip, tf: { ...IDENTITY }, overlay: false }],
          ] as const) {
            renderStack(
              stackContext,
              width,
              height,
              [{ clip, src: s2, sw: s2.width, sh: s2.height, local: placed.local }],
              project.layers,
              time,
              len,
              project.fadeOut,
            );
            const diff = bytesDiffering(want, stackContext.getImageData(0, 0, width, height).data);
            if (diff) bad.push(`${ratio} ${name} (${variant}) at ${time.toFixed(4)} s: ${diff} bytes`);
            frames++;
          }
          // A gap (or the hidden video track): nothing under the layers.
          legacyRenderFrame(
            legacyContext,
            width,
            height,
            NO_PICTURE,
            null,
            0,
            0,
            time,
            lp.layers,
            time,
            total,
            lp.fadeOut,
          );
          renderStack(stackContext, width, height, [], project.layers, time, len, project.fadeOut);
          const diff = bytesDiffering(
            legacyContext.getImageData(0, 0, width, height).data,
            stackContext.getImageData(0, 0, width, height).data,
          );
          if (diff) bad.push(`${ratio} ${name} (gap) at ${time.toFixed(4)} s: ${diff} bytes`);
          frames++;
        }
      }
    }
    check(
      !bad.length,
      `video (${backend}): renderStack with one identity item or none is pixel-identical to the 202 renderFrame (6 projects × 4 ratios × 10 times)${firstFew(bad)}`,
    );
  }
  closeGpu();
  if (before) await openGpu(before);
  notes.push(
    `video: 203 stack drawing checked on ${backends.join(', ')} (${frames} AC-10 frames against the 202 renderFrame) in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
  return notes;
}

/** One clip the export drew: its id and the source time asked of a video (null: a photo). */
interface DrawnClip {
  id: string;
  at: number | null;
}
/** What the export drew in one frame: each clip bottom first. */
type DrawnClips = DrawnClip[];

/**
 * Whether two frames drew the same clips in the same order at the same source times (within a microsecond).
 * @param drawn what one frame drew
 * @param expected what it should have drawn
 * @returns whether they match
 */
function sameClipsDrawn(drawn: DrawnClips, expected: DrawnClips): boolean {
  return (
    drawn.length === expected.length &&
    drawn.every((clip, index) => {
      const other = expected.at(index);
      if (clip.id !== other?.id) return false;
      if (clip.at === null || other.at === null) return clip.at === other.at;
      return Math.abs(clip.at - other.at) < 1e-6;
    })
  );
}

/**
 * A frame's clips for a report, as "[m1@0.500 face@0.033]"; "nothing" when the frame wasn't drawn.
 * @param drawn what a frame drew, or undefined
 * @returns the description
 */
function describeDrawn(drawn: DrawnClips | undefined): string {
  if (!drawn) return 'nothing';
  const clips = drawn.map((clip) => (clip.at === null ? clip.id : `${clip.id}@${clip.at.toFixed(3)}`));
  return `[${clips.join(' ')}]`;
}

/**
 * 203's export (T032, T034), on the real encoder. Returns notes for the report.
 * - AC-6: the overlay fixture's export draws the preview's stack and matches the colour-code reference.
 * - AC-8: an overlay clip's sound is exported, unless its track is muted.
 * - AC-10: 201 / 202 projects export the frames framePlan lists.
 * - AC-13: the 2-minute 1080p main + 2 overlays export leaves nothing open.
 * @param check records a check
 * @returns notes for the report
 */
export async function overlayExportChecks(check: Check): Promise<string[]> {
  const notes: string[] = [];
  for (const format of ['9:16', '16:9'] as const) {
    const note = await exportDrawsPreviewStack(check, format);
    if (!note) return [...notes, 'video: 203 export checks skipped (no H.264 encoder)'];
    notes.push(note);
  }
  await exportsOverlaySound(check);
  await legacyExportFollowsFramePlan(check);
  const longNote = await longOverlayExportReleasesEverything(check);
  if (longNote) notes.push(longNote);
  return notes;
}

/**
 * AC-6: the overlay fixture's export at one format draws, at every frame, exactly the stack the preview draws
 * (frameStack: the same clips, bottom first, the same source times), and its decoded frames at the fixture's 8 times
 * match the colour-code reference (each clip's box, rotation, corners, opacity) within the encoder's loss.
 * @returns a note with the error measured, or null when this engine can't encode H.264
 * @param check records a check
 * @param format the fixture's frame shape
 */
async function exportDrawsPreviewStack(check: Check, format: '9:16' | '16:9'): Promise<string | null> {
  const { encodeVideo } = await import('@/engine/videoExport');
  const { frameStack } = await import('@/engine/stack');
  const { projectLength } = await import('@/engine/timeline');
  const fixture = await makeOverlayProject(format);
  if (!fixture) return null;
  const { width, height, fps, project } = fixture;
  const drawnByFrame: DrawnClips[] = [];
  const mp4 = await encodeVideo({
    ...project,
    audio: [],
    width,
    height,
    fps,
    bitrate: 4e6,
    sink: { kind: 'memory' },
    trace: (frameIndex, drawn) => {
      drawnByFrame[frameIndex] = drawn;
    },
  });
  if (!mp4) throw new Error('no export');

  const frameCount = Math.max(1, Math.round(projectLength(project) * fps));
  const differences: string[] = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const previewStack: DrawnClips = frameStack(project, frameIndex / fps).map(({ clip, local }) => ({
      id: clip.id,
      at: clip.kind === 'video' ? clip.in + local : null,
    }));
    const drawn = drawnByFrame.at(frameIndex);
    if (!drawn || !sameClipsDrawn(drawn, previewStack))
      differences.push(`frame ${frameIndex}: drew ${describeDrawn(drawn)}, preview ${describeDrawn(previewStack)}`);
  }
  const differNote = differences.length ? ` (${differences.length} differ${firstFew(differences)})` : '';
  check(
    !differences.length,
    `video: the ${format} overlay export draws the preview's stack at all ${frameCount} frames${differNote}`,
  );

  // The decoded frames against the reference; edges within 4 px skipped (the encoder's chroma blurs them).
  const decoded = await decodeFrames(
    mp4,
    fixture.frames.map((frameNumber) => (frameNumber + 0.5) / fps),
  );
  let worst = 0,
    errorSum = 0,
    pixelsCompared = 0,
    worstWhere = '';
  for (const [index, time] of fixture.times.entries()) {
    const frameCanvas = decoded.at(index);
    if (frameCanvas?.width !== width) continue;
    const reference = frameStack(project, time).map(({ clip }) => ({
      tf: required(
        fixture.clips.find((expected) => expected.id === clip.id),
        'clip',
      ).tf,
      rgb: required(fixture.colourAt(clip.id, time), 'reference colour'),
    }));
    const pixels = context2d(frameCanvas, { willReadFrequently: true }).getImageData(0, 0, width, height).data;
    const result = compareWithReference(pixels, width, height, reference, 0, 4);
    if (result.max > worst) [worst, worstWhere] = [result.max, `frame ${fixture.frames[index]} ${result.where}`];
    errorSum += result.mean * result.n;
    pixelsCompared += result.n;
  }
  const meanError = pixelsCompared ? errorSum / pixelsCompared : Infinity;
  const enoughCompared =
    decoded.length === fixture.times.length && pixelsCompared >= fixture.times.length * width * height * 0.9;
  check(
    enoughCompared && meanError <= 3 && worst <= 12,
    `video: the ${format} overlay export's frames match the colour-code reference at 8 times (mean ${meanError.toFixed(2)}, worst ${worst.toFixed(0)} at ${worstWhere})`,
  );
  return `video: 203 ${format} overlay export: mean ${meanError.toFixed(2)}, worst ${worst.toFixed(0)} levels at ${worstWhere}`;
}

/**
 * AC-8: the face-cam clip (Overlay 2, from 0.5 s, its source from 0) is given the sync clip's file, which beeps at 0
 * and 2 s, so the export's sound beeps at 0.5 s and 2.5 s and is quiet at 1.5 s. Exported as is (heard), with the
 * track muted (not heard) and with it hidden (heard: Hide is about pictures, Q7).
 * @param check records a check
 */
async function exportsOverlaySound(check: Check): Promise<void> {
  const { encodeVideo } = await import('@/engine/videoExport');
  const fixture = await makeOverlayProject('9:16');
  const beepingClip = await makeSyncClip(4);
  if (!fixture || !beepingClip) return;
  /**
   * The fixture with the face-cam sounding, and its track changed by `trackChange`.
   * @param trackChange what changes on the face-cam's track
   * @returns the project
   */
  const projectWith = (trackChange: Partial<Track>): Project<OverlayClip> => ({
    ...fixture.project,
    tracks: fixture.project.tracks.map((track) => (track.id === 'V3' ? { ...track, ...trackChange } : track)),
    clips: fixture.project.clips.map((clip) => (clip.id === 'face' ? { ...clip, file: beepingClip, volume: 1 } : clip)),
  });
  const results: string[] = [];
  let allAsExpected = true;
  for (const [name, trackChange, shouldBeHeard] of [
    ['playing', {}, true],
    ['muted', { muted: true }, false],
    ['hidden', { hidden: true }, true],
  ] as const) {
    const mp4 = await encodeVideo({
      ...projectWith(trackChange),
      audio: [],
      width: 270,
      height: 480,
      fps: 30,
      bitrate: 1e6,
      sink: { kind: 'memory' },
    });
    const levels = mp4 ? await loudness(mp4, [0.5, 1.5, 2.5], 0.04) : [];
    const [firstBeep = 0, between = 0, secondBeep = 0] = levels;
    const asExpected = shouldBeHeard
      ? firstBeep > 0.05 && secondBeep > 0.05 && between < 0.01
      : firstBeep < 0.01 && secondBeep < 0.01;
    allAsExpected &&= asExpected;
    results.push(`${name}: ${[firstBeep, between, secondBeep].map((level) => level.toFixed(3)).join(' / ')}`);
  }
  check(
    allAsExpected,
    `video: an overlay clip's sound is exported; muted it isn't, hidden it is (RMS at 0.5 / 1.5 / 2.5 s: ${results.join('; ')}) (AC-8)`,
  );
}

/**
 * AC-10: 201 / 202 projects (the testkit's shapes on the main track alone, and a gap between two photos) export, at
 * every frame, the clip and source time framePlan lists (the 2.x export's frames).
 * @param check records a check
 */
async function legacyExportFollowsFramePlan(check: Check): Promise<void> {
  const { encodeVideo } = await import('@/engine/videoExport');
  const { MAIN_VIDEO, defaultTracks } = await import('@/engine/tracks');
  const { framePlan, pack } = await import('@/engine/timeline');
  const { legacyFixtures } = await import('../support/timeline.testkit');
  const { DEFAULT_EDIT } = await import('@/engine/instagram');
  const fps = 30;
  const [videoA, videoB] = await Promise.all([makeTestClip(10, 320, 240, 2), makeTestClip(10, 320, 240, 2)]);
  if (!videoA || !videoB) return;
  const photos = await Promise.all([0, 1, 2].map((index) => testPhoto(index, 400, 267)));
  const fixtures = legacyFixtures();
  const shapes = ['videoOnly', 'mixed', 'tinyClips', 'clips20'] as const;
  const projects: [string, Project<ExportClip>][] = shapes.map((name) => {
    const fixture = required(fixtures[name], `${name} fixture`);
    let fileIndex = 0;
    const fileFor = (kind: 'photo' | 'video') => {
      const turn = fileIndex++;
      if (kind === 'photo') return cycleOf(photos, turn, 'test photo').blob;
      return turn % 2 ? videoB : videoA;
    };
    const clips = pack(
      fixture.clips.map((clip): ExportClip => ({ ...clip, track: MAIN_VIDEO, start: 0, file: fileFor(clip.kind) })),
    );
    return [name, { tracks: defaultTracks(), clips, audio: [], layers: fixture.layers, fadeOut: fixture.fadeOut }];
  });
  /**
   * A 1-second photo clip on the main track at `start` seconds (202's gap fixture).
   * @param index which test photo
   * @param start where it starts, seconds
   * @returns the clip
   */
  const photoClip = (index: number, start: number): ExportClip => ({
    id: `g${index}`,
    track: MAIN_VIDEO,
    start,
    kind: 'photo',
    dur: 1,
    in: 0,
    out: 0,
    edit: { ...DEFAULT_EDIT },
    motion: 'none',
    fade: false,
    file: entryAt(photos, index, 'test photo').blob,
    volume: 0,
  });
  projects.push([
    'gap',
    { tracks: defaultTracks(), clips: [photoClip(0, 0), photoClip(1, 2.5)], audio: [], layers: [], fadeOut: false },
  ]);

  const differences: string[] = [];
  let framesCompared = 0;
  for (const [name, project] of projects) {
    const drawnByFrame: DrawnClips[] = [];
    await encodeVideo({
      ...project,
      audio: [],
      width: 320,
      height: 180,
      fps,
      bitrate: 1e6,
      sink: { kind: 'memory' },
      trace: (frameIndex, drawn) => {
        drawnByFrame[frameIndex] = drawn;
      },
    });
    for (const span of framePlan(project, fps))
      for (let frameIndex = span.f0; frameIndex < span.f1; frameIndex++) {
        const clip = span.clip;
        const planned: DrawnClips = clip
          ? [{ id: clip.id, at: clip.kind === 'video' ? clip.in + frameIndex / fps - span.start : null }]
          : [];
        framesCompared++;
        const drawn = drawnByFrame.at(frameIndex);
        if (!drawn || !sameClipsDrawn(drawn, planned))
          differences.push(
            `${name} frame ${frameIndex}: drew ${describeDrawn(drawn)}, framePlan ${describeDrawn(planned)}`,
          );
      }
  }
  check(
    !differences.length && framesCompared > 0,
    `video: 201 / 202 projects export the frames framePlan lists (${framesCompared - differences.length} of ${framesCompared} frames)${firstFew(differences)}`,
  );
}

/**
 * AC-13: the 2-minute 1080p main + 2 overlays export finishes with no frame or decoder open after it.
 * @param check records a check
 * @returns a note with its time, the most frame bytes open at once and the file size; null without the fixture
 */
async function longOverlayExportReleasesEverything(check: Check): Promise<string | null> {
  const { encodeVideo } = await import('@/engine/videoExport');
  const { openFrames } = await import('@/engine/frameSource');
  const fixture = await makeLongOverlayProject();
  if (!fixture) return null;
  let peakBytes = 0;
  const started = performance.now();
  const mp4 = await encodeVideo({
    ...fixture.project,
    audio: [],
    width: fixture.width,
    height: fixture.height,
    fps: fixture.fps,
    bitrate: 2e6,
    sink: { kind: 'memory' },
    onProgress: () => {
      peakBytes = Math.max(peakBytes, openFrames().bytes);
    },
  });
  const seconds = (performance.now() - started) / 1000;
  // Readers stop asynchronously: wait up to 2 s for everything to close.
  const deadline = performance.now() + 2000;
  let stillOpen = openFrames();
  while ((stillOpen.decoders || stillOpen.frames || stillOpen.bytes) && performance.now() < deadline) {
    await sleep(20);
    stillOpen = openFrames();
  }
  check(
    !!mp4 && !stillOpen.decoders && !stillOpen.frames && !stillOpen.bytes,
    `video: the 2-minute 1080p main + 2 overlays export finishes with nothing open after it (${stillOpen.decoders} decoders, ${stillOpen.frames} frames)`,
  );
  const megabytes = (bytes: number) => (bytes / 2 ** 20).toFixed(0);
  return `video: 203 AC-13 export (2 min 1080p, main + 2 overlays) in ${seconds.toFixed(1)} s, peak ${megabytes(peakBytes)} MB of frames, ${((mp4?.size ?? 0) / 2 ** 20).toFixed(1)} MB file`;
}

/**
 * The sound's loudness in an MP4 at given times.
 * @param mp4 the file
 * @param times where each measurement starts, seconds
 * @param windowSeconds how long each measurement lasts
 * @returns the RMS level (0–1) of the first channel in each window; 0 for every window when the file has no sound
 */
async function loudness(mp4: Blob, times: number[], windowSeconds: number): Promise<number[]> {
  const input = new Input({ source: new BlobSource(mp4), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return times.map(() => 0);
    const sink = new AudioBufferSink(track);
    const levels: number[] = [];
    for (const start of times) {
      const end = start + windowSeconds;
      let sumOfSquares = 0,
        sampleCount = 0;
      for await (const { buffer, timestamp } of sink.buffers(start, end)) {
        const samples = buffer.getChannelData(0);
        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
          const sampleTime = timestamp + sampleIndex / buffer.sampleRate;
          if (sampleTime < start || sampleTime >= end) continue;
          sumOfSquares += (samples.at(sampleIndex) ?? 0) ** 2;
          sampleCount++;
        }
      }
      levels.push(sampleCount ? Math.sqrt(sumOfSquares / sampleCount) : 0);
    }
    return levels;
  } finally {
    input.dispose();
  }
}
