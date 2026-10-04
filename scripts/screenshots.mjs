#!/usr/bin/env node
/*
 * Makes the README's screenshots (docs/screenshots/*.webp) from the running app, so they can be redone whenever the UI
 * changes: npm run screenshots (all) or node scripts/screenshots.mjs media-editor docs (some). Starts its own Vite dev
 * server, opens Chromium at 1600 × 1000 (the phone shot at 390 × 844), sets each scene up through the app's own store
 * and actions (sample designs and sample photos from public/samples/, no people), and saves each as WebP.
 */
/* global window, document, Image -- used inside page.evaluate() and addInitScript(), which run in the browser */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const OUT = 'docs/screenshots';
const only = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });

// No Pexels key: search results could show people, and photos of people never appear in Chitthi's pictures.
process.env.PEXELS_API_KEY = '';
const server = await createServer({ configFile: 'vite.config.ts', cacheDir: 'node_modules/.vite-shots', logLevel: 'error', server: { port: 5196, strictPort: false } });
await server.listen();
const BASE = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--force-color-profile=srgb'] });

/** A fresh page in light or dark theme, with toasts hidden and the app's modules reachable. */
async function open(hash = '', { phone = false, dark = false } = {}) {
  const ctx = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1600, height: 1000 },
    deviceScaleFactor: phone ? 2 : 1,
    colorScheme: dark ? 'dark' : 'light',
    isMobile: phone,
    hasTouch: phone,
  });
  await ctx.addInitScript((d) => {
    try {
      localStorage.setItem('chitthi-theme', d ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }, dark);
  // Music for the video scenes: a soft generated chord as a WAV file, so the timeline shows a waveform (no music ships).
  await ctx.addInitScript(() => {
    window.__music = (secs) => {
      const rate = 22050,
        n = rate * secs,
        data = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / rate,
          env = 0.5 + 0.5 * Math.sin(t * 1.3);
        data[i] = Math.round((9000 * env * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 277 * t) + 0.4 * Math.sin(2 * Math.PI * 330 * t))) / 2);
      }
      const head = new DataView(new ArrayBuffer(44));
      const w = (o, s) => [...s].forEach((c, k) => head.setUint8(o + k, c.charCodeAt(0)));
      w(0, 'RIFF');
      head.setUint32(4, 36 + n * 2, true);
      w(8, 'WAVEfmt ');
      head.setUint32(16, 16, true);
      head.setUint16(20, 1, true);
      head.setUint16(22, 1, true);
      head.setUint32(24, rate, true);
      head.setUint32(28, rate * 2, true);
      head.setUint16(32, 2, true);
      head.setUint16(34, 16, true);
      w(36, 'data');
      head.setUint32(40, n * 2, true);
      return new File([head.buffer, data.buffer], 'music.wav', { type: 'audio/wav' });
    };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  await page.goto(BASE + hash);
  await page.addStyleTag({ content: '#toast{display:none!important} *{caret-color:transparent!important}' });
  await page.waitForTimeout(1500);
  return page;
}

/** Saves the viewport (or an element) as WebP, encoded by the page itself. */
async function shot(page, name, target) {
  const png = await (target ?? page).screenshot({ type: 'png' });
  const webp = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, png.toString('base64'));
  writeFileSync(`${OUT}/${name}.webp`, Buffer.from(webp, 'base64'));
  console.log(`  ${name}.webp`);
}

/** In the page: opens a sample design from the gallery's set by id. */
const sample = (page, id) =>
  page.evaluate(async (id) => {
    const { SAMPLES, buildSample, sampleCredits } = await import('/src/data/samples.ts');
    const { openSample } = await import('/src/state/actions.ts');
    const def = SAMPLES.find((s) => s.id === id);
    const credits = await sampleCredits();
    const s = await buildSample(def, credits);
    await openSample(s.design, s.photos);
  }, id);

/** In the page: fills the Instagram batch with sample photos. */
const batch = (page, names) =>
  page.evaluate(async (names) => {
    const ig = await import('/src/state/instagram.ts');
    ig.clearBatch();
    const files = await Promise.all(names.map(async (n) => ({ name: `${n}.jpg`, blob: await (await fetch(`/samples/${n}.jpg`)).blob() })));
    await ig.addPhotos(files);
    ig.selectPhoto(ig.getIg().items[0].id);
  }, names);

const tool = (page, name) => page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name, exact: true }).click();

const SCENES = {
  async home() {
    const page = await open('');
    await page.waitForTimeout(1500);
    await shot(page, 'home');
  },
  async 'home-studios'() {
    const page = await open('');
    await page.locator('#studios').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.getElementById('studios').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await shot(page, 'home-studios');
  },
  async 'studio-postcard'() {
    const page = await open('#/studio');
    await sample(page, 'diwali-arch');
    await page.waitForTimeout(1500);
    await shot(page, 'studio-postcard');
  },
  async 'studio-calendar'() {
    const page = await open('#/studio');
    await sample(page, 'year-calendar');
    await page.evaluate(async () => (await import('/src/state/store.ts')).setUI({ pane: 'words' }));
    await page.waitForTimeout(1500);
    await shot(page, 'studio-calendar');
  },
  async 'ai-writing'() {
    const page = await open('#/studio');
    await sample(page, 'holi-full');
    await page.evaluate(async () => (await import('/src/state/store.ts')).setUI({ pane: 'words' }));
    await page.waitForTimeout(800);
    const ai = page.getByRole('button', { name: /Write with AI/ }).first();
    if (await ai.count()) await ai.click();
    await page.waitForTimeout(1000);
    await shot(page, 'ai-writing');
  },
  async 'print-step'() {
    const page = await open('#/studio');
    await sample(page, 'india-collage');
    await page.evaluate(async () => (await import('/src/state/store.ts')).setUI({ pane: 'print' }));
    await page.waitForTimeout(1500);
    await shot(page, 'print-step');
  },
  async 'photo-library'() {
    const page = await open('#/studio');
    await sample(page, 'india-collage');
    await page.evaluate(async () => (await import('/src/state/store.ts')).setUI({ library: true }));
    await page.waitForTimeout(2500);
    await shot(page, 'photo-library');
  },
  async 'viewer-3d'() {
    const page = await open('#/studio');
    await sample(page, 'diwali-arch');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /3D/ }).first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'viewer-3d');
  },
  async 'paper-3d'() {
    const page = await open('#/paper');
    await page.waitForTimeout(2500);
    await shot(page, 'paper-3d');
  },
  async 'perf-monitor'() {
    const page = await open('#/studio');
    await sample(page, 'kerala-stamp');
    await page.evaluate(async () => (await import('/src/state/store.ts')).setUI({ perf: true }));
    await page.waitForTimeout(4000);
    await shot(page, 'perf-monitor');
  },
  async 'media-photo'() {
    const page = await open('#/instagram');
    await batch(page, ['holi-bowls', 'puri-temple', 'lotus', 'marigold']);
    await page.evaluate(async () => {
      const ig = await import('/src/state/instagram.ts');
      const L = await import('/src/engine/layers.ts');
      const { TEXT_STYLES } = await import('/src/data/layers.ts');
      const id = ig.getIg().items[0].id;
      ig.addLayer(id, { ...L.newText(TEXT_STYLES[1] ?? TEXT_STYLES[0], 'Happy Holi'), y: 0.16, size: 0.11 });
      const st = { ...L.newSticker('🎉'), x: 0.8, y: 0.82, w: 0.2 };
      ig.addLayer(id, st);
    });
    await tool(page, 'Elements');
    await page.waitForTimeout(1500);
    await shot(page, 'media-photo');
  },
  async 'media-editor'() {
    const page = await open('#/instagram');
    await batch(page, ['puri-sunset', 'puri-temple', 'lotus', 'marigold']);
    await page.evaluate(async () => {
      const ig = await import('/src/state/instagram.ts');
      const id = ig.getIg().items[0].id;
      ig.adjustPhoto(id, { look: 'warm', exposure: 0.25, shadows: 35, highlights: -30, clarity: 20, vignette: 25, curve: { rgb: [[0, 0], [0.28, 0.22], [0.72, 0.8], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] } });
    });
    await page.waitForTimeout(1200);
    // The inspector at its light, colour and tone curve sections.
    await page.getByRole('heading', { name: /Tone curve/ }).first().scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(800);
    await shot(page, 'media-editor');
  },
  async 'media-masks'() {
    const page = await open('#/instagram');
    await batch(page, ['puri-temple', 'marigold', 'lotus', 'tea']);
    await tool(page, 'Masks');
    await page.getByRole('button', { name: 'New subject mask, found by AI' }).click();
    await page.getByText(/Found on this device by an AI model/).waitFor({ timeout: 60000 });
    await page.evaluate(async () => {
      const ig = await import('/src/state/instagram.ts');
      const it = ig.getIg().items[0];
      ig.updateMask(it.id, it.edit.masks[0].id, (m) => ({ ...m, adjust: { ...m.adjust, exposure: 0.35, clarity: 30, temperature: 15 } }));
    });
    await page.waitForTimeout(1500);
    await shot(page, 'media-masks');
  },
  async 'media-reel'() {
    const page = await open('#/instagram/video');
    await page.evaluate(async () => {
      const v = await import('/src/state/video.ts');
      v.setKind('reel');
      const names = ['holi-bowls', 'marigold', 'kites-line', 'lotus'];
      await v.addMedia(await Promise.all(names.map(async (n) => ({ name: `${n}.jpg`, blob: await (await fetch(`/samples/${n}.jpg`)).blob() }))));
      const L = await import('/src/engine/layers.ts');
      const { TEXT_STYLES } = await import('/src/data/layers.ts');
      v.addVLayer({ ...L.newText(TEXT_STYLES[2] ?? TEXT_STYLES[0], 'Festival memories'), y: 0.2 });
      v.addVLayer({ ...L.newSticker('🎉'), x: 0.75, y: 0.78, w: 0.22 });
      await v.setMusicFile(window.__music(12));
      v.selectClip(v.getVideo().clips[0].id);
    });
    await page.waitForTimeout(2500);
    await shot(page, 'media-reel');
  },
  async 'media-video'() {
    const page = await open('#/instagram/youtube');
    await page.evaluate(async () => {
      const v = await import('/src/state/video.ts');
      v.setKind('vlog');
      const names = ['puri-temple', 'puri-sunset', 'wheat-fields', 'himalaya', 'tea'];
      await v.addMedia(await Promise.all(names.map(async (n) => ({ name: `${n}.jpg`, blob: await (await fetch(`/samples/${n}.jpg`)).blob() }))));
      const L = await import('/src/engine/layers.ts');
      const { TEXT_STYLES } = await import('/src/data/layers.ts');
      v.addVLayer({ ...L.newText(TEXT_STYLES[0], 'A week in Odisha'), y: 0.8 });
      await v.setMusicFile(window.__music(20));
      v.selectClip(v.getVideo().clips[0].id);
    });
    await page.waitForTimeout(3000);
    await shot(page, 'media-video');
  },
  async docs() {
    const page = await open('#/docs/photo');
    await page.waitForTimeout(800);
    await shot(page, 'docs');
  },
  async 'phone-dark'() {
    const page = await open('#/studio', { phone: true, dark: true });
    await sample(page, 'holi-full');
    await page.waitForTimeout(2000);
    await shot(page, 'phone-dark');
  },
};

for (const [name, run] of Object.entries(SCENES)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await run();
  } catch (e) {
    console.error(`  ${name} failed: ${e.message}`);
    process.exitCode = 1;
  }
}
await browser.close();
await server.close();
