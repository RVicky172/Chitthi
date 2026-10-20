import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readDeclarations, STYLES, textDeclarations, weightOf, type Declaration } from '../../support/cssDeclarations';

/*
 * 502 AC-3: the fonts load the weights the app uses and no others, so the browser never draws a synthesised bold
 * and fetches nothing unused. Every stylesheet counts here, the landing page's too: it loads the same fonts.
 */

/** The three places that load the web fonts: the page, the stylesheet, and the desktop app's offline copy. */
const URL_SOURCES = ['index.html', 'src/styles.css', 'scripts/fetch-fonts.mjs'];
const FONTS_URL = /https:\/\/fonts\.googleapis\.com\/css2\?family=Geist[^'"`)\s]*/;

/** A family the stylesheets choose by token. */
type Family = 'body' | 'head' | 'mono';

/**
 * The family a rule's text is set in: the heading face or the mono face when the rule names it, else the body face
 * (what it inherits by default).
 * @param declarations the rule's declarations
 * @returns its family
 */
function familyOf(declarations: readonly Declaration[]): Family {
  const values = declarations
    .filter((declaration) => declaration.property === 'font' || declaration.property === 'font-family')
    .map((declaration) => declaration.value);
  if (values.some((value) => value.includes('--font-head'))) return 'head';
  if (values.some((value) => value.includes('--mono'))) return 'mono';
  return 'body';
}

/**
 * The weights each family is drawn at, from every rule that sets a weight (a rule naming a family without a weight
 * draws it at the regular 400).
 * @returns family → weights
 */
function usedWeights(): Record<Family, Set<number>> {
  const used: Record<Family, Set<number>> = { body: new Set([400]), head: new Set(), mono: new Set() };
  const files = fs.readdirSync(STYLES).filter((file) => file.endsWith('.css'));
  for (const file of files) {
    const rules = new Map<string, Declaration[]>();
    for (const declaration of textDeclarations(file)) {
      rules.set(declaration.selector, [...(rules.get(declaration.selector) ?? []), declaration]);
    }
    for (const declarations of rules.values()) {
      const family = familyOf(declarations);
      const weights = declarations.map(weightOf).filter((weight): weight is number => weight !== null);
      for (const weight of weights) used[family].add(weight);
      // a rule that names the heading or mono face without a weight draws it at the regular 400
      const namesFamily = declarations.some((declaration) => /--(?:font-head|mono)\b/.test(declaration.value));
      if (weights.length === 0 && namesFamily) used[family].add(400);
    }
  }
  return used;
}

/**
 * The weight range a Google Fonts URL loads for a family.
 * @param url the css2 URL
 * @param family the family's name as written in the URL (spaces as +)
 * @returns [lightest, heaviest], or null when the family has no range
 */
export function urlRange(url: string, family: string): [number, number] | null {
  const match = new RegExp(`family=${family.replace(/\+/g, '\\+')}:wght@(\\d+)\\.\\.(\\d+)`).exec(url);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * The weight range the local @font-face rules declare for the heading face.
 * @returns [lightest, heaviest] of every Schibsted Grotesk @font-face
 */
function headRange(): [number, number] {
  const ranges = readDeclarations('01-base.css')
    .filter((declaration) => declaration.selector.startsWith('@font-face') && declaration.property === 'font-weight')
    .map((declaration) => declaration.value.split(/\s+/).map(Number));
  return [Math.min(...ranges.flat()), Math.max(...ranges.flat())];
}

/**
 * The lightest and heaviest of a set of weights.
 * @param weights the weights
 * @returns [lightest, heaviest]
 */
const span = (weights: Set<number>): [number, number] => [Math.min(...weights), Math.max(...weights)];

const urls = URL_SOURCES.map((file) => FONTS_URL.exec(fs.readFileSync(file, 'utf8'))?.[0] ?? `no fonts URL in ${file}`);
const used = usedWeights();

describe('the fonts load the weights in use (502 AC-3)', () => {
  it('reads a family range from the URL', () => {
    const url =
      'https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap';
    expect(urlRange(url, 'Geist')).toEqual([400, 700]);
    expect(urlRange(url, 'Geist+Mono')).toEqual([400, 600]);
    expect(urlRange(url, 'Hind')).toBeNull();
  });

  it('loads the fonts from one URL in the page, the stylesheet and the desktop copy', () => {
    expect(urls[1]).toBe(urls[0]);
    expect(urls[2]).toBe(urls[0]);
  });

  it('loads Geist from its lightest to its heaviest weight in use', () => {
    expect(urlRange(urls[0] ?? '', 'Geist')).toEqual(span(used.body));
  });

  it('loads Geist Mono from its lightest to its heaviest weight in use', () => {
    expect(urlRange(urls[0] ?? '', 'Geist+Mono')).toEqual(span(used.mono));
  });

  it('declares Schibsted Grotesk from its lightest to its heaviest weight in use', () => {
    expect(headRange()).toEqual(span(used.head));
  });
});
