import { PRINT_SPECS } from '../data/printSpecs';
import { cardMM } from '../engine/design';
import { buildPack, buildPDF } from '../engine/export';
import { slotCount } from '../engine/layout';
import { nup } from '../engine/printPages';
import { photoDpi, renderCard } from '../engine/render';
import { aiCreditOf, isPexels, shortName } from '../lib/credits';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { getState } from '../state/store';
import type { Design, Photo } from '../types';
import { numberArg, numberSchema, objectSchema, ok, stringArg, stringSchema, toBlob, type AgentTool } from './common';

/* Checks and output: the print check, a preview image, the print pack, the PDF, the quote request, the paper specs. */

/** One finding of check_design. */
interface DesignIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Whether the front has any words showing.
 * @param design the design
 * @returns true when a greeting, quote or signature shows
 */
const hasWords = (design: Design): boolean =>
  !!((design.showHeading && design.heading.trim()) || (design.showQuote && design.quote.trim()) || (design.showSig && design.sig.trim()));

/**
 * Notes about the photos: empty slots, soft prints, Pexels photos printed almost unaltered.
 * @param design the design
 * @param photos its photos
 * @returns the notes
 */
function photoIssues(design: Design, photos: Photo[]): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const slots = slotCount(design.layout, design);
  if (slots > photos.length)
    issues.push({
      level: design.product === 'calendar' ? 'warning' : 'error',
      message: `The layout holds ${slots} photo(s) but the design has ${photos.length}; empty slots print the background.`,
    });
  photoDpi({ d: design, photos }).forEach((dpi, index) => {
    const photo = photos.at(index);
    if (dpi !== null && dpi < 150 && photo)
      issues.push({ level: 'warning', message: `Photo ${index + 1} (“${shortName(photo.name)}”) is ${dpi} dpi here and may print soft. Use a larger photo or a smaller slot.` });
  });
  const isNearlyUnaltered = ['full', 'mag-full'].includes(design.layout) || (design.product === 'frame' && design.layout !== 'frame-caption');
  if (photos.some((photo) => isPexels(photo.name)) && !hasWords(design) && isNearlyUnaltered)
    issues.push({
      level: 'warning',
      message: 'A Pexels photo is printed almost unaltered. Fine for personal use; to sell prints, add words, a layout or artwork (Pexels license).',
    });
  return issues;
}

/**
 * Notes about the words, the year, the sheet, the bleed and the credits.
 * @param design the design
 * @param photos its photos
 * @returns the notes
 */
function printIssues(design: Design, photos: Photo[]): DesignIssue[] {
  const issues: DesignIssue[] = [];
  if (!hasWords(design) && design.product !== 'frame') issues.push({ level: 'info', message: 'The front has no words.' });
  if (design.product === 'calendar' && design.cal.year < new Date().getFullYear())
    issues.push({ level: 'warning', message: `The calendar is for ${design.cal.year}, a past year.` });
  if (design.exp.format === 'sheet') {
    const fit = nup(design);
    if (!(fit.cols * fit.rows)) issues.push({ level: 'error', message: `The piece doesn’t fit on the chosen ${design.exp.sheet} sheet.` });
  }
  if (Number(design.exp.bleed) === 0 && design.product !== 'magnet') issues.push({ level: 'info', message: 'No bleed: a print shop usually needs 3 mm.' });
  const credits = photos.filter((photo) => isPexels(photo.name) || aiCreditOf(photo.name)).length;
  if (credits) issues.push({ level: 'info', message: `${credits} photo(s) need credits or AI disclosure; the print pack includes PHOTO-CREDITS.txt.` });
  return issues;
}

/** The check and output tools. */
export const OUTPUT_TOOLS: AgentTool[] = [
  {
    name: 'check_design',
    title: 'Check the design for print',
    description:
      'Finds problems before printing: empty photo slots, photos that will print soft, Pexels photos printed unaltered, missing words, sheet fit and credits to include.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () => {
      const { design, photos } = getState();
      const issues = [...photoIssues(design, photos), ...printIssues(design, photos)];
      return ok(issues.length ? `${issues.length} note(s).` : 'No problems found.', issues);
    },
  },
  {
    name: 'render_preview',
    title: 'Render a preview image',
    description: 'A PNG preview of the front or back (calendars: the current month page) to look at, at most 1024 px on the long side.',
    inputSchema: objectSchema({
      side: stringSchema('front or back', { enum: ['front', 'back'] }),
      maxPx: numberSchema('Long side in pixels, 256–1024', { minimum: 256, maximum: 1024 }),
    }),
    readOnly: true,
    run: async (args) => {
      const { design, photos, ui } = getState();
      await ensureFonts(fontsFor(design));
      const { w: width, h: height } = cardMM(design);
      const longSide = Math.min(1024, Math.max(256, numberArg(args.maxPx, 900)));
      const side = stringArg(args.side) === 'back' ? 'back' : 'front';
      const canvas = document.createElement('canvas');
      renderCard(canvas, side, longSide / Math.max(width, height), 0, { d: design, photos }, { page: ui.calPage });
      const blob = await toBlob(canvas);
      canvas.width = canvas.height = 0;
      return { text: `${side === 'back' ? 'Back' : 'Front'} of the ${design.product}.`, image: blob };
    },
  },
  {
    name: 'export_print_pack',
    title: 'Export the print pack',
    description:
      'Writes the complete print pack (PDF with bleed and crop marks, PNGs unless turned off, envelope files, quote request, spec, photo credits) as a ZIP into the agent output folder.',
    inputSchema: objectSchema(),
    run: async () => {
      const { design, photos } = getState();
      await ensureFonts(fontsFor(design));
      const pack = await buildPack({ d: design, photos });
      return { text: `Print pack ready: ${pack.name}.`, files: [{ name: pack.name, blob: pack.blob }] };
    },
  },
  {
    name: 'export_pdf',
    title: 'Export the print PDF',
    description: 'Writes the print PDF: one page per side at the exact size ("pdf"), or many pieces on one sheet ("sheet", using the design’s sheet size).',
    inputSchema: objectSchema({ format: stringSchema('pdf or sheet', { enum: ['pdf', 'sheet'] }) }),
    run: async (args) => {
      const { design, photos } = getState();
      await ensureFonts(fontsFor(design));
      const file = await buildPDF({ d: design, photos }, stringArg(args.format) === 'sheet' ? 'sheet' : 'pdf');
      return { text: `PDF ready: ${file.name}.`, files: [{ name: file.name, blob: file.blob }] };
    },
  },
  {
    name: 'export_quote_request',
    title: 'Export a quote request',
    description: 'Writes a QUOTE-REQUEST.pdf for print shops: previews, size, paper, finishing and a price grid by quantity.',
    inputSchema: objectSchema(),
    run: async () => {
      const { design, photos } = getState();
      const { buildQuoteRequest } = await import('../engine/quote');
      const file = await buildQuoteRequest({ d: design, photos });
      return { text: `Quote request ready: ${file.name}.`, files: [{ name: file.name, blob: file.blob }] };
    },
  },
  {
    name: 'print_specs',
    title: 'Paper and finishing specs',
    description: 'The paper, weight, finish and finishing Chitthi recommends to print shops for each product and envelopes.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () => ok('Print specs', PRINT_SPECS),
  },
];
