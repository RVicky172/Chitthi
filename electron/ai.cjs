/*
 * AI requests for the desktop app, in the main process.
 *
 * The page never holds API keys on desktop: it asks this module to make a request, and the key is added here, only
 * when the URL belongs to that provider (electron/ai-hosts.json) or to the base URL saved with a local or custom
 * service's key. Keys are encrypted with the operating system's key store (Electron safeStorage) in
 * userData/ai-keys.json. Calls run here, so providers without browser (CORS) support work on desktop.
 */
const { app, ipcMain, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const RULES = require('./ai-hosts.json');

const MAX_BYTES = 40 * 1024 * 1024; // a generated image is a few MB; anything this big is a mistake
const TIMEOUT_MS = 180_000;
const MAX_PARALLEL = 2;

const keysFile = () => path.join(app.getPath('userData'), 'ai-keys.json');
let session = {}; // keys kept for this run only when the OS offers no encryption

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(keysFile(), 'utf8'));
  } catch {
    return {};
  }
}
function writeStore(store) {
  fs.mkdirSync(path.dirname(keysFile()), { recursive: true });
  fs.writeFileSync(keysFile(), JSON.stringify(store), { mode: 0o600 });
}
function keyOf(provider) {
  if (session[provider]) return session[provider];
  const rec = readStore()[provider];
  if (!rec || !rec.enc) return null;
  try {
    return { key: safeStorage.decryptString(Buffer.from(rec.enc, 'base64')), base: rec.base || '' };
  } catch {
    return null;
  }
}

const matches = (host, list = []) => list.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h));
function allowed(provider, url, base) {
  const r = RULES[provider];
  if (!r || provider.startsWith('_')) return { ok: false };
  let u;
  try {
    u = new URL(url);
  } catch {
    return { ok: false };
  }
  if (u.protocol === 'https:' && matches(u.hostname, r.resultHosts)) return { ok: true, result: true };
  if (r.local || r.custom) {
    // A local or custom service: only its own base URL (saved with its key for custom ones).
    const saved = keyOf(provider);
    const origin = (saved && saved.base) || base;
    try {
      if (origin && u.origin === new URL(origin).origin && (u.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))
        return { ok: true };
    } catch {
      /* bad base */
    }
    return { ok: false };
  }
  return { ok: u.protocol === 'https:' && matches(u.hostname, r.hosts) };
}

let running = 0;
const waiting = [];
async function slot() {
  if (running < MAX_PARALLEL) {
    running++;
    return;
  }
  await new Promise((r) => waiting.push(r));
  running++;
}
function release() {
  running--;
  const next = waiting.shift();
  if (next) next();
}

async function request(req) {
  const provider = String(req.provider || '');
  const rule = RULES[provider];
  const ok = allowed(provider, String(req.url || ''), String(req.base || ''));
  if (!rule || !ok.ok) return { status: 0, statusText: '', headers: {}, body: null, error: 'Chitthi won’t send requests for this provider to that address.' };
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) if (typeof v === 'string' && k.toLowerCase() !== rule.header.toLowerCase()) headers[k] = v;
  if (!ok.result && !req.noAuth && rule.header) {
    const saved = keyOf(provider);
    if (!saved || !saved.key) return { status: 0, statusText: '', headers: {}, body: null, error: 'Add your API key for this provider in Settings → AI.', kind: 'key' };
    headers[rule.header] = rule.prefix + saved.key;
  }
  let body;
  if (Array.isArray(req.form)) {
    body = new FormData();
    for (const [k, v] of req.form)
      body.append(k, typeof v === 'string' ? v : new Blob([Buffer.from(v.data)], { type: v.type || 'application/octet-stream' }), typeof v === 'string' ? undefined : v.name || 'file');
  } else if (req.json !== undefined) {
    body = JSON.stringify(req.json);
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
  }
  await slot();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(req.url, { method: req.method || (body ? 'POST' : 'GET'), headers, body, signal: ctl.signal });
    const len = +(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return { status: 0, statusText: '', headers: {}, body: null, error: 'The response was too large.' };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return { status: 0, statusText: '', headers: {}, body: null, error: 'The response was too large.' };
    const out = {};
    res.headers.forEach((v, k) => (out[k] = v));
    return { status: res.status, statusText: res.statusText, headers: out, body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
  } catch (e) {
    const msg = ctl.signal.aborted ? 'The provider took too long to answer.' : `Couldn’t reach the provider (${e && e.message ? e.message : e}).`;
    return { status: 0, statusText: '', headers: {}, body: null, error: msg, kind: 'network' };
  } finally {
    clearTimeout(timer);
    release();
  }
}

function registerAi() {
  ipcMain.handle('ai:keys', () => {
    const store = readStore(),
      out = {};
    for (const p of Object.keys(RULES)) if (!p.startsWith('_')) out[p] = !!(store[p] && store[p].enc) || !!session[p];
    return out;
  });
  ipcMain.handle('ai:setKey', (_e, provider, key, base) => {
    if (!RULES[provider] || provider.startsWith('_')) throw new Error('Unknown provider');
    const k = String(key || '').trim();
    if (!k || k.length > 4000) throw new Error('That doesn’t look like an API key.');
    const b = String(base || '');
    if (safeStorage.isEncryptionAvailable()) {
      const store = readStore();
      store[provider] = { enc: safeStorage.encryptString(k).toString('base64'), base: b };
      writeStore(store);
      delete session[provider];
    } else session[provider] = { key: k, base: b }; // no OS key store: keep it for this run only
  });
  ipcMain.handle('ai:deleteKey', (_e, provider) => {
    const store = readStore();
    delete store[provider];
    writeStore(store);
    delete session[provider];
  });
  ipcMain.handle('ai:fetch', (_e, req) => request(req || {}));
}

module.exports = { registerAi, aiRequest: request };
