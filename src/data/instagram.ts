/*
 * Instagram post formats and limits, as data (see docs/MEDIA-STUDIO.md for the sources). Every format is 1080 px wide,
 * the width Instagram shows; JPEG in sRGB is what it stores. One batch uses one format, because Instagram crops every
 * photo of a carousel to the first photo's shape.
 */

import type { LookId } from '../types';
import type { PhotoType } from '../engine/photoExport';

export type IgFormatId = 'portrait' | 'square' | 'tall' | 'landscape' | 'story';

export interface IgFormat {
  id: IgFormatId;
  label: string;
  /** Aspect ratio as people write it, e.g. "4:5". */
  ratio: string;
  w: number;
  h: number;
  use: string;
  /** Feed posts and carousels; false = Stories and Reel covers only. */
  feed: boolean;
}

export const IG_FORMATS: IgFormat[] = [
  { id: 'portrait', label: 'Portrait', ratio: '4:5', w: 1080, h: 1350, use: 'Feed posts and carousels. Takes the most space in the feed: the best default.', feed: true },
  { id: 'square', label: 'Square', ratio: '1:1', w: 1080, h: 1080, use: 'Feed posts and carousels. The classic grid shape.', feed: true },
  { id: 'tall', label: 'Tall portrait', ratio: '3:4', w: 1080, h: 1440, use: 'Feed posts and carousels in the newer 3:4 shape, matching the profile grid.', feed: true },
  { id: 'landscape', label: 'Landscape', ratio: '1.91:1', w: 1080, h: 566, use: 'Feed posts and carousels. Wide photos appear small in the feed.', feed: true },
  { id: 'story', label: 'Story', ratio: '9:16', w: 1080, h: 1920, use: 'Stories and Reel covers, full screen. Not for feed carousels.', feed: false },
];

export const igFormat = (id: IgFormatId): IgFormat => IG_FORMATS.find((f) => f.id === id) ?? IG_FORMATS[0];

/** Instagram allows up to 20 photos in one carousel post. */
export const IG_MAX_BATCH = 20;
/** Ready-made batch sizes; the limit can also be typed, from 1 to IG_MAX_BATCH. */
export const IG_BATCH_PRESETS = [2, 4, 10] as const;
export const clampBatch = (n: number): number => Math.min(IG_MAX_BATCH, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

/** Caption limits shown under the caption box. */
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAG_MAX = 30;
/** Characters shown before "… more" in the feed. */
export const IG_CAPTION_PREVIEW = 125;

export type IgFileType = PhotoType;
/** Export file types (engine/photoExport.ts); WebP and AVIF show only where the browser can write them. */
export const IG_FILE_TYPES: [IgFileType, string, string][] = [
  ['jpeg', 'JPEG', 'Recommended: what Instagram stores, small files'],
  ['png', 'PNG', 'Lossless; Instagram converts it to JPEG on upload'],
  ['webp', 'WebP', 'Smaller than JPEG at the same quality, for websites and messages; post JPEG to Instagram'],
  ['avif', 'AVIF', 'The smallest files, for websites; post JPEG to Instagram'],
  ['tiff', 'TIFF (16-bit)', 'For printing and further editing: 16 bits per channel, the full precision of a RAW file; large files, not for Instagram'],
];
/** Above this a photo may be refused by some upload paths (Instagram's publishing API allows 8 MB). */
export const IG_FILE_WARN_BYTES = 8 * 1024 * 1024;

/** The same looks as the print studio (LookId in types.ts). */
export type IgFilter = LookId;
export const IG_FILTERS: [IgFilter, string][] = [
  ['none', 'Original'],
  ['vivid', 'Vivid'],
  ['warm', 'Warm'],
  ['cool', 'Cool'],
  ['bw', 'Black and white'],
  ['tinted', 'Hand-tinted'],
  ['vintage', 'Vintage'],
];
