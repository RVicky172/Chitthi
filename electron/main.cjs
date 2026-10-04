/*
 * Chitthi desktop – Electron main process.
 *
 * The renderer is the same React app as the web build (dist/), served from a private app:// origin with a strict
 * Content Security Policy. It runs sandboxed without Node; everything native (file dialogs, the on-disk library,
 * menus, updates) goes through the small bridge in preload.cjs.
 */
const { app, BrowserWindow, Menu, dialog, protocol, session, shell } = require('electron');
const { handle, on } = require('./ipc.cjs');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const fsp = fs.promises;

const DEV_URL = process.env.CHITTHI_DEV_URL || ''; // set by electron/dev.mjs
// `Chitthi --mcp`: run headless as an MCP server over stdio for AI agents (electron/mcp.cjs), no window.
const MCP_MODE = process.argv.includes('--mcp');
const isMac = process.platform === 'darwin';
// The app is "Chitthi Studio", but its data (gallery, photo library, keys) stays in the folder earlier versions used,
// so renaming the app never loses anyone's work: %APPDATA%\Chitthi, ~/Library/Application Support/Chitthi.
app.setPath('userData', path.join(app.getPath('appData'), 'Chitthi'));
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
  '.wasm': 'application/wasm',
};

// Google Fonts stay allowed as a fallback for builds made without `npm run fetch:fonts`.
const CSP = [
  "default-src 'self'",
  // AI masks run their model with WebAssembly (ONNX Runtime Web), which needs 'wasm-unsafe-eval' (no JavaScript eval).
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Pexels photo search (with the user's own key) and the photos it downloads.
  "img-src 'self' data: blob: https://images.pexels.com",
  // ...and the sky model, downloaded once from Hugging Face (its CDN is *.hf.co) when the user agrees.
  "connect-src 'self' data: blob: https://api.pexels.com https://images.pexels.com https://huggingface.co https://*.hf.co",
  // The video editor plays local clips and music from blob: URLs; the video encoder starts blob: workers.
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
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

/* ------------------------------------------------------------------ permissions */
// Electron grants every permission by default. The app needs only fullscreen and copying text to the clipboard.
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);

function restrictPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, done) => done(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
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
  let names;
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
  handle('db:all', () => readAll('designs'));
  handle('db:get', (_e, id) => readJson(path.join(dir('designs'), `${requireId(id)}.json`)));
  handle('db:put', (_e, rec) => writeJson(path.join(dir('designs'), `${requireId(rec && rec.id)}.json`), rec));
  handle('db:del', (_e, id) => fsp.rm(path.join(dir('designs'), `${requireId(id)}.json`), { force: true }));
  handle('db:getWorkPhotos', async () => (await readJson(path.join(LIB(), 'work.json'))) || []);
  handle('db:putWorkPhotos', (_e, photos) => writeJson(path.join(LIB(), 'work.json'), Array.isArray(photos) ? photos : []));
  // Photo store: photos/<id>.json holds the full image, photos-meta/<id>.json everything else (name, thumbnail,
  // analysis), so listing the library never reads or sends the full images.
  handle('db:libAll', async () => {
    const metas = await readAll('photos-meta'),
      known = new Set(metas.map((m) => m.id));
    // Photos saved before the split: make their meta file once.
    let names = [];
    try {
      names = (await fsp.readdir(dir('photos'))).filter((n) => n.endsWith('.json') && !known.has(n.slice(0, -5)));
    } catch {
      /* no photos yet */
    }
    for (const n of names) {
      const full = await readJson(path.join(dir('photos'), n));
      if (!full || !safeId(full.id)) continue;
      const meta = { ...full, url: '' };
      await writeJson(path.join(dir('photos-meta'), n), meta);
      metas.push(meta);
    }
    return metas;
  });
  handle('db:libUrl', async (_e, id) => ((await readJson(path.join(dir('photos'), `${requireId(id)}.json`))) || {}).url || '');
  handle('db:libPut', async (_e, p) => {
    const id = requireId(p && p.id);
    // A details-only update (empty url) keeps the stored full image.
    if (p.url) await writeJson(path.join(dir('photos'), `${id}.json`), { id, url: p.url });
    await writeJson(path.join(dir('photos-meta'), `${id}.json`), { ...p, url: '' });
  });
  handle('db:libDel', async (_e, id) => {
    await fsp.rm(path.join(dir('photos'), `${requireId(id)}.json`), { force: true });
    await fsp.rm(path.join(dir('photos-meta'), `${requireId(id)}.json`), { force: true });
  });
  // Saved presets of the photo & video editors: presets/<id>.json. The page validates what it reads (mergePreset);
  // here only the shape and size are checked, so nothing else lands in the data folder.
  handle('db:presetAll', () => readAll('presets'));
  handle('db:presetPut', (_e, p) => {
    const id = requireId(p && p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) throw new Error('Invalid preset name');
    if (!p.adjust || typeof p.adjust !== 'object' || Array.isArray(p.adjust)) throw new Error('Invalid preset');
    const rec = { id, name: p.name, adjust: p.adjust, created: Number.isFinite(p.created) ? p.created : Date.now() };
    if (JSON.stringify(rec).length > 64 * 1024) throw new Error('Preset too large');
    return writeJson(path.join(dir('presets'), `${id}.json`), rec);
  });
  handle('db:presetDel', (_e, id) => fsp.rm(path.join(dir('presets'), `${requireId(id)}.json`), { force: true }));
}

/* ------------------------------------------------------------------ files: save / open / reveal */

const savedPaths = new Set();
let lastDir = null;

function extFilter(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const label = { zip: 'Print pack', pdf: 'PDF', png: 'PNG image', json: 'Gallery backup', chitthi: 'Chitthi design', mp4: 'MP4 video' }[ext] || 'File';
  return ext ? [{ name: label, extensions: [ext] }] : [];
}

function registerFiles() {
  handle('desktop:saveFile', async (e, name, data) => {
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
  // Streaming saves for long exports (video): the user picks the file, then the page writes it piece by piece at given
  // positions, so a long video never has to fit in memory. Only files opened this way can be written.
  const streams = new Map();
  let nextStream = 1;
  handle('desktop:openWrite', async (e, name) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const safeName = path.basename(String(name || 'chitthi-video.mp4'));
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(lastDir || app.getPath('videos'), safeName),
      filters: extFilter(safeName),
    });
    if (canceled || !filePath) return null;
    const fh = await fsp.open(filePath, 'w');
    const id = nextStream++;
    streams.set(id, { fh, filePath });
    lastDir = path.dirname(filePath);
    return { id, path: filePath };
  });
  handle('desktop:write', async (_e, id, position, data) => {
    const s = streams.get(id);
    if (!s) throw new Error('That file isn’t open.');
    if (!Number.isSafeInteger(position) || position < 0) throw new Error('Bad position.');
    const buf = Buffer.from(data);
    await s.fh.write(buf, 0, buf.length, position);
  });
  handle('desktop:closeWrite', async (_e, id, keep) => {
    const s = streams.get(id);
    if (!s) return null;
    streams.delete(id);
    await s.fh.close();
    if (!keep) {
      await fsp.rm(s.filePath, { force: true });
      return null;
    }
    savedPaths.add(s.filePath);
    return s.filePath;
  });
  // Only files this session saved can be revealed: the renderer can't probe arbitrary paths.
  handle('desktop:showInFolder', (_e, p) => {
    if (savedPaths.has(p)) shell.showItemInFolder(p);
  });
  handle('desktop:openExternal', (_e, url) => openExternal(url));
  handle('desktop:openDesignFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Chitthi design or backup', extensions: ['chitthi', 'json'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return readDesignFile(filePaths[0]);
  });
  // Performance monitor: CPU (% of one core since the last call) and memory for every Chitthi process.
  handle('desktop:metrics', () => ({
    cores: os.cpus().length || 1,
    systemMemory: os.totalmem(),
    procs: app.getAppMetrics().map((m) => ({ type: m.type, pid: m.pid, cpu: m.cpu.percentCPUUsage, mem: m.memory.workingSetSize * 1024 })),
  }));
  on('desktop:info', (e) => {
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
    title: 'Chitthi Studio',
    backgroundColor: '#fafaf9',
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
        { type: 'separator' },
        { label: isMac ? 'Settings…' : 'Settings', accelerator: 'CmdOrCtrl+,', click: send('settings') },
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
        { label: 'Sizes and layouts', click: send('sizes') },
        { label: 'Paper sizes in 3D', click: send('paper') },
        { label: 'Photo & video studio', click: send('instagram') },
        { label: 'Find a feature…', ...shown('CmdOrCtrl+K'), click: send('find') },
        { label: '3D view', accelerator: 'CmdOrCtrl+Shift+3', click: send('3d') },
        { label: 'Flip card', ...shown('F'), click: send('flip') },
        { label: 'Light / dark theme', accelerator: 'CmdOrCtrl+Shift+L', click: send('theme') },
        { label: 'Performance monitor', click: send('perf') },
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
        ...(isMac ? [] : [{ type: 'separator' }, { label: `About Chitthi Studio ${app.getVersion()}`, click: about }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function about() {
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'About Chitthi Studio',
    message: `Chitthi Studio ${app.getVersion()}`,
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
          dialog.showMessageBox(win, { type: 'info', message: 'Chitthi Studio is up to date.' });
      })
      .catch((err) => {
        if (manual) dialog.showErrorBox('Update check failed', String(err && err.message ? err.message : err));
      });
  } catch {
    /* updater unavailable */
  }
}

/* ------------------------------------------------------------------ lifecycle */

const { registerAi } = require('./ai.cjs');
const agent = require('./mcp.cjs');

if (MCP_MODE) {
  // Headless agent mode: its own process next to any open Chitthi window (no single-instance lock, no menu).
  app.whenReady().then(async () => {
    restrictPermissions();
    serveApp();
    registerStorage();
    registerFiles();
    registerAi();
    try {
      await agent.startHeadless({ url: `${DEV_URL || `${ORIGIN}/index.html`}?agent`, preload: path.join(__dirname, 'preload.cjs') });
    } catch (e) {
      process.stderr.write(`Chitthi MCP could not start: ${e && e.message ? e.message : e}
`);
      app.exit(1);
    }
  });
  app.on('window-all-closed', () => undefined);
} else if (!app.requestSingleInstanceLock()) {
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
    restrictPermissions();
    serveApp();
    registerStorage();
    registerFiles();
    registerAi();
    // Live agent connection (Settings → AI): drives this window when turned on.
    agent.registerAgentIpc(() => (win ? win.webContents : null));
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
