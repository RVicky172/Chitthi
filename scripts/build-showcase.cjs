/*
 * Renders the landing page examples (src/data/showcase.ts) with the real engine, running in Electron against the
 * Vite dev server, and writes public/showcase/*.webp plus src/data/showcase.json. Run through build-showcase.mjs.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'showcase');
const URL = process.env.CHITTHI_DEV_URL || 'http://localhost:5173/';

app.whenReady().then(async () => {
  app.on('window-all-closed', () => undefined);
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000 });
  try {
    // The app rewrites the URL hash as it starts, which reports the load as aborted: that's fine.
    await win.loadURL(`${URL}?showcase`).catch((e) => {
      if (!String(e && e.message).includes('ERR_ABORTED')) throw e;
    });
    // Wait for the dev-only renderer module to install itself.
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript('typeof window.__chitthiQuoteDocs === "function"')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (process.env.CHITTHI_TASK === 'quote') {
      // Print-shop documents instead of the landing images.
      const docs = await win.webContents.executeJavaScript('window.__chitthiQuoteDocs()');
      const dir = path.join(root, 'docs', 'print-quote');
      fs.mkdirSync(dir, { recursive: true });
      for (const d of docs) {
        const buf = Buffer.from(d.data, 'base64');
        fs.writeFileSync(path.join(dir, d.name), buf);
        console.log(`  docs/print-quote/${d.name}  ${Math.round(buf.length / 1024)} KB`);
      }
      app.quit();
      return;
    }
    const res = await win.webContents.executeJavaScript('window.__chitthiShowcase()');
    // Clear old renders but keep the folder: on Windows a watched folder can't be re-created straight away.
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(out)) if (f.endsWith('.webp')) fs.rmSync(path.join(out, f), { force: true });
    let bytes = 0;
    for (const f of res.files) {
      const buf = Buffer.from(f.data, 'base64');
      bytes += buf.length;
      fs.writeFileSync(path.join(out, f.name), buf);
      console.log(`  public/showcase/${f.name}  ${Math.round(buf.length / 1024)} KB`);
    }
    fs.writeFileSync(path.join(root, 'src', 'data', 'showcase.json'), JSON.stringify(res.manifest, null, 2) + '\n');
    console.log(`Wrote ${res.files.length} images (${Math.round(bytes / 1024)} KB) and src/data/showcase.json.`);
  } catch (e) {
    console.error('Showcase render failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }
  app.quit();
});
