#!/usr/bin/env node
/*
 * Regenerates the size and layout tables in docs/SPECIFICATIONS.md from the app's own data
 * (src/data/sizes.ts and src/data/layouts.ts), so the document never drifts from the code.
 *
 *   npm run docs:specs
 *
 * Needs Node 22.18+ (or 23.6+), which runs TypeScript files by stripping their types. Both data files only
 * `import type`, so they load without a build step.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SIZES, SIZE_GROUPS } from '../src/data/sizes.ts';
import { LAYOUTS } from '../src/data/layouts.ts';

const DOC = new URL('../docs/SPECIFICATIONS.md', import.meta.url);
const BLEED = 3,
  DPI = 300;
const PRODUCTS = [
  ['postcard', 'Postcard'],
  ['calendar', 'Calendar'],
  ['frame', 'Photo frame'],
  ['magnet', 'Fridge magnet'],
];
const r1 = (n) => Math.round(n * 10) / 10;
const px = (mm) => Math.round((mm / 25.4) * DPI).toLocaleString('en-US');

function sizesTable() {
  const out = [];
  for (const [id, name] of PRODUCTS) {
    const list = SIZES.filter((s) => (s.products ?? ['postcard']).includes(id) && s.id !== 'custom');
    out.push(`### ${name}`, '', '| Id | Name | Group | Trim (short × long) | Inches | File with 3 mm bleed | Pixels at 300 dpi | Shape | Note |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const g of SIZE_GROUPS)
      for (const s of list.filter((x) => x.grp === g)) {
        const shape = s.shape === 'circle' ? 'Round' : s.corner ? `${s.corner} mm corners` : s.instax ? '3 mm corners' : 'Square';
        out.push(
          `| \`${s.id}\` | ${s.name} | ${s.grp} | ${r1(s.S)} × ${r1(s.L)} mm | ${s.inch ?? `${r1(s.S / 25.4)} × ${r1(s.L / 25.4)} in`} | ${r1(s.S + 2 * BLEED)} × ${r1(s.L + 2 * BLEED)} mm | ${px(s.S + 2 * BLEED)} × ${px(s.L + 2 * BLEED)} | ${shape} | ${[s.tag, s.native ? `starts ${s.native}` : ''].filter(Boolean).join(', ')} |`,
        );
      }
    out.push('');
  }
  out.push('Every product also offers **Custom** (`custom`): any width and height from 40 to 420 mm.');
  return out.join('\n');
}

function layoutsTable() {
  const out = ['| Product | Layout id | Name |', '| --- | --- | --- |'];
  for (const [id, name] of PRODUCTS) for (const [lid, lname] of LAYOUTS.filter((l) => l[2] === id)) out.push(`| ${name} | \`${lid}\` | ${lname} |`);
  return out.join('\n');
}

let doc = readFileSync(DOC, 'utf8');
const put = (tag, body) => {
  const re = new RegExp(`(<!-- ${tag}:start -->)[\\s\\S]*?(<!-- ${tag}:end -->)`);
  if (!re.test(doc)) throw new Error(`Markers for "${tag}" not found in docs/SPECIFICATIONS.md`);
  doc = doc.replace(re, `$1\n\n${body}\n\n$2`);
};
put('sizes', sizesTable());
put('layouts', layoutsTable());
writeFileSync(DOC, doc);
console.log(`Updated docs/SPECIFICATIONS.md: ${SIZES.length} sizes, ${LAYOUTS.length} layouts.`);
