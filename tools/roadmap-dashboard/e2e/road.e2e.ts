// The roadmap dashboard in a browser (405 §9, D2): run with `npm run test:roadmap`. Each run copies specs/ and memory/
// to a temporary folder, puts 405 in progress there (one task running, one blocked, so the hero and roadblocks show),
// serves it with server.mjs --root and checks the road, the rail, the hero, live changes, reduced motion, axe and
// scrolling. Nothing here touches the real specs.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '../../..');
const CLI = join(REPO, 'tools/specs-index/cli.mjs');
let root = '';
let server: ChildProcess | null = null;
let base = '';
let current = '';
let blockedTask = '';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const save = (p: string, d: unknown) => writeFileSync(p, `${JSON.stringify(d, null, 2)}\n`);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'roadmap-e2e-'));
  cpSync(join(REPO, 'specs'), join(root, 'specs'), { recursive: true });
  cpSync(join(REPO, 'memory'), join(root, 'memory'), { recursive: true });
  // The scenario: 405 is the current stop, in progress, with a running task and a blocked one.
  const rm = json(join(root, 'specs/roadmap.json'));
  rm.currentPhase = 'other';
  rm.items.byId['405'].status = 'in-progress';
  save(join(root, 'specs/roadmap.json'), rm);
  const fp = join(root, 'specs/features/405-roadmap-revamp/feature.json');
  const f = json(fp);
  f.status = 'in-progress';
  const ids: string[] = f.tasks.items.order;
  for (const id of ids) {
    f.tasks.items.byId[id].status = 'todo';
    f.tasks.items.byId[id].doneOn = null;
  }
  const [a, b, c, d] = ids;
  Object.assign(f.tasks.items.byId[a], { status: 'done', doneOn: new Date().toISOString().slice(0, 10) });
  Object.assign(f.tasks.items.byId[b], { status: 'in-progress', startedOn: '2026-10-10' });
  Object.assign(f.tasks.items.byId[c], { status: 'blocked', blockedReason: 'Waits for the e2e maintainer.' });
  void d;
  save(fp, f);
  current = '405';
  blockedTask = c;
  execFileSync(process.execPath, [CLI, 'sync', '--root', root]);

  server = spawn(process.execPath, [join(REPO, 'tools/roadmap-dashboard/server.mjs'), '--port', '0', '--no-open', '--root', root], { cwd: REPO });
  base = await new Promise<string>((ok, fail) => {
    let out = '';
    const t = setTimeout(() => fail(new Error(`dashboard did not start:\n${out}`)), 60_000);
    server!.stdout!.on('data', (chunk) => {
      out += chunk;
      const m = /http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/.exec(out);
      if (m) {
        clearTimeout(t);
        ok(`http://localhost:${m[1]}/`);
      }
    });
    server!.stderr!.on('data', (chunk) => (out += chunk));
  });
});

test.afterAll(() => {
  server?.kill();
  rmSync(root, { recursive: true, force: true });
});

/** Opens a view and waits for the page to have data; collects console errors (axe's own injected script aside). */
async function open(page: Page, hash: string) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/inline style|axe/i.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}${hash}`);
  await page.locator('main h1').first().waitFor();
  return errors;
}
const inView = (page: Page, id: string) =>
  page.evaluate((id) => {
    const r = document.getElementById(`stop-${id}`)!.getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  }, id);

test.describe('views and links (T040: AC-8, AC-15)', () => {
  test("404's URLs open their views", async ({ page }) => {
    const errors = await open(page, '#/');
    await expect(page.locator('.road .stop')).toHaveCount(Object.keys(json(join(root, 'specs/roadmap.json')).items.byId).length);
    await open(page, '#/?q=40&status=done');
    await expect(page.getByRole('search').locator('.count')).toContainText('of');
    for (const tab of ['board', 'spec', 'plan', 'docs']) {
      await open(page, `#/feature/405/${tab}`);
      await expect(page.getByRole('tab', { selected: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('stops with a spec link to their board; items without one are not links', async ({ page }) => {
    await open(page, '#/');
    const rm = json(join(root, 'specs/roadmap.json'));
    for (const [id, item] of Object.entries<{ folder: string | null }>(rm.items.byId)) {
      if (id === current) continue; // the hero
      const link = page.locator(`#stop-${id} a.stop-card`);
      if (item.folder) await expect(link).toHaveAttribute('href', `#/feature/${id}/board`);
      else await expect(link).toHaveCount(0);
    }
  });
});

test.describe('the road (T041: AC-3, AC-4, AC-5, AC-7, AC-9, AC-15)', () => {
  test('opens at the current stop; Back to now; ?at= opens at a stop', async ({ page }) => {
    await open(page, '#/');
    await expect.poll(() => inView(page, current)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await expect.poll(() => inView(page, current)).toBe(false);
    await page.locator('.rail-foot .rail-now').click();
    await expect.poll(() => inView(page, current)).toBe(true);
    await open(page, '#/?at=203');
    await expect.poll(() => inView(page, '203')).toBe(true);
  });

  test('the rail has a mark per phase and stop; a mark scrolls to its stop and focuses it', async ({ page }) => {
    await open(page, '#/');
    const rm = json(join(root, 'specs/roadmap.json'));
    await expect(page.locator('.rail-phase > a')).toHaveCount(rm.phases.order.length);
    await expect(page.locator('.rail-stop')).toHaveCount(Object.keys(rm.items.byId).length);
    await page.locator('.rail-stop[title^="000"]').click();
    await expect.poll(() => inView(page, '000')).toBe(true);
    await expect(page.locator('#stop-000')).toBeFocused();
  });

  test('at 360 px the rail folds into a bar with the phase in view', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page, '#/');
    await expect(page.locator('.rail-bar')).toBeVisible();
    await expect(page.locator('.rail-marks')).toBeHidden();
    await expect(page.locator('.rail-bar-phase')).not.toBeEmpty();
  });

  test('the current region is open, the others are folded', async ({ page }) => {
    await open(page, '#/');
    await expect(page.locator('.region.is-current')).toHaveCount(1);
    await expect(page.locator(`.region.is-current #stop-${current}`)).toHaveCount(1);
    // The current phase's goal and exit (when it has them) are open; every other phase shows its one-line summary.
    const more = page.locator('.region.is-current .region-more');
    if (await more.count()) await expect(more).toHaveAttribute('open', '');
    await expect(page.locator('.region:not(.is-current) .region-more')).not.toHaveCount(0);
    await expect(page.locator('.region:not(.is-current) .region-more[open]')).toHaveCount(0);
    // Opening one shows its goal.
    await page.locator('.region:not(.is-current) .region-more > summary').first().click();
    await expect(page.locator('.region:not(.is-current) .region-more[open]')).toHaveCount(1);
  });

  test("a roadblock's link opens the board filtered to its task", async ({ page }) => {
    await open(page, '#/');
    await page.locator('.hero-blocked a').first().click();
    await expect(page).toHaveURL(new RegExp(`#/feature/${current}/board\\?q=${blockedTask}$`));
    await expect(page.locator(`[data-task="${blockedTask}"]`)).toBeVisible();
  });

  test("a stop's progress reaches its value once in view; the travelled line follows the scroll", async ({ page }) => {
    await open(page, '#/?at=000');
    const done = await page.locator('#stop-000 .stop-progress .sr-only').textContent();
    const want = /^(\d+) of (\d+)/.exec(done!.trim())!;
    await expect(page.locator('#stop-000 .stop-progress .num')).toHaveText(`${want[1]}/${want[2]}`);
    const offset = () => page.evaluate(() => getComputedStyle(document.querySelector('.road-drawn')!).strokeDashoffset);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(200);
    const top = await offset();
    await page.locator(`#stop-${current}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    expect(await offset()).not.toBe(top);
  });

  test('filters dim the stops that do not match and the rail shows only matches', async ({ page }) => {
    await open(page, '#/?status=done');
    const rm = json(join(root, 'specs/roadmap.json'));
    const done = Object.entries<{ status: string }>(rm.items.byId).filter(([, i]) => i.status === 'done').map(([id]) => id);
    await expect(page.locator('.rail-stop')).toHaveCount(done.length);
    await expect(page.locator('.stop.is-dim')).toHaveCount(Object.keys(rm.items.byId).length - done.length);
    await expect(page.locator('.stop.is-dim').first()).toContainText('not matching');
    await expect(page.getByRole('search').locator('.count')).toHaveText(`${done.length} of ${Object.keys(rm.items.byId).length} items`);
  });
});

test.describe('live changes and stillness (T042: AC-10, AC-11)', () => {
  test('a task finished from the CLI lights up its stop and is announced within 3 s; nothing on first load', async ({ page }) => {
    await open(page, '#/');
    await page.waitForTimeout(500);
    await expect(page.locator('.is-changed')).toHaveCount(0);
    await expect(page.locator('.roadmap > [role=status]')).toHaveText('');
    const running = json(join(root, 'specs/features/405-roadmap-revamp/feature.json')).tasks.items.order[1];
    const t0 = Date.now();
    execFileSync(process.execPath, [CLI, 'done', '405', running, '--root', root]);
    await expect(page.locator('.hero.is-changed')).toBeVisible({ timeout: 3000 });
    expect(Date.now() - t0).toBeLessThan(3000);
    await expect(page.locator('.roadmap > [role=status]')).toHaveText(`405 ${running} done`);
    await expect(page.locator('.is-changed')).toHaveCount(0, { timeout: 4000 });
  });

  test('with reduced motion nothing animates and every value is final', async ({ browser }) => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await open(page, '#/');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 500) await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    const counts = await page.locator('.stop-progress').evaluateAll((els) =>
      els.map((e) => [e.querySelector('.num')!.textContent, /^(\d+) of (\d+)/.exec(e.querySelector('.sr-only')!.textContent!.trim())!.slice(1).join('/')]),
    );
    for (const [shown, real] of counts) expect(shown).toBe(real);
    await page.close();
  });
});

test.describe('accessibility (T043: AC-16)', () => {
  for (const [w, h, scheme] of [
    [1280, 800, 'light'],
    [1280, 800, 'dark'],
    [360, 740, 'light'],
    [360, 740, 'dark'],
  ] as const) {
    test(`axe and sideways scroll at ${w} px, ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
      const page = await context.newPage();
      for (const hash of ['#/', `#/feature/${current}/board`]) {
        await open(page, hash);
        await page.waitForTimeout(700);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(bad.map((v) => `${v.id}: ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')}`), `${hash} at ${w} ${scheme}`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      }
      await context.close();
    });
  }

  test('keyboard: skip link, rail, stops and hero are reachable with a visible focus', async ({ page }) => {
    await open(page, '#/');
    await page.locator('.skip').focus();
    await expect(page.locator('.skip')).toBeInViewport();
    const reached = new Set<string>();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null; // past the last control: focus left the page
        const s = getComputedStyle(el);
        const zone = el.closest('.rail') ? 'rail' : el.closest('.hero') ? 'hero' : el.closest('.stop') ? 'stop' : el.closest('.filters') ? 'filters' : 'other';
        const what = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} ${(el.textContent ?? '').trim().slice(0, 40)}`;
        return { zone, what, visible: s.outlineStyle !== 'none' || s.boxShadow !== 'none' };
      });
      if (info) {
        reached.add(info.zone);
        expect(info.visible, `focus visible on ${info.what} (${info.zone})`).toBe(true);
      }
    }
    for (const zone of ['filters', 'rail', 'stop']) expect(reached).toContain(zone);
  });
});

test.describe('smoothness (T044: AC-12)', () => {
  test('scrolling the whole road: no frame over 50 ms, median under 17 ms; interactive within 1 s', async ({ page }) => {
    const t0 = Date.now();
    await page.goto(`${base}#/`);
    await page.locator('.road .stop').first().waitFor();
    const ready = Date.now() - t0;
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(500);
    const r = await page.evaluate(async () => {
      const frames: number[] = [];
      const max = document.documentElement.scrollHeight - innerHeight;
      let last = performance.now();
      await new Promise<void>((done) => {
        const step = (t: number) => {
          frames.push(t - last);
          last = t;
          scrollBy(0, 24);
          if (scrollY >= max) done();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      frames.shift();
      const sorted = frames.slice().sort((a, b) => a - b);
      return { frames: frames.length, median: sorted[Math.floor(sorted.length / 2)], longest: sorted.at(-1)! };
    });
    console.log(`AC-12: ${r.frames} frames, median ${r.median.toFixed(1)} ms, longest ${r.longest.toFixed(1)} ms; road ready in ${ready} ms`);
    expect(r.longest).toBeLessThan(50);
    expect(r.median).toBeLessThan(17);
    expect(ready).toBeLessThan(1000);
  });
});
