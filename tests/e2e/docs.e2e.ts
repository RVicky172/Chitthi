import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The website's documentation (#/docs): pages, sections, links in from the site, phone layout, accessibility.

test('the documentation opens from the site, moves between pages and sections, and has no serious accessibility problems', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./#/docs');
  await expect(page.getByRole('heading', { level: 1, name: 'Getting started' })).toBeVisible();
  const phone = info.project.name === 'phone';

  // Every page is reachable: the side list on wide screens, a select on phones.
  const open = async (title: string) => {
    if (phone) await page.getByRole('combobox', { name: 'Documentation page' }).selectOption({ label: title });
    else await page.getByRole('navigation', { name: 'Documentation' }).getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  };
  await open('Photo editor');
  await expect(page).toHaveURL(/#\/docs\/photo$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Masks' })).toBeVisible();
  await open('AI agents (MCP)');
  await expect(page.getByText('/plugin install chitthi@chitthi')).toBeVisible();

  // A section link scrolls to it, and a deep link opens the page at that section.
  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Use cases' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Use cases' })).toBeInViewport();
  await page.goto('./#/docs/build/tests');
  await expect(page.getByRole('heading', { level: 1, name: 'Build and extend' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Tests' })).toBeInViewport();

  // Next and previous, and an unknown page falls back to the first.
  await page.getByRole('navigation', { name: 'More documentation' }).getByRole('link', { name: /Previous/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Self-hosting' })).toBeVisible();
  await page.goto('./#/docs/nope');
  await expect(page.getByRole('heading', { level: 1, name: 'Getting started' })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  expect(errors).toEqual([]);
});

test('the home page links to the documentation', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Documentation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Getting started' })).toBeVisible();
});
