import { layoutName } from '../data/layouts';
import { MONTHS, PRODUCTS, productOf, sizesFor } from '../data/products';
import { PRINT_SPECS, QUOTE_QTY, type PrintSpecDef, type QuoteCategory } from '../data/printSpecs';
import type { ShowcaseImage } from '../data/showcase';
import SHOWCASE_JSON from '../data/showcase.json';
import type { Design, ProductId, RenderInput, SizeDef } from '../types';
import { calPages, cardMM, productDesign, sizeOf } from './design';
import { envelopeSpec, STANDARD, templateSheet, type EnvelopeSpec } from './envelope';
import { baseName, nup, pagesOf } from './printPages';
import { calMonth } from './calendarDraw';
import { CONTENT, INK, jpegOf, latin, MARGIN, MUTED, NO_IMAGE, UMBER, Writer, type PdfImage, type TableColumn } from './quoteWriter';
import { renderCard } from './render';

/*
 * Documents for print shops, so a customer can ask for a quote:
 *   - buildQuoteCatalog(): every category (postcards, calendars, frames, magnets, envelopes) with samples, material and
 *     finishing specs, every size with bleed and sheet counts, and a blank price-per-piece grid by size and quantity;
 *   - buildQuoteRequest(input): the same for one design, with its own previews; added to every print pack;
 *   - orderSheetCSV(items): several designs at once, as a spreadsheet.
 * The PDFs are built with jsPDF (loaded on demand) through quoteWriter.ts.
 */

/** A built document. */
export interface QuoteFile {
  blob: Blob;
  name: string;
}

/** One design in an order sheet. */
export interface OrderItem {
  label: string;
  d: Design;
  folder?: string;
}

/**
 * A number to one decimal.
 * @param value the number
 * @returns it, rounded
 */
const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Today's date as words.
 * @returns e.g. "14 October 2026"
 */
const today = (): string => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/** The showcase pictures (docs/showcase), used as samples. */
const SHOTS = SHOWCASE_JSON as ShowcaseImage[];
/** Each category's sample pictures: showcase id and render. */
const SAMPLES: Record<QuoteCategory, [string, ShowcaseImage['render']][]> = {
  postcard: [
    ['diwali-postcard', 'front'],
    ['diwali-postcard', 'back'],
    ['jaipur-stamp', 'front'],
  ],
  calendar: [
    ['ladakh-calendar', 'front'],
    ['sunflower-strip', 'front'],
  ],
  frame: [
    ['dadi-frame', 'front'],
    ['kites-triptych', 'front'],
  ],
  magnet: [
    ['puppy-badge', 'front'],
    ['eid-magnet', 'front'],
    ['temple-polaroid-magnet', 'front'],
  ],
  envelope: [
    ['diwali-postcard', 'envelope-front'],
    ['diwali-postcard', 'envelope-back'],
  ],
};

/**
 * A showcase picture as a JPEG.
 * @param id the showcase id
 * @param render which render of it
 * @returns the JPEG, or NO_IMAGE when there is no such picture
 */
function showcaseJpeg(id: string, render: ShowcaseImage['render']): Promise<PdfImage> {
  const shot = SHOTS.find((candidate) => candidate.id === id && candidate.render === render);
  return shot ? jpegOf(shot.src, 700) : Promise.resolve({ ...NO_IMAGE });
}

/**
 * A category's sample pictures (those in the showcase).
 * @param category the category
 * @returns the JPEGs
 */
const sampleImages = (category: QuoteCategory): Promise<PdfImage[]> =>
  Promise.all(
    SAMPLES[category]
      .map(([id, render]) => SHOTS.find((shot) => shot.id === id && shot.render === render))
      .filter((shot): shot is ShowcaseImage => !!shot)
      .map((shot) => jpegOf(shot.src, 700)),
  );

/**
 * A size's name for the documents.
 * @param size the size
 * @returns e.g. "Classic 4×6 in", or "Jumbo (6×9 in)" when the name doesn't already say the size
 */
const sizeName = (size: SizeDef): string => (size.inch && !size.name.includes('×') ? `${size.name} (${size.inch})` : size.name);

/**
 * A fresh design of a product at a size, as the studio would start it, for sheet counts.
 * @param product the product
 * @param size the size
 * @returns the design, with 3 mm bleed and crop marks
 */
function designAt(product: ProductId, size: SizeDef): Design {
  const design = productDesign(product);
  return { ...design, sizeId: size.id, orient: size.native ?? design.orient, exp: { ...design.exp, bleed: '3', marks: true } };
}

/**
 * How many pieces fit on a sheet.
 * @param design the design
 * @param sheet the sheet
 * @returns the count, or '–' when none fit
 */
const perSheet = (design: Design, sheet: Design['exp']['sheet']): string => {
  const imposition = nup({ ...design, exp: { ...design.exp, sheet } });
  return imposition.cols * imposition.rows ? String(imposition.cols * imposition.rows) : '–';
};

/**
 * A size's shape for the documents.
 * @param size the size
 * @param words how to say it: the catalog's short words or the request's longer ones
 * @param words.round a round piece
 * @param words.corners a piece with rounded corners, given the radius in mm
 * @param words.rectangle a plain rectangle
 * @returns the shape
 */
function shapeText(size: SizeDef, words: { round: string; corners: (radius: number) => string; rectangle: string }): string {
  if (size.shape === 'circle') return words.round;
  if (size.corner || size.instax) return words.corners(size.corner ?? 3);
  return words.rectangle;
}

/**
 * A product's material and finishing facts.
 * @param writer the writer
 * @param spec the product's print spec
 */
function specFacts(writer: Writer, spec: PrintSpecDef): void {
  writer.facts([
    ['One piece', spec.piece],
    ['Material', spec.stock],
    ['Weight', spec.weight],
    ['Finish', spec.finish],
    ['Colour', spec.colour],
    ['Finishing', `${spec.finishing.join('. ')}.`],
  ]);
}

/** The price grid's quantity columns (widths set per grid). */
const QTY_COLS: TableColumn[] = QUOTE_QTY.map((quantity) => ({ label: `${quantity} pc${quantity > 1 ? 's' : ''}`, w: 0, align: 'center' as const }));

/**
 * A price grid: one row per item, one column per quantity, cells left blank.
 * @param writer the writer
 * @param items the rows' items
 */
function priceGrid(writer: Writer, items: string[]): void {
  const first = 50;
  const quantityWidth = (CONTENT - first) / QUOTE_QTY.length;
  // Start on a new page rather than leave the heading and a row or two stranded at the bottom.
  writer.ensure(8 * (Math.min(items.length, 5) + 1) + 12);
  writer.subheading('Price per piece (INR, excluding GST) — to be filled in by the printer');
  writer.table(
    [{ label: 'Item', w: first }, ...QTY_COLS.map((column) => ({ ...column, w: quantityWidth }))],
    items.map((item) => [item]),
    8,
  );
}

/**
 * What every quote needs to know: the files we supply and what the quote should include.
 * @param writer the writer
 */
function generalSpecs(writer: Writer): void {
  writer.subheading('Files we supply');
  writer.bullets([
    'Print-ready PDF (one page per side, trim + 3 mm bleed, crop marks) and separate PNG files, all at 300 dpi.',
    'Colours are sRGB. Please convert to CMYK with your usual profile, or tell us if you need CMYK files.',
    'Keep text and faces 4 mm inside the trim (safe area). Bleed is 3 mm on every edge unless stated.',
    'Sheet PDFs (many up on A4, A3 or 13×19 in, with crop marks and backs mirrored for long-edge duplex) on request.',
    'Every order comes with a PRINT-SPEC.txt listing the trim size, bleed, resolution, paper and finishing.',
  ]);
  writer.subheading('Please include in your quote');
  writer.bullets([
    'Price per piece at each quantity, for each size you can produce (grids below).',
    'Paper you would use if different from ours, and the cost of a hard-copy proof.',
    'Turnaround time, packing, and delivery charges to our city.',
  ]);
}

/**
 * Starts a jsPDF document for the documents.
 * @returns A4 portrait, mm, compressed
 */
async function newDocument(): Promise<Writer['doc']> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p', compress: true });
}

/**
 * The catalog's cover: title, sample pictures, the customer's details, what we supply and the contents.
 * @param writer the writer
 */
async function catalogCover(writer: Writer): Promise<void> {
  const { doc } = writer;
  writer.font(26, 'bold', UMBER);
  doc.text('Chitthi', MARGIN, MARGIN + 10);
  writer.font(15, 'normal', INK);
  doc.text('Print specifications and quote request', MARGIN, MARGIN + 19);
  writer.font(9.5, 'normal', MUTED);
  doc.text(`Prepared ${today()}. Postcards, calendars, photo frame prints, fridge magnets and envelopes.`, MARGIN, MARGIN + 26);
  writer.y = MARGIN + 34;
  const covers = await Promise.all([showcaseJpeg('diwali-postcard', 'front'), showcaseJpeg('ladakh-calendar', 'front'), showcaseJpeg('dadi-frame', 'front'), showcaseJpeg('puppy-badge', 'front')]);
  writer.images(covers, 48);
  writer.subheading('Customer');
  writer.blanks(['Name', 'Phone', 'Email', 'Delivery city and PIN', 'Needed by', 'Quote reference']);
  generalSpecs(writer);
  writer.subheading('Contents');
  writer.bullets([...PRODUCTS.map((product) => `${PRINT_SPECS[product.id].title}: ${PRINT_SPECS[product.id].summary}`), `${PRINT_SPECS.envelope.title}: ${PRINT_SPECS.envelope.summary}`]);
}

/** The catalog's size table columns. */
const SIZE_COLUMNS: TableColumn[] = [
  { label: 'Size', w: 42 },
  { label: 'Trim (mm)', w: 30 },
  { label: 'With 3 mm bleed', w: 32 },
  { label: 'Shape', w: 26 },
  { label: 'Per A4', w: 16, align: 'center' },
  { label: 'Per A3', w: 16, align: 'center' },
  { label: 'Per 13×19', w: 16, align: 'center' },
];

/**
 * A size's row in the catalog: trim, with bleed, shape and how many fit per sheet.
 * @param product the product
 * @param size the size
 * @returns the cells
 */
function sizeRow(product: ProductId, size: SizeDef): string[] {
  const design = designAt(product, size);
  const { w: trimWidth, h: trimHeight } = cardMM(design);
  return [
    sizeName(size),
    `${round1(trimWidth)} × ${round1(trimHeight)}`,
    `${round1(trimWidth + 6)} × ${round1(trimHeight + 6)}`,
    shapeText(size, { round: 'Round', corners: (radius) => `${radius} mm corners`, rectangle: 'Rectangle' }),
    perSheet(design, 'a4'),
    perSheet(design, 'a3'),
    perSheet(design, '1319'),
  ];
}

/**
 * A product's section of the catalog: samples, specs, sizes and its price grid.
 * @param writer the writer
 * @param product the product
 */
async function productSection(writer: Writer, product: (typeof PRODUCTS)[number]): Promise<void> {
  const spec = PRINT_SPECS[product.id];
  const sizes = sizesFor(product.id).filter((size) => size.id !== 'custom');
  writer.page();
  writer.heading(spec.title);
  writer.paragraph(product.blurb);
  writer.images(await sampleImages(product.id), 52);
  specFacts(writer, spec);
  writer.subheading('Sizes');
  writer.table(
    SIZE_COLUMNS,
    sizes.map((size) => sizeRow(product.id, size)),
  );
  writer.paragraph('Custom sizes from 40 to 420 mm are also possible: please quote per square inch or per sheet as well.', 8.5);
  priceGrid(writer, sizes.map(sizeName));
}

/**
 * The names of the sizes (of any product) that get a given envelope.
 * @param envelopeName the envelope
 * @returns the sizes' names
 */
const sizesUsing = (envelopeName: string): string[] =>
  PRODUCTS.flatMap((product) =>
    sizesFor(product.id)
      .filter((size) => size.id !== 'custom' && envelopeSpec(designAt(product.id, size)).name === envelopeName)
      .map((size) => size.name),
  );

/**
 * The catalog's envelope section: samples, specs, every standard size and a price grid for those in use.
 * @param writer the writer
 */
async function envelopeSection(writer: Writer): Promise<void> {
  const spec = PRINT_SPECS.envelope;
  writer.page();
  writer.heading(spec.title);
  writer.paragraph('Every design comes with a matching envelope: the smallest standard size the piece fits in, printed with the same occasion artwork, the address, and the Chitthi mark on the back.');
  writer.images(await sampleImages('envelope'), 52);
  specFacts(writer, spec);
  const envelopes = STANDARD.slice().sort((first, second) => first[1] * first[2] - second[1] * second[2]);
  writer.subheading('Standard envelope sizes');
  writer.table(
    [
      { label: 'Envelope', w: 50 },
      { label: 'Size (mm)', w: 34 },
      { label: 'Holds pieces up to (mm)', w: 50 },
      { label: 'Used for', w: 44 },
    ],
    envelopes.map(([name, long, short]) => {
      const users = sizesUsing(name);
      return [name, `${long} × ${short}`, `${long - 5} × ${short - 5}`, users.slice(0, 3).join(', ') + (users.length > 3 ? '…' : '')];
    }),
  );
  priceGrid(
    writer,
    envelopes.filter(([name]) => PRODUCTS.some((product) => sizesFor(product.id).some((size) => size.id !== 'custom' && envelopeSpec(designAt(product.id, size)).name === name))).map(([name]) => `${name} envelope`),
  );
}

/**
 * The catalog's last page: the printer's details and room for notes.
 * @param writer the writer
 */
function quoteDetails(writer: Writer): void {
  writer.page();
  writer.heading('Quote details');
  writer.paragraph('Please fill in and return with the price grids.');
  writer.blanks(['Printer / company', 'Contact person', 'Phone', 'Email', 'Turnaround (working days)', 'Proof charge', 'Delivery charge', 'Quote valid until', 'GST number', 'Payment terms']);
  writer.subheading('Notes');
  for (let line = 0; line < 6; line++) writer.blanks([''], 1);
}

/**
 * The full specification and quote catalog for every category.
 * @returns the PDF
 */
export async function buildQuoteCatalog(): Promise<QuoteFile> {
  const doc = await newDocument();
  const writer = new Writer(doc, 'Chitthi – print specifications and quote request');
  await catalogCover(writer);
  for (const product of PRODUCTS) await productSection(writer, product);
  await envelopeSection(writer);
  quoteDetails(writer);
  writer.footer();
  return { blob: doc.output('blob'), name: `chitthi-print-specifications-${new Date().toISOString().slice(0, 10)}.pdf` };
}

/**
 * The finishing lines that apply to a design (no Instax corners on a 4×6 card, no badge press on a square magnet).
 * @param spec the product's print spec
 * @param design the design
 * @returns the lines
 */
function relevantFinishing(spec: PrintSpecDef, design: Design): string[] {
  const size = sizeOf(design);
  return spec.finishing.filter((line) => {
    if (line.includes('Instax')) return !!size.instax;
    if (line.startsWith('Round')) return size.shape === 'circle';
    if (line.includes('rounded corners') && design.product === 'magnet') return size.shape !== 'circle';
    if (line.startsWith('Desk')) return size.id === 'cal-a5';
    if (line.startsWith('Wall')) return size.id !== 'cal-a5' && design.layout !== 'cal-strip' && design.cal.months > 1;
    if (line.startsWith('Single-month')) return design.layout === 'cal-strip' || design.cal.months === 1;
    return true;
  });
}

/**
 * The request's previews: the first front, a second month for calendars, and the back.
 * @param input the design and its photos
 * @returns the JPEGs
 */
function requestPreviews(input: RenderInput): Promise<PdfImage[]> {
  const design = input.d;
  const { w, h } = cardMM(design);
  const pxPerMm = 900 / Math.max(w, h);
  const shots: HTMLCanvasElement[] = [];
  const draw = (side: 'front' | 'back', page = 0): void => {
    const canvas = document.createElement('canvas');
    renderCard(canvas, side, pxPerMm, 0, input, { page });
    shots.push(canvas);
  };
  draw('front', 0);
  if (calPages(design) > 1) draw('front', 1);
  if (design.exp.back && design.product !== 'magnet') draw('back');
  return Promise.all(shots.map((canvas) => jpegOf(canvas, 800)));
}

/**
 * The request's "Pages / sides" line.
 * @param design the design
 * @returns e.g. "12 month pages + year-at-a-glance back page (January 2027 onward)", "2 sides (front, back)"
 */
function pagesText(design: Design): string {
  const fronts = calPages(design);
  const pages = pagesOf(design);
  if (design.product !== 'calendar') return `${pages.length} side${pages.length > 1 ? 's' : ''} (${pages.map((page) => page.label.toLowerCase()).join(', ')})`;
  if (design.layout === 'cal-strip') return 'One page (the whole year)';
  const first = calMonth(design, 0);
  const back = design.exp.back ? ' + year-at-a-glance back page' : '';
  return `${fronts} month page${fronts > 1 ? 's' : ''}${back} (${MONTHS[first.month] ?? ''} ${first.year} onward)`;
}

/**
 * The request's envelope line.
 * @param design the design
 * @param envelope its envelope
 * @returns the envelope, its paper and whether a template is supplied
 */
function envelopeText(design: Design, envelope: EnvelopeSpec): string {
  const sheet = templateSheet(design);
  const template = sheet ? `Fold-your-own template on ${sheet.name} also supplied.` : '';
  return `${envelope.name}, ${envelope.w} × ${envelope.h} mm. ${PRINT_SPECS.envelope.weight}. ${template}`;
}

/**
 * The request's job description.
 * @param design the design
 * @param envelope its envelope, or null when it has none
 * @returns label and value rows
 */
function jobFacts(design: Design, envelope: EnvelopeSpec | null): [string, string][] {
  const spec = PRINT_SPECS[design.product];
  const size = sizeOf(design);
  const { w: trimWidth, h: trimHeight } = cardMM(design);
  const bleed = +design.exp.bleed;
  return [
    ['Product', productOf(design.product).name],
    ['Size', `${sizeName(size)}: trim ${round1(trimWidth)} × ${round1(trimHeight)} mm (${round1(trimWidth / 25.4)} × ${round1(trimHeight / 25.4)} in), ${design.orient === 'landscape' ? 'horizontal' : 'vertical'}`],
    ['File size', bleed ? `${round1(trimWidth + 2 * bleed)} × ${round1(trimHeight + 2 * bleed)} mm including ${bleed} mm bleed on every edge` : 'Trim size, no bleed'],
    ['Shape', shapeText(size, { round: 'Round (cut on the circle)', corners: (radius) => `Rectangle with ${radius} mm rounded corners`, rectangle: 'Rectangle' })],
    ['Pages / sides', pagesText(design)],
    ['Layout', layoutName(design.layout)],
    ['Resolution', `${design.exp.dpi} dpi, sRGB (please convert to CMYK)`],
    ['Material', spec.stock],
    ['Weight', spec.weight],
    ['Finish', spec.finish],
    ['Colour', spec.colour],
    ['Finishing', `${relevantFinishing(spec, design).join('. ')}.`],
    ...(envelope ? ([['Envelope', envelopeText(design, envelope)]] as [string, string][]) : []),
  ];
}

/**
 * A quote request for one design: previews, the full job description and a price grid.
 * @param input the design and its photos
 * @returns the PDF
 */
export async function buildQuoteRequest(input: RenderInput): Promise<QuoteFile> {
  const doc = await newDocument();
  const design = input.d;
  const product = productOf(design.product);
  const size = sizeOf(design);
  const title = design.designName.trim() || `${product.name}, ${size.name}`;
  const writer = new Writer(doc, `Chitthi – quote request: ${title}`);
  writer.font(22, 'bold', UMBER);
  doc.text('Quote request', MARGIN, MARGIN + 9);
  writer.font(13, 'normal', INK);
  doc.text(latin(title), MARGIN, MARGIN + 17);
  writer.font(9, 'normal', MUTED);
  doc.text(`${today()} · files: ${baseName(design)}-print-pack.zip`, MARGIN, MARGIN + 23);
  writer.y = MARGIN + 30;
  writer.images(await requestPreviews(input), 62);
  const envelope = design.env.on ? envelopeSpec(design) : null;
  writer.subheading('Job');
  writer.facts(jobFacts(design, envelope));
  priceGrid(writer, [`${product.name}, ${size.name}`, ...(envelope ? [`Envelope, ${envelope.name}`] : [])]);
  writer.subheading('Customer');
  writer.blanks(['Name', 'Phone', 'Email', 'Delivery city and PIN', 'Quantity wanted', 'Needed by']);
  writer.subheading('Printer');
  writer.blanks(['Printer / company', 'Turnaround (working days)', 'Proof charge', 'Delivery charge', 'Quote valid until', 'GST number']);
  writer.footer();
  return { blob: doc.output('blob'), name: `${baseName(design)}-QUOTE-REQUEST.pdf` };
}

/* ---------- several designs at once: an order sheet ---------- */

/**
 * A CSV cell, quoted when it needs to be.
 * @param value the value
 * @returns the cell
 */
const csvCell = (value: string | number): string => (/[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));

/** Lets Excel read the × and dash characters correctly. */
const BYTE_ORDER_MARK = '\uFEFF';

/**
 * A length in pixels at 300 dpi.
 * @param mm the length
 * @returns px
 */
const px300 = (mm: number): number => Math.round((mm / 25.4) * 300);

/**
 * The order sheet's header row.
 * @param withFolder whether there is a Folder column
 * @returns the header
 */
const orderHeader = (withFolder: boolean): string[] => [
  'No',
  'Design',
  ...(withFolder ? ['Folder'] : []),
  'Item',
  'Size',
  'Orientation',
  'Trim size',
  'File size with bleed',
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

/**
 * A design's pages for the order sheet.
 * @param design the design
 * @returns e.g. "12 month pages + year-at-a-glance back", "Front + Back"
 */
function orderPages(design: Design): string {
  if (design.product !== 'calendar') return pagesOf(design).map((page) => page.label).join(' + ');
  const fronts = calPages(design);
  return `${fronts} month page${fronts > 1 ? 's' : ''}${design.exp.back ? ' + year-at-a-glance back' : ''}`;
}

/**
 * A design's row in the order sheet.
 * @param item the design
 * @param number its row number, from 1
 * @param withFolder whether there is a Folder column
 * @returns the cells
 */
function designRow({ label, d: design, folder }: OrderItem, number: number, withFolder: boolean): (string | number)[] {
  const { w, h } = cardMM(design);
  const bleed = +design.exp.bleed;
  const spec = PRINT_SPECS[design.product];
  const envelope = envelopeSpec(design);
  return [
    number,
    label,
    ...(withFolder ? [folder ?? ''] : []),
    productOf(design.product).name,
    sizeName(sizeOf(design)),
    design.orient === 'landscape' ? 'Horizontal' : 'Vertical',
    `${round1(w)} × ${round1(h)} mm`,
    bleed ? `${round1(w + 2 * bleed)} × ${round1(h + 2 * bleed)} mm (${bleed} mm bleed)` : 'Trim size, no bleed',
    `${px300(w + 2 * bleed)} × ${px300(h + 2 * bleed)} px`,
    orderPages(design),
    layoutName(design.layout),
    spec.stock,
    spec.weight,
    spec.finish,
    spec.colour,
    relevantFinishing(spec, design).join('; '),
    design.env.on ? `${envelope.name} (${envelope.w} × ${envelope.h} mm)` : '—',
    '',
    ...QUOTE_QTY.map(() => ''),
    '',
  ];
}

/**
 * An envelope size's row in the order sheet.
 * @param name the envelope
 * @param design a design that uses it
 * @param usedBy the designs that use it
 * @param number its row number, from 1
 * @param withFolder whether there is a Folder column
 * @returns the cells
 */
function envelopeRow(name: string, design: Design, usedBy: string[], number: number, withFolder: boolean): string[] {
  const spec = PRINT_SPECS.envelope;
  const envelope = envelopeSpec(design);
  const sheet = templateSheet(design);
  return [
    `E${number}`,
    `Envelope for ${usedBy.join(', ')}`,
    ...(withFolder ? [''] : []),
    'Envelope',
    name,
    'Horizontal',
    `${envelope.w} × ${envelope.h} mm`,
    'Envelope size (no bleed)',
    `${px300(envelope.w)} × ${px300(envelope.h)} px`,
    'Front (address side) + back (flap side)',
    sheet ? `Fold-your-own template on ${sheet.name} also supplied` : 'Ready-made envelope',
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
}

/**
 * An order sheet for print shops (CSV, opens in Excel or Google Sheets): one row per design with its size, pages,
 * paper and finishing, one row per envelope size, and empty price-per-piece columns for every quote quantity.
 * @param items the designs
 * @returns the CSV text, with a byte-order mark
 */
export function orderSheetCSV(items: OrderItem[]): string {
  const withFolder = items.some((item) => item.folder);
  const rows: (string | number)[][] = [orderHeader(withFolder)];
  const envelopes = new Map<string, { design: Design; usedBy: string[] }>();
  items.forEach((item, index) => {
    const design = item.d;
    if (design.env.on) {
      const name = envelopeSpec(design).name;
      const entry = envelopes.get(name) ?? { design, usedBy: [] };
      entry.usedBy.push(item.label);
      envelopes.set(name, entry);
    }
    rows.push(designRow(item, index + 1, withFolder));
  });
  [...envelopes].forEach(([name, { design, usedBy }], index) => rows.push(envelopeRow(name, design, usedBy, index + 1, withFolder)));
  return `${BYTE_ORDER_MARK}${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
