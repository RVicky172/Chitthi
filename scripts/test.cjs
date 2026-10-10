/*
 * Runs the self-test suite (src/dev/selftest.ts) in Electron against the dev server started by scripts/test.mjs, and
 * exits with 1 when any check fails. Run through `npm test`.
 */
const { app, BrowserWindow } = require('electron');

const URL = process.env.CHITTHI_TEST_URL;

app.whenReady().then(async () => {
  app.on('window-all-closed', () => undefined);
  const win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: { backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' && !String(e.message).includes('Electron Security Warning')) errors.push(e.message);
  });
  let code;
  try {
    const only = process.env.CHITTHI_TEST_ONLY ? `&only=${encodeURIComponent(process.env.CHITTHI_TEST_ONLY)}` : '';
    await win.loadURL(`${URL}?selftest${only}`).catch((e) => {
      if (!String(e && e.message).includes('ERR_ABORTED')) throw e;
    });
    for (let i = 0; i < 150; i++) {
      if (await win.webContents.executeJavaScript('typeof window.__chitthiSelfTest === "function"')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const started = Date.now();
    const r = await win.webContents.executeJavaScript('window.__chitthiSelfTest()');
    for (const n of r.notes) console.log(`  ${n}`);
    if (errors.length) r.failed.push(...errors.slice(0, 10).map((m) => `console error: ${m}`));
    console.log(`  ${r.passed} checks passed, ${r.failed.length} failed (${Math.round((Date.now() - started) / 1000)} s)`);
    for (const f of r.failed.slice(0, 50)) console.log(`  ✗ ${f}`);
    code = r.failed.length ? 1 : 0;
  } catch (e) {
    console.error('Self-test could not run:', e && e.message ? e.message : e);
    code = 1;
  }
  app.exit(code);
});
