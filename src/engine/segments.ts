/*
 * Segmentations (P1.8): what an AI model found in a photo (its subject, its sky), as a soft map of shares 0–1 over the
 * whole photo. They are kept here per picture source, the way range masks keep a sample of the photo, so an AI mask
 * part (engine/masks.ts) stays data: it names a target, and is drawn from the map found for the photo it is rendered
 * with. The maps are made by the segmenter (src/ai/segment/, loaded on first use) and held only for the session.
 * Nothing here needs the model, so rendering never waits for it: a map not made yet draws as an empty part.
 */

/** What a model can find. */
export type AiTarget = 'subject' | 'sky';

/** Every target. */
export const AI_TARGETS: readonly AiTarget[] = ['subject', 'sky'];

/** A soft map over a photo. */
export interface Segment {
  /** Map size; the map covers the whole photo, whatever its proportions. */
  w: number;
  h: number;
  /** w × h shares, 0–1, row by row. */
  data: Float32Array;
}

const bySource = new WeakMap<object, Map<AiTarget, Segment>>();
const versions = new WeakMap<object, number>();
let count = 0;
const listeners = new Set<() => void>();

/**
 * Keeps a segmentation of a picture source (a photo's preview canvas, a decoded image).
 * @param src the picture source
 * @param target what was found
 * @param segment the map
 */
export function setSegment(src: object, target: AiTarget, segment: Segment): void {
  const segments = bySource.get(src) ?? new Map<AiTarget, Segment>();
  segments.set(target, segment);
  bySource.set(src, segments);
  versions.set(src, ++count);
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * A kept segmentation.
 * @param src the picture source
 * @param target what was found
 * @returns the map, if one was made
 */
export const segmentOf = (src: object, target: AiTarget): Segment | undefined => bySource.get(src)?.get(target);

/**
 * Changes whenever a segmentation of this source is added: part of the cache keys of rasters that use one.
 * @param src the picture source
 * @returns its version (0 before any)
 */
export const segmentVersion = (src: object): number => versions.get(src) ?? 0;

/**
 * Lets another source of the same photo (the full-size image decoded for export) use its segmentations.
 * @param from the source with segmentations
 * @param to the other source
 */
export function shareSegments(from: object, to: object): void {
  const segments = bySource.get(from);
  if (!segments) return;
  bySource.set(to, segments);
  versions.set(to, ++count);
}

/**
 * Counts every segmentation kept so far (a version for redrawing).
 * @returns the count
 */
export const segmentsSeq = (): number => count;

/**
 * Calls a function whenever a segmentation arrives (the stage redraws).
 * @param listener the function
 * @returns the unsubscribe
 */
export function onSegments(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The map's value at a photo position, bilinear.
 * @param segment the map
 * @param shareX a share of the photo's width
 * @param shareY a share of its height
 * @returns 0–1
 */
export function segmentAt(segment: Segment, shareX: number, shareY: number): number {
  const x = Math.min(segment.w - 1, Math.max(0, shareX * segment.w - 0.5));
  const y = Math.min(segment.h - 1, Math.max(0, shareY * segment.h - 0.5));
  const left = x | 0;
  const top = y | 0;
  const right = left + 1 < segment.w ? left + 1 : left;
  const bottom = top + 1 < segment.h ? top + 1 : top;
  const fractionX = x - left;
  const fractionY = y - top;
  const data = segment.data;
  const topLeft = data[top * segment.w + left] ?? 0;
  const bottomLeft = data[bottom * segment.w + left] ?? 0;
  const upper = topLeft + ((data[top * segment.w + right] ?? 0) - topLeft) * fractionX;
  const lower = bottomLeft + ((data[bottom * segment.w + right] ?? 0) - bottomLeft) * fractionX;
  return upper + (lower - upper) * fractionY;
}
