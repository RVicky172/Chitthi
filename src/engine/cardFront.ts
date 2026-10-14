import type { Box, Design, Layout, RenderInput, RenderOpts, Theme } from '../types';
import { hexA, lum, mix, rng } from './color';
import { calMonth, drawMonth, drawMonthNumber, drawYearGrid, drawYearTitle } from './calendarDraw';
import { darkInk, frameInk, paperColour, postmarkYear, resolveTheme } from './design';
import { calendarWords, drawText } from './frontText';
import { computeLayout } from './layout';
import { PAT } from './patterns';
import { drawGlass, drawLayoutArt, drawMatBevels, drawSlot } from './photoSlots';
import { drawBadge, drawFrontInsta, drawPostmark, drawStamp, drawStampText } from './postalDecor';
import { artworkShown, cardUnit, drawThemeBg, fillWithBleed } from './themeBackground';

/*
 * A card's front, bottom first: the background (occasion, or a frame's paper), the stamp, what sits behind the photos,
 * the photo slots, mat bevels, postmark, glass and band, the occasion's overlay and frame lines, the words, the
 * calendar's parts, the badge's lettering and the Instagram tag.
 */

/** The front being drawn. */
interface FrontScene {
  ctx: CanvasRenderingContext2D;
  box: Box;
  design: Design;
  theme: Theme;
  layout: Layout;
  unit: number;
}

/**
 * The background: a frame's paper (or the occasion), or the occasion's background, then the paper panel.
 * @param scene the front
 */
function drawBackground(scene: FrontScene): void {
  const { ctx, box, design, theme, layout, unit } = scene;
  if (layout.frame) {
    if (design.frame === 'occasion') drawThemeBg(ctx, box, theme, artworkShown(design));
    else {
      ctx.fillStyle = paperColour(design);
      fillWithBleed(ctx, box);
    }
  } else if (layout.bg) drawThemeBg(ctx, box, theme, artworkShown(design));
  if (layout.paper) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.3)';
    ctx.shadowBlur = unit * 2.4;
    ctx.shadowOffsetY = unit * 0.8;
    ctx.fillStyle = design.frame === 'occasion' ? theme.bg1 : paperColour(design);
    ctx.fillRect(layout.paper.x, layout.paper.y, layout.paper.w, layout.paper.h);
    ctx.restore();
  }
}

/**
 * Over the photos: the glass panel, the words' band, the occasion's overlay artwork and the frame lines.
 * @param scene the front
 * @param hasPhotos whether the card has photos (the overlay needs them)
 */
function drawOverPhotos(scene: FrontScene, hasPhotos: boolean): void {
  const { ctx, box, design, theme, layout, unit } = scene;
  if (layout.glass) drawGlass(ctx, layout.glass, unit);
  if (layout.band) {
    ctx.fillStyle = design.product === 'calendar' ? hexA(paperColour(design), 0.93) : hexA(theme.bg1, 0.94);
    ctx.fillRect(layout.band.x, layout.band.y, layout.band.w, layout.band.h);
  }
  if (layout.overlay && design.useOccasion && design.decor && hasPhotos && theme.over) {
    ctx.save();
    PAT[theme.over](ctx, box, unit, theme, rng(theme.id + 'o'), 'over');
    ctx.restore();
  }
  if (layout.frameLine) strokeInset(ctx, box, layout.frameLine, 'rgba(255,255,255,.9)', unit * 0.45);
  if (layout.hairline) strokeInset(ctx, box, layout.hairline, hexA(theme.accent, 0.55), Math.max(1, unit * 0.18));
}

/**
 * A line around the card, inset from the trim.
 * @param ctx the card's context
 * @param box the card
 * @param inset how far inside the trim, pixels
 * @param colour the line's colour
 * @param width the line's width, pixels
 */
function strokeInset(ctx: CanvasRenderingContext2D, box: Box, inset: number, colour: string, width: number): void {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.strokeRect(box.x + inset, box.y + inset, box.w - 2 * inset, box.h - 2 * inset);
  ctx.restore();
}

/**
 * The words, then a calendar's parts: the big month number, the month page, the Year strip.
 * @param scene the front
 * @param page the calendar page
 */
function drawWordsAndCalendar(scene: FrontScene, page: number): void {
  const { ctx, box, design, theme, layout } = scene;
  const shown = calMonth(design, page);
  const ink = layout.ink === 'dark' ? darkInk(theme) : frameInk(design, theme);
  // A pale accent (a yellow theme) disappears on white paper: deepen it for the year, Sundays and the number.
  const accent = lum(theme.accent) > 0.6 && lum(ink) < 0.5 ? mix(theme.accent, ink, 0.45) : theme.accent;
  // "Big number" is set flush left: the number, the month name and the caption share one left edge.
  const pageDesign: Design = layout.calNum ? { ...design, hAlign: 'left', cal: { ...design.cal, titleAlign: 'left' } } : design;
  const words = design.product === 'calendar' ? calendarWords(pageDesign, shown.month, !!layout.calYear, layout.onPhoto) : design;
  drawText(ctx, layout, theme, box, words);
  if (layout.calNum) drawMonthNumber(ctx, layout.calNum, shown.month, design, accent);
  if (layout.calGrid) drawMonth(ctx, { title: layout.calTitle ?? null, grid: layout.calGrid }, shown, pageDesign, { ink, accent });
  if (layout.calYear) {
    if (layout.calTitle) drawYearTitle(ctx, layout.calTitle, design, ink);
    drawYearGrid(ctx, layout.calYear, design, { ink, accent });
  }
}

/**
 * Draws a card's front.
 * @param ctx the card's context
 * @param box the card
 * @param input the design and its photos
 * @param opts the layout to use, the calendar page, the empty-slot hint, thumbnail
 * @returns the layout drawn
 */
export function drawFront(ctx: CanvasRenderingContext2D, box: Box, input: RenderInput, opts: RenderOpts): Layout {
  const { d: design, photos } = input;
  const theme = resolveTheme(design);
  const unit = cardUnit(box);
  const layout = computeLayout(opts.layout ?? design.layout, box, design);
  const scene: FrontScene = { ctx, box, design, theme, layout, unit };
  drawBackground(scene);
  if (layout.stamp) drawStamp(ctx, layout.stamp, theme, box, unit, artworkShown(design));
  drawLayoutArt(ctx, layout, box, theme, unit);
  const page = design.product === 'calendar' ? (opts.page ?? 0) : 0;
  const slotScene = { theme, box, unit, opts, bgShown: layout.bg || layout.frame, input, page, count: layout.slots.length };
  layout.slots.forEach((slot, index) => {
    drawSlot(ctx, slot, index, slotScene);
  });
  if (layout.mat) drawMatBevels(ctx, layout, unit);
  if (layout.stamp && layout.post) {
    drawStampText(ctx, layout.stamp, theme, unit);
    drawPostmark(ctx, layout.post, theme, unit, postmarkYear(design));
  }
  drawOverPhotos(scene, photos.length > 0);
  drawWordsAndCalendar(scene, page);
  if (layout.arc) drawBadge(ctx, layout, theme, design);
  const insta = design.insta.replace(/[@\s]/g, '');
  if (insta && !opts.thumb) drawFrontInsta(ctx, layout, box, unit, insta, darkInk(theme), design.instaFont);
  return layout;
}
