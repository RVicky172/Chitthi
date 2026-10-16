import { MONTHS, productOf } from '../data/products';
import type { Design, RenderInput, Side } from '../types';
import { calMonth } from './calendarDraw';
import { calPages, cardMM, sizeOf } from './design';

/*
 * A design's printed pages, how its cards sit on a sheet, the export summary and the files' base name: what the
 * studio shows before anything is built. The builders (PDF, PNG, print pack) are in export.ts, which loads on export.
 */

/** Each sheet: width and height (mm) and its name. */
export const SHEETS: Record<Design['exp']['sheet'], [number, number, string]> = {
  a4: [210, 297, 'A4'],
  a3: [297, 420, 'A3'],
  '1319': [330.2, 482.6, '13×19 in'],
  letter: [215.9, 279.4, 'Letter'],
};

/** One printed side: postcards and frames have one front; calendars have a front page per month. */
export interface PrintPage {
  side: Side;
  page: number;
  /** Used in file names, e.g. "front", "front-03-march", "back". */
  tag: string;
  label: string;
}

/**
 * A month's name.
 * @param month 0–11
 * @returns the name
 */
export const monthName = (month: number): string => MONTHS[month] ?? '';

/**
 * A calendar's front page.
 * @param design the design
 * @param page the page, 0-based
 * @returns the page
 */
function calendarPage(design: Design, page: number): PrintPage {
  const { year, month } = calMonth(design, page);
  const strip = design.layout === 'cal-strip';
  return {
    side: 'front',
    page,
    tag: strip ? 'front-year' : `front-${String(page + 1).padStart(2, '0')}-${monthName(month).toLowerCase()}`,
    label: strip ? 'Year strip' : `${monthName(month)} ${year}`,
  };
}

/**
 * The printed sides of a design.
 * @param design the design
 * @returns the fronts (a calendar's per month), then the back when it is printed
 */
export function pagesOf(design: Design): PrintPage[] {
  const pages: PrintPage[] = [];
  const count = calPages(design);
  for (let page = 0; page < count; page++) {
    if (design.product === 'calendar') pages.push(calendarPage(design, page));
    else pages.push({ side: 'front', page: 0, tag: 'front', label: 'Front' });
  }
  if (design.exp.back && design.product !== 'magnet') pages.push({ side: 'back', page: 0, tag: 'back', label: productOf(design.product).backLabel });
  return pages;
}

/** How cards sit on a sheet. */
export interface Imposition {
  cols: number;
  rows: number;
  /** Turned sideways (more fit that way). */
  rot: boolean;
  /** A card with its bleed, mm. */
  cw: number;
  ch: number;
  /** Between cards, mm. */
  gap: number;
  /** The sheet, mm. */
  SW: number;
  SH: number;
  /** The bleed, mm. */
  b: number;
  /** The card's trim size as placed, mm. */
  w: number;
  h: number;
}

/**
 * How many cards fit on the chosen sheet (tries both rotations).
 * @param design the design
 * @returns the imposition
 */
export function nup(design: Design): Imposition {
  const { w, h } = cardMM(design);
  const bleed = +design.exp.bleed;
  const gap = design.exp.marks ? 10 : 4;
  const [sheetWidth, sheetHeight] = SHEETS[design.exp.sheet];
  const margin = 8;
  const fit = (cardWidth: number, cardHeight: number) => ({
    cols: Math.max(0, Math.floor((sheetWidth - 2 * margin + gap) / (cardWidth + gap))),
    rows: Math.max(0, Math.floor((sheetHeight - 2 * margin + gap) / (cardHeight + gap))),
  });
  const upright = fit(w + 2 * bleed, h + 2 * bleed);
  const turned = fit(h + 2 * bleed, w + 2 * bleed);
  const rot = turned.cols * turned.rows > upright.cols * upright.rows;
  return {
    ...(rot ? turned : upright),
    rot,
    cw: rot ? h + 2 * bleed : w + 2 * bleed,
    ch: rot ? w + 2 * bleed : h + 2 * bleed,
    gap,
    SW: sheetWidth,
    SH: sheetHeight,
    b: bleed,
    w: rot ? h : w,
    h: rot ? w : h,
  };
}

/**
 * A number to one decimal.
 * @param value the number
 * @returns it, rounded
 */
export const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * A bleed as words.
 * @param bleed mm
 * @returns e.g. "3 mm", or "⅛ in (3.175 mm)"
 */
export const bleedText = (bleed: number): string => (Math.abs(bleed - 3.175) < 1e-9 ? '⅛ in (3.175 mm)' : `${bleed} mm`);

/**
 * The sheet's line of the export summary.
 * @param design the design
 * @returns how many fit per sheet, or that it is too big
 */
function sheetSummary(design: Design): string {
  const imposition = nup(design);
  const name = SHEETS[design.exp.sheet][2];
  const count = imposition.cols * imposition.rows;
  if (!count) return ` This is too big for ${name}. Pick a larger sheet.`;
  return ` ${count} per ${name} sheet${imposition.rot ? ', turned sideways' : ''}.`;
}

/**
 * The export panel's summary: sizes, pixels, pages, sheets.
 * @param input the design and its photos
 * @returns a paragraph
 */
export function exportSummary(input: RenderInput): string {
  const design = input.d;
  const { w, h } = cardMM(design);
  const bleed = +design.exp.bleed;
  const dpi = +design.exp.dpi;
  const width = Math.round(((w + 2 * bleed) / 25.4) * dpi);
  const height = Math.round(((h + 2 * bleed) / 25.4) * dpi);
  const pages = pagesOf(design).length;
  const withBleed = bleed ? ` (trim size plus ${bleedText(bleed)} bleed on every edge)` : '';
  let summary = `Each side: ${round1(w + 2 * bleed)} × ${round1(h + 2 * bleed)} mm${withBleed}, ${width} × ${height} px at ${dpi} dpi. ${pages} page${pages > 1 ? 's' : ''} in total.`;
  if (design.exp.format === 'sheet') summary += sheetSummary(design);
  if (!input.photos.length) summary += ' No photos yet, so photo areas will show the background.';
  return summary;
}

/**
 * The files' base name.
 * @param design the design
 * @returns from the design's name, else its product, occasion, size and orientation
 */
export function baseName(design: Design): string {
  const name = design.designName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (name) return `chitthi-${name}-${sizeOf(design).id}`;
  return `chitthi-${design.product}-${design.useOccasion ? design.themeId : 'plain'}-${sizeOf(design).id}-${design.orient === 'landscape' ? 'horizontal' : 'vertical'}`;
}
