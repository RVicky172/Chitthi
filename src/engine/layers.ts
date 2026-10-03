import { brushDef, shapeDef, type BrushId, type ShapeId, type TextStyle } from '../data/layers';
import { frameMask, type FrameMask, type MaskPart } from './masks';

/*
 * Layers over a photo or video frame: text, shapes (which can hold words), emoji stickers and freehand drawing.
 * Units: a layer's centre (x, y) is a share of the frame's width and height; sizes (w, h, text size, stroke widths)
 * are a share of the frame WIDTH, so a layer keeps its proportions in every format and draws the same at any scale
 * (preview, exported photo, each video frame). Video layers can also carry start / end times in seconds.
 *
 * Every layer can blend with what is under it (multiply, screen, overlay…; Canvas 2D composite operations) and carry a
 * mask (P1.10): gradient parts from engine/masks.ts, placed in the layer's own box, so the mask moves, turns and grows
 * with the layer. Image layers (logos, overlays) refer to their picture by id; the pictures stay in memory here.
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

interface LayerBase {
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
}

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

export interface StickerLayer extends LayerBase {
  kind: 'sticker';
  emoji: string;
}

export interface Stroke {
  brush: BrushId;
  color: string;
  /** Line width, as a share of the layer's width (so it grows when the drawing is resized). */
  width: number;
  /** Points as [x0, y0, x1, y1, …], each a share of the layer's width / height from its centre (-0.5–0.5). */
  pts: number[];
}

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

export type Layer = TextLayer | ShapeLayer | StickerLayer | DrawLayer | ImageLayer;

/** A layer's box on the frame, in pixels: centre, size and rotation (radians). */
export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

let seq = 0;
export const layerId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const layerName = (l: Layer): string =>
  l.kind === 'text'
    ? `Text: ${l.text.split('\n')[0].slice(0, 24) || '(empty)'}`
    : l.kind === 'shape'
      ? `${shapeDef(l.shape).name}${l.text ? `: ${l.text.split('\n')[0].slice(0, 18)}` : ''}`
      : l.kind === 'sticker'
        ? `Sticker ${l.emoji}`
        : l.kind === 'image'
          ? `Image: ${l.name.slice(0, 24) || 'picture'}`
          : `Drawing (${l.strokes.length} stroke${l.strokes.length === 1 ? '' : 's'})`;

/** Whether a layer shows at time t (seconds); photos pass no time. */
export const activeAt = (l: Layer, t?: number): boolean =>
  !l.hidden && (t === undefined || ((l.start ?? 0) <= t && t < (l.end ?? Infinity)));

/* ---------- images ---------- */

/** Pictures of image layers, by id, for this session (layers keep only the id, so undo and copies stay small). */
const images = new Map<string, CanvasImageSource & { width: number; height: number }>();
let imageSeq = 0;

/** Keeps a picture for image layers; returns its id. */
export function addLayerImage(img: CanvasImageSource & { width: number; height: number }): string {
  const id = `img${Date.now().toString(36)}${(imageSeq++).toString(36)}`;
  images.set(id, img);
  return id;
}
export const layerImage = (id: string) => images.get(id);

/** An image layer for a kept picture of w × h pixels, a third of the frame wide, centred. */
export function newImageLayer(image: string, w: number, h: number, name: string): ImageLayer {
  const lw = 0.34;
  return { id: layerId(), kind: 'image', image, name, x: 0.5, y: 0.5, w: lw, h: (lw * h) / Math.max(1, w), rot: 0, opacity: 1 };
}

/* ---------- new layers ---------- */

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

export function newShape(shape: ShapeId): ShapeLayer {
  const d = shapeDef(shape);
  const line = shape === 'line' || shape === 'arrow';
  return {
    id: layerId(),
    kind: 'shape',
    shape,
    x: 0.5,
    y: 0.5,
    w: d.w,
    h: d.h,
    rot: 0,
    opacity: 1,
    fill: line ? '#ffffff' : shape === 'heart' ? '#e63946' : shape === 'star' || shape === 'burst' ? '#f4c430' : '#ffffff',
    stroke: '',
    strokeW: 0.006,
    text: d.holdsText ? (shape === 'bubble' ? 'Hello!' : shape === 'burst' ? 'NEW' : 'Your words') : '',
    textColor: '#111111',
    font: 'Poppins',
    textSize: shape === 'pill' || shape === 'banner' ? 0.045 : 0.055,
    bold: true,
  };
}

export const newSticker = (emoji: string): StickerLayer => ({ id: layerId(), kind: 'sticker', emoji, x: 0.5, y: 0.5, w: 0.18, rot: 0, opacity: 1 });

/* ---------- measuring ---------- */

const fontOf = (px: number, family: string, bold: boolean, italic: boolean) => `${italic ? 'italic ' : ''}${bold ? 700 : 400} ${Math.max(1, px)}px "${family}", sans-serif`;

/** Breaks text into lines that fit maxW (explicit line breaks kept; a single long word is broken by letters). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (!line || ctx.measureText(next).width <= maxW) {
        line = next;
        continue;
      }
      out.push(line.trimEnd());
      line = word.trimStart();
      // A word longer than the box: break it.
      while (line && ctx.measureText(line).width > maxW && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

function textMetrics(ctx: CanvasRenderingContext2D, l: TextLayer, W: number) {
  const px = l.size * W,
    pad = l.bg ? px * 0.35 : px * 0.1,
    boxW = l.w * W;
  ctx.font = fontOf(px, l.font, l.bold, l.italic);
  const lines = wrapText(ctx, l.text || ' ', Math.max(px, boxW - pad * 2));
  const lh = px * 1.2;
  return { px, pad, lines, lh, boxW, boxH: lines.length * lh + pad * 2 };
}

/** The layer's box in pixels on a W×H frame. Text needs ctx to measure its lines. */
export function layerBox(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number): Box {
  const cx = l.x * W,
    cy = l.y * H,
    rot = (l.rot * Math.PI) / 180;
  if (l.kind === 'text') {
    ctx.save();
    const m = textMetrics(ctx, l, W);
    ctx.restore();
    return { cx, cy, w: m.boxW, h: m.boxH, rot };
  }
  if (l.kind === 'sticker') return { cx, cy, w: l.w * W, h: l.w * W, rot };
  return { cx, cy, w: l.w * W, h: l.h * W, rot };
}

/* ---------- drawing ---------- */

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, w: number, h: number, points: number, inner: number) {
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2,
      k = i % 2 ? inner : 1;
    const x = Math.cos(a) * (w / 2) * k,
      y = Math.sin(a) * (h / 2) * k;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** The outline of a shape in its own box, centred on 0,0. Exported for tests. */
export function shapePath(ctx: CanvasRenderingContext2D, shape: ShapeId, w: number, h: number): void {
  const x = -w / 2,
    y = -h / 2;
  ctx.beginPath();
  switch (shape) {
    case 'rect':
      ctx.rect(x, y, w, h);
      break;
    case 'round':
      roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.18);
      break;
    case 'pill':
    case 'line':
      roundRectPath(ctx, x, y, w, h, h / 2);
      break;
    case 'circle':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'bubble': {
      // Rounded body over the top 78%, a tail at the bottom left.
      const bh = h * 0.78,
        r = Math.min(w, bh) * 0.22;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + bh, r);
      ctx.arcTo(x + w, y + bh, x, y + bh, r);
      ctx.lineTo(x + w * 0.36, y + bh);
      ctx.lineTo(x + w * 0.18, y + h);
      ctx.lineTo(x + w * 0.22, y + bh);
      ctx.arcTo(x, y + bh, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      break;
    }
    case 'burst':
      starPath(ctx, w, h, 14, 0.8);
      break;
    case 'star':
      starPath(ctx, w, h, 5, 0.45);
      break;
    case 'heart':
      ctx.moveTo(0, y + h * 0.3);
      ctx.bezierCurveTo(0, y, x, y, x, y + h * 0.32);
      ctx.bezierCurveTo(x, y + h * 0.62, -w * 0.12, y + h * 0.8, 0, y + h);
      ctx.bezierCurveTo(w * 0.12, y + h * 0.8, -x, y + h * 0.62, -x, y + h * 0.32);
      ctx.bezierCurveTo(-x, y, 0, y, 0, y + h * 0.3);
      ctx.closePath();
      break;
    case 'banner': {
      const n = Math.min(h * 0.4, w * 0.15);
      ctx.moveTo(x, y);
      ctx.lineTo(-x, y);
      ctx.lineTo(-x - n, 0);
      ctx.lineTo(-x, -y);
      ctx.lineTo(x, -y);
      ctx.lineTo(x + n, 0);
      ctx.closePath();
      break;
    }
    case 'arrow': {
      const head = Math.min(h, w * 0.5),
        s = h * 0.2;
      ctx.moveTo(x, -s);
      ctx.lineTo(-x - head, -s);
      ctx.lineTo(-x - head, y);
      ctx.lineTo(-x, 0);
      ctx.lineTo(-x - head, -y);
      ctx.lineTo(-x - head, s);
      ctx.lineTo(x, s);
      ctx.closePath();
      break;
    }
  }
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], lh: number, top: number, xs: number, fill: string, outline: string, px: number) {
  lines.forEach((line, i) => {
    const y = top + lh * (i + 0.5);
    if (outline) {
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.lineJoin = 'round';
      ctx.lineWidth = px * 0.14;
      ctx.strokeStyle = outline;
      ctx.strokeText(line, xs, y);
      ctx.restore();
    }
    ctx.fillStyle = fill;
    ctx.fillText(line, xs, y);
  });
}

function drawText(ctx: CanvasRenderingContext2D, l: TextLayer, W: number) {
  const m = textMetrics(ctx, l, W);
  if (l.bg) {
    ctx.fillStyle = l.bg;
    ctx.beginPath();
    roundRectPath(ctx, -m.boxW / 2, -m.boxH / 2, m.boxW, m.boxH, m.px * 0.3);
    ctx.fill();
  }
  if (l.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = m.px * 0.18;
    ctx.shadowOffsetY = m.px * 0.04;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = l.align;
  const xs = l.align === 'left' ? -m.boxW / 2 + m.pad : l.align === 'right' ? m.boxW / 2 - m.pad : 0;
  drawLines(ctx, m.lines, m.lh, -m.boxH / 2 + m.pad, xs, l.color, l.outline, m.px);
}

function drawShape(ctx: CanvasRenderingContext2D, l: ShapeLayer, W: number) {
  const w = l.w * W,
    h = l.h * W;
  shapePath(ctx, l.shape, w, h);
  if (l.fill) {
    ctx.fillStyle = l.fill;
    ctx.fill();
  }
  if (l.stroke && l.strokeW > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = l.strokeW * W;
    ctx.strokeStyle = l.stroke;
    ctx.stroke();
  }
  if (l.text && shapeDef(l.shape).holdsText) {
    const px = l.textSize * W;
    ctx.font = fontOf(px, l.font, l.bold, false);
    const inner = l.shape === 'circle' || l.shape === 'burst' ? 0.66 : l.shape === 'banner' ? 0.7 : 0.84;
    const lines = wrapText(ctx, l.text, Math.max(px, w * inner));
    const lh = px * 1.2,
      // The bubble's words sit in its body, above the tail.
      mid = l.shape === 'bubble' ? -h * 0.11 : 0;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    drawLines(ctx, lines, lh, mid - (lines.length * lh) / 2, 0, l.textColor, '', px);
  }
}

function drawSticker(ctx: CanvasRenderingContext2D, l: StickerLayer, W: number) {
  const px = l.w * W * 0.86;
  ctx.font = `${px}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(l.emoji, 0, px * 0.06);
}

function drawStrokes(ctx: CanvasRenderingContext2D, l: DrawLayer, W: number) {
  const bw = l.w * W,
    bh = l.h * W;
  for (const s of l.strokes) {
    const b = brushDef(s.brush),
      p = s.pts;
    if (p.length < 2) continue;
    ctx.save();
    ctx.globalAlpha *= b.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = Math.max(0.5, s.width * bw);
    if (b.glow) {
      ctx.shadowColor = s.color;
      ctx.shadowBlur = ctx.lineWidth * 2.5;
    }
    ctx.beginPath();
    const X = (i: number) => p[i] * bw,
      Y = (i: number) => p[i + 1] * bh;
    if (p.length === 2) {
      // A single tap: a dot.
      ctx.arc(X(0), Y(0), ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(X(0), Y(0));
      // Smooth: curve through the midpoints between recorded points.
      for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 2)) / 2, (Y(i) + Y(i + 2)) / 2);
      ctx.lineTo(X(p.length - 2), Y(p.length - 2));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawImageLayer(ctx: CanvasRenderingContext2D, l: ImageLayer, W: number) {
  const img = images.get(l.image);
  if (!img) return;
  const w = l.w * W,
    h = l.h * W;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

/** One layer, drawn at its place (ctx already holds the opacity and blend to use). */
function drawOne(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number) {
  ctx.translate(l.x * W, l.y * H);
  ctx.rotate((l.rot * Math.PI) / 180);
  if (l.kind === 'text') drawText(ctx, l, W);
  else if (l.kind === 'shape') drawShape(ctx, l, W);
  else if (l.kind === 'sticker') drawSticker(ctx, l, W);
  else if (l.kind === 'image') drawImageLayer(ctx, l, W);
  else drawStrokes(ctx, l, W);
}

/** True when the layer's mask changes where it shows. */
export const layerMasked = (l: Layer): boolean => !!l.mask && (l.mask.parts.length > 0 || l.mask.invert);

/** A layer's mask laid on the W × H frame where the layer is (its box, turned with it). */
export function layerFrameMask(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number): FrameMask | null {
  if (!l.mask || !layerMasked(l)) return null;
  const b = layerBox(ctx, l, W, H);
  return frameMask(l.mask, b.w, b.h, { cx: b.cx, cy: b.cy, w: b.w, h: b.h, rot: (b.rot * 180) / Math.PI, flip: false }, W, H);
}

/** The mask as an image whose alpha is the mask, to cut a layer with ('destination-in'). Cached per mask raster. */
const maskImages = new WeakMap<FrameMask, HTMLCanvasElement>();
function maskImage(f: FrameMask): HTMLCanvasElement | null {
  let c = maskImages.get(f);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = f.width;
  c.height = f.height;
  const x = c.getContext('2d');
  if (!x) return null;
  const img = x.createImageData(f.width, f.height),
    d = new Uint32Array(img.data.buffer);
  // White, with the mask as alpha (little-endian RGBA: alpha in the top byte).
  for (let i = 0; i < f.data.length; i++) d[i] = (f.data[i] << 24) | 0xffffff;
  x.putImageData(img, 0, 0);
  maskImages.set(f, c);
  return c;
}

/** A frame-size canvas to draw a masked layer into, reused. */
let scratch: HTMLCanvasElement | null = null;

/**
 * Draws every visible layer (bottom first) on a W×H frame; with t, only the layers showing at that time. A layer with
 * a blend mode mixes with what is under it; a masked one is drawn on its own canvas first, cut by its mask, then laid
 * on with its opacity and blend.
 */
export function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], W: number, H: number, t?: number): void {
  for (const l of layers) {
    if (!activeAt(l, t)) continue;
    const blend: GlobalCompositeOperation = l.blend && l.blend !== 'normal' ? l.blend : 'source-over',
      alpha = Math.max(0, Math.min(1, l.opacity));
    const fm = layerFrameMask(ctx, l, W, H),
      cut = fm && maskImage(fm);
    if (!cut) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = blend;
      drawOne(ctx, l, W, H);
      ctx.restore();
      continue;
    }
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width !== cut.width || scratch.height !== cut.height) {
      scratch.width = cut.width;
      scratch.height = cut.height;
    }
    const sx = scratch.getContext('2d');
    if (!sx) continue;
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalAlpha = 1;
    sx.globalCompositeOperation = 'source-over';
    sx.clearRect(0, 0, scratch.width, scratch.height);
    sx.save();
    drawOne(sx, l, W, H);
    sx.restore();
    sx.globalCompositeOperation = 'destination-in';
    sx.drawImage(cut, 0, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = blend;
    ctx.drawImage(scratch, 0, 0, W, H);
    ctx.restore();
  }
}

/* ---------- picking and handles ---------- */

/** A point in the layer's own (unrotated, centred) coordinates. */
export function toLocal(b: Box, px: number, py: number): [number, number] {
  const dx = px - b.cx,
    dy = py - b.cy,
    c = Math.cos(b.rot),
    s = Math.sin(b.rot);
  return [dx * c + dy * s, -dx * s + dy * c];
}

/** The topmost layer under a point (pixels on the W×H frame), or null. tol: extra pixels around each box. */
export function hitLayer(ctx: CanvasRenderingContext2D, layers: Layer[], px: number, py: number, W: number, H: number, tol = 4, t?: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (!activeAt(l, t)) continue;
    const b = layerBox(ctx, l, W, H),
      [lx, ly] = toLocal(b, px, py);
    if (Math.abs(lx) <= b.w / 2 + tol && Math.abs(ly) <= b.h / 2 + tol) return l;
  }
  return null;
}

/** Distance of the rotate handle above the box, in pixels at scale 1. */
export const ROTATE_GAP = 26;

/** Which handle of a selected box is under the point: resize (bottom-right corner), rotate (above the top), or null. */
export function handleAt(b: Box, px: number, py: number, r: number): 'resize' | 'rotate' | null {
  const [lx, ly] = toLocal(b, px, py);
  if (Math.hypot(lx - b.w / 2, ly - b.h / 2) <= r * 1.6) return 'resize';
  if (Math.hypot(lx, ly + b.h / 2 + ROTATE_GAP * (r / 7)) <= r * 1.6) return 'rotate';
  return null;
}

/** Selection outline with its two handles (preview only, never exported). r = handle radius in pixels. */
export function drawSelection(ctx: CanvasRenderingContext2D, b: Box, r: number): void {
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate(b.rot);
  ctx.lineWidth = Math.max(1, r / 4);
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([r, r * 0.7]);
  ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.strokeStyle = '#d97706';
  ctx.lineDashOffset = r;
  ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.setLineDash([]);
  const gap = ROTATE_GAP * (r / 7);
  ctx.beginPath();
  ctx.moveTo(0, -b.h / 2);
  ctx.lineTo(0, -b.h / 2 - gap);
  ctx.stroke();
  for (const [x, y] of [
    [b.w / 2, b.h / 2],
    [0, -b.h / 2 - gap],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(1, r / 3);
    ctx.strokeStyle = '#d97706';
    ctx.stroke();
  }
  ctx.restore();
}

/** A layer scaled about its centre by f (width, height, text sizes, sticker size). */
export function scaleLayer<L extends Layer>(l: L, f: number): L {
  const k = Math.max(0.03 / l.w, Math.min(3 / l.w, f));
  const out = { ...l, w: l.w * k } as L;
  if (out.kind === 'text') out.size = (l as TextLayer).size * k;
  if (out.kind === 'shape') {
    out.h = (l as ShapeLayer).h * k;
    out.textSize = (l as ShapeLayer).textSize * k;
    out.strokeW = (l as ShapeLayer).strokeW * k;
  }
  if (out.kind === 'draw' || out.kind === 'image') out.h = (l as DrawLayer | ImageLayer).h * k;
  return out;
}

/** Rotation in degrees for a pointer at (px, py) around the box centre, snapped to right angles within 4°. */
export function rotationFor(b: Box, px: number, py: number): number {
  let deg = (Math.atan2(py - b.cy, px - b.cx) * 180) / Math.PI + 90;
  deg = ((deg % 360) + 360) % 360;
  for (const snap of [0, 90, 180, 270, 360]) if (Math.abs(deg - snap) < 4) deg = snap % 360;
  return Math.round(deg * 10) / 10;
}

/* ---------- drawing strokes into a layer ---------- */

/**
 * Adds a stroke drawn at frame pixels [x0, y0, x1, y1, …] to a drawing layer (or makes a new one), re-fitting the
 * layer's box around all its strokes. A rotated drawing can't take more strokes (null is returned: start a new one).
 */
export function addStroke(layer: DrawLayer | null, abs: number[], brush: BrushId, color: string, W: number, H: number, widthPx?: number): DrawLayer | null {
  if (layer && layer.rot !== 0) return null;
  const bw = widthPx ?? brushDef(brush).width * W;
  // Every point in frame-width units, with each stroke's width in the same units.
  const strokes: { brush: BrushId; color: string; width: number; pts: number[] }[] = [];
  if (layer) {
    const lw = layer.w,
      lh = layer.h,
      cx = layer.x,
      cyW = (layer.y * H) / W;
    for (const s of layer.strokes)
      strokes.push({ brush: s.brush, color: s.color, width: s.width * lw, pts: s.pts.map((v, i) => (i % 2 ? cyW + v * lh : cx + v * lw)) });
  }
  strokes.push({ brush, color, width: bw / W, pts: abs.map((v) => v / W) });
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const s of strokes)
    for (let i = 0; i < s.pts.length; i += 2) {
      x0 = Math.min(x0, s.pts[i] - s.width / 2);
      x1 = Math.max(x1, s.pts[i] + s.width / 2);
      y0 = Math.min(y0, s.pts[i + 1] - s.width / 2);
      y1 = Math.max(y1, s.pts[i + 1] + s.width / 2);
    }
  const w = Math.max(0.005, x1 - x0),
    h = Math.max(0.005, y1 - y0),
    cx = (x0 + x1) / 2,
    cyW = (y0 + y1) / 2;
  return {
    id: layer?.id ?? layerId(),
    kind: 'draw',
    x: cx,
    y: (cyW * W) / H,
    w,
    h,
    rot: 0,
    opacity: layer?.opacity ?? 1,
    start: layer?.start,
    end: layer?.end,
    strokes: strokes.map((s) => ({ brush: s.brush, color: s.color, width: s.width / w, pts: s.pts.map((v, i) => (i % 2 ? (v - cyW) / h : (v - cx) / w)) })),
  };
}
