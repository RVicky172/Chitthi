/*
 * Renders every favicon and app icon from the SVG sources in public/favicon/ (written by build-favicons.mjs):
 *
 *   npm run build:favicons
 *
 * Runs inside Electron (already a dev dependency) so no extra image tools are needed. Writes PNGs and a
 * multi-size favicon.ico to public/favicon/, and the 1024 px desktop app icon to build/icon.png.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'public', 'favicon');
const svg = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

/** [output file, source svg, size, inset (0–1 of the canvas), transparent background] */
const JOBS = [
  ['favicon-16.png', 'favicon.svg', 16, 0, true],
  ['favicon-32.png', 'favicon.svg', 32, 0, true],
  ['favicon-48.png', 'favicon.svg', 48, 0, true],
  ['icon-192.png', 'logo.svg', 192, 0, true],
  ['icon-512.png', 'logo.svg', 512, 0, true],
  // Home-screen icons are masked by the OS: full-bleed art with the logo inside the safe zone.
  ['apple-touch-icon.png', 'maskable.svg', 180, 0, false],
  ['maskable-192.png', 'maskable.svg', 192, 0, false],
  ['maskable-512.png', 'maskable.svg', 512, 0, false],
  // macOS / Windows app icon: the rounded tile inset on a 1024 canvas, as on the macOS icon grid.
  ['../../build/icon.png', 'logo.svg', 1024, 0.1, true],
];

/** ICO container holding PNG images (supported by every current browser and Windows). */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(buf.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(([, b]) => b)]);
}

/** Draws the SVG onto a canvas inside the page and reads the PNG back: no screen capture, exact pixels. */
async function render(win, source, size, inset, transparent) {
  const pad = Math.round(size * inset);
  const url = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
  const data = await win.webContents.executeJavaScript(`new Promise((ok, fail) => {
    const img = new Image();
    img.onload = async () => {
      // Give the fonts embedded in the SVG a moment, then draw.
      await img.decode().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 250));
      const cv = document.createElement('canvas');
      cv.width = cv.height = ${size};
      const c = cv.getContext('2d');
      ${transparent ? '' : "c.fillStyle = '#5f3a22'; c.fillRect(0, 0, " + size + ', ' + size + ');'}
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, ${pad}, ${pad}, ${size - 2 * pad}, ${size - 2 * pad});
      ok(cv.toDataURL('image/png'));
    };
    img.onerror = () => fail(new Error('svg failed to load'));
    img.src = ${JSON.stringify(url)};
  })`);
  return Buffer.from(data.split(',')[1], 'base64');
}

app.whenReady().then(async () => {
  app.on('window-all-closed', () => undefined);
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<!doctype html><title>icons</title>');
  for (const [file, source, size, inset, transparent] of JOBS) {
    const png = await render(win, svg(source), size, inset, transparent);
    fs.writeFileSync(path.join(dir, file), png);
    console.log(`  ${path.relative(root, path.join(dir, file))}  ${size}×${size}`);
  }
  fs.writeFileSync(path.join(dir, 'favicon.ico'), ico([16, 32, 48].map((s) => [s, fs.readFileSync(path.join(dir, `favicon-${s}.png`))])));
  console.log('  public/favicon/favicon.ico  16, 32, 48');
  app.quit();
});
