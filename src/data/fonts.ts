import type { FontCat, FontDef } from '../types';

const DEF: [string, FontCat, number[], string?][] = [
  ['Rozha One', 'ind', [400]],
  ['Yatra One', 'ind', [400]],
  ['Amita', 'ind', [400, 700]],
  ['Kalam', 'ind', [400, 700]],
  ['Tiro Devanagari Hindi', 'ind', [400]],
  ['Baloo 2', 'ind', [500, 700]],
  ['Mukta', 'ind', [400, 700]],
  ['Laila', 'ind', [400, 700]],
  ['Sura', 'ind', [400, 700]],
  ['Kurale', 'ind', [400]],
  ['Eczar', 'ind', [400, 700]],
  ['Martel', 'ind', [400, 700]],
  ['Khand', 'ind', [400, 600]],
  ['Teko', 'ind', [400, 600]],
  ['Modak', 'ind', [400]],
  ['Gotu', 'ind', [400]],
  ['Arya', 'ind', [400, 700]],
  ['Palanquin Dark', 'ind', [400, 700]],
  ['Sahitya', 'ind', [400, 700]],
  ['Hind', 'ind', [400, 600]],
  ['Baloo Paaji 2', 'reg', [500, 700], 'Gurmukhi'],
  ['Baloo Bhai 2', 'reg', [500, 700], 'Gujarati'],
  ['Baloo Da 2', 'reg', [500, 700], 'Bengali'],
  ['Baloo Thambi 2', 'reg', [500, 700], 'Tamil'],
  ['Baloo Chettan 2', 'reg', [500, 700], 'Malayalam'],
  ['Baloo Tamma 2', 'reg', [500, 700], 'Kannada'],
  ['Baloo Tammudu 2', 'reg', [500, 700], 'Telugu'],
  ['Baloo Bhaina 2', 'reg', [500, 700], 'Odia'],
  ['Playfair Display', 'disp', [400, 700]],
  ['Abril Fatface', 'disp', [400]],
  ['Cinzel', 'disp', [400, 700]],
  ['Bebas Neue', 'disp', [400]],
  ['Lobster', 'disp', [400]],
  ['Pacifico', 'disp', [400]],
  ['Dancing Script', 'scr', [500, 700]],
  ['Great Vibes', 'scr', [400]],
  ['Satisfy', 'scr', [400]],
  ['Sacramento', 'scr', [400]],
  ['Caveat', 'scr', [500, 700]],
  ['Shadows Into Light', 'scr', [400]],
  ['Fraunces', 'ss', [400, 600]],
  ['Cormorant Garamond', 'ss', [500, 700]],
  ['Lora', 'ss', [400, 700]],
  ['Poppins', 'ss', [400, 700]],
  ['Montserrat', 'ss', [400, 700]],
  ['Comfortaa', 'ss', [400, 700]],
];

export const FONTS: FontDef[] = DEF.map(([n, c, w, note]) => ({
  n,
  c,
  w,
  note,
  hw: w.includes(700) ? 700 : Math.max(...w),
  bw: w[0],
}));
export const FONT_MAP: Record<string, FontDef> = Object.fromEntries(FONTS.map((f) => [f.n, f]));

/*
 * Fonts the user uploaded (see lib/userFonts.ts). Their names are also kept in localStorage, so designs that use them
 * keep their font at start-up, before the font files themselves have been read from storage.
 */
export const USER_FONTS = new Map<string, FontDef>();
export const USER_FONT_INDEX = 'chitthi-user-fonts';
export const userFontDef = (n: string): FontDef => ({ n, c: 'own', w: [400], hw: 400, bw: 400, note: 'your font' });
try {
  const names: unknown = JSON.parse(localStorage.getItem(USER_FONT_INDEX) ?? '[]');
  if (Array.isArray(names)) for (const n of names) if (typeof n === 'string') USER_FONTS.set(n, userFontDef(n));
} catch {
  /* no storage: no uploaded fonts */
}

export const fontDef = (n: string): FontDef => FONT_MAP[n] ?? USER_FONTS.get(n) ?? FONT_MAP['Hind'];
/** A built-in family or one the user uploaded on this device. */
export const hasFont = (n: string): boolean => !!FONT_MAP[n] || USER_FONTS.has(n);

export const FONT_CATS: Record<'all' | FontCat, string> = {
  all: 'All',
  ind: 'Hindi & Indian',
  reg: 'Regional scripts',
  disp: 'Display',
  scr: 'Script',
  ss: 'Serif & sans',
  own: 'Your fonts',
};

/** Fonts used as per-glyph fallbacks so any Indian script renders even in a Latin-only face. */
export const FALLBACK = [
  'Baloo 2',
  'Baloo Paaji 2',
  'Baloo Bhai 2',
  'Baloo Da 2',
  'Baloo Thambi 2',
  'Baloo Chettan 2',
  'Baloo Tamma 2',
  'Baloo Tammudu 2',
  'Baloo Bhaina 2',
  'Hind',
];
export const SAMPLE = 'Aa अआ ਅਆ અઆ অআ அஆ അആ ಅಆ అఆ ଅଆ ₹';
export const HANDWRITING = ['Kalam', 'Caveat', 'Amita', 'Dancing Script', 'Shadows Into Light', 'Baloo 2', 'Hind'];

export function fontStr(family: string, weight: number, px: number): string {
  return `${weight} ${px}px "${family}", ${FALLBACK.map((x) => `"${x}"`).join(', ')}, sans-serif`;
}
