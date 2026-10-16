import { DEFAULT_ADJUST, pixelsNeutral, type Adjustments } from './adjust';
import type { AiTarget } from './segments';

/*
 * Masks (P1.6, P1.7, P1.8): local adjustments. A mask is a shape made of parts (brush strokes, linear and radial
 * gradients, colour and brightness ranges, the subject or sky an AI model finds), combined in order with add, subtract
 * or intersect, optionally inverted, with its own colour settings that apply only where the mask is. Masks are data,
 * never pixels: every part is drawn again from its parameters when a picture is rendered, so a mask stays editable and
 * exports match the preview.
 *
 * Masks belong to the photo, not the frame: points are shares of the photo's own width and height (before it is
 * rotated or mirrored), sizes are shares of its width. Moving, zooming, turning or mirroring the photo takes its masks
 * along. The mask is rasterised in plain code (maskRaster.ts, maskBrush.ts), so the Canvas 2D and GPU paths get the
 * very same mask, and laid on the frame by maskPlace.ts. Range parts select by the photo's own colours, before any of
 * its settings, so editing the photo doesn't move them. maskGate.ts is the gate for masks from outside.
 */

/** How a part joins the parts before it. */
export type MaskCombine = 'add' | 'subtract' | 'intersect';

/** Every way of combining, in the panel's order. */
export const MASK_COMBINES: readonly MaskCombine[] = ['add', 'subtract', 'intersect'];

/** One brush stroke of a brush part. */
export interface BrushStroke {
  /** Points as [x0, y0, x1, y1, …], shares of the photo's width and height (0–1 inside the photo). */
  pts: number[];
  /** Brush diameter, as a share of the photo's width. */
  size: number;
  /** 0 = a hard edge, 100 = soft all the way from the centre. */
  feather: number;
  /** How much one pass adds (or takes away), 1–100; passes build up. */
  flow: number;
  /** Takes the mask away instead of adding to it. */
  erase: boolean;
}

/** What every part has. */
interface PartBase {
  id: string;
  /** How this part joins the parts before it (the first part is always added). */
  combine: MaskCombine;
  invert: boolean;
}

/** Painted strokes. */
export interface BrushPart extends PartBase {
  kind: 'brush';
  strokes: BrushStroke[];
}

/** Full on one side, fading to nothing across `width`, along the direction `angle` (degrees, 90 = downwards). */
export interface LinearPart extends PartBase {
  kind: 'linear';
  /** The middle of the fade, shares of the photo's width and height. */
  x: number;
  y: number;
  angle: number;
  /** Length of the fade, as a share of the photo's width. */
  width: number;
}

/** Full inside an ellipse, fading out towards its edge over the outer `feather` per cent. */
export interface RadialPart extends PartBase {
  kind: 'radial';
  x: number;
  y: number;
  /** Radii, both as shares of the photo's width (equal radii make a circle). */
  rx: number;
  ry: number;
  angle: number;
  feather: number;
}

/** The photo's colours near a picked one (0–255 sRGB); `range` 1–100 says how near. */
export interface ColourRangePart extends PartBase {
  kind: 'colour';
  r: number;
  g: number;
  b: number;
  range: number;
}

/** The photo's tones between `lo` and `hi` (0 black – 100 white), with soft edges of `smooth`. */
export interface LumaRangePart extends PartBase {
  kind: 'luma';
  lo: number;
  hi: number;
  smooth: number;
}

/**
 * What an AI model finds in the photo (engine/segments.ts): its main subject, or its sky. The background is the subject
 * inverted. The part holds only the target; the map is made for each photo by the segmenter and kept for the session.
 */
export interface AiPart extends PartBase {
  kind: 'ai';
  target: AiTarget;
}

/** One part of a mask. */
export type MaskPart = BrushPart | LinearPart | RadialPart | ColourRangePart | LumaRangePart | AiPart;

/** The kinds of part. */
export type PartKind = MaskPart['kind'];

/** A local adjustment: where (its parts) and what (its colour settings). */
export interface Mask {
  id: string;
  name: string;
  /** Off: kept, but not applied. */
  on: boolean;
  invert: boolean;
  parts: MaskPart[];
  /** The colour settings applied where the mask is, on top of the photo's own. */
  adjust: Adjustments;
}

/** Limits that keep a mask (and an undo history of them) small. */
export const MASK_LIMITS = { masks: 16, parts: 8, strokes: 400, points: 8000, name: 40 } as const;

/** The brush's ranges: size (a share of the photo's width), feather and flow. */
export const BRUSH_RANGES = { size: [0.002, 0.6], feather: [0, 100], flow: [1, 100] } as const;

/** Ranges of the gradient and range settings: one table for validation and the panel's sliders. */
export const PART_RANGES = {
  x: [-0.5, 1.5],
  y: [-0.5, 1.5],
  angle: [-180, 180],
  width: [0.01, 2],
  rx: [0.01, 2],
  ry: [0.01, 2],
  feather: [0, 100],
  range: [1, 100],
  lo: [0, 100],
  hi: [0, 100],
  smooth: [0, 100],
} as const;

/** A new gradient or range part's settings: what shows something straight away (newPart), and the gate's fallbacks. */
export const PART_DEFAULTS = {
  linear: { x: 0.5, y: 0.4, angle: 90, width: 0.4 },
  radial: { x: 0.5, y: 0.5, rx: 0.3, ry: 0.3, angle: 0, feather: 50 },
  colour: { r: 128, g: 128, b: 128, range: 30 },
  luma: { lo: 0, hi: 50, smooth: 20 },
} as const;

let idCount = 0;

/**
 * A new id for a mask or a part.
 * @param prefix its first letter (masks: 'm'; parts: their kind's)
 * @returns an id unique in this session
 */
export const maskId = (prefix = 'm'): string => `${prefix}${Date.now().toString(36)}${(idCount++).toString(36)}`;

/**
 * A new, empty brush part.
 * @param combine how it joins the parts before it
 * @returns the part
 */
export const newBrushPart = (combine: MaskCombine = 'add'): BrushPart => ({
  id: maskId('b'),
  kind: 'brush',
  combine,
  invert: false,
  strokes: [],
});

/**
 * A new part of a kind, with settings that show something straight away: a gradient full at the top fading towards
 * the middle (a sky), a circle in the middle, a mid grey (to be picked), the darker half of the tones. Ranges usually
 * narrow a shape down, so as a later part they intersect.
 * @param kind the part's kind
 * @param first whether it is the mask's first part
 * @returns the part
 */
export function newPart(kind: PartKind, first = true): MaskPart {
  const base = { id: maskId(kind.slice(0, 1)), invert: false };
  switch (kind) {
    case 'brush':
      return newBrushPart();
    case 'linear':
      return { ...base, kind, combine: 'add', ...PART_DEFAULTS.linear };
    case 'radial':
      return { ...base, kind, combine: 'add', ...PART_DEFAULTS.radial };
    case 'colour':
      return { ...base, kind, combine: first ? 'add' : 'intersect', ...PART_DEFAULTS.colour };
    case 'luma':
      return { ...base, kind, combine: first ? 'add' : 'intersect', ...PART_DEFAULTS.luma };
    case 'ai':
      return { ...base, kind, combine: 'add', target: 'subject' };
  }
}

/**
 * A new mask with one part and neutral settings.
 * @param name its name
 * @param kind its first part's kind
 * @returns the mask
 */
export function newMask(name: string, kind: PartKind = 'brush'): Mask {
  return { id: maskId(), name, on: true, invert: false, parts: [newPart(kind)], adjust: { ...DEFAULT_ADJUST } };
}

/**
 * Whether a mask changes the picture.
 * @param mask the mask
 * @returns true when switched on, with parts, and settings that do something
 */
export const maskActive = (mask: Mask): boolean => mask.on && mask.parts.length > 0 && !pixelsNeutral(mask.adjust);

/**
 * The AI targets the masks that are switched on use: segmentations to make before drawing them (export, agents).
 * @param masks the photo's masks
 * @returns each target once
 */
export const aiTargets = (masks: readonly Mask[]): AiTarget[] => [
  ...new Set(masks.filter((mask) => mask.on).flatMap((mask) => mask.parts.flatMap((part) => (part.kind === 'ai' ? [part.target] : [])))),
];

/**
 * Whether a part selects by the photo's contents (its colours, or what a model found), so rasterising it needs the photo.
 * @param part the part
 * @returns true for range and AI parts
 */
export const usesPhoto = (part: MaskPart): boolean => part.kind === 'colour' || part.kind === 'luma' || part.kind === 'ai';
