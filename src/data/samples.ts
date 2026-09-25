import { productDesign } from '../engine/design';
import { loadImage, makePhoto } from '../engine/photo';
import type { Design, Photo, ProductId } from '../types';
import { themeById } from './themes';

/*
 * Ready-made sample designs for the gallery, one set per product, built from photos downloaded from Pexels by
 * `npm run fetch:samples` (public/samples/ + samples.json with each photographer's credit). No API key ships.
 */

export interface SampleCredit {
  id: string;
  file: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

export interface SampleDef {
  id: string;
  title: string;
  product: ProductId;
  /** Photo ids from samples.json, in slot order (calendars: one per month). */
  photos: string[];
  build: (d: Design) => Design;
}

const withTheme = (d: Design, id: string): Design => {
  const t = themeById(id);
  return {
    ...d,
    useOccasion: true,
    themeId: id,
    group: t.g || d.group,
    heading: t.heads[0],
    quote: t.quotes[0],
    headFont: t.hf,
    quoteFont: t.qf,
  };
};

export const SAMPLES: SampleDef[] = [
  {
    id: 'diwali-arch',
    title: 'Diwali diyas',
    product: 'postcard',
    photos: ['diwali'],
    build: (d) => ({ ...withTheme(d, 'diwali'), layout: 'arch', insta: 'chitthi.studio' }),
  },
  {
    id: 'holi-full',
    title: 'Holi hai!',
    product: 'postcard',
    photos: ['holi'],
    build: (d) => ({ ...withTheme(d, 'holi'), layout: 'full', vAlign: 'bottom' }),
  },
  {
    id: 'birthday-polaroid',
    title: 'Birthday wishes',
    product: 'postcard',
    photos: ['birthday'],
    build: (d) => ({ ...withTheme(d, 'bday'), layout: 'polaroid', orient: 'portrait' }),
  },
  {
    id: 'kerala-stamp',
    title: 'Greetings from Kerala',
    product: 'postcard',
    photos: ['backwaters'],
    build: (d) => ({
      ...withTheme(d, 'monsoon'),
      layout: 'stamp',
      heading: 'Greetings from Kerala',
      quote: 'Houseboats, coconut curry and slow afternoons on the water.',
      sig: 'Wish you were here',
    }),
  },
  {
    id: 'india-collage',
    title: 'Incredible India',
    product: 'postcard',
    photos: ['tajmahal', 'desert', 'himalaya', 'beach'],
    build: (d) => ({
      ...withTheme(d, 'summer'),
      layout: 'collage4',
      heading: 'Incredible India',
      quote: 'Four weeks, four corners, one very full camera roll.',
    }),
  },
  {
    id: 'year-calendar',
    title: 'A year of India',
    product: 'calendar',
    photos: ['himalaya', 'tea', 'marigold', 'holi', 'beach', 'monsoon', 'backwaters', 'lotus', 'desert', 'diwali', 'tajmahal', 'kids'],
    build: (d) => ({
      ...withTheme(d, 'winter'),
      layout: 'cal-top',
      heading: 'A year of India',
      cal: { ...d.cal, start: 0, months: 12 },
    }),
  },
  {
    id: 'desk-calendar',
    title: 'Monsoon desk calendar',
    product: 'calendar',
    photos: ['monsoon', 'lotus', 'tea'],
    build: (d) => ({ ...withTheme(d, 'monsoon'), sizeId: 'cal-a5', orient: 'landscape', layout: 'cal-side', frame: 'cream' }),
  },
  {
    id: 'family-frame',
    title: 'Family portrait',
    product: 'frame',
    photos: ['family'],
    build: (d) => ({
      ...withTheme(d, 'parents'),
      layout: 'frame-caption',
      frame: 'cream',
      mat: 'classic',
      heading: 'Sunday in the park',
      showQuote: false,
      showSig: false,
    }),
  },
  {
    id: 'travel-triptych',
    title: 'Travel triptych',
    product: 'frame',
    photos: ['himalaya', 'tajmahal', 'beach'],
    build: (d) => ({ ...withTheme(d, 'summer'), sizeId: 'fa3', orient: 'landscape', layout: 'frame-trio', mat: 'thin', frame: 'white' }),
  },
  {
    id: 'kids-grid',
    title: 'Little ones',
    product: 'frame',
    photos: ['kids', 'birthday', 'holi', 'marigold'],
    build: (d) => ({ ...withTheme(d, 'kids'), sizeId: 'fsq8', orient: 'portrait', layout: 'frame-grid', mat: 'classic', frame: 'white' }),
  },
];

const base = `${import.meta.env.BASE_URL}samples/`;
let manifest: Promise<SampleCredit[] | null> | null = null;

/** The downloaded photo set, or null when `npm run fetch:samples` hasn't been run. */
export function sampleCredits(): Promise<SampleCredit[] | null> {
  manifest ??= fetch(`${base}samples.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { photos?: SampleCredit[] } | null) => (j?.photos?.length ? j.photos : null))
    .catch(() => null);
  return manifest;
}

const photoCache = new Map<string, Promise<Photo>>();
function samplePhotoFile(c: SampleCredit): Promise<Photo> {
  let p = photoCache.get(c.id);
  if (!p) {
    const url = base + c.file;
    p = loadImage(url).then((img) => makePhoto(img, `${c.alt} (Pexels / ${c.photographer})`, url));
    photoCache.set(c.id, p);
  }
  return p;
}

/** A sample's full design plus its loaded photos, ready for replaceCard() or renderCard(). */
export async function buildSample(def: SampleDef, credits: SampleCredit[]): Promise<{ design: Design; photos: Photo[]; credits: SampleCredit[] }> {
  const used = def.photos.map((id) => credits.find((c) => c.id === id)).filter((c): c is SampleCredit => !!c);
  const photos = await Promise.all(used.map(samplePhotoFile));
  const design = { ...def.build(productDesign(def.product)), designName: def.title };
  // unique credits (a calendar reuses nothing, but keep the list tidy)
  const seen = new Set<string>();
  return { design, photos, credits: used.filter((c) => !seen.has(c.id) && seen.add(c.id)) };
}
