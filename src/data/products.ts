import type { Design, ProductId, SizeDef } from '../types';
import { SIZES } from './sizes';

export interface ProductDef {
  id: ProductId;
  name: string;
  /** Label in the studio's product switcher, where space is tight. */
  short: string;
  /** One line for the landing page and the product switcher. */
  blurb: string;
  /** What the back side holds for this product. */
  backLabel: string;
  /** Paper and finishing advice written into the print spec. */
  paper: string;
  /** Settings a fresh design of this product starts with. */
  defaults: Pick<Design, 'sizeId' | 'orient' | 'layout' | 'frame'> & { exp: Partial<Design['exp']> };
}

export const PRODUCTS: ProductDef[] = [
  {
    id: 'postcard',
    short: 'Postcard',
    name: 'Postcard',
    blurb: 'Festival, birthday and travel postcards with a real postal back.',
    backLabel: 'Message and address',
    paper: '300–350 gsm card. Matte or uncoated on the back so it takes handwriting and postmarks.',
    defaults: { sizeId: '4x6', orient: 'landscape', layout: 'arch', frame: 'white', exp: { back: true } },
  },
  {
    id: 'calendar',
    short: 'Calendar',
    name: 'Calendar',
    blurb: 'A month or a whole year of your photos, with a year-at-a-glance back page.',
    backLabel: 'Year at a glance',
    paper: '200–250 gsm silk or matte. Wall calendars: wire-bind on the top edge, drill a hanging hole. Desk: wire-bind onto a tent stand.',
    defaults: { sizeId: 'cal-a4', orient: 'portrait', layout: 'cal-top', frame: 'white', exp: { back: true } },
  },
  {
    id: 'frame',
    short: 'Frame',
    name: 'Photo frame',
    blurb: 'Frame-ready prints in standard frame sizes, with a mat border and caption.',
    backLabel: 'Dedication label',
    paper: 'Photo paper (lustre or glossy, 250–300 gsm) or fine-art matte. Trim exactly to size so the print sits flat behind the glass.',
    defaults: { sizeId: 'f8x10', orient: 'portrait', layout: 'frame-single', frame: 'white', exp: { back: false } },
  },
  {
    id: 'magnet',
    short: 'Magnet',
    name: 'Fridge magnet',
    blurb: 'Photo magnets in square, card and round sizes, printed many to a sheet.',
    backLabel: 'Magnetic backing',
    paper:
      'Photo paper (200–250 gsm, glossy or lustre) laminated onto 0.5–0.76 mm flexible magnetic sheet, or print straight onto printable magnet sheet. Trim, then round the corners with a 3 mm corner punch. Button magnets: the bleed wraps around the edge of the badge.',
    defaults: { sizeId: 'm2x3', orient: 'portrait', layout: 'mag-full', frame: 'white', exp: { back: false, format: 'sheet', sheet: 'a4' } },
  },
];

export const productOf = (id: ProductId): ProductDef => PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];
export const sizesFor = (id: ProductId): SizeDef[] => SIZES.filter((s) => (s.products ?? ['postcard']).includes(id));

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
