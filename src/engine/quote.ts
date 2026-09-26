import { layoutName } from '../data/layouts';
import { MONTHS, PRODUCTS, productOf, sizesFor } from '../data/products';
import { PRINT_SPECS, QUOTE_QTY, type PrintSpecDef, type QuoteCategory } from '../data/printSpecs';
import type { ShowcaseImage } from '../data/showcase';
import SHOWCASE_JSON from '../data/showcase.json';
import type { Design, ProductId, RenderInput, SizeDef } from '../types';
import { calPages, cardMM, productDesign, sizeOf } from './design';
import { envelopeSpec, STANDARD, templateSheet } from './envelope';
import { baseName, nup, pagesOf } from './export';
import { calMonth, renderCard } from './render';

/*
 * Documents for print shops, so a customer can ask for a quote:
 *   - buildQuoteCatalog(): every category (postcards, calendars, frames, magnets, envelopes) with samples, material and
 *     finishing specs, every size with bleed and sheet counts, and a blank price-per-piece grid by size and quantity;
 *   - buildQuoteRequest(input): the same for one design, with its own previews; added to every print pack.
 * Built with jsPDF (loaded on demand) in its standard Helvetica, so text is kept to Latin-1.
 */

type Doc = InstanceType<typeof import('jspdf').jsPDF>;

const PAGE_W = 210,
  PAGE_H = 297,
  M = 16,
  CONTENT = PAGE_W - 2 * M;
const UMBER: [number, number, number] = [122, 74, 43],
  INK: [number, number, number] = [42, 36, 30],
  MUTED: [number, number, number] = [106, 94, 82],
  LINE: [number, number, number] = [214, 202, 184],
  TINT: [number, number, number] = [246, 238, 226];

/** jsPDF's standard fonts cover Latin-1 only: swap the few other characters our data uses. */
const latin = (s: string) =>
  s
    .replace(/⅛/g, '1/8')
    .replace(/(\d)⅜/g, '$1 3/8')
    .replace(/⅜/g, '3/8')
    .replace(/→/g, '->')
    .replace(/✦/g, '*')
    .replace(/₹/g, 'Rs ')
    .replace(/[^\u0000-ÿ–—‘’“”•…]/g, '');

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A small writer over jsPDF: flowing text, tables that break across pages, images and a running footer. */
class Writer {
  y = M;
  constructor(
    readonly doc: Doc,
    readonly title: string,
  ) {}
  ensure(h: number) {
    if (this.y + h > PAGE_H - M - 8) this.page();
  }
  page() {
    this.doc.addPage('a4', 'p');
    this.y = M;
  }
  font(size: number, style: 'normal' | 'bold' | 'italic' = 'normal', color = INK) {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }
  heading(text: string, size = 16) {
    this.ensure(size * 0.6 + 6);
    this.font(size, 'bold', UMBER);
    this.doc.text(latin(text), M, this.y + size * 0.35);
    this.y += size * 0.45 + 3;
    this.doc.setDrawColor(...UMBER);
    this.doc.setLineWidth(0.5);
    this.doc.line(M, this.y, M + 24, this.y);
    this.y += 4;
  }
  sub(text: string) {
    this.ensure(9);
    this.font(10.5, 'bold', INK);
    this.doc.text(latin(text), M, this.y + 3.5);
    this.y += 6.5;
  }
  para(text: string, size = 9.5, color = MUTED, width = CONTENT) {
    this.font(size, 'normal', color);
    const lines = this.doc.splitTextToSize(latin(text), width) as string[];
    const lh = size * 0.42;
    this.ensure(lines.length * lh + 2);
    this.doc.text(lines, M, this.y + size * 0.3);
    this.y += lines.length * lh + 2.5;
  }
  bullets(items: string[], size = 9.5) {
    for (const it of items) {
      this.font(size, 'normal', INK);
      const lines = this.doc.splitTextToSize(latin(it), CONTENT - 5) as string[];
      const lh = size * 0.42;
      this.ensure(lines.length * lh + 1.5);
      this.doc.setFillColor(...UMBER);
      this.doc.circle(M + 1.2, this.y + 1.8, 0.7, 'F');
      this.doc.text(lines, M + 4.5, this.y + size * 0.3);
      this.y += lines.length * lh + 1.6;
    }
    this.y += 1.5;
  }
  /** Two-column label / value list with wrapping values. */
  facts(rows: [string, string][]) {
    const lw = 38;
    for (const [k, v] of rows) {
      this.font(9.2, 'normal', INK);
      const lines = this.doc.splitTextToSize(latin(v), CONTENT - lw - 3) as string[];
      const h = Math.max(1, lines.length) * 3.9 + 2.6;
      this.ensure(h);
      this.doc.setFillColor(...TINT);
      this.doc.rect(M, this.y, lw, h, 'F');
      this.font(8.6, 'bold', MUTED);
      this.doc.text(latin(k), M + 2, this.y + 4.2);
      this.font(9.2, 'normal', INK);
      this.doc.text(lines, M + lw + 3, this.y + 4.2);
      this.doc.setDrawColor(...LINE);
      this.doc.setLineWidth(0.2);
      this.doc.line(M, this.y + h, M + CONTENT, this.y + h);
      this.y += h;
    }
    this.y += 4;
  }
  /** Table with a repeating header; `blank` columns are left empty for the printer to fill in. */
  table(cols: { label: string; w: number; align?: 'left' | 'right' | 'center' }[], rows: string[][], rowH = 7) {
    const header = () => {
      this.doc.setFillColor(...UMBER);
      this.doc.rect(M, this.y, CONTENT, rowH, 'F');
      this.font(7.8, 'bold', [255, 250, 241]);
      let x = M;
      for (const c of cols) {
        const tx = c.align === 'right' ? x + c.w - 2 : c.align === 'center' ? x + c.w / 2 : x + 2;
        this.doc.text(latin(c.label), tx, this.y + rowH / 2 + 1.3, { align: c.align ?? 'left', maxWidth: c.w - 3 });
        x += c.w;
      }
      this.y += rowH;
    };
    this.ensure(rowH * 2);
    header();
    rows.forEach((row, i) => {
      // Cells wrap; the row grows to its tallest cell.
      this.font(8.4, 'normal', INK);
      const cells = cols.map((c, k) => this.doc.splitTextToSize(latin(row[k] ?? ''), c.w - 3) as string[]);
      const h = Math.max(rowH, Math.max(...cells.map((l) => l.length)) * 3.5 + 3.5);
      if (this.y + h > PAGE_H - M - 8) {
        this.page();
        header();
      }
      if (i % 2) {
        this.doc.setFillColor(...TINT);
        this.doc.rect(M, this.y, CONTENT, h, 'F');
      }
      this.font(8.4, 'normal', INK);
      let x = M;
      cols.forEach((c, k) => {
        const lines = cells[k];
        const tx = c.align === 'right' ? x + c.w - 2 : c.align === 'center' ? x + c.w / 2 : x + 2;
        if (lines.length && lines[0]) {
          const top = this.y + h / 2 - ((lines.length - 1) * 3.5) / 2 + 1.3;
          this.doc.text(lines, tx, top, { align: c.align ?? 'left' });
        }
        this.doc.setDrawColor(...LINE);
        this.doc.setLineWidth(0.15);
        this.doc.line(x, this.y, x, this.y + h);
        x += c.w;
      });
      this.doc.line(M + CONTENT, this.y, M + CONTENT, this.y + h);
      this.doc.line(M, this.y + h, M + CONTENT, this.y + h);
      this.y += h;
    });
    this.y += 5;
  }
  /** A row of images scaled to one height, centred; skips images that failed to load. */
  images(list: { data: string; w: number; h: number }[], height: number, gap = 5) {
    const ok = list.filter((i) => i.data);
    if (!ok.length) return;
    let hgt = height,
      total = ok.reduce((a, i) => a + (i.w / i.h) * hgt, 0) + gap * (ok.length - 1);
    if (total > CONTENT) {
      hgt *= (CONTENT - gap * (ok.length - 1)) / (total - gap * (ok.length - 1));
      total = CONTENT;
    }
    this.ensure(hgt + 4);
    let x = M + (CONTENT - total) / 2;
    for (const i of ok) {
      const w = (i.w / i.h) * hgt;
      this.doc.setFillColor(232, 224, 212);
      this.doc.rect(x + 0.8, this.y + 0.8, w, hgt, 'F');
      this.doc.addImage(i.data, 'JPEG', x, this.y, w, hgt, undefined, 'FAST');
      x += w + gap;
    }
    this.y += hgt + 5;
  }
  /** Labelled blank lines for the customer or the printer to fill in. */
  blanks(labels: string[], cols = 2) {
    const w = (CONTENT - (cols - 1) * 6) / cols;
    for (let i = 0; i < labels.length; i += cols) {
      this.ensure(11);
      labels.slice(i, i + cols).forEach((l, k) => {
        const x = M + k * (w + 6);
        this.font(8, 'bold', MUTED);
        this.doc.text(latin(l), x, this.y + 3);
        this.doc.setDrawColor(...LINE);
        this.doc.setLineWidth(0.3);
        this.doc.line(x, this.y + 9, x + w, this.y + 9);
      });
      this.y += 12;
    }
    this.y += 2;
  }
  footer() {
    const n = this.doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i);
      this.font(7.5, 'normal', MUTED);
      this.doc.text(latin(this.title), M, PAGE_H - 9);
      this.doc.text(`Page ${i} of ${n}`, PAGE_W - M, PAGE_H - 9, { align: 'right' });
      this.doc.setDrawColor(...LINE);
      this.doc.line(M, PAGE_H - 13, PAGE_W - M, PAGE_H - 13);
    }
  }
}

/** An image URL or canvas as a JPEG data URL (on white), scaled to at most maxW pixels wide. */
async function jpeg(src: string | HTMLCanvasElement, maxW = 900): Promise<{ data: string; w: number; h: number }> {
  try {
    let bmp: CanvasImageSource, w: number, h: number;
    if (typeof src === 'string') {
      const b = await createImageBitmap(await (await fetch(src)).blob());
      bmp = b;
      w = b.width;
      h = b.height;
    } else {
      bmp = src;
      w = src.width;
      h = src.height;
    }
    const k = Math.min(1, maxW / w),
      cv = document.createElement('canvas');
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    const c = cv.getContext('2d')!;
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(bmp, 0, 0, cv.width, cv.height);
    return { data: cv.toDataURL('image/jpeg', 0.86), w: cv.width, h: cv.height };
  } catch {
    return { data: '', w: 1, h: 1 };
  }
}

const SHOTS = SHOWCASE_JSON as ShowcaseImage[];
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
const sampleImages = (cat: QuoteCategory) =>
  Promise.all(
    SAMPLES[cat]
      .map(([id, r]) => SHOTS.find((s) => s.id === id && s.render === r))
      .filter((s): s is ShowcaseImage => !!s)
      .map((s) => jpeg(s.src, 700)),
  );

/** "Classic 4×6 in", or "Jumbo (6×9 in)" when the name doesn't already say the size. */
const sizeName = (s: SizeDef) => (s.inch && !s.name.includes('×') ? `${s.name} (${s.inch})` : s.name);

/** A fresh design of a product at a size, as the studio would start it, for sheet counts. */
function designAt(p: ProductId, s: SizeDef): Design {
  const d = productDesign(p);
  return { ...d, sizeId: s.id, orient: s.native ?? d.orient, exp: { ...d.exp, bleed: '3', marks: true } };
}
const perSheet = (d: Design, sheet: Design['exp']['sheet']) => {
  const n = nup({ ...d, exp: { ...d.exp, sheet } });
  return n.cols * n.rows ? String(n.cols * n.rows) : '–';
};

function specFacts(w: Writer, s: PrintSpecDef) {
  w.facts([
    ['One piece', s.piece],
    ['Material', s.stock],
    ['Weight', s.weight],
    ['Finish', s.finish],
    ['Colour', s.colour],
    ['Finishing', s.finishing.join('. ') + '.'],
  ]);
}

const QTY_COLS = QUOTE_QTY.map((q) => ({ label: `${q} pc${q > 1 ? 's' : ''}`, w: 0, align: 'center' as const }));
/** Price grid: one row per item, one column per quantity, cells left blank. */
function priceGrid(w: Writer, items: string[]) {
  const first = 50,
    qw = (CONTENT - first) / QUOTE_QTY.length;
  // Start on a new page rather than leave the heading and a row or two stranded at the bottom.
  w.ensure(8 * (Math.min(items.length, 5) + 1) + 12);
  w.sub('Price per piece (INR, excluding GST) — to be filled in by the printer');
  w.table(
    [{ label: 'Item', w: first }, ...QTY_COLS.map((c) => ({ ...c, w: qw }))],
    items.map((i) => [i]),
    8,
  );
}

function generalSpecs(w: Writer) {
  w.sub('Files we supply');
  w.bullets([
    'Print-ready PDF (one page per side, trim + 3 mm bleed, crop marks) and separate PNG files, all at 300 dpi.',
    'Colours are sRGB. Please convert to CMYK with your usual profile, or tell us if you need CMYK files.',
    'Keep text and faces 4 mm inside the trim (safe area). Bleed is 3 mm on every edge unless stated.',
    'Sheet PDFs (many up on A4, A3 or 13×19 in, with crop marks and backs mirrored for long-edge duplex) on request.',
    'Every order comes with a PRINT-SPEC.txt listing the trim size, bleed, resolution, paper and finishing.',
  ]);
  w.sub('Please include in your quote');
  w.bullets([
    'Price per piece at each quantity, for each size you can produce (grids below).',
    'Paper you would use if different from ours, and the cost of a hard-copy proof.',
    'Turnaround time, packing, and delivery charges to our city.',
  ]);
}

/** The full specification and quote catalog for every category. */
export async function buildQuoteCatalog(): Promise<{ blob: Blob; name: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p', compress: true });
  const w = new Writer(doc, 'Chitthi – print specifications and quote request');
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // Cover
  w.font(26, 'bold', UMBER);
  doc.text('Chitthi', M, M + 10);
  w.font(15, 'normal', INK);
  doc.text('Print specifications and quote request', M, M + 19);
  w.font(9.5, 'normal', MUTED);
  doc.text(`Prepared ${date}. Postcards, calendars, photo frame prints, fridge magnets and envelopes.`, M, M + 26);
  w.y = M + 34;
  const covers = await Promise.all(
    (
      [
        ['diwali-postcard', 'front'],
        ['ladakh-calendar', 'front'],
        ['dadi-frame', 'front'],
        ['puppy-badge', 'front'],
      ] as const
    ).map(([id, r]) => {
      const s = SHOTS.find((x) => x.id === id && x.render === r);
      return s ? jpeg(s.src, 700) : Promise.resolve({ data: '', w: 1, h: 1 });
    }),
  );
  w.images(covers, 48);
  w.sub('Customer');
  w.blanks(['Name', 'Phone', 'Email', 'Delivery city and PIN', 'Needed by', 'Quote reference']);
  generalSpecs(w);
  w.sub('Contents');
  w.bullets([...PRODUCTS.map((p) => `${PRINT_SPECS[p.id].title}: ${PRINT_SPECS[p.id].summary}`), `${PRINT_SPECS.envelope.title}: ${PRINT_SPECS.envelope.summary}`]);

  // One section per product
  for (const p of PRODUCTS) {
    const spec = PRINT_SPECS[p.id],
      sizes = sizesFor(p.id).filter((s) => s.id !== 'custom');
    w.page();
    w.heading(spec.title);
    w.para(p.blurb);
    w.images(await sampleImages(p.id), 52);
    specFacts(w, spec);
    w.sub('Sizes');
    w.table(
      [
        { label: 'Size', w: 42 },
        { label: 'Trim (mm)', w: 30 },
        { label: 'With 3 mm bleed', w: 32 },
        { label: 'Shape', w: 26 },
        { label: 'Per A4', w: 16, align: 'center' },
        { label: 'Per A3', w: 16, align: 'center' },
        { label: 'Per 13×19', w: 16, align: 'center' },
      ],
      sizes.map((s) => {
        const d = designAt(p.id, s),
          { w: tw, h: th } = cardMM(d);
        return [
          sizeName(s),
          `${r1(tw)} × ${r1(th)}`,
          `${r1(tw + 6)} × ${r1(th + 6)}`,
          s.shape === 'circle' ? 'Round' : s.corner || s.instax ? `${s.corner ?? 3} mm corners` : 'Rectangle',
          perSheet(d, 'a4'),
          perSheet(d, 'a3'),
          perSheet(d, '1319'),
        ];
      }),
    );
    w.para('Custom sizes from 40 to 420 mm are also possible: please quote per square inch or per sheet as well.', 8.5);
    priceGrid(
      w,
      sizes.map(sizeName),
    );
  }

  // Envelopes
  const env = PRINT_SPECS.envelope;
  w.page();
  w.heading(env.title);
  w.para('Every design comes with a matching envelope: the smallest standard size the piece fits in, printed with the same occasion artwork, the address, and the Chitthi mark on the back.');
  w.images(await sampleImages('envelope'), 52);
  specFacts(w, env);
  const envRows = STANDARD.slice().sort((a, b) => a[1] * a[2] - b[1] * b[2]);
  w.sub('Standard envelope sizes');
  w.table(
    [
      { label: 'Envelope', w: 50 },
      { label: 'Size (mm)', w: 34 },
      { label: 'Holds pieces up to (mm)', w: 50 },
      { label: 'Used for', w: 44 },
    ],
    envRows.map(([n, L, S]) => {
      const users = PRODUCTS.flatMap((p) =>
        sizesFor(p.id)
          .filter((s) => s.id !== 'custom' && envelopeSpec(designAt(p.id, s)).name === n)
          .map((s) => s.name),
      );
      return [n, `${L} × ${S}`, `${L - 5} × ${S - 5}`, users.slice(0, 3).join(', ') + (users.length > 3 ? '…' : '')];
    }),
  );
  priceGrid(
    w,
    envRows.filter(([n]) => PRODUCTS.some((p) => sizesFor(p.id).some((s) => s.id !== 'custom' && envelopeSpec(designAt(p.id, s)).name === n))).map(([n]) => `${n} envelope`),
  );

  // Terms
  w.page();
  w.heading('Quote details');
  w.para('Please fill in and return with the price grids.');
  w.blanks(['Printer / company', 'Contact person', 'Phone', 'Email', 'Turnaround (working days)', 'Proof charge', 'Delivery charge', 'Quote valid until', 'GST number', 'Payment terms']);
  w.sub('Notes');
  for (let i = 0; i < 6; i++) w.blanks([''], 1);
  w.footer();
  return { blob: doc.output('blob'), name: `chitthi-print-specifications-${new Date().toISOString().slice(0, 10)}.pdf` };
}

/** The finishing lines that apply to this design (no Instax corners on a 4×6 card, no badge press on a square magnet). */
function relevantFinishing(spec: PrintSpecDef, d: Design): string[] {
  const s = sizeOf(d);
  return spec.finishing.filter((f) => {
    if (/Instax/.test(f)) return !!s.instax;
    if (/^Round/.test(f)) return s.shape === 'circle';
    if (/rounded corners/.test(f) && d.product === 'magnet') return s.shape !== 'circle';
    if (/^Desk/.test(f)) return s.id === 'cal-a5';
    if (/^Wall/.test(f)) return s.id !== 'cal-a5' && d.layout !== 'cal-strip' && d.cal.months > 1;
    if (/^Single-month/.test(f)) return d.layout === 'cal-strip' || d.cal.months === 1;
    return true;
  });
}

/** A quote request for one design: previews, the full job description and a price grid. */
export async function buildQuoteRequest(inp: RenderInput): Promise<{ blob: Blob; name: string }> {
  const { jsPDF } = await import('jspdf');
  const d = inp.d,
    p = productOf(d.product),
    spec = PRINT_SPECS[d.product],
    size = sizeOf(d),
    { w: tw, h: th } = cardMM(d),
    bleed = +d.exp.bleed,
    pages = pagesOf(d),
    fronts = calPages(d),
    title = d.designName.trim() || `${p.name}, ${size.name}`;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p', compress: true });
  const w = new Writer(doc, `Chitthi – quote request: ${title}`);

  w.font(22, 'bold', UMBER);
  doc.text('Quote request', M, M + 9);
  w.font(13, 'normal', INK);
  doc.text(latin(title), M, M + 17);
  w.font(9, 'normal', MUTED);
  doc.text(`${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · files: ${baseName(d)}-print-pack.zip`, M, M + 23);
  w.y = M + 30;

  // Previews: the first front, the back, and a second month for calendars.
  const px = 900 / Math.max(tw, th),
    shots: HTMLCanvasElement[] = [];
  const draw = (side: 'front' | 'back', page = 0) => {
    const cv = document.createElement('canvas');
    renderCard(cv, side, px, 0, inp, { page });
    shots.push(cv);
  };
  draw('front', 0);
  if (fronts > 1) draw('front', 1);
  if (d.exp.back && d.product !== 'magnet') draw('back');
  w.images(await Promise.all(shots.map((c) => jpeg(c, 800))), 62);

  const env = d.env.on ? envelopeSpec(d) : null;
  const pageText =
    d.product === 'calendar'
      ? d.layout === 'cal-strip'
        ? 'One page (the whole year)'
        : `${fronts} month page${fronts > 1 ? 's' : ''}${d.exp.back ? ' + year-at-a-glance back page' : ''} (${MONTHS[calMonth(d, 0).month]} ${calMonth(d, 0).year} onward)`
      : `${pages.length} side${pages.length > 1 ? 's' : ''} (${pages.map((x) => x.label.toLowerCase()).join(', ')})`;
  w.sub('Job');
  w.facts([
    ['Product', p.name],
    ['Size', `${sizeName(size)}: trim ${r1(tw)} × ${r1(th)} mm (${r1(tw / 25.4)} × ${r1(th / 25.4)} in), ${d.orient === 'landscape' ? 'horizontal' : 'vertical'}`],
    ['File size', bleed ? `${r1(tw + 2 * bleed)} × ${r1(th + 2 * bleed)} mm including ${bleed} mm bleed on every edge` : 'Trim size, no bleed'],
    ['Shape', size.shape === 'circle' ? 'Round (cut on the circle)' : size.corner || size.instax ? `Rectangle with ${size.corner ?? 3} mm rounded corners` : 'Rectangle'],
    ['Pages / sides', pageText],
    ['Layout', layoutName(d.layout)],
    ['Resolution', `${d.exp.dpi} dpi, sRGB (please convert to CMYK)`],
    ['Material', spec.stock],
    ['Weight', spec.weight],
    ['Finish', spec.finish],
    ['Colour', spec.colour],
    ['Finishing', relevantFinishing(spec, d).join('. ') + '.'],
    ...(env
      ? ([
          ['Envelope', `${env.name}, ${env.w} × ${env.h} mm. ${PRINT_SPECS.envelope.weight}. ${templateSheet(d) ? `Fold-your-own template on ${templateSheet(d)!.name} also supplied.` : ''}`],
        ] as [string, string][])
      : []),
  ]);
  priceGrid(w, [`${p.name}, ${size.name}`, ...(env ? [`Envelope, ${env.name}`] : [])]);
  w.sub('Customer');
  w.blanks(['Name', 'Phone', 'Email', 'Delivery city and PIN', 'Quantity wanted', 'Needed by']);
  w.sub('Printer');
  w.blanks(['Printer / company', 'Turnaround (working days)', 'Proof charge', 'Delivery charge', 'Quote valid until', 'GST number']);
  w.footer();
  return { blob: doc.output('blob'), name: `${baseName(d)}-QUOTE-REQUEST.pdf` };
}
