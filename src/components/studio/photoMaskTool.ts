import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { DEFAULT_ADJUST } from '../../engine/adjust';
import { photoPlace, renderIg } from '../../engine/instagram';
import { neutralise } from '../../engine/light';
import { BRUSH_RANGES, MASK_LIMITS, newBrushPart, type BrushStroke, type LinearPart, type Mask, type MaskPart, type RadialPart } from '../../engine/masks';
import { dragPart, frameToPhoto, partHandles, type HandleId, type PhotoPlace } from '../../engine/maskPlace';
import { toast } from '../../lib/toast';
import { adjustPhoto, getIg, selectMask, setPicking, updateMask, type IgItem } from '../../state/instagram';
import { addMask } from '../ig/MaskPanel';
import { handleRadius } from '../ig/useLayerPointer';

/*
 * The photo stage's Masks tool and white-balance eyedropper. The Masks tool works by the selected part: a brush stroke
 * goes into a brush part (a new mask when none is selected), in the photo's own coordinates, so it stays put when the
 * photo is moved, turned or mirrored; a gradient is moved by its handles, or drawn anew by a drag elsewhere; a range
 * takes the colour or brightness clicked. Painting over an AI part refines it: a new brush part that adds (Paint) or
 * subtracts (Erase).
 */

/** A brush stroke being painted. */
interface StrokeDrag {
  mask: string;
  part: string;
  stroke: BrushStroke;
  /** The undo step's key. */
  key: string;
  /** The canvas's size in pixels when it started. */
  width: number;
  height: number;
  /** The last point added, in canvas pixels. */
  last: [number, number];
}

/** A gradient being moved by a handle, or drawn anew. */
interface GradientDrag {
  mask: string;
  original: LinearPart | RadialPart;
  handle: HandleId | 'draw';
  /** Where the drag started, in the photo's own coordinates. */
  from: [number, number];
  key: string;
  width: number;
  height: number;
}

/** The Masks tool's pointer handlers (positions in canvas pixels). */
export interface MaskPointer {
  down: (x: number, y: number, width: number, height: number) => void;
  move: (x: number, y: number) => void;
  up: () => void;
}

/**
 * Replaces one part of a mask.
 * @param itemId the photo
 * @param maskId the mask
 * @param part the changed part
 * @param key the undo grouping key
 */
function putPart(itemId: string, maskId: string, part: MaskPart, key = ''): void {
  updateMask(itemId, maskId, (mask) => ({ ...mask, parts: mask.parts.map((candidate) => (candidate.id === part.id ? part : candidate)) }), key);
}

/**
 * Writes a stroke into its brush part: the stroke being painted is replaced by its longer self (one undo step).
 * @param itemId the photo
 * @param drag the stroke being painted
 * @param stroke the stroke with its new points
 */
function putStroke(itemId: string, drag: StrokeDrag, stroke: BrushStroke): void {
  updateMask(
    itemId,
    drag.mask,
    (mask) => ({
      ...mask,
      parts: mask.parts.map((part) => {
        if (part.id !== drag.part || part.kind !== 'brush') return part;
        const strokes = part.strokes.at(-1) === drag.stroke ? [...part.strokes.slice(0, -1), stroke] : [...part.strokes, stroke];
        return { ...part, strokes };
      }),
    }),
    drag.key,
  );
}

/**
 * The photo's own colour around a point on it (3 × 3 pixels of the preview, before any settings).
 * @param preview the photo's preview canvas
 * @param across the point across the photo, 0–1
 * @param down the point down the photo, 0–1
 * @returns red, green and blue, or null off the photo
 */
function photoColour(preview: HTMLCanvasElement, across: number, down: number): [number, number, number] | null {
  if (across < 0 || across > 1 || down < 0 || down > 1) return null;
  const centreX = Math.min(preview.width - 2, Math.max(1, Math.round(across * preview.width)));
  const centreY = Math.min(preview.height - 2, Math.max(1, Math.round(down * preview.height)));
  const pixels = preview.getContext('2d')?.getImageData(centreX - 1, centreY - 1, 3, 3).data;
  if (!pixels) return null;
  const sum = [0, 0, 0];
  for (let at = 0; at < pixels.length; at += 4) for (let channel = 0; channel < 3; channel++) sum[channel] = (sum[channel] ?? 0) + (pixels[at + channel] ?? 0) / 9;
  return [Math.round(sum[0] ?? 0), Math.round(sum[1] ?? 0), Math.round(sum[2] ?? 0)];
}

/**
 * A range part takes the colour, or the brightness (±15), clicked on the photo.
 * @param item the photo
 * @param maskId the mask
 * @param part the colour or brightness part
 * @param point the click in the photo's own coordinates
 */
function pickRange(item: IgItem, maskId: string, part: MaskPart, point: [number, number]): void {
  const colour = photoColour(item.preview, point[0], point[1]);
  if (!colour) return;
  const [red, green, blue] = colour;
  if (part.kind === 'colour') putPart(item.id, maskId, { ...part, r: red, g: green, b: blue });
  else if (part.kind === 'luma') {
    const lightness = ((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255) * 100;
    putPart(item.id, maskId, { ...part, lo: Math.max(0, Math.round(lightness - 15)), hi: Math.min(100, Math.round(lightness + 15)) });
  }
}

/**
 * The gradient handle nearest a press, within reach.
 * @param part the gradient
 * @param place the photo's place on the canvas
 * @param x the press, in canvas pixels
 * @param y the press
 * @param reach how far a handle can be, in pixels
 * @returns the handle, or 'draw' to draw the gradient anew
 */
function handleAt(part: LinearPart | RadialPart, place: PhotoPlace, x: number, y: number, reach: number): HandleId | 'draw' {
  const near = partHandles(part, place)
    .filter((handle) => Math.hypot(handle.x - x, handle.y - y) <= reach)
    .sort((first, second) => Math.hypot(first.x - x, first.y - y) - Math.hypot(second.x - x, second.y - y));
  return near.at(0)?.id ?? 'draw';
}

/**
 * The mask a press acts on: the selected one, else a new one.
 * @param item the photo
 * @returns the mask, or null (with a toast) when the photo has the most it can have
 */
function maskForPress(item: IgItem): Mask | null {
  const mask = item.edit.masks.find((candidate) => candidate.id === getIg().maskSel);
  if (mask) return mask;
  const made = addMask(item);
  if (!made) toast('A photo can have 16 masks; delete one to add another.');
  return made ?? null;
}

/**
 * The Masks tool on the stage.
 * @param item the photo
 * @param canvasRef the stage's canvas (for the handle size)
 * @returns the pointer handlers for useLayerPointer's `onMask`
 */
export function useMaskTool(item: IgItem, canvasRef: RefObject<HTMLCanvasElement | null>): MaskPointer {
  const strokeRef = useRef<StrokeDrag | null>(null);
  const gradientRef = useRef<GradientDrag | null>(null);
  const down = (x: number, y: number, width: number, height: number) => {
    const mask = maskForPress(item);
    if (!mask) return;
    let part = mask.parts.find((candidate) => candidate.id === getIg().partSel) ?? mask.parts.at(0);
    if (!part) return;
    const place = photoPlace(item.preview.width, item.preview.height, item.edit, width, height);
    const point = frameToPhoto(place, x, y);
    const key = `maskdrag:${Date.now()}`;
    let erase = getIg().maskBrush.erase;
    if (part.kind === 'ai') {
      if (mask.parts.length >= MASK_LIMITS.parts) {
        toast('A mask can have 8 parts; delete one to refine it with the brush.');
        return;
      }
      const brushPart = newBrushPart(erase ? 'subtract' : 'add');
      updateMask(item.id, mask.id, (current) => ({ ...current, parts: [...current.parts, brushPart] }), key);
      selectMask(mask.id, brushPart.id);
      part = brushPart;
      erase = false;
    }
    if (part.kind === 'linear' || part.kind === 'radial') {
      const reach = (canvasRef.current ? handleRadius(canvasRef.current) : 8) * 1.8;
      gradientRef.current = { mask: mask.id, original: part, handle: handleAt(part, place, x, y, reach), from: point, key, width, height };
      return;
    }
    if (part.kind === 'colour' || part.kind === 'luma') {
      pickRange(item, mask.id, part, point);
      return;
    }
    const brush = getIg().maskBrush;
    const stroke: BrushStroke = {
      pts: [point[0], point[1]],
      size: Math.min(BRUSH_RANGES.size[1], Math.max(BRUSH_RANGES.size[0], (brush.size * width) / place.w)),
      feather: brush.feather,
      flow: brush.flow,
      erase,
    };
    const partId = part.id;
    strokeRef.current = { mask: mask.id, part: partId, stroke, key, width, height, last: [x, y] };
    // The part holds the stroke from now on; each move replaces it with a longer one (one undo step).
    updateMask(item.id, mask.id, (current) => ({ ...current, parts: current.parts.map((candidate) => (candidate.id === partId && candidate.kind === 'brush' ? { ...candidate, strokes: [...candidate.strokes, stroke] } : candidate)) }), key);
  };
  const move = (x: number, y: number) => {
    const latest = getIg().items.find((candidate) => candidate.id === item.id);
    if (!latest) return;
    const gradient = gradientRef.current;
    if (gradient) {
      const place = photoPlace(latest.preview.width, latest.preview.height, latest.edit, gradient.width, gradient.height);
      putPart(item.id, gradient.mask, dragPart(gradient.original, gradient.handle, gradient.from, frameToPhoto(place, x, y), place), gradient.key);
      return;
    }
    const drag = strokeRef.current;
    if (!drag || Math.hypot(x - drag.last[0], y - drag.last[1]) < 2) return;
    const [across, down] = frameToPhoto(photoPlace(latest.preview.width, latest.preview.height, latest.edit, drag.width, drag.height), x, y);
    const stroke = { ...drag.stroke, pts: [...drag.stroke.pts, across, down] };
    putStroke(item.id, drag, stroke);
    drag.stroke = stroke;
    drag.last = [x, y];
  };
  const up = () => {
    strokeRef.current = null;
    gradientRef.current = null;
  };
  return { down, move, up };
}

/**
 * The white-balance eyedropper: samples the photo with only its look applied (before white balance), 5 × 5 pixels
 * around the click, and sets the temperature and tint that turn that colour grey.
 * @param event the click on the stage
 * @param item the photo
 */
export function pickNeutral(event: ReactPointerEvent<HTMLCanvasElement>, item: IgItem): void {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((event.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.round(((event.clientY - rect.top) / rect.height) * canvas.height);
  const sampler = document.createElement('canvas');
  sampler.width = canvas.width;
  sampler.height = canvas.height;
  const context = sampler.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const lookOnly = { ...item.edit, adjust: { ...DEFAULT_ADJUST, look: item.edit.adjust.look } };
  renderIg(context, item.preview, item.preview.width, item.preview.height, lookOnly, sampler.width, sampler.height);
  const pixels = context.getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let at = 0; at < pixels.length; at += 4) {
    red += pixels[at] ?? 0;
    green += pixels[at + 1] ?? 0;
    blue += pixels[at + 2] ?? 0;
  }
  const count = pixels.length / 4;
  adjustPhoto(item.id, neutralise(red / count, green / count, blue / count));
  setPicking(false);
}
