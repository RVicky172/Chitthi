import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The photo studio: batch, editing, export and posting.
const SAMPLES = ['beach.jpg', 'diwali.jpg', 'holi.jpg', 'lotus.jpg', 'tea.jpg'].map((n) => path.join('public', 'samples', n));
const upload = (page: Page, files: string[]) => page.locator('.mst-drop input[type=file]').setInputFiles(files);
const strip = (page: Page) => page.getByRole('list', { name: 'Photos in this post, in order' });
const tool = (page: Page, name: string) => page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('./#/instagram');
  await expect(page.getByRole('button', { name: /Instagram photos|Photos/ }).first()).toHaveAttribute('aria-pressed', 'true');
});

test('the batch respects its limit, and the limit is editable up to 20', async ({ page }) => {
  await page.getByRole('group', { name: 'Batch size' }).getByRole('button', { name: '2', exact: true }).click();
  await upload(page, SAMPLES.slice(0, 3));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(2);
  await expect(page.getByRole('alert')).toContainText('1 photo not added');
  await page.getByRole('group', { name: 'Batch size' }).getByRole('button', { name: '4', exact: true }).click();
  await upload(page, SAMPLES.slice(2, 4));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(4);
  await expect(page.getByRole('group', { name: 'Batch size' }).getByRole('button', { name: '2', exact: true })).toBeDisabled();
  const own = page.getByLabel(/Custom batch size/);
  await own.fill('50');
  await own.press('Enter');
  await expect(page.locator('.ig-count').first()).toHaveText('4 of 20');
});

test('photos can be edited, reordered and exported as a ZIP of 1080 px JPEGs', async ({ page }) => {
  await upload(page, SAMPLES.slice(0, 2));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(2);
  // The inspector shows the photo's settings when no layer is selected.
  await page.getByRole('radio', { name: 'Black and white' }).click();
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await page.getByRole('button', { name: 'Apply this look to all photos' }).click();
  // Reorder from the keyboard: Alt + arrow.
  await strip(page).getByRole('button', { name: /Photo 1:/ }).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(strip(page).getByRole('button', { name: /Photo 1:/ })).toHaveAccessibleName(/diwali/);
  // Square format, then export.
  await page.getByRole('button', { name: /4:5 Portrait/ }).click();
  await page.getByRole('menuitem', { name: /1:1 · Square/ }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all (ZIP)' }).click();
  const zip = await download;
  const bytes = readFileSync(await zip.path());
  const names = [...bytes.toString('latin1').matchAll(/chitthi-instagram-1x1-\d\d\.jpg/g)].map((m) => m[0]);
  expect(new Set(names)).toEqual(new Set(['chitthi-instagram-1x1-01.jpg', 'chitthi-instagram-1x1-02.jpg']));
  const sof = bytes.indexOf(Buffer.from([0xff, 0xc0]));
  expect([bytes.readUInt16BE(sof + 5), bytes.readUInt16BE(sof + 7)]).toEqual([1080, 1080]);
});

test('posting prepares the photos first, then offers to share or save them; the caption counts', async ({ page }) => {
  await upload(page, SAMPLES.slice(0, 1));
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Caption').fill('Holi at home #holi #colours #india');
  await expect(page.getByText(/34 \/ 2200 characters · 3 \/ 30 hashtags/)).toBeVisible();
  await page.getByRole('button', { name: /Prepare 1 photo for Instagram/ }).click();
  await expect(page.getByRole('button', { name: /Share to Instagram|Save photos and open Instagram/ })).toBeVisible();
  await expect(page.getByText(/1 photo ready/)).toBeVisible();
});

test('the photo studio has no serious accessibility problems', async ({ page }) => {
  await upload(page, SAMPLES.slice(0, 2));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(2);
  await tool(page, 'Text').click();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
});
