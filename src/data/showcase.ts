import type { Design, ProductId } from '../types';
import { themeById } from './themes';

/*
 * The designs shown on the landing page. They are rendered ahead of time (npm run build:showcase) into small WebP files
 * in public/showcase/, listed in showcase.json, so the landing page shows real Chitthi output without drawing
 * anything at load. The source photos live in showcase-src/ (Pexels, fetched with npm run fetch:showcase).
 */

export type ShowcaseRender = 'front' | 'back' | 'envelope-front' | 'envelope-back' | 'envelope-body' | 'envelope-flap' | 'envelope-liner';

export interface ShowcaseDef {
  id: string;
  title: string;
  product: ProductId;
  /** Photo ids from showcase-src/photos.json, in slot order. */
  photos: string[];
  build: (d: Design) => Design;
  renders: ShowcaseRender[];
}

const theme = (d: Design, id: string, words: Partial<Design> = {}): Design => {
  const t = themeById(id);
  return { ...d, useOccasion: true, themeId: id, group: t.g || d.group, heading: t.heads[0], quote: t.quotes[0], headFont: t.hf, quoteFont: t.qf, ...words };
};
const back = { from: 'Asha', to: 'Nani Ma', address: '12 Gandhi Road\nC-Scheme, Jaipur', pin: '302001' };

export const SHOWCASE: ShowcaseDef[] = [
  {
    id: 'diwali-postcard',
    title: 'Shubh Deepavali',
    product: 'postcard',
    photos: ['rangoli'],
    build: (d) => ({
      ...theme(d, 'diwali', { heading: 'Shubh Deepavali', sig: 'Love, Asha' }),
      layout: 'band',
      back: { ...d.back, ...back, message: 'Dear Nani,\nThe diyas are lit and the house smells of ladoos. Wish you were here!' },
      env: { ...d.env, sender: 'Flat 4B, Rose Apartments\nPune 411001' },
    }),
    renders: ['front', 'back', 'envelope-front', 'envelope-back', 'envelope-body', 'envelope-flap', 'envelope-liner'],
  },
  {
    id: 'wedding-polaroid',
    title: 'Just married',
    product: 'postcard',
    photos: ['couple'],
    build: (d) => ({
      ...theme(d, 'friends', { heading: 'Just married!', quote: 'Thank you for blessing us.', sig: 'Riya & Arjun' }),
      layout: 'polaroid',
      orient: 'portrait',
      frame: 'cream',
    }),
    renders: ['front'],
  },
  {
    id: 'jaipur-stamp',
    title: 'Greetings from Jaipur',
    product: 'postcard',
    photos: ['hawamahal'],
    build: (d) => ({
      ...theme(d, 'summer', { heading: 'Greetings from Jaipur', quote: 'Pink walls, blue skies and far too much lassi.', sig: 'Wish you were here' }),
      layout: 'stamp',
    }),
    renders: ['front'],
  },
  {
    id: 'banaras-collage',
    title: 'Banaras diaries',
    product: 'postcard',
    photos: ['ghats', 'chai', 'spices'],
    build: (d) => ({
      ...theme(d, 'autumn', { heading: 'Banaras diaries', quote: 'Boats at dawn, chai at noon, aarti at dusk.' }),
      layout: 'collage3',
    }),
    renders: ['front'],
  },
  {
    id: 'ladakh-calendar',
    title: 'Mountains wall calendar',
    product: 'calendar',
    photos: ['ladakh', 'sunflower', 'kites', 'temple', 'mumbai', 'ghats', 'hawamahal', 'rangoli', 'lanterns', 'spices', 'chai', 'grandma'],
    build: (d) => ({
      ...theme(d, 'winter', { heading: 'Our year' }),
      layout: 'cal-top',
      cal: { ...d.cal, start: 0, months: 12, text: 'caption', titleAlign: 'left', captions: ['Pangong Tso, Ladakh', '', '', '', '', '', '', '', '', '', '', ''] },
    }),
    renders: ['front'],
  },
  {
    id: 'sunflower-strip',
    title: 'Year on one page',
    product: 'calendar',
    photos: ['sunflower'],
    build: (d) => ({ ...theme(d, 'spring'), layout: 'cal-strip', frame: 'cream', cal: { ...d.cal, start: 0, titleAlign: 'left' } }),
    renders: ['front'],
  },
  {
    id: 'dadi-frame',
    title: 'Dadi at 80',
    product: 'frame',
    photos: ['grandma'],
    build: (d) => ({
      ...theme(d, 'parents', { heading: 'Dadi at 80', showQuote: false, showSig: false }),
      sizeId: 'f8x10',
      layout: 'frame-caption',
      mat: 'classic',
      frame: 'cream',
    }),
    renders: ['front'],
  },
  {
    id: 'kites-triptych',
    title: 'Sankranti skies',
    product: 'frame',
    photos: ['kites', 'mumbai', 'sunflower'],
    build: (d) => ({ ...theme(d, 'sankranti'), sizeId: 'fa3', orient: 'landscape', layout: 'frame-trio', mat: 'thin', frame: 'white' }),
    renders: ['front'],
  },
  {
    id: 'puppy-badge',
    title: 'Bruno badge',
    product: 'magnet',
    photos: ['puppy'],
    build: (d) => ({
      ...theme(d, 'kids', { heading: 'Bruno', sig: 'good boy, always' }),
      sizeId: 'mr75',
      orient: 'portrait',
      layout: 'mag-badge',
      showSig: true,
    }),
    renders: ['front'],
  },
  {
    id: 'eid-magnet',
    title: 'Eid Mubarak',
    product: 'magnet',
    photos: ['lanterns'],
    build: (d) => ({ ...theme(d, 'eid', { showQuote: false, showSig: false }), sizeId: 'm2x3', orient: 'portrait', layout: 'mag-full', vAlign: 'bottom' }),
    renders: ['front'],
  },
  {
    id: 'temple-polaroid-magnet',
    title: 'Temple town',
    product: 'magnet',
    photos: ['temple'],
    build: (d) => ({
      ...theme(d, 'pongal', { heading: 'Madurai, 2026', showQuote: false, showSig: false }),
      sizeId: 'm25x35',
      orient: 'portrait',
      layout: 'mag-polaroid',
      frame: 'white',
    }),
    renders: ['front'],
  },
];

/** One rendered image, as listed in showcase.json. */
export interface ShowcaseImage {
  id: string;
  render: ShowcaseRender;
  title: string;
  product: ProductId;
  src: string;
  w: number;
  h: number;
  /** Photo credits (Pexels photographers). */
  credits: { name: string; url: string }[];
}
