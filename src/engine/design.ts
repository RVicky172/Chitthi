import { layoutsFor } from '../data/layouts';
import { PRODUCTS, productOf, sizesFor } from '../data/products';
import { SIZES } from '../data/sizes';
import { PLAIN, TH, themeById } from '../data/themes';
import { FONT_MAP } from '../data/fonts';
import type { Design, SizeDef, Theme } from '../types';
import { lum, mix, toHex } from './color';

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
  heading: TH[0].heads[0],
  quote: TH[0].quotes[0],
  sig: 'With love',
  showHeading: true,
  showQuote: true,
  showSig: true,
  insta: '',
  headFont: TH[0].hf,
  quoteFont: TH[0].qf,
  textScale: 1,
  vAlign: 'middle',
  hAlign: 'center',
  customColor: false,
  color: '#FFFFFF',
  scrim: true,
  ornament: true,
  back: { message: '', font: 'Kalam', from: '', to: '', address: '', pin: '', stamp: true, label: true, tint: true },
  exp: { format: 'pdf', sheet: 'a4', bleed: '3', dpi: '300', quality: 'jpeg', marks: true, back: true },
  cal: { year: new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0), start: 0, months: 12, weekStart: 1 },
  mat: 'classic',
  designName: '',
};

/** A fresh design of the given product, keeping the user's photo-independent choices like export settings. */
export function productDesign(product: Design['product'], keep?: Design): Design {
  const def = productOf(product).defaults,
    base = structuredClone(DEFAULT_DESIGN);
  return {
    ...base,
    ...(keep ? { themeId: keep.themeId, group: keep.group, useOccasion: keep.useOccasion, insta: keep.insta } : {}),
    product,
    sizeId: def.sizeId,
    orient: def.orient,
    layout: def.layout,
    frame: def.frame,
    exp: { ...(keep?.exp ?? base.exp), ...def.exp },
  };
}

/** Merge a possibly partial / older saved design onto the defaults. */
export function mergeDesign(saved: unknown): Design {
  const d = structuredClone(DEFAULT_DESIGN);
  if (!saved || typeof saved !== 'object') return d;
  // Keep only known keys so extra fields from older saves don't leak into the design.
  const s = Object.fromEntries(Object.entries(saved).filter(([k]) => k in d)) as Partial<Design>;
  const out: Design = {
    ...d,
    ...s,
    custom: { ...d.custom, ...s.custom },
    plain: { ...d.plain, ...s.plain },
    back: { ...d.back, ...s.back },
    exp: { ...d.exp, ...s.exp },
    cal: { ...d.cal, ...s.cal },
  };
  // Keep the size and layout valid for the product (older saves are all postcards).
  if (!PRODUCTS.some((p) => p.id === out.product)) out.product = 'postcard';
  const def = productOf(out.product).defaults;
  if (!sizesFor(out.product).some((x) => x.id === out.sizeId)) out.sizeId = def.sizeId;
  if (!layoutsFor(out.product).some(([id]) => id === out.layout)) out.layout = def.layout;
  if (!FONT_MAP[out.headFont]) out.headFont = 'Rozha One';
  if (!FONT_MAP[out.quoteFont]) out.quoteFont = 'Kalam';
  if (!FONT_MAP[out.back.font]) out.back.font = 'Kalam';
  if (!SIZES.some((x) => x.id === out.sizeId)) out.sizeId = '4x6';
  return out;
}

export const sizeOf = (d: Design): SizeDef => SIZES.find((x) => x.id === d.sizeId) ?? SIZES[0];

/** Card trim size in millimetres for the current orientation. */
export function cardMM(d: Design): { w: number; h: number } {
  const s = sizeOf(d);
  let L = s.L,
    S = s.S;
  if (s.id === 'custom') {
    const a = +d.custom.w || 150,
      b = +d.custom.h || 100;
    L = Math.max(a, b);
    S = Math.min(a, b);
  }
  return d.orient === 'landscape' ? { w: L, h: S } : { w: S, h: L };
}

/** The theme actually used for drawing: an occasion, or a plain theme built from the user's colours. */
export function resolveTheme(d: Design): Theme {
  if (d.useOccasion) return themeById(d.themeId);
  const bg = toHex(d.plain.bg),
    ink = toHex(d.plain.ink),
    ac = toHex(d.plain.accent);
  return {
    id: 'plain',
    g: '',
    name: 'Hello',
    bg1: bg,
    bg2: d.plain.gradient ? mix(bg, lum(bg) > 0.5 ? '#C9B99A' : '#000000', 0.22) : bg,
    ink,
    accent: ac,
    deep: lum(ink) < 0.5 ? ink : lum(bg) < 0.5 ? bg : '#2A2620',
    pal: [ac, ink],
    bgP: [],
    over: null,
    hf: d.headFont,
    qf: d.quoteFont,
    heads: PLAIN.heads,
    quotes: PLAIN.quotes,
  };
}

export const paperColour = (d: Design): string =>
  ({ white: '#FFFFFF', cream: '#F6EEDC', black: '#1C1C1C', occasion: '#FFFFFF' })[d.frame];
export function frameInk(d: Design, t: Theme): string {
  if (d.frame === 'black') return '#F4F1EA';
  if (d.frame === 'occasion') return t.ink;
  return lum(t.deep) < 0.55 ? t.deep : '#2A2620';
}
export const darkInk = (t: Theme): string => (lum(t.deep) < 0.55 ? t.deep : '#2A2620');
