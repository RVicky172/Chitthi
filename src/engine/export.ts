import { layoutName } from '../data/layouts';
import { PRINT_SPECS, QUOTE_QTY } from '../data/printSpecs';
import { MONTHS, productOf } from '../data/products';
import { crc32, makeZip, type ZipEntry } from '../lib/zip';
import type { Design, RenderInput, Side } from '../types';
import { calPages, cardMM, sizeOf } from './design';
import { envelopeSpec, envelopeSummary, renderEnvelope, renderEnvelopeTemplate, templateSheet } from './envelope';
import { calMonth, renderCard } from './render';

export const SHEETS: Record<Design['exp']['sheet'], [number, number, string]> = {
  a4: [210, 297, 'A4'],
  a3: [297, 420, 'A3'],
  '1319': [330.2, 482.6, '13×19 in'],
  letter: [215.9, 279.4, 'Letter'],
};

/** One printed side: postcards and frames have one front; calendars have a front page per month. */
export interface PrintPage {
  side: Side;
  page: number;
  /** Used in file names, e.g. "front", "front-03-march", "back". */
  tag: string;
  label: string;
}

export function pagesOf(d: Design): PrintPage[] {
  const out: PrintPage[] = [];
  const n = calPages(d);
  for (let p = 0; p < n; p++) {
    if (d.product === 'calendar') {
      const { year, month } = calMonth(d, p);
      out.push({
        side: 'front',
        page: p,
        tag: d.layout === 'cal-strip' ? 'front-year' : `front-${String(p + 1).padStart(2, '0')}-${MONTHS[month].toLowerCase()}`,
        label: d.layout === 'cal-strip' ? 'Year strip' : `${MONTHS[month]} ${year}`,
      });
    } else out.push({ side: 'front', page: 0, tag: 'front', label: 'Front' });
  }
  if (d.exp.back && d.product !== 'magnet') out.push({ side: 'back', page: 0, tag: 'back', label: productOf(d.product).backLabel });
  return out;
}

/** How many cards fit on the chosen sheet (tries both rotations). */
export function nup(d: Design) {
  const { w, h } = cardMM(d),
    b = +d.exp.bleed,
    gap = d.exp.marks ? 10 : 4,
    [SW, SH] = SHEETS[d.exp.sheet],
    m = 8;
  const fit = (cw: number, ch: number) => ({
    cols: Math.max(0, Math.floor((SW - 2 * m + gap) / (cw + gap))),
    rows: Math.max(0, Math.floor((SH - 2 * m + gap) / (ch + gap))),
  });
  const a = fit(w + 2 * b, h + 2 * b),
    r = fit(h + 2 * b, w + 2 * b),
    rot = r.cols * r.rows > a.cols * a.rows,
    f = rot ? r : a;
  return {
    ...f,
    rot,
    cw: rot ? h + 2 * b : w + 2 * b,
    ch: rot ? w + 2 * b : h + 2 * b,
    gap,
    SW,
    SH,
    b,
    w: rot ? h : w,
    h: rot ? w : h,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const bleedText = (b: number) => (b === 3.175 ? '⅛ in (3.175 mm)' : `${b} mm`);

export function exportSummary(inp: RenderInput): string {
  const d = inp.d,
    { w, h } = cardMM(d),
    b = +d.exp.bleed,
    dpi = +d.exp.dpi;
  const W = Math.round(((w + 2 * b) / 25.4) * dpi),
    H = Math.round(((h + 2 * b) / 25.4) * dpi);
  const pages = pagesOf(d).length;
  let s = `Each side: ${round1(w + 2 * b)} × ${round1(h + 2 * b)} mm${b ? ` (trim size plus ${bleedText(b)} bleed on every edge)` : ''}, ${W} × ${H} px at ${dpi} dpi. ${pages} page${pages > 1 ? 's' : ''} in total.`;
  if (d.exp.format === 'sheet') {
    const n = nup(d),
      name = SHEETS[d.exp.sheet][2];
    s +=
      n.cols * n.rows
        ? ` ${n.cols * n.rows} per ${name} sheet${n.rot ? ', turned sideways' : ''}.`
        : ` This is too big for ${name}. Pick a larger sheet.`;
  }
  if (!inp.photos.length) s += ' No photos yet, so photo areas will show the background.';
  return s;
}

export function baseName(d: Design): string {
  const n = d.designName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (n) return `chitthi-${n}-${sizeOf(d).id}`;
  return `chitthi-${d.product}-${d.useOccasion ? d.themeId : 'plain'}-${sizeOf(d).id}-${d.orient === 'landscape' ? 'horizontal' : 'vertical'}`;
}

function cardCanvas(pg: Pick<PrintPage, 'side' | 'page'>, inp: RenderInput): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  renderCard(cv, pg.side, +inp.d.exp.dpi / 25.4, +inp.d.exp.bleed, inp, { page: pg.page });
  return cv;
}
function rotate(cv: HTMLCanvasElement, dir: 1 | -1): HTMLCanvasElement {
  const o = document.createElement('canvas');
  o.width = cv.height;
  o.height = cv.width;
  const c = o.getContext('2d');
  if (c) {
    c.translate(o.width / 2, o.height / 2);
    c.rotate((dir * Math.PI) / 2);
    c.drawImage(cv, -cv.width / 2, -cv.height / 2);
  }
  return o;
}
const tick = () => new Promise((r) => setTimeout(r, 20));

/** Print PDF. `format` overrides the design's choice (the print pack always includes a PDF). */
export async function buildPDF(inp: RenderInput, format: 'pdf' | 'sheet' = inp.d.exp.format === 'sheet' ? 'sheet' : 'pdf') {
  const { jsPDF } = await import('jspdf');
  const d = inp.d,
    png = d.exp.quality === 'png',
    fmt = png ? 'PNG' : 'JPEG';
  const data = (cv: HTMLCanvasElement) => (png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.95));
  const pages = pagesOf(d);
  type Doc = InstanceType<typeof jsPDF>;
  const marks = (doc: Doc, tx: number, ty: number, w: number, h: number, g: number, len: number) => {
    doc.setLineWidth(0.12);
    doc.setDrawColor(0);
    for (const [x, y, sx, sy] of [
      [tx, ty, -1, -1],
      [tx + w, ty, 1, -1],
      [tx, ty + h, -1, 1],
      [tx + w, ty + h, 1, 1],
    ]) {
      doc.line(x + sx * g, y, x + sx * (g + len), y);
      doc.line(x, y + sy * g, x, y + sy * (g + len));
    }
  };

  if (format === 'pdf') {
    const { w, h } = cardMM(d),
      b = +d.exp.bleed,
      slug = d.exp.marks ? 9 : 0,
      pw = w + 2 * b + 2 * slug,
      ph = h + 2 * b + 2 * slug;
    const or = pw > ph ? 'l' : 'p';
    const doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: or, compress: true });
    for (let i = 0; i < pages.length; i++) {
      if (i) doc.addPage([pw, ph], or);
      await tick();
      doc.addImage(data(cardCanvas(pages[i], inp)), fmt, slug, slug, w + 2 * b, h + 2 * b, pages[i].tag, 'FAST');
      if (d.exp.marks) {
        marks(doc, slug + b, slug + b, w, h, b + 1.5, slug - 2);
        doc.setFontSize(5);
        doc.setTextColor(120);
        doc.text(`${pages[i].label} · ${round1(w)}×${round1(h)} mm trim · bleed ${bleedText(b)}`, slug + b, ph - 2.5);
      }
    }
    return { blob: doc.output('blob'), name: `${baseName(d)}-print.pdf` };
  }

  const n = nup(d);
  if (!(n.cols * n.rows)) throw new Error('This doesn’t fit on the chosen sheet. Choose a larger sheet.');
  const doc = new jsPDF({ unit: 'mm', format: [n.SW, n.SH], orientation: 'p', compress: true });
  const gw = n.cols * n.cw + (n.cols - 1) * n.gap,
    gh = n.rows * n.ch + (n.rows - 1) * n.gap,
    x0 = (n.SW - gw) / 2,
    y0 = (n.SH - gh) / 2;
  const hasBack = pages.some((p) => p.side === 'back');
  for (let pi = 0; pi < pages.length; pi++) {
    const pg = pages[pi];
    if (pi) doc.addPage([n.SW, n.SH], 'p');
    await tick();
    let cv = cardCanvas(pg, inp);
    if (n.rot) cv = rotate(cv, pg.side === 'front' ? 1 : -1);
    const img = data(cv);
    for (let r = 0; r < n.rows; r++)
      for (let c = 0; c < n.cols; c++) {
        const cc = pg.side === 'back' ? n.cols - 1 - c : c; // mirrored so backs line up when flipped on the long edge
        const x = x0 + cc * (n.cw + n.gap),
          y = y0 + r * (n.ch + n.gap);
        doc.addImage(img, fmt, x, y, n.cw, n.ch, 'img' + pi, 'FAST');
        if (d.exp.marks) marks(doc, x + n.b, y + n.b, n.w, n.h, n.b + 1, 3);
      }
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `${pg.label} – print at 100% (actual size)${hasBack && d.product !== 'calendar' ? ', double-sided, flip on long edge' : ''}`,
      n.SW / 2,
      n.SH - 4,
      { align: 'center' },
    );
  }
  return { blob: doc.output('blob'), name: `${baseName(d)}-${d.exp.sheet}-sheet.pdf` };
}

/** PNG with a pHYs chunk so printers read the intended dpi. */
export async function buildPNG(pg: Pick<PrintPage, 'side' | 'page' | 'tag'>, inp: RenderInput): Promise<{ blob: Blob; name: string }> {
  const cv = cardCanvas(pg, inp),
    dpi = +inp.d.exp.dpi;
  const blob = await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error('The image couldn’t be created.'))), 'image/png'),
  );
  const buf = new Uint8Array(await blob.arrayBuffer()),
    name = `${baseName(inp.d)}-${pg.tag}.png`;
  if (new TextDecoder('latin1').decode(buf.subarray(0, Math.min(200, buf.length))).includes('pHYs')) return { blob, name };
  const ppm = Math.round(dpi / 0.0254),
    ch = new Uint8Array(21),
    dv = new DataView(ch.buffer);
  dv.setUint32(0, 9);
  ch.set([112, 72, 89, 115], 4);
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  ch[16] = 1;
  dv.setUint32(17, crc32(ch.subarray(4, 17)));
  const out = new Uint8Array(buf.length + 21);
  out.set(buf.subarray(0, 33));
  out.set(ch, 33);
  out.set(buf.subarray(33), 54);
  return { blob: new Blob([out], { type: 'image/png' }), name };
}

/** Plain-text brief for the print shop: sizes, bleed, safe area, resolution, paper and how to print each file. */
export function printSpec(inp: RenderInput, files: string[]): string {
  const d = inp.d,
    prod = productOf(d.product),
    size = sizeOf(d),
    { w, h } = cardMM(d),
    b = +d.exp.bleed,
    dpi = +d.exp.dpi,
    px = (mm: number) => Math.round((mm / 25.4) * dpi),
    inch = (mm: number) => round1(mm / 25.4),
    pages = pagesOf(d),
    hasBack = pages.some((p) => p.side === 'back');
  const L: string[] = [];
  const line = (k: string, v: string) => L.push(`${(k ? k + ':' : '').padEnd(22)}${v}`);
  L.push('CHITTHI – PRINT SPECIFICATION', '='.repeat(60), '');
  line('Item', `${prod.name}${d.designName.trim() ? ` – “${d.designName.trim()}”` : ''}`);
  line('Size', `${size.name}, ${d.orient === 'landscape' ? 'horizontal' : 'vertical'}`);
  line('Layout', layoutName(d.layout));
  if (d.product === 'calendar') {
    const a = calMonth(d, 0),
      z = calMonth(d, d.cal.months - 1);
    const strip = d.layout === 'cal-strip',
      zz = strip ? calMonth({ ...d, cal: { ...d.cal, months: 12 } }, 11) : z;
    line(
      'Months',
      `${MONTHS[a.month]} ${a.year}${strip ? ` – ${MONTHS[zz.month]} ${zz.year} on one page` : d.cal.months > 1 ? ` – ${MONTHS[z.month]} ${z.year} (${d.cal.months} pages)` : ' (single page)'}`,
    );
    line('Week starts on', d.cal.weekStart ? 'Monday' : 'Sunday');
  }
  if (d.product === 'magnet')
    line('Shape', size.shape === 'circle' ? 'Round: cut on the trim circle' : `Rounded corners, ${size.corner ?? 3} mm radius (corner punch after trimming)`);
  if (d.product === 'frame') line('Mat border', { none: 'None (borderless)', thin: 'Thin', classic: 'Classic', wide: 'Wide' }[d.mat]);
  L.push('', 'DIMENSIONS', '-'.repeat(60));
  line('Trim (final) size', `${round1(w)} × ${round1(h)} mm  (${inch(w)} × ${inch(h)} in)`);
  line('Bleed', b ? `${bleedText(b)} on every edge` : 'None – print edge to edge is not possible without bleed');
  line('Document size', `${round1(w + 2 * b)} × ${round1(h + 2 * b)} mm  (trim + bleed)`);
  line('Safe area', `Keep text and faces ${b ? '4 mm' : '5 mm'} inside the trim: ${round1(w - 8)} × ${round1(h - 8)} mm`);
  line('Resolution', `${dpi} dpi → ${px(w + 2 * b)} × ${px(h + 2 * b)} px per page`);
  line('Colour', 'sRGB. Digital presses print it as is; offset printers convert to CMYK (expect slightly duller brights).');
  L.push('', 'PRINTING', '-'.repeat(60));
  const ps = PRINT_SPECS[d.product];
  line('One piece', ps.piece);
  line('Material', ps.stock);
  line('Weight', ps.weight);
  line('Finish', ps.finish);
  line('Colour', ps.colour);
  ps.finishing.forEach((f, i) => line(i ? '' : 'Finishing', f));
  line('Paper advice', prod.paper);
  line('Scale', 'Print at 100% / actual size. Never “fit to page”.');
  if (hasBack && d.product === 'postcard') line('Sides', 'Double-sided: front on side 1, back on side 2, flip on the LONG edge.');
  else if (hasBack && d.product === 'calendar')
    line('Sides', 'Single-sided pages: one per month, plus the year-at-a-glance page as the back cover.');
  else if (hasBack) line('Sides', 'Front is the photo print; the back label is optional (print it on the reverse, or as a sticker).');
  else if (d.product === 'magnet') line('Sides', 'Single-sided print, mounted on magnetic sheet.');
  else line('Sides', 'Single-sided.');
  line('Cutting', b ? `Cut on the trim line, ${bleedText(b)} in from each edge of the file. Crop marks show where.` : 'Files are exactly trim size.');
  if (d.exp.format === 'sheet') {
    const n = nup(d);
    line('Imposition', `${n.cols * n.rows} up on ${SHEETS[d.exp.sheet][2]} in the sheet PDF (backs mirrored for long-edge duplex).`);
  }
  if (d.env.on) {
    const es = envelopeSpec(d),
      sh = templateSheet(d);
    L.push('', 'ENVELOPE', '-'.repeat(60));
    line('Size', envelopeSummary(d));
    line('Ready-made envelope', `Buy ${es.name} envelopes and print the envelope PDF on them (page 1: address side), or print only the front.`);
    if (sh)
      line('Fold your own', `Print the template on ${sh.name} (120–160 gsm), cut on solid lines, fold on dashed lines, glue the bottom flap to the side flaps.`);
  }
  L.push('', 'QUOTE', '-'.repeat(60));
  line('Quote request', `See ${baseName(d)}-QUOTE-REQUEST.pdf: previews, this spec and a price grid`);
  line('Quantities to price', QUOTE_QTY.join(', ') + ' pieces');
  L.push('', 'FILES IN THIS PACK', '-'.repeat(60));
  for (const f of files) L.push(`  ${f}`);
  L.push(
    '',
    'Front and back PNGs are separate files at the full document size (with bleed), tagged with their dpi.',
    'The PDF contains every page in order, with crop marks when selected.',
    '',
    `Created ${new Date().toLocaleString()} with Chitthi.`,
  );
  return L.join('\n');
}

/* ---------- envelope ---------- */

const pngBlob = (cv: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('The image couldn’t be created.'))), 'image/png'));

/** Envelope front and back at envelope size (page 1 is the address side), to print on a ready-made envelope. */
export async function buildEnvelopePDF(inp: RenderInput): Promise<{ blob: Blob; name: string }> {
  const { jsPDF } = await import('jspdf');
  const s = envelopeSpec(inp.d),
    px = +inp.d.exp.dpi / 25.4,
    doc = new jsPDF({ unit: 'mm', format: [s.w, s.h], orientation: 'l', compress: true });
  (['front', 'back'] as const).forEach((face, i) => {
    if (i) doc.addPage([s.w, s.h], 'l');
    const cv = document.createElement('canvas');
    renderEnvelope(cv, face, px, inp);
    doc.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, s.w, s.h, `env-${face}`, 'FAST');
  });
  return { blob: doc.output('blob'), name: `${baseName(inp.d)}-envelope-print.pdf` };
}

/** The fold-your-own envelope on its sheet, or null when it's too big for a 13×19 in sheet. */
export async function buildEnvelopeTemplate(inp: RenderInput): Promise<{ blob: Blob; name: string } | null> {
  const sheet = templateSheet(inp.d);
  if (!sheet) return null;
  const { jsPDF } = await import('jspdf');
  const cv = document.createElement('canvas');
  renderEnvelopeTemplate(cv, +inp.d.exp.dpi / 25.4, inp);
  const doc = new jsPDF({ unit: 'mm', format: [sheet.w, sheet.h], orientation: sheet.w > sheet.h ? 'l' : 'p', compress: true });
  doc.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, sheet.w, sheet.h, 'env-template', 'FAST');
  return { blob: doc.output('blob'), name: `${baseName(inp.d)}-envelope-template-${sheet.id}.pdf` };
}

/** The complete print pack: every front and back as separate PNGs, the print PDF and the spec sheet, in one ZIP. */
export async function buildPack(inp: RenderInput, onStep?: (msg: string) => void): Promise<{ blob: Blob; name: string }> {
  const entries: ZipEntry[] = [];
  const pages = pagesOf(inp.d);
  for (const pg of pages) {
    onStep?.(`Rendering ${pg.label.toLowerCase()}…`);
    await tick();
    const { blob, name } = await buildPNG(pg, inp);
    entries.push({ name: `${pg.side === 'front' ? 'front' : 'back'}/${name}`, data: blob });
  }
  onStep?.('Building PDF…');
  const pdf = await buildPDF(inp);
  entries.push({ name: pdf.name, data: pdf.blob });
  if (inp.d.env.on) {
    onStep?.('Making the envelope…');
    await tick();
    for (const face of ['front', 'back'] as const) {
      const cv = document.createElement('canvas');
      renderEnvelope(cv, face, +inp.d.exp.dpi / 25.4, inp);
      entries.push({ name: `envelope/${baseName(inp.d)}-envelope-${face}.png`, data: await pngBlob(cv) });
    }
    const ep = await buildEnvelopePDF(inp);
    entries.push({ name: `envelope/${ep.name}`, data: ep.blob });
    const tp = await buildEnvelopeTemplate(inp);
    if (tp) entries.push({ name: `envelope/${tp.name}`, data: tp.blob });
  }
  onStep?.('Writing the quote request…');
  const { buildQuoteRequest } = await import('./quote');
  const quote = await buildQuoteRequest(inp);
  entries.push({ name: quote.name, data: quote.blob });
  const specName = `${baseName(inp.d)}-PRINT-SPEC.txt`;
  entries.push({ name: specName, data: printSpec(inp, [...entries.map((e) => e.name), specName]).replace(/\n/g, '\r\n') });
  onStep?.('Packing…');
  return { blob: await makeZip(entries), name: `${baseName(inp.d)}-print-pack.zip` };
}
