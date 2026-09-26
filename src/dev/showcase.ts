/*
 * Development only (never in production builds): renders the landing page examples in src/data/showcase.ts with the
 * real engine. Opened by scripts/build-showcase.cjs at http://localhost:5173/?showcase, which calls
 * window.__chitthiShowcase() and writes the WebP files and the manifest.
 */
import { SHOWCASE, type ShowcaseImage, type ShowcaseRender } from '../data/showcase';
import { cardMM, cornerMM, productDesign, sizeOf } from '../engine/design';
import { envelopeSpec, renderEnvelope } from '../engine/envelope';
import { loadImage, makePhoto } from '../engine/photo';
import { renderCard } from '../engine/render';
import { ensureFonts, fontsFor } from '../lib/fonts';
import type { Design, Photo } from '../types';

interface Credit {
  id: string;
  file: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
}

/** Long side of each rendered image in pixels. */
const LONG = 1200;

/** Trims the render to the finished shape (rounded corners, round badges) with a transparent outside. */
function shape(cv: HTMLCanvasElement, d: Design): void {
  const c = cv.getContext('2d');
  if (!c) return;
  const s = sizeOf(d),
    { w } = cardMM(d),
    k = cv.width / w;
  c.globalCompositeOperation = 'destination-in';
  c.beginPath();
  if (s.shape === 'circle') c.arc(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) / 2, 0, Math.PI * 2);
  else c.roundRect(0, 0, cv.width, cv.height, Math.max(2, cornerMM(d) * k));
  c.fill();
  c.globalCompositeOperation = 'source-over';
}

async function render(): Promise<{ files: { name: string; data: string }[]; manifest: ShowcaseImage[] }> {
  const credits: Credit[] = (await (await fetch('/showcase-src/photos.json')).json()).photos;
  const photo = new Map<string, Promise<Photo>>();
  const load = (id: string) => {
    let p = photo.get(id);
    if (!p) {
      const c = credits.find((x) => x.id === id);
      if (!c) throw new Error(`showcase photo "${id}" is missing: run npm run fetch:showcase`);
      p = loadImage(`/showcase-src/${c.file}`).then((img) => makePhoto(img, `${c.alt} (Pexels / ${c.photographer})`, `/showcase-src/${c.file}`));
      photo.set(id, p);
    }
    return p;
  };
  const files: { name: string; data: string }[] = [],
    manifest: ShowcaseImage[] = [];
  for (const def of SHOWCASE) {
    const d = def.build(productDesign(def.product)),
      photos = await Promise.all(def.photos.map(load));
    await ensureFonts(fontsFor(d));
    await document.fonts.ready;
    const who = [...new Set(def.photos)].map((id) => credits.find((c) => c.id === id)!).map((c) => ({ name: c.photographer, url: c.photographerUrl }));
    for (const r of def.renders as ShowcaseRender[]) {
      const cv = document.createElement('canvas');
      if (r === 'front' || r === 'back') {
        const { w, h } = cardMM(d);
        renderCard(cv, r, LONG / Math.max(w, h), 0, { d, photos });
        shape(cv, d);
      } else {
        const s = envelopeSpec(d);
        const face = r.replace('envelope-', '') as 'front' | 'back' | 'body' | 'flap' | 'liner';
        renderEnvelope(cv, face, LONG / Math.max(s.w, s.h), { d, photos });
      }
      const name = `${def.id}${r === 'front' ? '' : `-${r}`}.webp`;
      files.push({ name, data: cv.toDataURL('image/webp', 0.84).split(',')[1] });
      manifest.push({ id: def.id, render: r, title: def.title, product: def.product, src: `showcase/${name}`, w: cv.width, h: cv.height, credits: who });
    }
  }
  return { files, manifest };
}

declare global {
  interface Window {
    __chitthiShowcase?: typeof render;
  }
}
window.__chitthiShowcase = render;

/** The print-shop documents for docs/print-quote/ (npm run build:quote-docs): the catalog and a sample request. */
async function quoteDocs(): Promise<{ name: string; data: string }[]> {
  const q = await import('../engine/quote');
  const toB64 = async (b: Blob) => {
    const bytes = new Uint8Array(await b.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const catalog = await q.buildQuoteCatalog();
  const def = SHOWCASE.find((x) => x.id === 'diwali-postcard')!;
  const credits: Credit[] = (await (await fetch('/showcase-src/photos.json')).json()).photos;
  const photos = await Promise.all(
    def.photos.map(async (id) => {
      const c = credits.find((x) => x.id === id)!;
      return makePhoto(await loadImage(`/showcase-src/${c.file}`), c.alt, `/showcase-src/${c.file}`);
    }),
  );
  const d = def.build(productDesign(def.product));
  await ensureFonts(fontsFor(d));
  const sample = await q.buildQuoteRequest({ d, photos });
  return [
    { name: 'Chitthi-print-specifications.pdf', data: await toB64(catalog.blob) },
    { name: 'Sample-quote-request-postcard.pdf', data: await toB64(sample.blob) },
  ];
}
declare global {
  interface Window {
    __chitthiQuoteDocs?: typeof quoteDocs;
  }
}
window.__chitthiQuoteDocs = quoteDocs;
