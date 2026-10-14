/*
 * What a video project can make, free of DOM and React: its formats (sizes and bitrates), frame rates, and the limits
 * of each kind of project in the browser and in the desktop app. Instagram's and YouTube's video rules and the
 * reasoning behind these limits are in docs/MEDIA-STUDIO.md.
 */

/** What a project makes: a vertical Reel / Short, or a landscape video for YouTube (a vlog). */
export type VKind = 'reel' | 'vlog';

/** The video formats a project can export. */
export type VFormatId = 'reel' | 'feed' | 'square' | 'yt1080' | 'yt1440' | 'yt4k';

/** The frame rates a video can export at. */
export type VFps = 30 | 60;

/** The export quality: "high" spends half as much again on the bitrate. */
export type VQuality = 'standard' | 'high';

/** Standard H.264 bitrates at 30 and 60 fps, bits per second. */
export interface FormatBitrates {
  30: number;
  60: number;
}

/** A video format: its size, what it is for, and its bitrates. */
export interface VFormat {
  id: VFormatId;
  kind: VKind;
  label: string;
  /** The aspect ratio as shown, such as "9:16". */
  ratio: string;
  /** Width, pixels. */
  w: number;
  /** Height, pixels. */
  h: number;
  /** Where the format is used, one sentence. */
  use: string;
  /** Needs the desktop app (too heavy for a browser tab). */
  desktopOnly?: boolean;
  /** YouTube's recommended SDR upload bitrates for 16:9 (the same for the Reel formats). */
  bitrate: FormatBitrates;
}

/** The Reel / Short format, also the fallback for an unknown format id. */
const REEL_FORMAT: VFormat = {
  id: 'reel',
  kind: 'reel',
  label: 'Reel / Short',
  ratio: '9:16',
  w: 1080,
  h: 1920,
  use: 'Instagram Reels and Stories, YouTube Shorts: full screen on a phone.',
  bitrate: { 30: 5e6, 60: 7.5e6 },
};

/** Every video format, the Reel formats first. */
export const V_FORMATS: readonly VFormat[] = [
  REEL_FORMAT,
  { id: 'feed', kind: 'reel', label: 'Feed', ratio: '4:5', w: 1080, h: 1350, use: 'A video post in the Instagram feed.', bitrate: { 30: 5e6, 60: 7.5e6 } },
  { id: 'square', kind: 'reel', label: 'Square', ratio: '1:1', w: 1080, h: 1080, use: 'A square video post.', bitrate: { 30: 5e6, 60: 7.5e6 } },
  { id: 'yt1080', kind: 'vlog', label: 'Full HD 1080p', ratio: '16:9', w: 1920, h: 1080, use: 'A YouTube video or vlog in Full HD.', bitrate: { 30: 8e6, 60: 12e6 } },
  { id: 'yt1440', kind: 'vlog', label: '2K 1440p', ratio: '16:9', w: 2560, h: 1440, use: 'A sharper YouTube video (desktop app).', desktopOnly: true, bitrate: { 30: 16e6, 60: 24e6 } },
  { id: 'yt4k', kind: 'vlog', label: '4K 2160p', ratio: '16:9', w: 3840, h: 2160, use: '4K for YouTube (desktop app; exports take longer).', desktopOnly: true, bitrate: { 30: 40e6, 60: 60e6 } },
];

/**
 * A format by its id.
 * @param id the format's id
 * @returns the format, or the Reel format for an unknown id
 */
export const vFormat = (id: VFormatId): VFormat => V_FORMATS.find((format) => format.id === id) ?? REEL_FORMAT;

/**
 * The formats of one kind of project.
 * @param kind the kind of project
 * @returns its formats, in order
 */
export const formatsFor = (kind: VKind): VFormat[] => V_FORMATS.filter((format) => format.kind === kind);

/**
 * The video bitrate for a format, frame rate and quality.
 * @param format the format
 * @param fps the frame rate
 * @param quality the quality; "high" is half as much again
 * @returns bits per second
 */
export const bitrateFor = (format: VFormat, fps: VFps, quality: VQuality): number =>
  Math.round(format.bitrate[fps] * (quality === 'high' ? 1.5 : 1));

/** Default frame rate; vlogs can choose 60 in the desktop app. */
export const V_FPS: VFps = 30;

/** What a kind of project allows. */
export interface VLimits {
  /** Longest video, seconds. */
  seconds: number;
  /** Shortest video, seconds. */
  minSeconds: number;
  /** Most clips in a project. */
  clips: number;
  /** Largest video file that can be added, MB. */
  fileMB: number;
  /** The frame rates it can export at. */
  fps: VFps[];
  /** Videos on screen at once (203 enforces it; photos don't count): set from 204's measurements, AC-15 / Q2. */
  videosAtOnce: number;
}

/**
 * The videos on screen at once: 5 in the desktop app, 3 in the browser; without WebCodecs there is no decoder pool,
 * so one `<video>` at a time, as before 204 (Q7).
 * @param desktop whether this is the desktop app
 * @param decoder whether `VideoDecoder` exists
 * @returns the number of videos
 */
function videosAtOnceFor(desktop: boolean, decoder: boolean): number {
  if (!decoder) return 1;
  return desktop ? 5 : 3;
}

/**
 * What each kind of project allows in the browser and in the desktop app. Browsers keep a tab's memory and file sizes
 * small and may throttle a background tab, so the full studio (long vlogs, 1440p and 4K, 60 fps, big files) is the
 * desktop app's. Exports always stream frame by frame; long videos also stream to disk.
 * @param kind the kind of project
 * @param desktop whether this is the desktop app
 * @param decoder whether `VideoDecoder` exists (WebCodecs)
 * @returns the limits
 */
export function limitsFor(kind: VKind, desktop: boolean, decoder = typeof VideoDecoder !== 'undefined'): VLimits {
  const videosAtOnce = videosAtOnceFor(desktop, decoder);
  if (kind === 'reel') {
    return desktop
      ? { seconds: 180, minSeconds: 3, clips: 50, fileMB: 4096, fps: [30, 60], videosAtOnce }
      : { seconds: 90, minSeconds: 3, clips: 20, fileMB: 300, fps: [30], videosAtOnce };
  }
  return desktop
    ? { seconds: 3 * 3600, minSeconds: 1, clips: 500, fileMB: 50 * 1024, fps: [30, 60], videosAtOnce }
    : { seconds: 15 * 60, minSeconds: 1, clips: 60, fileMB: 4096, fps: [30], videosAtOnce };
}
