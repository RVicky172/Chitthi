import { DEFAULT_EDIT, renderIg, type IgEdit } from './instagram';
import { transformAt, type ClipKeyProp, type Keyframes } from './keyframes';
import { drawLayers, type Layer } from './layers';
import type { ClipTransform } from './timeline';

/*
 * The video editor's timeline maths and frame drawing, free of UI code. One function draws a frame at any time t, for
 * the live preview and for every exported frame alike: the clip under t (a photo with optional pan and zoom, or a video
 * frame), framed and coloured like an Instagram photo (engine/instagram.ts), its fades, then the layers showing at t.
 * Instagram's and YouTube's video rules and the reasoning behind these limits are in docs/MEDIA-STUDIO.md.
 */

/** What a project makes: a vertical Reel / Short, or a landscape video for YouTube (a vlog). */
export type VKind = 'reel' | 'vlog';
export type VFormatId = 'reel' | 'feed' | 'square' | 'yt1080' | 'yt1440' | 'yt4k';
export type VFps = 30 | 60;
export type VQuality = 'standard' | 'high';

export interface VFormat {
  id: VFormatId;
  kind: VKind;
  label: string;
  ratio: string;
  w: number;
  h: number;
  use: string;
  /** Needs the desktop app (too heavy for a browser tab). */
  desktopOnly?: boolean;
  /** Standard H.264 bitrates at 30 and 60 fps, bits per second (YouTube's recommended SDR uploads for 16:9). */
  bitrate: { 30: number; 60: number };
}

export const V_FORMATS: VFormat[] = [
  { id: 'reel', kind: 'reel', label: 'Reel / Short', ratio: '9:16', w: 1080, h: 1920, use: 'Instagram Reels and Stories, YouTube Shorts: full screen on a phone.', bitrate: { 30: 5e6, 60: 7.5e6 } },
  { id: 'feed', kind: 'reel', label: 'Feed', ratio: '4:5', w: 1080, h: 1350, use: 'A video post in the Instagram feed.', bitrate: { 30: 5e6, 60: 7.5e6 } },
  { id: 'square', kind: 'reel', label: 'Square', ratio: '1:1', w: 1080, h: 1080, use: 'A square video post.', bitrate: { 30: 5e6, 60: 7.5e6 } },
  { id: 'yt1080', kind: 'vlog', label: 'Full HD 1080p', ratio: '16:9', w: 1920, h: 1080, use: 'A YouTube video or vlog in Full HD.', bitrate: { 30: 8e6, 60: 12e6 } },
  { id: 'yt1440', kind: 'vlog', label: '2K 1440p', ratio: '16:9', w: 2560, h: 1440, use: 'A sharper YouTube video (desktop app).', desktopOnly: true, bitrate: { 30: 16e6, 60: 24e6 } },
  { id: 'yt4k', kind: 'vlog', label: '4K 2160p', ratio: '16:9', w: 3840, h: 2160, use: '4K for YouTube (desktop app; exports take longer).', desktopOnly: true, bitrate: { 30: 40e6, 60: 60e6 } },
];
export const vFormat = (id: VFormatId): VFormat => V_FORMATS.find((f) => f.id === id) ?? V_FORMATS[0];
export const formatsFor = (kind: VKind) => V_FORMATS.filter((f) => f.kind === kind);

/** Video bitrate for a format, frame rate and quality; "high" is half as much again. */
export const bitrateFor = (f: VFormat, fps: VFps, q: VQuality): number => Math.round(f.bitrate[fps] * (q === 'high' ? 1.5 : 1));

/** Default frame rate; vlogs can choose 60 in the desktop app. */
export const V_FPS: VFps = 30;

export interface VLimits {
  /** Longest video, seconds. */
  seconds: number;
  minSeconds: number;
  clips: number;
  /** Largest video file that can be added, MB. */
  fileMB: number;
  fps: VFps[];
  /** Videos on screen at once (203 enforces it; photos don't count): set from 204's measurements, AC-15 / Q2. */
  videosAtOnce: number;
}

/**
 * What each kind of project allows in the browser and in the desktop app. Browsers keep a tab's memory and file sizes
 * small and may throttle a background tab, so the full studio (long vlogs, 1440p and 4K, 60 fps, big files) is the
 * desktop app's. Exports always stream frame by frame; long videos also stream to disk.
 */
export function limitsFor(kind: VKind, desktop: boolean, decoder = typeof VideoDecoder !== 'undefined'): VLimits {
  // Without WebCodecs there is no decoder pool: one <video> at a time, as before 204 (Q7).
  const videosAtOnce = !decoder ? 1 : desktop ? 5 : 3;
  if (kind === 'reel') return desktop ? { seconds: 180, minSeconds: 3, clips: 50, fileMB: 4096, fps: [30, 60], videosAtOnce } : { seconds: 90, minSeconds: 3, clips: 20, fileMB: 300, fps: [30], videosAtOnce };
  return desktop ? { seconds: 3 * 3600, minSeconds: 1, clips: 500, fileMB: 50 * 1024, fps: [30, 60], videosAtOnce } : { seconds: 15 * 60, minSeconds: 1, clips: 60, fileMB: 4096, fps: [30], videosAtOnce };
}

export const V_PHOTO_SECONDS = 3;
/** Length of a fade in or out, in seconds. */
export const V_FADE = 0.5;

export type Motion = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';
export const MOTIONS: [Motion, string][] = [
  ['none', 'Still'],
  ['zoom-in', 'Zoom in'],
  ['zoom-out', 'Zoom out'],
  ['pan-left', 'Pan left'],
  ['pan-right', 'Pan right'],
  ['pan-up', 'Pan up'],
  ['pan-down', 'Pan down'],
];

/** What the timeline needs to know about a clip. */
export interface ClipTiming {
  kind: 'photo' | 'video';
  /** Photo: seconds on screen. */
  dur: number;
  /** Video: the part used, in seconds of the source. */
  in: number;
  out: number;
}

export const clipLength = (c: ClipTiming): number => Math.max(0.1, c.kind === 'photo' ? c.dur : c.out - c.in);

/** Frame numbers (at V_FPS) whose time falls in [start, end). */
export function frameRange(start: number, end: number, fps: number = V_FPS): [number, number] {
  // The tiny offset keeps a frame exactly on a boundary in the later clip; max(0, …) avoids a -0 first frame.
  return [Math.max(0, Math.ceil(start * fps - 1e-6)), Math.max(0, Math.ceil(end * fps - 1e-6))];
}

const ease = (p: number) => p * p * (3 - 2 * p);

/** A photo's framing at progress p (0–1) through its clip, for the chosen motion. */
export function motionEdit(e: IgEdit, motion: Motion, p: number): IgEdit {
  const q = ease(Math.min(1, Math.max(0, p)));
  const z = Math.max(e.zoom, 1);
  switch (motion) {
    case 'zoom-in':
      return { ...e, zoom: z * (1 + 0.18 * q) };
    case 'zoom-out':
      return { ...e, zoom: z * (1.18 - 0.18 * q) };
    case 'pan-left':
      return { ...e, zoom: Math.max(z, 1.2), px: 1 - 2 * q };
    case 'pan-right':
      return { ...e, zoom: Math.max(z, 1.2), px: -1 + 2 * q };
    case 'pan-up':
      return { ...e, zoom: Math.max(z, 1.2), py: 1 - 2 * q };
    case 'pan-down':
      return { ...e, zoom: Math.max(z, 1.2), py: -1 + 2 * q };
    default:
      return e;
  }
}

/** How dark the frame is (0–1) from a fade in at the start of a clip and a fade out at the end of the video. */
export function fadeAmount(local: number, fadeIn: boolean, t: number, total: number, fadeOut: boolean): number {
  const a = fadeIn ? Math.max(0, 1 - local / V_FADE) : 0;
  const b = fadeOut ? Math.max(0, 1 - (total - t) / V_FADE) : 0;
  return Math.min(1, Math.max(a, b));
}

export interface FrameClip extends ClipTiming {
  edit: IgEdit;
  motion: Motion;
  fade: boolean;
}

/** What renderFrame draws where no clip shows (the video track hidden): black, the layers, the video's fade-out. */
export const NO_PICTURE: FrameClip = { kind: 'photo', dur: 0, in: 0, out: 0, edit: DEFAULT_EDIT, motion: 'none', fade: false };

/** One clip of a frame's stack (203): its picture at that moment (sw × sh), local = seconds into the clip. */
export interface StackDraw {
  clip: FrameClip & { tf?: ClipTransform; keys?: Keyframes<ClipKeyProp>; overlay: boolean };
  src: CanvasImageSource | null;
  sw: number;
  sh: number;
  local: number;
}

/** A stack item's box at its frame: its keyframed values at its local time (205), else its stored box itself. */
export const itemTransform = (item: StackDraw): ClipTransform => transformAt(item.clip, item.local);

/** The whole frame: a clip without a transform draws exactly as before 203 (timeline.ts re-exports it). */
export const IDENTITY: ClipTransform = Object.freeze({ x: 0.5, y: 0.5, w: 1, rot: 0, opacity: 1, radius: 0 });

/** True for no transform or one equal to the identity (the fast path that draws as before 203). */
export const isIdentity = (t?: ClipTransform): boolean =>
  !t || (Object.keys(IDENTITY) as (keyof ClipTransform)[]).every((k) => t[k] === IDENTITY[k]);

/** Each target canvas's own frame-size canvas for its see-through clips (made on first use, gone with the target), so
 * the preview and the export, of different sizes and interleaved, don't remake it every frame. */
const scratches = new WeakMap<HTMLCanvasElement | OffscreenCanvas, HTMLCanvasElement>();

function scratchFor(ctx: CanvasRenderingContext2D, W: number, H: number): CanvasRenderingContext2D | null {
  let c = scratches.get(ctx.canvas);
  if (!c) scratches.set(ctx.canvas, (c = document.createElement('canvas')));
  if (c.width !== W || c.height !== H) [c.width, c.height] = [W, H];
  const x = c.getContext('2d');
  if (!x) return null;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, W, H);
  return x;
}

/** Sets x up to draw a whole frame (W × H) into a clip's box: moved, turned, its corners rounded, scaled by w. */
function intoBox(x: CanvasRenderingContext2D, tf: ClipTransform, W: number, H: number): void {
  const bw = tf.w * W,
    bh = tf.w * H;
  x.translate(tf.x * W, tf.y * H);
  x.rotate((tf.rot * Math.PI) / 180);
  roundedBox(x, -bw / 2, -bh / 2, bw, bh, tf.radius * Math.min(bw, bh));
  x.clip();
  x.scale(tf.w, tf.w);
  x.translate(-W / 2, -H / 2);
}

/** The rounded rectangle x, y, w × h with corner radius r as the current path (arcTo where roundRect is missing). */
function roundedBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (r <= 0) ctx.rect(x, y, w, h);
  else if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/**
 * Draws the frame at time t from its stack of clips (203 plan §4), bottom first: black, each clip's picture (the main
 * track's, then the overlays'), the layers, then the darkness of the main clip's fade-in and the video's fade-out.
 * A clip without a transform (or at the identity) draws exactly as before 203, over the whole frame. Otherwise its
 * picture, framed for the whole frame, is drawn into its box: moved, turned, scaled by w (the box has the frame's
 * aspect, D1), its corners rounded, at its opacity. An overlay's fade-in ramps its own opacity from 0 over V_FADE
 * (D2); the main clip's darkens the whole frame, layers included, as before.
 */
export function renderStack(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  items: StackDraw[],
  layers: Layer[],
  t: number,
  total: number,
  fadeOut: boolean,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  let mainLocal = 0,
    mainFade = false;
  for (const item of items) {
    const { clip, src, sw, sh, local } = item;
    if (!clip.overlay) [mainLocal, mainFade] = [local, clip.fade];
    if (!src || sw <= 0 || sh <= 0) continue;
    const edit = clip.kind === 'photo' ? motionEdit(clip.edit, clip.motion, local / clipLength(clip)) : clip.edit;
    const tf = itemTransform(item);
    const alpha = tf.opacity * (clip.overlay && clip.fade ? Math.min(1, Math.max(0, local / V_FADE)) : 1);
    if (alpha <= 0) continue;
    if (alpha >= 1 && isIdentity(tf)) {
      renderIg(ctx, src, sw, sh, edit, W, H);
      continue;
    }
    // See-through: the finished picture (its background, colour and vignette) is drawn into its box on a canvas of
    // its own first and laid down once, so its own passes don't show through one another. The same geometry either way.
    const sx = alpha < 1 ? scratchFor(ctx, W, H) : null;
    const x = sx ?? ctx;
    x.save();
    // Restored even when drawing throws (a closed video frame), so the box's transform and clip don't stay behind.
    try {
      // No scratch canvas (alpha 1, or none could be made): drawn in place, at its alpha.
      if (!sx) x.globalAlpha = alpha;
      intoBox(x, tf, W, H);
      renderIg(x, src, sw, sh, edit, W, H);
    } finally {
      x.restore();
    }
    if (sx) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(sx.canvas, 0, 0);
      ctx.restore();
    }
  }
  const dark = fadeAmount(mainLocal, mainFade, t, total, fadeOut);
  // Layers fade with the picture, so a title can fade in with the first photo.
  drawLayers(ctx, layers, W, H, t);
  if (dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/**
 * Draws the frame at time t with one clip: src is the clip's picture at that moment (the photo, or the video frame),
 * sw × sh its size. local = seconds into the clip. renderStack with one item at the identity.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  clip: FrameClip,
  src: CanvasImageSource | null,
  sw: number,
  sh: number,
  local: number,
  layers: Layer[],
  t: number,
  total: number,
  fadeOut: boolean,
): void {
  renderStack(ctx, W, H, [{ clip: { ...clip, overlay: false }, src, sw, sh, local }], layers, t, total, fadeOut);
}

/** m:ss.s */
export const fmtTime = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toFixed(1).padStart(4, '0')}`;
