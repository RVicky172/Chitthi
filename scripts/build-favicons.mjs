// Builds every Chitthi icon from the navbar logo (the ring with the name around it and चिट्ठी in the middle).
//
//   npm run build:favicons
//
// 1. Fetches tiny subsets of the two logo fonts from Google Fonts (only the letters used) and embeds them in the SVG
//    sources, so the icons look the same everywhere: SVG icons can't load web fonts, only embedded ones.
// 2. Writes public/favicon/favicon.svg (simplified, for browser tabs), logo.svg (full logo tile) and maskable.svg.
// 3. Renders every PNG size, favicon.ico and the desktop icon build/icon.png in Electron (scripts/build-favicons.cjs).
//    Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, so it is removed, as in electron/dev.mjs.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'public', 'favicon');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const RING = 'CHITTHI ✦ PRINT STUDIO ✦';
const WORD = 'चिट्ठी';

/** A woff2 subset of `family` holding just `text`, as a data URL. */
async function subset(family, weight, text) {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`, {
      headers: { 'User-Agent': UA },
    })
  ).text();
  const url = /src:\s*url\((https:[^)]+)\)/.exec(css)?.[1];
  if (!url) throw new Error(`No font file for ${family}`);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

const hind = await subset('Hind', 600, RING.replace(/[ ✦]/g, ''));
const rozha = await subset('Rozha One', 400, WORD);
const fonts = `<style>@font-face{font-family:'LogoSans';font-weight:600;src:url(${hind}) format('woff2')}@font-face{font-family:'LogoWord';src:url(${rozha}) format('woff2')}</style>`;

const TILE = `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a3c"/><stop offset="1" stop-color="#5f3a22"/></linearGradient>`;
const CREAM = '#F6ECDC',
  SAFFRON = '#F0A04B';

/** The navbar logo (120 × 120 units), drawn in cream. */
const logo = `
  <path id="ring" d="M60,60 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0" fill="none"/>
  <circle cx="60" cy="60" r="52" fill="none" stroke="${CREAM}" stroke-width="3.5"/>
  <circle cx="60" cy="60" r="31" fill="none" stroke="${CREAM}" stroke-width="1.8"/>
  <text font-family="LogoSans, Hind, sans-serif" font-size="11.5" font-weight="600" fill="${CREAM}"><textPath href="#ring" startOffset="1%" textLength="244" lengthAdjust="spacing">${RING}</textPath></text>
  <text x="60" y="68" text-anchor="middle" font-family="LogoWord, 'Rozha One', serif" font-size="21" fill="${SAFFRON}">${WORD}</text>`;

const svg = (body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs>${TILE}${defs}</defs>${fonts}${body}</svg>\n`;

// Full logo on a rounded umber tile: app icons, home-screen icons, the desktop app.
const full = svg(`<rect width="128" height="128" rx="28" fill="url(#t)"/><g transform="translate(10 10) scale(0.9)">${logo}</g>`);
// Full-bleed version with the logo inside the safe zone, for icons the OS masks into its own shape.
const maskable = svg(`<rect width="128" height="128" fill="url(#t)"/><g transform="translate(20 20) scale(0.7333)">${logo}</g>`);
// Browser tabs (16–48 px): the ring text is too small to read there, so the ring and चि alone.
const small = svg(
  `<rect width="128" height="128" rx="28" fill="url(#t)"/>
  <circle cx="64" cy="64" r="46" fill="none" stroke="${CREAM}" stroke-width="7"/>
  <text x="64" y="84" text-anchor="middle" font-family="LogoWord, 'Rozha One', serif" font-size="60" fill="${SAFFRON}">चि</text>`,
);

writeFileSync(join(DIR, 'logo.svg'), full);
writeFileSync(join(DIR, 'maskable.svg'), maskable);
writeFileSync(join(DIR, 'favicon.svg'), small);
console.log('  public/favicon/logo.svg, maskable.svg, favicon.svg (fonts embedded)');

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, [new URL('./build-favicons.cjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'inherit', env }).on('exit', (c) =>
  process.exit(c ?? 0),
);
