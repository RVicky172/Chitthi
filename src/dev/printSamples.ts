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
import { envelopeSpec, envelopeSummary, templateSheet } from '../engine/envelope';
import { renderEnvelope } from '../engine/envelopeDraw';
import { buildEnvelopePDF, buildEnvelopeTemplate, buildPDF, buildPNG, printSpec } from '../engine/export';
import { nup, pagesOf, SHEETS } from '../engine/printPages';
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

/** Bytes per chunk when turning a blob into base64 (keeps String.fromCharCode's argument list small). */
const BASE64_CHUNK = 0x8000;

const store = new Map<string, Blob>();
const put = (path: string, data: Blob | string) =>
  store.set(path, typeof data === 'string' ? new Blob([data.replace(/\r?\n/g, '\r\n')], { type: 'text/plain' }) : data);

/** The photos' credits, read once from photos.json (null until the first job). */
let credits: Credit[] | null = null;
const photoCache = new Map<string, Promise<Photo>>();

/**
 * Reads the credits once.
 * @returns every credit in photos.json
 */
async function loadCredits(): Promise<Credit[]> {
  if (!credits) {
    const response = await fetch('/print-samples-src/photos.json');
    credits = ((await response.json()) as { photos: Credit[] }).photos;
  }
  return credits;
}

/**
 * Loads the samples' photos (each once).
 * @param ids the photos' ids
 * @returns the photos, in order
 */
async function photosFor(ids: string[]): Promise<Photo[]> {
  const known = await loadCredits();
  return Promise.all(
    ids.map((id) => {
      let photo = photoCache.get(id);
      if (!photo) {
        const credit = known.find((entry) => entry.id === id);
        if (!credit) throw new Error(`print sample photo "${id}" is missing: run npm run fetch:print-samples`);
        const url = `/print-samples-src/${credit.file}`;
        photo = loadImage(url).then((img) =>
          makePhoto(img, pexelsName(credit.what, credit.photographer, pexelsIdOf(credit.pexelsUrl)), url),
        );
        photoCache.set(id, photo);
      }
      return photo;
    }),
  );
}

/**
 * A sample's design and photos, with its fonts loaded.
 * @param def the sample
 * @param env turn the matching envelope on
 * @returns what the export engine draws
 */
async function inputFor(def: PrintSampleDef, env = false): Promise<RenderInput> {
  const design = printSampleDesign(def, productDesign(def.product));
  if (env) design.env = { ...design.env, on: true };
  await ensureFonts(fontsFor(design));
  await document.fonts.ready;
  return { d: design, photos: await photosFor(def.photos) };
}

/**
 * Rounds to one decimal place.
 * @param value a size in mm
 * @returns it to 0.1
 */
const r1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Lets the page breathe between pages of a long job.
 * @returns a promise that settles after 20 ms
 */
const tick = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * A name made safe for a file or folder: runs of anything but letters and digits become one dash.
 * @param name the name
 * @returns it with dashes
 */
const dashed = (name: string): string => name.replace(/[^A-Za-z0-9]+/g, '-');

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
 * The entry at `index`, or an error naming what was asked for (the harness passes indexes by hand).
 * @param list - the entries
 * @param index - which one
 * @param what - what the list holds, for the error
 * @returns the entry
 */
function entryAt<T>(list: readonly T[], index: number, what: string): T {
  const entry = list[index];
  if (entry === undefined) throw new RangeError(`No ${what} ${index} (there are ${list.length}).`);
  return entry;
}

/**
 * A sample's number: the part of its id before the first dash (`03-postcard-…` → `03`).
 * @param def - the sample
 * @returns its number
 */
const sampleNumber = (def: PrintSampleDef): string => def.id.split('-', 1)[0] ?? def.id;

/**
 * The folder a page PNG goes in: calendar month pages in `pages`, card fronts in `front`, backs in `back`.
 * @param side the page's side
 * @param def the sample
 * @returns the folder name
 */
function pageFolder(side: string, def: PrintSampleDef): string {
  if (side !== 'front') return 'back';
  return def.product === 'calendar' ? 'pages' : 'front';
}

/**
 * One sample's folder: every page as a 300 dpi PNG, the print PDF, (postcards) a sheet PDF, quote request and spec.
 * @param index which sample (PRINT_SAMPLES)
 * @returns the paths of the files made
 */
async function renderSample(index: number): Promise<string[]> {
  const def = entryAt(PRINT_SAMPLES, index, 'print sample'),
    input = await inputFor(def),
    dir = `${PRODUCT_DIR[def.product]}/${def.id}`,
    made: string[] = [];
  const add = (name: string, data: Blob | string): void => {
    put(`${dir}/${name}`, data);
    made.push(name);
  };
  for (const page of pagesOf(input.d)) {
    await tick();
    const { blob, name } = await buildPNG(page, input);
    add(`${pageFolder(page.side, def)}/${name}`, blob);
  }
  const pdf = await buildPDF(input, 'pdf');
  add(pdf.name, pdf.blob);
  if (def.product === 'postcard') {
    const sheet = await buildPDF(input, 'sheet');
    add(sheet.name, sheet.blob);
  }
  const { buildQuoteRequest } = await import('../engine/quote');
  const quote = await buildQuoteRequest(input);
  add(quote.name, quote.blob);
  const specName = `${input.d.designName.toLowerCase()}-PRINT-SPEC.txt`;
  add(specName, printSpec(input, [...made, specName]));
  return made.map((name) => `${dir}/${name}`);
}

/**
 * The envelope sizes: one folder per card size, drawn from the horizontal sample of that size.
 * @returns each envelope job's sample and folder
 */
function envelopeJobs(): { def: PrintSampleDef; dir: string }[] {
  const sizes = [...new Set(PRINT_SAMPLES.map((sample) => sample.sizeId))];
  return sizes.map((id, index) => {
    const ofSize = PRINT_SAMPLES.filter((sample) => sample.sizeId === id);
    const def = ofSize.find((sample) => sample.orient === 'landscape') ?? entryAt(ofSize, 0, `sample of size ${id}`);
    const design = printSampleDesign(def, productDesign(def.product));
    const envelopeName = dashed(envelopeSpec(design).name).replace(/-$/, '');
    return {
      def,
      dir: `${ENV_DIR}/E${index + 1}-for-${productOf(def.product).short}-${dashed(sizeOf(design).name)}-${envelopeName}`,
    };
  });
}

/**
 * Draws one side of an envelope as a PNG at the export's dpi.
 * @param face the address side or the flap side
 * @param input the design (envelope on) and its photos
 * @returns the PNG
 */
function envelopePng(face: 'front' | 'back', input: RenderInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderEnvelope(canvas, face, +input.d.exp.dpi / 25.4, input);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('envelope render'))), 'image/png');
  });
}

/**
 * The plain-text specification for an envelope job.
 * @param def the sample the envelope is drawn from
 * @param design its design
 * @param stem the files' common name
 * @param made the files in the folder so far
 * @returns ENVELOPE-SPEC.txt
 */
function envelopeSpecText(def: PrintSampleDef, design: Design, stem: string, made: string[]): string {
  const envelope = envelopeSpec(design),
    sheet = templateSheet(design),
    { w, h } = cardMM(design),
    spec = PRINT_SPECS.envelope,
    lines: string[] = [];
  const line = (label: string, value: string): number => lines.push(`${(label ? label + ':' : '').padEnd(22)}${value}`);
  lines.push('CHITTHI – ENVELOPE SPECIFICATION', '='.repeat(60), '');
  line(
    'For',
    `${productOf(design.product).name}, ${sizeOf(design).name} (${r1(Math.min(w, h))} × ${r1(Math.max(w, h))} mm), both orientations`,
  );
  line('Envelope', envelopeSummary(design));
  line('Envelope size', `${envelope.w} × ${envelope.h} mm`);
  line('Artwork', `${design.themeId} occasion design, matching sample ${def.id}`);
  lines.push('', 'PRINTING', '-'.repeat(60));
  line('Material', spec.stock);
  line('Weight', spec.weight);
  line('Finish', spec.finish);
  line('Colour', spec.colour);
  spec.finishing.forEach((finishing, index) => line(index ? '' : 'Finishing', finishing));
  line(
    'Ready-made',
    `Buy ${envelope.name} envelopes and print ${stem}-print.pdf on them: page 1 is the address side, page 2 the flap side.`,
  );
  if (sheet)
    line(
      'Fold your own',
      `Print the template on ${sheet.name} (120–160 gsm), cut on solid lines, fold on dashed lines, glue the bottom flap.`,
    );
  else line('Fold your own', 'Too big for a printable template sheet: use ready-made envelopes.');
  line('Scale', 'Print at 100% / actual size.');
  lines.push('', 'QUOTE', '-'.repeat(60));
  line('Quantities to price', QUOTE_QTY.join(', ') + ' pieces');
  lines.push(
    '',
    'FILES',
    '-'.repeat(60),
    ...made.map((name) => `  ${name}`),
    '',
    `Created ${new Date().toLocaleString()} with Chitthi.`,
  );
  return lines.join('\n');
}

/**
 * One envelope folder: both sides as PNGs, the print PDF, the fold-your-own template when it fits a sheet, the spec.
 * @param index which envelope job (envelopeJobs)
 * @returns the paths of the files made
 */
async function renderEnvelopeJob(index: number): Promise<string[]> {
  const { def, dir } = entryAt(envelopeJobs(), index, 'envelope job'),
    input = await inputFor(def, true),
    design = input.d,
    made: string[] = [];
  const add = (name: string, data: Blob | string): void => {
    put(`${dir}/${name}`, data);
    made.push(name);
  };
  const stem = `envelope-${dashed(envelopeSpec(design).name).replace(/-$/, '').toLowerCase()}`;
  for (const face of ['front', 'back'] as const) add(`${stem}-${face}.png`, await envelopePng(face, input));
  const printPdf = await buildEnvelopePDF(input);
  add(`${stem}-print.pdf`, printPdf.blob);
  const template = await buildEnvelopeTemplate(input);
  const sheet = templateSheet(design);
  if (template && sheet) add(`${stem}-template-${sheet.id}.pdf`, template.blob);
  add('ENVELOPE-SPEC.txt', envelopeSpecText(def, design, stem, made));
  return made.map((name) => `${dir}/${name}`);
}

/* ---------- the documents at the top of the folder ---------- */

/**
 * One CSV cell, quoted when it holds a quote, a comma or a line break.
 * @param value the cell's value
 * @returns it as CSV
 */
const csvCell = (value: string | number): string =>
  /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);

/**
 * What the order sheet and the README say about one sample.
 * @param def the sample
 * @returns its design and its facts as text
 */
function sampleFacts(def: PrintSampleDef) {
  const design: Design = printSampleDesign(def, productDesign(def.product)),
    { w, h } = cardMM(design),
    bleed = +design.exp.bleed,
    px = (mm: number): number => Math.round((mm / 25.4) * +design.exp.dpi),
    spec = PRINT_SPECS[design.product],
    pages = pagesOf(design),
    env = envelopeSpec(design);
  return {
    d: design,
    folder: `${PRODUCT_DIR[def.product]}/${def.id}`,
    product: productOf(design.product).name,
    size: sizeOf(design).name,
    orient: design.orient === 'landscape' ? 'Horizontal' : 'Vertical',
    trim: `${r1(w)} × ${r1(h)} mm`,
    doc: `${r1(w + 2 * bleed)} × ${r1(h + 2 * bleed)} mm`,
    pixels: `${px(w + 2 * bleed)} × ${px(h + 2 * bleed)} px`,
    pages:
      design.product === 'calendar'
        ? `${calPages(design)} month pages (Jan–Dec ${PRINT_SAMPLE_YEAR}) + year-at-a-glance back page = ${pages.length} pages`
        : 'Front (photo) + back (blank postal back to write on)',
    up: design.product === 'postcard' ? perSheetText(design) : '',
    layout: layoutName(design.layout),
    spec,
    env: `${env.name} (${env.w} × ${env.h} mm)`,
  };
}

/**
 * How many postcards fit on a 13 × 19 in sheet.
 * @param design the postcard's design
 * @returns e.g. "12 per 13×19 in sheet"
 */
function perSheetText(design: Design): string {
  const grid = nup(design);
  return `${grid.cols * grid.rows} per ${SHEETS['1319'][2]} sheet`;
}

/**
 * The finishing a sample's product lists, less the lines that are for other sizes (Instax, Year strip).
 * @param def the sample
 * @param finishing the product's finishing lines
 * @returns them, joined for one cell
 */
function finishingFor(def: PrintSampleDef, finishing: readonly string[]): string {
  const otherSizes = def.product === 'calendar' ? 'Year strip' : 'Instax';
  return finishing.filter((entry) => !entry.includes(otherSizes)).join('; ');
}

/**
 * The order sheet's rows for the envelopes.
 * @param envDirs the envelope folders, as the build script named them
 * @returns one row per envelope job
 */
function envelopeRows(envDirs: string[]): (string | number)[][] {
  const spec = PRINT_SPECS.envelope;
  return envelopeJobs().map(({ def, dir }, index) => {
    const design = printSampleDesign(def, productDesign(def.product)),
      envelope = envelopeSpec(design),
      sheet = templateSheet(design);
    return [
      `E${index + 1}`,
      envDirs[index] ?? dir,
      'Envelope',
      `for ${productOf(design.product).name.toLowerCase()} ${sizeOf(design).name}`,
      envelope.name,
      'Horizontal',
      `${envelope.w} × ${envelope.h} mm`,
      'Envelope size (no bleed)',
      `${Math.round((envelope.w / 25.4) * 300)} × ${Math.round((envelope.h / 25.4) * 300)} px`,
      'Front (address side) + back (flap side)',
      sheet ? `Fold-your-own template on ${sheet.name} also supplied` : 'Ready-made envelope only',
      spec.stock,
      spec.weight,
      spec.finish,
      spec.colour,
      spec.finishing.join('; '),
      '',
      '',
      ...QUOTE_QTY.map(() => ''),
      '',
    ];
  });
}

/**
 * ORDER-SHEET.csv: one row per sample and per envelope, with empty price columns for the printer.
 * @param envDirs the envelope folders, as the build script named them
 * @returns the CSV, with a BOM
 */
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
    ...QUOTE_QTY.map((quantity) => `Price per piece @ ${quantity}`),
    'Printer notes',
  ];
  const sampleRows = PRINT_SAMPLES.map((def) => {
    const facts = sampleFacts(def);
    return [
      sampleNumber(def),
      facts.folder,
      facts.product,
      def.title,
      facts.size,
      facts.orient,
      facts.trim,
      facts.doc,
      facts.pixels,
      facts.pages,
      facts.layout,
      facts.spec.stock,
      facts.spec.weight,
      facts.spec.finish,
      facts.spec.colour,
      finishingFor(def, facts.spec.finishing),
      facts.env,
      '',
      ...QUOTE_QTY.map(() => ''),
      '',
    ];
  });
  const rows: (string | number)[][] = [head, ...sampleRows, ...envelopeRows(envDirs)];
  // A BOM so Excel opens the dashes and × signs correctly.
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/**
 * README.txt for the printer: what to send back, the print rules, the samples and the folders.
 * @param envDirs the envelope folders, as the build script named them
 * @returns the text
 */
function readme(envDirs: string[]): string {
  const lines: string[] = [];
  const pad = (text: string, width: number): string => (text.length >= width ? text + ' ' : text.padEnd(width));
  lines.push(
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
  lines.push(pad('No', 5) + pad('Item', 52) + pad('Trim size', 18) + 'Envelope');
  for (const def of PRINT_SAMPLES) {
    const facts = sampleFacts(def);
    lines.push(
      pad(sampleNumber(def), 5) +
        pad(`${facts.product} ${facts.size}, ${facts.orient.toLowerCase()} – ${def.title}`, 52) +
        pad(facts.trim, 18) +
        facts.env,
    );
  }
  lines.push('', 'FOLDERS', '-'.repeat(78));
  lines.push('01-Postcards/<sample>/');
  lines.push('    front/…-front.png          front at full size with bleed, 300 dpi');
  lines.push('    back/…-back.png            blank postal back, same size');
  lines.push('    …-print.pdf                front + back, one page each, with crop marks  ← main file to print');
  lines.push('    …-1319-sheet.pdf           many up on a 13×19 in sheet, backs mirrored for duplex');
  lines.push('    …-QUOTE-REQUEST.pdf        previews, full job spec and a price grid');
  lines.push('    …-PRINT-SPEC.txt           the same spec as plain text');
  lines.push('02-Calendars/<sample>/');
  lines.push('    pages/…-front-01-january.png … -front-12-december.png   one PNG per month');
  lines.push('    back/…-back.png            year-at-a-glance back page');
  lines.push('    …-print.pdf                all 13 pages in order, with crop marks  ← main file to print');
  lines.push('    …-QUOTE-REQUEST.pdf, …-PRINT-SPEC.txt');
  lines.push('03-Envelopes/<size>/');
  lines.push('    envelope-…-front.png / -back.png   address side and flap side at envelope size');
  lines.push('    envelope-…-print.pdf        print on ready-made envelopes (page 1 front, page 2 back)');
  lines.push(
    '    envelope-…-template-….pdf   fold-your-own flat template with cut and fold lines (when it fits a sheet)',
  );
  lines.push('    ENVELOPE-SPEC.txt');
  const envPrefix = `${ENV_DIR}/`;
  for (const envDir of envDirs) lines.push(`    · ${envDir.replace(envPrefix, '')}`);
  lines.push('', `Created ${new Date().toLocaleString()} with Chitthi.`);
  return lines.join('\n');
}

/**
 * PHOTO-CREDITS.txt: the photos the samples use, with their photographers and Pexels pages.
 * @param known the credits from photos.json
 * @returns the text
 */
function creditsText(known: Credit[]): string {
  const used = new Set(PRINT_SAMPLES.flatMap((sample) => sample.photos));
  const lines = [
    'PHOTO CREDITS',
    '='.repeat(60),
    '',
    'All photos from Pexels (https://www.pexels.com/license/): free to use, including for print.',
    '',
  ];
  for (const credit of known)
    if (used.has(credit.id)) lines.push(`${credit.what.padEnd(34)}${credit.photographer}  ${credit.pexelsUrl}`);
  return lines.join('\n');
}

/**
 * The documents at the top of the folder: the catalogue, the order sheet, the README and the photo credits.
 * @param envDirs the envelope folders, as the build script named them
 * @returns their paths
 */
async function renderExtras(envDirs: string[]): Promise<string[]> {
  const known = await loadCredits();
  const { buildQuoteCatalog } = await import('../engine/quote');
  const catalog = await buildQuoteCatalog();
  put('Chitthi-print-specifications.pdf', catalog.blob);
  put('ORDER-SHEET.csv', new Blob([orderSheet(envDirs)], { type: 'text/csv' }));
  put('README.txt', readme(envDirs));
  put('PHOTO-CREDITS.txt', creditsText(known));
  return ['README.txt', 'ORDER-SHEET.csv', 'Chitthi-print-specifications.pdf', 'PHOTO-CREDITS.txt'];
}

/**
 * Hands one finished file over as base64 and forgets it.
 * @param path the file's path in the folder
 * @returns its bytes as base64
 */
async function take(path: string): Promise<string> {
  const blob = store.get(path);
  if (!blob) throw new Error(`no file ${path}`);
  store.delete(path);
  return blobToBase64(blob);
}

const api = {
  samples: () => PRINT_SAMPLES.map((sample) => sample.id),
  envelopes: () => envelopeJobs().map((job) => job.dir),
  renderSample,
  renderEnvelope: renderEnvelopeJob,
  renderExtras,
  take,
};
declare global {
  interface Window {
    __chitthiPrintSamples?: typeof api;
  }
}
window.__chitthiPrintSamples = api;
