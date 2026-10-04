/*
 * Segmentations (P1.8): what an AI model found in a photo (its subject, its sky), as a soft map of shares 0–1 over the
 * whole photo. They are kept here per picture source, the way range masks keep a sample of the photo, so an AI mask
 * part (engine/masks.ts) stays data: it names a target, and is drawn from the map found for the photo it is rendered
 * with. The maps are made by the segmenter (src/ai/segment/, loaded on first use) and held only for the session.
 * Nothing here needs the model, so rendering never waits for it: a map not made yet draws as an empty part.
 */

export type AiTarget = 'subject' | 'sky';
export const AI_TARGETS: readonly AiTarget[] = ['subject', 'sky'];

export interface Segment {
  /** Map size; the map covers the whole photo, whatever its proportions. */
  w: number;
  h: number;
  /** w × h shares, 0–1, row by row. */
  data: Float32Array;
}

const bySrc = new WeakMap<object, Map<AiTarget, Segment>>();
const versions = new WeakMap<object, number>();
let seq = 0;
const subs = new Set<() => void>();

/** Keeps a segmentation of a picture source (a photo's preview canvas, a decoded image). */
export function setSegment(src: object, target: AiTarget, seg: Segment): void {
  const m = bySrc.get(src) ?? new Map<AiTarget, Segment>();
  m.set(target, seg);
  bySrc.set(src, m);
  versions.set(src, ++seq);
  subs.forEach((f) => f());
}

export const segmentOf = (src: object, target: AiTarget): Segment | undefined => bySrc.get(src)?.get(target);

/** Changes whenever a segmentation of this source is added: part of the cache keys of rasters that use one. */
export const segmentVersion = (src: object): number => versions.get(src) ?? 0;

/** Lets another source of the same photo (the full-size image decoded for export) use its segmentations. */
export function shareSegments(from: object, to: object): void {
  const m = bySrc.get(from);
  if (!m) return;
  bySrc.set(to, m);
  versions.set(to, ++seq);
}

/** Counts every segmentation kept so far (a version for redrawing). */
export const segmentsSeq = (): number => seq;

/** Called whenever a segmentation arrives (the stage redraws). Returns the unsubscribe. */
export function onSegments(f: () => void): () => void {
  subs.add(f);
  return () => void subs.delete(f);
}

/** The map's value at a photo position (shares 0–1), bilinear. */
export function segmentAt(s: Segment, u: number, v: number): number {
  const X = Math.min(s.w - 1, Math.max(0, u * s.w - 0.5)),
    Y = Math.min(s.h - 1, Math.max(0, v * s.h - 0.5)),
    i0 = X | 0,
    j0 = Y | 0,
    i1 = i0 + 1 < s.w ? i0 + 1 : i0,
    j1 = j0 + 1 < s.h ? j0 + 1 : j0,
    fx = X - i0,
    fy = Y - j0,
    d = s.data,
    top = d[j0 * s.w + i0] + (d[j0 * s.w + i1] - d[j0 * s.w + i0]) * fx,
    bot = d[j1 * s.w + i0] + (d[j1 * s.w + i1] - d[j1 * s.w + i0]) * fx;
  return top + (bot - top) * fy;
}
