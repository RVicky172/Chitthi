import { layerBox } from './layerDraw';
import { activeAt, type Box, type Layer } from './layers';

/* Picking layers on the frame, their selection outline and handles, and turning one with the pointer (preview only). */

/**
 * A point in a layer's own coordinates.
 * @param box the layer's box
 * @param x frame pixels
 * @param y frame pixels
 * @returns the point, unrotated and centred on the box
 */
export function toLocal(box: Box, x: number, y: number): [number, number] {
  const dx = x - box.cx;
  const dy = y - box.cy;
  const cos = Math.cos(box.rot);
  const sin = Math.sin(box.rot);
  return [dx * cos + dy * sin, -dx * sin + dy * cos];
}

/**
 * The topmost layer under a point.
 * @param ctx the frame's context
 * @param layers the layers, bottom first
 * @param x frame pixels
 * @param y frame pixels
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @param tolerance extra pixels around each box
 * @param time seconds on the timeline (video only): only the layers showing then
 * @returns the layer, or null
 */
export function hitLayer(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  x: number,
  y: number,
  frameWidth: number,
  frameHeight: number,
  tolerance = 4,
  time?: number,
): Layer | null {
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers.at(index);
    if (!layer || !activeAt(layer, time)) continue;
    const box = layerBox(ctx, layer, frameWidth, frameHeight);
    const [localX, localY] = toLocal(box, x, y);
    if (Math.abs(localX) <= box.w / 2 + tolerance && Math.abs(localY) <= box.h / 2 + tolerance) return layer;
  }
  return null;
}

/** Distance of the rotate handle above the box, in pixels at scale 1. */
export const ROTATE_GAP = 26;

/**
 * Which handle of a selected box is under a point.
 * @param box the layer's box
 * @param x frame pixels
 * @param y frame pixels
 * @param radius the handles' radius, pixels
 * @returns resize (bottom-right corner), rotate (above the top), or null
 */
export function handleAt(box: Box, x: number, y: number, radius: number): 'resize' | 'rotate' | null {
  const [localX, localY] = toLocal(box, x, y);
  if (Math.hypot(localX - box.w / 2, localY - box.h / 2) <= radius * 1.6) return 'resize';
  if (Math.hypot(localX, localY + box.h / 2 + ROTATE_GAP * (radius / 7)) <= radius * 1.6) return 'rotate';
  return null;
}

/**
 * The selection outline with its two handles (preview only, never exported).
 * @param ctx the frame's context
 * @param box the layer's box
 * @param radius the handles' radius, pixels
 */
export function drawSelection(ctx: CanvasRenderingContext2D, box: Box, radius: number): void {
  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(box.rot);
  ctx.lineWidth = Math.max(1, radius / 4);
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([radius, radius * 0.7]);
  ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.strokeStyle = '#d97706';
  ctx.lineDashOffset = radius;
  ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.setLineDash([]);
  const gap = ROTATE_GAP * (radius / 7);
  ctx.beginPath();
  ctx.moveTo(0, -box.h / 2);
  ctx.lineTo(0, -box.h / 2 - gap);
  ctx.stroke();
  for (const [x, y] of [
    [box.w / 2, box.h / 2],
    [0, -box.h / 2 - gap],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius / 3);
    ctx.strokeStyle = '#d97706';
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The rotation for a pointer around the box's centre, snapped to right angles within 4°.
 * @param box the layer's box
 * @param x frame pixels
 * @param y frame pixels
 * @returns degrees, 0–360, to a tenth
 */
export function rotationFor(box: Box, x: number, y: number): number {
  let degrees = (Math.atan2(y - box.cy, x - box.cx) * 180) / Math.PI + 90;
  degrees = ((degrees % 360) + 360) % 360;
  for (const snap of [0, 90, 180, 270, 360]) if (Math.abs(degrees - snap) < 4) degrees = snap % 360;
  return Math.round(degrees * 10) / 10;
}
