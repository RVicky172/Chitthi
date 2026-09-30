#!/usr/bin/env node
/*
 * Runs after `vite build`: keeps the start-up bundle small. The entry chunk must stay under the budget, and AI code
 * (provider SDKs, adapters) must never be in it: it loads only when someone uses an AI feature.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_KB = 350; // current entry ~333 KB plus headroom: raise only on purpose
const dir = 'dist/assets';
const html = readFileSync('dist/index.html', 'utf8');
const entry = /src="\.\/assets\/(index-[^"]+\.js)"/.exec(html)?.[1];
if (!entry) {
  console.error('check-bundle: entry script not found in dist/index.html');
  process.exit(1);
}
const code = readFileSync(join(dir, entry), 'utf8');
const kb = Math.round(Buffer.byteLength(code) / 1024);
const fails = [];
if (kb > BUDGET_KB) fails.push(`entry chunk ${entry} is ${kb} KB (budget ${BUDGET_KB} KB)`);
for (const marker of ['dangerouslyAllowBrowser', 'anthropic-version', 'generateContent', 'queue.fal.run'])
  if (code.includes(marker)) fails.push(`AI code (“${marker}”) is in the entry chunk; load it with import()`);
const ai = readdirSync(dir).filter((f) => /^(anthropic|openai|gemini|openaiCompat|stability|fal|bfl|replicate|ideogram)-.*\.js$/.test(f));
if (fails.length) {
  console.error(`check-bundle failed:\n  ${fails.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-bundle: entry ${kb} KB (budget ${BUDGET_KB} KB); ${ai.length} AI provider chunks load on demand.`);
