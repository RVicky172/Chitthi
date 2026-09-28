/*
 * Development only (never in production builds): the checks behind `npm test`. Opened by scripts/test.cjs at
 * http://localhost:<port>/?selftest, which calls window.__chitthiSelfTest() and fails the run on any failure.
 * They run in a real browser engine (Electron), because rendering and export need canvas, fonts and Blob.
 */
import { hasFestivals, marksFor } from '../data/holidays';
import { layoutsFor } from '../data/layouts';
import { PRODUCTS, sizesFor } from '../data/products';
import { cardMM, mergeDesign, postmarkYear, productDesign } from '../engine/design';
import { renderEnvelope, renderEnvelopeTemplate } from '../engine/envelope';
import { buildPack, buildPDF, nup } from '../engine/export';
import { computeLayout } from '../engine/layout';
import { softProof } from '../engine/proof';
import { renderCard } from '../engine/render';
import { samplePhoto } from '../engine/sample';
import { creditOf, creditsText, pexelsIdOf, pexelsName, shortName } from '../lib/credits';
import type { Design, ProductId } from '../types';

interface Result {
  passed: number;
  failed: string[];
  notes: string[];
}

async function run(): Promise<Result> {
  const r: Result = { passed: 0, failed: [], notes: [] };
  const check = (ok: unknown, what: string) => (ok ? r.passed++ : r.failed.push(what));
  const photos = [0, 1, 2, 3].map((i) => samplePhoto(i, 300, 200));
  const products = PRODUCTS.map((p) => p.id);

  /* Every product × size × orientation × layout renders front, back and envelope, and stays inside the card. */
  let renders = 0;
  for (const product of products) {
    for (const s of sizesFor(product)) {
      for (const orient of ['landscape', 'portrait'] as const) {
        for (const [layout] of layoutsFor(product)) {
          if (s.instax && layout !== 'instax') continue;
          const base = productDesign(product);
          const variants: Partial<Design>[] =
            product === 'calendar'
              ? [
                  {},
                  { cal: { ...base.cal, text: 'caption', captions: ['A long festival caption for this month', ...Array(11).fill('')], marks: 'all', ownDates: [{ m: 1, d: 5, label: 'A birthday' }] } },
                  { cal: { ...base.cal, text: 'photo', grid: 'boxes', numSync: true, titleScale: 1.6, numScale: 1.6 }, showQuote: true },
                ]
              : [{}, { back: { ...base.back, credit: true, message: 'Hello', to: 'Someone', address: 'Street\nCity', pin: '110001' } }];
          for (const v of variants) {
            const d: Design = { ...base, sizeId: s.id, orient, layout, insta: 'someone', ...v };
            const where = `${product} ${s.id} ${orient} ${layout}`;
            try {
              const { w, h } = cardMM(d),
                L = computeLayout(layout, { x: 0, y: 0, w, h, e: 0 }, d),
                tol = 0.6,
                inside = (q: { x: number; y: number; w: number; h: number }) => q.x >= -tol && q.y >= -tol && q.x + q.w <= w + tol && q.y + q.h <= h + tol;
              check(!L.text || inside(L.text), `${where}: text zone outside the card`);
              check(!L.calGrid || inside(L.calGrid), `${where}: date grid outside the card`);
              check(L.slots.every((sl) => sl.bleed || sl.rot || inside(sl)), `${where}: photo slot outside the card`);
              const cv = document.createElement('canvas');
              renderCard(cv, 'front', 0.8, 1, { d, photos: photos.map((p) => ({ ...p, name: pexelsName('Test', 'Someone', 1) })) }, { page: 2 });
              renderCard(cv, 'back', 0.8, 1, { d, photos });
              renderEnvelope(cv, 'front', 0.5, { d, photos });
              renderEnvelope(cv, 'back', 0.5, { d, photos });
              renderEnvelopeTemplate(cv, 0.3, { d, photos });
              renders++;
            } catch (e) {
              r.failed.push(`${where}: ${e instanceof Error ? e.message : e}`);
            }
          }
        }
      }
    }
  }
  r.notes.push(`${renders} designs rendered (front, back, envelope, template)`);

  /* A full print pack for each product, and a sheet PDF on the smallest sheet it fits. */
  for (const product of products as ProductId[]) {
    const base = productDesign(product);
    const d: Design = { ...base, exp: { ...base.exp, dpi: '72' }, env: { ...base.env, on: true } };
    try {
      const pack = await buildPack({ d, photos });
      check(pack.blob.size > 5000, `${product}: print pack is too small (${pack.blob.size} bytes)`);
      const noPng = await buildPack({ d: { ...d, exp: { ...d.exp, pngs: false } }, photos });
      check(noPng.blob.size < pack.blob.size, `${product}: a pack without PNGs should be smaller`);
      const sheet = (['a4', 'a3', '1319'] as const).find((id) => {
        const n = nup({ ...d, exp: { ...d.exp, sheet: id } });
        return n.cols * n.rows > 0;
      });
      check(sheet, `${product}: fits no sheet`);
      if (sheet) check((await buildPDF({ d: { ...d, exp: { ...d.exp, sheet } }, photos }, 'sheet')).blob.size > 1000, `${product}: sheet PDF empty`);
    } catch (e) {
      r.failed.push(`${product}: print pack failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  /* Saved designs of any age load safely. */
  for (const saved of [null, {}, { product: 'nope', sizeId: 'x', layout: 'zzz' }, { cal: { year: 1999 } }, { headFont: 'Missing', back: { font: 'Gone', labelFont: 'Gone' } }]) {
    try {
      const m = mergeDesign(saved);
      check(m.product && m.sizeId && m.layout && m.headFont !== 'Missing' && m.back.labelFont === '', `mergeDesign(${JSON.stringify(saved)}) gave a broken design`);
    } catch (e) {
      r.failed.push(`mergeDesign(${JSON.stringify(saved)}) threw: ${e}`);
    }
  }
  check(mergeDesign({ cal: { year: 2027 } }).cal.marks === 'off', 'calendars saved before marked days should keep them off');
  check(mergeDesign(null).cal.marks === 'all', 'new calendars should mark festivals');

  /* Festival data: real dates, and the ones people look for. */
  for (const year of [2026, 2027]) {
    check(hasFestivals(year), `${year}: festival dates missing`);
    for (let m = 0; m < 12; m++)
      for (const [day, list] of marksFor(year, m, 'all'))
        check(new Date(year, m, day).getMonth() === m, `${year}-${m + 1}-${day} (${list[0].name}) is not a real date`);
  }
  check(marksFor(2026, 10, 'all').get(8)?.some((x) => x.name === 'Diwali'), 'Diwali 2026 should be on 8 November');
  check(marksFor(2027, 9, 'all').get(29)?.some((x) => x.name === 'Diwali'), 'Diwali 2027 should be on 29 October');
  check(marksFor(2031, 0, 'national').get(26)?.[0].name === 'Republic Day', 'fixed national days should show in any year');
  check(marksFor(2026, 0, 'off', [{ m: 1, d: 9, label: 'Birthday' }]).get(9)?.[0].kind === 'own', 'own dates should show with marks off');

  /* Pexels credits survive the name round trip, link to the photo, and are listed in exports. */
  const n = pexelsName('Diyas at night', 'Sayantan (Das)', 10182772);
  const c = creditOf(n);
  check(c?.photographer === 'Sayantan Das' && c.url === 'https://www.pexels.com/photo/10182772/', `credit round trip failed: ${n}`);
  check(shortName(n) === 'Diyas at night', 'shortName should drop the credit');
  check(creditOf('Old photo (Pexels / Someone)')?.url === null, 'older credits without an id should still parse');
  check(pexelsIdOf('https://www.pexels.com/photo/burning-candles-10182772/') === 10182772, 'id from a Pexels URL');
  check(creditsText(['my upload.jpg']) === null, 'no credits file without Pexels photos');
  check(creditsText([n, n])?.split('Photo by').length === 2, 'credits should list each photo once');

  /* Postmark year follows the calendar, or the design's own choice. */
  const cal = productDesign('calendar');
  check(postmarkYear({ ...cal, cal: { ...cal.cal, year: 2031 } }) === 2031, 'postmark should follow the calendar year');
  check(postmarkYear({ ...productDesign('postcard'), postYear: 1999 }) === 1999, 'postmark should use the chosen year');

  /* Print-colours preview: white becomes paper, strong blue loses more saturation than soft skin tones. */
  const pc = document.createElement('canvas');
  pc.width = 3;
  pc.height = 1;
  const x = pc.getContext('2d')!;
  const px = (i: number, col: string) => ((x.fillStyle = col), x.fillRect(i, 0, 1, 1));
  px(0, '#ffffff');
  px(1, '#0033ff');
  px(2, '#e0b090');
  softProof(pc);
  const [w0, , , , b0, b1, b2, , s0, s1, s2] = x.getImageData(0, 0, 3, 1).data;
  const sat = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b);
  check(w0 < 250, 'print colours: white should become paper white');
  check(sat(b0, b1, b2) < 0.8 * 255, 'print colours: vivid blue should be duller');
  check(sat(s0, s1, s2) > 0.85 * (0xe0 - 0x90), 'print colours: soft tones should stay close');

  /* Order sheet for several designs. */
  const { orderSheetCSV } = await import('../engine/quote');
  const csv = orderSheetCSV([
    { label: 'Card A', d: { ...productDesign('postcard'), env: { ...productDesign('postcard').env, on: true } } },
    { label: 'Calendar B', d: productDesign('calendar') },
  ]);
  check(csv.split('\r\n').filter(Boolean).length === 4, 'order sheet: header, 2 designs, 1 envelope');
  check(csv.includes('Price per piece @ 100'), 'order sheet: price columns');

  return r;
}

declare global {
  interface Window {
    __chitthiSelfTest?: typeof run;
  }
}
window.__chitthiSelfTest = run;
