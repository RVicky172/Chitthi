/*
 * Renders the print samples (src/data/printSamples.ts) with the real export engine, running in Electron against the
 * Vite dev server, into "Print Samples/": postcards, calendars, envelopes, the order sheet and the quote documents.
 * Run through build-print-samples.mjs. Files are pulled from the page one at a time (a calendar is hundreds of MB).
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'Print Samples');
const URL = process.env.CHITTHI_DEV_URL || 'http://localhost:5173/';

app.whenReady().then(async () => {
  app.on('window-all-closed', () => undefined);
  const win = new BrowserWindow({ show: false, width: 1400, height: 1000 });
  const js = (code) => win.webContents.executeJavaScript(code);
  let total = 0;
  const save = async (rel) => {
    const buf = Buffer.from(await js(`window.__chitthiPrintSamples.take(${JSON.stringify(rel)})`), 'base64');
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    total += buf.length;
  };
  try {
    // The app rewrites the URL hash as it starts, which reports the load as aborted: that's fine.
    await win.loadURL(`${URL}?printsamples`).catch((e) => {
      if (!String(e && e.message).includes('ERR_ABORTED')) throw e;
    });
    for (let i = 0; i < 100; i++) {
      if (await js('typeof window.__chitthiPrintSamples === "object"')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    // Clear old files but keep the folders: on Windows a folder that is open or watched can't be removed.
    const clear = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          clear(p);
          try {
            fs.rmdirSync(p);
          } catch {
            /* still open somewhere: leave the empty folder */
          }
        } else fs.rmSync(p, { force: true });
      }
    };
    for (const dir of ['01-Postcards', '02-Calendars', '03-Envelopes']) clear(path.join(out, dir));
    fs.mkdirSync(out, { recursive: true });

    const samples = await js('window.__chitthiPrintSamples.samples()');
    for (let i = 0; i < samples.length; i++) {
      const before = total;
      const files = await js(`window.__chitthiPrintSamples.renderSample(${i})`);
      for (const f of files) await save(f);
      console.log(`  ${samples[i]}  ${files.length} files, ${Math.round((total - before) / 1048576)} MB`);
    }
    const envs = await js('window.__chitthiPrintSamples.envelopes()');
    for (let i = 0; i < envs.length; i++) {
      const files = await js(`window.__chitthiPrintSamples.renderEnvelope(${i})`);
      for (const f of files) await save(f);
      console.log(`  ${envs[i]}  ${files.length} files`);
    }
    for (const f of await js(`window.__chitthiPrintSamples.renderExtras(${JSON.stringify(envs)})`)) await save(f);
    console.log(`Wrote "Print Samples/" (${Math.round(total / 1048576)} MB).`);
  } catch (e) {
    console.error('Print sample render failed:', e && e.message ? e.message : e);
    process.exitCode = 1;
  }
  app.quit();
});
