import { DEFAULT_EDIT, renderIg, type IgEdit } from './instagram';
import { transformAt, type ClipKeyProp, type Keyframes } from './keyframes';
import { drawLayers } from './layerDraw';
import { type Layer } from './layers';
import type { Mix } from './stack';
import { clipLength, isIdentity, type ClipTiming, type ClipTransform } from './timeline';
import { transitionOps, type ColourOver, type DrawOp, type FrameRect } from './transitions';

/*
 * The video editor's frame drawing, free of UI code. One function draws a frame at any time, for the live preview and
 * for every exported frame alike: the clips under that time (a photo with optional pan and zoom, or a video frame),
 * each framed and coloured like an Instagram photo (engine/instagram.ts) in its box, transitions between them, the
 * layers showing then, and the fades. Formats and limits are videoFormats.ts; clip timing is timeline.ts.
 */

/** A photo clip's movement over its time on screen. */
export type Motion = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';

/** Every motion with its label, in the menu's order. */
export const MOTIONS: readonly (readonly [Motion, string])[] = [
  ['none', 'Still'],
  ['zoom-in', 'Zoom in'],
  ['zoom-out', 'Zoom out'],
  ['pan-left', 'Pan left'],
  ['pan-right', 'Pan right'],
  ['pan-up', 'Pan up'],
  ['pan-down', 'Pan down'],
];

/** Length of a fade in or out, in seconds. */
export const V_FADE = 0.5;

/** The least zoom of a pan, so the picture has room to move. */
const PAN_ZOOM = 1.2;

/**
 * Smoothstep: eases a progress in and out.
 * @param progress 0–1
 * @returns the eased progress, 0–1
 */
const ease = (progress: number) => progress * progress * (3 - 2 * progress);

/**
 * A photo's framing at a point of its clip, for the chosen motion.
 * @param edit the photo's own framing
 * @param motion the clip's motion
 * @param progress how far through the clip, 0–1 (clamped)
 * @returns the framing to draw
 */
export function motionEdit(edit: IgEdit, motion: Motion, progress: number): IgEdit {
  const eased = ease(Math.min(1, Math.max(0, progress)));
  const zoom = Math.max(edit.zoom, 1);
  const panZoom = Math.max(zoom, PAN_ZOOM);
  switch (motion) {
    case 'zoom-in':
      return { ...edit, zoom: zoom * (1 + 0.18 * eased) };
    case 'zoom-out':
      return { ...edit, zoom: zoom * (1.18 - 0.18 * eased) };
    case 'pan-left':
      return { ...edit, zoom: panZoom, px: 1 - 2 * eased };
    case 'pan-right':
      return { ...edit, zoom: panZoom, px: -1 + 2 * eased };
    case 'pan-up':
      return { ...edit, zoom: panZoom, py: 1 - 2 * eased };
    case 'pan-down':
      return { ...edit, zoom: panZoom, py: -1 + 2 * eased };
    default:
      return edit;
  }
}

/**
 * How dark the frame is from a fade in at the start of a clip and a fade out at the end of the video.
 * @param local seconds into the clip
 * @param fadeIn whether the clip fades in
 * @param time the project time, seconds
 * @param total the project's length, seconds
 * @param fadeOut whether the video fades out
 * @returns the darkness, 0–1
 */
export function fadeAmount(local: number, fadeIn: boolean, time: number, total: number, fadeOut: boolean): number {
  const fadeInDark = fadeIn ? Math.max(0, 1 - local / V_FADE) : 0;
  const fadeOutDark = fadeOut ? Math.max(0, 1 - (total - time) / V_FADE) : 0;
  return Math.min(1, Math.max(fadeInDark, fadeOutDark));
}

/** What the drawing needs to know about a clip: its timing, framing, motion and fade-in. */
export interface FrameClip extends ClipTiming {
  edit: IgEdit;
  motion: Motion;
  /** Fades in from black (an overlay: from see-through). */
  fade: boolean;
}

/** What renderFrame draws where no clip shows (the video track hidden): black, the layers, the video's fade-out. */
export const NO_PICTURE: FrameClip = { kind: 'photo', dur: 0, in: 0, out: 0, edit: DEFAULT_EDIT, motion: 'none', fade: false };

/** A clip of a frame's stack as drawn: its box, its keyframes, and whether it is on an overlay track. */
export interface StackClip extends FrameClip {
  tf?: ClipTransform;
  keys?: Keyframes<ClipKeyProp>;
  overlay: boolean;
}

/** One clip of a frame's stack (203): its picture at that moment (sw × sh), local = seconds into the clip. */
export interface StackDraw {
  clip: StackClip;
  src: CanvasImageSource | null;
  /** The picture's width, pixels. */
  sw: number;
  /** The picture's height, pixels. */
  sh: number;
  local: number;
  /** Part of a transition (206): drawn with its partner, the outgoing clip first. */
  mix?: Mix;
}

/** A stack item that is part of a transition. */
interface MixedDraw extends StackDraw {
  mix: Mix;
}

/**
 * Whether a stack item is the given side of a transition.
 * @param item the stack item, if any
 * @param role the side
 * @returns true when it is part of a transition, on that side
 */
const isMixed = (item: StackDraw | undefined, role: Mix['role']): item is MixedDraw => item?.mix?.role === role;

/**
 * A stack item's box at its frame.
 * @param item the stack item
 * @returns its keyframed values at its local time (205), else its stored box itself
 */
export const itemTransform = (item: StackDraw): ClipTransform => transformAt(item.clip, item.local);

/**
 * Each target canvas's own frame-size canvases (made on first use, gone with the target), so the preview and the
 * export, of different sizes and interleaved, don't remake them every frame: slot 0 for see-through clips, 1 and 2
 * for a transition's clip and pair (206).
 */
const scratches = new WeakMap<HTMLCanvasElement | OffscreenCanvas, HTMLCanvasElement[]>();

/**
 * A cleared frame-size scratch canvas of a target canvas.
 * @param ctx the target canvas's context
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @param slot which of the target's scratch canvases
 * @returns its context, or null when none can be made
 */
function scratchFor(ctx: CanvasRenderingContext2D, frameWidth: number, frameHeight: number, slot = 0): CanvasRenderingContext2D | null {
  const slots = scratches.get(ctx.canvas) ?? [];
  scratches.set(ctx.canvas, slots);
  const canvas = slots.at(slot) ?? document.createElement('canvas');
  slots[slot] = canvas;
  if (canvas.width !== frameWidth || canvas.height !== frameHeight) [canvas.width, canvas.height] = [frameWidth, frameHeight];
  const scratch = canvas.getContext('2d');
  if (!scratch) return null;
  scratch.setTransform(1, 0, 0, 1, 0, 0);
  scratch.clearRect(0, 0, frameWidth, frameHeight);
  return scratch;
}

/**
 * Sets a context up to draw a whole frame into a clip's box: moved, turned, its corners rounded, scaled by its width.
 * @param ctx the context to set up
 * @param transform the clip's box
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 */
function intoBox(ctx: CanvasRenderingContext2D, transform: ClipTransform, frameWidth: number, frameHeight: number): void {
  const boxWidth = transform.w * frameWidth;
  const boxHeight = transform.w * frameHeight;
  ctx.translate(transform.x * frameWidth, transform.y * frameHeight);
  ctx.rotate((transform.rot * Math.PI) / 180);
  roundedBox(ctx, { x: -boxWidth / 2, y: -boxHeight / 2, w: boxWidth, h: boxHeight }, transform.radius * Math.min(boxWidth, boxHeight));
  ctx.clip();
  ctx.scale(transform.w, transform.w);
  ctx.translate(-frameWidth / 2, -frameHeight / 2);
}

/**
 * Makes a rounded rectangle the current path (arcTo where roundRect is missing).
 * @param ctx the context
 * @param rect the rectangle
 * @param radius the corner radius, pixels (0: square corners)
 */
function roundedBox(ctx: CanvasRenderingContext2D, rect: FrameRect, radius: number): void {
  const { x, y, w: width, h: height } = rect;
  ctx.beginPath();
  if (radius <= 0) ctx.rect(x, y, width, height);
  // Older canvases lack roundRect.
  else if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
  else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
}

/**
 * Draws the frame at a time from its stack of clips (203 plan §4), bottom first: black, each clip's picture (the main
 * track's, then the overlays'), the layers, then the darkness of the main clip's fade-in and the video's fade-out.
 * A clip without a transform (or at the identity) draws exactly as before 203, over the whole frame. Otherwise its
 * picture, framed for the whole frame, is drawn into its box: moved, turned, scaled by w (the box has the frame's
 * aspect, D1), its corners rounded, at its opacity. An overlay's fade-in ramps its own opacity from 0 over V_FADE
 * (D2); the main clip's darkens the whole frame, layers included, as before.
 * @param ctx the frame's context
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @param items the stack, bottom first; a transition's two clips next to each other, the outgoing one first
 * @param layers the project's layers
 * @param time the project time, seconds
 * @param total the project's length, seconds
 * @param fadeOut whether the video fades out
 */
export function renderStack(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  items: StackDraw[],
  layers: Layer[],
  time: number,
  total: number,
  fadeOut: boolean,
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, frameWidth, frameHeight);
  let mainLocal = 0;
  let mainFade = false;
  for (let index = 0; index < items.length; index++) {
    const item = items.at(index);
    if (!item) break;
    // The main track's fade-in darkness follows the clip on screen; during a transition, the outgoing one.
    if (!item.clip.overlay && item.mix?.role !== 'to') [mainLocal, mainFade] = [item.local, item.clip.fade];
    const partner = items.at(index + 1);
    if (isMixed(item, 'from') && isMixed(partner, 'to')) {
      drawPair(ctx, item, partner, frameWidth, frameHeight);
      index++;
    } else drawClip(ctx, item, frameWidth, frameHeight);
  }
  const dark = fadeAmount(mainLocal, mainFade, time, total, fadeOut);
  // Layers fade with the picture, so a title can fade in with the first photo.
  drawLayers(ctx, layers, frameWidth, frameHeight, time);
  if (dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${String(dark)})`;
    ctx.fillRect(0, 0, frameWidth, frameHeight);
  }
}

/**
 * A clip's opacity at its frame: its box's opacity, and an overlay's fade-in (D2).
 * @param item the stack item
 * @param transform its box at this frame
 * @returns 0–1
 */
function clipAlpha(item: StackDraw, transform: ClipTransform): number {
  const fadeIn = item.clip.overlay && item.clip.fade ? Math.min(1, Math.max(0, item.local / V_FADE)) : 1;
  return transform.opacity * fadeIn;
}

/**
 * Draws one clip of a frame's stack as 203 and 205 do: its picture, framed for the whole frame, in its box.
 * @param ctx the frame's context
 * @param item the stack item
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 */
function drawClip(ctx: CanvasRenderingContext2D, item: StackDraw, frameWidth: number, frameHeight: number): void {
  const { clip, src, sw: pictureWidth, sh: pictureHeight, local } = item;
  if (!src || pictureWidth <= 0 || pictureHeight <= 0) return;
  const edit = clip.kind === 'photo' ? motionEdit(clip.edit, clip.motion, local / clipLength(clip)) : clip.edit;
  const transform = itemTransform(item);
  const alpha = clipAlpha(item, transform);
  if (alpha <= 0) return;
  if (alpha >= 1 && isIdentity(transform)) {
    renderIg(ctx, src, pictureWidth, pictureHeight, edit, frameWidth, frameHeight);
    return;
  }
  // See-through: the finished picture (its background, colour and vignette) is drawn into its box on a canvas of
  // its own first and laid down once, so its own passes don't show through one another. The same geometry either way.
  const scratch = alpha < 1 ? scratchFor(ctx, frameWidth, frameHeight) : null;
  const target = scratch ?? ctx;
  target.save();
  // Restored even when drawing throws (a closed video frame), so the box's transform and clip don't stay behind.
  try {
    // No scratch canvas (alpha 1, or none could be made): drawn in place, at its alpha.
    if (!scratch) target.globalAlpha = alpha;
    intoBox(target, transform, frameWidth, frameHeight);
    renderIg(target, src, pictureWidth, pictureHeight, edit, frameWidth, frameHeight);
  } finally {
    target.restore();
  }
  if (scratch) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(scratch.canvas, 0, 0);
    ctx.restore();
  }
}

/**
 * Lays a transition's clip, drawn alone on its layer canvas, onto the pair canvas with its ops.
 * @param pair the pair canvas's context
 * @param layer the clip's layer canvas
 * @param op the clip's ops (transitionOps)
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 */
function layOnPair(
  pair: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  op: DrawOp,
  frameWidth: number,
  frameHeight: number,
): void {
  pair.save();
  try {
    pair.globalAlpha = op.alpha;
    pair.globalCompositeOperation = op.composite;
    if (op.clip) {
      pair.beginPath();
      pair.rect(op.clip.x, op.clip.y, op.clip.w, op.clip.h);
      pair.clip();
    }
    pair.translate(frameWidth / 2 + op.dx, frameHeight / 2 + op.dy);
    pair.scale(op.scale, op.scale);
    pair.translate(-frameWidth / 2, -frameHeight / 2);
    pair.drawImage(layer, 0, 0);
  } finally {
    pair.restore();
  }
}

/**
 * Draws a transition (206 plan §3): each clip exactly as drawClip draws it alone (its box, keyframes, look and own
 * alpha) on a layer canvas, laid onto a pair canvas with its ops (transitionOps: alpha, compositing, the part of the
 * frame, move and scale), a dip's colour over the clips' own pixels only (`source-atop`, so on an overlay track only
 * the clips dip, Q5), and the pair laid down once. Without scratch canvases it falls back to drawing the clips in turn.
 * @param ctx the frame's context
 * @param from the outgoing clip
 * @param to the incoming clip
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 */
function drawPair(ctx: CanvasRenderingContext2D, from: MixedDraw, to: MixedDraw, frameWidth: number, frameHeight: number): void {
  const pair = scratchFor(ctx, frameWidth, frameHeight, 2);
  if (!pair) {
    drawClip(ctx, from.mix.progress < 0.5 ? from : to, frameWidth, frameHeight);
    return;
  }
  let colour: ColourOver | undefined;
  for (const item of [from, to]) {
    const ops = transitionOps(item.mix, frameWidth, frameHeight);
    colour = ops.colour ?? colour;
    const { op } = ops;
    if (op.alpha <= 0 || (op.clip && (op.clip.w <= 0 || op.clip.h <= 0))) continue;
    const layer = scratchFor(ctx, frameWidth, frameHeight, 1);
    if (!layer) continue;
    drawClip(layer, item, frameWidth, frameHeight);
    layOnPair(pair, layer.canvas, op, frameWidth, frameHeight);
  }
  if (colour && colour.alpha > 0) {
    pair.save();
    pair.globalCompositeOperation = 'source-atop';
    pair.globalAlpha = colour.alpha;
    pair.fillStyle = colour.css;
    pair.fillRect(0, 0, frameWidth, frameHeight);
    pair.restore();
  }
  ctx.drawImage(pair.canvas, 0, 0);
}

/**
 * Draws the frame at a time with one clip: renderStack with one item at the identity.
 * @param ctx the frame's context
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @param clip the clip
 * @param src the clip's picture at that moment (the photo, or the video frame)
 * @param pictureWidth the picture's width, pixels
 * @param pictureHeight the picture's height, pixels
 * @param local seconds into the clip
 * @param layers the project's layers
 * @param time the project time, seconds
 * @param total the project's length, seconds
 * @param fadeOut whether the video fades out
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  clip: FrameClip,
  src: CanvasImageSource | null,
  pictureWidth: number,
  pictureHeight: number,
  local: number,
  layers: Layer[],
  time: number,
  total: number,
  fadeOut: boolean,
): void {
  const item: StackDraw = { clip: { ...clip, overlay: false }, src, sw: pictureWidth, sh: pictureHeight, local };
  renderStack(ctx, frameWidth, frameHeight, [item], layers, time, total, fadeOut);
}
