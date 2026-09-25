import type { SizeDef } from '../types';

export const SIZES: SizeDef[] = [
  { id: '4x6', grp: 'Postcards', name: 'Classic 4×6 in', L: 152.4, S: 101.6, inch: '4×6 in', tag: 'Most popular' },
  { id: 'a6', grp: 'Postcards', name: 'A6', L: 148, S: 105, tag: 'Popular in India' },
  { id: 'india', grp: 'Postcards', name: 'India Post card', L: 140, S: 90, tag: 'Mailable size' },
  { id: '5x7', grp: 'Postcards', name: '5×7 in', L: 177.8, S: 127, inch: '5×7 in', tag: 'Greeting card' },
  { id: '6x9', grp: 'Postcards', name: 'Jumbo', L: 228.6, S: 152.4, inch: '6×9 in' },
  { id: '6x11', grp: 'Postcards', name: 'Oversized', L: 279.4, S: 152.4, inch: '6×11 in' },
  { id: 'dl', grp: 'Postcards', name: 'DL slim', L: 210, S: 99 },
  { id: 'sq', grp: 'Postcards', name: 'Square', L: 139.7, S: 139.7, inch: '5.5×5.5 in' },
  {
    id: 'imini',
    grp: 'Instax style',
    name: 'Instax Mini',
    L: 86,
    S: 54,
    tag: '9 on an A4 sheet',
    instax: { w: 46, h: 62, side: 4, top: 6.5 },
    native: 'portrait',
  },
  {
    id: 'isq',
    grp: 'Instax style',
    name: 'Instax Square',
    L: 86,
    S: 72,
    tag: '6 on an A4 sheet',
    instax: { w: 62, h: 62, side: 5, top: 6.5 },
    native: 'portrait',
  },
  {
    id: 'iwide',
    grp: 'Instax style',
    name: 'Instax Wide',
    L: 108,
    S: 86,
    tag: '4 on an A4 sheet',
    instax: { w: 99, h: 62, side: 4.5, top: 6.5 },
    native: 'landscape',
  },
  { id: 'a5', grp: 'Large and custom', name: 'A5', L: 210, S: 148 },
  { id: 'a4', grp: 'Large and custom', name: 'A4', L: 297, S: 210, tag: 'Poster card' },
  { id: 'custom', grp: 'Large and custom', name: 'Custom', L: 0, S: 0, products: ['postcard', 'calendar', 'frame'] },

  /* calendars */
  { id: 'cal-a4', grp: 'Calendars', name: 'A4 wall', L: 297, S: 210, tag: 'Most popular', products: ['calendar'], native: 'portrait' },
  { id: 'cal-a3', grp: 'Calendars', name: 'A3 wall', L: 420, S: 297, tag: 'Big and bold', products: ['calendar'], native: 'portrait' },
  { id: 'cal-a5', grp: 'Calendars', name: 'A5 desk', L: 210, S: 148, tag: 'Desk stand', products: ['calendar'], native: 'landscape' },
  { id: 'cal-11x17', grp: 'Calendars', name: 'Tabloid', L: 431.8, S: 279.4, inch: '11×17 in', products: ['calendar'], native: 'portrait' },
  { id: 'cal-sq12', grp: 'Calendars', name: 'Square wall', L: 304.8, S: 304.8, inch: '12×12 in', products: ['calendar'] },

  /* photo frame prints (standard frame openings) */
  { id: 'f4x6', grp: 'Frame prints', name: '4×6 in', L: 152.4, S: 101.6, inch: '4×6 in', products: ['frame'] },
  { id: 'f5x7', grp: 'Frame prints', name: '5×7 in', L: 177.8, S: 127, inch: '5×7 in', tag: 'Desk frame', products: ['frame'] },
  { id: 'f8x10', grp: 'Frame prints', name: '8×10 in', L: 254, S: 203.2, inch: '8×10 in', tag: 'Most popular', products: ['frame'] },
  { id: 'f8x12', grp: 'Frame prints', name: '8×12 in', L: 304.8, S: 203.2, inch: '8×12 in', products: ['frame'] },
  { id: 'f11x14', grp: 'Frame prints', name: '11×14 in', L: 355.6, S: 279.4, inch: '11×14 in', products: ['frame'] },
  { id: 'fa4', grp: 'Frame prints', name: 'A4', L: 297, S: 210, products: ['frame'] },
  { id: 'fa3', grp: 'Frame prints', name: 'A3', L: 420, S: 297, tag: 'Wall frame', products: ['frame'] },
  { id: 'fsq8', grp: 'Frame prints', name: 'Square', L: 203.2, S: 203.2, inch: '8×8 in', products: ['frame'] },
];

export const SIZE_GROUPS: SizeDef['grp'][] = ['Postcards', 'Instax style', 'Calendars', 'Frame prints', 'Large and custom'];

export function sizeLabel(s: SizeDef): string {
  if (s.id === 'custom') return 'Your own size in mm';
  const mm = `${Math.round(s.S)}×${Math.round(s.L)} mm`;
  return s.inch ? `${s.inch} (${mm})` : mm;
}
