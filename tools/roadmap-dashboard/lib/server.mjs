// The dashboard's HTTP server: the built React app, a read API, and one write (moving a task on the board).
// Everything else is 404. It also regenerates the spec Markdown when a JSON file changes (hand edits).
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { writeJson } from '../../specs-index/lib/json.mjs';
import { SpecsError, setTaskStatus } from '../../specs-index/lib/ops.mjs';
import { loadIndex } from '../../specs-index/lib/store.mjs';
import { syncRepo } from '../../specs-index/lib/sync.mjs';
import { API_SCHEMA, createProject } from './project.mjs';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Only requests addressed to this machine: a page elsewhere can't reach the API through DNS rebinding. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_BODY = 4096;

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) reject(Object.assign(new Error('Body too large'), { status: 413 }));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * root: the repository; staticDir: the built app (index.html, assets/); watchMs: how often the JSON is checked for
 * changes. Call server.setVite(vite) for the dev mode (the app through Vite's middleware, hot reload).
 */
export function createDashboardServer({ root, staticDir = null, watchMs = 1000, today = localToday }) {
  const project = createProject(root);
  let vite = null;

  // Hand edits to a JSON file: regenerate the Markdown (the CLI, the hook and the board do it themselves).
  let lastJson = project.jsonVersion();
  const timer = setInterval(() => {
    const v = project.jsonVersion();
    if (v === lastJson) return;
    lastJson = v;
    try {
      syncRepo(root);
    } catch {
      // invalid data: the check shows it on the page
    }
  }, watchMs);
  timer.unref();

  async function moveTask(req, res, id, taskId, json) {
    const port = server.address().port;
    const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
    if (!origins.includes(req.headers.origin)) return json(403, { error: 'Only the dashboard itself can change tasks.' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
      return json(415, { error: 'Send JSON.' });
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      return json(e.status ?? 400, { error: e.status ? 'Too much data.' : 'The body is not valid JSON.' });
    }
    const { status, reason } = body ?? {};
    if (typeof status !== 'string' || (reason !== undefined && typeof reason !== 'string'))
      return json(400, { error: 'Send { status, reason? }.' });
    const f = loadIndex(root).features.get(id);
    if (!f) return json(404, { error: `No feature ${id}.` });
    if (!f.data) return json(409, { error: `${id}'s feature.json can't be read.` });
    try {
      setTaskStatus(f.data, taskId, status, { reason, today: today() });
    } catch (e) {
      if (e instanceof SpecsError) return json(400, { error: e.message });
      throw e;
    }
    writeJson(f.path, f.data);
    syncRepo(root);
    lastJson = project.jsonVersion();
    return json(200, project.feature(id));
  }

  const server = createServer(async (req, res) => {
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': type, ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const json = (status, data) => send(status, 'application/json; charset=utf-8', JSON.stringify(data));
    const text = (status, body) => send(status, 'text/plain; charset=utf-8', body);
    try {
      if (!LOCAL_HOSTS.has((req.headers.host ?? '').replace(/:\d+$/, ''))) return text(403, 'Forbidden');
      const path = new URL(req.url, 'http://localhost').pathname;
      const read = req.method === 'GET' || req.method === 'HEAD';

      if (path.startsWith('/api/')) {
        const move = /^\/api\/features\/(\d{3})\/tasks\/(T\d+[a-z]?)$/.exec(path);
        if (move) return req.method === 'POST' ? await moveTask(req, res, move[1], move[2], json) : text(405, 'POST only');
        const known = path === '/api/version' || path === '/api/project' || /^\/api\/features\/\d{3}$/.test(path);
        if (known && !read) return text(405, 'Read-only');
        if (path === '/api/version') return json(200, { schema: API_SCHEMA, version: project.version() });
        if (path === '/api/project') return json(200, project.project());
        const m = /^\/api\/features\/(\d{3})$/.exec(path);
        if (m) {
          const f = project.feature(m[1]);
          return f ? json(200, f) : json(404, { error: `No feature folder for ${m[1]}` });
        }
        return text(404, 'Not found');
      }

      if (vite) return vite.middlewares(req, res, () => text(404, 'Not found'));
      if (!read) return text(405, 'Read-only');
      let file = null;
      if (path === '/' || path === '/index.html') file = 'index.html';
      else if (/^\/assets\/[\w.-]+$/.test(path)) file = path.slice(1);
      if (!file || !staticDir) return text(404, 'Not found');
      let body;
      try {
        body = readFileSync(join(staticDir, file));
      } catch {
        return text(404, 'Not found');
      }
      const ext = /\.[a-z0-9]+$/.exec(file)?.[0] ?? '';
      return send(200, TYPES[ext] ?? 'application/octet-stream', body, { 'Content-Security-Policy': CSP });
    } catch (e) {
      if (!res.headersSent) return json(500, { error: e.message });
    }
  });
  server.setVite = (v) => (vite = v);
  server.on('close', () => clearInterval(timer));
  return server;
}
