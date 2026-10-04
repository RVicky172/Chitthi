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

  await aiChecks(check);
  await agentChecks(check, r);
  await photoAgentChecks(check, r);
  await aiMaskChecks(check, r);
  await perfChecks(check);
  await gpuChecks(check, r);
  return r;
}

/* ---------- GPU device layer (P0.2): every backend this machine offers ---------- */

async function gpuChecks(check: (ok: unknown, what: string) => void, r: Result): Promise<void> {
  const { openWebGPU } = await import('../engine/gpu/webgpu');
  const { openWebGL2 } = await import('../engine/gpu/webgl2');
  const { COPY_PROGRAM } = await import('../engine/gpu/types');
  // A 4×3 pattern: every pixel different, the top-left one red, and one half-transparent pixel.
  const W = 4,
    H = 3,
    src = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) src.set([(i * 37) % 256, (i * 91 + 40) % 256, (i * 53 + 200) % 256, i === 5 ? 128 : 255], i * 4);
  src.set([255, 0, 0, 255], 0);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  cv.getContext('2d')!.putImageData(new ImageData(src, W, H), 0, 0);
  const pattern = await createImageBitmap(new ImageData(src, W, H), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const near = (a: ArrayLike<number>, b: ArrayLike<number>, tol: number, opaqueOnly = false) => {
    for (let i = 0; i < a.length; i++) {
      if (opaqueOnly && (b[i - (i % 4) + 3] ?? 255) < 255) continue;
      if (Math.abs(a[i] - b[i]) > tol) return false;
    }
    return a.length === b.length;
  };
  const SCALE = {
    id: 'selftest-scale',
    inputs: 1,
    uniforms: 1,
    glsl: 'vec4 effect(vec2 uv) { vec4 c = texture(t0, uv); return vec4(c.rgb * u[0].x, c.a); }',
    wgsl: 'fn effect(uv: vec2f) -> vec4f { let c = textureSampleLevel(t0, smp, uv, 0.0); return vec4f(c.rgb * P.u[0].x, c.a); }',
  };

  const ran: ('webgpu' | 'webgl2')[] = [];
  const worst = new Map<string, string>();
  for (const [name, open] of [
    ['webgpu', openWebGPU],
    ['webgl2', async () => openWebGL2()],
  ] as const) {
    const dev = await open().catch(() => null);
    if (!dev) continue;
    ran.push(name);
    try {
      check(dev.backend === name && dev.maxSize >= 4096, `gpu ${name}: opens with textures of at least 4096 px`);
      const t = dev.upload(pattern, W, H);
      check(near(await dev.read(t), src, 0), `gpu ${name}: upload and read back unchanged, top row first`);
      const out = dev.target(W, H);
      dev.pass(COPY_PROGRAM, [t], new Float32Array(4), out);
      check(near(await dev.read(out), src, 1), `gpu ${name}: a copy pass through a float target keeps every pixel`);
      dev.pass(SCALE, [t], new Float32Array([0.5, 0, 0, 0]), out);
      const half = await dev.read(out);
      check(Math.abs(half[0] - 128) <= 1 && half[1] === 0 && half[3] === 255, `gpu ${name}: uniforms reach the program`);
      const shown = document.createElement('canvas');
      shown.width = W;
      shown.height = H;
      const sx = shown.getContext('2d', { willReadFrequently: true })!;
      dev.pass(COPY_PROGRAM, [t], new Float32Array(4), out);
      sx.drawImage(dev.present(out), 0, 0);
      check(near(sx.getImageData(0, 0, W, H).data, src, 1, true), `gpu ${name}: present draws the right way up onto a 2D canvas`);
      check(near(await dev.read(dev.upload(cv, W, H)), src, 1, true), `gpu ${name}: uploads a 2D canvas`);
      let threw = false;
      try {
        dev.target(dev.maxSize + 1, 1);
      } catch {
        threw = true;
      }
      check(threw, `gpu ${name}: refuses textures larger than the device allows`);
      dev.release(t);
      dev.release(out);
      worst.set(name, await colourParity(dev, check, name));
      check(!dev.lost, `gpu ${name}: still open after the checks`);
    } catch (e) {
      r.failed.push(`gpu ${name} threw: ${e instanceof Error ? e.message : e}`);
    } finally {
      dev.destroy();
    }
  }
  await knownMask(check);
  await layerLooks(check);
  {
    // P1.11: the export types this engine writes (JPEG and PNG always; WebP and AVIF where it can).
    const { encodableTypes } = await import('../engine/photoExport');
    const types = await encodableTypes();
    check(types.includes('jpeg') && types.includes('png'), 'export: JPEG and PNG can always be written');
    r.notes.push(`Photo export types this engine writes: ${types.join(', ')}`);
  }
  for (const name of ran) {
    const mk = await maskParity(name);
    check(mk.max <= 2, `gpu ${name}: masked colour edits match Canvas 2D within 2 levels (worst ${mk.max} in ${mk.where})`);
    check(mk.detailMax <= 3, `gpu ${name}: masked detail effects match Canvas 2D within 3 levels (worst ${mk.detailMax})`);
    r.notes.push(`${name} masks: worst ${mk.max} (with detail ${mk.detailMax}), mean ${mk.mean.toFixed(3)} over ${mk.frames} frames; ${mk.timing}`);
    const g = await goldenParity(name);
    check(g.max <= 2 && g.mean <= 0.5, `gpu ${name}: real photos through renderIg match Canvas 2D (worst ${g.max} in ${g.where}, mean ${g.mean.toFixed(3)})`);
    check(g.detailMax <= 3, `gpu ${name}: detail effects match Canvas 2D within 3 levels (worst ${g.detailMax} in ${g.detailWhere})`);
    worst.set(name, `${worst.get(name)}; photos: worst ${g.max} (detail effects ${g.detailMax}), mean ${g.mean.toFixed(3)} over ${g.frames} frames`);
    r.notes.push(await gpuTiming(name));
  }
  const { openGpu, gpu, closeGpu } = await import('../engine/gpu/device');
  const d = await openGpu();
  check(ran.length === 0 ? d === null : d?.backend === ran[0], 'gpu: openGpu() picks WebGPU first, then WebGL2');
  check(gpu() === d && (await openGpu()) === d, 'gpu: the device is opened once and reused');
  closeGpu();
  check(gpu() === null, 'gpu: closeGpu() lets it go');
  r.notes.push(`GPU backends checked: ${ran.map((n) => `${n} (largest colour difference ${worst.get(n)})`).join(', ') || 'none available'}`);
}

/**
 * P1.6: a known mask, drawn where it should be. A hard brush stroke across the middle of the photo, laid on a frame with
 * the photo placed, turned a quarter and mirrored: full inside the stroke, empty away from it and outside the photo.
 */
/**
 * P1.10: layers' blend modes, masks and images, by known pixels (layers draw with Canvas 2D on every path). A grey box
 * over an orange frame, multiplied and screened, must give the formulas' colours; a white box faded by a linear mask
 * over black must go from white at the top to black at the bottom, turned with the layer; an image layer must show
 * its picture where it is placed.
 */
async function layerLooks(check: (ok: unknown, what: string) => void): Promise<void> {
  const L = await import('../engine/layers');
  const { newPart } = await import('../engine/masks');
  const N = 200;
  const frame = (bg: string, layers: import('../engine/layers').Layer[]) => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.fillStyle = bg;
    x.fillRect(0, 0, N, N);
    L.drawLayers(x, layers, N, N);
    return (px: number, py: number) => [...x.getImageData(px, py, 1, 1).data.slice(0, 3)];
  };
  const box = { ...L.newShape('rect'), x: 0.5, y: 0.5, w: 2, h: 2, fill: '#808080', stroke: '', text: '' };
  const near = (a: number[], b: number[], tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const mul = frame('rgb(200,100,50)', [{ ...box, blend: 'multiply' }])(100, 100);
  check(near(mul, [100, 50, 25]), `layers: multiply gives the product (${mul})`);
  const scr = frame('rgb(200,100,50)', [{ ...box, blend: 'screen' }])(100, 100);
  check(near(scr, [228, 178, 153]), `layers: screen gives 1 − (1 − a)(1 − b) (${scr})`);
  // A white box faded downwards over black: full at the top, nothing at the bottom, half way in the middle.
  const fade = { invert: false, parts: [{ ...newPart('linear'), x: 0.5, y: 0.5, angle: 90, width: 1 }] } as import('../engine/layers').LayerMask;
  const white = { ...box, w: 1, h: 1, fill: '#ffffff', mask: fade };
  const f = frame('#000000', [white]);
  check(f(100, 2)[0] > 250 && f(100, 197)[0] < 5 && Math.abs(f(100, 100)[0] - 128) < 12, `layers: a fade mask goes from full to none (${f(100, 2)[0]}, ${f(100, 100)[0]}, ${f(100, 197)[0]})`);
  // Turned a quarter, the fade runs right to left across the frame.
  const t = frame('#000000', [{ ...white, rot: 90 }]);
  check(t(197, 100)[0] > 250 && t(2, 100)[0] < 5, 'layers: a layer mask turns with its layer');
  check(frame('#000000', [{ ...white, mask: { ...fade, invert: true } }])(100, 2)[0] < 5, 'layers: an inverted mask shows the other way');
  // An image layer: a red picture in the middle, a quarter of the frame wide.
  const pic = document.createElement('canvas');
  pic.width = pic.height = 16;
  const px = pic.getContext('2d')!;
  px.fillStyle = '#ff0000';
  px.fillRect(0, 0, 16, 16);
  const img = { ...L.newImageLayer(L.addLayerImage(pic), 16, 16, 'red'), w: 0.25, h: 0.25 };
  const im = frame('#000000', [img]);
  check(near(im(100, 100), [255, 0, 0]) && near(im(20, 20), [0, 0, 0]), 'layers: an image layer shows its picture where it is placed');
}

async function knownMask(check: (ok: unknown, what: string) => void): Promise<void> {
  const { newMask, newBrushPart, frameMask } = await import('../engine/masks');
  const { DEFAULT_EDIT, photoPlace } = await import('../engine/instagram');
  const mask = { ...newMask('Known'), parts: [{ ...newBrushPart(), strokes: [{ pts: [0, 0.5, 1, 0.5], size: 0.1, feather: 0, flow: 100, erase: false }] }] };
  const alpha = (f: import('../engine/masks').FrameMask, x: number, y: number) => f.data[y * f.width + x];
  // A 400 × 200 photo whole in a 400 × 400 frame: it fills rows 100–300, the stroke runs along row 200, 40 px tall.
  const flat = frameMask(mask, 400, 200, photoPlace(400, 200, { ...DEFAULT_EDIT, fit: 'fit' }, 400, 400), 400, 400)!;
  check(alpha(flat, 200, 200) === 255 && alpha(flat, 50, 210) === 255, 'masks: a brush stroke is full along its line');
  check(alpha(flat, 200, 150) === 0 && alpha(flat, 200, 50) === 0, 'masks: nothing away from the stroke, nor outside the photo');
  // Turned a quarter: the stroke now runs down column 200 of the frame; mirrored as well, it still does.
  for (const flip of [false, true]) {
    const e = { ...DEFAULT_EDIT, fit: 'fit' as const, rot: 90 as const, flip };
    const t = frameMask({ ...mask }, 400, 200, photoPlace(400, 200, e, 400, 400), 400, 400);
    check(alpha(t, 200, 60) === 255 && alpha(t, 150, 200) === 0, `masks: the stroke turns with the photo${flip ? ', mirrored' : ''}`);
  }
}

/**
 * P1.6: masks on real photos, Canvas 2D against a GPU backend: brush masks with colour and with detail settings, an
 * inverted one, parts combined, two masks on top of a look. Plus the time a 1080 × 1350 frame with two masks takes,
 * the phase gate's 30 frames a second being 33 ms.
 */
async function maskParity(
  backend: 'webgpu' | 'webgl2',
): Promise<{ max: number; detailMax: number; mean: number; where: string; frames: number; timing: string }> {
  const { DEFAULT_EDIT, renderIg } = await import('../engine/instagram');
  const { DEFAULT_ADJUST } = await import('../engine/adjust');
  const { detailNeutral } = await import('../engine/detail');
  const { newMask, newBrushPart, newPart } = await import('../engine/masks');
  type Mask = import('../engine/masks').Mask;
  type Part = import('../engine/masks').MaskPart;
  type Stroke = import('../engine/masks').BrushStroke;
  const { closeGpu, openGpu } = await import('../engine/gpu/device');
  const photos = await Promise.all(
    ['diwali.jpg', 'marigold.jpg', 'himalaya.jpg'].map(async (f) => {
      const img = new Image();
      img.src = `/samples/${f}`;
      await img.decode();
      return { f, img };
    }),
  );
  const st = (pts: number[], o: Partial<Stroke> = {}): Stroke => ({ pts, size: 0.25, feather: 60, flow: 100, erase: false, ...o });
  const brush = (strokes: Stroke[], o: Partial<import('../engine/masks').BrushPart> = {}) => ({ ...newBrushPart(), strokes, ...o });
  const mk = (adjust: object, parts: Part[], o: Partial<Mask> = {}): Mask => ({ ...newMask('T'), parts, adjust: { ...DEFAULT_ADJUST, ...adjust }, ...o });
  const sky = brush([st([0, 0.2, 0.5, 0.25, 1, 0.15], { size: 0.4 })]),
    centre = brush([st([0.5, 0.5], { size: 0.5, feather: 100, flow: 70 }), st([0.5, 0.5, 0.6, 0.6], { erase: true, flow: 50, size: 0.1 })]);
  const cases: { look?: 'warm' | 'bw'; masks: Mask[]; rot?: 0 | 90; flip?: boolean }[] = [
    { masks: [mk({ exposure: 1, temperature: -40 }, [sky])] },
    { masks: [mk({ shadows: 60, saturation: 40, contrast: 20 }, [centre], { invert: true })], rot: 90, flip: true },
    { look: 'bw', masks: [mk({ exposure: 0.5, highlights: -50 }, [sky, { ...centre, combine: 'subtract' }])] },
    { masks: [mk({ clarity: 50, dehaze: 30 }, [sky, { ...centre, combine: 'intersect' }])] },
    { look: 'warm', masks: [mk({ exposure: -1 }, [sky]), mk({ sharpen: 60, noise: 30, tint: 30 }, [centre])] },
    // Gradients and ranges (P1.7): a sky gradient, a radial spotlight turned with the photo, the darker tones under a
    // gradient, the photo's oranges.
    { masks: [mk({ exposure: -0.8, highlights: -40 }, [{ ...newPart('linear'), angle: 80, width: 0.5 } as Part])] },
    { masks: [mk({ exposure: 0.6, saturation: 20 }, [{ ...newPart('radial'), x: 0.4, rx: 0.35, ry: 0.2, angle: 30 } as Part], { invert: true })], rot: 90, flip: true },
    { masks: [mk({ shadows: 50 }, [newPart('linear') as Part, { ...newPart('luma', false), lo: 0, hi: 40 } as Part])] },
    { masks: [mk({ saturation: 40, temperature: 20 }, [{ ...newPart('colour'), r: 220, g: 120, b: 40, range: 40 } as Part])] },
  ];
  const W = 540,
    H = 675;
  const frame = (img: HTMLImageElement, e: typeof DEFAULT_EDIT) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    renderIg(x, img, img.naturalWidth, img.naturalHeight, e, W, H);
    return x.getImageData(0, 0, W, H).data;
  };
  let max = 0,
    detailMax = 0,
    sum = 0,
    count = 0,
    frames = 0,
    where = '';
  for (const { f, img } of photos)
    for (const [i, c] of cases.entries()) {
      const e = { ...DEFAULT_EDIT, rot: c.rot ?? 0, flip: !!c.flip, adjust: { ...DEFAULT_ADJUST, look: c.look ?? ('none' as const) }, masks: c.masks };
      const detail = c.masks.some((m) => !detailNeutral(m.adjust));
      closeGpu();
      const cpu = frame(img, e);
      await openGpu(backend);
      const got = frame(img, e);
      frames++;
      for (let k = 0; k < got.length; k++) {
        const d = Math.abs(got[k] - cpu[k]);
        sum += d;
        count++;
        if (detail) detailMax = Math.max(detailMax, d);
        else if (d > max) {
          max = d;
          where = `${f} case ${i}`;
        }
      }
    }
  // Timing: two masks (colour; clarity with sharpening) on a 1080 × 1350 frame, after the first (cached) draw.
  const img = photos[1].img,
    e = { ...DEFAULT_EDIT, adjust: { ...DEFAULT_ADJUST, look: 'warm' as const }, masks: [mk({ exposure: 0.8, shadows: 40 }, [sky]), mk({ clarity: 40, sharpen: 40 }, [centre], { invert: true })] };
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const time = (reps: number) => {
    renderIg(x, img, img.naturalWidth, img.naturalHeight, e, 1080, 1350);
    x.getImageData(0, 0, 1, 1);
    const t0 = performance.now();
    for (let k = 0; k < reps; k++) renderIg(x, img, img.naturalWidth, img.naturalHeight, e, 1080, 1350);
    x.getImageData(0, 0, 1, 1);
    return (performance.now() - t0) / reps;
  };
  await openGpu(backend);
  const gpuMs = time(15);
  // While painting, every frame has a new mask: the stroke being drawn grows by a point (as pointer moves arrive), the
  // rest is cached. 30 moves across the photo with a large brush.
  let pts = [0.1, 0.9];
  const t0 = performance.now();
  for (let k = 1; k <= 30; k++) {
    pts = [...pts, 0.1 + k * 0.025, 0.9 - k * 0.01];
    const part = { ...sky, strokes: [...sky.strokes, st(pts)] };
    renderIg(x, img, img.naturalWidth, img.naturalHeight, { ...e, masks: [{ ...e.masks[0], parts: [part] }, e.masks[1]] }, 1080, 1350);
  }
  x.getImageData(0, 0, 1, 1);
  const paintMs = (performance.now() - t0) / 30;
  // Dragging a gradient: a new radial part each frame, rasterised whole.
  const t1 = performance.now();
  for (let k = 1; k <= 20; k++) {
    const part = { ...newPart('radial'), x: 0.3 + k * 0.02, rx: 0.35, ry: 0.25, angle: 20 } as Part;
    renderIg(x, img, img.naturalWidth, img.naturalHeight, { ...e, masks: [{ ...e.masks[0], parts: [part] }, e.masks[1]] }, 1080, 1350);
  }
  x.getImageData(0, 0, 1, 1);
  const dragMs = (performance.now() - t1) / 20;
  closeGpu();
  const cpuMs = time(2);
  return {
    max,
    detailMax,
    mean: sum / count,
    where,
    frames,
    timing: `1080×1350 frame with two masks: ${backend} ${gpuMs.toFixed(1)} ms (${paintMs.toFixed(1)} ms while painting, ${dragMs.toFixed(1)} ms dragging a gradient), Canvas 2D ${cpuMs.toFixed(0)} ms`,
  };
}

/**
 * P1.4: a creative LUT for the parity checks, made the way users bring them, as .cube text: a teal-and-orange split
 * with an S-curve, strongly non-linear so the interpolation is exercised. Loaded for the renderers; returns its id.
 */
async function testLut(size: number): Promise<string> {
  const { addLut, parseCube } = await import('../engine/lut');
  const lines = [`TITLE "Self-test ${size}"`, `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const c = [r, g, b].map((v) => v / (size - 1)),
          l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2],
          s = (v: number) => v * v * (3 - 2 * v);
        lines.push([s(c[0]) * 0.9 + l * 0.15, c[1] * 0.85 + 0.05, c[2] * 0.7 + (1 - l) * 0.25].map((v) => v.toFixed(6)).join(' '));
      }
  const lut = parseCube(lines.join('\n'));
  addLut(lut);
  return lut.id;
}

/**
 * P0.6: golden images. Real sample photos drawn by the whole renderIg() (placement, background, rotation, colour,
 * vignette) at Instagram size, once on the Canvas 2D path and once on the GPU backend, must match: at most 2 levels
 * apart in any channel and 0.5 on average. This is the gate for turning the GPU path on by default.
 */
async function goldenParity(
  backend: 'webgpu' | 'webgl2',
): Promise<{ max: number; mean: number; where: string; frames: number; detailMax: number; detailWhere: string }> {
  const { DEFAULT_EDIT, renderIg } = await import('../engine/instagram');
  const { LOOK_IDS } = await import('../engine/adjust');
  const { detailNeutral } = await import('../engine/detail');
  const { FLAT_CURVE } = await import('../engine/curve');
  const { FLAT_MIXER } = await import('../engine/hsl');
  const { closeGpu, openGpu } = await import('../engine/gpu/device');
  const lut = await testLut(33);
  const photos = await Promise.all(
    ['diwali.jpg', 'holi-bowls.jpg', 'marigold.jpg', 'himalaya.jpg'].map(async (f) => {
      const img = new Image();
      img.src = `/samples/${f}`;
      await img.decode();
      return { f, img };
    }),
  );
  const W = 540,
    H = 675;
  const edits: Partial<import('../engine/adjust').Adjustments>[] = [
    {},
    { brightness: 35, contrast: 20 },
    { saturation: -60, warmth: 40, vignette: 50 },
    { contrast: 100, brightness: -40 },
    { exposure: 0.7, highlights: -60, shadows: 50, temperature: -40, tint: 20 },
    {
      curve: { ...FLAT_CURVE, rgb: [[0, 0], [0.3, 0.22], [0.7, 0.8], [1, 1]], r: [[0, 0], [0.5, 0.55], [1, 1]] },
      mixer: { ...FLAT_MIXER, hue: [0, 30, 0, -40, 0, 20, 0, 0], sat: [20, 40, -30, 0, 0, -50, 0, 0], lum: [0, 20, 0, -30, 0, 0, 0, 0] },
      shadows: 30,
    },
    // Detail and effects (P1.3).
    { sharpen: 60, noise: 40, contrast: 10 },
    { clarity: 50, dehaze: 40, grain: 50, exposure: 0.3 },
    { dehaze: -50, clarity: -40, sharpen: 30, sharpenMask: 50, sharpenRadius: 2 },
    // LUTs (P1.4).
    { lut },
    { lut, lutAmount: 60, exposure: 0.3, saturation: 15 },
  ];
  const frame = (img: HTMLImageElement, e: typeof DEFAULT_EDIT) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    renderIg(x, img, img.naturalWidth, img.naturalHeight, e, W, H);
    return x.getImageData(0, 0, W, H).data;
  };
  let detailMax = 0,
    detailWhere = '',
    max = 0,
    sum = 0,
    count = 0,
    frames = 0,
    where = '';
  for (const { f, img } of photos)
    for (const look of LOOK_IDS)
      for (const [i, adj] of edits.entries()) {
        // Vary the framing too: whole photo on a blurred background, turned, mirrored.
        const e = { ...DEFAULT_EDIT, fit: i % 2 ? ('fit' as const) : ('fill' as const), bg: 'blur', rot: (i === 3 ? 90 : 0) as 0 | 90, flip: i === 2, adjust: { ...DEFAULT_EDIT.adjust, look, ...adj } };
        closeGpu();
        const cpu = frame(img, e);
        await openGpu(backend);
        const got = frame(img, e);
        frames++;
        for (let k = 0; k < got.length; k++) {
          const d = Math.abs(got[k] - cpu[k]);
          sum += d;
          count++;
          // Detail effects (P1.3) chain neighbourhood passes through 16-bit float textures on the GPU (32-bit would
          // double memory at 4K): they are held to 3 levels, colour-only edits to 2.
          if (detailNeutral(e.adjust) ? false : d > detailMax) {
            detailMax = d;
            detailWhere = `${f} ${look} ${JSON.stringify(adj)}`;
          }
          if (detailNeutral(e.adjust) && d > max) {
            max = d;
            const px = k >> 2;
            where = `${f} ${look} ${JSON.stringify(adj)} fit=${e.fit} rot=${e.rot} at ${px % W},${Math.floor(px / W)} cpu ${[...cpu.slice(k - (k % 4), k - (k % 4) + 4)]} gpu ${[...got.slice(k - (k % 4), k - (k % 4) + 4)]}`;
          }
        }
      }
  closeGpu();
  return { max, mean: sum / count, where, frames, detailMax, detailWhere };
}

/** Time per Instagram-size frame with a look and sliders, Canvas 2D against a GPU backend. A note, not a check. */
async function gpuTiming(backend: 'webgpu' | 'webgl2'): Promise<string> {
  const { DEFAULT_EDIT, renderIg } = await import('../engine/instagram');
  const { closeGpu, openGpu } = await import('../engine/gpu/device');
  const img = new Image();
  img.src = '/samples/marigold.jpg';
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1350;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const e = { ...DEFAULT_EDIT, adjust: { ...DEFAULT_EDIT.adjust, look: 'tinted' as const, brightness: 20, contrast: 15, warmth: 10 } };
  const time = (reps = 15) => {
    renderIg(x, img, img.naturalWidth, img.naturalHeight, e, 1080, 1350);
    x.getImageData(0, 0, 1, 1);
    const t0 = performance.now();
    for (let i = 0; i < reps; i++) renderIg(x, img, img.naturalWidth, img.naturalHeight, e, 1080, 1350);
    x.getImageData(0, 0, 1, 1); // wait for the drawing to finish
    return (performance.now() - t0) / reps;
  };
  closeGpu();
  const cpu = time();
  await openGpu(backend);
  const gpu = time();
  // The same frame with detail effects (P1.3): clarity, sharpening and noise reduction.
  Object.assign(e.adjust, { clarity: 40, sharpen: 50, noise: 30 });
  const gpuDetail = time();
  closeGpu();
  const cpuDetail = time(3);
  return `1080×1350 frame: Canvas 2D ${cpu.toFixed(1)} ms, ${backend} ${gpu.toFixed(1)} ms; with clarity, sharpening and noise reduction: Canvas 2D ${cpuDetail.toFixed(0)} ms, ${backend} ${gpuDetail.toFixed(1)} ms`;
}

/**
 * P0.4: the GPU colour programs give the same pixels as the Canvas 2D path (adjustPixels), for every look and a spread
 * of slider settings, within 2 levels per channel. Returns the largest difference seen.
 */
async function colourParity(dev: import('../engine/gpu/types').GpuDevice, check: (ok: unknown, what: string) => void, name: string): Promise<string> {
  const { adjustPixels } = await import('../engine/instagram');
  const { DEFAULT_ADJUST, LOOK_IDS } = await import('../engine/adjust');
  const { FLAT_CURVE } = await import('../engine/curve');
  const { FLAT_MIXER } = await import('../engine/hsl');
  const { colourNodes } = await import('../engine/gpu/colour');
  const { runNodes, TexturePool } = await import('../engine/gpu/graph');
  // 64×64: hue across, brightness down, with a band of greys and a few half-transparent pixels.
  const N = 64,
    src = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4,
        h = (x / N) * 6,
        v = 255 * (1 - y / N),
        f = h - Math.floor(h),
        rgb = [
          [1, f, 0],
          [1 - f, 1, 0],
          [0, 1, f],
          [0, 1 - f, 1],
          [f, 0, 1],
          [1, 0, 1 - f],
        ][Math.floor(h) % 6];
      const grey = x < 4;
      src.set([grey ? v : rgb[0] * v, grey ? v : rgb[1] * v, grey ? v : rgb[2] * v, x === 10 && y % 8 === 0 ? 128 : 255], i);
    }
  const bmp = await createImageBitmap(new ImageData(src, N, N), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const input = dev.upload(bmp, N, N),
    pool = new TexturePool(dev);
  const { identityLut, addLut } = await import('../engine/lut');
  const identity = identityLut(17);
  addLut(identity);
  const [lut17, lut65] = [await testLut(17), await testLut(65)];
  const sliders: Partial<import('../engine/adjust').Adjustments>[] = [
    {},
    { brightness: 40 },
    { contrast: -60 },
    { saturation: 80, warmth: -50 },
    { brightness: -100, contrast: 100 },
    { saturation: -100, warmth: 100 },
    // Light and white balance (P1.1).
    { exposure: 1.2 },
    { exposure: -1.5, highlights: -80, shadows: 70 },
    { temperature: 80, tint: -50, whites: 60, blacks: -60 },
    { exposure: 0.5, shadows: 100, contrast: 30 },
    // Tone curve and colour mixer (P1.2).
    { curve: { ...FLAT_CURVE, rgb: [[0, 0], [0.25, 0.15], [0.75, 0.85], [1, 1]] } },
    { curve: { ...FLAT_CURVE, b: [[0, 0.1], [0.5, 0.4], [1, 0.95]] }, exposure: -0.5 },
    { mixer: { ...FLAT_MIXER, hue: [40, -60, 0, 80, 0, -100, 0, 50], sat: [-100, 60, 0, 0, 100, -40, 0, 0], lum: [0, 0, 80, -80, 0, 50, -50, 0] } },
    { curve: { ...FLAT_CURVE, rgb: [[0, 0.05], [0.5, 0.6], [1, 0.9]] }, mixer: { ...FLAT_MIXER, sat: [80, 80, 80, -80, -80, -80, 0, 0] }, temperature: 30, contrast: 20 },
    // LUTs (P1.4): small and largest tables, part strength, after other steps.
    { lut: lut17 },
    { lut: lut65 },
    { lut: lut17, lutAmount: 35 },
    { lut: lut65, exposure: 0.8, mixer: { ...FLAT_MIXER, hue: [30, 0, 0, -40, 0, 0, 0, 0] }, brightness: 10 },
  ];
  let max = 0,
    bad = '',
    sum = 0,
    count = 0;
  for (const look of LOOK_IDS)
    for (const sl of sliders) {
      const a = { ...DEFAULT_ADJUST, look, ...sl };
      const nodes = colourNodes(a);
      if (!nodes.length) continue;
      const cpu = src.slice();
      adjustPixels(cpu, a);
      const out = runNodes(dev, pool, input, nodes);
      const got = await dev.read(out);
      pool.give(out);
      for (let i = 0; i < got.length; i++) {
        if (src[i - (i % 4) + 3] === 0) continue;
        const d = Math.abs(got[i] - cpu[i]);
        sum += d;
        count++;
        if (d > max) {
          max = d;
          bad = `${look} ${JSON.stringify(sl)}`;
        }
      }
    }
  // An identity LUT leaves every pixel as it was, on the GPU too.
  const same = runNodes(dev, pool, input, colourNodes({ ...DEFAULT_ADJUST, lut: identity.id }));
  const kept = await dev.read(same);
  pool.give(same);
  let moved = 0;
  for (let i = 0; i < kept.length; i++) if (src[i - (i % 4) + 3] && Math.abs(kept[i] - src[i]) > moved) moved = Math.abs(kept[i] - src[i]);
  check(moved <= 1, `gpu ${name}: an identity LUT changes nothing (largest change ${moved})`);
  dev.release(input);
  pool.clear();
  check(max <= 2, `gpu ${name}: colour matches the Canvas 2D path within 2 levels (worst ${max}, ${bad})`);
  check(sum / count <= 0.5, `gpu ${name}: colour differs from the Canvas 2D path by at most 0.5 levels on average (${(sum / count).toFixed(3)})`);
  return `${max}, mean ${(sum / count).toFixed(3)}`;
}

/* ---------- performance monitor sampler and the undo history's memory guard ---------- */

async function perfChecks(check: (ok: unknown, what: string) => void): Promise<void> {
  const { watchPerf, perfReport } = await import('../lib/perf');
  const got = await new Promise<import('../lib/perf').PerfSample | undefined>((done) => {
    const stop = watchPerf((s) => {
      if (!s.length) return;
      stop();
      done(s[s.length - 1]);
    });
    setTimeout(() => (stop(), done(undefined)), 4000);
  });
  check(got && got.dom > 0 && got.fps >= 0 && got.busy >= 0 && got.busy <= 100, 'perf: a sample arrives with frame, load and page figures');
  const rep = JSON.parse(perfReport()) as { app: string; summary: { seconds: number } };
  check(rep.app === 'Chitthi' && typeof rep.summary.seconds === 'number', 'perf: the report is JSON with a summary');

  const { commit, historyStats, setPhotos } = await import('../state/store');
  const { updatePhoto } = await import('../engine/photo');
  const a = samplePhoto(0, 800, 600),
    cropped = updatePhoto(a, { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } }),
    recropped = updatePhoto(a, { crop: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } });
  setPhotos([cropped]);
  commit();
  setPhotos([recropped]);
  commit();
  const h = historyStats();
  check(h.steps >= 2 && h.bytes === cropped.sw * cropped.sh * 4, 'undo history: counts the canvases only it still holds');
  setPhotos([]);
  commit();
}

/* ---------- AI: a fake provider drives the real service, prompts, credits and limits (no network) ---------- */

async function aiChecks(check: (ok: unknown, what: string) => void): Promise<void> {
  const { registerTestProvider } = await import('../ai/registry');
  const svc = await import('../ai/service');
  const settings = await import('../ai/settings');
  const { keyAllowed, isResultHost } = await import('../ai/transport');
  const { nearestAspect } = await import('../ai/types');
  const { providerDef } = await import('../data/aiProviders');
  const { aiCreditOf, creditsText: credits } = await import('../lib/credits');

  const saved = localStorage.getItem('chitthi-ai');
  const prompts: string[] = [];
  // The fake stands in for "ollama" (no key needed), so readiness and loading take the normal path.
  registerTestProvider(providerDef('ollama')!, {
    text: {
      generateJSON: async (_ctx, req) => {
        prompts.push(req.prompt);
        if (req.schemaName === 'calendar_captions') return { captions: Array.from({ length: 12 }, (_, i) => `Caption ${i + 1}`) };
        if (req.schemaName === 'card_messages') return { messages: ['Dear Nani,\nWish you were here!'] };
        return { options: [{ greeting: 'Shubh Deepavali', quote: 'May the lamps light every road ahead.', signature: 'With love' }] };
      },
    },
    image: {
      generate: async (_ctx, req) => {
        prompts.push(req.prompt);
        const cv = document.createElement('canvas');
        cv.width = req.aspect === '3:2' ? 60 : 40;
        cv.height = 40;
        return [await new Promise<Blob>((ok) => cv.toBlob((b) => ok(b!), 'image/png'))];
      },
    },
  });
  try {
    settings.setAiSettings({ text: { provider: 'ollama', model: 'fake' }, image: { provider: 'ollama', model: 'fake' }, limits: { text: 50, image: 50 }, usage: { day: '', text: 0, image: 0 } });
    const card = productDesign('postcard');
    check(svc.aiReady('text').ready, 'AI: a keyless provider is ready');
    const words = await svc.writeWords(card, { language: 'hinglish', tone: 'warm' });
    check(words[0]?.greeting === 'Shubh Deepavali', 'AI: words come back from the provider');
    check(/Hinglish/.test(prompts.at(-1) ?? '') && /at most \d+ characters/.test(prompts.at(-1) ?? ''), 'AI: the prompt carries language and a length budget');
    const cal = { ...productDesign('calendar'), cal: { ...productDesign('calendar').cal, year: 2027 } };
    const caps = await svc.writeCaptions(cal, [], { language: 'en', tone: 'warm' });
    check(caps.length === 12 && caps[10].month === 10, 'AI: 12 captions, one per month');
    check(/Diwali/.test(prompts.at(-1) ?? ''), 'AI: caption prompt lists the month festivals');
    check((await svc.writeMessages(card, { language: 'en', tone: 'warm' }))[0].startsWith('Dear'), 'AI: back messages');
    const art = await svc.generateArt(card, 0, { subject: 'diyas at dusk', style: 'watercolour', people: false, n: 1 });
    check(art.blobs.length === 1 && /No people/.test(art.prompt) && /No text/.test(art.prompt), 'AI: picture prompt keeps people and lettering out');
    const name = svc.aiPhotoName('diyas at dusk', art.provider, art.model);
    check(aiCreditOf(name)?.made.includes('fake'), 'AI: pictures carry their provenance');
    check(/AI-generated picture/.test(credits([name]) ?? ''), 'AI: credits file discloses AI pictures');
    settings.setAiSettings({ limits: { text: 0, image: 50 } });
    let blocked = false;
    try {
      await svc.writeWords(card, { language: 'en', tone: 'warm' });
    } catch {
      blocked = true;
    }
    check(blocked, 'AI: the daily limit stops requests');
  } finally {
    if (saved === null) localStorage.removeItem('chitthi-ai');
    else localStorage.setItem('chitthi-ai', saved);
  }

  check(keyAllowed('anthropic', 'https://api.anthropic.com/v1/messages', ''), 'keys: Anthropic key goes to Anthropic');
  check(!keyAllowed('anthropic', 'https://evil.example.com/v1/messages', ''), 'keys: never to another host');
  check(!keyAllowed('openai', 'http://api.openai.com/v1/models', ''), 'keys: never over plain http');
  check(keyAllowed('custom', 'https://llm.example.com/v1/chat/completions', 'https://llm.example.com/v1'), 'keys: custom key goes to its own base URL');
  check(!keyAllowed('custom', 'https://other.example.com/v1/chat', 'https://llm.example.com/v1'), 'keys: custom key never elsewhere');
  check(isResultHost('bfl', 'https://delivery-eu1.bfl.ai/x.png') && !isResultHost('bfl', 'https://bfl.ai.evil.com/x'), 'keys: result hosts matched exactly');
  check(nearestAspect(1.5) === '3:2' && nearestAspect(0.7) === '2:3' && nearestAspect(1) === '1:1', 'AI: slot shapes map to aspects');
}

/* ---------- agent tools: schemas are valid and read-only tools run ---------- */

async function agentChecks(check: (ok: unknown, what: string) => void, r: Result): Promise<void> {
  const { TOOLS } = await import('../agent/tools');
  const { PROMPTS, RESOURCES } = await import('../agent/prompts');
  const names = new Set<string>();
  for (const t of TOOLS) {
    check(/^[a-z][a-z0-9_]{2,40}$/.test(t.name) && !names.has(t.name), `tool ${t.name}: unique snake_case name`);
    names.add(t.name);
    const sc = t.inputSchema as { type?: string; properties?: Record<string, unknown>; required?: string[] };
    check(sc.type === 'object' && sc.properties && (sc.required ?? []).every((k) => k in sc.properties!), `tool ${t.name}: valid input schema`);
    check(t.description.length > 20, `tool ${t.name}: has a description`);
  }
  for (const t of TOOLS.filter((x) => x.readOnly && !['search_pexels', 'list_saved', 'render_photo_preview'].includes(x.name))) {
    try {
      const out = await t.run(t.name === 'list_sizes' ? { product: 'postcard' } : t.name === 'list_festivals' ? { year: 2027 } : {}, {});
      check(out.text, `tool ${t.name}: runs`);
    } catch (e) {
      r.failed.push(`tool ${t.name} threw: ${e instanceof Error ? e.message : e}`);
    }
  }
  for (const p of PROMPTS) check(p.build({ occasion: 'Diwali', year: '2027', subject: 'kites' }).length > 80, `prompt ${p.name}: builds`);
  for (const res of RESOURCES) check((await res.read()).length > 20, `resource ${res.uri}: reads`);
  r.notes.push(`${TOOLS.length} agent tools, ${PROMPTS.length} prompts, ${RESOURCES.length} resources checked`);
}

/* ---------- AI masks (P1.8): a stand-in segmentation drawn as a mask, then the real subject model in its worker ---------- */

async function aiMaskChecks(check: (ok: unknown, what: string) => void, r: Result): Promise<void> {
  const { setSegment } = await import('../engine/segments');
  const { DEFAULT_EDIT, renderIg } = await import('../engine/instagram');
  const { DEFAULT_ADJUST } = await import('../engine/adjust');
  const { newMask, newPart } = await import('../engine/masks');
  // A grey picture with a red disc in the middle: what any subject model should find.
  const src = document.createElement('canvas');
  src.width = src.height = 320;
  const sx = src.getContext('2d')!;
  sx.fillStyle = 'rgb(150,150,150)';
  sx.fillRect(0, 0, 320, 320);
  sx.fillStyle = 'rgb(210,40,40)';
  sx.beginPath();
  sx.arc(160, 160, 70, 0, Math.PI * 2);
  sx.fill();

  // Stand-in segmenter: the top half is the "sky". An AI mask darkening the sky darkens only the top.
  const fake = document.createElement('canvas');
  fake.width = fake.height = 100;
  fake.getContext('2d')!.drawImage(src, 0, 0, 100, 100);
  setSegment(fake, 'sky', { w: 2, h: 2, data: new Float32Array([1, 1, 0, 0]) });
  const part = { ...newPart('ai'), target: 'sky' as const };
  const mask = { ...newMask('Sky', 'ai'), parts: [part], adjust: { ...DEFAULT_ADJUST, exposure: -3 } };
  const out = document.createElement('canvas');
  out.width = out.height = 100;
  const ox = out.getContext('2d', { willReadFrequently: true })!;
  renderIg(ox, fake, 100, 100, { ...DEFAULT_EDIT, masks: [mask] }, 100, 100);
  const px = (x: number, y: number) => ox.getImageData(x, y, 1, 1).data[1];
  check(px(10, 5) < 60 && px(10, 95) > 120, `AI mask: a found sky darkens only the sky (top ${px(10, 5)}, bottom ${px(10, 95)})`);
  renderIg(ox, fake, 100, 100, { ...DEFAULT_EDIT, masks: [{ ...mask, parts: [{ ...part, invert: true }] }] }, 100, 100);
  check(px(10, 5) > 120 && px(10, 95) < 60, 'AI mask: an inverted part takes everything else');

  // The real subject model (bundled), in its worker with ONNX Runtime Web.
  try {
    const seg = await import('../ai/segment');
    const t0 = performance.now();
    await seg.segmentPhoto(src, 'subject');
    const ms = performance.now() - t0;
    const { segmentOf, segmentAt } = await import('../engine/segments');
    const m = segmentOf(src, 'subject')!;
    const centre = segmentAt(m, 0.5, 0.5),
      corner = segmentAt(m, 0.05, 0.05);
    check(m && centre > 0.5 && corner < 0.5, `AI mask: U²-Net-p finds the disc (centre ${centre.toFixed(2)}, corner ${corner.toFixed(2)})`);
    let needs = false;
    if (!(await seg.modelOnDevice('sky')))
      needs = await seg.segmentPhoto(src, 'sky').then(
        () => false,
        (e) => e instanceof seg.NeedsDownload,
      );
    else needs = true;
    check(needs, 'AI mask: the sky model is never downloaded without the user agreeing');
    r.notes.push(`AI subject mask: ${Math.round(ms)} ms for the first photo (model load and one 320 × 320 run, one thread)`);
  } catch (e) {
    r.failed.push(`AI mask: the subject model threw: ${e instanceof Error ? e.message : e}`);
  }
}

/* ---------- agent tools for the photo studio (P1.12): adjustments, masks, presets and LUTs end to end ---------- */

async function photoAgentChecks(check: (ok: unknown, what: string) => void, r: Result): Promise<void> {
  const { TOOLS_BY_NAME: T } = await import('../agent/tools');
  const ig = await import('../state/instagram');
  const { DEFAULT_ADJUST } = await import('../engine/adjust');
  const { forgetLut } = await import('../lib/userLuts');
  const call = async (name: string, args: Record<string, unknown> = {}) => T[name].run(args, {});
  const fails = async (name: string, args: Record<string, unknown>) => call(name, args).then(() => false, () => true);
  /** Mean RGB of a region of a tool's preview image, by shares of its size. */
  const mean = async (blob: Blob | undefined, x0: number, y0: number, x1: number, y1: number): Promise<[number, number, number]> => {
    const bmp = await createImageBitmap(blob!);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    x.drawImage(bmp, 0, 0);
    const X = Math.round(x0 * c.width),
      Y = Math.round(y0 * c.height);
    const d = x.getImageData(X, Y, Math.max(1, Math.round(x1 * c.width) - X), Math.max(1, Math.round(y1 * c.height) - Y)).data;
    const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k];
    return s.map((v) => v / (d.length / 4)) as [number, number, number];
  };
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const preview = async (extra: Record<string, unknown> = {}) => (await call('render_photo_preview', { maxPx: 256, ...extra })).image;
  const top = (img: Blob | undefined) => mean(img, 0.3, 0.05, 0.7, 0.3).then(lum),
    bottom = (img: Blob | undefined) => mean(img, 0.3, 0.7, 0.7, 0.95).then(lum);

  // An even, warm mid-tone photo (a cast the temperature slider can correct): white balance, exposure and masks show
  // plainly against it.
  const src = document.createElement('canvas');
  src.width = 400;
  src.height = 500;
  const sx = src.getContext('2d')!;
  sx.fillStyle = 'rgb(150,128,110)';
  sx.fillRect(0, 0, 400, 500);
  const blob = await new Promise<Blob>((ok) => src.toBlob((b) => ok(b!), 'image/png'));
  const { format, fileType } = ig.getIg();
  let lutId = '',
    presetId = '';
  try {
    ig.clearBatch();
    await ig.addPhotos([{ name: 'selftest.png', blob }]);
    const batch = (await call('get_photo_batch')).json as { photos: { id: string }[] };
    check(batch.photos.length === 1, 'photo tools: the batch lists the photo');
    const item = () => ig.getIg().items[0];

    const before = lum(await mean(await preview(), 0.2, 0.2, 0.8, 0.8));
    const adj = await call('adjust_photo', { settings: { exposure: 1, contrast: 500, mixer: { sat: { blue: -40 } }, curve: { r: [[0, 0], [1, 0.9]] }, bogus: 1 } });
    const a = item().edit.adjust;
    check(a.exposure === 1 && a.contrast === 100, 'photo tools: adjust_photo sets and clamps sliders');
    check(a.mixer.sat[5] === -40 && a.mixer.sat[0] === 0 && a.curve.r[1][1] === 0.9 && a.curve.rgb.length === 2, 'photo tools: partial mixer and curve');
    check(/bogus/.test(adj.text), 'photo tools: unknown settings are reported');
    check(lum(await mean(await preview(), 0.2, 0.2, 0.8, 0.8)) > before + 20, 'photo tools: exposure brightens the preview');
    await call('adjust_photo', { reset: true, settings: {} });
    check(JSON.stringify(item().edit.adjust) === JSON.stringify(DEFAULT_ADJUST), 'photo tools: reset restores the defaults');

    const wb = (await call('white_balance_from_point', { x: 0.5, y: 0.5 })).json as { temperature: number };
    const [wr, , wbl] = await mean(await preview(), 0.4, 0.4, 0.6, 0.6);
    check(wb.temperature < 0 && Math.abs(wr - wbl) < 8, `photo tools: white balance neutralises the picked colour (r ${wr.toFixed(0)}, b ${wbl.toFixed(0)})`);
    await call('adjust_photo', { reset: true, settings: {} });

    const frame = await call('frame_photo', { zoom: 9, rot: 90 });
    check((frame.json as { zoom: number }).zoom === 4 && item().edit.rot === 90, 'photo tools: frame_photo clamps and turns');
    await call('frame_photo', { zoom: 1, rot: 0 });

    // A sky fade: full at the top, gone by the middle, darkening by two stops.
    const m = (await call('add_mask', { kind: 'linear', name: 'Sky', part: { x: 0.5, y: 0.5, angle: 90, width: 0.05 }, adjust: { exposure: -2 } })).json as { id: string };
    let img = await preview();
    const t1 = await top(img),
      b1 = await bottom(img);
    check(t1 < b1 - 30, `photo tools: a linear mask darkens only its side (top ${t1.toFixed(0)}, bottom ${b1.toFixed(0)})`);
    const red = await mean(await preview({ mask: m.id }), 0.3, 0.05, 0.7, 0.3);
    check(red[0] > red[2] + 60, 'photo tools: the preview shows the mask in red');
    await call('edit_mask', { mask: m.id, invert: true });
    img = await preview();
    check((await top(img)) > (await bottom(img)) + 30, 'photo tools: edit_mask inverts');
    const two = (await call('set_mask_part', { mask: m.id, kind: 'colour', settings: { colour: '#96806e', range: 20 } })).json as {
      parts: { id: string; combine: string; r: number }[];
    };
    check(two.parts.length === 2 && two.parts[1].combine === 'intersect' && two.parts[1].r === 150, 'photo tools: set_mask_part adds a colour range that intersects');
    await call('set_mask_part', { mask: m.id, part: two.parts[1].id, combine: 'subtract', settings: { range: 50, bogus: 3 } });
    const p2 = item().edit.masks[0].parts[1] as unknown as Record<string, unknown>;
    check(p2.combine === 'subtract' && p2.range === 50 && !('bogus' in p2), 'photo tools: set_mask_part changes a part through the gate');
    await call('set_mask_part', { mask: m.id, kind: 'brush', settings: { addStrokes: [{ pts: [0.2, 0.2, 0.8, 0.8], size: 0.1 }] } });
    const brush = item().edit.masks[0].parts[2];
    check(brush?.kind === 'brush' && brush.strokes.length === 1, 'photo tools: brush strokes by points');
    await call('remove_mask', { mask: m.id, part: two.parts[1].id });
    check(item().edit.masks[0].parts.length === 2, 'photo tools: remove_mask removes a part');
    await call('remove_mask', { mask: m.id });
    check(item().edit.masks.length === 0, 'photo tools: remove_mask removes the mask');
    check(await fails('edit_mask', { mask: 'nope' }), 'photo tools: an unknown mask is a tool error');

    // AI masks: the subject is found before the tool returns; the sky asks for the user's agreement first.
    const { segmentOf } = await import('../engine/segments');
    const ai = (await call('add_mask', { kind: 'ai', name: 'Subject', adjust: { exposure: 1 } })).json as { id: string; parts: { kind: string; target: string }[] };
    check(ai.parts[0].kind === 'ai' && ai.parts[0].target === 'subject' && !!segmentOf(item().preview, 'subject'), 'photo tools: an AI mask finds the subject');
    const { modelOnDevice } = await import('../ai/segment');
    if (!(await modelOnDevice('sky'))) {
      const sky = await call('set_mask_part', { mask: ai.id, kind: 'ai', settings: { target: 'sky' } });
      check(/download/.test(sky.text) && /allowDownload/.test(sky.text), 'photo tools: the sky model needs the user’s agreement');
      check(/download/.test((await call('find_with_ai', {})).text), 'photo tools: find_with_ai asks before downloading');
    }
    await call('remove_mask', { mask: ai.id });

    // A 2³ LUT that swaps red and blue: the warm photo turns cool.
    const cube = ['TITLE "Selftest swap"', 'LUT_3D_SIZE 2'];
    for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let rr = 0; rr < 2; rr++) cube.push(`${b} ${g} ${rr}`);
    lutId = ((await call('import_lut', { cube: cube.join('\n') })).json as { id: string }).id;
    check(((await call('list_luts')).json as { id: string }[]).some((l) => l.id === lutId), 'photo tools: an imported LUT is listed');
    await call('adjust_photo', { photo: 'all', settings: { lut: lutId } });
    const [lr, , lb] = await mean(await preview(), 0.4, 0.4, 0.6, 0.6);
    check(lb > lr + 25, `photo tools: the LUT applies (r ${lr.toFixed(0)}, b ${lb.toFixed(0)})`);
    check(await fails('adjust_photo', { settings: { lut: 'zz00000000' } }), 'photo tools: an unknown LUT is a tool error');
    check(await fails('import_lut', { cube: 'LUT_1D_SIZE 2\n0 0 0\n1 1 1' }), 'photo tools: a 1D LUT is refused');

    await call('adjust_photo', { settings: { exposure: 0.5 } });
    presetId = ((await call('save_preset', { name: 'Selftest preset' })).json as { id: string }).id;
    const listed = (await call('list_presets')).json as { builtIn: unknown[]; saved: { id: string }[] };
    check(listed.builtIn.length === 7 && listed.saved.some((p) => p.id === presetId), 'photo tools: presets listed');
    await call('apply_preset', { preset: 'look:bw' });
    check(item().edit.adjust.look === 'bw' && item().edit.adjust.exposure === 0.5, 'photo tools: a built-in preset sets only its look');
    await call('adjust_photo', { reset: true, settings: {} });
    await call('apply_preset', { preset: presetId, photo: 'all' });
    const ap = item().edit.adjust;
    check(ap.exposure === 0.5 && ap.lut === lutId && ap.look === 'none', 'photo tools: a saved preset replaces the settings');
    const file = JSON.parse(await (await call('export_presets', { presets: [presetId] })).files![0].blob.text());
    check(file.format === 'chitthi-presets' && file.presets.length === 1 && file.luts.length === 1, 'photo tools: export_presets carries the LUT');
    const imp = await call('import_presets', { json: JSON.stringify(file) });
    check((imp.json as { skipped: number }).skipped === 1, 'photo tools: importing the same preset skips it');
    check(await fails('delete_preset', { preset: presetId }), 'photo tools: deleting a preset needs confirm');
    await call('delete_preset', { preset: presetId, confirm: true });
    presetId = '';

    await call('set_photo_options', { format: 'square', fileType: 'png' });
    const out = await call('export_photos');
    const bmp = await createImageBitmap(out.files![0].blob);
    check(out.files!.length === 1 && out.files![0].blob.type === 'image/png' && bmp.width === 1080 && bmp.height === 1080, 'photo tools: export_photos writes the batch');
    check(await fails('adjust_photo', { photo: 'nope', settings: {} }), 'photo tools: an unknown photo is a tool error');
  } catch (e) {
    r.failed.push(`photo tools threw: ${e instanceof Error ? e.message : e}`);
  } finally {
    if (presetId) await call('delete_preset', { preset: presetId, confirm: true }).catch(() => undefined);
    if (lutId) await forgetLut(lutId);
    ig.clearBatch();
    ig.setIg({ format, fileType });
  }
}

declare global {
  interface Window {
    __chitthiSelfTest?: typeof run;
  }
}
window.__chitthiSelfTest = run;
