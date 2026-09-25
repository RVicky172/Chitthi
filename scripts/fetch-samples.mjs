#!/usr/bin/env node
/*
 * One-time download of the gallery's sample photos from Pexels (https://www.pexels.com/api/).
 *
 *   1. Put your key in .env.local (gitignored):   PEXELS_API_KEY=your-key
 *   2. npm run fetch:samples
 *
 * Photos land in public/samples/ with a samples.json manifest holding each photographer's credit, so the app
 * ships the images themselves and never needs (or exposes) the API key. Re-running replaces the set.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'public', 'samples');

/** What the samples need: festival, travel and family photos for postcards, 12 calendar months and frames. */
const QUERIES = [
  ['diwali', 'diwali diya lamps', 'landscape'],
  ['holi', 'holi festival colours', 'landscape'],
  ['birthday', 'birthday cake candles', 'landscape'],
  ['backwaters', 'kerala backwaters boat', 'landscape'],
  ['himalaya', 'himalaya mountains snow', 'landscape'],
  ['monsoon', 'monsoon rain green hills india', 'landscape'],
  ['beach', 'goa beach sunset', 'landscape'],
  ['tajmahal', 'taj mahal', 'landscape'],
  ['marigold', 'marigold flowers', 'landscape'],
  ['desert', 'rajasthan desert camel', 'landscape'],
  ['tea', 'tea plantation hills', 'landscape'],
  ['lotus', 'lotus flower pond', 'landscape'],
  ['family', 'indian family portrait smiling', 'portrait'],
  ['kids', 'children playing outdoors india', 'portrait'],
];

function readKey() {
  if (process.env.PEXELS_API_KEY) return process.env.PEXELS_API_KEY.trim();
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    const m = /^\s*PEXELS_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(readFileSync(f, 'utf8'));
    if (m) return m[1].trim();
  }
  return null;
}

const key = readKey();
if (!key) {
  console.error('No PEXELS_API_KEY found. Add a line  PEXELS_API_KEY=your-key  to .env.local and run again.');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const [id, query, orientation] of QUERIES) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (res.status === 401 || res.status === 403) {
    console.error('Pexels rejected the API key (HTTP ' + res.status + '). Check PEXELS_API_KEY in .env.local.');
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`  ! ${id}: search failed (HTTP ${res.status}), skipped`);
    continue;
  }
  const { photos = [] } = await res.json();
  const p = photos.find((x) => x.width >= 1600 && x.height >= 1000) ?? photos[0];
  if (!p) {
    console.error(`  ! ${id}: no results, skipped`);
    continue;
  }
  // 1600px on the long side: sharp enough for a 6x4 in print, ~200-400 KB each.
  const long = orientation === 'portrait' ? 'h' : 'w';
  const img = await fetch(`${p.src.original}?auto=compress&cs=tinysrgb&fm=jpg&${long}=1600`);
  if (!img.ok) {
    console.error(`  ! ${id}: download failed (HTTP ${img.status}), skipped`);
    continue;
  }
  const file = `${id}.jpg`;
  writeFileSync(join(OUT, file), Buffer.from(await img.arrayBuffer()));
  manifest.push({
    id,
    file,
    alt: p.alt || query,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pexelsUrl: p.url,
    avgColor: p.avg_color,
  });
  console.log(`  ✓ ${file}  by ${p.photographer}`);
}
writeFileSync(join(OUT, 'samples.json'), JSON.stringify({ source: 'Pexels', license: 'https://www.pexels.com/license/', photos: manifest }, null, 2) + '\n');
console.log(`\n${manifest.length} photos saved to public/samples/ (credits in samples.json).`);
