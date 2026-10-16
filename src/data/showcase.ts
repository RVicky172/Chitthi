import type { Design, LookId, ProductId } from '../types';
import { themeById } from './themes';

/*
 * The designs shown on the landing page. They are rendered ahead of time (npm run build:showcase) into small WebP files
 * in public/showcase/, listed in showcase.json, so the landing page shows real Chitthi output without drawing
 * anything at load. The source photos live in showcase-src/ (Pexels, fetched with npm run fetch:showcase).
 */

/** A picture rendered of a showcase design: a card side or an envelope part. */
export type ShowcaseRender = 'front' | 'back' | 'envelope-front' | 'envelope-back' | 'envelope-body' | 'envelope-flap' | 'envelope-liner';

/** A design shown on the landing page. */
export interface ShowcaseDef {
  id: string;
  title: string;
  product: ProductId;
  /** Photo ids from showcase-src/photos.json, in slot order. */
  photos: string[];
  /** A photo look applied to every photo of this design. */
  look?: LookId;
  /** Turns the product's default design into this one. */
  build: (design: Design) => Design;
  /** The pictures rendered of it. */
  renders: ShowcaseRender[];
}

/**
 * A design dressed in an occasion theme: its group, first heading and quote, and fonts.
 * @param design the product's design
 * @param themeId the theme (data/themes.ts)
 * @param words settings that replace the theme's (heading, quote, signature …)
 * @returns the themed design
 */
function theme(design: Design, themeId: string, words: Partial<Design> = {}): Design {
  const occasion = themeById(themeId);
  return {
    ...design,
    useOccasion: true,
    themeId,
    group: occasion.g || design.group,
    heading: occasion.heads[0] ?? design.heading,
    quote: occasion.quotes[0] ?? design.quote,
    headFont: occasion.hf,
    quoteFont: occasion.qf,
    ...words,
  };
}
const back = { from: 'Asha', to: 'Nani Ma', address: '12 Gandhi Road\nC-Scheme, Jaipur', pin: '302001' };

export const SHOWCASE: ShowcaseDef[] = [
  {
    // The landing page's hero: the scroll journey and the 3D sections use its front, back and envelope.
    id: 'tinted-postcard',
    title: 'Greetings from Jaipur',
    product: 'postcard',
    photos: ['hawamahal'],
    look: 'tinted',
    build: (design) => ({
      ...design,
      useOccasion: false,
      plain: { bg: '#F3F1EC', ink: '#1E1D1B', accent: '#A8662E', gradient: false },
      headFont: 'Cormorant Garamond',
      quoteFont: 'Lora',
      heading: 'Greetings from Jaipur',
      quote: 'Pink walls, blue skies and far too much lassi.',
      sig: 'Love, Asha',
      layout: 'band',
      back: {
        ...design.back,
        ...back,
        address: '7 Mall Avenue\nCivil Lines, Lucknow',
        pin: '226001',
        message: 'Dear Nani,\nThe Hawa Mahal is even prettier than in your old photos. Bringing you bangles from the bazaar!',
      },
      env: { ...design.env, sender: 'Flat 4B, Rose Apartments\nPune 411001' },
    }),
    renders: ['front', 'back', 'envelope-front', 'envelope-back', 'envelope-body', 'envelope-flap', 'envelope-liner'],
  },
  {
    id: 'diwali-postcard',
    title: 'Shubh Deepavali',
    product: 'postcard',
    photos: ['rangoli'],
    build: (design) => ({
      ...theme(design, 'diwali', { heading: 'Shubh Deepavali', sig: 'Love, Asha' }),
      layout: 'band',
      back: { ...design.back, ...back, message: 'Dear Nani,\nThe diyas are lit and the house smells of ladoos. Wish you were here!' },
      env: { ...design.env, sender: 'Flat 4B, Rose Apartments\nPune 411001' },
    }),
    renders: ['front', 'back', 'envelope-front', 'envelope-back', 'envelope-body', 'envelope-flap', 'envelope-liner'],
  },
  {
    id: 'monsoon-polaroid',
    title: 'Monsoon days',
    product: 'postcard',
    photos: ['monsoon-drops'],
    build: (design) => ({
      ...theme(design, 'monsoon', { heading: 'Monsoon days', quote: 'Green everywhere, and chai on the balcony.', sig: 'from Srinagar' }),
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
    build: (design) => ({
      ...theme(design, 'summer', { heading: 'Greetings from Mysuru', quote: 'Temple towers, jasmine and the best filter coffee.', sig: 'Wish you were here' }),
      layout: 'stamp',
    }),
    renders: ['front'],
  },
  {
    id: 'festival-collage',
    title: 'Festival season',
    product: 'postcard',
    photos: ['spices', 'rangoli', 'lanterns'],
    build: (design) => ({
      ...theme(design, 'autumn', { heading: 'Festival season', quote: 'Colours at the market, lamps at the door, lanterns overhead.' }),
      layout: 'collage3',
    }),
    renders: ['front'],
  },
  {
    id: 'ladakh-calendar',
    title: 'Mountains wall calendar',
    product: 'calendar',
    photos: ['ladakh', 'sunflower', 'sankranti-kites', 'temple', 'mumbai', 'monsoon-drops', 'hawamahal', 'rangoli', 'lanterns', 'spices', 'holi-bowls', 'diwali-diyas'],
    build: (design) => ({
      ...theme(design, 'winter', { heading: 'Our year' }),
      layout: 'cal-top',
      cal: { ...design.cal, start: 0, months: 12, text: 'caption', titleAlign: 'left', captions: ['Pangong Tso, Ladakh', '', '', '', '', '', '', '', '', '', '', ''] },
    }),
    renders: ['front'],
  },
  {
    id: 'sunflower-strip',
    title: 'Year on one page',
    product: 'calendar',
    photos: ['sunflower'],
    build: (design) => ({ ...theme(design, 'spring'), layout: 'cal-strip', frame: 'cream', cal: { ...design.cal, start: 0, titleAlign: 'left' } }),
    renders: ['front'],
  },
  {
    id: 'puri-frame',
    title: 'Puri, at dusk',
    product: 'frame',
    photos: ['puri-sunset'],
    build: (design) => ({
      ...theme(design, 'autumn', { heading: 'Puri, at dusk', showQuote: false, showSig: false }),
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
    build: (design) => ({ ...theme(design, 'sankranti'), sizeId: 'fa3', orient: 'landscape', layout: 'frame-trio', mat: 'thin', frame: 'white' }),
    renders: ['front'],
  },
  {
    id: 'puppy-badge',
    title: 'Bruno badge',
    product: 'magnet',
    photos: ['puppy'],
    build: (design) => ({
      ...theme(design, 'kids', { heading: 'Bruno', sig: 'good boy, always' }),
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
    build: (design) => ({ ...theme(design, 'eid', { showQuote: false, showSig: false }), sizeId: 'm2x3', orient: 'portrait', layout: 'mag-full', vAlign: 'bottom' }),
    renders: ['front'],
  },
  {
    id: 'temple-polaroid-magnet',
    title: 'Temple town',
    product: 'magnet',
    photos: ['temple'],
    build: (design) => ({
      ...theme(design, 'pongal', { heading: 'Madurai, 2026', showQuote: false, showSig: false }),
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
