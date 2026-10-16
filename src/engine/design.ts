import { layoutsFor } from '../data/layouts';
import { PRODUCTS, productOf, sizesFor } from '../data/products';
import { SIZES } from '../data/sizes';
import { PLAIN, TH, themeById } from '../data/themes';
import { hasFont } from '../data/fonts';
import type { Design, SizeDef, Theme } from '../types';
import { lum, mix, toHex } from './color';
import { firstOf, isObjectLike } from './guards';

/*
 * The print design: its defaults, the gate for saved designs (`mergeDesign`), and what follows from a design (its size
 * in mm, pages, theme, paper and ink colours).
 */

/** The first occasion theme: the default design's greeting, quote and fonts come from it. */
const FIRST_THEME = firstOf(TH);

/** A new postcard: Diwali, 4 × 6 in, landscape, a print PDF on A4 with bleed and crop marks. */
export const DEFAULT_DESIGN: Design = {
  product: 'postcard',
  sizeId: '4x6',
  custom: { w: 150, h: 100 },
  orient: 'landscape',
  useOccasion: true,
  themeId: 'diwali',
  group: 'Festivals',
  artwork: true,
  decor: true,
  plain: { bg: '#FFFFFF', ink: '#22306B', accent: '#C8102E', gradient: false },
  layout: 'arch',
  frame: 'white',
  heading: FIRST_THEME.heads.at(0) ?? '',
  quote: FIRST_THEME.quotes.at(0) ?? '',
  sig: 'With love',
  showHeading: true,
  showQuote: true,
  showSig: true,
  insta: '',
  headFont: FIRST_THEME.hf,
  quoteFont: FIRST_THEME.qf,
  sigFont: '',
  instaFont: '',
  textScale: 1,
  vAlign: 'middle',
  hAlign: 'center',
  customColor: false,
  color: '#FFFFFF',
  scrim: true,
  ornament: true,
  back: { message: '', font: 'Kalam', fromFont: '', addrFont: '', labelFont: '', from: '', to: '', address: '', pin: '', stamp: true, label: true, tint: true, credit: false, date: '' },
  exp: { format: 'pdf', sheet: 'a4', bleed: '3', dpi: '300', quality: 'jpeg', marks: true, back: true, pngs: true },
  cal: {
    year: new Date().getFullYear(),
    start: 0,
    months: 12,
    weekStart: 1,
    text: 'off',
    captions: Array.from({ length: 12 }, () => ''),
    titleAlign: 'center',
    numbers: 'center',
    grid: 'tiles',
    font: '',
    numFont: '',
    numBold: true,
    capFont: '',
    titleScale: 1,
    numScale: 1,
    numSync: false,
    showYear: true,
    sundays: true,
    titleFont: '',
    backQuote: false,
    marks: 'all',
    markNames: true,
    ownDates: [],
  },
  mat: 'classic',
  designName: '',
  postYear: 0,
  env: { on: true, style: 'pointed', paper: 'occasion', art: true, photo: true, sender: '' },
};

/** A marked day of the user's own on a calendar. */
type OwnDate = Design['cal']['ownDates'][number];

/**
 * A fresh design of the given product, keeping the user's photo-independent choices like export settings.
 * @param product the product
 * @param keep the current design, whose occasion, Instagram handle and export settings carry over
 * @returns the product's default design
 */
export function productDesign(product: Design['product'], keep?: Design): Design {
  const defaults = productOf(product).defaults;
  const base = structuredClone(DEFAULT_DESIGN);
  return {
    ...base,
    ...(keep ? { themeId: keep.themeId, group: keep.group, useOccasion: keep.useOccasion, insta: keep.insta } : {}),
    product,
    sizeId: defaults.sizeId,
    orient: defaults.orient,
    layout: defaults.layout,
    frame: defaults.frame,
    exp: { ...(keep?.exp ?? base.exp), ...defaults.exp },
    // A magnet is small: one line of words reads better than greeting, quote and signature together.
    ...(product === 'magnet' ? { showQuote: false, vAlign: 'bottom' as const } : {}),
    // Calendars are wire-bound and usually handed over, so their envelope starts switched off.
    ...(product === 'calendar' ? { env: { ...base.env, on: false } } : {}),
  };
}

/**
 * A month's caption from saved captions of any shape.
 * @param captions the saved captions (an array, or junk from an old or broken save)
 * @param month 0–11
 * @returns the caption, or '' when there is no text for that month
 */
function captionOf(captions: unknown, month: number): string {
  if (captions === null || captions === undefined) return '';
  const caption: unknown = Reflect.get(Object(captions), month);
  return typeof caption === 'string' ? caption : '';
}

/**
 * Whether a saved marked day is valid: a month 1–12, a day 1–31 and a label.
 * @param value a saved entry
 * @returns true when it can be kept
 */
function isOwnDate(value: unknown): value is OwnDate {
  if (!isObjectLike(value)) return false;
  const { m: month, d: day, label } = value;
  return Number.isInteger(month) && Number.isInteger(day) && Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31 && typeof label === 'string';
}

/**
 * The calendar part of a merged design made valid: 12 captions, marked days checked, at most 60 of them.
 * @param calendar the merged calendar settings, changed in place
 * @param savedHadMarks whether the save had the `marks` setting (calendars saved before it existed start without)
 */
function checkCalendar(calendar: Design['cal'], savedHadMarks: boolean): void {
  const savedCaptions: unknown = calendar.captions;
  calendar.captions = Array.from({ length: 12 }, (_, month) => captionOf(savedCaptions, month));
  // Calendars saved before marked days existed keep their look: marks start off for them.
  if (!savedHadMarks) calendar.marks = 'off';
  const ownDates: unknown = calendar.ownDates;
  calendar.ownDates = (Array.isArray(ownDates) ? ownDates : []).filter(isOwnDate).slice(0, 60);
}

/**
 * Optional fonts fall back to their parent font ('') when the family is gone (an uploaded font removed from this
 * device); the required ones fall back to the defaults.
 * @param design the merged design, changed in place
 */
function dropMissingFonts(design: Design): void {
  const calendar = design.cal;
  for (const key of ['font', 'numFont', 'capFont', 'titleFont'] as const) if (calendar[key] && !hasFont(calendar[key])) calendar[key] = '';
  if (design.sigFont && !hasFont(design.sigFont)) design.sigFont = '';
  if (design.instaFont && !hasFont(design.instaFont)) design.instaFont = '';
  for (const key of ['fromFont', 'addrFont', 'labelFont'] as const) if (design.back[key] && !hasFont(design.back[key])) design.back[key] = '';
}

/**
 * Keeps the product, size and layout valid together (older saves are all postcards), and the required fonts present.
 * @param design the merged design, changed in place
 */
function fitToProduct(design: Design): void {
  if (!PRODUCTS.some((product) => product.id === design.product)) design.product = 'postcard';
  const defaults = productOf(design.product).defaults;
  if (!sizesFor(design.product).some((size) => size.id === design.sizeId)) design.sizeId = defaults.sizeId;
  if (!layoutsFor(design.product).some(([id]) => id === design.layout)) design.layout = defaults.layout;
  if (!hasFont(design.headFont)) design.headFont = 'Rozha One';
  if (!hasFont(design.quoteFont)) design.quoteFont = 'Kalam';
  if (!hasFont(design.back.font)) design.back.font = 'Kalam';
  if (!SIZES.some((size) => size.id === design.sizeId)) design.sizeId = '4x6';
}

/**
 * Merges a possibly partial or older saved design onto the defaults: the single gate for designs from outside
 * (saves, backups, `.chitthi` files).
 * @param saved anything read from storage or a file
 * @returns a valid design
 */
export function mergeDesign(saved: unknown): Design {
  const defaults = structuredClone(DEFAULT_DESIGN);
  if (!saved || typeof saved !== 'object') return defaults;
  // Keep only known keys so extra fields from older saves don't leak into the design.
  const known = Object.fromEntries(Object.entries(saved).filter(([key]) => key in defaults)) as Partial<Design>;
  const merged: Design = {
    ...defaults,
    ...known,
    custom: { ...defaults.custom, ...known.custom },
    plain: { ...defaults.plain, ...known.plain },
    back: { ...defaults.back, ...known.back },
    exp: { ...defaults.exp, ...known.exp },
    cal: { ...defaults.cal, ...known.cal },
    env: { ...defaults.env, ...known.env },
  };
  checkCalendar(merged.cal, !known.cal || 'marks' in known.cal);
  dropMissingFonts(merged);
  fitToProduct(merged);
  return merged;
}

/**
 * The year printed on postmarks.
 * @param design the design
 * @returns the design's own choice, the calendar's year, or this year
 */
export const postmarkYear = (design: Design): number => design.postYear || (design.product === 'calendar' ? design.cal.year : new Date().getFullYear());

/**
 * The design's size.
 * @param design the design
 * @returns its size, or the first size when its id is unknown
 */
export const sizeOf = (design: Design): SizeDef => SIZES.find((size) => size.id === design.sizeId) ?? firstOf(SIZES);

/**
 * Printed pages on the front.
 * @param design the design
 * @returns one per month for a calendar (one for the single-page Year strip), else one
 */
export const calPages = (design: Design): number => (design.product === 'calendar' && design.layout !== 'cal-strip' ? design.cal.months : 1);

/**
 * The finished piece's corner radius, for previews (Instax prints and magnets have rounded corners).
 * @param design the design
 * @returns mm
 */
export const cornerMM = (design: Design): number => {
  const size = sizeOf(design);
  return size.corner ?? (size.instax ? 3 : 0);
};

/**
 * The card's trim size for its orientation.
 * @param design the design
 * @returns width and height, mm
 */
export function cardMM(design: Design): { w: number; h: number } {
  const size = sizeOf(design);
  let long = size.L;
  let short = size.S;
  if (size.id === 'custom') {
    // Older saves can hold the custom size as text.
    const savedWidth: unknown = design.custom.w;
    const savedHeight: unknown = design.custom.h;
    const width = Number(savedWidth) || 150;
    const height = Number(savedHeight) || 100;
    long = Math.max(width, height);
    short = Math.min(width, height);
  }
  return design.orient === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

/**
 * The plain theme's darkest colour: the ink when it is dark, else the background when that is, else a warm black.
 * @param ink the ink colour
 * @param background the background colour
 * @returns a hex colour
 */
function plainDeep(ink: string, background: string): string {
  if (lum(ink) < 0.5) return ink;
  return lum(background) < 0.5 ? background : '#2A2620';
}

/**
 * The theme actually used for drawing.
 * @param design the design
 * @returns its occasion, or a plain theme built from the user's colours
 */
export function resolveTheme(design: Design): Theme {
  if (design.useOccasion) return themeById(design.themeId);
  const background = toHex(design.plain.bg);
  const ink = toHex(design.plain.ink);
  const accent = toHex(design.plain.accent);
  const gradientEnd = lum(background) > 0.5 ? '#C9B99A' : '#000000';
  return {
    id: 'plain',
    g: '',
    name: 'Hello',
    bg1: background,
    bg2: design.plain.gradient ? mix(background, gradientEnd, 0.22) : background,
    ink,
    accent,
    deep: plainDeep(ink, background),
    pal: [accent, ink],
    bgP: [],
    over: null,
    hf: design.headFont,
    qf: design.quoteFont,
    heads: PLAIN.heads,
    quotes: PLAIN.quotes,
  };
}

/**
 * The paper's colour (a frame print's border, the card's edge).
 * @param design the design
 * @returns a hex colour
 */
export const paperColour = (design: Design): string => ({ white: '#FFFFFF', cream: '#F6EEDC', black: '#1C1C1C', occasion: '#FFFFFF' })[design.frame];

/**
 * The ink for text on the paper around the picture.
 * @param design the design
 * @param theme its theme
 * @returns light on black paper, the theme's ink on occasion paper, else a dark ink
 */
export function frameInk(design: Design, theme: Theme): string {
  if (design.frame === 'black') return '#F4F1EA';
  if (design.frame === 'occasion') return theme.ink;
  return darkInk(theme);
}

/**
 * A dark ink for text on light paper.
 * @param theme the theme
 * @returns its deep colour when that is dark enough, else a warm black
 */
export const darkInk = (theme: Theme): string => (lum(theme.deep) < 0.55 ? theme.deep : '#2A2620');
