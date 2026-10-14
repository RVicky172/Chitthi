import { fontDef, fontStr } from '../data/fonts';
import type { Box, Design, Layout, RenderInput, RenderOpts, Side, Theme } from '../types';
import { drawYearBack } from './calendarDraw';
import { drawBack, drawFrameBack, drawMagnetBack } from './cardBack';
import { drawFront } from './cardFront';
import { cardMM, sizeOf } from './design';
import { computeLayout } from './layout';
import { coverScale } from './photoSlots';
import { drawThemeBg } from './themeBackground';

/*
 * The print renderer's entry: one side of a card drawn into a canvas at a resolution, with its bleed, cut round for
 * button magnets, with optional trim and safe-area guides. The preview, the PDFs and the PNGs all draw through it, so
 * the files match the preview. The front is cardFront.ts; the backs cardBack.ts and calendarDraw.ts.
 */

/**
 * The trim (red) and safe-area (blue) guides, dashed: rectangles, or rings for round magnets.
 * @param ctx the card's context
 * @param box the card
 * @param pxPerMm pixels per millimetre
 * @param round whether the card is cut round
 */
function drawGuides(ctx: CanvasRenderingContext2D, box: Box, pxPerMm: number, round = false): void {
  ctx.save();
  ctx.lineWidth = Math.max(1, pxPerMm * 0.2);
  ctx.setLineDash([pxPerMm * 1.5, pxPerMm]);
  const safe = 4 * pxPerMm;
  const ring = (inset: number) => {
    ctx.beginPath();
    ctx.arc(box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) / 2 - inset, 0, Math.PI * 2);
    ctx.stroke();
  };
  ctx.strokeStyle = '#E11D48';
  if (round) ring(0);
  else ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = '#2563EB';
  if (round) ring(safe);
  else ctx.strokeRect(box.x + safe, box.y + safe, box.w - 2 * safe, box.h - 2 * safe);
  ctx.restore();
}

/**
 * Button magnets are cut round: paper white outside the trim circle plus its bleed ring.
 * @param ctx the card's context
 * @param box the card
 * @param width the canvas's width, pixels
 * @param height the canvas's height, pixels
 */
function whiteOutsideCircle(ctx: CanvasRenderingContext2D, box: Box, width: number, height: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) / 2 + box.e, 0, Math.PI * 2, true);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill('evenodd');
  ctx.restore();
}

/**
 * Draws a card's back for its product: a calendar's year, a frame's dedication, a magnet's sheet, else a postcard's.
 * @param ctx the card's context
 * @param box the card
 * @param input the design and its photos
 */
function drawBackSide(ctx: CanvasRenderingContext2D, box: Box, input: RenderInput): void {
  const design = input.d;
  if (design.product === 'calendar') drawYearBack(ctx, box, design);
  else if (design.product === 'frame') drawFrameBack(ctx, box, design, input.photos.map((photo) => photo.name));
  else if (design.product === 'magnet') drawMagnetBack(ctx, box);
  else drawBack(ctx, box, design, input.photos.map((photo) => photo.name));
}

/**
 * Draws one side of the card into a canvas, which is sized to the card and its bleed.
 * @param canvas the canvas
 * @param side the front or the back
 * @param pxPerMm pixels per millimetre
 * @param bleedMM the bleed around the trim, millimetres
 * @param input the design and its photos
 * @param opts the layout to use, the calendar page, the empty-slot hint, thumbnail, guides
 * @returns the front's layout, or null for a back (or when the canvas has no 2D context)
 */
export function renderCard(
  canvas: HTMLCanvasElement,
  side: Side,
  pxPerMm: number,
  bleedMM: number,
  input: RenderInput,
  opts: RenderOpts = {},
): Layout | null {
  const { w: widthMM, h: heightMM } = cardMM(input.d);
  const bleed = bleedMM * pxPerMm;
  const width = Math.max(1, Math.round((widthMM + 2 * bleedMM) * pxPerMm));
  const height = Math.max(1, Math.round((heightMM + 2 * bleedMM) * pxPerMm));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const box: Box = { x: bleed, y: bleed, w: width - 2 * bleed, h: height - 2 * bleed, e: bleed };
  let layout: Layout | null = null;
  if (side === 'front') layout = drawFront(ctx, box, input, opts);
  else drawBackSide(ctx, box, input);
  const round = sizeOf(input.d).shape === 'circle';
  if (round) whiteOutsideCircle(ctx, box, width, height);
  if (opts.guides) drawGuides(ctx, box, pxPerMm, round);
  return layout;
}

/**
 * The theme swatch of the occasion picker: its background and first greeting.
 * @param canvas the swatch's canvas, sized
 * @param theme the theme
 */
export function renderThemeTile(canvas: HTMLCanvasElement, theme: Theme): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  drawThemeBg(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height, e: 0 }, theme, true);
  const family = fontDef(theme.hf);
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontStr(family.n, family.hw, canvas.height * 0.16);
  const greeting = theme.heads.at(0) ?? '';
  ctx.fillText((greeting.split(',').at(0) ?? '').slice(0, 16), canvas.width / 2, canvas.height / 2);
}

/**
 * The effective print resolution of each photo in the current front layout.
 * @param input the design and its photos
 * @returns each photo's lowest dpi among the slots showing it, or null when no slot shows it
 */
export function photoDpi(input: RenderInput): (number | null)[] {
  const { w, h } = cardMM(input.d);
  const layout = computeLayout(input.d.layout, { x: 0, y: 0, w, h, e: 0 }, input.d);
  const count = input.photos.length;
  return input.photos.map((photo, photoIndex) => {
    let lowest = Infinity;
    layout.slots.forEach((slot, slotIndex) => {
      if (slotIndex % count === photoIndex) lowest = Math.min(lowest, 25.4 / coverScale(photo, slot.d));
    });
    return Number.isFinite(lowest) ? Math.round(lowest) : null;
  });
}

/**
 * Whether a design's size is an instant-film print.
 * @param design the design
 * @returns true for an Instax size
 */
export const isInstax = (design: Design): boolean => !!sizeOf(design).instax;
