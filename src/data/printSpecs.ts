import type { ProductId } from '../types';

/*
 * What a print shop needs to quote and produce each category: material, weight, finish, colour sides and finishing.
 * One source for the quote documents (engine/quote.ts), the print spec in every print pack, and docs/PRINT-QUOTE.md.
 * Values are the usual Indian print-shop terms (gsm, art card, 4/4 = full colour both sides).
 */

export type QuoteCategory = ProductId | 'envelope';

export interface PrintSpecDef {
  category: QuoteCategory;
  title: string;
  /** What one piece is, for pricing per piece. */
  piece: string;
  stock: string;
  weight: string;
  finish: string;
  /** Colour sides, e.g. 4/4 = CMYK front and back. */
  colour: string;
  finishing: string[];
  /** Short line for size tables and file notes. */
  summary: string;
}

/** Quantities printers are asked to price. */
export const QUOTE_QTY = [1, 10, 25, 50, 100, 250, 500];

export const PRINT_SPECS: Record<QuoteCategory, PrintSpecDef> = {
  postcard: {
    category: 'postcard',
    title: 'Postcards and Instax-style prints',
    piece: 'One card, printed both sides',
    stock: 'Art card. Matt or uncoated back so it takes pen and postmarks',
    weight: '300–350 gsm (Instax-style: 300 gsm)',
    finish: 'Matt or silk. Optional matt lamination on the front only',
    colour: '4/4: full colour (CMYK) front and back',
    finishing: [
      'Trim to size: files have 3 mm bleed on every edge and crop marks',
      'Instax-style sizes: 3 mm rounded corners',
      'Sheet PDF option: many up on A4/A3/13×19 in, backs mirrored for long-edge duplex',
    ],
    summary: '300–350 gsm art card, 4/4, trimmed',
  },
  calendar: {
    category: 'calendar',
    title: 'Calendars (wall and desk)',
    piece: 'One calendar: 12 month pages + year-at-a-glance back page, bound (Year strip: one page)',
    stock: 'Art paper, silk or matt; back page on card',
    weight: 'Pages 170–250 gsm; back page 300 gsm. Desk stand: 800–1000 gsm greyboard',
    finish: 'Silk or matt (no lamination on pages you write on)',
    colour: '4/0: full colour, one side per page',
    finishing: [
      'Trim each page to size (3 mm bleed on every edge)',
      'Wall: Wire-O binding on the top edge, with a hanger hook and a punched hanging hole',
      'Desk (A5 desk size): Wire-O bound onto a tent stand',
      'Single-month and Year strip designs: one page, no binding (optional hanging hole)',
    ],
    summary: '170–250 gsm silk, 4/0, Wire-O bound',
  },
  frame: {
    category: 'frame',
    title: 'Photo frame prints',
    piece: 'One print (frame not included unless quoted separately)',
    stock: 'Photo paper (lustre or glossy) or fine-art matte paper',
    weight: '240–300 gsm',
    finish: 'Lustre, glossy or fine-art matte. No lamination: it sits behind glass',
    colour: '4/0: full colour, front only (optional dedication label on the back)',
    finishing: ['Trim exactly to the frame size so it lies flat', 'Optional: quote for a frame, mount or ready-to-hang finish'],
    summary: '240–300 gsm photo paper, 4/0',
  },
  magnet: {
    category: 'magnet',
    title: 'Fridge magnets',
    piece: 'One magnet',
    stock: 'Art paper laminated onto flexible magnetic sheet, or printable magnetic sheet. Round sizes: button badges with a magnet back',
    weight: 'Print 250 gsm + magnetic sheet 0.5–0.76 mm',
    finish: 'Gloss or matt lamination',
    colour: '4/0: full colour, front only',
    finishing: [
      'Die-cut or trim to size, 3 mm rounded corners',
      'Round 58 mm / 75 mm: badge press with a magnet back (the bleed wraps round the edge)',
      'Sheet PDF option: many up on A4',
    ],
    summary: 'Laminated print on 0.5–0.76 mm magnetic sheet',
  },
  envelope: {
    category: 'envelope',
    title: 'Matching envelopes',
    piece: 'One envelope',
    stock: 'Uncoated text paper, or kraft',
    weight: 'Ready-made: 100–120 gsm. Fold-your-own template: 120–160 gsm',
    finish: 'Uncoated (takes pen and ink)',
    colour: '4/0 front; the back carries the flap design and the Chitthi mark',
    finishing: [
      'Either print on ready-made envelopes of the listed size (envelope PDF: page 1 front, page 2 back)',
      'or print the flat template, die-cut on the solid line and fold on the dashed lines',
      'Gummed or peel-and-seal flap',
    ],
    summary: '100–120 gsm uncoated, 4/0',
  },
};
