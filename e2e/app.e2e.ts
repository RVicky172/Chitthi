import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Fails the test on any uncaught page error or console error. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const preview = (page: Page) => page.locator('section.stage canvas').first();
const products = (page: Page) => page.getByRole('group', { name: 'What are you making?' });

test('the home page loads without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page).toHaveTitle(/Chitthi/);
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('the studio shows every product', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/studio');
  await expect(preview(page)).toBeVisible();
  for (const [button, word] of [
    ['Calendar', 'calendar'],
    ['Frame', 'print'],
    ['Magnet', 'magnet'],
    ['Postcard', 'postcard'],
  ]) {
    await products(page).getByRole('button', { name: button }).click();
    await expect(products(page).getByRole('button', { name: button })).toHaveAttribute('aria-pressed', 'true');
    await expect(preview(page)).toHaveAttribute('aria-label', new RegExp(word));
  }
  expect(errors).toEqual([]);
});

test('the card in progress survives a reload', async ({ page }) => {
  await page.goto('./#/studio');
  await products(page).getByRole('button', { name: 'Calendar' }).click();
  await expect(preview(page)).toHaveAttribute('aria-label', /calendar/);
  await page.reload();
  await expect(products(page).getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-pressed', 'true');
});

// Accessibility: no serious or critical WCAG 2.2 A/AA problems on the main screens.
for (const [name, path] of [
  ['home', './'],
  ['studio', './#/studio'],
  ['sizes guide', './#/sizes'],
]) {
  test(`${name} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('#root')).not.toBeEmpty();
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
}

// The site nav keeps everything inside the bar on one line: links live in the Explore and Tools dropdowns.
for (const path of ['./', './#/sizes', './#/paper']) {
  test(`the nav fits its bar on ${path}`, async ({ page }) => {
    await page.goto(path);
    const nav = page.locator('nav.lnav');
    await expect(nav).toBeVisible();
    const fit = await nav.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const kids = [...el.children].filter((c) => (c as HTMLElement).offsetParent).map((c) => c.getBoundingClientRect());
      return { inside: kids.every((k) => k.right <= box.right + 0.5 && k.left >= box.left - 0.5), oneLine: kids.every((k) => k.top < box.top + box.height / 2), noScroll: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(fit).toEqual({ inside: true, oneLine: true, noScroll: true });
  });
}

test('the Tools menu opens each tool page', async ({ page, isMobile }) => {
  await page.goto('./#/sizes');
  await page.getByRole('button', { name: isMobile ? 'Menu' : 'Tools', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Sizes and layouts guide' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('menuitem', { name: 'Photo & video studio' }).click();
  await expect(page).toHaveURL(/#\/instagram$/);
  await expect(page.getByRole('navigation', { name: 'What to make' })).toBeVisible();
});

// The studio's top bar fits on one line at every width (modes, actions and the brand never overflow).
test('the media studio bar fits', async ({ page }) => {
  await page.goto('./#/instagram/youtube');
  const fit = await page.locator('.mst-top').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [...el.children].every((c) => c.getBoundingClientRect().right <= box.right + 0.5) && document.documentElement.scrollWidth <= innerWidth;
  });
  expect(fit).toBe(true);
});
