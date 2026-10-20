import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { declarationsOf, readDeclarations as read, STYLES, type Declaration } from '../../support/cssDeclarations';

/*
 * 501 AC-4: the studios' stylesheets take colours, font sizes and layout widths from the tokens in 01-base.css, so
 * the print studio and the media studio can't drift apart. Raw values are allowed only in 01-base.css.
 */

/** The stylesheets that may only read tokens. `42-panel.css` (the shared panel parts) arrives with 501 T021. */
const TOKEN_ONLY = ['03-shell.css', '35-instagram.css', '36-media-studio.css', '41-projects.css', '42-panel.css'];
/** The layout widths both studios read. */
const WIDTH_TOKENS = ['--rail-w-wide', '--rail-w-narrow', '--panel-w', '--insp-w'];

/** A raw value the stylesheets may not use, with the reason it is allowed. */
interface Exception {
  file: string;
  selector: string;
  property: string;
  reason: string;
}
/** Raw values kept on purpose. Each needs a reason. None yet. */
const EXCEPTIONS: readonly Exception[] = Object.freeze<Exception[]>([]);

const RAW_COLOUR = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(|\b(?:white|black)\b/i;
/** A rem or px length outside var(): the value without its var(…) parts is searched. */
const RAW_SIZE = /\d(?:\.\d+)?(?:rem|px)\b/;

/**
 * Whether a declaration uses a raw colour or a raw font size.
 * @param declaration the declaration
 * @returns the rule it breaks, or null
 */
function rawUse(declaration: Declaration): 'colour' | 'font size' | null {
  const { property, value } = declaration;
  // token names such as --media-black are not colours
  if (RAW_COLOUR.test(value.replace(/--[\w-]+/g, ''))) return 'colour';
  if (property === 'font-size' || property === 'font') {
    const withoutTokens = value.replace(/var\([^)]*\)/g, '');
    if (RAW_SIZE.test(withoutTokens)) return 'font size';
  }
  return null;
}

/**
 * Whether a raw use is listed as an exception.
 * @param declaration the declaration
 * @returns true when EXCEPTIONS names it
 */
const isException = (declaration: Declaration) =>
  EXCEPTIONS.some(
    (entry) =>
      entry.file === declaration.file &&
      entry.selector === declaration.selector &&
      entry.property === declaration.property,
  );

const present = TOKEN_ONLY.filter((file) => fs.existsSync(path.join(STYLES, file)));

describe('studio stylesheets read tokens (501 AC-4)', () => {
  it('finds declarations under their selectors', () => {
    const found = declarationsOf(
      'x.css',
      '@media (width < 9px) { .a, .b { color: var(--text); font: 500 1rem/1 var(--font) } }',
    );
    expect(found).toEqual([
      {
        file: 'x.css',
        selector: '@media (width < 9px) > .a, .b',
        rule: '.a, .b',
        property: 'color',
        value: 'var(--text)',
      },
      {
        file: 'x.css',
        selector: '@media (width < 9px) > .a, .b',
        rule: '.a, .b',
        property: 'font',
        value: '500 1rem/1 var(--font)',
      },
    ]);
  });

  it('tells raw values from tokens', () => {
    const at = (property: string, value: string) => rawUse({ file: '', selector: '', rule: '', property, value });
    expect(at('color', '#fff')).toBe('colour');
    expect(at('box-shadow', '0 1px 2px rgba(0, 0, 0, 0.1)')).toBe('colour');
    expect(at('background', 'oklch(20% 0 0)')).toBe('colour');
    expect(at('color', 'var(--text)')).toBeNull();
    expect(at('color', 'black')).toBe('colour');
    expect(at('background', 'var(--media-black)')).toBeNull();
    expect(at('background', 'color-mix(in oklch, var(--text) 10%, transparent)')).toBeNull();
    expect(at('font-size', '0.86rem')).toBe('font size');
    expect(at('font', '500 0.88rem/1.1 var(--font)')).toBe('font size');
    expect(at('font', 'var(--fw-label) var(--fs-sm)/1.1 var(--font)')).toBeNull();
    expect(at('font-size', '0.9em')).toBeNull();
    expect(at('padding', '12px')).toBeNull();
  });

  it.each(present)('%s has no raw colours or font sizes', (file) => {
    const broken = read(file)
      .filter((declaration) => rawUse(declaration) && !isException(declaration))
      .map(
        (declaration) =>
          `${declaration.selector} { ${declaration.property}: ${declaration.value} } (${rawUse(declaration)})`,
      );
    expect(broken).toEqual([]);
  });

  it('every exception has a reason and is still needed', () => {
    for (const entry of EXCEPTIONS) {
      expect(entry.reason.length).toBeGreaterThan(10);
      expect(read(entry.file).some((declaration) => isException(declaration) && rawUse(declaration))).toBe(true);
    }
  });

  it('defines the layout widths once, in 01-base.css', () => {
    const files = fs.readdirSync(STYLES).filter((file) => file.endsWith('.css'));
    for (const token of WIDTH_TOKENS) {
      const definedIn = files.flatMap((file) =>
        read(file)
          .filter((declaration) => declaration.property === token)
          .map(() => file),
      );
      expect({ token, definedIn }).toEqual({ token, definedIn: ['01-base.css'] });
    }
    // --rail-w is set on the studio by the rail (501 §6), never by a stylesheet.
    const railSetBy = files.filter((file) => read(file).some((declaration) => declaration.property === '--rail-w'));
    expect(railSetBy).toEqual([]);
  });

  it.each(['03-shell.css', '36-media-studio.css'])('%s lays out with the shared widths', (file) => {
    const css = fs.readFileSync(path.join(STYLES, file), 'utf8');
    // until the rail frame sets --rail-w (501 T031), a fallback width may follow it
    expect(css).toMatch(/var\(--rail-w[,)]/);
    expect(css).toMatch(/var\(--panel-w\)/);
  });
});
