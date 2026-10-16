import { fontDef, fontStr } from '../data/fonts';

/* Text on printed cards: wrapping, fitting a size, the label typeface, letter spacing and cap height. */

/** A typeface at a size: the CSS font string for `px` pixels. */
export type FontFace = (px: number) => string;

/**
 * Wraps text into lines no wider than a width, in the context's current font. Paragraphs (newlines) stay apart; an
 * empty paragraph is an empty line; a word wider than the width gets a line of its own.
 * @param ctx the context, its font set
 * @param text the text
 * @param maxWidth the widest line, pixels
 * @returns the lines
 */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const longer = line ? line + ' ' + word : word;
      if (!line || ctx.measureText(longer).width <= maxWidth) line = longer;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** How `shrinkFont` steps down. */
export interface ShrinkSteps {
  /** Each step's scale, such as 0.93. */
  factor: number;
  /** Stops once the size is at or below this (default: no limit). */
  minPx?: number;
  /** Stops after this many steps (default: no limit). */
  maxSteps?: number;
}

/**
 * Sets the context's font at a size, then shrinks it step by step until the text fits (or a limit is reached).
 * @param ctx the context; its font is left at the size returned
 * @param face the typeface
 * @param startPx the size to start from, pixels
 * @param fits whether the text fits at a size, the font already set (it may measure or wrap)
 * @param steps how to step down
 * @returns the size used, pixels
 */
export function shrinkFont(
  ctx: CanvasRenderingContext2D,
  face: FontFace,
  startPx: number,
  fits: (px: number) => boolean,
  steps: ShrinkSteps,
): number {
  const { factor, minPx = -Infinity, maxSteps = Infinity } = steps;
  let px = startPx;
  ctx.font = face(px);
  // `fits` first: it may wrap the text at the size just set, and the caller draws those lines.
  for (let step = 0; !fits(px) && step < maxSteps && px > minPx; step++) {
    px *= factor;
    ctx.font = face(px);
  }
  return px;
}

/**
 * The face of printed labels and small print ("POST CARD", "To", "PIN", the Instagram tag, credits): the chosen
 * family at its weight nearest the one asked for, or Hind.
 * @param font the chosen family (empty: Hind)
 * @param weight the weight wanted
 * @returns the typeface
 */
export function labelFace(font: string, weight: number): FontFace {
  if (!font) return (px) => `${String(weight)} ${String(px)}px "Hind",sans-serif`;
  const family = fontDef(font);
  const nearest = family.w.reduce(
    (best, each) => (Math.abs(each - weight) < Math.abs(best - weight) ? each : best),
    family.w.at(0) ?? weight,
  );
  return (px) => fontStr(family.n, nearest, px);
}

/**
 * Sets the letter spacing where the canvas has it (older canvases lack it; spacing is decoration, so it is skipped).
 * @param ctx the context
 * @param spacing a CSS length, such as "2px"
 */
export function setLetterSpacing(ctx: CanvasRenderingContext2D, spacing: string): void {
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
}

/**
 * The cap height of the current font: centring on it keeps every title on the same baseline, whatever its letters.
 * @param ctx the context, its font set
 * @returns pixels
 */
export const capHeight = (ctx: CanvasRenderingContext2D): number => ctx.measureText('HJMNS').actualBoundingBoxAscent;
