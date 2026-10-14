import type { Box, Layout, Photo, Rect, RenderInput, RenderOpts, Slot, Theme } from '../types';
import { darkInk } from './design';
import { slotPhotoIndex } from './layout';
import { artworkShown, drawThemeBg } from './themeBackground';

/*
 * The photos on a card's front: each slot's shape and shadow, its photo cropped to cover it (or the occasion's
 * background and an "Add a photo" hint when it has none), outlines, instant-print paper and tape; what sits behind
 * the photos (colour blocks, film strips); a cut mat's bevels; a frosted-glass panel.
 */

/** Everything a slot's drawing needs besides the slot. */
export interface SlotScene {
  theme: Theme;
  box: Box;
  /** The card's drawing unit (themeBackground.ts cardUnit). */
  unit: number;
  opts: RenderOpts;
  /** The occasion's background is already behind the slots, so an empty slot needn't draw it. */
  bgShown: boolean;
  input: RenderInput;
  /** Calendar page, and how many slots each page has: which photo a slot shows. */
  page: number;
  count: number;
}

/**
 * Makes a slot's shape the current path: a polygon, circle, arch, rounded or plain rectangle.
 * @param ctx the card's context
 * @param slot the slot's shape, its box and (for a polygon) its corners
 */
export function slotPath(ctx: CanvasRenderingContext2D, slot: Pick<Slot, 's' | 'd' | 'pts'>): void {
  const rect = slot.d;
  ctx.beginPath();
  if (slot.s === 'poly' && slot.pts) {
    slot.pts.forEach(([x, y], index) => {
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  } else if (slot.s === 'circle') ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) / 2, 0, Math.PI * 2);
  else if (slot.s === 'arch') {
    const radius = rect.w / 2;
    ctx.moveTo(rect.x, rect.y + rect.h);
    ctx.lineTo(rect.x, rect.y + radius);
    ctx.arc(rect.x + radius, rect.y + radius, radius, Math.PI, 0);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
    ctx.closePath();
  } else if (slot.s === 'round') ctx.roundRect(rect.x, rect.y, rect.w, rect.h, Math.min(rect.w, rect.h) * 0.14);
  else ctx.rect(rect.x, rect.y, rect.w, rect.h);
}

/**
 * Canvas units per source pixel when a photo covers a rectangle.
 * @param photo the photo
 * @param rect the rectangle it covers
 * @returns the scale, the photo's zoom included
 */
export const coverScale = (photo: Photo, rect: Rect): number => Math.max(rect.w / photo.sw, rect.h / photo.sh) * photo.zoom;

/**
 * Draws a photo covering a rectangle, moved by its pan.
 * @param ctx the card's context
 * @param photo the photo
 * @param rect the rectangle
 */
function drawCover(ctx: CanvasRenderingContext2D, photo: Photo, rect: Rect): void {
  const scale = coverScale(photo, rect);
  const drawnWidth = photo.sw * scale;
  const drawnHeight = photo.sh * scale;
  ctx.drawImage(
    photo.src,
    rect.x - ((drawnWidth - rect.w) * (photo.px + 1)) / 2,
    rect.y - ((drawnHeight - rect.h) * (photo.py + 1)) / 2,
    drawnWidth,
    drawnHeight,
  );
}

/**
 * Instant print: the paper border (deeper at the bottom) with a soft shadow.
 * @param ctx the card's context
 * @param slot the slot
 * @param unit the card's drawing unit
 */
function drawPrintPaper(ctx: CanvasRenderingContext2D, slot: Slot, unit: number): void {
  const side = slot.w * 0.07;
  const foot = slot.w * 0.24;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.3)';
  ctx.shadowBlur = unit * 2.4;
  ctx.shadowOffsetY = unit * 0.8;
  ctx.fillStyle = '#FFFDF8';
  ctx.fillRect(slot.x - side, slot.y - side, slot.w + 2 * side, slot.h + side + foot);
  ctx.restore();
}

/**
 * A shaped slot's shadow: the shape filled in the theme's second colour.
 * @param ctx the card's context
 * @param slot the slot
 * @param scene the card
 */
function drawShapeShadow(ctx: CanvasRenderingContext2D, slot: Slot, scene: SlotScene): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = scene.unit * 2.2;
  ctx.shadowOffsetY = scene.unit * 0.6;
  slotPath(ctx, slot);
  ctx.fillStyle = scene.theme.bg2;
  ctx.fill();
  ctx.restore();
}

/**
 * An empty slot's "Add a photo" hint: a pale hatch and, but in thumbnails, a camera with the words.
 * @param ctx the card's context
 * @param slot the slot
 * @param scene the card
 */
function drawAddPhotoHint(ctx: CanvasRenderingContext2D, slot: Slot, scene: SlotScene): void {
  const { unit } = scene;
  const rect = slot.d;
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = unit * 0.4;
  for (let x = rect.x - rect.h; x < rect.x + rect.w; x += unit * 3) {
    ctx.beginPath();
    ctx.moveTo(x, rect.y + rect.h);
    ctx.lineTo(x + rect.h, rect.y);
    ctx.stroke();
  }
  if (scene.opts.thumb) return;
  const centreX = slot.x + slot.w / 2;
  const centreY = slot.y + slot.h / 2;
  const size = Math.min(slot.w, slot.h) * 0.09;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.roundRect(centreX - size * 1.6, centreY - size * 1.5, size * 3.2, size * 2.2, size * 0.4);
  ctx.fill();
  ctx.fillRect(centreX - size * 0.6, centreY - size * 1.9, size * 1.2, size * 0.5);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(centreX, centreY - size * 0.4, size * 0.62, 0, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.62)';
  ctx.font = `600 ${String(size * 0.9)}px Hind, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Add a photo', centreX, centreY + size * 1.1);
}

/**
 * Fills a slot's shape: its photo, or (empty) the occasion's background and, when asked, the hint.
 * @param ctx the card's context
 * @param slot the slot
 * @param photo its photo, if any
 * @param scene the card
 */
function fillSlot(ctx: CanvasRenderingContext2D, slot: Slot, photo: Photo | undefined, scene: SlotScene): void {
  ctx.save();
  slotPath(ctx, slot);
  ctx.clip();
  if (photo) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    drawCover(ctx, photo, slot.d);
  } else {
    if (!scene.bgShown) drawThemeBg(ctx, scene.box, scene.theme, artworkShown(scene.input.d));
    if (scene.opts.hint) drawAddPhotoHint(ctx, slot, scene);
  }
  ctx.restore();
}

/**
 * A shaped slot's accent outline, a finer one around it, and an arch's dot on top.
 * @param ctx the card's context
 * @param slot the slot
 * @param scene the card
 */
function drawSlotOutline(ctx: CanvasRenderingContext2D, slot: Slot, scene: SlotScene): void {
  const { unit, theme } = scene;
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = unit * 0.9;
  slotPath(ctx, slot);
  ctx.stroke();
  const offset = unit * 1.7;
  const rect = slot.d;
  ctx.lineWidth = unit * 0.35;
  slotPath(ctx, { s: slot.s, d: { x: rect.x - offset, y: rect.y - offset, w: rect.w + 2 * offset, h: rect.h + 2 * offset } });
  ctx.stroke();
  if (slot.s === 'arch') {
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y - offset - unit * 1.6, unit * 1.2, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Instant print: a strip of translucent tape across the top edge.
 * @param ctx the card's context
 * @param slot the slot
 * @param unit the card's drawing unit
 */
function drawTape(ctx: CanvasRenderingContext2D, slot: Slot, unit: number): void {
  const tapeWidth = slot.w * 0.42;
  const tapeHeight = slot.w * 0.1;
  ctx.save();
  ctx.translate(slot.x + slot.w / 2, slot.y - slot.w * 0.07);
  ctx.rotate(-0.06);
  ctx.fillStyle = 'rgba(245,235,205,.78)';
  ctx.shadowColor = 'rgba(0,0,0,.12)';
  ctx.shadowBlur = unit * 0.6;
  ctx.fillRect(-tapeWidth / 2, -tapeHeight / 2, tapeWidth, tapeHeight);
  ctx.restore();
}

/**
 * Draws one photo slot: tilted around its centre (scrapbook prints), its print paper, shadow, photo, outline and tape.
 * @param ctx the card's context
 * @param slot the slot
 * @param index its place among the layout's slots
 * @param scene the card
 */
export function drawSlot(ctx: CanvasRenderingContext2D, slot: Slot, index: number, scene: SlotScene): void {
  const { photos } = scene.input;
  const photo = photos.length ? photos.at(slotPhotoIndex(index, photos.length, scene.page, scene.count)) : undefined;
  ctx.save();
  if (slot.rot) {
    const centreX = slot.x + slot.w / 2;
    const centreY = slot.y + slot.h / 2;
    ctx.translate(centreX, centreY);
    ctx.rotate(slot.rot);
    ctx.translate(-centreX, -centreY);
  }
  if (slot.print) drawPrintPaper(ctx, slot, scene.unit);
  if (slot.s !== 'rect' && slot.s !== 'poly') drawShapeShadow(ctx, slot, scene);
  fillSlot(ctx, slot, photo, scene);
  if (slot.s !== 'rect' && !slot.bare) drawSlotOutline(ctx, slot, scene);
  if (slot.print) drawTape(ctx, slot, scene.unit);
  ctx.restore();
}

/**
 * A film strip band with sprocket holes along both edges, the background showing through them.
 * @param ctx the card's context
 * @param film the strip and its direction
 * @param box the card
 * @param theme the occasion's theme
 * @param unit the card's drawing unit
 */
function drawFilmStrip(ctx: CanvasRenderingContext2D, film: NonNullable<Layout['film']>, box: Box, theme: Theme, unit: number): void {
  const { r: strip, vertical } = film;
  const bleed = box.e;
  const band = vertical
    ? { x: strip.x, y: strip.y - bleed, w: strip.w, h: strip.h + 2 * bleed }
    : { x: strip.x - bleed, y: strip.y, w: strip.w + 2 * bleed, h: strip.h };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = unit * 2;
  ctx.fillStyle = '#171412';
  ctx.fillRect(band.x, band.y, band.w, band.h);
  ctx.restore();
  const holeSize = (vertical ? strip.w : strip.h) * 0.07;
  const step = holeSize * 2.1;
  ctx.fillStyle = theme.bg1;
  const along = vertical ? band.h : band.w;
  for (let position = step / 2; position < along; position += step) {
    for (const edge of [0.035, 0.965]) {
      const holeX = vertical ? band.x + band.w * edge - holeSize / 2 : band.x + position - holeSize / 2;
      const holeY = vertical ? band.y + position - holeSize / 2 : band.y + band.h * edge - holeSize / 2;
      ctx.beginPath();
      ctx.roundRect(holeX, holeY, holeSize, holeSize * 0.8, holeSize * 0.2);
      ctx.fill();
    }
  }
}

/**
 * What sits behind the photos in the modern layouts: offset colour blocks and film strips.
 * @param ctx the card's context
 * @param layout the front's layout
 * @param box the card
 * @param theme the occasion's theme
 * @param unit the card's drawing unit
 */
export function drawLayoutArt(ctx: CanvasRenderingContext2D, layout: Layout, box: Box, theme: Theme, unit: number): void {
  for (const block of layout.blocks ?? []) {
    ctx.fillStyle = block.c === 'accent' ? theme.accent : darkInk(theme);
    ctx.fillRect(block.r.x, block.r.y, block.r.w, block.r.h);
  }
  if (layout.film) drawFilmStrip(ctx, layout.film, box, theme, unit);
}

/**
 * A cut mat: a pale bevel around each window and a faint shadow line where the photo sits under it.
 * @param ctx the card's context
 * @param layout the front's layout
 * @param unit the card's drawing unit
 */
export function drawMatBevels(ctx: CanvasRenderingContext2D, layout: Layout, unit: number): void {
  const bevel = unit * 0.7;
  ctx.save();
  for (const slot of layout.slots) {
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = unit * 0.25;
    ctx.strokeRect(slot.x, slot.y, slot.w, slot.h);
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = bevel;
    ctx.strokeRect(slot.x - bevel / 2, slot.y - bevel / 2, slot.w + bevel, slot.h + bevel);
    ctx.strokeStyle = 'rgba(0,0,0,.1)';
    ctx.lineWidth = unit * 0.2;
    ctx.strokeRect(slot.x - bevel, slot.y - bevel, slot.w + 2 * bevel, slot.h + 2 * bevel);
  }
  ctx.restore();
}

/**
 * Frosted glass: the photo under the panel, blurred (drawn tiny and scaled back up, which works in every browser),
 * lightened, with a fine white edge and a soft shadow.
 * @param ctx the card's context
 * @param panel the panel
 * @param unit the card's drawing unit
 */
export function drawGlass(ctx: CanvasRenderingContext2D, panel: Rect, unit: number): void {
  const radius = Math.min(panel.w, panel.h) * 0.06;
  const shrink = 1 / 28;
  const tinyWidth = Math.max(1, Math.round(panel.w * shrink));
  const tinyHeight = Math.max(1, Math.round(panel.h * shrink));
  const tiny = document.createElement('canvas');
  tiny.width = tinyWidth;
  tiny.height = tinyHeight;
  const tinyCtx = tiny.getContext('2d');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = unit * 3;
  ctx.shadowOffsetY = unit * 0.8;
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, radius);
  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, radius);
  ctx.clip();
  if (tinyCtx) {
    tinyCtx.imageSmoothingQuality = 'high';
    tinyCtx.drawImage(ctx.canvas, panel.x, panel.y, panel.w, panel.h, 0, 0, tinyWidth, tinyHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tiny, panel.x, panel.y, panel.w, panel.h);
  }
  const gradient = ctx.createLinearGradient(panel.x, panel.y, panel.x + panel.w, panel.y + panel.h);
  gradient.addColorStop(0, 'rgba(255,255,255,.78)');
  gradient.addColorStop(1, 'rgba(255,255,255,.64)');
  ctx.fillStyle = gradient;
  ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.lineWidth = Math.max(1, unit * 0.3);
  ctx.beginPath();
  ctx.roundRect(panel.x, panel.y, panel.w, panel.h, radius);
  ctx.stroke();
  ctx.restore();
}
