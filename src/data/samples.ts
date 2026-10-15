import type { Design, ProductId } from '../types';
import { themeById } from './themes';

/*
 * Ready-made sample designs for the gallery, one set per product, built from photos downloaded from Pexels by
 * `npm run fetch:samples` (public/samples/ + samples.json with each photographer's credit). No API key ships.
 */

/** One downloaded photo in samples.json, with its photographer's credit. */
export interface SampleCredit {
  /** The id samples refer to (SampleDef.photos). */
  id: string;
  /** The file name under public/samples/. */
  file: string;
  /** Pexels' description of the photo. */
  alt: string;
  photographer: string;
  photographerUrl: string;
  /** The photo's page on Pexels (its number is the Pexels id). */
  pexelsUrl: string;
}

/** A ready-made sample design. */
export interface SampleDef {
  id: string;
  /** The name shown in the gallery and given to the opened design. */
  title: string;
  product: ProductId;
  /** Photo ids from samples.json, in slot order (calendars: one per month). */
  photos: string[];
  /** Turns the product's default design into the sample. */
  build: (design: Design) => Design;
}

/**
 * A design dressed in an occasion theme: its group, first heading and quote, and fonts.
 * @param design the product's design
 * @param themeId the theme (data/themes.ts)
 * @returns the themed design
 */
function withTheme(design: Design, themeId: string): Design {
  const theme = themeById(themeId);
  return {
    ...design,
    useOccasion: true,
    themeId,
    group: theme.g || design.group,
    heading: theme.heads[0] ?? design.heading,
    quote: theme.quotes[0] ?? design.quote,
    headFont: theme.hf,
    quoteFont: theme.qf,
  };
}

/** The samples, grouped by product. */
export const SAMPLES: SampleDef[] = [
  {
    id: 'diwali-arch',
    title: 'Diwali diyas',
    product: 'postcard',
    photos: ['diwali'],
    build: (design) => ({ ...withTheme(design, 'diwali'), layout: 'arch', insta: 'chitthi.studio' }),
  },
  {
    id: 'holi-full',
    title: 'Holi hai!',
    product: 'postcard',
    photos: ['holi-bowls'],
    build: (design) => ({ ...withTheme(design, 'holi'), layout: 'full', vAlign: 'bottom' }),
  },
  {
    id: 'birthday-polaroid',
    title: 'Birthday wishes',
    product: 'postcard',
    photos: ['stars-hanging'],
    build: (design) => ({ ...withTheme(design, 'bday'), layout: 'polaroid', orient: 'portrait' }),
  },
  {
    id: 'kerala-stamp',
    title: 'Greetings from Kerala',
    product: 'postcard',
    photos: ['onam-pookalam'],
    build: (design) => ({
      ...withTheme(design, 'onam'),
      layout: 'stamp',
      heading: 'Greetings from Kerala',
      quote: 'Flower carpets, a banana-leaf sadya and slow afternoons.',
      sig: 'Wish you were here',
    }),
  },
  {
    id: 'india-collage',
    title: 'Incredible India',
    product: 'postcard',
    photos: ['puri-temple', 'mustard-punjab', 'himalaya', 'wheat-fields'],
    build: (design) => ({
      ...withTheme(design, 'summer'),
      layout: 'collage4',
      heading: 'Incredible India',
      quote: 'Four weeks, four corners, one very full camera roll.',
    }),
  },
  {
    id: 'year-calendar',
    title: 'A year of India',
    product: 'calendar',
    photos: ['himalaya', 'tea', 'marigold', 'holi-bowls', 'wheat-fields', 'monsoon', 'monsoon-rain', 'lotus', 'mustard-punjab', 'diwali', 'puri-temple', 'kites-line'],
    build: (design) => ({
      ...withTheme(design, 'winter'),
      layout: 'cal-top',
      heading: 'A year of India',
      cal: { ...design.cal, start: 0, months: 12 },
    }),
  },
  {
    id: 'year-strip',
    title: 'Year on one page',
    product: 'calendar',
    photos: ['tea'],
    build: (design) => ({ ...withTheme(design, 'monsoon'), layout: 'cal-strip', frame: 'cream', cal: { ...design.cal, start: 0, titleAlign: 'left' } }),
  },
  {
    id: 'desk-calendar',
    title: 'Monsoon desk calendar',
    product: 'calendar',
    photos: ['monsoon', 'lotus', 'tea'],
    build: (design) => ({ ...withTheme(design, 'monsoon'), sizeId: 'cal-a5', orient: 'landscape', layout: 'cal-side', frame: 'cream' }),
  },
  {
    id: 'temple-frame',
    title: 'Temple at dusk',
    product: 'frame',
    photos: ['puri-sunset'],
    build: (design) => ({
      ...withTheme(design, 'autumn'),
      layout: 'frame-caption',
      frame: 'cream',
      mat: 'classic',
      heading: 'Puri, at dusk',
      showQuote: false,
      showSig: false,
    }),
  },
  {
    id: 'travel-triptych',
    title: 'Travel triptych',
    product: 'frame',
    photos: ['himalaya', 'puri-temple', 'wheat-fields'],
    build: (design) => ({ ...withTheme(design, 'summer'), sizeId: 'fa3', orient: 'landscape', layout: 'frame-trio', mat: 'thin', frame: 'white' }),
  },
  {
    id: 'kids-grid',
    title: 'Colour wall',
    product: 'frame',
    photos: ['kites-line', 'stars-hanging', 'holi-bowls', 'marigold'],
    build: (design) => ({ ...withTheme(design, 'kids'), sizeId: 'fsq8', orient: 'portrait', layout: 'frame-grid', mat: 'classic', frame: 'white' }),
  },
  {
    id: 'polaroid-magnet',
    title: 'Polaroid magnet',
    product: 'magnet',
    photos: ['mustard-bloom'],
    build: (design) => ({ ...withTheme(design, 'spring'), layout: 'mag-polaroid', frame: 'white', heading: 'Spring in Punjab', showQuote: false, showSig: false }),
  },
  {
    id: 'diwali-badge',
    title: 'Diwali badge',
    product: 'magnet',
    photos: ['diwali'],
    build: (design) => ({ ...withTheme(design, 'diwali'), sizeId: 'mr75', orient: 'portrait', layout: 'mag-badge', sig: 'with love, 2026' }),
  },
  {
    id: 'travel-magnet',
    title: 'Golden fields',
    product: 'magnet',
    photos: ['wheat-fields'],
    build: (design) => ({ ...withTheme(design, 'summer'), sizeId: 'm3x3', layout: 'mag-full', heading: 'Punjab', vAlign: 'bottom', hAlign: 'left', showQuote: false, showSig: false }),
  },
];

/** Where `npm run fetch:samples` puts the photos and samples.json (state/samples.ts loads them). */
export const SAMPLE_BASE_URL = `${import.meta.env.BASE_URL}samples/`;
