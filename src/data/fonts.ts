import type { FontCat, FontDef } from '../types';

/** A built-in family: its name, category, weights (never empty) and, for regional scripts, the script. */
type FontEntry = [name: string, category: FontCat, weights: [number, ...number[]], note?: string];

/** The family every unknown font name falls back to. */
const HIND: FontEntry = ['Hind', 'ind', [400, 600]];

const DEF: FontEntry[] = [
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
  HIND,
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

/**
 * A built-in family's definition.
 * @param entry the family's entry in the table
 * @returns its definition: the heading weight is 700 when it has one, else its heaviest; the body weight its lightest
 */
function fontOf([name, category, weights, note]: FontEntry): FontDef {
  return { n: name, c: category, w: weights, note, hw: weights.includes(700) ? 700 : Math.max(...weights), bw: weights[0] };
}

/** The built-in families, in the picker's order. */
export const FONTS: FontDef[] = DEF.map(fontOf);
/** The built-in families by name. */
export const FONT_MAP: Partial<Record<string, FontDef>> = Object.fromEntries(FONTS.map((font) => [font.n, font]));
/** The definition unknown names fall back to. */
const FALLBACK_FONT = fontOf(HIND);

/*
 * Fonts the user uploaded (see lib/userFonts.ts). Their names are also kept in localStorage, so designs that use them
 * keep their font at start-up, before the font files themselves have been read from storage.
 */
export const USER_FONTS = new Map<string, FontDef>();
export const USER_FONT_INDEX = 'chitthi-user-fonts';
/**
 * The definition of a font the user uploaded: one regular weight.
 * @param name the family name
 * @returns its definition
 */
export const userFontDef = (name: string): FontDef => ({ n: name, c: 'own', w: [400], hw: 400, bw: 400, note: 'your font' });
try {
  const names: unknown = JSON.parse(localStorage.getItem(USER_FONT_INDEX) ?? '[]');
  if (Array.isArray(names)) for (const name of names) if (typeof name === 'string') USER_FONTS.set(name, userFontDef(name));
} catch {
  /* no storage: no uploaded fonts */
}

/**
 * A family's definition, built-in or uploaded.
 * @param name the family name
 * @returns its definition, or Hind's for a name this device doesn't have
 */
export const fontDef = (name: string): FontDef => FONT_MAP[name] ?? USER_FONTS.get(name) ?? FALLBACK_FONT;
/**
 * Whether a family is built in or one the user uploaded on this device.
 * @param name the family name
 * @returns true when it can be drawn in its own face
 */
export const hasFont = (name: string): boolean => FONT_MAP[name] !== undefined || USER_FONTS.has(name);

/** The picker's categories and their names. */
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

/** The fallback families as a CSS list. */
const FALLBACK_LIST = FALLBACK.map((family) => `"${family}"`).join(', ');

/**
 * A canvas font string with the per-glyph fallbacks.
 * @param family the family name
 * @param weight the weight
 * @param px the size in pixels
 * @returns the CSS font shorthand
 */
export function fontStr(family: string, weight: number, px: number): string {
  return `${weight} ${px}px "${family}", ${FALLBACK_LIST}, sans-serif`;
}
