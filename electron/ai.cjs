/*
 * AI requests for the desktop app, in the main process.
 *
 * The page never holds API keys on desktop: it asks this module to make a request, and the key is added here, only
 * when the URL belongs to that provider (electron/ai-hosts.json) or to the base URL saved with a local or custom
 * service's key. Keys are encrypted with the operating system's key store (Electron safeStorage) in
 * userData/ai-keys.json. Calls run here, so providers without browser (CORS) support work on desktop.
 */
const { app, safeStorage } = require('electron');
const { handle } = require('./ipc.cjs');
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

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Whether a host is in a provider's host list (an entry starting with `.` matches every subdomain).
 * @param {string} host the URL's host name
 * @param {string[]} [list] the provider's hosts
 * @returns {boolean} true when it matches
 */
const matches = (host, list = []) => list.some((entry) => (entry.startsWith('.') ? host.endsWith(entry) : host === entry));

/**
 * Whether a URL has the same origin as a base URL and is on this computer.
 * @param {URL} target the request's URL
 * @param {string} base a base URL (may be empty or invalid)
 * @returns {boolean} true for a loopback URL on the base's origin
 */
function sameLoopbackOrigin(target, base) {
  try {
    return !!base && target.origin === new URL(base).origin && LOOPBACK.includes(target.hostname);
  } catch {
    return false; // bad base
  }
}

/**
 * Whether a URL is on the origin of the base URL saved with a custom service's key, over https or on this computer.
 * @param {string} provider the provider id
 * @param {URL} target the request's URL
 * @returns {boolean} true when the request may go there
 */
function onSavedBase(provider, target) {
  // Only the base URL the user saved with its key, never one the page sends with the request.
  const saved = keyOf(provider);
  try {
    return !!saved && !!saved.base && target.origin === new URL(saved.base).origin && (target.protocol === 'https:' || LOOPBACK.includes(target.hostname));
  } catch {
    return false; // bad base
  }
}

/**
 * Whether a request for a provider may go to a URL, and whether that URL is a result download (sent without the key).
 * @param {string} provider the provider id
 * @param {string} url the request's URL
 * @param {string} base the base URL the page sent (used for local services only)
 * @returns {{ ok: boolean, result?: boolean }} `ok` when allowed; `result` for a provider's result host
 */
function allowed(provider, url, base) {
  const rule = RULES[provider];
  if (!rule || provider.startsWith('_')) return { ok: false };
  let target;
  try {
    target = new URL(url);
  } catch {
    return { ok: false };
  }
  if (target.protocol === 'https:' && matches(target.hostname, rule.resultHosts)) return { ok: true, result: true };
  // A service on this computer: loopback only, so the page can't use this as a way to fetch arbitrary sites.
  if (rule.local) return { ok: sameLoopbackOrigin(target, base) };
  if (rule.custom) return { ok: onSavedBase(provider, target) };
  return { ok: target.protocol === 'https:' && matches(target.hostname, rule.hosts) };
}

let running = 0;
const waiting = [];
/** Waits for one of the MAX_PARALLEL request slots. */
async function slot() {
  if (running < MAX_PARALLEL) {
    running++;
    return;
  }
  await new Promise((resolve) => waiting.push(resolve));
  running++;
}
/** Frees a request slot for the next waiting request. */
function release() {
  running--;
  const next = waiting.shift();
  if (next) next();
}

/**
 * A failed request's answer to the page.
 * @param {string} error what went wrong, for the user
 * @param {string} [kind] `key` or `network`
 * @returns {object} a response with status 0 and the error
 */
function failure(error, kind) {
  const response = { status: 0, statusText: '', headers: {}, body: null, error };
  if (kind) response.kind = kind;
  return response;
}

/**
 * The page's string headers, without the provider's key header (only this module sets that).
 * @param {object} req the page's request
 * @param {{ header: string }} rule the provider's rule
 * @returns {Record<string, string>} the headers to send
 */
function pageHeaders(req, rule) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers || {}))
    if (typeof value === 'string' && name.toLowerCase() !== rule.header.toLowerCase()) headers[name] = value;
  return headers;
}

/**
 * The request body: form data (strings and files) or JSON, which also sets a JSON content type when none is given.
 * @param {object} req the page's request
 * @param {Record<string, string>} headers the headers to send (changed in place)
 * @returns {FormData | string | undefined} the body
 */
function requestBody(req, headers) {
  if (Array.isArray(req.form)) {
    const form = new FormData();
    for (const [name, value] of req.form)
      if (typeof value === 'string') form.append(name, value);
      else form.append(name, new Blob([Buffer.from(value.data)], { type: value.type || 'application/octet-stream' }), value.name || 'file');
    return form;
  }
  if (req.json === undefined) return undefined;
  if (!Object.keys(headers).some((name) => name.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json';
  return JSON.stringify(req.json);
}

/**
 * Reads a response of at most MAX_BYTES.
 * @param {Response} res the provider's response
 * @returns {Promise<object>} the answer to the page (status, headers, body as an ArrayBuffer), or a failure
 */
async function readResponse(res) {
  const len = +(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return failure('The response was too large.');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return failure('The response was too large.');
  const out = {};
  res.headers.forEach((value, name) => (out[name] = value));
  return { status: res.status, statusText: res.statusText, headers: out, body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
}

/**
 * Makes an AI request for the page, adding the provider's key only for that provider's hosts.
 * @param {object} req the page's request: provider, url, base, method, headers, form or json, noAuth
 * @returns {Promise<object>} the response, or a failure with status 0 (never throws)
 */
async function request(req) {
  const provider = String(req.provider || '');
  const rule = RULES[provider];
  const ok = allowed(provider, String(req.url || ''), String(req.base || ''));
  if (!rule || !ok.ok) return failure('Chitthi won’t send requests for this provider to that address.');
  const headers = pageHeaders(req, rule);
  const keyed = !ok.result && !req.noAuth && !!rule.header;
  if (keyed) {
    const saved = keyOf(provider);
    if (!saved || !saved.key) return failure('Add your API key for this provider in Settings → AI.', 'key');
    headers[rule.header] = rule.prefix + saved.key;
  }
  const body = requestBody(req, headers);
  await slot();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    // A request carrying a key never follows a redirect: custom key headers would go along to the new host.
    const res = await fetch(req.url, { method: req.method || (body ? 'POST' : 'GET'), headers, body, signal: ctl.signal, redirect: keyed ? 'error' : 'follow' });
    return await readResponse(res);
  } catch (error) {
    const reason = error && error.message ? error.message : error;
    const msg = ctl.signal.aborted ? 'The provider took too long to answer.' : `Couldn’t reach the provider (${reason}).`;
    return failure(msg, 'network');
  } finally {
    clearTimeout(timer);
    release();
  }
}

/** Registers the AI IPC handlers: which keys are saved, save and delete a key, make a request. */
function registerAi() {
  handle('ai:keys', () => {
    const store = readStore(),
      out = {};
    for (const provider of Object.keys(RULES)) if (!provider.startsWith('_')) out[provider] = !!(store[provider] && store[provider].enc) || !!session[provider];
    return out;
  });
  handle('ai:setKey', (_e, provider, key, base) => {
    if (!RULES[provider] || provider.startsWith('_')) throw new Error('Unknown provider');
    const trimmed = String(key || '').trim();
    if (!trimmed || trimmed.length > 4000) throw new Error('That doesn’t look like an API key.');
    const savedBase = String(base || '');
    if (safeStorage.isEncryptionAvailable()) {
      const store = readStore();
      store[provider] = { enc: safeStorage.encryptString(trimmed).toString('base64'), base: savedBase };
      writeStore(store);
      delete session[provider];
    } else session[provider] = { key: trimmed, base: savedBase }; // no OS key store: keep it for this run only
  });
  handle('ai:deleteKey', (_e, provider) => {
    const store = readStore();
    delete store[provider];
    writeStore(store);
    delete session[provider];
  });
  handle('ai:fetch', (_e, req) => request(req || {}));
}

module.exports = { registerAi, aiRequest: request };
