import { FALLBACK, FONTS, FONT_MAP, SAMPLE } from '../data/fonts';
import type { Design } from '../types';

const ready = new Map<string, Promise<void>>();
const loaded = new Map<string, Promise<void>>();

/** Adds one Google Fonts stylesheet per family, so a single bad family can't break the rest. */
export function installFontLinks(): void {
  for (const f of FONTS) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    const weights = f.w.length > 1 || f.w[0] !== 400 ? `:wght@${f.w.join(';')}` : '';
    l.href = `https://fonts.googleapis.com/css2?family=${f.n.replace(/ /g, '+')}${weights}&display=swap`;
    ready.set(
      f.n,
      new Promise<void>((res) => {
        l.onload = () => res();
        l.onerror = () => res();
      }),
    );
    document.head.appendChild(l);
  }
}

/** Resolves once the family's faces are downloaded, so canvas text renders in the right font. */
export function ensureFont(name: string): Promise<void> {
  const f = FONT_MAP[name];
  if (!f) return Promise.resolve();
  let p = loaded.get(name);
  if (!p) {
    p = (ready.get(name) ?? Promise.resolve())
      .then(() => Promise.all([...new Set([f.hw, f.bw])].map((w) => document.fonts.load(`${w} 40px "${name}"`, SAMPLE))))
      .then(() => undefined)
      .catch(() => undefined);
    loaded.set(name, p);
  }
  return p;
}
export const ensureFonts = (names: string[]) => Promise.all([...new Set(names)].map(ensureFont)).then(() => undefined);
export const fontsFor = (d: Design) => [d.headFont, d.quoteFont, d.back.font, ...FALLBACK];
