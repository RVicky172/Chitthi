import { brushDef, shapeDef, type ShapeId } from '../data/layers';
import { layersAt } from './keyframes';
import { activeAt, layerImage, type Box, type DrawLayer, type ImageLayer, type Layer, type ShapeLayer, type StickerLayer, type TextLayer } from './layers';
import { frameMask, type FrameMask } from './maskPlace';

/*
 * Drawing layers on a frame: each layer's box, its text, shape, sticker, strokes or picture, its blend mode and its
 * mask. The same code draws the preview, exported photos and every video frame.
 */

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/**
 * A CSS font for a layer's words.
 * @param px the size, pixels (at least 1)
 * @param family the family
 * @param bold whether bold
 * @param italic whether italic
 * @returns the font string
 */
const fontOf = (px: number, family: string, bold: boolean, italic: boolean): string =>
  `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${String(Math.max(1, px))}px "${family}", sans-serif`;

/**
 * Breaks text into lines that fit a width (explicit line breaks kept; a single long word is broken by letters).
 * @param ctx the context, its font set
 * @param text the text
 * @param maxWidth the widest line, pixels
 * @returns the lines
 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const longer = line + word;
      if (!line || ctx.measureText(longer).width <= maxWidth) {
        line = longer;
        continue;
      }
      lines.push(line.trimEnd());
      line = word.trimStart();
      // A word longer than the box: break it.
      while (line && ctx.measureText(line).width > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** A text layer measured on a frame. */
interface TextMetrics {
  /** The font size, pixels. */
  px: number;
  /** The padding inside the box, pixels. */
  pad: number;
  lines: string[];
  /** The line height, pixels. */
  lineHeight: number;
  boxWidth: number;
  boxHeight: number;
}

/**
 * Measures a text layer: its lines wrapped to its box, and the box's height.
 * @param ctx the context (its font is set)
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 * @returns the measures
 */
function textMetrics(ctx: CanvasRenderingContext2D, layer: TextLayer, frameWidth: number): TextMetrics {
  const px = layer.size * frameWidth;
  const pad = layer.bg ? px * 0.35 : px * 0.1;
  const boxWidth = layer.w * frameWidth;
  ctx.font = fontOf(px, layer.font, layer.bold, layer.italic);
  const lines = wrapText(ctx, layer.text || ' ', Math.max(px, boxWidth - pad * 2));
  const lineHeight = px * 1.2;
  return { px, pad, lines, lineHeight, boxWidth, boxHeight: lines.length * lineHeight + pad * 2 };
}

/**
 * A layer's box in pixels on a frame. Text needs the context to measure its lines.
 * @param ctx the frame's context
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @returns the box
 */
export function layerBox(ctx: CanvasRenderingContext2D, layer: Layer, frameWidth: number, frameHeight: number): Box {
  const cx = layer.x * frameWidth;
  const cy = layer.y * frameHeight;
  const rot = (layer.rot * Math.PI) / 180;
  if (layer.kind === 'text') {
    ctx.save();
    const metrics = textMetrics(ctx, layer, frameWidth);
    ctx.restore();
    return { cx, cy, w: metrics.boxWidth, h: metrics.boxHeight, rot };
  }
  if (layer.kind === 'sticker') return { cx, cy, w: layer.w * frameWidth, h: layer.w * frameWidth, rot };
  return { cx, cy, w: layer.w * frameWidth, h: layer.h * frameWidth, rot };
}

/* ---------- shapes ---------- */

/**
 * A rounded rectangle as part of the current path.
 * @param ctx the context
 * @param x left, pixels
 * @param y top, pixels
 * @param width pixels
 * @param height pixels
 * @param radius the corners' radius, pixels (at most half the shorter side)
 */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const corner = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + corner, y);
  ctx.arcTo(x + width, y, x + width, y + height, corner);
  ctx.arcTo(x + width, y + height, x, y + height, corner);
  ctx.arcTo(x, y + height, x, y, corner);
  ctx.arcTo(x, y, x + width, y, corner);
  ctx.closePath();
}

/**
 * A star (or burst) centred on 0,0 as part of the current path.
 * @param ctx the context
 * @param width pixels
 * @param height pixels
 * @param points its points
 * @param inner the inner corners' distance, a share of the outer
 */
function starPath(ctx: CanvasRenderingContext2D, width: number, height: number, points: number, inner: number): void {
  for (let corner = 0; corner < points * 2; corner++) {
    const angle = (corner * Math.PI) / points - Math.PI / 2;
    const reach = corner % 2 ? inner : 1;
    const x = Math.cos(angle) * (width / 2) * reach;
    const y = Math.sin(angle) * (height / 2) * reach;
    if (corner) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/**
 * A speech bubble: a rounded body over the top 78 %, a tail at the bottom left.
 * @param ctx the context
 * @param width pixels
 * @param height pixels
 */
function bubblePath(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const x = -width / 2;
  const y = -height / 2;
  const bodyHeight = height * 0.78;
  const radius = Math.min(width, bodyHeight) * 0.22;
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + bodyHeight, radius);
  ctx.arcTo(x + width, y + bodyHeight, x, y + bodyHeight, radius);
  ctx.lineTo(x + width * 0.36, y + bodyHeight);
  ctx.lineTo(x + width * 0.18, y + height);
  ctx.lineTo(x + width * 0.22, y + bodyHeight);
  ctx.arcTo(x, y + bodyHeight, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/**
 * A heart.
 * @param ctx the context
 * @param width pixels
 * @param height pixels
 */
function heartPath(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const x = -width / 2;
  const y = -height / 2;
  ctx.moveTo(0, y + height * 0.3);
  ctx.bezierCurveTo(0, y, x, y, x, y + height * 0.32);
  ctx.bezierCurveTo(x, y + height * 0.62, -width * 0.12, y + height * 0.8, 0, y + height);
  ctx.bezierCurveTo(width * 0.12, y + height * 0.8, -x, y + height * 0.62, -x, y + height * 0.32);
  ctx.bezierCurveTo(-x, y, 0, y, 0, y + height * 0.3);
  ctx.closePath();
}

/**
 * A banner with notched ends.
 * @param ctx the context
 * @param width pixels
 * @param height pixels
 */
function bannerPath(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const x = -width / 2;
  const y = -height / 2;
  const notch = Math.min(height * 0.4, width * 0.15);
  ctx.moveTo(x, y);
  ctx.lineTo(-x, y);
  ctx.lineTo(-x - notch, 0);
  ctx.lineTo(-x, -y);
  ctx.lineTo(x, -y);
  ctx.lineTo(x + notch, 0);
  ctx.closePath();
}

/**
 * An arrow pointing right.
 * @param ctx the context
 * @param width pixels
 * @param height pixels
 */
function arrowPath(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const x = -width / 2;
  const y = -height / 2;
  const head = Math.min(height, width * 0.5);
  const shaft = height * 0.2;
  ctx.moveTo(x, -shaft);
  ctx.lineTo(-x - head, -shaft);
  ctx.lineTo(-x - head, y);
  ctx.lineTo(-x, 0);
  ctx.lineTo(-x - head, -y);
  ctx.lineTo(-x - head, shaft);
  ctx.lineTo(x, shaft);
  ctx.closePath();
}

/**
 * The outline of a shape in its own box, centred on 0,0, as a new path. Exported for tests.
 * @param ctx the context
 * @param shape the shape
 * @param width pixels
 * @param height pixels
 */
export function shapePath(ctx: CanvasRenderingContext2D, shape: ShapeId, width: number, height: number): void {
  const x = -width / 2;
  const y = -height / 2;
  ctx.beginPath();
  switch (shape) {
    case 'rect':
      ctx.rect(x, y, width, height);
      break;
    case 'round':
      roundRectPath(ctx, x, y, width, height, Math.min(width, height) * 0.18);
      break;
    case 'pill':
    case 'line':
      roundRectPath(ctx, x, y, width, height, height / 2);
      break;
    case 'circle':
      ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
      break;
    case 'bubble':
      bubblePath(ctx, width, height);
      break;
    case 'burst':
      starPath(ctx, width, height, 14, 0.8);
      break;
    case 'star':
      starPath(ctx, width, height, 5, 0.45);
      break;
    case 'heart':
      heartPath(ctx, width, height);
      break;
    case 'banner':
      bannerPath(ctx, width, height);
      break;
    case 'arrow':
      arrowPath(ctx, width, height);
      break;
  }
}

/* ---------- each kind ---------- */

/** Lines of words to draw. */
interface TextLines {
  lines: string[];
  lineHeight: number;
  /** The first line's top, pixels. */
  top: number;
  /** The anchor (for the context's alignment), pixels. */
  x: number;
  fill: string;
  /** Outline colour, or '' for none. */
  outline: string;
  /** The font size, pixels. */
  px: number;
}

/**
 * Draws lines of words, each outlined first when asked (with no shadow on the outline).
 * @param ctx the context, its font and alignment set
 * @param text the lines and how to draw them
 */
function drawLines(ctx: CanvasRenderingContext2D, text: TextLines): void {
  text.lines.forEach((line, index) => {
    const y = text.top + text.lineHeight * (index + 0.5);
    if (text.outline) {
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.lineJoin = 'round';
      ctx.lineWidth = text.px * 0.14;
      ctx.strokeStyle = text.outline;
      ctx.strokeText(line, text.x, y);
      ctx.restore();
    }
    ctx.fillStyle = text.fill;
    ctx.fillText(line, text.x, y);
  });
}

/**
 * Where aligned lines are anchored in a text box.
 * @param align the alignment
 * @param metrics the measured text
 * @returns x, pixels from the box's centre
 */
function lineAnchor(align: TextLayer['align'], metrics: TextMetrics): number {
  if (align === 'left') return -metrics.boxWidth / 2 + metrics.pad;
  return align === 'right' ? metrics.boxWidth / 2 - metrics.pad : 0;
}

/**
 * A text layer: its background, shadow, outline and words.
 * @param ctx the context, at the layer's centre
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 */
function drawText(ctx: CanvasRenderingContext2D, layer: TextLayer, frameWidth: number): void {
  const metrics = textMetrics(ctx, layer, frameWidth);
  if (layer.bg) {
    ctx.fillStyle = layer.bg;
    ctx.beginPath();
    roundRectPath(ctx, -metrics.boxWidth / 2, -metrics.boxHeight / 2, metrics.boxWidth, metrics.boxHeight, metrics.px * 0.3);
    ctx.fill();
  }
  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = metrics.px * 0.18;
    ctx.shadowOffsetY = metrics.px * 0.04;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = layer.align;
  const top = -metrics.boxHeight / 2 + metrics.pad;
  drawLines(ctx, { lines: metrics.lines, lineHeight: metrics.lineHeight, top, x: lineAnchor(layer.align, metrics), fill: layer.color, outline: layer.outline, px: metrics.px });
}

/**
 * How much of a shape's width its words may use.
 * @param shape the shape
 * @returns a share of the width
 */
function wordsWidth(shape: ShapeId): number {
  if (shape === 'circle' || shape === 'burst') return 0.66;
  return shape === 'banner' ? 0.7 : 0.84;
}

/**
 * A shape layer: its fill, border and words.
 * @param ctx the context, at the layer's centre
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 */
function drawShape(ctx: CanvasRenderingContext2D, layer: ShapeLayer, frameWidth: number): void {
  const width = layer.w * frameWidth;
  const height = layer.h * frameWidth;
  shapePath(ctx, layer.shape, width, height);
  if (layer.fill) {
    ctx.fillStyle = layer.fill;
    ctx.fill();
  }
  if (layer.stroke && layer.strokeW > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = layer.strokeW * frameWidth;
    ctx.strokeStyle = layer.stroke;
    ctx.stroke();
  }
  if (!layer.text || !shapeDef(layer.shape).holdsText) return;
  const px = layer.textSize * frameWidth;
  ctx.font = fontOf(px, layer.font, layer.bold, false);
  const lines = wrapText(ctx, layer.text, Math.max(px, width * wordsWidth(layer.shape)));
  const lineHeight = px * 1.2;
  // The bubble's words sit in its body, above the tail.
  const middle = layer.shape === 'bubble' ? -height * 0.11 : 0;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  drawLines(ctx, { lines, lineHeight, top: middle - (lines.length * lineHeight) / 2, x: 0, fill: layer.textColor, outline: '', px });
}

/**
 * A sticker: its emoji at the layer's size.
 * @param ctx the context, at the layer's centre
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 */
function drawSticker(ctx: CanvasRenderingContext2D, layer: StickerLayer, frameWidth: number): void {
  const px = layer.w * frameWidth * 0.86;
  ctx.font = `${String(px)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(layer.emoji, 0, px * 0.06);
}

/**
 * A drawing's strokes: a dot for a single tap, else a curve through the midpoints between the recorded points.
 * @param ctx the context, at the layer's centre
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 */
function drawStrokes(ctx: CanvasRenderingContext2D, layer: DrawLayer, frameWidth: number): void {
  const boxWidth = layer.w * frameWidth;
  const boxHeight = layer.h * frameWidth;
  for (const stroke of layer.strokes) {
    const brush = brushDef(stroke.brush);
    const points = stroke.pts;
    if (points.length < 2) continue;
    ctx.save();
    ctx.globalAlpha *= brush.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = Math.max(0.5, stroke.width * boxWidth);
    if (brush.glow) {
      ctx.shadowColor = stroke.color;
      ctx.shadowBlur = ctx.lineWidth * 2.5;
    }
    ctx.beginPath();
    const pointX = (index: number) => (points[index] ?? 0) * boxWidth;
    const pointY = (index: number) => (points[index + 1] ?? 0) * boxHeight;
    if (points.length === 2) {
      ctx.arc(pointX(0), pointY(0), ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(pointX(0), pointY(0));
      for (let index = 2; index < points.length - 2; index += 2) {
        ctx.quadraticCurveTo(pointX(index), pointY(index), (pointX(index) + pointX(index + 2)) / 2, (pointY(index) + pointY(index + 2)) / 2);
      }
      ctx.lineTo(pointX(points.length - 2), pointY(points.length - 2));
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * An image layer: its picture at the layer's size (nothing while the picture isn't kept).
 * @param ctx the context, at the layer's centre
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 */
function drawImageLayer(ctx: CanvasRenderingContext2D, layer: ImageLayer, frameWidth: number): void {
  const picture = layerImage(layer.image);
  if (!picture) return;
  const width = layer.w * frameWidth;
  const height = layer.h * frameWidth;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(picture, -width / 2, -height / 2, width, height);
}

/**
 * One layer, drawn at its place (the context already holds the opacity and blend to use).
 * @param ctx the context
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 */
function drawOne(ctx: CanvasRenderingContext2D, layer: Layer, frameWidth: number, frameHeight: number): void {
  ctx.translate(layer.x * frameWidth, layer.y * frameHeight);
  ctx.rotate((layer.rot * Math.PI) / 180);
  if (layer.kind === 'text') drawText(ctx, layer, frameWidth);
  else if (layer.kind === 'shape') drawShape(ctx, layer, frameWidth);
  else if (layer.kind === 'sticker') drawSticker(ctx, layer, frameWidth);
  else if (layer.kind === 'image') drawImageLayer(ctx, layer, frameWidth);
  else drawStrokes(ctx, layer, frameWidth);
}

/* ---------- masks and blending ---------- */

/**
 * Whether a layer's mask changes where it shows.
 * @param layer the layer
 * @returns true with parts, or inverted
 */
export const layerMasked = (layer: Layer): boolean => !!layer.mask && (layer.mask.parts.length > 0 || layer.mask.invert);

/**
 * A layer's mask laid on the frame where the layer is (its box, turned with it).
 * @param ctx the frame's context (to measure text)
 * @param layer the layer
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @returns the mask, or null when the layer isn't masked
 */
export function layerFrameMask(ctx: CanvasRenderingContext2D, layer: Layer, frameWidth: number, frameHeight: number): FrameMask | null {
  if (!layer.mask || !layerMasked(layer)) return null;
  const box = layerBox(ctx, layer, frameWidth, frameHeight);
  const place = { cx: box.cx, cy: box.cy, w: box.w, h: box.h, rot: (box.rot * 180) / Math.PI, flip: false };
  return frameMask(layer.mask, box.w, box.h, place, frameWidth, frameHeight);
}

/** The masks as images whose alpha is the mask, to cut a layer with ('destination-in'). Cached per mask raster. */
const maskImages = new WeakMap<FrameMask, HTMLCanvasElement>();

/**
 * A mask as an image: white, with the mask as alpha.
 * @param mask the mask on the frame
 * @returns the image (cached), or null when no canvas can be made
 */
function maskImage(mask: FrameMask): HTMLCanvasElement | null {
  const cached = maskImages.get(mask);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(mask.width, mask.height);
  const pixels = new Uint32Array(image.data.buffer);
  // Little-endian RGBA: alpha in the top byte.
  for (let index = 0; index < mask.data.length; index++) pixels[index] = ((mask.data[index] ?? 0) << 24) | 0xffffff;
  ctx.putImageData(image, 0, 0);
  maskImages.set(mask, canvas);
  return canvas;
}

/** A frame-size canvas to draw a masked layer into, reused. */
let scratch: HTMLCanvasElement | null = null;

/**
 * Draws a masked layer on the scratch canvas, cut by its mask.
 * @param layer the layer
 * @param cut the mask as an image
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @returns the scratch canvas, or null when it has no context
 */
function cutLayer(layer: Layer, cut: HTMLCanvasElement, frameWidth: number, frameHeight: number): HTMLCanvasElement | null {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== cut.width || scratch.height !== cut.height) {
    scratch.width = cut.width;
    scratch.height = cut.height;
  }
  const scratchCtx = scratch.getContext('2d');
  if (!scratchCtx) return null;
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.globalAlpha = 1;
  scratchCtx.globalCompositeOperation = 'source-over';
  scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
  scratchCtx.save();
  drawOne(scratchCtx, layer, frameWidth, frameHeight);
  scratchCtx.restore();
  scratchCtx.globalCompositeOperation = 'destination-in';
  scratchCtx.drawImage(cut, 0, 0);
  return scratch;
}

/**
 * Draws every visible layer (bottom first) on a frame; with a time, only the layers showing then, keyed layers at
 * their values then (205; the photo editor passes no time). A layer with a blend mode mixes with what is under it; a
 * masked one is drawn on its own canvas first, cut by its mask, then laid on with its opacity and blend.
 * @param ctx the frame's context
 * @param layers the layers, bottom first
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @param time seconds on the timeline (video only)
 */
export function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], frameWidth: number, frameHeight: number, time?: number): void {
  for (const layer of layersAt(layers, time)) {
    if (!activeAt(layer, time)) continue;
    const blend: GlobalCompositeOperation = layer.blend && layer.blend !== 'normal' ? layer.blend : 'source-over';
    const alpha = Math.max(0, Math.min(1, layer.opacity));
    const mask = layerFrameMask(ctx, layer, frameWidth, frameHeight);
    const cut = mask && maskImage(mask);
    if (!cut) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = blend;
      drawOne(ctx, layer, frameWidth, frameHeight);
      ctx.restore();
      continue;
    }
    const drawn = cutLayer(layer, cut, frameWidth, frameHeight);
    if (!drawn) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = blend;
    ctx.drawImage(drawn, 0, 0, frameWidth, frameHeight);
    ctx.restore();
  }
}
