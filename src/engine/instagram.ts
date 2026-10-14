import { DEFAULT_ADJUST, mergeAdjust, pixelsNeutral, type Adjustments } from './adjust';
import { chainNeutral, chainPixels } from './chain';
import { DETAIL_WIDTH, detailPixels } from './detail';
import { gpuColour } from './gpu/apply';
import { gpu } from './gpu/device';
import { isObjectLike, isOneOf } from './guards';
import { mergeMasks } from './maskGate';
import { frameMask, type FrameMask, type PhotoPlace } from './maskPlace';
import { maskActive, type Mask } from './masks';
import { lookPixels } from './photo';

/*
 * The Instagram studio's picture engine, free of UI code: where a photo sits in the frame, applying its colour settings
 * (engine/adjust.ts), and drawing one finished post at any scale. The preview and the exported files go through the
 * same renderIg(), so what the user sees is what they post.
 */

/** A photo's quarter turns. */
export type IgRotation = 0 | 90 | 180 | 270;

/** How a photo sits in its frame and how it looks. */
export interface IgEdit {
  /** fill: cover the frame (edges cropped); fit: the whole photo, with a background around it. */
  fit: 'fill' | 'fit';
  /** Background for "fit": a #rrggbb colour, or 'blur' for a blurred copy of the photo. */
  bg: string;
  /** 1 = the photo just fills (or fits) the frame; up to 4. */
  zoom: number;
  /** Position from -1 to 1: how far the photo is moved within the room it has (0 = centred). */
  px: number;
  py: number;
  rot: IgRotation;
  flip: boolean;
  /** Colour: look, sliders and vignette. */
  adjust: Adjustments;
  /** Local adjustments (engine/masks.ts), applied in order after the photo's own colour settings. */
  masks: Mask[];
}

/** A photo filling its frame, unchanged. */
export const DEFAULT_EDIT: IgEdit = {
  fit: 'fill',
  bg: '#ffffff',
  zoom: 1,
  px: 0,
  py: 0,
  rot: 0,
  flip: false,
  adjust: { ...DEFAULT_ADJUST },
  masks: [],
};

/** The edits that "Apply to all" copies: the look of a photo, not where it is placed (nor its masks, drawn on it). */
export const LOOK_KEYS = ['fit', 'bg', 'adjust'] as const;

/**
 * A value within a range.
 * @param value any number
 * @param low the least
 * @param high the most
 * @returns the value, clamped
 */
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

const ROTATIONS: readonly IgRotation[] = [0, 90, 180, 270];

/** A colour as the gates and the background accept it. */
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A number within a range, or a fallback.
 * @param value anything
 * @param low the least
 * @param high the most
 * @param fallback the value when `value` isn't a finite number
 * @returns the number
 */
const num = (value: unknown, low: number, high: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, low, high) : fallback;

/**
 * The single gate for photo and clip edits from outside the running app (presets, project files, agent tools). Reads
 * 2.x edits, whose colour settings sat directly in the edit (see mergeAdjust).
 * @param raw anything
 * @returns a complete, valid edit
 */
export function mergeEdit(raw: unknown): IgEdit {
  const fields = isObjectLike(raw) ? raw : {};
  const background = fields.bg;
  return {
    fit: fields.fit === 'fit' ? 'fit' : 'fill',
    bg: typeof background === 'string' && (background === 'blur' || HEX.test(background)) ? background : DEFAULT_EDIT.bg,
    zoom: num(fields.zoom, 1, 4, 1),
    px: num(fields.px, -1, 1, 0),
    py: num(fields.py, -1, 1, 0),
    rot: isOneOf(ROTATIONS, fields.rot) ? fields.rot : 0,
    flip: fields.flip === true,
    adjust: mergeAdjust(fields.adjust ?? fields),
    masks: mergeMasks(fields.masks),
  };
}

/** Where the photo is drawn: its centre and its drawn size (once rotated), pixels. */
export interface Placement {
  cx: number;
  cy: number;
  dw: number;
  dh: number;
}

/**
 * Where the photo is drawn in a frame.
 * @param photoWidth the photo's own width, pixels
 * @param photoHeight its own height, pixels
 * @param edit its fit, zoom, position and turn
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @returns its centre and its size once rotated
 */
export function placement(photoWidth: number, photoHeight: number, edit: Pick<IgEdit, 'fit' | 'zoom' | 'px' | 'py' | 'rot'>, frameWidth: number, frameHeight: number): Placement {
  const turned = edit.rot % 180 !== 0;
  const turnedWidth = turned ? photoHeight : photoWidth;
  const turnedHeight = turned ? photoWidth : photoHeight;
  const base = edit.fit === 'fill' ? Math.max(frameWidth / turnedWidth, frameHeight / turnedHeight) : Math.min(frameWidth / turnedWidth, frameHeight / turnedHeight);
  const scale = base * clamp(edit.zoom, 1, 4);
  const drawnWidth = turnedWidth * scale;
  const drawnHeight = turnedHeight * scale;
  return {
    cx: frameWidth / 2 + clamp(edit.px, -1, 1) * (Math.abs(drawnWidth - frameWidth) / 2),
    cy: frameHeight / 2 + clamp(edit.py, -1, 1) * (Math.abs(drawnHeight - frameHeight) / 2),
    dw: drawnWidth,
    dh: drawnHeight,
  };
}

/**
 * Where and how the photo is drawn on a frame, for laying its masks over it (and painting them).
 * @param photoWidth the photo's own width, pixels
 * @param photoHeight its own height, pixels
 * @param edit the photo's edit
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @returns its centre, its own size as drawn (before turning), turn and mirror
 */
export function photoPlace(photoWidth: number, photoHeight: number, edit: IgEdit, frameWidth: number, frameHeight: number): PhotoPlace {
  const placed = placement(photoWidth, photoHeight, edit, frameWidth, frameHeight);
  const turned = edit.rot % 180 !== 0;
  return { cx: placed.cx, cy: placed.cy, w: turned ? placed.dh : placed.dw, h: turned ? placed.dw : placed.dh, rot: edit.rot, flip: edit.flip };
}

/**
 * Whether the photo leaves part of the frame empty, so the background shows.
 * @param photoWidth the photo's own width, pixels
 * @param photoHeight its own height, pixels
 * @param edit the photo's edit
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @returns true when an edge of the frame is uncovered (by more than half a pixel)
 */
export function showsBackground(photoWidth: number, photoHeight: number, edit: IgEdit, frameWidth: number, frameHeight: number): boolean {
  const placed = placement(photoWidth, photoHeight, edit, frameWidth, frameHeight);
  return (
    placed.cx - placed.dw / 2 > 0.5 ||
    placed.cy - placed.dh / 2 > 0.5 ||
    placed.cx + placed.dw / 2 < frameWidth - 0.5 ||
    placed.cy + placed.dh / 2 < frameHeight - 0.5
  );
}

/**
 * The colour chain (engine/chain.ts: look, light and white balance, tone curve, colour mixer), then brightness,
 * contrast, saturation and warmth, on raw RGBA pixels, rounding to 8 bits after the chain and at the end. Transparent
 * pixels are skipped. The GPU path (gpu/colour.ts) mirrors it.
 * @param pixels RGBA, written in place
 * @param adjust the settings
 */
export function adjustPixels(pixels: Uint8ClampedArray, adjust: Adjustments): void {
  if (chainNeutral(adjust)) lookPixels(pixels, adjust.look);
  else chainPixels(pixels, adjust);
  if (!adjust.brightness && !adjust.contrast && !adjust.saturation && !adjust.warmth) return;
  const brightness = (clamp(adjust.brightness, -100, 100) / 100) * 64;
  const contrast = 1 + clamp(adjust.contrast, -100, 100) / 125;
  const saturation = 1 + clamp(adjust.saturation, -100, 100) / 100;
  const warmth = (clamp(adjust.warmth, -100, 100) / 100) * 24;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = ((pixels[index] ?? 0) + brightness - 128) * contrast + 128;
    const green = ((pixels[index + 1] ?? 0) + brightness - 128) * contrast + 128;
    const blue = ((pixels[index + 2] ?? 0) + brightness - 128) * contrast + 128;
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
    pixels[index] = luma + (red - luma) * saturation + warmth;
    pixels[index + 1] = luma + (green - luma) * saturation + warmth * 0.15;
    pixels[index + 2] = luma + (blue - luma) * saturation - warmth;
  }
}

/**
 * One mask on the Canvas 2D path: the picture so far with the mask's settings applied, mixed into it by the mask
 * (0 keeps the picture, 1 takes the adjusted one). The GPU does the same with gpu/mask.ts.
 * @param pixels the picture, RGBA, written in place
 * @param width pixels
 * @param height pixels
 * @param adjust the mask's settings
 * @param mask the mask on the frame (skipped when its size isn't the picture's)
 */
export function maskPixels(pixels: Uint8ClampedArray, width: number, height: number, adjust: Adjustments, mask: FrameMask): void {
  if (mask.width !== width || mask.height !== height) return;
  const adjusted = pixels.slice();
  adjustPixels(adjusted, adjust);
  detailPixels(adjusted, width, height, adjust, width / DETAIL_WIDTH);
  for (let index = 0; index < pixels.length; index += 4) {
    const coverage = mask.data[index >> 2] ?? 0;
    if (!coverage || !pixels[index + 3]) continue;
    const share = coverage / 255;
    for (let channel = index; channel < index + 3; channel++) {
      const before = pixels[channel] ?? 0;
      pixels[channel] = before + ((adjusted[channel] ?? 0) - before) * share;
    }
  }
}

/**
 * A canvas of a size (at least 1 × 1, whole pixels).
 * @param width pixels
 * @param height pixels
 * @returns the canvas
 */
const canvasOf = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
};

/** Draws the photo centred at a point at a drawn size, turned and mirrored as its edit says. */
type PhotoDrawer = (ctx: CanvasRenderingContext2D, cx: number, cy: number, drawnWidth: number, drawnHeight: number) => void;

/**
 * A function drawing a photo as its edit says.
 * @param src the photo
 * @param edit its turn and mirror
 * @returns the drawer
 */
function photoDrawer(src: CanvasImageSource, edit: IgEdit): PhotoDrawer {
  const turned = edit.rot % 180 !== 0;
  return (ctx, cx, cy, drawnWidth, drawnHeight) => {
    ctx.save();
    // Restored even when drawImage throws (a video frame closed since it was handed out), so the canvas isn't left
    // moved to the photo's centre for every later draw.
    try {
      ctx.translate(cx, cy);
      ctx.rotate((edit.rot * Math.PI) / 180);
      if (edit.flip) ctx.scale(-1, 1);
      const width = turned ? drawnHeight : drawnWidth;
      const height = turned ? drawnWidth : drawnHeight;
      ctx.drawImage(src, -width / 2, -height / 2, width, height);
    } finally {
      ctx.restore();
    }
  };
}

/** A photo to draw: its source and its own size. */
interface Source {
  src: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * A blurred copy of the photo behind it: the photo covering the frame at 1/32 size, scaled back up (works in every
 * browser), slightly darkened.
 * @param ctx the frame's context
 * @param source the photo
 * @param edit its edit
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 */
function drawBlurredCopy(ctx: CanvasRenderingContext2D, source: Source, edit: IgEdit, frameWidth: number, frameHeight: number): void {
  const small = canvasOf(Math.max(8, frameWidth / 32), Math.max(8, frameHeight / 32));
  const smallCtx = small.getContext('2d');
  if (!smallCtx) return;
  const cover = placement(source.width, source.height, { ...edit, fit: 'fill', zoom: 1, px: 0, py: 0 }, small.width, small.height);
  smallCtx.imageSmoothingQuality = 'high';
  smallCtx.save();
  photoDrawer(source.src, edit)(smallCtx, cover.cx, cover.cy, cover.dw, cover.dh);
  smallCtx.restore();
  ctx.drawImage(small, 0, 0, frameWidth, frameHeight);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, frameWidth, frameHeight);
}

/**
 * The background, only where the photo leaves part of the frame empty: a colour, or a blurred copy of the photo. Part
 * of renderIg(); the 16-bit export (engine/deep.ts) draws it on its own and lays the photo over it in full precision.
 * @param ctx the frame's context
 * @param src the photo
 * @param photoWidth its own width, pixels
 * @param photoHeight its own height, pixels
 * @param edit its edit
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  photoWidth: number,
  photoHeight: number,
  edit: IgEdit,
  frameWidth: number,
  frameHeight: number,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (!showsBackground(photoWidth, photoHeight, edit, frameWidth, frameHeight)) return;
  if (edit.bg === 'blur') {
    drawBlurredCopy(ctx, { src, width: photoWidth, height: photoHeight }, edit, frameWidth, frameHeight);
    return;
  }
  ctx.fillStyle = HEX.test(edit.bg) ? edit.bg : '#ffffff';
  ctx.fillRect(0, 0, frameWidth, frameHeight);
}

/**
 * The vignette's darkening at a frame pixel, exactly as renderIg()'s radial gradient draws it.
 * @param x frame pixels
 * @param y frame pixels
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @param vignette the setting, 0–100
 * @returns 0–1
 */
export function vignetteAt(x: number, y: number, frameWidth: number, frameHeight: number, vignette: number): number {
  if (Number.isNaN(vignette) || vignette <= 0) return 0;
  const inner = Math.min(frameWidth, frameHeight) * 0.35;
  const outer = Math.hypot(frameWidth, frameHeight) / 2;
  const along = Math.min(1, Math.max(0, (Math.hypot(x - frameWidth / 2, y - frameHeight / 2) - inner) / (outer - inner)));
  return along * (clamp(vignette, 0, 100) / 100) * 0.6;
}

/** A mask laid on the frame, with its settings. */
interface LocalAdjustment {
  adjust: Adjustments;
  mask: FrameMask;
}

/**
 * The photo with its colour, detail and masks, on its own layer so the adjustments leave the background alone. The
 * colour runs on the GPU when the media studio has opened a device (gpu/apply.ts), else on the CPU here; both give the
 * same pixels.
 * @param ctx the frame's context
 * @param source the photo
 * @param edit its edit
 * @param masks the masks that change something
 * @param frame the frame's size
 * @param frame.width pixels
 * @param frame.height pixels
 */
function drawAdjustedPhoto(ctx: CanvasRenderingContext2D, source: Source, edit: IgEdit, masks: Mask[], frame: { width: number; height: number }): void {
  const { width, height } = frame;
  const placed = placement(source.width, source.height, edit, width, height);
  // Each mask laid on the frame where the photo is: the same raster for both paths.
  const place = photoPlace(source.width, source.height, edit, width, height);
  const local: LocalAdjustment[] = masks.map((mask) => ({ adjust: mask.adjust, mask: frameMask(mask, source.width, source.height, place, width, height, source.src) }));
  // The same canvas mode on both paths: an accelerated canvas draws the photo's fractional edges differently from a
  // read-back one, which would make the two paths disagree along the edge of the photo.
  const onGpu = !!gpu();
  const layer = canvasOf(width, height);
  const layerCtx = layer.getContext('2d', { willReadFrequently: true });
  if (!layerCtx) return;
  layerCtx.imageSmoothingQuality = 'high';
  photoDrawer(source.src, edit)(layerCtx, placed.cx, placed.cy, placed.dw, placed.dh);
  if (onGpu && gpuColour(ctx, layer, edit.adjust, width, height, local)) return;
  const image = layerCtx.getImageData(0, 0, layer.width, layer.height);
  adjustPixels(image.data, edit.adjust);
  // Detail sizes are for a 1080 px frame, scaled to this one, so preview and export match.
  detailPixels(image.data, layer.width, layer.height, edit.adjust, layer.width / DETAIL_WIDTH);
  for (const adjustment of local) maskPixels(image.data, layer.width, layer.height, adjustment.adjust, adjustment.mask);
  layerCtx.putImageData(image, 0, 0);
  ctx.drawImage(layer, 0, 0, width, height);
}

/**
 * The vignette: a radial gradient darkening the corners.
 * @param ctx the frame's context
 * @param vignette the setting, 0–100
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 */
function drawVignette(ctx: CanvasRenderingContext2D, vignette: number, frameWidth: number, frameHeight: number): void {
  const gradient = ctx.createRadialGradient(
    frameWidth / 2,
    frameHeight / 2,
    Math.min(frameWidth, frameHeight) * 0.35,
    frameWidth / 2,
    frameHeight / 2,
    Math.hypot(frameWidth, frameHeight) / 2,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${String((clamp(vignette, 0, 100) / 100) * 0.6)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, frameWidth, frameHeight);
}

/**
 * Draws a finished post: background, the photo placed, rotated and mirrored, its colour adjusted, and the vignette.
 * @param ctx the frame's context
 * @param src the photo (a smaller copy works for previews)
 * @param photoWidth its own width, pixels
 * @param photoHeight its own height, pixels
 * @param edit its edit
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 */
export function renderIg(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  photoWidth: number,
  photoHeight: number,
  edit: IgEdit,
  frameWidth: number,
  frameHeight: number,
): void {
  drawBackground(ctx, src, photoWidth, photoHeight, edit, frameWidth, frameHeight);
  const masks = edit.masks.filter(maskActive);
  if (pixelsNeutral(edit.adjust) && !masks.length) {
    const placed = placement(photoWidth, photoHeight, edit, frameWidth, frameHeight);
    photoDrawer(src, edit)(ctx, placed.cx, placed.cy, placed.dw, placed.dh);
  } else {
    drawAdjustedPhoto(ctx, { src, width: photoWidth, height: photoHeight }, edit, masks, { width: frameWidth, height: frameHeight });
  }
  if (edit.adjust.vignette > 0) drawVignette(ctx, edit.adjust.vignette, frameWidth, frameHeight);
}
