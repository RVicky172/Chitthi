import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { cpus, totalmem, release } from 'node:os';
import path from 'node:path';

import { defined } from '../support/defined';
/*
 * The Phase 1 gate (specs/vision/editor-implementation.md): masked edits keep a 30 fps preview at 1080p in Chrome.
 * A 15 MP photo in a 1080 × 1350 post with a look, a brush mask with exposure and a linear gradient mask with clarity;
 * then, 3 times each, 10 s of painting with the brush and 10 s of dragging the gradient's centre handle, with a pointer
 * move every 16 ms. Every requestAnimationFrame interval is recorded; the worst run must have a median ≤ 33.3 ms and a
 * 95th percentile ≤ 50 ms. GATE_CPU_THROTTLE=4 slows the page's CPU (to check the measurement can see a slow frame).
 */
const PHOTO = path.join('public', 'samples', 'puri-temple.jpg'); // 3200 × 4800
const SECONDS = 10;
const RUNS = 3;
const LIMITS = { median: 1000 / 30, p95: 50 };
const throttle = Number(process.env.GATE_CPU_THROTTLE || 1);

const tool = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name, exact: true });
const pct = (sorted: number[], share: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * share))];

interface Stats {
  /** Pointer moves the page handled in the 10 s; each one redraws the preview with the changed mask. */
  moves: number;
  /** Time between preview updates (handled moves), the gate's measure. Moves are sent every 16 ms, so a page that keeps
   * up shows about 16–18 ms; a slower one shows how long each update takes. */
  median: number;
  p95: number;
  max: number;
  /** Display frames (requestAnimationFrame) in the 10 s and the longest one: a check on jank, not the gate. */
  frames: number;
  frameMax: number;
}

const stats = (samples: number[]) => {
  const ordered = samples
    .slice(1)
    .map((x, index) => x - samples[index])
    .sort((left, right) => left - right);
  return {
    n: ordered.length,
    median: pct(ordered, 0.5),
    p95: pct(ordered, 0.95),
    max: ordered[ordered.length - 1],
  };
};

/** Records handled pointer moves and display frames while `act` runs, then returns them summarised. */
async function measure(page: Page, act: (stop: () => boolean) => Promise<number>): Promise<Stats> {
  await page.evaluate(() => {
    const appWindow = window as unknown as { __gate: { f: number[]; m: number[]; on: boolean; off: () => void } };
    const gate = { f: [] as number[], m: [] as number[], on: true, off: () => undefined as void };
    appWindow.__gate = gate;
    const tick = (now: number) => {
      gate.f.push(now);
      if (gate.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // After the app's own handler (bubbling, on window): the time the move was done with.
    const move = (pointerEvent: PointerEvent) => pointerEvent.buttons && gate.m.push(performance.now());
    window.addEventListener('pointermove', move);
    gate.off = () => window.removeEventListener('pointermove', move);
  });
  const end = Date.now() + SECONDS * 1000;
  await act(() => Date.now() >= end);
  const { f, m } = await page.evaluate(() => {
    const appWindow = window as unknown as { __gate: { f: number[]; m: number[]; on: boolean; off: () => void } };
    appWindow.__gate.on = false;
    appWindow.__gate.off();
    return appWindow.__gate;
  });
  const summary = stats(m);
  const fr = stats(f);
  return {
    moves: m.length,
    median: summary.median,
    p95: summary.p95,
    max: summary.max,
    frames: fr.n,
    frameMax: fr.max,
  };
}

/** Moves the pointer with the button down along `path` (shares of the canvas, looping) every 16 ms until `stop`. */
async function dragFor(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  from: [number, number],
  path: (k: number) => [number, number],
  stop: () => boolean,
) {
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  let step = 0;
  let next = performance.now();
  while (!stop()) {
    const [pathX, pathY] = path(step++);
    await page.mouse.move(box.x + box.width * pathX, box.y + box.height * pathY);
    // Wait for the next 16 ms slot without setTimeout: Windows timers tick every ~15.6 ms, which would turn some
    // 16 ms gaps into 31 ms and show up as slow updates.
    next += 16;
    if (next < performance.now()) next = performance.now();
    while (performance.now() < next) await new Promise((resolve) => setImmediate(resolve));
  }
  await page.mouse.up();
  return step;
}

test('Phase 1 gate: masked edits at 30 fps in Chrome', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto('./#/instagram');
  await expect(page.getByRole('button', { name: /Instagram photos|Photos/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The graphics card the editor will use: WebGPU if the browser offers an adapter, else WebGL2. A software renderer
  // (SwiftShader, llvmpipe, Microsoft Basic Render) would measure the wrong thing.
  const gpu = await page.evaluate(async () => {
    const nav = navigator as unknown as {
      gpu?: { requestAdapter(): Promise<{ info?: Record<string, string>; isFallbackAdapter?: boolean } | null> };
    };
    const first = nav.gpu ? await nav.gpu.requestAdapter() : null;
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      webgpu:
        first && !first.isFallbackAdapter
          ? [first.info?.vendor, first.info?.architecture, first.info?.description].filter(Boolean).join(' ') || 'yes'
          : null,
      webgl2: gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null,
    };
  });
  const backend = gpu.webgpu ? `WebGPU (${gpu.webgpu})` : gpu.webgl2 ? `WebGL2 (${gpu.webgl2})` : 'none';
  expect(backend, 'a hardware GPU backend').not.toMatch(/none|SwiftShader|llvmpipe|Basic Render/i);

  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }

  await page.locator('.mst-drop input[type=file]').setInputFiles([PHOTO]);
  await expect(page.getByRole('list', { name: 'Photos in this post, in order' }).locator('.mst-thumb')).toHaveCount(1);
  await page.getByRole('radio', { name: 'Warm' }).click();
  const canvas = page.locator('.mst-canvas');
  await tool(page, 'Masks').click();
  // Mask 1: a linear gradient with clarity; Mask 2: the brush with exposure. Both are drawn in every frame.
  await page.getByRole('button', { name: 'New linear gradient mask' }).click();
  await page.locator('#mk-clarity').fill('30');
  await page.getByRole('button', { name: 'New brush mask' }).click();
  await page.locator('#mk-exposure').fill('1');
  /** Selects a mask (its button toggles, so only when it isn't selected already). */
  const select = async (name: string) => {
    const locator = page.getByRole('list', { name: 'Masks of this photo' }).getByRole('button', { name, exact: true });
    if ((await locator.getAttribute('aria-pressed')) !== 'true') await locator.click();
    await expect(locator).toHaveAttribute('aria-pressed', 'true');
  };
  await canvas.scrollIntoViewIfNeeded();
  const box = defined(await canvas.boundingBox());

  // The photo (2:3) fills the 4:5 frame across its width, so photo v maps to frame y = (v − offset) / scale.
  const scale = 1.25 / 1.5;
  const offset = (1 - scale) / 2;
  const handle: [number, number] = [0.5, (0.4 - offset) / scale];

  const results: { kind: string; run: number; stats: Stats }[] = [];
  for (let run = 1; run <= RUNS; run++) {
    // Painting: a long figure-of-eight stroke, as a hand does across the photo.
    await select('Mask 2');
    const paint = await measure(page, (stop) =>
      dragFor(
        page,
        box,
        [0.5, 0.5],
        (step) => [0.5 + 0.3 * Math.sin(step / 40), 0.5 + 0.25 * Math.sin(step / 20)],
        stop,
      ),
    );
    // Each run left one more stroke on the brush mask: the moves really painted.
    await expect(page.getByRole('button', { name: new RegExp(`^Brush 1 · ${run} strokes?$`) })).toBeVisible();
    results.push({ kind: 'paint', run, stats: paint });

    // Dragging the gradient's centre handle in a circle: the gradient is rasterised again on every move.
    await select('Mask 1');
    await expect(page.locator('label[for="mk-x"] output')).toHaveText('50');
    const drag = await measure(page, (stop) =>
      dragFor(
        page,
        box,
        handle,
        (step) => [handle[0] + 0.15 * Math.sin(step / 30), handle[1] + 0.1 * (1 - Math.cos(step / 30))],
        stop,
      ),
    );
    await expect(page.locator('label[for="mk-x"] output'), 'the drag moved the gradient').not.toHaveText('50');
    results.push({ kind: 'drag', run, stats: drag });
    // Put the gradient back so every run starts the same.
    await page.keyboard.press('Control+z');
    await expect(page.locator('label[for="mk-x"] output')).toHaveText('50');
  }

  const worst = (kind: string) =>
    results
      .filter((result) => result.kind === kind)
      .reduce((acc, candidate) =>
        candidate.stats.median > acc.stats.median || candidate.stats.p95 > acc.stats.p95 ? candidate : acc,
      );
  const fmt = (x: number) => x.toFixed(1).padStart(6);
  const machine = {
    cpu: cpus()[0]?.model.trim(),
    threads: cpus().length,
    ramGB: Math.round(totalmem() / 2 ** 30),
    os: release(),
    chrome: browser.version(),
    backend,
    throttle,
  };
  console.log(`\n${machine.chrome} · ${backend}${throttle > 1 ? ` · CPU throttled ${throttle}×` : ''}`);
  console.log(`${machine.cpu} (${machine.threads} threads), ${machine.ramGB} GB RAM, ${machine.os}\n`);
  console.log('                     time between preview updates (ms)    display frames');
  console.log('run   kind    updates  median     p95     max            frames  longest');
  for (const result of results)
    console.log(
      `${String(result.run).padEnd(5)} ${result.kind.padEnd(6)} ${String(result.stats.moves).padStart(7)} ${fmt(result.stats.median)}  ${fmt(result.stats.p95)}  ${fmt(result.stats.max)}            ${String(result.stats.frames).padStart(6)} ${fmt(result.stats.frameMax)}`,
    );
  const verdict = ['paint', 'drag'].map((key) => {
    const worstStats = worst(key).stats;
    const ok = worstStats.median <= LIMITS.median && worstStats.p95 <= LIMITS.p95;
    return { kind: key, ok, median: worstStats.median, p95: worstStats.p95 };
  });
  for (const value of verdict)
    console.log(
      `${value.ok ? 'PASS' : 'FAIL'} ${value.kind}: worst run: preview updated every ${value.median.toFixed(1)} ms at the median (≤ 33.3), ${value.p95.toFixed(1)} ms at p95 (≤ 50)`,
    );
  writeFileSync(
    path.join('test-results', 'gate.json'),
    JSON.stringify({ when: new Date().toISOString(), machine, limits: LIMITS, results, verdict }, null, 2),
  );

  expect(errors).toEqual([]);
  expect(
    verdict.filter((value) => !value.ok).map((value) => value.kind),
    'kinds over the limits',
  ).toEqual([]);
});
