#!/usr/bin/env node
/*
 * Downloads the festival photos for the print samples (src/data/printSamples.ts) from Pexels into print-samples-src/
 * at print resolution. Every photo was picked by eye: festival objects, idols, lamps and landscapes, no people.
 * The folder is not committed (the photos are large); run this again to rebuild it.
 *
 *   PEXELS_API_KEY in .env.local, then:  npm run fetch:print-samples   and   npm run build:print-samples
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'print-samples-src');

/** [id, Pexels photo id, what it shows] */
const PHOTOS = [
  ['diwali-railing', 13689170, 'Diwali diyas on a railing'],
  ['ganesh-red', 9506889, 'Ganesh idol'],
  ['eid-lantern', 15834406, 'Eid lantern'],
  ['holi-cones', 3537741, 'Holi colour powder cones'],
  ['onam-pookalam', 8818623, 'Flower pookalam with lamps'],
  ['sankranti-kites', 31358776, 'Makar Sankranti kites'],
  ['kites-line', 929362, 'Kites in a blue sky'],
  ['lohri-bonfire', 27089289, 'Lohri bonfire'],
  ['mustard-punjab', 30684596, 'Mustard field, Punjab'],
  ['mustard-bloom', 37932918, 'Mustard flowers'],
  ['holi-bowls', 7176698, 'Holi colours in bowls'],
  ['holi-plate', 11546527, 'Gulal on a plate'],
  ['wheat-gold', 1603, 'Golden wheat'],
  ['wheat-fields', 9298428, 'Wheat fields'],
  ['buddha-gold', 35980723, 'Golden Buddha'],
  ['buddha-shrine', 39354759, 'Buddha shrine'],
  ['puri-temple', 32519960, 'Jagannath temple, Puri'],
  ['puri-sunset', 37121962, 'Jagannath temple at sunset'],
  ['monsoon-rain', 1463530, 'Monsoon rain on leaves'],
  ['monsoon-drops', 17673361, 'Raindrops on leaves'],
  ['rakhi', 12992568, 'Rakhi on white cloth'],
  ['krishna', 19992413, 'Krishna idol with marigolds'],
  ['ganesh-brass', 31452296, 'Brass Ganesha'],
  ['ganesh-jewels', 33643802, 'Ganesh idol'],
  ['durga-idols', 33669866, 'Durga Puja idols'],
  ['durga-pandal', 18365733, 'Durga Puja pandal'],
  ['diwali-diyas', 34641279, 'Diwali diyas'],
  ['diwali-glow', 10182772, 'Diwali diyas at night'],
  ['stars-red', 29614743, 'Christmas star lanterns'],
  ['stars-hanging', 6020476, 'Christmas star lanterns'],
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
for (const [id, pexelsId, what] of PHOTOS) {
  const res = await fetch(`https://api.pexels.com/v1/photos/${pexelsId}`, { headers: { Authorization: key } });
  if (!res.ok) {
    console.error(`  ! ${id}: lookup failed (HTTP ${res.status})`);
    if (res.status === 401 || res.status === 403) process.exit(1);
    continue;
  }
  const p = await res.json();
  // 4800 px on the long side: 300 dpi across an A3 page with bleed needs ~5000, and the engine caps photos at 16 MP.
  const file = join(OUT, `${id}.jpg`);
  if (!existsSync(file)) {
    const long = p.width >= p.height ? 'w' : 'h';
    const img = await fetch(`${p.src.original}?auto=compress&cs=srgb&q=92&${long}=${Math.min(4800, Math.max(p.width, p.height))}`);
    if (!img.ok) {
      console.error(`  ! ${id}: download failed`);
      continue;
    }
    writeFileSync(file, Buffer.from(await img.arrayBuffer()));
  }
  manifest.push({ id, file: `${id}.jpg`, what, alt: p.alt, photographer: p.photographer, photographerUrl: p.photographer_url, pexelsUrl: p.url });
  console.log(`  ${id}.jpg  ${p.photographer}`);
}
writeFileSync(join(OUT, 'photos.json'), JSON.stringify({ source: 'Pexels', license: 'https://www.pexels.com/license/', photos: manifest }, null, 2) + '\n');
console.log(`Saved ${manifest.length} photos to print-samples-src/. Now run: npm run build:print-samples (with npm run dev running).`);
