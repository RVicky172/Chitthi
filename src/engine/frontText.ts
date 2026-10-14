import { fontDef, fontStr } from '../data/fonts';
import type { Box, Design, Layout, Rect, Theme } from '../types';
import { darkInk, frameInk } from './design';
import { wrapLines } from './printText';

/*
 * The words on a card's front: the greeting, quote and signature fitted to the layout's text zone (with an ornament
 * between greeting and quote), the scrim that darkens a photo under them, and the words of a calendar page.
 */

/** One block of the front's words: the greeting (`h`), quote (`q`), signature (`s`) or the ornament (`o`). */
interface TextItem {
  kind: 'h' | 'q' | 's' | 'o';
  lines: string[];
  font: string;
  /** Font size, pixels. */
  px: number;
  /** Line height, a multiple of `px`. */
  lineHeight: number;
  /** The block's height, pixels. */
  height: number;
}

/** The words laid out at one size. */
interface TextLayout {
  items: TextItem[];
  /** Their height with the gaps, pixels. */
  total: number;
  /** The widest line, pixels. */
  maxWidth: number;
  /** The gap between blocks, pixels. */
  gap: number;
}

/**
 * Lays the front's words out at a greeting size.
 * @param ctx the card's context
 * @param zone the text zone
 * @param base the greeting's size, pixels (the quote and signature follow it)
 * @param design the design
 * @returns the blocks and their size
 */
function layoutText(ctx: CanvasRenderingContext2D, zone: Rect, base: number, design: Design): TextLayout {
  const headFamily = fontDef(design.headFont);
  const quoteFamily = fontDef(design.quoteFont);
  const sigFamily = fontDef(design.sigFont || design.quoteFont);
  const items: TextItem[] = [];
  let total = 0;
  let maxWidth = 0;
  const quoteSize = base * 0.44;
  const add = (kind: TextItem['kind'], text: string, font: string, px: number, lineHeight: number) => {
    ctx.font = font;
    const lines = wrapLines(ctx, text, zone.w);
    for (const line of lines) maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
    const height = lines.length * px * lineHeight;
    items.push({ kind, lines, font, px, lineHeight, height });
    total += height;
  };
  const hasHeading = design.showHeading && design.heading.trim();
  const hasQuote = design.showQuote && design.quote.trim();
  const hasSig = design.showSig && design.sig.trim();
  if (hasHeading) add('h', design.heading, fontStr(headFamily.n, headFamily.hw, base), base, 1.14);
  if (design.ornament && hasHeading && hasQuote) {
    items.push({ kind: 'o', lines: [], font: '', px: quoteSize, lineHeight: 1, height: quoteSize * 1.2 });
    total += quoteSize * 1.2;
  }
  if (hasQuote) add('q', design.quote, fontStr(quoteFamily.n, quoteFamily.bw, quoteSize), quoteSize, 1.38);
  if (hasSig) add('s', design.sig, fontStr(sigFamily.n, sigFamily.bw, base * 0.36), base * 0.36, 1.3);
  const gap = quoteSize * 0.55;
  total += gap * Math.max(0, items.length - 1);
  return { items, total, maxWidth, gap };
}

/**
 * The words' colour: the user's own, the paper's ink, the theme's darkest, white on a photo, or the theme's ink.
 * @param design the design
 * @param layout the front's layout
 * @param theme the occasion's theme
 * @returns a CSS colour
 */
function textColour(design: Design, layout: Layout, theme: Theme): string {
  if (design.customColor) return design.color;
  if (layout.ink === 'frame') return frameInk(design, theme);
  if (layout.ink === 'dark') return darkInk(theme);
  return layout.onPhoto ? '#FFFFFF' : theme.ink;
}

/**
 * Darkens the photo under the words: a gradient from the side the words sit on, else an even shade. The whole card,
 * or just the photo when the card has other things (a calendar's dates) beside it.
 * @param ctx the card's context
 * @param layout the front's layout
 * @param box the card
 * @param design the design
 */
function drawScrim(ctx: CanvasRenderingContext2D, layout: Layout, box: Box, design: Design): void {
  const area = layout.scrimArea ?? { x: box.x - box.e, y: box.y - box.e, w: box.w + 2 * box.e, h: box.h + 2 * box.e };
  let shade: CanvasGradient | string = 'rgba(0,0,0,.3)';
  if (design.vAlign === 'bottom' || design.vAlign === 'top') {
    shade =
      design.vAlign === 'bottom'
        ? ctx.createLinearGradient(0, area.y + area.h * 0.3, 0, area.y + area.h)
        : ctx.createLinearGradient(0, area.y + area.h * 0.7, 0, area.y);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,.62)');
  }
  ctx.fillStyle = shade;
  ctx.fillRect(area.x, area.y, area.w, area.h);
}

/**
 * Where a run of `width` starts so it sits at an anchor with an alignment.
 * @param align the alignment
 * @param anchor the anchor, pixels
 * @param width the run's width, pixels
 * @returns its left edge, pixels
 */
function alignedStart(align: Design['hAlign'], anchor: number, width: number): number {
  if (align === 'left') return anchor;
  if (align === 'right') return anchor - width;
  return anchor - width / 2;
}

/**
 * Where aligned words are anchored in the zone: its left edge, right edge or centre.
 * @param align the alignment
 * @param zone the text zone
 * @returns the anchor's x, pixels
 */
function textAnchor(align: Design['hAlign'], zone: Rect): number {
  if (align === 'left') return zone.x;
  if (align === 'right') return zone.x + zone.w;
  return zone.x + zone.w / 2;
}

/**
 * The ornament between greeting and quote: two rules with a diamond between them.
 * @param ctx the card's context
 * @param item the ornament's block
 * @param top its top, pixels
 * @param anchorX the words' anchor, pixels
 * @param zone the text zone
 * @param colour its colour
 * @param align the words' alignment
 */
function drawOrnament(ctx: CanvasRenderingContext2D, item: TextItem, top: number, anchorX: number, zone: Rect, colour: string, align: Design['hAlign']): void {
  const width = Math.min(zone.w * 0.34, item.px * 7);
  const middle = top + item.height / 2;
  const left = alignedStart(align, anchorX, width);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = Math.max(1, item.px * 0.07);
  ctx.beginPath();
  ctx.moveTo(left, middle);
  ctx.lineTo(left + width * 0.42, middle);
  ctx.moveTo(left + width * 0.58, middle);
  ctx.lineTo(left + width, middle);
  ctx.stroke();
  const diamondX = left + width / 2;
  const half = item.px * 0.24;
  ctx.beginPath();
  ctx.moveTo(diamondX, middle - half);
  ctx.lineTo(diamondX + half, middle);
  ctx.lineTo(diamondX, middle + half);
  ctx.lineTo(diamondX - half, middle);
  ctx.closePath();
  ctx.fill();
}

/**
 * The words fitted to the zone: tall, narrow zones (a column beside a photo strip) start bigger and let the greeting
 * wrap, instead of shrinking it to fit one line across a narrow column; then the size steps down until they fit.
 * @param ctx the card's context
 * @param zone the text zone
 * @param layout the front's layout
 * @param design the design
 * @returns the greeting's size and the words laid out at it
 */
function fitText(ctx: CanvasRenderingContext2D, zone: Rect, layout: Layout, design: Design): { base: number; laid: TextLayout } {
  const tall = Math.min(1, Math.max(0, (zone.h / zone.w - 0.8) / 1.2));
  let base = Math.min(zone.w * (0.13 + 0.06 * tall), zone.h * (layout.textFill ?? 0.32)) * (layout.textScaled ? 1 : design.textScale);
  let laid = layoutText(ctx, zone, base, design);
  for (let step = 0; step < 50 && (laid.total > zone.h || laid.maxWidth > zone.w * 1.001); step++) {
    base *= 0.93;
    laid = layoutText(ctx, zone, base, design);
  }
  return { base, laid };
}

/**
 * The top of the words in the zone for their vertical alignment (caption strips centre them).
 * @param layout the front's layout
 * @param design the design
 * @param zone the text zone
 * @param total the words' height, pixels
 * @returns pixels
 */
function textTop(layout: Layout, design: Design, zone: Rect, total: number): number {
  const align = layout.textCenter ? 'middle' : design.vAlign;
  if (align === 'top') return zone.y;
  if (align === 'bottom') return zone.y + zone.h - total;
  return zone.y + (zone.h - total) / 2;
}

/**
 * Draws the front's words in the layout's text zone, over a scrim when they sit on a photo.
 * @param ctx the card's context
 * @param layout the front's layout
 * @param theme the occasion's theme
 * @param box the card
 * @param design the design (a calendar page's: calendarWords)
 */
export function drawText(ctx: CanvasRenderingContext2D, layout: Layout, theme: Theme, box: Box, design: Design): void {
  const zone = layout.text;
  if (!zone || zone.w <= 4 || zone.h <= 4) return;
  const { base, laid } = fitText(ctx, zone, layout, design);
  const { onPhoto } = layout;
  const colour = textColour(design, layout, theme);
  if (onPhoto && design.scrim) drawScrim(ctx, layout, box, design);
  let top = textTop(layout, design, zone, laid.total);
  const anchorX = textAnchor(design.hAlign, zone);
  ctx.save();
  ctx.textAlign = design.hAlign;
  ctx.textBaseline = 'middle';
  if (onPhoto) {
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = base * 0.08;
  }
  laid.items.forEach((item, index) => {
    if (item.kind === 'o') {
      drawOrnament(ctx, item, top, anchorX, zone, onPhoto && !design.customColor ? '#FFFFFF' : theme.accent, design.hAlign);
    } else {
      ctx.font = item.font;
      ctx.fillStyle = colour;
      item.lines.forEach((line, lineIndex) => {
        ctx.fillText(line, anchorX, top + item.px * item.lineHeight * (lineIndex + 0.5));
      });
    }
    top += item.height + (index < laid.items.length - 1 ? laid.gap : 0);
  });
  ctx.restore();
}

/**
 * The words on a calendar page. Each month uses its own caption in place of the greeting (an empty caption keeps
 * the greeting). Above the month there is room for one line only; on the photo the quote and signature can follow.
 * @param design the design
 * @param month the page's month, 0–11
 * @param yearPage whether the page shows the whole year (no caption)
 * @param onPhoto whether the words sit on the photo
 * @returns the design with the page's words
 */
export function calendarWords(design: Design, month: number, yearPage: boolean, onPhoto: boolean): Design {
  const caption = yearPage ? '' : (design.cal.captions.at(month) ?? '').trim();
  const head = caption || (design.showHeading ? design.heading.trim() : '');
  const headFont = design.cal.capFont || design.headFont;
  if (onPhoto) return { ...design, heading: head, showHeading: !!head, headFont };
  const line = head || (design.showQuote ? design.quote.trim() : '');
  // One line above the month: it lines up with the month title, and a quote standing in for it keeps the quote font.
  return {
    ...design,
    heading: line,
    showHeading: !!line,
    headFont: head ? headFont : design.quoteFont,
    hAlign: design.cal.titleAlign === 'left' ? 'left' : 'center',
    showQuote: false,
    showSig: false,
    ornament: false,
  };
}
