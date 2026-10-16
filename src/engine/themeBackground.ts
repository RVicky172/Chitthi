import type { Box, Design, Theme } from '../types';
import { rng } from './color';
import { PAT } from './patterns';

/*
 * What every printed side starts from: the card's drawing unit, a fill over the whole card with its bleed, and the
 * occasion's background (its gradient and procedural artwork, engine/patterns.ts).
 */

/**
 * The card's drawing unit: 1 % of its shorter side, so every printed size draws alike.
 * @param box the card (trim box)
 * @returns the unit, canvas pixels
 */
export const cardUnit = (box: Box): number => Math.min(box.w, box.h) / 100;

/**
 * Fills the whole card, its bleed included, with the current fill style.
 * @param ctx the card's context
 * @param box the card (trim box and bleed)
 */
export function fillWithBleed(ctx: CanvasRenderingContext2D, box: Box): void {
  const bleed = box.e;
  ctx.fillRect(box.x - bleed, box.y - bleed, box.w + 2 * bleed, box.h + 2 * bleed);
}

/**
 * Whether a design shows its occasion's artwork.
 * @param design the design
 * @returns true when the occasion and its artwork are both on
 */
export const artworkShown = (design: Design): boolean => design.useOccasion && design.artwork;

/**
 * Draws an occasion's background over the whole card and its bleed: its gradient and, when wanted, its artwork.
 * @param ctx the card's context
 * @param box the card (trim box and bleed)
 * @param theme the occasion's theme
 * @param withArt whether to draw the theme's background artwork
 */
export function drawThemeBg(ctx: CanvasRenderingContext2D, box: Box, theme: Theme, withArt: boolean): void {
  const bleed = box.e;
  const unit = cardUnit(box);
  const gradient = ctx.createLinearGradient(box.x - bleed, box.y - bleed, box.x + box.w + bleed, box.y + box.h + bleed);
  gradient.addColorStop(0, theme.bg1);
  gradient.addColorStop(1, theme.bg2);
  ctx.fillStyle = gradient;
  fillWithBleed(ctx, box);
  if (!withArt) return;
  for (const pattern of theme.bgP) {
    ctx.save();
    PAT[pattern](ctx, box, unit, theme, rng(theme.id + pattern), 'bg');
    ctx.restore();
  }
}
