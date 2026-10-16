/*
 * IPC registration for the main process. Every handler is reached only from Chitthi's own page (the app:// origin, or
 * the Vite dev server during development): a message from any other frame is refused before the handler runs.
 */
const { ipcMain } = require('electron');

const ORIGIN = 'app://chitthi';
const DEV_URL = process.env.CHITTHI_DEV_URL || '';

/**
 * Whether an IPC message comes from Chitthi's own page.
 * @param {Electron.IpcMainEvent | Electron.IpcMainInvokeEvent} event the message's event
 * @returns {boolean} true for the app:// page (or the dev server's page during development)
 */
function fromApp(event) {
  const url = (event.senderFrame && event.senderFrame.url) || '';
  // app:// isn't a special URL scheme, so its URL origin is "null": compare the prefix instead.
  if (url === ORIGIN || url.startsWith(`${ORIGIN}/`)) return true;
  if (!DEV_URL) return false;
  try {
    return new URL(url).origin === new URL(DEV_URL).origin;
  } catch {
    return false;
  }
}

/**
 * ipcMain.handle for the app's own page only.
 * @param {string} channel the IPC channel
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown} handler answers the message
 * @throws {Error} to the sender when the message isn't from the app's page
 */
function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromApp(event)) throw new Error('Not allowed.');
    return handler(event, ...args);
  });
}

/**
 * ipcMain.on for the app's own page only (a refused sync message gets null back, so the sender never hangs).
 * @param {string} channel the IPC channel
 * @param {(event: Electron.IpcMainEvent, ...args: any[]) => void} listener handles the message
 */
function on(channel, listener) {
  ipcMain.on(channel, (event, ...args) => {
    if (!fromApp(event)) {
      event.returnValue = null;
      return;
    }
    listener(event, ...args);
  });
}

module.exports = { handle, on };
