import fs from 'node:fs';
import path from 'node:path';

/*
 * Stylesheets read as text for the style tests (501 tokens, 502 weights): each declaration with the selector it sits
 * under. A small brace walker, no CSS parser dependency.
 */

/** The app's stylesheets. */
export const STYLES = path.join('src', 'styles');

/** One `property: value` and where it is. */
export interface Declaration {
  file: string;
  /** The rule's selector, after the at-rules it sits in, joined by " > " (e.g. `@media (…) > .a, .b`). */
  selector: string;
  /** The rule's own selector, without the at-rules (e.g. `.a, .b`). */
  rule: string;
  property: string;
  value: string;
}

/**
 * The declarations of a stylesheet with the selector (or at-rule chain) they sit under.
 * @param file the stylesheet's name under src/styles
 * @param css its text
 * @returns every declaration
 */
export function declarationsOf(file: string, css: string): Declaration[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: Declaration[] = [];
  const preludes: string[] = [];
  let buffer = '';
  const flush = () => {
    const colon = buffer.indexOf(':');
    if (colon > 0 && preludes.length > 0) {
      found.push({
        file,
        selector: preludes.join(' > '),
        rule: preludes.at(-1) ?? '',
        property: buffer.slice(0, colon).trim(),
        value: buffer.slice(colon + 1).trim(),
      });
    }
    buffer = '';
  };
  for (const character of text) {
    if (character === '{') {
      preludes.push(buffer.trim().replace(/\s+/g, ' '));
      buffer = '';
    } else if (character === '}') {
      flush();
      preludes.pop();
    } else if (character === ';') {
      flush();
    } else {
      buffer += character;
    }
  }
  return found;
}

/**
 * The declarations of a stylesheet under src/styles.
 * @param file its name
 * @returns its declarations
 */
export function readDeclarations(file: string): Declaration[] {
  return declarationsOf(file, fs.readFileSync(path.join(STYLES, file), 'utf8'));
}

/**
 * The declarations of a stylesheet that style text: without @font-face rules, which describe a font (its weight
 * range included) and draw nothing.
 * @param file its name under src/styles
 * @returns its declarations outside @font-face
 */
export function textDeclarations(file: string): Declaration[] {
  return readDeclarations(file).filter((declaration) => !declaration.selector.startsWith('@font-face'));
}

/** The weight tokens in 01-base.css. */
const TOKEN_WEIGHTS: Record<string, number> = {
  '--fw-body': 400,
  '--fw-label': 500,
  '--fw-head': 600,
  '--fw-strong': 700,
};
/** Weight keywords, as the browser resolves them against normal text. */
const KEYWORD_WEIGHTS: Record<string, number> = { normal: 400, bold: 700, bolder: 700, lighter: 300 };
/**
 * The weight a declaration sets, if it sets one.
 * @param declaration a `font-weight` or `font` declaration (others give null)
 * @returns the weight, or null
 */
export function weightOf(declaration: Pick<Declaration, 'property' | 'value'>): number | null {
  const { property, value } = declaration;
  if (property !== 'font-weight' && property !== 'font') return null;
  const token = /var\((--fw-[\w-]+)\)/.exec(value)?.[1];
  if (token) return TOKEN_WEIGHTS[token] ?? null;
  // in the shorthand the weight comes before the size; a bare number of 100–900 is the weight
  const number = /(?:^|\s)([1-9]00)(?=\s|$)/.exec(value)?.[1];
  if (number) return Number(number);
  const keyword = /(?:^|\s)(normal|bold|bolder|lighter)(?=\s|$)/.exec(value)?.[1];
  if (keyword && property === 'font-weight') return KEYWORD_WEIGHTS[keyword] ?? null;
  return keyword === 'bold' || keyword === 'bolder' ? 700 : null;
}
