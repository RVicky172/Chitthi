/*
 * Downloads every card font and the UI fonts from Google Fonts into electron/resources/fonts/, so the desktop app
 * works fully offline. Each family gets <slug>.css pointing at local .woff2 files; the UI fonts go in ui.css.
 * All fonts are SIL Open Font License, which allows bundling them. Run: npm run fetch:fonts
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'electron', 'resources', 'fonts');
const files = path.join(out, 'files');
// A current browser UA so Google serves woff2.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Same slug rule as fontSlug() in src/lib/fonts.ts.
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// The family list lives in src/data/fonts.ts as ['Name', 'cat', [weights], ...] rows.
const src = await readFile(path.join(root, 'src', 'data', 'fonts.ts'), 'utf8');
const families = [...src.matchAll(/\[\s*'([^']+)',\s*'[a-z]+',\s*\[([\d,\s]+)\]/g)].map((m) => ({
  name: m[1],
  weights: m[2].split(',').map((w) => Number(w.trim())),
}));
if (!families.length) throw new Error('No fonts found in src/data/fonts.ts');

const UI_URL =
  'https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&family=Instrument+Serif:ital@0;1&family=Hind:wght@400;600&family=Mukta:wght@400;700&family=Tiro+Devanagari+Hindi&display=swap';

async function get(url, as) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return as === 'text' ? await r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
    }
  }
}

/** Fetches a Google Fonts stylesheet, downloads its font files and rewrites it to point at them. */
async function localise(url, target) {
  let css = await get(url, 'text');
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  for (const u of urls) {
    const name = createHash('sha1').update(u).digest('hex').slice(0, 16) + path.extname(new URL(u).pathname);
    const file = path.join(files, name);
    if (!existsSync(file)) await writeFile(file, await get(u));
    css = css.split(u).join(`./files/${name}`);
  }
  await writeFile(path.join(out, target), css);
  return urls.length;
}

await mkdir(files, { recursive: true });
let n = 0;
for (const f of families) {
  const w = f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(';')}` : '';
  n += await localise(`https://fonts.googleapis.com/css2?family=${f.name.replace(/ /g, '+')}${w}&display=swap`, `${slug(f.name)}.css`);
  process.stdout.write('.');
}
n += await localise(UI_URL, 'ui.css');
console.log(`\n${families.length} card families + UI fonts (${n} font files) → ${path.relative(root, out)}`);
