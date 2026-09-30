#!/usr/bin/env node
/*
 * Writes dist-lib/styles.css: src/styles.css with its local @imports (src/styles/*.css) inlined in order, as one
 * file. Vite inlines them for the app itself; this is for tools that copy the stylesheet as-is, such as the Claude
 * Design sync (.design-sync/config.json cssEntry). Remote @imports (Google Fonts) stay at the top.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const seen = new Set();
function inline(file) {
  if (seen.has(file)) return '';
  seen.add(file);
  return readFileSync(file, 'utf8').replace(/^@import\s+['"](\.[^'"]+)['"];?\s*$/gm, (_, rel) => inline(resolve(dirname(file), rel)));
}
const css = inline(resolve('src/styles.css'));
mkdirSync('dist-lib', { recursive: true });
writeFileSync('dist-lib/styles.css', css);
console.log(`flatten-css: dist-lib/styles.css (${Math.round(css.length / 1024)} KB from ${seen.size} files)`);
