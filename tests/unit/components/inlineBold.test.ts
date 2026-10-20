import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeUnitOrder } from '../../support/codeUnitOrder';

/*
 * 502 AC-2: <b> and <strong> mark only a value the user must notice. The components that use them are exactly the
 * ones docs/DESIGN.md lists under "Inline bold", each with what it marks.
 */

const COMPONENTS = path.join('src', 'components');
/** The marker before the list in DESIGN.md. */
const MARKER = '<!-- inline-bold';
/** An opening <b> or <strong> tag in JSX. */
const INLINE_BOLD = /<(?:b|strong)[\s>]/;

/**
 * The files DESIGN.md lists, with what each marks.
 * @param markdown the design document
 * @returns file (with forward slashes) → what it marks
 */
export function listedFiles(markdown: string): Map<string, string> {
  const start = markdown.indexOf(MARKER);
  if (start < 0) return new Map();
  // the checkout may have Windows line endings
  const fence = /```text\r?\n([\s\S]*?)```/.exec(markdown.slice(start));
  const listed = new Map<string, string>();
  for (const line of (fence?.[1] ?? '').split(/\r?\n/)) {
    const [file, marks] = line.trim().split(/\s{2,}/);
    if (file && marks) listed.set(file, marks);
  }
  return listed;
}

/**
 * Every .tsx file under a folder.
 * @param folder the folder
 * @returns their paths, with forward slashes
 */
function componentFiles(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return componentFiles(full);
    return entry.name.endsWith('.tsx') ? [full.split(path.sep).join('/')] : [];
  });
}

const listed = listedFiles(fs.readFileSync('docs/DESIGN.md', 'utf8'));
const using = componentFiles(COMPONENTS)
  .filter((file) => INLINE_BOLD.test(fs.readFileSync(file, 'utf8')))
  .sort(codeUnitOrder);

describe('inline bold only for values (502 AC-2)', () => {
  it('finds opening tags, not words', () => {
    expect(INLINE_BOLD.test('<b>12</b>')).toBe(true);
    expect(INLINE_BOLD.test('<strong key={key}>x</strong>')).toBe(true);
    expect(INLINE_BOLD.test('<b\n  title="score">')).toBe(true);
    expect(INLINE_BOLD.test('<button type="button">')).toBe(false);
    expect(INLINE_BOLD.test('<br />')).toBe(false);
  });

  it('reads the list from DESIGN.md, each file with what it marks', () => {
    expect(listed.size).toBeGreaterThan(0);
    for (const [file, marks] of listed) {
      expect(fs.existsSync(file), file).toBe(true);
      expect(marks.length).toBeGreaterThan(5);
    }
  });

  it('only the listed components use <b> or <strong>', () => {
    expect(using).toEqual([...listed.keys()].sort(codeUnitOrder));
  });
});
