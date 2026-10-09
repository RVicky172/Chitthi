import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Layers on photos, and the video editor: timeline editing and MP4 export for Reels and YouTube.
const SAMPLES = ['holi-bowls.jpg', 'diwali.jpg', 'tea.jpg'].map((n) => path.join('public', 'samples', n));
const tool = (page: Page, name: string) => page.getByRole('navigation', { name: 'Tools' }).getByRole('button', { name, exact: true });
const layers = (page: Page) => page.getByRole('list', { name: 'Layers, front first' }).locator('li');
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
};

test.describe('photo layers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#/instagram');
    await page.locator('.mst-drop input[type=file]').setInputFiles(SAMPLES.slice(0, 1));
    await expect(page.locator('.mst-thumb')).toHaveCount(1);
  });

  test('adds text, shapes and stickers, edits them, and undoes', async ({ page }) => {
    await tool(page, 'Text').click();
    await page.getByRole('button', { name: 'Outline' }).click();
    await page.getByLabel('Text', { exact: true }).fill('Happy Holi');
    await tool(page, 'Elements').click();
    await page.getByRole('button', { name: 'Add speech bubble' }).click();
    await page.getByRole('button', { name: 'Add sticker 🪔' }).click();
    await tool(page, 'Layers').click();
    await expect(layers(page)).toHaveCount(3);
    await expect(layers(page).first()).toContainText('Sticker');
    await expect(page.getByRole('list', { name: 'Layers, front first' })).toContainText('Text: Happy Holi');
    await page.locator('.mst-canvas').focus();
    await page.keyboard.press('Delete');
    await expect(layers(page)).toHaveCount(2);
    await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
    await expect(layers(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Redo (Ctrl+Y)' }).click();
    await expect(layers(page)).toHaveCount(2);
  });

  test('draws on the photo and drags a layer', async ({ page }) => {
    await tool(page, 'Elements').click();
    await page.getByRole('button', { name: 'Add sticker 🎉' }).click();
    const cv = page.locator('.mst-canvas');
    await cv.scrollIntoViewIfNeeded();
    const b = (await cv.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.25, { steps: 5 });
    await page.mouse.up();
    await tool(page, 'Draw').click();
    await cv.scrollIntoViewIfNeeded();
    const d = (await cv.boundingBox())!;
    await page.mouse.move(d.x + 30, d.y + d.height * 0.8);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(d.x + 30 + i * (d.width / 20), d.y + d.height * 0.8 - i * 4);
    await page.mouse.up();
    await tool(page, 'Layers').click();
    await expect(layers(page)).toHaveCount(2);
    await expect(layers(page).first()).toContainText('Drawing (1 stroke)');
  });
});

/** A WAV file with a tone, for the music tests. */
function toneWav(seconds = 3, rate = 48000): Buffer {
  const n = seconds * rate,
    buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

/** Top-level MP4 boxes in order (a `free` box may follow `moov` when space was reserved for the index). */
function boxes(buf: Buffer): string[] {
  const out: string[] = [];
  for (let o = 0; o + 8 <= buf.length; ) {
    const size = buf.readUInt32BE(o);
    out.push(buf.toString('latin1', o + 4, o + 8));
    if (size < 8) break;
    o += size;
  }
  return out;
}
const tkhdSize = (mp4: Buffer) => {
  const i = mp4.indexOf(Buffer.from('tkhd'));
  return [mp4.readUInt32BE(i + 80) / 65536, mp4.readUInt32BE(i + 84) / 65536];
};

test.describe('video editor', () => {
  test.skip(({ isMobile }) => isMobile, 'Encoding runs once, at desktop size');

  test('makes a Reel with text and music, playable, exported as an Instagram-ready MP4', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto('./#/instagram');
    await page.getByRole('button', { name: /Reels & Shorts/ }).click();
    await expect(page).toHaveURL(/#\/instagram\/video$/);
    await page.locator('.mst-file input[type=file]').first().setInputFiles(SAMPLES.slice(0, 2));
    await expect(page.locator('.tl-clip')).toHaveCount(2);
    await tool(page, 'Text').click();
    await page.getByRole('button', { name: 'Classic' }).click();
    await page.getByLabel('Text', { exact: true }).fill('Festival memories');
    await tool(page, 'Audio').click();
    await page.locator('.mst-panel input[type=file]').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() });
    await expect(page.locator('.tl-bar-music')).toContainText('tone.wav');
    // Play a second.
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.locator('.tl-time b')).not.toHaveText('0:00.0');

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: /Export MP4/ }).click();
    const save = page.getByRole('button', { name: /Download MP4/ });
    await save.waitFor({ timeout: 90_000 });
    const dl = page.waitForEvent('download');
    await save.click();
    const mp4 = readFileSync(await (await dl).path());
    expect(boxes(mp4)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(mp4.toString('latin1')).toContain('avc1');
    expect(mp4.toString('latin1')).toContain('mp4a');
    expect(tkhdSize(mp4)).toEqual([1080, 1920]);
    expect(errors).toEqual([]);
  });

  test('edits on the timeline: trim by dragging, reorder by dragging, split, delete', async ({ page }) => {
    await page.goto('./#/instagram/video');
    await page.locator('.mst-file input[type=file]').first().setInputFiles(SAMPLES);
    const clips = page.locator('.tl-clip');
    await expect(clips).toHaveCount(3);
    await expect(page.locator('.tl-time')).toContainText('/ 0:09.0');
    // Trim: drag the first clip's end edge 1 s (60 px at the default zoom) to the right.
    const first = clips.first();
    await first.hover();
    const eb = (await first.getByRole('button', { name: 'Trim the end of clip 1' }).boundingBox())!;
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await page.mouse.down();
    await page.mouse.move(eb.x + eb.width / 2 + 60, eb.y + eb.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.tl-time')).toContainText('/ 0:10.0');
    // Reorder: drag clip 1 past clip 3.
    const names = async () => clips.evaluateAll((els) => els.map((e) => e.getAttribute('title')?.split(' ·')[0]));
    expect(await names()).toEqual(['holi-bowls.jpg', 'diwali.jpg', 'tea.jpg']);
    const fb = (await first.boundingBox())!;
    const lb = (await clips.last().boundingBox())!;
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width - 4, fb.y + fb.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(names).toEqual(['diwali.jpg', 'tea.jpg', 'holi-bowls.jpg']);
    // Split at the playhead with the keyboard: the playhead to 1.5 s, then S.
    await page.locator('.tl-scroll').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('s');
    await expect(clips).toHaveCount(4);
    // Undo the split, then delete the selected clip.
    await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
    await expect(clips).toHaveCount(3);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(clips).toHaveCount(2);
  });

  test('clips sit end to end on the timeline, where the track model places them', async ({ page }) => {
    await page.goto('./#/instagram/video');
    await page.locator('.mst-file input[type=file]').first().setInputFiles(SAMPLES);
    const clips = page.locator('.tl-clip');
    await expect(clips).toHaveCount(3);
    const lefts = await clips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    // Three 3 s photos at 60 px a second: each block starts 180 px after the one before (blocks are drawn 2 px narrower).
    for (let i = 1; i < lefts.length; i++) expect(lefts[i] - lefts[i - 1]).toBeCloseTo(180, 0);
  });

  test('exports a YouTube video, streamed straight into the chosen file', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    // Stand in for the browser's save picker: record every positioned write.
    await page.addInitScript(() => {
      const w = window as unknown as { __saved: number[]; showSaveFilePicker: unknown };
      w.__saved = [];
      w.showSaveFilePicker = async () => ({
        name: 'my-vlog.mp4',
        createWritable: async () => {
          let bytes = new Uint8Array(0);
          return {
            write: async (c: { position: number; data: Uint8Array }) => {
              const end = c.position + c.data.byteLength;
              if (end > bytes.length) {
                const grown = new Uint8Array(end);
                grown.set(bytes);
                bytes = grown;
              }
              bytes.set(c.data, c.position);
            },
            close: async () => {
              w.__saved = Array.from(bytes);
            },
            abort: async () => undefined,
          };
        },
      });
    });
    await page.goto('./#/instagram/youtube');
    await page.locator('.mst-file input[type=file]').first().setInputFiles(SAMPLES.slice(0, 2));
    await expect(page.locator('.tl-clip')).toHaveCount(2);
    // In the browser, 4K is offered for the desktop app only.
    await page.getByRole('button', { name: /16:9 Full HD 1080p/ }).click();
    await expect(page.getByRole('menuitem', { name: /4K 2160p.*desktop app/ })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.getByText(/written straight to that file/)).toBeVisible();
    await page.getByRole('button', { name: /Export MP4/ }).click();
    await expect(page.getByText('Saved: my-vlog.mp4')).toBeVisible({ timeout: 90_000 });
    const mp4 = Buffer.from(await page.evaluate(() => (window as unknown as { __saved: number[] }).__saved));
    // The index was written into the space reserved at the front: fast start without building the file in memory.
    expect(boxes(mp4).slice(0, 2)).toEqual(['ftyp', 'moov']);
    expect(boxes(mp4)).toContain('mdat');
    expect(tkhdSize(mp4)).toEqual([1920, 1080]);
    expect(errors).toEqual([]);
  });

  test('the video studio has no serious accessibility problems', async ({ page }) => {
    await page.goto('./#/instagram/video');
    await page.locator('.mst-file input[type=file]').first().setInputFiles(SAMPLES.slice(0, 2));
    await expect(page.locator('.tl-clip')).toHaveCount(2);
    // The timeline's trim handles are narrow drag targets; WCAG 2.5.8 allows that because the same trim is available
    // through full-size controls (the inspector's Starts at / Ends at sliders), so they are left out of this scan.
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('.tl-edge').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
});

test.describe('graphics card effects', () => {
  test.skip(({ isMobile }) => isMobile, 'Runs once, at desktop size');
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('chitthi-gpu-effects', '1'));
  });

  test('are on by default, and turning them off is remembered', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('chitthi-gpu-effects'));
    await page.goto('./#/studio/postcard');
    await page.keyboard.press('Control+K');
    await page.keyboard.type('Settings');
    await page.keyboard.press('Enter');
    const box = page.getByRole('checkbox', { name: /Use the graphics card for looks and colour/ });
    await expect(box).toBeChecked();
    await box.uncheck();
    expect(await page.evaluate(() => localStorage.getItem('chitthi-gpu-effects'))).toBe('0');
  });

  test('a photo with a look, and a Reel with a look, export without errors', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto('./#/instagram');
    await page.locator('.mst-drop input[type=file]').setInputFiles(SAMPLES.slice(0, 1));
    await page.getByRole('radio', { name: 'Hand-tinted' }).click();
    await page.locator('#ig-ex').fill('0.8');
    await page.locator('#ig-sh').fill('40');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const zip = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download all (ZIP)' }).click();
    expect(readFileSync(await (await zip).path()).toString('latin1')).toContain('chitthi-instagram-4x5-01.jpg');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Reels & Shorts/ }).click();
    await page.locator('.mst-file input[type=file]').first().setInputFiles(SAMPLES.slice(0, 2));
    await expect(page.locator('.tl-clip')).toHaveCount(2);
    await page.locator('.tl-clip').first().click({ position: { x: 20, y: 10 } });
    await page.getByRole('radiogroup', { name: 'Presets' }).getByRole('radio', { name: 'Vintage' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: /Export MP4/ }).click();
    const save = page.getByRole('button', { name: /Download MP4/ });
    await save.waitFor({ timeout: 90_000 });
    const dl = page.waitForEvent('download');
    await save.click();
    expect(boxes(readFileSync(await (await dl).path()))).toEqual(['ftyp', 'moov', 'mdat']);
    expect(errors).toEqual([]);
  });
});

// 201: one header per track on the video timeline: Hide (video) or Mute (music), Lock, and the track's height.
test.describe('video track headers', () => {
  const head = (page: Page, track: 'Video' | 'Music') => page.getByRole('group', { name: `${track} track` });
  const rowHeight = async (page: Page, row: string) => (await page.locator(`.tl-row.${row}`).boundingBox())!.height;
  /** Is the preview black at a few points? */
  const black = (page: Page) =>
    page.locator('.mst-canvas').evaluate((c: HTMLCanvasElement) => {
      const x = c.getContext('2d')!;
      return [0.25, 0.5, 0.75].every((k) => {
        const d = x.getImageData(Math.floor(c.width * k), Math.floor(c.height * k), 1, 1).data;
        return d[0] + d[1] + d[2] < 12;
      });
    });

  test.beforeEach(async ({ page }) => {
    // Records whether each sound started by playback is muted (the music plays through an <audio> outside the page).
    await page.addInitScript(() => {
      const w = window as unknown as { __plays: { audio: boolean; muted: boolean }[] };
      w.__plays = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        w.__plays.push({ audio: this instanceof HTMLAudioElement, muted: this.muted });
        return play.call(this);
      };
    });
    await page.goto('./#/instagram/video');
    await page.locator('.mst-file input[type=file]').first().setInputFiles(SAMPLES);
    await expect(page.locator('.tl-clip')).toHaveCount(3);
  });

  test('each track has a named header with Hide or Mute, Lock and Height, usable by keyboard', async ({ page }) => {
    const video = head(page, 'Video'),
      music = head(page, 'Music');
    for (const [g, name] of [
      [video, 'Hide Video'],
      [video, 'Lock Video'],
      [music, 'Mute Music'],
      [music, 'Lock Music'],
    ] as const)
      await expect(g.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(video.getByRole('button', { name: 'Mute Music' })).toHaveCount(0);
    await expect(music.getByRole('button', { name: 'Hide Video' })).toHaveCount(0);

    // Keyboard only: Space toggles, the height menu opens with Enter and moves with the arrow keys.
    await video.getByRole('button', { name: 'Lock Video', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(video.getByRole('button', { name: 'Lock Video', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(video.getByRole('button', { name: 'Lock Video', exact: true })).toHaveAttribute('aria-pressed', 'false');

    expect(await rowHeight(page, 'tl-video')).toBeCloseTo(64, 0);
    expect(await rowHeight(page, 'tl-music')).toBeCloseTo(64, 0);
    const height = video.getByRole('button', { name: 'Video track height' });
    await height.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Video track height' });
    await expect(menu.getByRole('menuitemradio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true');
    await expect(menu.getByRole('menuitemradio', { name: 'Medium' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitemradio', { name: 'Large' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(height).toBeFocused();
    expect(await rowHeight(page, 'tl-video')).toBeCloseTo(96, 0);
    // Home picks Small; Escape closes without a change.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Home');
    await expect(menu.getByRole('menuitemradio', { name: 'Small' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(await rowHeight(page, 'tl-video')).toBeCloseTo(96, 0);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    expect(await rowHeight(page, 'tl-video')).toBeCloseTo(40, 0);
    expect(await rowHeight(page, 'tl-music')).toBeCloseTo(64, 0);
  });

  test('Hide shows black in the preview, Mute silences the music; both undo and redo', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Pointer drags and playback: at desktop size');
    const errors = watchErrors(page);
    await tool(page, 'Audio').click();
    await page.locator('.mst-panel input[type=file]').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: toneWav() });
    await expect(page.locator('.tl-bar-music')).toContainText('tone.wav');
    await page.locator('.tl-ruler').click({ position: { x: 90, y: 10 } });
    expect(await black(page)).toBe(false);

    const hide = head(page, 'Video').getByRole('button', { name: 'Hide Video', exact: true });
    await hide.click();
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => black(page)).toBe(true);
    await page.keyboard.press('Control+z');
    await expect(hide).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => black(page)).toBe(false);
    await page.keyboard.press('Control+y');
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await hide.click();

    const mute = head(page, 'Music').getByRole('button', { name: 'Mute Music', exact: true });
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    const lastMusic = () => page.evaluate(() => (window as unknown as { __plays: { audio: boolean; muted: boolean }[] }).__plays.filter((p) => p.audio).at(-1)?.muted);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(lastMusic).toBe(true);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.keyboard.press('Control+z');
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(lastMusic).toBe(false);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    expect(errors).toEqual([]);
  });

  test('a locked track refuses drags, trims, splits, duplicates and deletes, and says why; the height survives undo', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Pointer drags and playback: at desktop size');
    const clips = page.locator('.tl-clip');
    const names = () => clips.evaluateAll((els) => els.map((e) => e.getAttribute('title')?.split(' ·')[0]));
    const before = await names();
    const lock = head(page, 'Video').getByRole('button', { name: 'Lock Video', exact: true });
    await lock.click();
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    // The height is a view setting: undoing the lock leaves it.
    await head(page, 'Video').getByRole('button', { name: 'Video track height' }).click();
    await page.getByRole('menuitemradio', { name: 'Large' }).click();
    expect(await rowHeight(page, 'tl-video')).toBeCloseTo(96, 0);
    const locked = 'The Video track is locked. Unlock it to change its clips.';

    // Drag clip 1 past clip 3: nothing moves.
    const fb = (await clips.first().boundingBox())!,
      lb = (await clips.last().boundingBox())!;
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width - 5, fb.y + fb.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(await names()).toEqual(before);
    await expect(page.locator('#toast')).toHaveText(locked);
    // Trim the end of clip 1: the length stays.
    await clips.first().hover();
    const eb = (await clips.first().getByRole('button', { name: 'Trim the end of clip 1' }).boundingBox())!;
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await page.mouse.down();
    await page.mouse.move(eb.x + eb.width / 2 + 60, eb.y + eb.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.tl-time')).toContainText('/ 0:09.0');
    // Split (S), Delete key, Duplicate and Delete buttons: refused with the reason.
    await page.locator('.tl-ruler').click({ position: { x: 90, y: 10 } });
    await page.locator('.tl-scroll').focus();
    await page.keyboard.press('s');
    await expect(page.locator('#toast')).toHaveText(locked);
    await page.keyboard.press('Delete');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('#toast')).toHaveText(locked);
    await expect(clips).toHaveCount(3);
    expect(await names()).toEqual(before);

    // It still plays.
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.locator('.tl-time b')).not.toHaveText('0:01.5');

    // Undo unlocks (a step); the height stays Large.
    await page.keyboard.press('Control+z');
    await expect(lock).toHaveAttribute('aria-pressed', 'false');
    expect(await rowHeight(page, 'tl-video')).toBeCloseTo(96, 0);
    await page.keyboard.press('Control+y');
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
  });

  test('the headers have no serious accessibility problems and fit a 360 px screen', async ({ page }) => {
    await head(page, 'Video').getByRole('button', { name: 'Lock Video', exact: true }).click();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).include('.tl').exclude('.tl-edge').analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    await page.setViewportSize({ width: 360, height: 780 });
    for (const name of ['Hide Video', 'Lock Video', 'Video track height']) await expect(head(page, 'Video').getByRole('button', { name, exact: true })).toBeVisible();
    for (const name of ['Mute Music', 'Lock Music', 'Music track height']) await expect(head(page, 'Music').getByRole('button', { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
