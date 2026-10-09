import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseArgs } from '../lib/args.mjs';
import { createDashboardServer } from '../lib/server.mjs';
import { editJson, syncedMini } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../server.mjs', import.meta.url));
const STATIC = fileURLToPath(new URL('./fixtures/static/', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

describe('parseArgs', () => {
  it('reads the options', () => {
    expect(parseArgs([])).toEqual({ port: 5180, open: true, dev: false, help: false, root: null, staticDir: null, error: null });
    expect(parseArgs(['--port', '6000', '--no-open', '--dev'])).toMatchObject({ port: 6000, open: false, dev: true });
    expect(parseArgs(['--port=6001'])).toMatchObject({ port: 6001 });
    expect(parseArgs(['--port', 'x']).error).toBe('--port needs a number from 0 to 65535');
    expect(parseArgs(['--frob']).error).toBe('Unknown option --frob');
  });
});

describe('the server', () => {
  let server;
  let base;
  let root;
  const post = (path, body, headers = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  beforeAll(async () => {
    root = syncedMini();
    server = createDashboardServer({ root, staticDir: STATIC, watchMs: 200 });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('serves the built page with a strict CSP that allows only Google Fonts besides itself', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
    expect((await fetch(`${base}/assets/app-test.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${base}/feature/202`)).status).toBe(404);
  });

  it('answers the read API', async () => {
    const v = await (await fetch(`${base}/api/version`)).json();
    expect(v).toMatchObject({ schema: 2, version: expect.stringMatching(/^[0-9a-f]{40}$/) });
    const p = await (await fetch(`${base}/api/project`)).json();
    expect(Object.keys(p.roadmap.items.byId)).toEqual(['101', '102', '103']);
    const f = await (await fetch(`${base}/api/features/102`)).json();
    expect(f.docs.tasks).toContain('**T003** [P] 👤');
  });

  it('moves a task: JSON and Markdown change together', async () => {
    const res = await post('/api/features/102/tasks/T004', { status: 'in-progress' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feature.tasks.items.byId.T004.status).toBe('in-progress');
    const json = JSON.parse(readFileSync(join(root, 'specs/features/102-beta/feature.json'), 'utf8'));
    expect(json.tasks.items.byId.T004.status).toBe('in-progress');
    expect(readFileSync(join(root, 'specs/features/102-beta/tasks.md'), 'utf8')).toContain('- [ ] **T004** — Release.\n  - **In progress** since');
    expect(body.docs.tasks).toContain('**In progress** since');
  });

  it('asks for a reason to block, and refuses unknown tasks and bodies', async () => {
    const noReason = await post('/api/features/102/tasks/T004', { status: 'blocked' });
    expect(noReason.status).toBe(400);
    expect((await noReason.json()).error).toContain('needs a reason');
    expect((await post('/api/features/102/tasks/T004', { status: 'blocked', reason: 'Waits.' })).status).toBe(200);
    expect((await post('/api/features/102/tasks/T009', { status: 'done' })).status).toBe(400);
    expect((await post('/api/features/199/tasks/T001', { status: 'done' })).status).toBe(404);
    expect((await post('/api/features/102/tasks/T004', '{ nope')).status).toBe(400);
    expect((await post('/api/features/102/tasks/T004', { status: 'done', extra: 'x'.repeat(5000) })).status).toBe(413);
  });

  it('refuses writes from other origins or without JSON, and every other path and method', async () => {
    expect((await post('/api/features/102/tasks/T004', { status: 'done' }, { Origin: 'http://evil.example' })).status).toBe(403);
    expect((await post('/api/features/102/tasks/T004', { status: 'done' }, { Origin: '' })).status).toBe(403);
    expect((await post('/api/features/102/tasks/T004', 'status=done', { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await fetch(`${base}/api/features/102/tasks/T004`, { method: 'PUT' })).status).toBe(405);
    expect((await post('/api/project', {})).status).toBe(405);
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/api/features/abc', '/specs/roadmap.json', '/assets/../../package.json', '/assets/x/y.js'])
      expect((await fetch(base + path)).status, path).not.toBe(200);
  });

  it('regenerates the Markdown within 3 s of a hand edit to a feature.json', async () => {
    editJson(join(root, 'specs/features/102-beta/feature.json'), (f) => (f.spec.criteria.byId['AC-2'].done = true));
    let spec = '';
    for (let i = 0; i < 30 && !spec.includes('- [x] **AC-2:**'); i++) {
      await wait(100);
      spec = readFileSync(join(root, 'specs/features/102-beta/spec.md'), 'utf8');
    }
    expect(spec).toContain('- [x] **AC-2:** Beta has docs.');
  });
});

function runCli(args) {
  const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  return { child, out: () => out, err: () => err, exit: new Promise((r) => child.on('exit', (code) => r(code))) };
}

describe('the command', () => {
  it('starts, prints its URL and serves; Ctrl + C stops it', async () => {
    const run = runCli(['--port', '0', '--no-open', '--root', syncedMini(), '--static', STATIC]);
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      port = /http:\/\/localhost:(\d+)/.exec(run.out())?.[1];
      if (!port) await wait(50);
    }
    expect(port, run.err()).toBeTruthy();
    expect((await fetch(`http://127.0.0.1:${port}/api/version`)).status).toBe(200);
    run.child.kill('SIGINT');
    await run.exit;
  });

  it('says so and exits 1 when the port is in use', async () => {
    const busy = createServer();
    await new Promise((r) => busy.listen(0, '127.0.0.1', r));
    const port = busy.address().port;
    const run = runCli(['--port', String(port), '--no-open', '--root', syncedMini(), '--static', STATIC]);
    expect(await run.exit).toBe(1);
    expect(run.err()).toContain(`Port ${port} is in use`);
    expect(run.err()).not.toContain('    at ');
    busy.close();
  });
});
