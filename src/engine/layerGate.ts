import { BRUSHES, SHAPES, type BrushId, type ShapeId } from '../data/layers';
import { isObjectLike, isOneOf, isRecord } from './guards';
import { keyBudget, mergeKeys, type KeyBudget } from './keyframeGate';
import { LAYER_KEY_PROPS } from './keyframes';
import { BLEND_MODES, layerId, type BlendMode, type Layer, type LayerBase, type LayerMask, type Stroke } from './layers';
import { mergePart } from './maskGate';
import { MASK_LIMITS, type MaskPart } from './masks';

/*
 * The single gate for layers from outside the running app (project files): anything in, valid layers out. Unknown
 * kinds are dropped, numbers clamped, bad values replaced by defaults, text and drawings capped, ids kept unique.
 * Never throws.
 */

/** The most a layer list may hold when read from a project file. */
export const LAYER_LIMITS = { layers: 100, text: 2000, strokes: 400, points: 8000, name: 120, font: 80, emoji: 16 } as const;

const LAYER_ID = /^[A-Za-z0-9_-]{1,40}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const SHAPE_IDS: readonly ShapeId[] = SHAPES.map((shape) => shape.id);
const BRUSH_IDS: readonly BrushId[] = BRUSHES.map((brush) => brush.id);
const BLEND_IDS: readonly BlendMode[] = BLEND_MODES.map(([blend]) => blend);

/**
 * A number within a range, or a fallback.
 * @param value anything
 * @param low the least
 * @param high the most
 * @param fallback the value when `value` isn't a finite number
 * @returns the number
 */
const num = (value: unknown, low: number, high: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

/**
 * A string cut to a length, or a fallback.
 * @param value anything
 * @param max the most characters
 * @param fallback the value when `value` isn't a string
 * @returns the string
 */
const str = (value: unknown, max: number, fallback = ''): string => (typeof value === 'string' ? value.slice(0, max) : fallback);

/**
 * A colour ("#rrggbb"), or '' for none where allowed, else a fallback.
 * @param value anything
 * @param fallback the colour otherwise
 * @param none whether '' (no colour) is allowed
 * @returns the colour
 */
const colour = (value: unknown, fallback: string, none = false): string =>
  typeof value === 'string' && (HEX.test(value) || (none && value === '')) ? value : fallback;

/**
 * A time on the timeline.
 * @param value anything
 * @returns a finite number of seconds, at least 0, or undefined
 */
const time = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined);

/**
 * A family name.
 * @param value anything
 * @returns the family, or Poppins
 */
const font = (value: unknown): string => str(value, LAYER_LIMITS.font, 'Poppins') || 'Poppins';

/**
 * A drawing's strokes, those with valid points.
 * @param raw anything
 * @returns the strokes
 */
function mergeStrokes(raw: unknown): Stroke[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, LAYER_LIMITS.strokes).flatMap((item): Stroke[] => {
    if (!isObjectLike(item)) return [];
    const pts: unknown[] = Array.isArray(item.pts) ? item.pts.slice(0, LAYER_LIMITS.points) : [];
    if (pts.length < 2 || pts.length % 2 || !pts.every((value): value is number => typeof value === 'number' && Number.isFinite(value))) return [];
    return [
      {
        brush: isOneOf(BRUSH_IDS, item.brush) ? item.brush : 'pen',
        color: colour(item.color, '#ffffff'),
        width: num(item.width, 0.0005, 1, 0.02),
        pts: pts.map((value) => Math.min(2, Math.max(-2, value))),
      },
    ];
  });
}

/**
 * A layer's mask: its gradient parts only.
 * @param raw anything
 * @returns the mask, or undefined when there is none
 */
function mergeLayerMask(raw: unknown): LayerMask | undefined {
  if (!isObjectLike(raw)) return undefined;
  const parts: unknown[] = Array.isArray(raw.parts) ? raw.parts.slice(0, MASK_LIMITS.parts) : [];
  return {
    invert: raw.invert === true,
    parts: parts.map(mergePart).filter((part): part is MaskPart => !!part && (part.kind === 'linear' || part.kind === 'radial')),
  };
}

/**
 * What every layer has, read from a file.
 * @param raw the layer's fields
 * @param id its id (already unique)
 * @param budget the project's keyframe budget
 * @returns the fields
 */
function mergeBase(raw: Record<string, unknown>, id: string, budget: KeyBudget): LayerBase {
  const start = time(raw.start);
  const end = time(raw.end);
  const keys = mergeKeys(raw.keys, LAYER_KEY_PROPS, 'layer', budget);
  const mask = mergeLayerMask(raw.mask);
  return {
    id,
    x: num(raw.x, -0.5, 1.5, 0.5),
    y: num(raw.y, -0.5, 1.5, 0.5),
    w: num(raw.w, 0.01, 4, 0.3),
    rot: num(raw.rot, -360, 360, 0),
    opacity: num(raw.opacity, 0, 1, 1),
    ...(isOneOf(BLEND_IDS, raw.blend) ? { blend: raw.blend } : {}),
    ...(raw.hidden === true ? { hidden: true } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined && end > (start ?? 0) ? { end } : {}),
    ...(keys ? { keys } : {}),
    ...(mask ? { mask } : {}),
  };
}

/**
 * A layer of its kind from its fields.
 * @param raw the layer's fields
 * @param base what every layer has
 * @param images the ids of the pictures the project holds
 * @returns the layer, or null for an unknown kind, an empty sticker or a missing picture
 */
function layerOfKind(raw: Record<string, unknown>, base: LayerBase, images: ReadonlySet<string>): Layer | null {
  switch (raw.kind) {
    case 'text':
      return {
        ...base,
        kind: 'text',
        text: str(raw.text, LAYER_LIMITS.text),
        font: font(raw.font),
        size: num(raw.size, 0.005, 1, 0.08),
        color: colour(raw.color, '#ffffff'),
        align: raw.align === 'left' || raw.align === 'right' ? raw.align : 'center',
        bold: raw.bold === true,
        italic: raw.italic === true,
        outline: colour(raw.outline, '', true),
        bg: colour(raw.bg, '', true),
        shadow: raw.shadow === true,
      };
    case 'shape':
      return {
        ...base,
        kind: 'shape',
        shape: isOneOf(SHAPE_IDS, raw.shape) ? raw.shape : 'rect',
        h: num(raw.h, 0.005, 4, 0.2),
        fill: colour(raw.fill, '', true),
        stroke: colour(raw.stroke, '', true),
        strokeW: num(raw.strokeW, 0, 0.2, 0),
        text: str(raw.text, LAYER_LIMITS.text),
        textColor: colour(raw.textColor, '#111111'),
        font: font(raw.font),
        textSize: num(raw.textSize, 0.005, 1, 0.055),
        bold: raw.bold === true,
      };
    case 'sticker': {
      const emoji = str(raw.emoji, LAYER_LIMITS.emoji);
      return emoji ? { ...base, kind: 'sticker', emoji } : null;
    }
    case 'draw':
      return { ...base, kind: 'draw', h: num(raw.h, 0.005, 4, 0.2), strokes: mergeStrokes(raw.strokes) };
    case 'image':
      if (typeof raw.image !== 'string' || !LAYER_ID.test(raw.image) || !images.has(raw.image)) return null;
      return { ...base, kind: 'image', image: raw.image, h: num(raw.h, 0.005, 4, 0.2), name: str(raw.name, LAYER_LIMITS.name) };
    default:
      return null;
  }
}

/**
 * The single gate for layers from outside the running app (project files). Image layers are kept only when `images`
 * holds their picture's id (the project's media). Keyframes go through `mergeKeys` against the project's budget (205).
 * @param raw anything
 * @param images the ids of the pictures the project holds
 * @param budget the project's keyframe budget
 * @returns valid layers, or none
 */
export function mergeLayers(raw: unknown, images: ReadonlySet<string> = new Set(), budget: KeyBudget = keyBudget()): Layer[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const layers: Layer[] = [];
  for (const item of raw) {
    if (layers.length >= LAYER_LIMITS.layers) break;
    if (!isRecord(item)) continue;
    let id = typeof item.id === 'string' && LAYER_ID.test(item.id) ? item.id : layerId();
    while (seen.has(id)) id = layerId();
    const layer = layerOfKind(item, mergeBase(item, id, budget), images);
    if (!layer) continue;
    seen.add(id);
    layers.push(layer);
  }
  return layers;
}
