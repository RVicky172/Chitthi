import { renderIg, type IgEdit } from './instagram';
import { drawLayers, type Layer } from './layers';

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
}

/**
 * What each kind of project allows in the browser and in the desktop app. Browsers keep a tab's memory and file sizes
 * small and may throttle a background tab, so the full studio (long vlogs, 1440p and 4K, 60 fps, big files) is the
 * desktop app's. Exports always stream frame by frame; long videos also stream to disk.
 */
export function limitsFor(kind: VKind, desktop: boolean): VLimits {
  if (kind === 'reel') return desktop ? { seconds: 180, minSeconds: 3, clips: 50, fileMB: 4096, fps: [30, 60] } : { seconds: 90, minSeconds: 3, clips: 20, fileMB: 300, fps: [30] };
  return desktop ? { seconds: 3 * 3600, minSeconds: 1, clips: 500, fileMB: 50 * 1024, fps: [30, 60] } : { seconds: 15 * 60, minSeconds: 1, clips: 60, fileMB: 4096, fps: [30] };
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

export interface Placed<T> {
  clip: T;
  index: number;
  start: number;
  end: number;
}

/** Where each clip sits on the timeline, end to end. */
export function timeline<T extends ClipTiming>(clips: T[]): Placed<T>[] {
  let t = 0;
  return clips.map((clip, index) => {
    const start = t;
    t += clipLength(clip);
    return { clip, index, start, end: t };
  });
}
export const totalLength = (clips: ClipTiming[]): number => clips.reduce((a, c) => a + clipLength(c), 0);

/** The clip showing at time t (the last one at or past the end), or null for an empty timeline. */
export function clipAt<T extends ClipTiming>(tl: Placed<T>[], t: number): Placed<T> | null {
  if (!tl.length) return null;
  return tl.find((p) => t >= p.start && t < p.end) ?? (t < 0 ? tl[0] : tl[tl.length - 1]);
}

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

/**
 * Draws the frame at time t: src is the clip's picture at that moment (the photo, or the video frame), sw × sh its
 * size. local = seconds into the clip.
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
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  if (src && sw > 0 && sh > 0) {
    const edit = clip.kind === 'photo' ? motionEdit(clip.edit, clip.motion, local / clipLength(clip)) : clip.edit;
    renderIg(ctx, src, sw, sh, edit, W, H);
  }
  const dark = fadeAmount(local, clip.fade, t, total, fadeOut);
  // Layers fade with the picture, so a title can fade in with the first photo.
  drawLayers(ctx, layers, W, H, t);
  if (dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dark})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/** m:ss.s */
export const fmtTime = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${(Math.max(0, s) % 60).toFixed(1).padStart(4, '0')}`;
