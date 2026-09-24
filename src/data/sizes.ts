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
  { id: 'custom', grp: 'Large and custom', name: 'Custom', L: 0, S: 0 },
];

export const SIZE_GROUPS: SizeDef['grp'][] = ['Postcards', 'Instax style', 'Large and custom'];

export function sizeLabel(s: SizeDef): string {
  if (s.id === 'custom') return 'Your own size in mm';
  const mm = `${Math.round(s.S)}×${Math.round(s.L)} mm`;
  return s.inch ? `${s.inch} (${mm})` : mm;
}
