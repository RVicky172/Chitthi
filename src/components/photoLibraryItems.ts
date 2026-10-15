// The photo library's items (PhotoLibrary): every stored photo and every photo on the design, keyed by fingerprint,
// and how the library filters, refines, searches and sorts them against the selected slot.
import { relevance, type Hue } from '../engine/analyze';
import { photoKey } from '../lib/photoKey';
import { keyOfStored } from '../state/library';
import { cropLoss, dimsOf, fitsSlot, rememberDims, shapeOf, type PhotoShape, type SlotInfo } from '../state/photoFit';
import { traitsOf } from '../state/traits';
import type { Photo, StoredPhoto, Theme } from '../types';

/** Which photos show. */
export type Filter = 'fit' | 'all' | 'card' | 'unused' | 'uploads' | 'pexels' | PhotoShape;
/** How they are ordered. */
export type Sort = 'rel' | 'new' | 'old' | 'name' | 'fit' | 'size';
/** Narrowing by what the analysis found in the photos. */
export interface Refine {
  hue?: Hue;
  light?: 'bright' | 'dark';
  mood?: 'colourful' | 'muted' | 'warm' | 'cool';
  quality?: 'print' | 'sharp';
}

/** A swatch colour per hue. */
export const HUE_SWATCH: Record<Hue, string> = {
  red: '#d63a3a',
  orange: '#ef8a2e',
  yellow: '#f2cc38',
  green: '#4aa55a',
  teal: '#2fa6a0',
  blue: '#3a78d6',
  purple: '#8a5ad0',
  pink: '#e06aa8',
  neutral: '#9a948c',
};

/** A photo in the library. */
export interface Item {
  /** Fingerprint (lib/photoKey.ts): identifies the photo. */
  key: string;
  /** What the grid shows: the thumbnail, or the full image for a photo that is only on the design. */
  view: string;
  /** The stored photo, for placing it (its full image loads then). */
  sp?: StoredPhoto;
  /** Pixel size. */
  w?: number;
  h?: number;
  name: string;
  /** Photo store id (absent for a photo that is only on the card). */
  id?: string;
  added: number;
  /** Index in the card's photo list, or -1. */
  card: number;
}

/** The filters, in order, with their names. */
export const FILTERS: [Filter, string][] = [
  ['fit', 'Fits this slot'],
  ['all', 'All'],
  ['card', 'On this design'],
  ['unused', 'Not used'],
  ['wide', 'Wide'],
  ['tall', 'Tall'],
  ['square', 'Square'],
  ['uploads', 'Uploaded'],
  ['pexels', 'From Pexels'],
];

/**
 * Every photo once: the stored ones, and those on the design (marked with their place on it). Remembers each one's
 * pixel size for the fit checks.
 * @param list the stored photos (null while loading)
 * @param photos the photos on the design
 * @returns the items
 */
export function libraryItems(list: StoredPhoto[] | null, photos: Photo[]): Item[] {
  const byKey = new Map<string, Item>();
  for (const stored of list ?? []) {
    const key = keyOfStored(stored);
    byKey.set(key, {
      key,
      view: stored.thumb ?? stored.url,
      sp: stored,
      name: stored.name,
      id: stored.id,
      added: stored.added,
      card: -1,
      w: stored.w,
      h: stored.h,
    });
    if (stored.w && stored.h) rememberDims(key, stored.w, stored.h);
  }
  photos.forEach((photo, index) => {
    const key = photoKey(photo.url),
      known = byKey.get(key);
    if (known) known.card = index;
    else byKey.set(key, { key, view: photo.url, name: photo.name, added: 0, card: index });
    rememberDims(key, photo.orig.naturalWidth, photo.orig.naturalHeight);
  });
  return [...byKey.values()];
}

/**
 * Whether a photo matches the search: every word in its name or in the words the analysis found (bright, blue, sky…).
 * @param item the photo
 * @param query what was typed
 * @returns true when nothing was typed or every word matches
 */
export function matchesSearch(item: Item, query: string): boolean {
  if (!query.trim()) return true;
  const hay = `${item.name} ${traitsOf(item.key)?.tags.join(' ') ?? ''}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/** The refine choices and what relevance is judged against. */
export interface RefineContext {
  refine: Refine;
  relevantOnly: boolean;
  slot: SlotInfo | null;
  theme: Theme;
}

/**
 * Whether a photo passes the refine choices (colour, light, mood, quality, relevant only).
 * @param item the photo
 * @param context the choices, the slot and the theme
 * @returns true when it passes every choice made (photos not analysed yet pass only when none is made)
 */
export function passesRefine(item: Item, { refine, relevantOnly, slot, theme }: RefineContext): boolean {
  if (!refine.hue && !refine.light && !refine.mood && !refine.quality && !relevantOnly) return true;
  const traits = traitsOf(item.key);
  if (!traits) return false;
  if (refine.hue && traits.hue !== refine.hue) return false;
  if (refine.light && !traits.tags.includes(refine.light)) return false;
  if (refine.mood && !traits.tags.includes(refine.mood)) return false;
  if (refine.quality === 'sharp' && traits.sharpness < 0.3) return false;
  if (refine.quality === 'print' && slot && 25.4 / Math.max(slot.wmm / traits.w, slot.hmm / traits.h) < 250)
    return false;
  return !relevantOnly || relevance(traits, slot, theme) >= 0.62;
}

/**
 * Whether a photo passes the filter.
 * @param item the photo
 * @param filter the filter
 * @param slot the selected slot, if any
 * @returns true when it shows
 */
export function passesFilter(item: Item, filter: Filter, slot: SlotInfo | null): boolean {
  const dims = dimsOf(item.key),
    fromPexels = item.name.includes('(Pexels /');
  switch (filter) {
    case 'fit':
      return !slot || !dims || fitsSlot(dims.w, dims.h, slot.aspect);
    case 'card':
      return item.card >= 0;
    case 'unused':
      return item.card < 0;
    case 'uploads':
      return !fromPexels;
    case 'pexels':
      return fromPexels;
    case 'wide':
    case 'tall':
    case 'square':
      return !!dims && shapeOf(dims.w, dims.h) === filter;
    default:
      return true;
  }
}

/**
 * How much of a photo a cover crop cuts away in the slot (1 when its size isn't known).
 * @param item the photo
 * @param slot the slot
 * @returns the share cut away, 0–1
 */
export function cropLossIn(item: Item, slot: SlotInfo): number {
  const dims = dimsOf(item.key);
  return dims ? cropLoss(dims.w, dims.h, slot.aspect) : 1;
}

/**
 * The order of two photos for a sort.
 * @param left a photo
 * @param right another
 * @param sort the sort
 * @param slot the selected slot, if any
 * @param score how well a photo suits the slot (for "Most relevant")
 * @returns negative when left comes first
 */
export function compareItems(
  left: Item,
  right: Item,
  sort: Sort,
  slot: SlotInfo | null,
  score: (item: Item) => number,
): number {
  if (sort === 'rel') return score(right) - score(left);
  if (sort === 'name') return left.name.localeCompare(right.name);
  if (sort === 'old') return left.added - right.added;
  if (sort === 'size') {
    const leftDims = dimsOf(left.key),
      rightDims = dimsOf(right.key);
    return (rightDims ? rightDims.w * rightDims.h : 0) - (leftDims ? leftDims.w * leftDims.h : 0);
  }
  if (sort === 'fit' && slot) return cropLossIn(left, slot) - cropLossIn(right, slot);
  return right.added - left.added;
}
