/*
 * Development only (never in production builds): renders the print samples in src/data/printSamples.ts with the real
 * export engine. Opened by scripts/build-print-samples.cjs at http://localhost:5173/?printsamples, which asks for one
 * job at a time and pulls each finished file with take(), so no single transfer holds a whole calendar.
 */
import { layoutName } from '../data/layouts';
import { PRINT_SPECS, QUOTE_QTY } from '../data/printSpecs';
import { PRINT_SAMPLES, PRINT_SAMPLE_YEAR, printSampleDesign, type PrintSampleDef } from '../data/printSamples';
import { productOf } from '../data/products';
import { calPages, cardMM, productDesign, sizeOf } from '../engine/design';
import { envelopeSpec, envelopeSummary, renderEnvelope, templateSheet } from '../engine/envelope';
import { buildEnvelopePDF, buildEnvelopeTemplate, buildPDF, buildPNG, nup, pagesOf, printSpec, SHEETS } from '../engine/export';
import { loadImage, makePhoto } from '../engine/photo';
import { pexelsIdOf, pexelsName } from '../lib/credits';
import { ensureFonts, fontsFor } from '../lib/fonts';
import type { Design, Photo, RenderInput } from '../types';

interface Credit {
  id: string;
  file: string;
  what: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

const PRODUCT_DIR = { postcard: '01-Postcards', calendar: '02-Calendars' } as Record<string, string>;
const ENV_DIR = '03-Envelopes';

const store = new Map<string, Blob>();
const put = (path: string, data: Blob | string) =>
  store.set(path, typeof data === 'string' ? new Blob([data.replace(/\r?\n/g, '\r\n')], { type: 'text/plain' }) : data);

let credits: Credit[] | null = null;
const photoCache = new Map<string, Promise<Photo>>();
async function photosFor(ids: string[]): Promise<Photo[]> {
  credits ??= (await (await fetch('/print-samples-src/photos.json')).json()).photos as Credit[];
  return Promise.all(
    ids.map((id) => {
      let p = photoCache.get(id);
      if (!p) {
        const c = credits!.find((x) => x.id === id);
        if (!c) throw new Error(`print sample photo "${id}" is missing: run npm run fetch:print-samples`);
        p = loadImage(`/print-samples-src/${c.file}`).then((img) => makePhoto(img, pexelsName(c.what, c.photographer, pexelsIdOf(c.pexelsUrl)), `/print-samples-src/${c.file}`));
        photoCache.set(id, p);
      }
      return p;
    }),
  );
}

async function inputFor(def: PrintSampleDef, env = false): Promise<RenderInput> {
  const d = printSampleDesign(def, productDesign(def.product));
  if (env) d.env = { ...d.env, on: true };
  await ensureFonts(fontsFor(d));
  await document.fonts.ready;
  return { d, photos: await photosFor(def.photos) };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const tick = () => new Promise((r) => setTimeout(r, 20));

/** One sample's folder: every page as a 300 dpi PNG, the print PDF, (postcards) a sheet PDF, quote request and spec. */
async function renderSample(i: number): Promise<string[]> {
  const def = PRINT_SAMPLES[i],
    inp = await inputFor(def),
    dir = `${PRODUCT_DIR[def.product]}/${def.id}`,
    made: string[] = [];
  const add = (name: string, data: Blob | string) => {
    put(`${dir}/${name}`, data);
    made.push(name);
  };
  for (const pg of pagesOf(inp.d)) {
    await tick();
    const { blob, name } = await buildPNG(pg, inp);
    add(`${pg.side === 'front' ? (def.product === 'calendar' ? 'pages' : 'front') : 'back'}/${name}`, blob);
  }
  const pdf = await buildPDF(inp, 'pdf');
  add(pdf.name, pdf.blob);
  if (def.product === 'postcard') {
    const sheet = await buildPDF(inp, 'sheet');
    add(sheet.name, sheet.blob);
  }
  const { buildQuoteRequest } = await import('../engine/quote');
  const quote = await buildQuoteRequest(inp);
  add(quote.name, quote.blob);
  const specName = `${inp.d.designName.toLowerCase()}-PRINT-SPEC.txt`;
  add(specName, printSpec(inp, [...made, specName]));
  return made.map((m) => `${dir}/${m}`);
}

/** The envelope sizes: one folder per card size, drawn from the horizontal sample of that size. */
function envelopeJobs(): { def: PrintSampleDef; dir: string }[] {
  const sizes = [...new Set(PRINT_SAMPLES.map((s) => s.sizeId))];
  const out = sizes.map((id) => ({
    def: PRINT_SAMPLES.find((s) => s.sizeId === id && s.orient === 'landscape') ?? PRINT_SAMPLES.find((s) => s.sizeId === id)!,
    dir: '',
  }));
  out.forEach((j, i) => {
    const d = printSampleDesign(j.def, productDesign(j.def.product)),
      s = envelopeSpec(d);
    j.dir = `${ENV_DIR}/E${i + 1}-for-${productOf(j.def.product).short}-${sizeOf(d).name.replace(/[^A-Za-z0-9]+/g, '-')}-${s.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '')}`;
  });
  return out;
}

async function renderEnvelope_(i: number): Promise<string[]> {
  const { def, dir } = envelopeJobs()[i],
    inp = await inputFor(def, true),
    d = inp.d,
    s = envelopeSpec(d),
    sh = templateSheet(d),
    made: string[] = [];
  const add = (name: string, data: Blob | string) => {
    put(`${dir}/${name}`, data);
    made.push(name);
  };
  const stem = `envelope-${s.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '').toLowerCase()}`;
  for (const face of ['front', 'back'] as const) {
    const cv = document.createElement('canvas');
    renderEnvelope(cv, face, +d.exp.dpi / 25.4, inp);
    add(`${stem}-${face}.png`, await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('envelope render'))), 'image/png')));
  }
  const ep = await buildEnvelopePDF(inp);
  add(`${stem}-print.pdf`, ep.blob);
  const tp = await buildEnvelopeTemplate(inp);
  if (tp) add(`${stem}-template-${sh!.id}.pdf`, tp.blob);
  const { w, h } = cardMM(d),
    spec = PRINT_SPECS.envelope,
    L: string[] = [];
  const line = (k: string, v: string) => L.push(`${(k ? k + ':' : '').padEnd(22)}${v}`);
  L.push('CHITTHI – ENVELOPE SPECIFICATION', '='.repeat(60), '');
  line('For', `${productOf(d.product).name}, ${sizeOf(d).name} (${r1(Math.min(w, h))} × ${r1(Math.max(w, h))} mm), both orientations`);
  line('Envelope', envelopeSummary(d));
  line('Envelope size', `${s.w} × ${s.h} mm`);
  line('Artwork', `${d.themeId} occasion design, matching sample ${def.id}`);
  L.push('', 'PRINTING', '-'.repeat(60));
  line('Material', spec.stock);
  line('Weight', spec.weight);
  line('Finish', spec.finish);
  line('Colour', spec.colour);
  spec.finishing.forEach((f, k) => line(k ? '' : 'Finishing', f));
  line('Ready-made', `Buy ${s.name} envelopes and print ${stem}-print.pdf on them: page 1 is the address side, page 2 the flap side.`);
  if (sh) line('Fold your own', `Print the template on ${sh.name} (120–160 gsm), cut on solid lines, fold on dashed lines, glue the bottom flap.`);
  else line('Fold your own', 'Too big for a printable template sheet: use ready-made envelopes.');
  line('Scale', 'Print at 100% / actual size.');
  L.push('', 'QUOTE', '-'.repeat(60));
  line('Quantities to price', QUOTE_QTY.join(', ') + ' pieces');
  L.push('', 'FILES', '-'.repeat(60), ...made.map((m) => `  ${m}`), '', `Created ${new Date().toLocaleString()} with Chitthi.`);
  add('ENVELOPE-SPEC.txt', L.join('\n'));
  return made.map((m) => `${dir}/${m}`);
}

/* ---------- the documents at the top of the folder ---------- */

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function sampleFacts(def: PrintSampleDef) {
  const d: Design = printSampleDesign(def, productDesign(def.product)),
    { w, h } = cardMM(d),
    b = +d.exp.bleed,
    px = (mm: number) => Math.round((mm / 25.4) * +d.exp.dpi),
    spec = PRINT_SPECS[d.product],
    pages = pagesOf(d),
    env = envelopeSpec(d);
  return {
    d,
    folder: `${PRODUCT_DIR[def.product]}/${def.id}`,
    product: productOf(d.product).name,
    size: sizeOf(d).name,
    orient: d.orient === 'landscape' ? 'Horizontal' : 'Vertical',
    trim: `${r1(w)} × ${r1(h)} mm`,
    doc: `${r1(w + 2 * b)} × ${r1(h + 2 * b)} mm`,
    pixels: `${px(w + 2 * b)} × ${px(h + 2 * b)} px`,
    pages:
      d.product === 'calendar'
        ? `${calPages(d)} month pages (Jan–Dec ${PRINT_SAMPLE_YEAR}) + year-at-a-glance back page = ${pages.length} pages`
        : 'Front (photo) + back (blank postal back to write on)',
    up: d.product === 'postcard' ? `${nup(d).cols * nup(d).rows} per ${SHEETS['1319'][2]} sheet` : '',
    layout: layoutName(d.layout),
    spec,
    env: `${env.name} (${env.w} × ${env.h} mm)`,
  };
}

function orderSheet(envDirs: string[]): string {
  const head = [
    'No',
    'Folder',
    'Item',
    'Festival / theme',
    'Size',
    'Orientation',
    'Trim size',
    'File size with 3 mm bleed',
    'Pixels at 300 dpi',
    'Pages / sides',
    'Layout',
    'Material',
    'Weight',
    'Finish',
    'Colour',
    'Finishing',
    'Matching envelope',
    'Qty wanted',
    ...QUOTE_QTY.map((q) => `Price per piece @ ${q}`),
    'Printer notes',
  ];
  const rows: (string | number)[][] = [head];
  PRINT_SAMPLES.forEach((def) => {
    const f = sampleFacts(def);
    rows.push([
      def.id.split('-')[0],
      f.folder,
      f.product,
      def.title,
      f.size,
      f.orient,
      f.trim,
      f.doc,
      f.pixels,
      f.pages,
      f.layout,
      f.spec.stock,
      f.spec.weight,
      f.spec.finish,
      f.spec.colour,
      f.spec.finishing.filter((x) => (def.product === 'calendar' ? !/Year strip/.test(x) : !/Instax/.test(x))).join('; '),
      f.env,
      '',
      ...QUOTE_QTY.map(() => ''),
      '',
    ]);
  });
  const e = PRINT_SPECS.envelope;
  envelopeJobs().forEach(({ def, dir }, i) => {
    const d = printSampleDesign(def, productDesign(def.product)),
      s = envelopeSpec(d),
      sh = templateSheet(d);
    rows.push([
      `E${i + 1}`,
      envDirs[i] ?? dir,
      'Envelope',
      `for ${productOf(d.product).name.toLowerCase()} ${sizeOf(d).name}`,
      s.name,
      'Horizontal',
      `${s.w} × ${s.h} mm`,
      'Envelope size (no bleed)',
      `${Math.round((s.w / 25.4) * 300)} × ${Math.round((s.h / 25.4) * 300)} px`,
      'Front (address side) + back (flap side)',
      sh ? `Fold-your-own template on ${sh.name} also supplied` : 'Ready-made envelope only',
      e.stock,
      e.weight,
      e.finish,
      e.colour,
      e.finishing.join('; '),
      '',
      '',
      ...QUOTE_QTY.map(() => ''),
      '',
    ]);
  });
  // A BOM so Excel opens the dashes and × signs correctly.
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function readme(envDirs: string[]): string {
  const L: string[] = [];
  const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s.padEnd(n));
  L.push(
    'CHITTHI – PRINT SAMPLES FOR QUOTE AND TEST PRINT',
    '='.repeat(78),
    '',
    `12 sample designs made with the Chitthi app: 6 postcards and 6 wall/desk calendars (${PRINT_SAMPLE_YEAR}),`,
    'each in a vertical and a horizontal version, plus a matching envelope for every size.',
    'All photos are Indian festival scenes without people (Pexels licence, credits in PHOTO-CREDITS.txt).',
    '',
    'WHAT TO SEND BACK',
    '-'.repeat(78),
    '1. Fill in ORDER-SHEET.csv (opens in Excel / Google Sheets): price per piece for each quantity.',
    '2. Or fill in the price grid in each sample folder’s …-QUOTE-REQUEST.pdf.',
    '3. Chitthi-print-specifications.pdf is the full catalogue: every size, paper spec and a blank price grid.',
    '4. Please add turnaround, proof charge, delivery charge and GST on the quote.',
    '',
    'PRINT RULES FOR EVERY FILE',
    '-'.repeat(78),
    '- Print at 100% / actual size. Never “fit to page”.',
    '- Every file has 3 mm bleed on each edge; cut on the crop marks (trim line).',
    '- 300 dpi, sRGB. Convert to CMYK for offset; digital presses can print as is.',
    '- Keep text 4 mm inside the trim (already done in the designs).',
    '- Postcards: double-sided 4/4, flip on the LONG edge. The back is the blank postal back (message lines,',
    '  address lines, stamp box) for the customer to write on.',
    '- Calendars: single-sided 4/0, 12 month pages + year-at-a-glance back page, Wire-O on the top edge.',
    '  A5 desk calendars go on a tent stand.',
    '',
    'THE SAMPLES',
    '-'.repeat(78),
  );
  L.push(pad('No', 5) + pad('Item', 52) + pad('Trim size', 18) + 'Envelope');
  for (const def of PRINT_SAMPLES) {
    const f = sampleFacts(def);
    L.push(pad(def.id.split('-')[0], 5) + pad(`${f.product} ${f.size}, ${f.orient.toLowerCase()} – ${def.title}`, 52) + pad(f.trim, 18) + f.env);
  }
  L.push('', 'FOLDERS', '-'.repeat(78));
  L.push('01-Postcards/<sample>/');
  L.push('    front/…-front.png          front at full size with bleed, 300 dpi');
  L.push('    back/…-back.png            blank postal back, same size');
  L.push('    …-print.pdf                front + back, one page each, with crop marks  ← main file to print');
  L.push('    …-1319-sheet.pdf           many up on a 13×19 in sheet, backs mirrored for duplex');
  L.push('    …-QUOTE-REQUEST.pdf        previews, full job spec and a price grid');
  L.push('    …-PRINT-SPEC.txt           the same spec as plain text');
  L.push('02-Calendars/<sample>/');
  L.push('    pages/…-front-01-january.png … -front-12-december.png   one PNG per month');
  L.push('    back/…-back.png            year-at-a-glance back page');
  L.push('    …-print.pdf                all 13 pages in order, with crop marks  ← main file to print');
  L.push('    …-QUOTE-REQUEST.pdf, …-PRINT-SPEC.txt');
  L.push('03-Envelopes/<size>/');
  L.push('    envelope-…-front.png / -back.png   address side and flap side at envelope size');
  L.push('    envelope-…-print.pdf        print on ready-made envelopes (page 1 front, page 2 back)');
  L.push('    envelope-…-template-….pdf   fold-your-own flat template with cut and fold lines (when it fits a sheet)');
  L.push('    ENVELOPE-SPEC.txt');
  for (const d of envDirs) L.push(`    · ${d.replace(`${ENV_DIR}/`, '')}`);
  L.push('', `Created ${new Date().toLocaleString()} with Chitthi.`);
  return L.join('\n');
}

function creditsText(): string {
  const used = new Set(PRINT_SAMPLES.flatMap((s) => s.photos));
  const L = ['PHOTO CREDITS', '='.repeat(60), '', 'All photos from Pexels (https://www.pexels.com/license/): free to use, including for print.', ''];
  for (const c of credits ?? []) if (used.has(c.id)) L.push(`${c.what.padEnd(34)}${c.photographer}  ${c.pexelsUrl}`);
  return L.join('\n');
}

async function renderExtras(envDirs: string[]): Promise<string[]> {
  await photosFor([]);
  const { buildQuoteCatalog } = await import('../engine/quote');
  const cat = await buildQuoteCatalog();
  put('Chitthi-print-specifications.pdf', cat.blob);
  put('ORDER-SHEET.csv', new Blob([orderSheet(envDirs)], { type: 'text/csv' }));
  put('README.txt', readme(envDirs));
  put('PHOTO-CREDITS.txt', creditsText());
  return ['README.txt', 'ORDER-SHEET.csv', 'Chitthi-print-specifications.pdf', 'PHOTO-CREDITS.txt'];
}

/** Hands one finished file over as base64 and forgets it. */
async function take(path: string): Promise<string> {
  const b = store.get(path);
  if (!b) throw new Error(`no file ${path}`);
  store.delete(path);
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const api = {
  samples: () => PRINT_SAMPLES.map((s) => s.id),
  envelopes: () => envelopeJobs().map((j) => j.dir),
  renderSample,
  renderEnvelope: renderEnvelope_,
  renderExtras,
  take,
};
declare global {
  interface Window {
    __chitthiPrintSamples?: typeof api;
  }
}
window.__chitthiPrintSamples = api;
