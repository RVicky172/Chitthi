import { brushDef, shapeDef, type BrushId, type ShapeId, type TextStyle } from '../data/layers';
import type { Keyframes, LayerKeyProp } from './keyframes';
import type { MaskPart } from './masks';

/*
 * Layers over a photo or video frame: text, shapes (which can hold words), emoji stickers and freehand drawing.
 * Units: a layer's centre (x, y) is a share of the frame's width and height; sizes (w, h, text size, stroke widths)
 * are a share of the frame WIDTH, so a layer keeps its proportions in every format and draws the same at any scale
 * (preview, exported photo, each video frame). Video layers can also carry start / end times in seconds.
 *
 * Every layer can blend with what is under it (multiply, screen, overlay…; Canvas 2D composite operations) and carry a
 * mask (P1.10): gradient parts from engine/masks.ts, placed in the layer's own box, so the mask moves, turns and grows
 * with the layer. Image layers (logos, overlays) refer to their picture by id; the pictures stay in memory here.
 * Drawing is layerDraw.ts; picking and handles layerPick.ts; the gate for layers from files layerGate.ts.
 */

/** How a layer mixes with what is under it: Canvas 2D's composite operations that blend colours. */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** Every blend mode with its label, in the menu's order. */
export const BLEND_MODES: readonly [BlendMode, string][] = [
  ['normal', 'Normal'],
  ['multiply', 'Multiply'],
  ['screen', 'Screen'],
  ['overlay', 'Overlay'],
  ['soft-light', 'Soft light'],
  ['hard-light', 'Hard light'],
  ['darken', 'Darken'],
  ['lighten', 'Lighten'],
  ['color-dodge', 'Colour dodge'],
  ['color-burn', 'Colour burn'],
  ['difference', 'Difference'],
  ['exclusion', 'Exclusion'],
  ['hue', 'Hue'],
  ['saturation', 'Saturation'],
  ['color', 'Colour'],
  ['luminosity', 'Luminosity'],
];

/**
 * A layer's mask: parts as in a photo's masks (engine/masks.ts), but their positions are shares of the layer's own
 * box (before it turns) and sizes shares of its width. Where the mask is 0 the layer doesn't show.
 */
export interface LayerMask {
  invert: boolean;
  parts: MaskPart[];
}

/** What every layer has. */
export interface LayerBase {
  id: string;
  /** Centre, as a share of the frame width / height (0–1). */
  x: number;
  y: number;
  /** Width, as a share of the frame width. */
  w: number;
  /** Rotation in degrees, clockwise. */
  rot: number;
  /** 0–1. */
  opacity: number;
  /** How it mixes with what is under it; normal when not set. */
  blend?: BlendMode;
  /** Where it shows; everywhere when not set. */
  mask?: LayerMask;
  hidden?: boolean;
  /** Video only: seconds on the timeline when the layer appears and disappears. */
  start?: number;
  end?: number;
  /** Video only, keyframes (205): animated position, size, rotation and opacity, times from the layer's start. */
  keys?: Keyframes<LayerKeyProp>;
}

/** Words. */
export interface TextLayer extends LayerBase {
  kind: 'text';
  text: string;
  font: string;
  /** Font size, as a share of the frame width. */
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
  /** Outline colour, or '' for none. */
  outline: string;
  /** Background colour behind the text, or '' for none. */
  bg: string;
  shadow: boolean;
}

/** A shape, which can hold words. */
export interface ShapeLayer extends LayerBase {
  kind: 'shape';
  shape: ShapeId;
  /** Height, as a share of the frame width. */
  h: number;
  /** Fill colour, or '' for none. */
  fill: string;
  /** Border colour, or '' for none. */
  stroke: string;
  /** Border width, as a share of the frame width. */
  strokeW: number;
  /** Words inside the shape ('' for none). */
  text: string;
  textColor: string;
  font: string;
  textSize: number;
  bold: boolean;
}

/** An emoji sticker. */
export interface StickerLayer extends LayerBase {
  kind: 'sticker';
  emoji: string;
}

/** One freehand stroke of a drawing. */
export interface Stroke {
  brush: BrushId;
  color: string;
  /** Line width, as a share of the layer's width (so it grows when the drawing is resized). */
  width: number;
  /** Points as [x0, y0, x1, y1, …], each a share of the layer's width / height from its centre (-0.5–0.5). */
  pts: number[];
}

/** A freehand drawing. */
export interface DrawLayer extends LayerBase {
  kind: 'draw';
  /** Height, as a share of the frame width. */
  h: number;
  strokes: Stroke[];
}

/** A picture over the photo (a logo, a frame, a texture), kept in memory by id (addLayerImage). */
export interface ImageLayer extends LayerBase {
  kind: 'image';
  /** The picture's id in this session's images. */
  image: string;
  /** Height, as a share of the frame width (the picture's proportions at its width). */
  h: number;
  /** For the layer list: the file it came from. */
  name: string;
}

/** Any layer. */
export type Layer = TextLayer | ShapeLayer | StickerLayer | DrawLayer | ImageLayer;

/** A layer's box on the frame, in pixels: centre, size and rotation (radians). */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

let idCount = 0;

/**
 * A new layer id.
 * @returns an id unique in this session
 */
export const layerId = (): string => `l${Date.now().toString(36)}${(idCount++).toString(36)}`;

/**
 * The first line of a text, cut short.
 * @param text the text
 * @param length the most characters
 * @returns its first line's start
 */
const firstLine = (text: string, length: number): string => (text.split('\n').at(0) ?? '').slice(0, length);

/**
 * A layer's name in the layer list.
 * @param layer the layer
 * @returns such as "Text: Happy birthday" or "Drawing (3 strokes)"
 */
export function layerName(layer: Layer): string {
  switch (layer.kind) {
    case 'text':
      return `Text: ${firstLine(layer.text, 24) || '(empty)'}`;
    case 'shape':
      return layer.text ? `${shapeDef(layer.shape).name}: ${firstLine(layer.text, 18)}` : shapeDef(layer.shape).name;
    case 'sticker':
      return `Sticker ${layer.emoji}`;
    case 'image':
      return `Image: ${layer.name.slice(0, 24) || 'picture'}`;
    case 'draw':
      return `Drawing (${String(layer.strokes.length)} stroke${layer.strokes.length === 1 ? '' : 's'})`;
  }
}

/**
 * Whether a layer shows at a time.
 * @param layer the layer
 * @param time seconds on the timeline; photos pass none
 * @returns true when not hidden and (with a time) within its start and end
 */
export const activeAt = (layer: Layer, time?: number): boolean =>
  !layer.hidden && (time === undefined || ((layer.start ?? 0) <= time && time < (layer.end ?? Infinity)));

/* ---------- images ---------- */

/** A picture an image layer shows, with its size. */
export type LayerPicture = CanvasImageSource & { width: number; height: number };

/** Pictures of image layers, by id, for this session (layers keep only the id, so undo and copies stay small). */
const images = new Map<string, LayerPicture>();
let imageCount = 0;

/**
 * Keeps a picture for image layers.
 * @param picture the picture
 * @returns its id
 */
export function addLayerImage(picture: LayerPicture): string {
  const id = `img${Date.now().toString(36)}${(imageCount++).toString(36)}`;
  images.set(id, picture);
  return id;
}

/**
 * A kept picture.
 * @param id its id
 * @returns the picture, or undefined when it isn't kept
 */
export const layerImage = (id: string): LayerPicture | undefined => images.get(id);

/**
 * An image layer for a kept picture, a third of the frame wide, centred.
 * @param image the picture's id
 * @param width its width, pixels
 * @param height its height, pixels
 * @param name the file it came from
 * @returns the layer
 */
export function newImageLayer(image: string, width: number, height: number, name: string): ImageLayer {
  const layerWidth = 0.34;
  return { id: layerId(), kind: 'image', image, name, x: 0.5, y: 0.5, w: layerWidth, h: (layerWidth * height) / Math.max(1, width), rot: 0, opacity: 1 };
}

/* ---------- new layers ---------- */

/**
 * A new text layer in a style, centred.
 * @param style the text style
 * @param text its words
 * @returns the layer
 */
export function newText(style: TextStyle, text = 'Your words'): TextLayer {
  return {
    id: layerId(),
    kind: 'text',
    x: 0.5,
    y: 0.5,
    w: 0.8,
    rot: 0,
    opacity: 1,
    text,
    font: style.font,
    size: 0.08,
    color: style.color,
    align: 'center',
    bold: style.bold,
    italic: style.italic,
    outline: style.outline,
    bg: style.bg,
    shadow: style.shadow,
  };
}

/**
 * A new shape's fill: red hearts, gold stars and bursts, else white.
 * @param shape the shape
 * @returns a colour
 */
function shapeFill(shape: ShapeId): string {
  if (shape === 'heart') return '#e63946';
  return shape === 'star' || shape === 'burst' ? '#f4c430' : '#ffffff';
}

/**
 * A new shape's words, for shapes that hold them.
 * @param shape the shape
 * @returns the words, or ''
 */
function shapeWords(shape: ShapeId): string {
  if (!shapeDef(shape).holdsText) return '';
  if (shape === 'bubble') return 'Hello!';
  return shape === 'burst' ? 'NEW' : 'Your words';
}

/**
 * A new shape layer, centred, at the shape's own size.
 * @param shape the shape
 * @returns the layer
 */
export function newShape(shape: ShapeId): ShapeLayer {
  const definition = shapeDef(shape);
  return {
    id: layerId(),
    kind: 'shape',
    shape,
    x: 0.5,
    y: 0.5,
    w: definition.w,
    h: definition.h,
    rot: 0,
    opacity: 1,
    fill: shapeFill(shape),
    stroke: '',
    strokeW: 0.006,
    text: shapeWords(shape),
    textColor: '#111111',
    font: 'Poppins',
    textSize: shape === 'pill' || shape === 'banner' ? 0.045 : 0.055,
    bold: true,
  };
}

/**
 * A new sticker, centred.
 * @param emoji the emoji
 * @returns the layer
 */
export const newSticker = (emoji: string): StickerLayer => ({ id: layerId(), kind: 'sticker', emoji, x: 0.5, y: 0.5, w: 0.18, rot: 0, opacity: 1 });

/** The sizes a layer scales: its width, and its height, text sizes and border by kind. */
interface ScaledSizes {
  w: number;
  h?: number;
  size?: number;
  textSize?: number;
  strokeW?: number;
}

/**
 * A layer's sizes scaled.
 * @param layer the layer
 * @param scale the scale
 * @returns the scaled sizes
 */
function scaledSizes(layer: Layer, scale: number): ScaledSizes {
  const width = layer.w * scale;
  switch (layer.kind) {
    case 'text':
      return { w: width, size: layer.size * scale };
    case 'shape':
      return { w: width, h: layer.h * scale, textSize: layer.textSize * scale, strokeW: layer.strokeW * scale };
    case 'draw':
    case 'image':
      return { w: width, h: layer.h * scale };
    case 'sticker':
      return { w: width };
  }
}

/**
 * A layer scaled about its centre (width, height, text sizes, sticker size), its width kept between 0.03 and 3.
 * @param layer the layer
 * @param factor the scale wanted
 * @returns the scaled layer
 */
export function scaleLayer<L extends Layer>(layer: L, factor: number): L {
  const scale = Math.max(0.03 / layer.w, Math.min(3 / layer.w, factor));
  return Object.assign({ ...layer }, scaledSizes(layer, scale));
}

/* ---------- drawing strokes into a layer ---------- */

/** A stroke with its points and width in frame-width units (while addStroke re-fits the box). */
type FrameStroke = Stroke;

/** The bounds of a set of strokes, frame-width units. */
interface StrokeBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The bounds of strokes, each widened by half its width.
 * @param strokes the strokes, frame-width units
 * @returns the bounds
 */
function strokeBounds(strokes: FrameStroke[]): StrokeBounds {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const stroke of strokes) {
    const half = stroke.width / 2;
    for (let index = 0; index + 1 < stroke.pts.length; index += 2) {
      const x = stroke.pts[index] ?? 0;
      const y = stroke.pts[index + 1] ?? 0;
      bounds.left = Math.min(bounds.left, x - half);
      bounds.right = Math.max(bounds.right, x + half);
      bounds.top = Math.min(bounds.top, y - half);
      bounds.bottom = Math.max(bounds.bottom, y + half);
    }
  }
  return bounds;
}

/**
 * Adds a stroke drawn at frame pixels [x0, y0, x1, y1, …] to a drawing layer (or makes a new one), re-fitting the
 * layer's box around all its strokes.
 * @param layer the drawing, or null for a new one
 * @param points the stroke's points, frame pixels
 * @param brush the brush
 * @param color the colour
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @param widthPx the stroke's width, pixels (default: the brush's)
 * @returns the drawing; null for a rotated drawing, which can't take more strokes (start a new one)
 */
export function addStroke(
  layer: DrawLayer | null,
  points: number[],
  brush: BrushId,
  color: string,
  frameWidth: number,
  frameHeight: number,
  widthPx?: number,
): DrawLayer | null {
  if (layer && layer.rot !== 0) return null;
  const brushWidth = widthPx ?? brushDef(brush).width * frameWidth;
  // Every point in frame-width units, with each stroke's width in the same units.
  const strokes: FrameStroke[] = [];
  if (layer) {
    const centreY = (layer.y * frameHeight) / frameWidth;
    for (const stroke of layer.strokes) {
      const pts = stroke.pts.map((value, index) => (index % 2 ? centreY + value * layer.h : layer.x + value * layer.w));
      strokes.push({ brush: stroke.brush, color: stroke.color, width: stroke.width * layer.w, pts });
    }
  }
  strokes.push({ brush, color, width: brushWidth / frameWidth, pts: points.map((value) => value / frameWidth) });
  const bounds = strokeBounds(strokes);
  const width = Math.max(0.005, bounds.right - bounds.left);
  const height = Math.max(0.005, bounds.bottom - bounds.top);
  const centreX = (bounds.left + bounds.right) / 2;
  const centreY = (bounds.top + bounds.bottom) / 2;
  return {
    id: layer?.id ?? layerId(),
    kind: 'draw',
    x: centreX,
    y: (centreY * frameWidth) / frameHeight,
    w: width,
    h: height,
    rot: 0,
    opacity: layer?.opacity ?? 1,
    start: layer?.start,
    end: layer?.end,
    strokes: strokes.map((stroke) => ({
      brush: stroke.brush,
      color: stroke.color,
      width: stroke.width / width,
      pts: stroke.pts.map((value, index) => (index % 2 ? (value - centreY) / height : (value - centreX) / width)),
    })),
  };
}
