import { FALLBACK, FONTS, FONT_MAP, SAMPLE } from '../data/fonts';
import type { Design, FontDef } from '../types';

/*
 * Card fonts (46 Google families) load on demand: one stylesheet per family, added the first time a design,
 * tile or picker needs it. Loading all of them up front cost ~46 requests on every page view.
 */
const sheets = new Map<string, Promise<void>>();
const loaded = new Map<string, Promise<void>>();

/** Adds one family's Google Fonts stylesheet (once), so a single bad family can't break the rest. */
function installSheet(f: FontDef): Promise<void> {
  let p = sheets.get(f.n);
  if (!p) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    const weights = f.w.length > 1 || f.w[0] !== 400 ? `:wght@${f.w.join(';')}` : '';
    l.href = `https://fonts.googleapis.com/css2?family=${f.n.replace(/ /g, '+')}${weights}&display=swap`;
    p = new Promise<void>((res) => {
      l.onload = () => res();
      l.onerror = () => res();
    });
    sheets.set(f.n, p);
    document.head.appendChild(l);
  }
  return p;
}

/** Makes every card font available (the font picker previews them all). Not needed for normal use. */
export function installFontLinks(): void {
  for (const f of FONTS) void installSheet(f);
}

/** Resolves once the family's faces are downloaded, so canvas text renders in the right font. */
export function ensureFont(name: string): Promise<void> {
  const f = FONT_MAP[name];
  if (!f) return Promise.resolve();
  let p = loaded.get(name);
  if (!p) {
    p = installSheet(f)
      .then(() => Promise.all([...new Set([f.hw, f.bw])].map((w) => document.fonts.load(`${w} 40px "${name}"`, SAMPLE))))
      .then(() => undefined)
      .catch(() => undefined);
    loaded.set(name, p);
  }
  return p;
}
export const ensureFonts = (names: string[]) => Promise.all([...new Set(names)].map(ensureFont)).then(() => undefined);
export const fontsFor = (d: Design) => [d.headFont, d.quoteFont, d.back.font, ...FALLBACK];
