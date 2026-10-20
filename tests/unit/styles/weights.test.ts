import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codeUnitOrder } from '../../support/codeUnitOrder';
import { STYLES, textDeclarations, weightOf, type Declaration } from '../../support/cssDeclarations';

/*
 * 502 AC-1: only headings are bold. A weight above 500 is allowed only on the selectors docs/DESIGN.md lists under
 * "Weights allowed above 500", up to the weight listed there, in every stylesheet but the landing page's (D-067).
 */

/** The landing page's stylesheets, out of 502's scope (D-067 D1). */
const LANDING = ['07-landing.css', '23-landing-showcase.css', '27-landing-3d.css', '38-landing-studios.css'];
/** The marker before the list in DESIGN.md. */
const MARKER = '<!-- weights-allowed';

/**
 * The selectors DESIGN.md allows above 500, with the most each may set.
 * @param markdown the design document
 * @returns selector → weight
 */
export function allowedWeights(markdown: string): Map<string, number> {
  const start = markdown.indexOf(MARKER);
  if (start < 0) return new Map();
  // the checkout may have Windows line endings
  const fence = /```text\r?\n([\s\S]*?)```/.exec(markdown.slice(start));
  const allowed = new Map<string, number>();
  for (const line of (fence?.[1] ?? '').split(/\r?\n/)) {
    // fields are separated by two or more spaces: a selector may hold single spaces
    const [selector, weight] = line.trim().split(/\s{2,}/);
    if (selector && weight) allowed.set(selector, Number(weight));
  }
  return allowed;
}

/**
 * The selectors of a heavy rule that the list does not allow at its weight.
 * @param declaration a declaration heavier than 500
 * @param weight its weight
 * @param allowed the list
 * @returns the selectors not allowed (empty when every one is)
 */
const disallowed = (declaration: Declaration, weight: number, allowed: Map<string, number>) =>
  selectorsOf(declaration.rule).filter((selector) => (allowed.get(selector) ?? 0) < weight);

/**
 * The selectors of a rule: split at its own commas, not those inside :where(…) or :not(…).
 * @param rule the rule's selector
 * @returns each selector, trimmed
 */
export function selectorsOf(rule: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of rule) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      selectors.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  return [...selectors, current.trim()];
}

const design = fs.readFileSync('docs/DESIGN.md', 'utf8');
const allowed = allowedWeights(design);
const stylesheets = fs
  .readdirSync(STYLES)
  .filter((file) => file.endsWith('.css') && !LANDING.includes(file))
  .sort(codeUnitOrder);

describe('only headings are bold (502 AC-1)', () => {
  it('reads the weight of every form', () => {
    const at = (property: string, value: string) => weightOf({ property, value });
    expect(at('font-weight', '600')).toBe(600);
    expect(at('font-weight', 'bold')).toBe(700);
    expect(at('font-weight', 'var(--fw-head)')).toBe(600);
    expect(at('font-weight', 'var(--fw-label)')).toBe(500);
    expect(at('font', '700 2rem/1.1 var(--font-head)')).toBe(700);
    expect(at('font', 'var(--fw-strong) var(--fs-3xl)/1.1 var(--font-head)')).toBe(700);
    expect(at('font', 'inherit')).toBeNull();
    expect(at('font', 'bold 1rem var(--font)')).toBe(700);
    expect(at('font-size', '600px')).toBeNull();
  });

  it('splits a rule only at its own commas', () => {
    expect(selectorsOf('.a, .b h2')).toEqual(['.a', '.b h2']);
    expect(selectorsOf(':where(h1, h2):where(:not(.ld *))')).toEqual([':where(h1, h2):where(:not(.ld *))']);
  });

  it('reads the list from DESIGN.md, headings and values', () => {
    expect(allowed.get('.panel-head h2')).toBe(600);
    expect(allowed.get('.dhead h2')).toBe(700);
    expect(allowed.get('.ap-track > legend')).toBe(600);
    expect(allowed.get('.tl-time b')).toBe(600);
    expect([...allowed.values()].every((weight) => weight === 600 || weight === 700)).toBe(true);
    expect(allowedWeights('no list here').size).toBe(0);
  });

  it.each(stylesheets)('%s sets no weight above 500 outside the list', (file) => {
    const broken = textDeclarations(file).flatMap((declaration) => {
      const weight = weightOf(declaration);
      if (weight === null || weight <= 500) return [];
      const selectors = disallowed(declaration, weight, allowed);
      return selectors.length > 0 ? [`${selectors.join(', ')} { ${declaration.property}: ${declaration.value} }`] : [];
    });
    expect(broken).toEqual([]);
  });

  it.each(stylesheets)('%s sets a heading or value weight with a token, not a number', (file) => {
    const numbered = textDeclarations(file)
      .filter(
        (declaration) => (weightOf(declaration) ?? 0) > 500 && !/var\(--fw-(?:head|strong)\)/.test(declaration.value),
      )
      .map((declaration) => `${declaration.rule} { ${declaration.property}: ${declaration.value} }`);
    expect(numbered).toEqual([]);
  });
});
