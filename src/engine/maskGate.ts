import { mergeAdjust } from './adjust';
import { isObjectLike, isOneOf } from './guards';
import {
  BRUSH_RANGES,
  MASK_COMBINES,
  MASK_LIMITS,
  PART_DEFAULTS,
  PART_RANGES,
  maskId,
  type BrushStroke,
  type Mask,
  type MaskPart,
  type PartKind,
} from './masks';
import { AI_TARGETS } from './segments';

/*
 * The gate for masks from outside the running app (project files, agent tools): anything in, valid masks out. Unknown
 * kinds are dropped, numbers clamped, bad values replaced by defaults, strokes and points capped. Never throws.
 */

/** A valid mask or part id. */
const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** Every part kind. */
const PART_KINDS: readonly PartKind[] = ['brush', 'linear', 'radial', 'colour', 'luma', 'ai'];

/**
 * A number within a range, or a fallback.
 * @param value anything
 * @param low the least
 * @param high the most
 * @param fallback the value when `value` isn't a finite number
 * @returns the number
 */
const clamp = (value: unknown, low: number, high: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

/**
 * Whether a list holds only finite numbers.
 * @param list the list
 * @returns true when every item is a finite number
 */
const allNumbers = (list: unknown[]): list is number[] => list.every((value) => typeof value === 'number' && Number.isFinite(value));

/**
 * A brush stroke, or null when it has no valid points.
 * @param raw anything
 * @returns the stroke
 */
function mergeStroke(raw: unknown): BrushStroke | null {
  if (!isObjectLike(raw) || !Array.isArray(raw.pts)) return null;
  const pts: unknown[] = raw.pts.slice(0, MASK_LIMITS.points - (MASK_LIMITS.points % 2));
  if (pts.length < 2 || pts.length % 2 || !allNumbers(pts)) return null;
  return {
    // A stroke may start a little outside the photo (painting its edge); far outside means nothing.
    pts: pts.map((value) => Math.min(1.5, Math.max(-0.5, value))),
    size: clamp(raw.size, ...BRUSH_RANGES.size, 0.05),
    feather: clamp(raw.feather, ...BRUSH_RANGES.feather, 50),
    flow: clamp(raw.flow, ...BRUSH_RANGES.flow, 100),
    erase: raw.erase === true,
  };
}

/**
 * One gradient or range setting within its range, or its default.
 * @param raw the part's fields
 * @param key the setting
 * @param fallback its default
 * @returns the number
 */
const setting = (raw: Record<string, unknown>, key: keyof typeof PART_RANGES, fallback: number): number =>
  clamp(raw[key], PART_RANGES[key][0], PART_RANGES[key][1], fallback);

/** What every part has: its id, how it combines, whether it is inverted. */
type PartBase = Pick<MaskPart, 'id' | 'combine' | 'invert'>;

/**
 * A part of a kind from its fields.
 * @param raw the part's fields
 * @param kind its kind
 * @param base its id, combine and invert
 * @returns the part
 */
function partOf(raw: Record<string, unknown>, kind: PartKind, base: PartBase): MaskPart {
  switch (kind) {
    case 'brush': {
      const strokes = Array.isArray(raw.strokes) ? raw.strokes.slice(0, MASK_LIMITS.strokes) : [];
      return { ...base, kind, strokes: strokes.map(mergeStroke).filter((stroke): stroke is BrushStroke => !!stroke) };
    }
    case 'linear': {
      const fallback = PART_DEFAULTS.linear;
      return { ...base, kind, x: setting(raw, 'x', fallback.x), y: setting(raw, 'y', fallback.y), angle: setting(raw, 'angle', fallback.angle), width: setting(raw, 'width', fallback.width) };
    }
    case 'radial': {
      const fallback = PART_DEFAULTS.radial;
      return {
        ...base,
        kind,
        x: setting(raw, 'x', fallback.x),
        y: setting(raw, 'y', fallback.y),
        rx: setting(raw, 'rx', fallback.rx),
        ry: setting(raw, 'ry', fallback.ry),
        angle: setting(raw, 'angle', fallback.angle),
        feather: setting(raw, 'feather', fallback.feather),
      };
    }
    case 'colour': {
      const channel = (key: 'r' | 'g' | 'b') => Math.round(clamp(raw[key], 0, 255, 128));
      return { ...base, kind, r: channel('r'), g: channel('g'), b: channel('b'), range: setting(raw, 'range', PART_DEFAULTS.colour.range) };
    }
    case 'luma': {
      const fallback = PART_DEFAULTS.luma;
      const low = setting(raw, 'lo', fallback.lo);
      const high = setting(raw, 'hi', fallback.hi);
      return { ...base, kind, lo: Math.min(low, high), hi: Math.max(low, high), smooth: setting(raw, 'smooth', fallback.smooth) };
    }
    case 'ai':
      return { ...base, kind, target: isOneOf(AI_TARGETS, raw.target) ? raw.target : 'subject' };
  }
}

/**
 * A mask part from outside, or null when its kind is unknown.
 * @param raw anything
 * @returns the part
 */
export function mergePart(raw: unknown): MaskPart | null {
  if (!isObjectLike(raw) || !isOneOf(PART_KINDS, raw.kind)) return null;
  const kind = raw.kind;
  const base = {
    id: typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : maskId(kind.slice(0, 1)),
    combine: isOneOf(MASK_COMBINES, raw.combine) ? raw.combine : 'add',
    invert: raw.invert === true,
  };
  return partOf(raw, kind, base);
}

/**
 * The single gate for masks from outside the running app (project files, agent tools).
 * @param raw anything
 * @returns valid masks, or none; ids kept unique
 */
export function mergeMasks(raw: unknown): Mask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, MASK_LIMITS.masks).flatMap((item): Mask[] => {
    if (!isObjectLike(item)) return [];
    let id = typeof item.id === 'string' && ID.test(item.id) ? item.id : maskId();
    if (seen.has(id)) id = maskId();
    seen.add(id);
    const name = typeof item.name === 'string' ? item.name.replace(/\s+/g, ' ').trim().slice(0, MASK_LIMITS.name) : '';
    const parts = Array.isArray(item.parts) ? item.parts.slice(0, MASK_LIMITS.parts) : [];
    return [
      {
        id,
        name: name || 'Mask',
        on: item.on !== false,
        invert: item.invert === true,
        parts: parts.map(mergePart).filter((part): part is MaskPart => !!part),
        adjust: mergeAdjust(item.adjust),
      },
    ];
  });
}
