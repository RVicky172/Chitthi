import type { Design, LayoutId, ProductId } from '../types';
import { themeById } from './themes';

/*
 * The print samples: 12 designs to send to a print shop as test prints and for a quote (npm run build:print-samples).
 * Six postcards (three sizes, each vertical and horizontal) with the blank postal back, and six 2027 calendars (three
 * sizes, each vertical and horizontal) with a festival for every month. Photos: print-samples-src/ (Pexels, no people),
 * fetched with npm run fetch:print-samples.
 */

export interface PrintSampleDef {
  /** Folder name, e.g. "P1-Diwali-4x6-vertical". */
  id: string;
  title: string;
  product: ProductId;
  sizeId: string;
  orient: Design['orient'];
  themeId: string;
  layout: LayoutId;
  /** Photo ids from print-samples-src/photos.json, in slot (calendar: month) order. */
  photos: string[];
  heading?: string;
  /** Where the words sit on photo-first layouts. */
  vAlign?: Design['vAlign'];
  captions?: string[];
}

export const PRINT_SAMPLE_YEAR = 2027;

/** Calendar photos, January to December: one festival per month, two sets so neighbouring samples differ. */
const MONTHS_A = [
  'kites-line',
  'mustard-punjab',
  'holi-bowls',
  'wheat-gold',
  'buddha-gold',
  'puri-temple',
  'monsoon-rain',
  'rakhi',
  'ganesh-brass',
  'durga-idols',
  'diwali-diyas',
  'stars-red',
];
const CAPTIONS_A = [
  'Makar Sankranti',
  'Vasant Panchami',
  'Holi',
  'Baisakhi',
  'Buddha Purnima',
  'Rath Yatra, Puri',
  'Teej and the monsoon',
  'Raksha Bandhan',
  'Ganesh Chaturthi',
  'Durga Puja',
  'Diwali',
  'Christmas',
];
const MONTHS_B = [
  'lohri-bonfire',
  'mustard-bloom',
  'holi-plate',
  'wheat-fields',
  'buddha-shrine',
  'puri-sunset',
  'monsoon-drops',
  'krishna',
  'ganesh-jewels',
  'durga-pandal',
  'diwali-glow',
  'stars-hanging',
];
const CAPTIONS_B = [
  'Lohri',
  'Vasant Panchami',
  'Holi',
  'Baisakhi',
  'Buddha Purnima',
  'Rath Yatra',
  'Monsoon',
  'Janmashtami',
  'Ganesh Chaturthi',
  'Navratri and Durga Puja',
  'Diwali',
  'Christmas',
];

export const PRINT_SAMPLES: PrintSampleDef[] = [
  { id: 'P1-Diwali-4x6-vertical', title: 'Diwali', product: 'postcard', sizeId: '4x6', orient: 'portrait', themeId: 'diwali', layout: 'arch', photos: ['diwali-railing'] },
  { id: 'P2-Ganesh-A6-vertical', title: 'Ganesh Chaturthi', product: 'postcard', sizeId: 'a6', orient: 'portrait', themeId: 'ganesh', layout: 'polaroid', photos: ['ganesh-red'] },
  { id: 'P3-Eid-5x7-vertical', title: 'Eid', product: 'postcard', sizeId: '5x7', orient: 'portrait', themeId: 'eid', layout: 'full', photos: ['eid-lantern'], vAlign: 'top' },
  { id: 'P4-Holi-4x6-horizontal', title: 'Holi', product: 'postcard', sizeId: '4x6', orient: 'landscape', themeId: 'holi', layout: 'band', photos: ['holi-cones'] },
  { id: 'P5-Onam-A6-horizontal', title: 'Onam', product: 'postcard', sizeId: 'a6', orient: 'landscape', themeId: 'onam', layout: 'split', photos: ['onam-pookalam'] },
  {
    id: 'P6-Sankranti-5x7-horizontal',
    title: 'Makar Sankranti',
    product: 'postcard',
    sizeId: '5x7',
    orient: 'landscape',
    themeId: 'sankranti',
    layout: 'window',
    photos: ['sankranti-kites'],
  },

  { id: 'C1-Festivals-A4-wall-vertical', title: 'Festivals of India', product: 'calendar', sizeId: 'cal-a4', orient: 'portrait', themeId: 'india', layout: 'cal-top', photos: MONTHS_A, captions: CAPTIONS_A },
  { id: 'C2-Festivals-A4-wall-horizontal', title: 'Festivals of India', product: 'calendar', sizeId: 'cal-a4', orient: 'landscape', themeId: 'diwali', layout: 'cal-side', photos: MONTHS_B, captions: CAPTIONS_B },
  { id: 'C3-Festivals-A3-wall-vertical', title: 'Festivals of India', product: 'calendar', sizeId: 'cal-a3', orient: 'portrait', themeId: 'navratri', layout: 'cal-full', photos: MONTHS_B, captions: CAPTIONS_B },
  { id: 'C4-Festivals-A3-wall-horizontal', title: 'Festivals of India', product: 'calendar', sizeId: 'cal-a3', orient: 'landscape', themeId: 'pongal', layout: 'cal-top', photos: MONTHS_A, captions: CAPTIONS_A },
  { id: 'C5-Festivals-A5-desk-vertical', title: 'Festivals of India', product: 'calendar', sizeId: 'cal-a5', orient: 'portrait', themeId: 'onam', layout: 'cal-top', photos: MONTHS_A, captions: CAPTIONS_A },
  { id: 'C6-Festivals-A5-desk-horizontal', title: 'Festivals of India', product: 'calendar', sizeId: 'cal-a5', orient: 'landscape', themeId: 'holi', layout: 'cal-side', photos: MONTHS_B, captions: CAPTIONS_B },
];

/** The design for a sample, built on a fresh design of its product. The postcard back is left blank to write on. */
export function printSampleDesign(def: PrintSampleDef, base: Design): Design {
  const t = themeById(def.themeId);
  const d: Design = {
    ...base,
    designName: def.id,
    useOccasion: true,
    themeId: def.themeId,
    group: t.g || base.group,
    heading: def.heading ?? (def.product === 'calendar' ? def.title : t.heads[0]),
    quote: t.quotes[0],
    sig: 'With love',
    headFont: t.hf,
    quoteFont: t.qf,
    sizeId: def.sizeId,
    orient: def.orient,
    layout: def.layout,
    ...(def.vAlign ? { vAlign: def.vAlign } : {}),
    back: { ...base.back, message: '', from: '', to: '', address: '', pin: '' },
    exp: { ...base.exp, bleed: '3', dpi: '300', quality: 'jpeg', marks: true, back: true, sheet: '1319' },
    // Envelopes are made once per size, in their own folder.
    env: { ...base.env, on: false },
  };
  if (def.product === 'calendar')
    d.cal = {
      ...base.cal,
      year: PRINT_SAMPLE_YEAR,
      start: 0,
      months: 12,
      weekStart: 1,
      text: def.captions ? 'caption' : 'off',
      captions: def.captions ?? base.cal.captions,
      titleAlign: 'left',
    };
  return d;
}
