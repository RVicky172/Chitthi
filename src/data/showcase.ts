import type { Design, LookId, ProductId } from '../types';
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
  /** A photo look applied to every photo of this design. */
  look?: LookId;
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
    // The landing page's hero: the scroll journey and the 3D sections use its front, back and envelope.
    id: 'tinted-postcard',
    title: 'Greetings from Jaipur',
    product: 'postcard',
    photos: ['hawamahal'],
    look: 'tinted',
    build: (d) => ({
      ...d,
      useOccasion: false,
      plain: { bg: '#F3F1EC', ink: '#1E1D1B', accent: '#A8662E', gradient: false },
      headFont: 'Cormorant Garamond',
      quoteFont: 'Lora',
      heading: 'Greetings from Jaipur',
      quote: 'Pink walls, blue skies and far too much lassi.',
      sig: 'Love, Asha',
      layout: 'band',
      back: {
        ...d.back,
        ...back,
        address: '7 Mall Avenue\nCivil Lines, Lucknow',
        pin: '226001',
        message: 'Dear Nani,\nThe Hawa Mahal is even prettier than in your old photos. Bringing you bangles from the bazaar!',
      },
      env: { ...d.env, sender: 'Flat 4B, Rose Apartments\nPune 411001' },
    }),
    renders: ['front', 'back', 'envelope-front', 'envelope-back', 'envelope-body', 'envelope-flap', 'envelope-liner'],
  },
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
    id: 'monsoon-polaroid',
    title: 'Monsoon days',
    product: 'postcard',
    photos: ['monsoon-drops'],
    build: (d) => ({
      ...theme(d, 'monsoon', { heading: 'Monsoon days', quote: 'Green everywhere, and chai on the balcony.', sig: 'from Srinagar' }),
      layout: 'polaroid',
      orient: 'portrait',
      frame: 'cream',
    }),
    renders: ['front'],
  },
  {
    id: 'mysuru-stamp',
    title: 'Greetings from Mysuru',
    product: 'postcard',
    photos: ['temple'],
    build: (d) => ({
      ...theme(d, 'summer', { heading: 'Greetings from Mysuru', quote: 'Temple towers, jasmine and the best filter coffee.', sig: 'Wish you were here' }),
      layout: 'stamp',
    }),
    renders: ['front'],
  },
  {
    id: 'festival-collage',
    title: 'Festival season',
    product: 'postcard',
    photos: ['spices', 'rangoli', 'lanterns'],
    build: (d) => ({
      ...theme(d, 'autumn', { heading: 'Festival season', quote: 'Colours at the market, lamps at the door, lanterns overhead.' }),
      layout: 'collage3',
    }),
    renders: ['front'],
  },
  {
    id: 'ladakh-calendar',
    title: 'Mountains wall calendar',
    product: 'calendar',
    photos: ['ladakh', 'sunflower', 'sankranti-kites', 'temple', 'mumbai', 'monsoon-drops', 'hawamahal', 'rangoli', 'lanterns', 'spices', 'holi-bowls', 'diwali-diyas'],
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
    id: 'puri-frame',
    title: 'Puri, at dusk',
    product: 'frame',
    photos: ['puri-sunset'],
    build: (d) => ({
      ...theme(d, 'autumn', { heading: 'Puri, at dusk', showQuote: false, showSig: false }),
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
    photos: ['sankranti-kites', 'mumbai', 'sunflower'],
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
