/*
 * Development only (never in production builds): renders the landing page examples in src/data/showcase.ts with the
 * real engine. Opened by scripts/build-showcase.cjs at http://localhost:5173/?showcase, which calls
 * window.__chitthiShowcase() and writes the WebP files and the manifest.
 */
import { SHOWCASE, type ShowcaseImage, type ShowcaseRender } from '../data/showcase';
import { cardMM, cornerMM, productDesign, sizeOf } from '../engine/design';
import { envelopeSpec } from '../engine/envelope';
import { renderEnvelope } from '../engine/envelopeDraw';
import { loadImage, makePhoto } from '../engine/photo';
import { renderCard } from '../engine/render';
import { ensureFonts, fontsFor } from '../lib/fonts';
import type { Design, LookId, Photo, RenderInput } from '../types';

/** A showcase photo's file and credit (public/showcase-src/photos.json, written by npm run fetch:showcase). */
interface Credit {
  id: string;
  file: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
}

/** A file for the build script to write: its name and its bytes as base64. */
interface OutFile {
  name: string;
  data: string;
}

/** Long side of each rendered image in pixels. */
const LONG = 1200;

/** Bytes per chunk when turning a blob into base64 (keeps String.fromCharCode's argument list small). */
const BASE64_CHUNK = 0x8000;

/**
 * Reads the showcase photos' credits.
 * @returns every credit in photos.json
 */
async function loadCredits(): Promise<Credit[]> {
  const response = await fetch('/showcase-src/photos.json');
  const body = (await response.json()) as { photos: Credit[] };
  return body.photos;
}

/**
 * Finds a photo's credit.
 * @param credits the credits from photos.json
 * @param id the photo's id
 * @returns its credit; throws when the photo hasn't been fetched
 */
function creditFor(credits: Credit[], id: string): Credit {
  const credit = credits.find((entry) => entry.id === id);
  if (!credit) throw new Error(`showcase photo "${id}" is missing: run npm run fetch:showcase`);
  return credit;
}

/**
 * Trims the render to the finished shape (rounded corners, round badges) with a transparent outside.
 * @param canvas the rendered card
 * @param design the design it shows
 */
function shape(canvas: HTMLCanvasElement, design: Design): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = sizeOf(design),
    { w } = cardMM(design),
    pxPerMM = canvas.width / w;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  if (size.shape === 'circle')
    ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
  else ctx.roundRect(0, 0, canvas.width, canvas.height, Math.max(2, cornerMM(design) * pxPerMM));
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Draws one face of an example: the card's front or back, or a part of its envelope.
 * @param face which face
 * @param input the design and its photos
 * @returns the canvas, LONG px on its long side
 */
function renderFace(face: ShowcaseRender, input: RenderInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  if (face === 'front' || face === 'back') {
    const { w, h } = cardMM(input.d);
    renderCard(canvas, face, LONG / Math.max(w, h), 0, input);
    shape(canvas, input.d);
  } else {
    const spec = envelopeSpec(input.d);
    const part = face.replace('envelope-', '') as 'front' | 'back' | 'body' | 'flap' | 'liner';
    renderEnvelope(canvas, part, LONG / Math.max(spec.w, spec.h), input);
  }
  return canvas;
}

/**
 * Renders every showcase example.
 * @returns the WebP files and the manifest the landing page reads
 */
async function render(): Promise<{ files: OutFile[]; manifest: ShowcaseImage[] }> {
  const credits = await loadCredits();
  const photoCache = new Map<string, Promise<Photo>>();
  const load = (id: string, look: LookId = 'none'): Promise<Photo> => {
    let photo = photoCache.get(`${id}:${look}`);
    if (!photo) {
      const credit = creditFor(credits, id);
      const url = `/showcase-src/${credit.file}`;
      photo = loadImage(url).then((img) =>
        makePhoto(img, `${credit.alt} (Pexels / ${credit.photographer})`, url, { look }),
      );
      photoCache.set(`${id}:${look}`, photo);
    }
    return photo;
  };
  const files: OutFile[] = [],
    manifest: ShowcaseImage[] = [];
  for (const def of SHOWCASE) {
    const design = def.build(productDesign(def.product)),
      photos = await Promise.all(def.photos.map((id) => load(id, def.look)));
    await ensureFonts(fontsFor(design));
    await document.fonts.ready;
    const who = [...new Set(def.photos)]
      .map((id) => creditFor(credits, id))
      .map((credit) => ({ name: credit.photographer, url: credit.photographerUrl }));
    for (const face of def.renders) {
      const canvas = renderFace(face, { d: design, photos });
      const suffix = face === 'front' ? '' : `-${face}`;
      const name = `${def.id}${suffix}.webp`;
      files.push({ name, data: canvas.toDataURL('image/webp', 0.84).split(',')[1] ?? '' });
      manifest.push({
        id: def.id,
        render: face,
        title: def.title,
        product: def.product,
        src: `showcase/${name}`,
        w: canvas.width,
        h: canvas.height,
        credits: who,
      });
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

/**
 * Turns a blob into base64.
 * @param blob the file
 * @returns its bytes as base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK)
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK));
  return btoa(binary);
}

/**
 * The print-shop documents for docs/print-quote/ (npm run build:quote-docs): the catalog and a sample request.
 * @returns the two PDFs
 */
async function quoteDocs(): Promise<OutFile[]> {
  const quote = await import('../engine/quote');
  const catalog = await quote.buildQuoteCatalog();
  const def = SHOWCASE.find((example) => example.id === 'diwali-postcard');
  if (!def) throw new Error('showcase example "diwali-postcard" is missing');
  const credits = await loadCredits();
  const photos = await Promise.all(
    def.photos.map(async (id) => {
      const credit = creditFor(credits, id);
      return makePhoto(await loadImage(`/showcase-src/${credit.file}`), credit.alt, `/showcase-src/${credit.file}`);
    }),
  );
  const design = def.build(productDesign(def.product));
  await ensureFonts(fontsFor(design));
  const sample = await quote.buildQuoteRequest({ d: design, photos });
  return [
    { name: 'Chitthi-print-specifications.pdf', data: await blobToBase64(catalog.blob) },
    { name: 'Sample-quote-request-postcard.pdf', data: await blobToBase64(sample.blob) },
  ];
}
declare global {
  interface Window {
    __chitthiQuoteDocs?: typeof quoteDocs;
  }
}
window.__chitthiQuoteDocs = quoteDocs;
