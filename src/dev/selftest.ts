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
  for (const name of ran) {
    const g = await goldenParity(name);
    check(g.max <= 2 && g.mean <= 0.5, `gpu ${name}: real photos through renderIg match Canvas 2D (worst ${g.max} in ${g.where}, mean ${g.mean.toFixed(3)})`);
    worst.set(name, `${worst.get(name)}; photos: worst ${g.max}, mean ${g.mean.toFixed(3)} over ${g.frames} frames`);
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
 * P0.6: golden images. Real sample photos drawn by the whole renderIg() (placement, background, rotation, colour,
 * vignette) at Instagram size, once on the Canvas 2D path and once on the GPU backend, must match: at most 2 levels
 * apart in any channel and 0.5 on average. This is the gate for turning the GPU path on by default.
 */
async function goldenParity(backend: 'webgpu' | 'webgl2'): Promise<{ max: number; mean: number; where: string; frames: number }> {
  const { DEFAULT_EDIT, renderIg } = await import('../engine/instagram');
  const { LOOK_IDS } = await import('../engine/adjust');
  const { closeGpu, openGpu } = await import('../engine/gpu/device');
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
  const edits = [
    {},
    { brightness: 35, contrast: 20 },
    { saturation: -60, warmth: 40, vignette: 50 },
    { contrast: 100, brightness: -40 },
    { exposure: 0.7, highlights: -60, shadows: 50, temperature: -40, tint: 20 },
  ];
  const frame = (img: HTMLImageElement, e: typeof DEFAULT_EDIT) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true })!;
    renderIg(x, img, img.naturalWidth, img.naturalHeight, e, W, H);
    return x.getImageData(0, 0, W, H).data;
  };
  let max = 0,
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
          if (d > max) {
            max = d;
            const px = k >> 2;
            where = `${f} ${look} ${JSON.stringify(adj)} fit=${e.fit} rot=${e.rot} at ${px % W},${Math.floor(px / W)} cpu ${[...cpu.slice(k - (k % 4), k - (k % 4) + 4)]} gpu ${[...got.slice(k - (k % 4), k - (k % 4) + 4)]}`;
          }
        }
      }
  closeGpu();
  return { max, mean: sum / count, where, frames };
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
  const time = () => {
    renderIg(x, img, img.naturalWidth, img.naturalHeight, e, 1080, 1350);
    x.getImageData(0, 0, 1, 1);
    const t0 = performance.now();
    for (let i = 0; i < 15; i++) renderIg(x, img, img.naturalWidth, img.naturalHeight, e, 1080, 1350);
    x.getImageData(0, 0, 1, 1); // wait for the drawing to finish
    return (performance.now() - t0) / 15;
  };
  closeGpu();
  const cpu = time();
  await openGpu(backend);
  const gpu = time();
  closeGpu();
  return `1080×1350 frame: Canvas 2D ${cpu.toFixed(1)} ms, ${backend} ${gpu.toFixed(1)} ms`;
}

/**
 * P0.4: the GPU colour programs give the same pixels as the Canvas 2D path (adjustPixels), for every look and a spread
 * of slider settings, within 2 levels per channel. Returns the largest difference seen.
 */
async function colourParity(dev: import('../engine/gpu/types').GpuDevice, check: (ok: unknown, what: string) => void, name: string): Promise<string> {
  const { adjustPixels } = await import('../engine/instagram');
  const { DEFAULT_ADJUST, LOOK_IDS } = await import('../engine/adjust');
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
  const sliders = [
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
  for (const t of TOOLS.filter((x) => x.readOnly && !['search_pexels', 'list_saved'].includes(x.name))) {
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

declare global {
  interface Window {
    __chitthiSelfTest?: typeof run;
  }
}
window.__chitthiSelfTest = run;
