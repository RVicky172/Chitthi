// The crop tool's geometry (CropDialog): the crop box over the rotated photo, in display pixels, and how pointers and
// keys move and resize it. Plain data and canvas drawing; no React.
import type { Rect } from '../types';

/** A crop shape: a width ÷ height, 0 for free, or the selected slot's shape. */
export type Aspect = number | 'fit';

/** What a press does: move the box (from where it was), or resize it from an anchored corner. */
export type CropAction =
  { t: 'move'; sx: number; sy: number; ox: number; oy: number } | { t: 'resize'; ax: number; ay: number };

/** The crop tool's state: the display size, the box, the rotated preview and the action under way. */
export interface CropView {
  /** Display size of the rotated photo, CSS pixels. */
  DW: number;
  DH: number;
  /** The crop box, display pixels. */
  cr: Rect;
  /** The rotated, mirrored photo at the canvas's resolution. */
  disp: HTMLCanvasElement | null;
  act: CropAction | null;
  /** The next preview starts from the photo's saved crop (else from a full crop). */
  first: boolean;
}

/** How near a corner a press grabs it, display pixels. */
export const HANDLE = 16;

/** A corner of the box: which one, and where. */
type Corner = readonly ['tl' | 'tr' | 'bl' | 'br', number, number];

/**
 * The box's four corners.
 * @param box the crop box
 * @returns each corner's name and position
 */
export function corners(box: Rect): Corner[] {
  return [
    ['tl', box.x, box.y],
    ['tr', box.x + box.w, box.y],
    ['bl', box.x, box.y + box.h],
    ['br', box.x + box.w, box.y + box.h],
  ];
}

/**
 * The corner under a point, if any.
 * @param box the crop box
 * @param x the point, display pixels
 * @param y the point, display pixels
 * @returns the corner, or undefined
 */
export function cornerAt(box: Rect, x: number, y: number): Corner | undefined {
  return corners(box).find(([, cornerX, cornerY]) => Math.abs(x - cornerX) < HANDLE && Math.abs(y - cornerY) < HANDLE);
}

/**
 * Draws the preview with the outside of the box dimmed, the box, thirds and corner handles.
 * @param context the canvas
 * @param view the crop tool's state (its preview is drawn)
 * @param scale canvas pixels per display pixel
 */
export function paintCrop(context: CanvasRenderingContext2D, view: CropView, scale: number): void {
  if (!view.disp) return;
  const box = view.cr;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.drawImage(view.disp, 0, 0);
  context.scale(scale, scale);
  context.fillStyle = 'rgba(0,0,0,.55)';
  context.beginPath();
  context.rect(0, 0, view.DW, view.DH);
  context.rect(box.x, box.y, box.w, box.h);
  context.fill('evenodd');
  context.strokeStyle = '#fff';
  context.lineWidth = 1.5;
  context.strokeRect(box.x, box.y, box.w, box.h);
  context.strokeStyle = 'rgba(255,255,255,.45)';
  context.lineWidth = 1;
  context.beginPath();
  for (let third = 1; third < 3; third++) {
    context.moveTo(box.x + (box.w * third) / 3, box.y);
    context.lineTo(box.x + (box.w * third) / 3, box.y + box.h);
    context.moveTo(box.x, box.y + (box.h * third) / 3);
    context.lineTo(box.x + box.w, box.y + (box.h * third) / 3);
  }
  context.stroke();
  context.fillStyle = '#fff';
  for (const [, cornerX, cornerY] of corners(box)) context.fillRect(cornerX - 6, cornerY - 6, 12, 12);
}

/**
 * The largest box of a shape, centred on the photo; the whole photo for a free shape.
 * @param width the display width
 * @param height the display height
 * @param ratio the shape's width ÷ height, 0 for free
 * @returns the box
 */
export function fittedCrop(width: number, height: number, ratio: number): Rect {
  if (!ratio) return { x: 0, y: 0, w: width, h: height };
  let boxW = width,
    boxH = boxW / ratio;
  if (boxH > height) {
    boxH = height;
    boxW = boxH * ratio;
  }
  return { x: (width - boxW) / 2, y: (height - boxH) / 2, w: boxW, h: boxH };
}

/**
 * What a press starts: resizing from the opposite corner when on a corner, moving when inside, else drawing a new box.
 * @param box the crop box
 * @param x the press, display pixels
 * @param y the press, display pixels
 * @returns the action
 */
export function pressAction(box: Rect, x: number, y: number): CropAction {
  const corner = cornerAt(box, x, y);
  if (corner)
    return {
      t: 'resize',
      ax: corner[0].includes('l') ? box.x + box.w : box.x,
      ay: corner[0].includes('t') ? box.y + box.h : box.y,
    };
  if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h)
    return { t: 'move', sx: x, sy: y, ox: box.x, oy: box.y };
  return { t: 'resize', ax: x, ay: y };
}

/**
 * The box a drag makes: moved within the photo, or resized from its anchor (kept to the shape, at least 20 px).
 * @param view the crop tool's state
 * @param action the action under way
 * @param x the pointer, display pixels
 * @param y the pointer, display pixels
 * @param ratio the shape, 0 for free
 * @returns the new box
 */
export function draggedCrop(view: CropView, action: CropAction, x: number, y: number, ratio: number): Rect {
  if (action.t === 'move')
    return {
      ...view.cr,
      x: Math.max(0, Math.min(view.DW - view.cr.w, action.ox + x - action.sx)),
      y: Math.max(0, Math.min(view.DH - view.cr.h, action.oy + y - action.sy)),
    };
  const towardsX = x < action.ax ? -1 : 1,
    towardsY = y < action.ay ? -1 : 1;
  let width = Math.min(Math.abs(x - action.ax), towardsX < 0 ? action.ax : view.DW - action.ax),
    height = Math.min(Math.abs(y - action.ay), towardsY < 0 ? action.ay : view.DH - action.ay);
  if (ratio) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  width = Math.max(width, 20);
  height = Math.max(height, 20);
  return {
    x: towardsX < 0 ? action.ax - width : action.ax,
    y: towardsY < 0 ? action.ay - height : action.ay,
    w: width,
    h: height,
  };
}

/** Arrow keys' directions. */
const NUDGES: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * The box moved by an arrow key, kept within the photo.
 * @param view the crop tool's state
 * @param key the key
 * @param shift whether Shift is held (bigger steps)
 * @returns the new box, or null for other keys
 */
export function nudgedCrop(view: CropView, key: string, shift: boolean): Rect | null {
  const nudge = NUDGES[key];
  if (!nudge) return null;
  const step = shift ? 20 : 4;
  return {
    ...view.cr,
    x: Math.max(0, Math.min(view.DW - view.cr.w, view.cr.x + nudge[0] * step)),
    y: Math.max(0, Math.min(view.DH - view.cr.h, view.cr.y + nudge[1] * step)),
  };
}

/**
 * The photo turned and mirrored onto a canvas of a size.
 * @param image the original photo
 * @param rot the turn, degrees (a multiple of 90)
 * @param flip whether it is mirrored
 * @param width the canvas width
 * @param height the canvas height
 * @returns the canvas, or null without a 2D context
 */
export function rotatedPhoto(
  image: HTMLImageElement,
  rot: number,
  flip: boolean,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const imageW = image.naturalWidth,
    imageH = image.naturalHeight,
    turnedW = rot % 180 ? imageH : imageW,
    turnedH = rot % 180 ? imageW : imageH;
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (!context) return null;
  const scale = width / turnedW;
  context.imageSmoothingQuality = 'high';
  context.scale(scale, scale);
  context.translate(turnedW / 2, turnedH / 2);
  context.rotate((rot * Math.PI) / 180);
  if (flip) context.scale(-1, 1);
  context.drawImage(image, -imageW / 2, -imageH / 2);
  return output;
}
