import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The photo studio: batch, editing, export and posting.
const SAMPLES = ['wheat-fields.jpg', 'diwali.jpg', 'holi-bowls.jpg', 'lotus.jpg', 'tea.jpg'].map((n) => path.join('public', 'samples', n));
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

test('light and white balance: sliders, and the eyedropper sets temperature and tint from a click', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await upload(page, SAMPLES.slice(2, 3));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(1);
  for (const id of ['ex', 'hi', 'sh', 'wh', 'bl', 'te', 'ti']) await expect(page.locator(`#ig-${id}`)).toBeVisible();
  await expect(page.getByRole('slider', { name: /^Exposure/ })).toBeVisible();
  await page.locator('#ig-ex').fill('1.5');
  await expect(page.locator('label[for="ig-ex"] output')).toHaveText('1.50');
  // Eyedropper: pick, click the photo, and the white balance moves off zero.
  await page.getByRole('button', { name: 'Pick a neutral grey' }).click();
  await expect(page.locator('.mst-canvas')).toHaveClass(/picking/);
  await expect(page.locator('.mst-canvas')).toBeInViewport();
  const cv = (await page.locator('.mst-canvas').boundingBox())!;
  await page.locator('.mst-canvas').click({ position: { x: cv.width * 0.5, y: cv.height * 0.55 } });
  await expect(page.locator('.mst-canvas')).not.toHaveClass(/picking/);
  const wb = await page.locator('label[for="ig-te"] output, label[for="ig-ti"] output').allTextContents();
  expect(wb.some((v) => v !== '0')).toBe(true);
  // One undo step takes the eyedropper back.
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await expect(page.locator('label[for="ig-te"] output')).toHaveText('0');
  await expect(page.locator('label[for="ig-ti"] output')).toHaveText('0');
  // Escape cancels picking.
  await page.getByRole('button', { name: 'Pick a neutral grey' }).click();
  await page.locator('.mst-canvas').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mst-canvas')).not.toHaveClass(/picking/);
  expect(errors).toEqual([]);
});

test('tone curve works from the keyboard, and the colour mixer changes the photo', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await upload(page, SAMPLES.slice(1, 2));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(1);
  const shot = () => page.locator('.mst-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const before = await shot();

  const curve = page.getByRole('group', { name: /^Tone curve, RGB/ });
  await expect(curve).toBeVisible();
  // Lift the black point with the keyboard.
  const first = curve.getByRole('button', { name: /^Point 1 of 2/ });
  await first.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect(first).toHaveAccessibleName(/output 30/);
  // Add a point, nudge it, then delete it.
  await page.getByRole('button', { name: 'Add point' }).click();
  const mid = curve.getByRole('button', { name: /^Point 2 of 3/ });
  await mid.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Delete');
  await expect(curve.getByRole('button', { name: /^Point \d of 2/ })).toHaveCount(2);
  await expect.poll(shot).not.toBe(before);
  // A click in the middle of the graph adds a point there (input and output about 128).
  await page.getByRole('button', { name: 'Reset RGB' }).click();
  const box = (await curve.boundingBox())!;
  await curve.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const name = (await curve.getByRole('button', { name: /^Point 2 of 3/ }).getAttribute('aria-label'))!;
  const [, inp, out] = /input (\d+), output (\d+)/.exec(name)!.map(Number);
  expect(Math.abs(inp - 128)).toBeLessThan(6);
  expect(Math.abs(out - 128)).toBeLessThan(6);
  // Other channels have their own curve.
  await page.getByRole('group', { name: 'Curve channel' }).getByRole('button', { name: 'Red' }).click();
  await expect(page.getByRole('group', { name: /^Tone curve, Red/ })).toBeVisible();
  await page.getByRole('button', { name: 'Reset Red' }).isDisabled();

  // Colour mixer: saturation of the oranges down; the photo changes; reset brings the slider back.
  await page.getByRole('group', { name: 'Colour mixer setting' }).getByRole('button', { name: 'Saturation' }).click();
  const afterCurve = await shot();
  await page.locator('#ig-mix-sat-orange').fill('-80');
  await expect(page.locator('label[for="ig-mix-sat-orange"] output')).toHaveText('-80');
  await expect.poll(shot).not.toBe(afterCurve);
  await page.getByRole('button', { name: 'Reset saturation' }).click();
  await expect(page.locator('label[for="ig-mix-sat-orange"] output')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('detail and effects: sharpening with its radius, noise reduction, clarity, dehaze and grain, exported', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await upload(page, SAMPLES.slice(0, 1));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(1);
  const shot = () => page.locator('.mst-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  // Radius and masking appear once sharpening is on; a double-click puts the radius back to 1 px.
  await expect(page.locator('#ig-sr')).toHaveCount(0);
  await page.locator('#ig-sp').fill('60');
  await page.locator('#ig-sr').fill('2.5');
  await expect(page.locator('label[for="ig-sr"] output')).toHaveText('2.50');
  await page.locator('#ig-sr').dblclick();
  await expect(page.locator('label[for="ig-sr"] output')).toHaveText('1.00');
  for (const [id, v] of [['ig-nr', '50'], ['ig-cl', '60'], ['ig-dh', '40'], ['ig-gr', '50']] as const) {
    const before = await shot();
    await page.locator(`#${id}`).fill(v);
    await expect.poll(shot, { message: `${id} changes the photo` }).not.toBe(before);
  }
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const zip = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all (ZIP)' }).click();
  expect(readFileSync(await (await zip).path()).toString('latin1')).toContain('chitthi-instagram-4x5-01.jpg');
  expect(errors).toEqual([]);
});

test('presets and LUTs: a .cube file is imported, applied by amount, kept on the device and removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await upload(page, SAMPLES.slice(2, 3));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(1);
  const shot = () => page.locator('.mst-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const original = await shot();
  // The built-in looks are presets now.
  const presets = page.getByRole('radiogroup', { name: 'Presets' });
  await presets.getByRole('radio', { name: 'Warm' }).click();
  await expect(presets.getByRole('radio', { name: 'Warm' })).toHaveAttribute('aria-checked', 'true');
  await presets.getByRole('radio', { name: 'Original' }).click();

  const cubeInput = page.locator('.ig-lut input[type=file]');
  // Not a 3D LUT: refused, with the reason.
  await cubeInput.setInputFiles({ name: 'curve.cube', mimeType: 'text/plain', buffer: Buffer.from('LUT_1D_SIZE 2\n0 0 0\n1 1 1\n') });
  await expect(page.getByText(/That LUT can’t be used\. This is a 1D LUT/)).toBeVisible();
  // A 2³ table that swaps red and blue.
  const rows: string[] = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) rows.push(`${b} ${g} ${r}`);
  await cubeInput.setInputFiles({ name: 'swap.cube', mimeType: 'text/plain', buffer: Buffer.from(`TITLE "Swap red and blue"\nLUT_3D_SIZE 2\n${rows.join('\n')}\n`) });
  const select = page.getByLabel('LUT', { exact: true });
  await expect(select.locator('option:checked')).toHaveText('Swap red and blue');
  await expect.poll(shot).not.toBe(original);
  // Amount 0 is the photo as it was; a double-click puts it back to 100.
  await page.locator('#ig-lutamt').fill('0');
  await expect.poll(shot).toBe(original);
  await page.locator('#ig-lutamt').dblclick();
  await expect(page.locator('label[for="ig-lutamt"] output')).toHaveText('100');

  // Kept on this device: after a reload it is still in the list and applies again.
  await page.reload();
  await upload(page, SAMPLES.slice(2, 3));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(1);
  const fresh = await shot();
  await select.selectOption({ label: 'Swap red and blue' });
  await expect.poll(shot).not.toBe(fresh);
  await page.getByRole('button', { name: 'Remove this LUT from the device' }).click();
  await expect(select.locator('option')).toHaveText(['None']);
  await expect.poll(shot).toBe(fresh);
  expect(errors).toEqual([]);
});

test('saved presets: save, rename, export, kept after a reload, applied to all photos, deleted and imported', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => void d.accept());
  await upload(page, SAMPLES.slice(0, 1));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(1);
  const exposure = page.locator('label[for="ig-ex"] output');
  const presets = page.getByRole('radiogroup', { name: 'Presets' });

  await page.locator('#ig-ex').fill('1');
  await page.locator('#ig-ct').fill('25');
  await expect(page.getByRole('button', { name: 'Save as preset' })).toBeDisabled();
  await page.getByLabel('New preset name').fill('  Bright   day ');
  await page.getByRole('button', { name: 'Save as preset' }).click();
  await expect(presets.getByRole('radio', { name: 'Bright day' })).toHaveAttribute('aria-checked', 'true');
  // Moving a slider leaves the preset's settings: no longer shown as applied.
  await page.locator('#ig-ct').fill('0');
  await expect(presets.getByRole('radio', { name: 'Bright day' })).toHaveAttribute('aria-checked', 'false');

  // Rename in the manager (Enter commits).
  await page.getByText(/^Your presets \(1\)$/).click();
  const nameField = page.getByLabel('Name of preset Bright day');
  await nameField.fill('Bright noon');
  await nameField.press('Enter');
  await expect(presets.getByRole('radio', { name: 'Bright noon' })).toBeVisible();

  // Export: a preset file with the preset in it.
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export presets' }).click();
  const file = await (await dl).path();
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format).toBe('chitthi-presets');
  expect(json.presets[0]).toMatchObject({ name: 'Bright noon', adjust: { exposure: 1, contrast: 25 } });

  // Kept on this device: after a reload, apply it to a whole batch at once.
  await page.reload();
  await upload(page, SAMPLES.slice(1, 3));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(2);
  await expect(exposure).toHaveText('0.00');
  await page.getByText(/^Your presets \(1\)$/).click();
  await page.getByRole('button', { name: 'Apply Bright noon to all photos' }).click();
  await expect(exposure).toHaveText('1.00');
  await strip(page).getByRole('button', { name: /Photo 1:/ }).click();
  await expect(exposure).toHaveText('1.00');
  await expect(page.locator('label[for="ig-ct"] output')).toHaveText('25');

  // Delete it (after confirming), then bring it back from the file; a second import adds nothing.
  await page.getByRole('button', { name: 'Delete preset Bright noon' }).click();
  await expect(presets.getByRole('radio', { name: 'Bright noon' })).toHaveCount(0);
  await expect(page.getByText(/^Your presets \(0\)$/)).toBeVisible();
  const importer = page.locator('.ig-presets input[type=file]');
  await importer.setInputFiles(file);
  await expect(page.getByText('1 preset added.')).toBeVisible();
  await expect(presets.getByRole('radio', { name: 'Bright noon' })).toBeVisible();
  await importer.setInputFiles(file);
  await expect(page.getByText('0 presets added, 1 already here.')).toBeVisible();
  await importer.setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"designs": []}') });
  await expect(page.getByText(/Those presets can’t be imported\. This isn’t a Chitthi Studio preset file/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('masks: a brush mask brightens only where it is painted, can be erased, switched off and undone', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await upload(page, SAMPLES.slice(0, 1));
  await expect(strip(page).locator('.mst-thumb')).toHaveCount(1);
  const canvas = page.locator('.mst-canvas');
  const shot = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  /** Mean brightness of a 9×9 patch at a share of the canvas. */
  const lum = (x: number, y: number) =>
    canvas.evaluate(
      (c: HTMLCanvasElement, [x, y]) => {
        const d = c.getContext('2d')!.getImageData(Math.round(c.width * x) - 4, Math.round(c.height * y) - 4, 9, 9).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
        return s / (d.length / 4) / 3;
      },
      [x, y],
    );
  const before = { mid: await lum(0.5, 0.5), corner: await lum(0.15, 0.15) };
  const original = await shot();

  await tool(page, 'Masks').click();
  await page.getByRole('button', { name: 'New brush mask' }).click();
  await expect(page.getByRole('button', { name: 'Mask 1', pressed: true })).toBeVisible();
  // Paint a stroke across the middle (on a phone the photo sits above the panel: bring it into view first).
  const paint = async () => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.05), box.y + box.height * 0.5);
    await page.mouse.up();
  };
  await paint();
  await expect(page.getByRole('button', { name: /Brush 1 · 1 stroke$/ })).toBeVisible();
  // The overlay shows the mask; without it, the photo is unchanged until the mask has settings.
  await expect.poll(shot).not.toBe(original);
  await page.getByText('Show the mask in red').click();
  await expect.poll(shot).toBe(original);

  await page.locator('#mk-exposure').fill('2');
  await expect.poll(() => lum(0.5, 0.5)).toBeGreaterThan(before.mid + 20);
  expect(Math.abs((await lum(0.15, 0.15)) - before.corner)).toBeLessThan(1);
  const brightened = await lum(0.5, 0.5);

  // Erasing the same line takes it away again.
  await page.getByRole('group', { name: 'Brush mode' }).getByRole('button', { name: 'Erase' }).click();
  await paint();
  await expect(page.getByRole('button', { name: /Brush 1 · 2 strokes$/ })).toBeVisible();
  await expect.poll(() => lum(0.5, 0.5)).toBeLessThan(brightened - 20);
  // Undo brings the erased stroke back; switching the mask off shows the photo as it was.
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: /Brush 1 · 1 stroke$/ })).toBeVisible();
  await expect.poll(() => lum(0.5, 0.5)).toBeGreaterThan(before.mid + 20);
  await page.getByLabel('Apply Mask 1').uncheck();
  await expect.poll(shot).toBe(original);

  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  expect(errors).toEqual([]);
});
