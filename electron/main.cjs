/*
 * Chitthi desktop – Electron main process.
 *
 * The renderer is the same React app as the web build (dist/), served from a private app:// origin with a strict
 * Content Security Policy. It runs sandboxed without Node; everything native (file dialogs, the on-disk library,
 * menus, updates) goes through the small bridge in preload.cjs.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;

const DEV_URL = process.env.CHITTHI_DEV_URL || ''; // set by electron/dev.mjs
const isMac = process.platform === 'darwin';
const ORIGIN = 'app://chitthi';
const DIST = path.join(__dirname, '..', 'dist');
const FONTS = app.isPackaged ? path.join(process.resourcesPath, 'fonts') : path.join(__dirname, 'resources', 'fonts');
const hasLocalFonts = () => !DEV_URL && fs.existsSync(path.join(FONTS, 'ui.css'));

/* ------------------------------------------------------------------ app:// origin */

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

// Google Fonts stay allowed as a fallback for builds made without `npm run fetch:fonts`.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Pexels photo search (with the user's own key) and the photos it downloads.
  "img-src 'self' data: blob: https://images.pexels.com",
  "connect-src 'self' data: blob: https://api.pexels.com https://images.pexels.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ');

function serveApp() {
  protocol.handle('app', async (req) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    let root = DIST;
    if (rel.startsWith('fonts/')) {
      root = FONTS;
      rel = rel.slice('fonts/'.length);
    }
    if (!rel) rel = 'index.html';
    const file = path.resolve(root, rel);
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
    try {
      const body = await fsp.readFile(file);
      const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' };
      if (file.endsWith('.html')) headers['Content-Security-Policy'] = CSP;
      return new Response(body, { status: 200, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

/* ------------------------------------------------------------------ on-disk library (desktop storage) */
// userData/library/{designs,photos}/<id>.json and work.json. The browser build keeps IndexedDB.

const LIB = () => path.join(app.getPath('userData'), 'library');
const dir = (name) => path.join(LIB(), name);
const safeId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value));
  await fsp.rename(tmp, file);
}
async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}
async function readAll(folder) {
  let names = [];
  try {
    names = (await fsp.readdir(dir(folder))).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const items = await Promise.all(names.map((n) => readJson(path.join(dir(folder), n))));
  return items.filter((x) => x && typeof x === 'object');
}
function requireId(id) {
  if (!safeId(id)) throw new Error('Invalid id');
  return id;
}

function registerStorage() {
  ipcMain.handle('db:all', () => readAll('designs'));
  ipcMain.handle('db:get', (_e, id) => readJson(path.join(dir('designs'), `${requireId(id)}.json`)));
  ipcMain.handle('db:put', (_e, rec) => writeJson(path.join(dir('designs'), `${requireId(rec && rec.id)}.json`), rec));
  ipcMain.handle('db:del', (_e, id) => fsp.rm(path.join(dir('designs'), `${requireId(id)}.json`), { force: true }));
  ipcMain.handle('db:getWorkPhotos', async () => (await readJson(path.join(LIB(), 'work.json'))) || []);
  ipcMain.handle('db:putWorkPhotos', (_e, photos) => writeJson(path.join(LIB(), 'work.json'), Array.isArray(photos) ? photos : []));
  ipcMain.handle('db:libAll', () => readAll('photos'));
  ipcMain.handle('db:libPut', (_e, p) => writeJson(path.join(dir('photos'), `${requireId(p && p.id)}.json`), p));
  ipcMain.handle('db:libDel', (_e, id) => fsp.rm(path.join(dir('photos'), `${requireId(id)}.json`), { force: true }));
}

/* ------------------------------------------------------------------ files: save / open / reveal */

const savedPaths = new Set();
let lastDir = null;

function extFilter(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const label = { zip: 'Print pack', pdf: 'PDF', png: 'PNG image', json: 'Gallery backup', chitthi: 'Chitthi design' }[ext] || 'File';
  return ext ? [{ name: label, extensions: [ext] }] : [];
}

function registerFiles() {
  ipcMain.handle('desktop:saveFile', async (e, name, data) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const safeName = path.basename(String(name || 'chitthi-file'));
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(lastDir || app.getPath('documents'), safeName),
      filters: extFilter(safeName),
    });
    if (canceled || !filePath) return null;
    await fsp.writeFile(filePath, Buffer.from(data));
    lastDir = path.dirname(filePath);
    savedPaths.add(filePath);
    return filePath;
  });
  // Only files this session saved can be revealed: the renderer can't probe arbitrary paths.
  ipcMain.handle('desktop:showInFolder', (_e, p) => {
    if (savedPaths.has(p)) shell.showItemInFolder(p);
  });
  ipcMain.handle('desktop:openExternal', (_e, url) => openExternal(url));
  ipcMain.handle('desktop:openDesignFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Chitthi design or backup', extensions: ['chitthi', 'json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return readDesignFile(filePaths[0]);
  });
  ipcMain.on('desktop:info', (e) => {
    e.returnValue = { version: app.getVersion(), platform: process.platform, localFonts: hasLocalFonts() };
  });
}

async function readDesignFile(file) {
  const stat = await fsp.stat(file);
  if (stat.size > 200 * 1024 * 1024) throw new Error('That file is too large to be a Chitthi design.');
  return { name: path.basename(file), text: await fsp.readFile(file, 'utf8') };
}

function openExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'mailto:') return shell.openExternal(u.toString());
  } catch {
    /* ignore malformed */
  }
}

/* ------------------------------------------------------------------ window */

let win = null;
let pendingFile = null; // a .chitthi path passed at launch, opened once the page has loaded

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return {};
  }
}
function saveWindowState() {
  if (!win) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* not critical */
  }
}

function createWindow() {
  const s = loadWindowState();
  win = new BrowserWindow({
    width: s.width || 1400,
    height: s.height || 900,
    x: s.x,
    y: s.y,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Chitthi',
    backgroundColor: '#f4f7fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (s.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', saveWindowState);
  win.on('closed', () => {
    win = null;
  });

  // Stay on our own origin: links out open in the system browser; stray file drops never navigate away.
  const own = (url) => url.startsWith(ORIGIN) || (DEV_URL && url.startsWith(DEV_URL));
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!own(url)) {
      e.preventDefault();
      openExternal(url);
    }
  });
  win.webContents.on('did-finish-load', () => {
    if (pendingFile) {
      const f = pendingFile;
      pendingFile = null;
      sendOpenFile(f);
    }
  });

  win.loadURL(DEV_URL || `${ORIGIN}/index.html`);
}

async function sendOpenFile(file) {
  if (!win) {
    pendingFile = file;
    return;
  }
  try {
    win.webContents.send('open-file', await readDesignFile(file));
  } catch (err) {
    dialog.showErrorBox('Couldn’t open the design', String(err && err.message ? err.message : err));
  }
}

const designArg = (argv) => argv.find((a) => /\.(chitthi|json)$/i.test(a) && fs.existsSync(a));

/* ------------------------------------------------------------------ menu */

function menu() {
  const send = (action) => () => win && win.webContents.send('menu', action);
  // Keys the page already handles itself (Ctrl+S, Ctrl+Z, Ctrl+Y) are shown but not registered, so typing in a
  // text field still gets native undo and the page's own shortcuts keep working.
  const shown = (accelerator) => ({ accelerator, registerAccelerator: false });
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New card', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: 'Open design…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { label: 'Save to gallery', ...shown('CmdOrCtrl+S'), click: send('save') },
        { label: 'Save design as file…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-file') },
        { label: 'Export print pack…', accelerator: 'CmdOrCtrl+E', click: send('export-pack') },
        { type: 'separator' },
        { label: 'Back up gallery…', click: send('backup') },
        { label: 'Restore a backup…', click: send('restore') },
        { label: 'Open library folder', click: () => shell.openPath(LIB()) },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', ...shown('CmdOrCtrl+Z'), click: send('undo') },
        { label: 'Redo', ...shown(isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'), click: send('redo') },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Home', click: send('home') },
        { label: 'Studio', click: send('studio') },
        { label: 'Gallery', accelerator: 'CmdOrCtrl+G', click: send('gallery') },
        { label: '3D view', accelerator: 'CmdOrCtrl+Shift+3', click: send('3d') },
        { label: 'Flip card', ...shown('F'), click: send('flip') },
        { label: 'Light / dark theme', accelerator: 'CmdOrCtrl+Shift+L', click: send('theme') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
    ...(isMac ? [{ role: 'windowMenu' }] : []),
    {
      role: 'help',
      submenu: [
        { label: 'Check for updates…', enabled: app.isPackaged, click: () => checkForUpdates(true) },
        { label: 'Sample photos: Pexels license', click: () => openExternal('https://www.pexels.com/license/') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: `About Chitthi ${app.getVersion()}`, click: about }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function about() {
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'About Chitthi',
    message: `Chitthi ${app.getVersion()}`,
    detail: 'Postcards, calendars and framed prints, ready for the print shop.',
  });
}

/* ------------------------------------------------------------------ updates (signed release builds only) */

function checkForUpdates(manual) {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    const run = manual ? autoUpdater.checkForUpdates() : autoUpdater.checkForUpdatesAndNotify();
    Promise.resolve(run)
      .then((r) => {
        if (manual && (!r || !r.isUpdateAvailable))
          dialog.showMessageBox(win, { type: 'info', message: 'Chitthi is up to date.' });
      })
      .catch((err) => {
        if (manual) dialog.showErrorBox('Update check failed', String(err && err.message ? err.message : err));
      });
  } catch {
    /* updater unavailable */
  }
}

/* ------------------------------------------------------------------ lifecycle */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Windows/Linux: double-clicking a .chitthi file while Chitthi is open.
  app.on('second-instance', (_e, argv) => {
    const f = designArg(argv);
    if (f) sendOpenFile(f);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  // macOS: file association and dropping a file on the dock icon.
  app.on('open-file', (e, file) => {
    e.preventDefault();
    if (app.isReady() && win) sendOpenFile(file);
    else pendingFile = file;
  });

  app.whenReady().then(() => {
    serveApp();
    registerStorage();
    registerFiles();
    menu();
    pendingFile = pendingFile || designArg(process.argv.slice(1));
    createWindow();
    checkForUpdates(false);
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
