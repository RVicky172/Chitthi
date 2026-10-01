/*
 * IPC registration for the main process. Every handler is reached only from Chitthi's own page (the app:// origin, or
 * the Vite dev server during development): a message from any other frame is refused before the handler runs.
 */
const { ipcMain } = require('electron');

const ORIGIN = 'app://chitthi';
const DEV_URL = process.env.CHITTHI_DEV_URL || '';

function fromApp(e) {
  const url = (e.senderFrame && e.senderFrame.url) || '';
  // app:// isn't a special URL scheme, so its URL origin is "null": compare the prefix instead.
  if (url === ORIGIN || url.startsWith(`${ORIGIN}/`)) return true;
  if (!DEV_URL) return false;
  try {
    return new URL(url).origin === new URL(DEV_URL).origin;
  } catch {
    return false;
  }
}

/** ipcMain.handle for the app's own page only. */
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromApp(e)) throw new Error('Not allowed.');
    return fn(e, ...args);
  });
}

/** ipcMain.on for the app's own page only (a refused sync message gets null back, so the sender never hangs). */
function on(channel, fn) {
  ipcMain.on(channel, (e, ...args) => {
    if (!fromApp(e)) {
      e.returnValue = null;
      return;
    }
    fn(e, ...args);
  });
}

module.exports = { handle, on };
