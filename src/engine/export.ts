import type { jsPDF } from 'jspdf';
import { layoutName } from '../data/layouts';
import { PRINT_SPECS, QUOTE_QTY } from '../data/printSpecs';
import { productOf } from '../data/products';
import { creditsText } from '../lib/credits';
import { crc32, makeZip, type ZipEntry } from '../lib/zip';
import type { Design, RenderInput, Side } from '../types';
import { calMonth } from './calendarDraw';
import { cardMM, sizeOf } from './design';
import { envelopeSpec, envelopeSummary, templateSheet } from './envelope';
import { renderEnvelope } from './envelopeDraw';
import { renderEnvelopeTemplate } from './envelopeTemplate';
import { baseName, bleedText, monthName, nup, pagesOf, round1, SHEETS, type Imposition, type PrintPage } from './printPages';
import { renderCard } from './render';

/*
 * Print files: the print PDF (one page per side, or several cards per sheet), PNGs tagged with their dpi, the print
 * shop's specification, the envelope's files and the whole print pack as a ZIP. Loaded with import() when exporting.
 */

/**
 * A side drawn at the export's resolution and bleed.
 * @param page the side and page
 * @param input the design and its photos
 * @returns the canvas
 */
function cardCanvas(page: Pick<PrintPage, 'side' | 'page'>, input: RenderInput): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  renderCard(canvas, page.side, +input.d.exp.dpi / 25.4, +input.d.exp.bleed, input, { page: page.page });
  return canvas;
}

/**
 * A canvas turned a quarter.
 * @param canvas the canvas
 * @param direction 1 clockwise, -1 the other way
 * @returns the turned copy
 */
function rotate(canvas: HTMLCanvasElement, direction: 1 | -1): HTMLCanvasElement {
  const turned = document.createElement('canvas');
  turned.width = canvas.height;
  turned.height = canvas.width;
  const ctx = turned.getContext('2d');
  if (ctx) {
    ctx.translate(turned.width / 2, turned.height / 2);
    ctx.rotate((direction * Math.PI) / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  }
  return turned;
}

/**
 * Lets the page breathe between heavy steps.
 * @returns after 20 ms
 */
const tick = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

/** A file built. */
export interface BuiltFile {
  blob: Blob;
  name: string;
}

/** How pages become images in the PDF. */
interface PdfImages {
  /** jsPDF's image format. */
  format: 'PNG' | 'JPEG';
  /** A canvas as a data URL. */
  data: (canvas: HTMLCanvasElement) => string;
}

/** A trim box's crop marks: its corner, size, the gap before the marks and their length, mm. */
interface CropMarks {
  x: number;
  y: number;
  w: number;
  h: number;
  gap: number;
  length: number;
}

/**
 * Crop marks at a trim box's four corners.
 * @param doc the PDF
 * @param marks the box and the marks' gap and length
 */
function drawCropMarks(doc: jsPDF, marks: CropMarks): void {
  const { x, y, w, h, gap, length } = marks;
  doc.setLineWidth(0.12);
  doc.setDrawColor(0);
  const corners: [number, number, number, number][] = [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ];
  for (const [cornerX, cornerY, outX, outY] of corners) {
    doc.line(cornerX + outX * gap, cornerY, cornerX + outX * (gap + length), cornerY);
    doc.line(cornerX, cornerY + outY * gap, cornerX, cornerY + outY * (gap + length));
  }
}

/**
 * The print PDF with one page per side, at document size (with crop marks on a slug when asked).
 * @param input the design and its photos
 * @param images how pages become images
 * @param PdfDocument jsPDF
 * @returns the file
 */
async function pagePdf(input: RenderInput, images: PdfImages, PdfDocument: typeof jsPDF): Promise<BuiltFile> {
  const design = input.d;
  const { w, h } = cardMM(design);
  const bleed = +design.exp.bleed;
  const slug = design.exp.marks ? 9 : 0;
  const pageWidth = w + 2 * bleed + 2 * slug;
  const pageHeight = h + 2 * bleed + 2 * slug;
  const orientation = pageWidth > pageHeight ? 'l' : 'p';
  const doc = new PdfDocument({ unit: 'mm', format: [pageWidth, pageHeight], orientation, compress: true });
  const pages = pagesOf(design);
  for (const [index, page] of pages.entries()) {
    if (index) doc.addPage([pageWidth, pageHeight], orientation);
    await tick();
    doc.addImage(images.data(cardCanvas(page, input)), images.format, slug, slug, w + 2 * bleed, h + 2 * bleed, page.tag, 'FAST');
    if (design.exp.marks) {
      drawCropMarks(doc, { x: slug + bleed, y: slug + bleed, w, h, gap: bleed + 1.5, length: slug - 2 });
      doc.setFontSize(5);
      doc.setTextColor(120);
      doc.text(`${page.label} · ${round1(w)}×${round1(h)} mm trim · bleed ${bleedText(bleed)}`, slug + bleed, pageHeight - 2.5);
    }
  }
  return { blob: doc.output('blob'), name: `${baseName(design)}-print.pdf` };
}

/**
 * Lays one side's image on a sheet as often as it fits; backs are mirrored so they line up when flipped on the long edge.
 * @param doc the PDF
 * @param imposition how cards sit on the sheet
 * @param side the side
 * @param image the side's image, its format and its alias
 * @param image.data the image as a data URL
 * @param image.format jsPDF's image format
 * @param image.alias the image's name in the PDF
 * @param marks whether to draw crop marks
 */
function fillSheet(doc: jsPDF, imposition: Imposition, side: Side, image: { data: string; format: PdfImages['format']; alias: string }, marks: boolean): void {
  const gridWidth = imposition.cols * imposition.cw + (imposition.cols - 1) * imposition.gap;
  const gridHeight = imposition.rows * imposition.ch + (imposition.rows - 1) * imposition.gap;
  const left = (imposition.SW - gridWidth) / 2;
  const top = (imposition.SH - gridHeight) / 2;
  for (let row = 0; row < imposition.rows; row++) {
    for (let column = 0; column < imposition.cols; column++) {
      const placed = side === 'back' ? imposition.cols - 1 - column : column;
      const x = left + placed * (imposition.cw + imposition.gap);
      const y = top + row * (imposition.ch + imposition.gap);
      doc.addImage(image.data, image.format, x, y, imposition.cw, imposition.ch, image.alias, 'FAST');
      if (marks) drawCropMarks(doc, { x: x + imposition.b, y: y + imposition.b, w: imposition.w, h: imposition.h, gap: imposition.b + 1, length: 3 });
    }
  }
}

/**
 * The print PDF with several cards per sheet.
 * @param input the design and its photos
 * @param images how pages become images
 * @param PdfDocument jsPDF
 * @returns the file
 * @throws {Error} when no card fits on the sheet
 */
async function sheetPdf(input: RenderInput, images: PdfImages, PdfDocument: typeof jsPDF): Promise<BuiltFile> {
  const design = input.d;
  const pages = pagesOf(design);
  const imposition = nup(design);
  if (!(imposition.cols * imposition.rows)) throw new Error('This doesn’t fit on the chosen sheet. Choose a larger sheet.');
  const doc = new PdfDocument({ unit: 'mm', format: [imposition.SW, imposition.SH], orientation: 'p', compress: true });
  const hasBack = pages.some((page) => page.side === 'back');
  const duplex = hasBack && design.product !== 'calendar' ? ', double-sided, flip on long edge' : '';
  for (const [index, page] of pages.entries()) {
    if (index) doc.addPage([imposition.SW, imposition.SH], 'p');
    await tick();
    let canvas = cardCanvas(page, input);
    if (imposition.rot) canvas = rotate(canvas, page.side === 'front' ? 1 : -1);
    fillSheet(doc, imposition, page.side, { data: images.data(canvas), format: images.format, alias: `img${index}` }, design.exp.marks);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`${page.label} – print at 100% (actual size)${duplex}`, imposition.SW / 2, imposition.SH - 4, { align: 'center' });
  }
  return { blob: doc.output('blob'), name: `${baseName(design)}-${design.exp.sheet}-sheet.pdf` };
}

/**
 * The print PDF.
 * @param input the design and its photos
 * @param format one page per side ('pdf') or several per sheet; overrides the design's choice (the print pack always
 *   includes a PDF)
 * @returns the file
 */
export async function buildPDF(input: RenderInput, format: 'pdf' | 'sheet' = input.d.exp.format === 'sheet' ? 'sheet' : 'pdf'): Promise<BuiltFile> {
  const { jsPDF: PdfDocument } = await import('jspdf');
  const png = input.d.exp.quality === 'png';
  const images: PdfImages = {
    format: png ? 'PNG' : 'JPEG',
    data: (canvas) => (png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.95)),
  };
  return format === 'pdf' ? pagePdf(input, images, PdfDocument) : sheetPdf(input, images, PdfDocument);
}

/**
 * A canvas as a PNG file.
 * @param canvas the canvas
 * @returns the file's bytes
 * @throws {Error} when the browser makes no PNG
 */
const pngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The image couldn’t be created.'));
    }, 'image/png');
  });

/**
 * A pHYs chunk: the pixels per metre printers read the dpi from.
 * @param dpi the resolution
 * @returns the chunk, length and CRC included
 */
function physChunk(dpi: number): Uint8Array {
  const perMetre = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return chunk;
}

/**
 * A side as a PNG with a pHYs chunk, so printers read the intended dpi.
 * @param page the side, page and file-name tag
 * @param input the design and its photos
 * @returns the file
 */
export async function buildPNG(page: Pick<PrintPage, 'side' | 'page' | 'tag'>, input: RenderInput): Promise<BuiltFile> {
  const blob = await pngBlob(cardCanvas(page, input));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const name = `${baseName(input.d)}-${page.tag}.png`;
  if (new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(200, bytes.length))).includes('pHYs')) return { blob, name };
  // The chunk goes right after the IHDR chunk (33 bytes in).
  const tagged = new Uint8Array(bytes.length + 21);
  tagged.set(bytes.subarray(0, 33));
  tagged.set(physChunk(+input.d.exp.dpi), 33);
  tagged.set(bytes.subarray(33), 54);
  return { blob: new Blob([tagged], { type: 'image/png' }), name };
}

/** Writes the specification: label–value lines and section headings. */
class SpecWriter {
  readonly lines: string[] = [];

  /**
   * A label and its value, the value in a column.
   * @param label the label ('' continues the line before)
   * @param value the value
   */
  line(label: string, value: string): void {
    this.lines.push(`${(label ? label + ':' : '').padEnd(22)}${value}`);
  }

  /**
   * A section's heading, after a blank line.
   * @param title the heading
   */
  heading(title: string): void {
    this.lines.push('', title, '-'.repeat(60));
  }
}

/**
 * A calendar's months as the spec shows them.
 * @param design the design
 * @returns e.g. "January 2027 – December 2027 (12 pages)"
 */
function monthsText(design: Design): string {
  const first = calMonth(design, 0);
  const last = calMonth(design, design.cal.months - 1);
  const start = `${monthName(first.month)} ${first.year}`;
  if (design.layout === 'cal-strip') {
    const yearEnd = calMonth({ ...design, cal: { ...design.cal, months: 12 } }, 11);
    return `${start} – ${monthName(yearEnd.month)} ${yearEnd.year} on one page`;
  }
  if (design.cal.months > 1) return `${start} – ${monthName(last.month)} ${last.year} (${design.cal.months} pages)`;
  return `${start} (single page)`;
}

/**
 * The item: product, size, layout and what is particular to the product.
 * @param spec the writer
 * @param design the design
 */
function itemSection(spec: SpecWriter, design: Design): void {
  const size = sizeOf(design);
  const named = design.designName.trim() ? ` – “${design.designName.trim()}”` : '';
  spec.line('Item', `${productOf(design.product).name}${named}`);
  spec.line('Size', `${size.name}, ${design.orient === 'landscape' ? 'horizontal' : 'vertical'}`);
  spec.line('Layout', layoutName(design.layout));
  if (design.product === 'calendar') {
    spec.line('Months', monthsText(design));
    spec.line('Week starts on', design.cal.weekStart ? 'Monday' : 'Sunday');
  }
  if (design.product === 'magnet') {
    spec.line('Shape', size.shape === 'circle' ? 'Round: cut on the trim circle' : `Rounded corners, ${size.corner ?? 3} mm radius (corner punch after trimming)`);
  }
  if (design.product === 'frame') spec.line('Mat border', { none: 'None (borderless)', thin: 'Thin', classic: 'Classic', wide: 'Wide' }[design.mat]);
}

/**
 * The dimensions: trim, bleed, document size, safe area, resolution and colour.
 * @param spec the writer
 * @param design the design
 */
function dimensionsSection(spec: SpecWriter, design: Design): void {
  const { w, h } = cardMM(design);
  const bleed = +design.exp.bleed;
  const dpi = +design.exp.dpi;
  const pixels = (mm: number) => String(Math.round((mm / 25.4) * dpi));
  const inches = (mm: number) => String(round1(mm / 25.4));
  spec.heading('DIMENSIONS');
  spec.line('Trim (final) size', `${round1(w)} × ${round1(h)} mm  (${inches(w)} × ${inches(h)} in)`);
  spec.line('Bleed', bleed ? `${bleedText(bleed)} on every edge` : 'None – print edge to edge is not possible without bleed');
  spec.line('Document size', `${round1(w + 2 * bleed)} × ${round1(h + 2 * bleed)} mm  (trim + bleed)`);
  spec.line('Safe area', `Keep text and faces ${bleed ? '4 mm' : '5 mm'} inside the trim: ${round1(w - 8)} × ${round1(h - 8)} mm`);
  spec.line('Resolution', `${dpi} dpi → ${pixels(w + 2 * bleed)} × ${pixels(h + 2 * bleed)} px per page`);
  spec.line('Colour', 'sRGB. Digital presses print it as is; offset printers convert to CMYK (expect slightly duller brights).');
}

/**
 * How the sides are printed.
 * @param design the design
 * @param hasBack whether a back is printed
 * @returns the spec's Sides line
 */
function sidesText(design: Design, hasBack: boolean): string {
  if (hasBack && design.product === 'postcard') return 'Double-sided: front on side 1, back on side 2, flip on the LONG edge.';
  if (hasBack && design.product === 'calendar') return 'Single-sided pages: one per month, plus the year-at-a-glance page as the back cover.';
  if (hasBack) return 'Front is the photo print; the back label is optional (print it on the reverse, or as a sticker).';
  if (design.product === 'magnet') return 'Single-sided print, mounted on magnetic sheet.';
  return 'Single-sided.';
}

/**
 * Printing: the product's print specification, paper, scale, sides, cutting and imposition.
 * @param spec the writer
 * @param design the design
 * @param hasBack whether a back is printed
 */
function printingSection(spec: SpecWriter, design: Design, hasBack: boolean): void {
  const bleed = +design.exp.bleed;
  const print = PRINT_SPECS[design.product];
  spec.heading('PRINTING');
  spec.line('One piece', print.piece);
  spec.line('Material', print.stock);
  spec.line('Weight', print.weight);
  spec.line('Finish', print.finish);
  spec.line('Colour', print.colour);
  print.finishing.forEach((finishing, index) => {
    spec.line(index ? '' : 'Finishing', finishing);
  });
  spec.line('Paper advice', productOf(design.product).paper);
  spec.line('Scale', 'Print at 100% / actual size. Never “fit to page”.');
  spec.line('Sides', sidesText(design, hasBack));
  spec.line('Cutting', bleed ? `Cut on the trim line, ${bleedText(bleed)} in from each edge of the file. Crop marks show where.` : 'Files are exactly trim size.');
  if (design.exp.format === 'sheet') {
    const imposition = nup(design);
    spec.line('Imposition', `${imposition.cols * imposition.rows} up on ${SHEETS[design.exp.sheet][2]} in the sheet PDF (backs mirrored for long-edge duplex).`);
  }
}

/**
 * The envelope: its size, a ready-made one, and the fold-your-own template.
 * @param spec the writer
 * @param design the design
 */
function envelopeSection(spec: SpecWriter, design: Design): void {
  const envelope = envelopeSpec(design);
  const sheet = templateSheet(design);
  spec.heading('ENVELOPE');
  spec.line('Size', envelopeSummary(design));
  spec.line('Ready-made envelope', `Buy ${envelope.name} envelopes and print the envelope PDF on them (page 1: address side), or print only the front.`);
  if (sheet) {
    spec.line('Fold your own', `Print the template on ${sheet.name} (120–160 gsm), cut on solid lines, fold on dashed lines, glue the bottom flap to the side flaps.`);
  }
}

/**
 * The plain-text brief for the print shop: sizes, bleed, safe area, resolution, paper and how to print each file.
 * @param input the design and its photos
 * @param files the pack's file names
 * @returns the text
 */
export function printSpec(input: RenderInput, files: string[]): string {
  const design = input.d;
  const hasBack = pagesOf(design).some((page) => page.side === 'back');
  const spec = new SpecWriter();
  spec.lines.push('CHITTHI – PRINT SPECIFICATION', '='.repeat(60), '');
  itemSection(spec, design);
  dimensionsSection(spec, design);
  printingSection(spec, design, hasBack);
  if (design.env.on) envelopeSection(spec, design);
  spec.heading('QUOTE');
  spec.line('Quote request', `See ${baseName(design)}-QUOTE-REQUEST.pdf: previews, this spec and a price grid`);
  spec.line('Quantities to price', QUOTE_QTY.join(', ') + ' pieces');
  spec.heading('FILES IN THIS PACK');
  for (const file of files) spec.lines.push(`  ${file}`);
  spec.lines.push(
    '',
    ...(design.exp.pngs ? ['Front and back PNGs are separate files at the full document size (with bleed), tagged with their dpi.'] : []),
    'The PDF contains every page in order, with crop marks when selected.',
    '',
    `Created ${new Date().toLocaleString()} with Chitthi.`,
  );
  return spec.lines.join('\n');
}

/* ---------- envelope ---------- */

/**
 * The envelope's front and back at envelope size (page 1 is the address side), to print on a ready-made envelope.
 * @param input the design and its photos
 * @returns the file
 */
export async function buildEnvelopePDF(input: RenderInput): Promise<BuiltFile> {
  const { jsPDF: PdfDocument } = await import('jspdf');
  const envelope = envelopeSpec(input.d);
  const pxPerMm = +input.d.exp.dpi / 25.4;
  const doc = new PdfDocument({ unit: 'mm', format: [envelope.w, envelope.h], orientation: 'l', compress: true });
  (['front', 'back'] as const).forEach((face, index) => {
    if (index) doc.addPage([envelope.w, envelope.h], 'l');
    const canvas = document.createElement('canvas');
    renderEnvelope(canvas, face, pxPerMm, input);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, envelope.w, envelope.h, `env-${face}`, 'FAST');
  });
  return { blob: doc.output('blob'), name: `${baseName(input.d)}-envelope-print.pdf` };
}

/**
 * The fold-your-own envelope on its sheet.
 * @param input the design and its photos
 * @returns the file, or null when it's too big for a 13×19 in sheet
 */
export async function buildEnvelopeTemplate(input: RenderInput): Promise<BuiltFile | null> {
  const sheet = templateSheet(input.d);
  if (!sheet) return null;
  const { jsPDF: PdfDocument } = await import('jspdf');
  const canvas = document.createElement('canvas');
  renderEnvelopeTemplate(canvas, +input.d.exp.dpi / 25.4, input);
  const doc = new PdfDocument({ unit: 'mm', format: [sheet.w, sheet.h], orientation: sheet.w > sheet.h ? 'l' : 'p', compress: true });
  doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, sheet.w, sheet.h, 'env-template', 'FAST');
  return { blob: doc.output('blob'), name: `${baseName(input.d)}-envelope-template-${sheet.id}.pdf` };
}

/**
 * The envelope's files for the pack: front and back PNGs, its PDF and the template.
 * @param input the design and its photos
 * @returns the entries
 */
async function envelopeEntries(input: RenderInput): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  for (const face of ['front', 'back'] as const) {
    const canvas = document.createElement('canvas');
    renderEnvelope(canvas, face, +input.d.exp.dpi / 25.4, input);
    entries.push({ name: `envelope/${baseName(input.d)}-envelope-${face}.png`, data: await pngBlob(canvas) });
  }
  const pdf = await buildEnvelopePDF(input);
  entries.push({ name: `envelope/${pdf.name}`, data: pdf.blob });
  const template = await buildEnvelopeTemplate(input);
  if (template) entries.push({ name: `envelope/${template.name}`, data: template.blob });
  return entries;
}

/**
 * The complete print pack: every front and back as separate PNGs, the print PDF, the envelope, the quote request, the
 * photo credits and the spec sheet, in one ZIP.
 * @param input the design and its photos
 * @param onStep told what is being made, for a progress line
 * @returns the ZIP
 */
export async function buildPack(input: RenderInput, onStep?: (message: string) => void): Promise<BuiltFile> {
  const entries: ZipEntry[] = [];
  const pages = input.d.exp.pngs ? pagesOf(input.d) : [];
  for (const page of pages) {
    onStep?.(`Rendering ${page.label.toLowerCase()}…`);
    await tick();
    const { blob, name } = await buildPNG(page, input);
    entries.push({ name: `${page.side === 'front' ? 'front' : 'back'}/${name}`, data: blob });
  }
  onStep?.('Building PDF…');
  const pdf = await buildPDF(input);
  entries.push({ name: pdf.name, data: pdf.blob });
  if (input.d.env.on) {
    onStep?.('Making the envelope…');
    await tick();
    entries.push(...(await envelopeEntries(input)));
  }
  onStep?.('Writing the quote request…');
  const { buildQuoteRequest } = await import('./quote');
  const quote = await buildQuoteRequest(input);
  entries.push({ name: quote.name, data: quote.blob });
  // Pexels photos: who took them, with links, and what the license allows (see docs/PEXELS.md).
  const credits = creditsText(input.photos.map((photo) => photo.name));
  if (credits) entries.push({ name: `${baseName(input.d)}-PHOTO-CREDITS.txt`, data: credits.replace(/\n/g, '\r\n') });
  const specName = `${baseName(input.d)}-PRINT-SPEC.txt`;
  entries.push({ name: specName, data: printSpec(input, [...entries.map((entry) => entry.name), specName]).replace(/\n/g, '\r\n') });
  onStep?.('Packing…');
  return { blob: await makeZip(entries), name: `${baseName(input.d)}-print-pack.zip` };
}
