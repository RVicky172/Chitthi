import { FALLBACK, FONTS, FONT_MAP, SAMPLE, USER_FONTS } from '../data/fonts';
import { loadUserFonts } from './userFonts';
import { desktop } from '../platform/desktop';
import type { Design, FontDef } from '../types';

/**
 * File name used for a family's offline stylesheet; scripts/fetch-fonts.mjs uses the same rule.
 * @param name the family name
 * @returns the name in lower case, with every run of other characters as one hyphen
 */
export const fontSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/*
 * Card fonts (46 Google families) load on demand: one stylesheet per family, added the first time a design,
 * tile or picker needs it. Loading all of them up front cost ~46 requests on every page view.
 */
const sheets = new Map<string, Promise<void>>();
const loaded = new Map<string, Promise<void>>();

/**
 * The address of a family's stylesheet.
 * @param font the family
 * @returns the offline file in the desktop app (npm run fetch:fonts), else Google Fonts with the family's weights
 */
function sheetUrl(font: FontDef): string {
  if (desktop?.info.localFonts) return `./fonts/${fontSlug(font.n)}.css`;
  const weights = font.w.length > 1 || font.w[0] !== 400 ? ':wght@' + font.w.join(';') : '';
  return `https://fonts.googleapis.com/css2?family=${font.n.replace(/ /g, '+')}${weights}&display=swap`;
}

/**
 * Adds one family's stylesheet (once), so a single bad family can't break the rest.
 * @param font the family
 * @returns resolves when the stylesheet has loaded or failed
 */
function installSheet(font: FontDef): Promise<void> {
  let sheetLoad = sheets.get(font.n);
  if (!sheetLoad) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = sheetUrl(font);
    sheetLoad = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    });
    sheets.set(font.n, sheetLoad);
    document.head.appendChild(link);
  }
  return sheetLoad;
}

/** Makes every card font available (the font picker previews them all). Not needed for normal use. */
export function installFontLinks(): void {
  for (const font of FONTS) void installSheet(font);
}

/**
 * Waits for a family's faces, so canvas text renders in the right font.
 * @param name the family name
 * @returns resolves once its heading and body weights are downloaded (or failed); at once for an unknown family
 */
export function ensureFont(name: string): Promise<void> {
  const font = FONT_MAP[name];
  // An uploaded font: ready once the stored files are registered.
  if (!font) return USER_FONTS.has(name) ? loadUserFonts() : Promise.resolve();
  let fontLoad = loaded.get(name);
  if (!fontLoad) {
    fontLoad = installSheet(font)
      .then(() => Promise.all([...new Set([font.hw, font.bw])].map((weight) => document.fonts.load(`${weight} 40px "${name}"`, SAMPLE))))
      .then(() => undefined)
      .catch(() => undefined);
    loaded.set(name, fontLoad);
  }
  return fontLoad;
}

/**
 * Waits for several families.
 * @param names the family names (repeats are loaded once)
 * @returns resolves once every one is ready
 */
export const ensureFonts = (names: string[]): Promise<void> => Promise.all([...new Set(names)].map(ensureFont)).then(() => undefined);

/**
 * Every family a design draws with, plus the script fallbacks.
 * @param design the design
 * @returns the family names (with repeats)
 */
export const fontsFor = (design: Design): string[] => {
  const { back, cal } = design;
  const optional = [design.sigFont, design.instaFont, back.fromFont, back.addrFont, back.labelFont, cal.font, cal.numFont, cal.capFont, cal.titleFont];
  return [
    design.headFont,
    design.quoteFont,
    back.font,
    ...optional.filter((name): name is string => !!name),
    // Rozha One draws the Chitthi mark on envelopes.
    ...(design.env.on ? ['Rozha One'] : []),
    ...FALLBACK,
  ];
};
