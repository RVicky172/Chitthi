import type { Design, RenderInput, Side } from '../types';
import { cardMM, sizeOf } from './design';
import { renderCard } from './render';

export const SHEETS: Record<Design['exp']['sheet'], [number, number, string]> = {
  a4: [210, 297, 'A4'],
  a3: [297, 420, 'A3'],
  '1319': [330.2, 482.6, '13×19 in'],
  letter: [215.9, 279.4, 'Letter'],
};

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

export function exportSummary(inp: RenderInput): string {
  const d = inp.d,
    { w, h } = cardMM(d),
    b = +d.exp.bleed,
    dpi = +d.exp.dpi;
  const W = Math.round(((w + 2 * b) / 25.4) * dpi),
    H = Math.round(((h + 2 * b) / 25.4) * dpi);
  let s = `Each side: ${Math.round((w + 2 * b) * 10) / 10} × ${Math.round((h + 2 * b) * 10) / 10} mm${b ? ` (card plus ${b === 3.175 ? '⅛ in' : b + ' mm'} bleed on every edge)` : ''}, ${W} × ${H} px at ${dpi} dpi.`;
  if (d.exp.format === 'sheet') {
    const n = nup(d),
      name = SHEETS[d.exp.sheet][2];
    s +=
      n.cols * n.rows
        ? ` ${n.cols * n.rows} cards fit on one ${name} sheet${n.rot ? ', turned sideways' : ''}.`
        : ` This card is too big for ${name}. Pick a larger sheet.`;
  }
  if (!inp.photos.length) s += ' No photos yet, so photo areas will show the card background.';
  return s;
}

export function baseName(d: Design): string {
  const n = d.designName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  if (n) return `chitthi-${n}-${sizeOf(d).id}`;
  return `chitthi-${d.useOccasion ? d.themeId : 'plain'}-${sizeOf(d).id}-${d.orient === 'landscape' ? 'horizontal' : 'vertical'}`;
}

function cardCanvas(side: Side, inp: RenderInput): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  renderCard(cv, side, +inp.d.exp.dpi / 25.4, +inp.d.exp.bleed, inp);
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

export async function buildPDF(inp: RenderInput): Promise<{ blob: Blob; name: string }> {
  const { jsPDF } = await import('jspdf');
  const d = inp.d,
    png = d.exp.quality === 'png',
    fmt = png ? 'PNG' : 'JPEG';
  const data = (cv: HTMLCanvasElement) => (png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.95));
  const sides: Side[] = d.exp.back ? ['front', 'back'] : ['front'];
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

  if (d.exp.format === 'pdf') {
    const { w, h } = cardMM(d),
      b = +d.exp.bleed,
      slug = d.exp.marks ? 9 : 0,
      pw = w + 2 * b + 2 * slug,
      ph = h + 2 * b + 2 * slug;
    const or = pw > ph ? 'l' : 'p';
    const doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: or, compress: true });
    for (let i = 0; i < sides.length; i++) {
      if (i) doc.addPage([pw, ph], or);
      await tick();
      doc.addImage(data(cardCanvas(sides[i], inp)), fmt, slug, slug, w + 2 * b, h + 2 * b, sides[i], 'FAST');
      if (d.exp.marks) marks(doc, slug + b, slug + b, w, h, b + 1.5, slug - 2);
    }
    return { blob: doc.output('blob'), name: `${baseName(d)}-print.pdf` };
  }

  const n = nup(d);
  if (!(n.cols * n.rows)) throw new Error('The card doesn’t fit on this sheet. Choose a larger sheet.');
  const doc = new jsPDF({ unit: 'mm', format: [n.SW, n.SH], orientation: 'p', compress: true });
  const gw = n.cols * n.cw + (n.cols - 1) * n.gap,
    gh = n.rows * n.ch + (n.rows - 1) * n.gap,
    x0 = (n.SW - gw) / 2,
    y0 = (n.SH - gh) / 2;
  for (let si = 0; si < sides.length; si++) {
    const side = sides[si];
    if (si) doc.addPage([n.SW, n.SH], 'p');
    await tick();
    let cv = cardCanvas(side, inp);
    if (n.rot) cv = rotate(cv, side === 'front' ? 1 : -1);
    const img = data(cv);
    for (let r = 0; r < n.rows; r++)
      for (let c = 0; c < n.cols; c++) {
        const cc = side === 'back' ? n.cols - 1 - c : c; // mirrored so backs line up when flipped on the long edge
        const x = x0 + cc * (n.cw + n.gap),
          y = y0 + r * (n.ch + n.gap);
        doc.addImage(img, fmt, x, y, n.cw, n.ch, 'img' + si, 'FAST');
        if (d.exp.marks) marks(doc, x + n.b, y + n.b, n.w, n.h, n.b + 1, 3);
      }
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `${side === 'front' ? 'Front' : 'Back'} – print at 100% (actual size)${sides.length > 1 ? ', double-sided, flip on long edge' : ''}`,
      n.SW / 2,
      n.SH - 4,
      { align: 'center' },
    );
  }
  return { blob: doc.output('blob'), name: `${baseName(d)}-${d.exp.sheet}-sheet.pdf` };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG with a pHYs chunk so printers read the intended dpi. */
export async function buildPNG(side: Side, inp: RenderInput): Promise<{ blob: Blob; name: string }> {
  const cv = cardCanvas(side, inp),
    dpi = +inp.d.exp.dpi;
  const blob = await new Promise<Blob>((res, rej) =>
    cv.toBlob((b) => (b ? res(b) : rej(new Error('The image couldn’t be created.'))), 'image/png'),
  );
  const buf = new Uint8Array(await blob.arrayBuffer()),
    name = `${baseName(inp.d)}-${side}.png`;
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
