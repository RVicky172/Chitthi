#!/usr/bin/env node
/*
 * Downloads the photos for the landing page examples from Pexels into showcase-src/ (kept in the repo, not shipped:
 * only the rendered examples in public/showcase/ are). A different set from the gallery samples.
 *
 *   PEXELS_API_KEY in .env.local, then:  npm run fetch:showcase   and   npm run build:showcase
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'showcase-src');

/** [id, search, orientation] */
const QUERIES = [
  ['rangoli', 'rangoli colours diwali', 'landscape'],
  ['couple', 'indian wedding couple', 'portrait'],
  ['hawamahal', 'hawa mahal jaipur', 'portrait'],
  ['ghats', 'varanasi ghats boats', 'landscape'],
  ['chai', 'masala chai cup', 'landscape'],
  ['spices', 'indian spices market', 'landscape'],
  ['ladakh', 'pangong lake ladakh', 'landscape'],
  ['sunflower', 'sunflower field sunset', 'landscape'],
  ['grandma', 'indian grandmother smiling', 'portrait'],
  ['kites', 'colourful kites sky', 'landscape'],
  ['mumbai', 'mumbai marine drive', 'landscape'],
  ['temple', 'south indian temple gopuram', 'portrait'],
  ['puppy', 'puppy portrait', 'square'],
  ['lanterns', 'lanterns festival night', 'portrait'],
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
  console.error('No PEXELS_API_KEY found. Add  PEXELS_API_KEY=your-key  to .env.local and run again.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const [id, query, orientation] of QUERIES) {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=${orientation}`, {
    headers: { Authorization: key },
  });
  if (!res.ok) {
    console.error(`  ! ${id}: search failed (HTTP ${res.status})`);
    if (res.status === 401 || res.status === 403) process.exit(1);
    continue;
  }
  const { photos = [] } = await res.json();
  const p = photos.find((x) => Math.min(x.width, x.height) >= 1400) ?? photos[0];
  if (!p) {
    console.error(`  ! ${id}: no results`);
    continue;
  }
  // 1800 px on the long side: plenty for 1100 px renders, small in the repo.
  const long = p.width >= p.height ? 'w' : 'h';
  const img = await fetch(`${p.src.original}?auto=compress&cs=tinysrgb&${long}=1800`);
  if (!img.ok) {
    console.error(`  ! ${id}: download failed`);
    continue;
  }
  writeFileSync(join(OUT, `${id}.jpg`), Buffer.from(await img.arrayBuffer()));
  manifest.push({ id, file: `${id}.jpg`, alt: p.alt, photographer: p.photographer, photographerUrl: p.photographer_url, pexelsUrl: p.url });
  console.log(`  ${id}.jpg  ${p.photographer}`);
}
writeFileSync(join(OUT, 'photos.json'), JSON.stringify({ source: 'Pexels', license: 'https://www.pexels.com/license/', photos: manifest }, null, 2) + '\n');
console.log(`Saved ${manifest.length} photos to showcase-src/. Now run: npm run build:showcase (with npm run dev running).`);
