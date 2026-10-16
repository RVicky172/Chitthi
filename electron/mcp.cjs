/*
 * Chitthi's MCP server (Model Context Protocol), in the desktop main process. The tools themselves live in the page
 * (src/agent/tools.ts): every MCP request is forwarded to the page as 'agent:call' and answered with 'agent:reply', so
 * agents act through exactly the same code as the studio.
 *
 *   Headless: `Chitthi --mcp` runs without a visible window and speaks MCP over stdio (for Claude Code, Claude
 *             Desktop, VS Code, Cursor…). It exits when the client disconnects.
 *   Live:     Settings → AI → "Let an agent work in this open window" serves MCP over Streamable HTTP on
 *             127.0.0.1 only, with a random bearer token, and drives the open window (the user sees every change and
 *             can undo it). Off by default; it stops when turned off or when Chitthi closes.
 *
 * Files a tool makes (print packs, PDFs) are written to Documents/Chitthi agent output; photos an agent adds from disk
 * must be JPG, PNG or WebP under 25 MB.
 */
const { app, BrowserWindow } = require('electron');
const { handle, on } = require('./ipc.cjs');
const { spawn } = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const CALL_TIMEOUT_MS = 10 * 60 * 1000; // exports and AI pictures can take a while
const PHOTO_MAX = 25 * 1024 * 1024;
const { RAW_EXTS, RAW_MAX } = require('./raw.cjs');
const PHOTO_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const outDir = () => path.join(app.getPath('documents'), 'Chitthi agent output');

/* ---------- talking to the page ---------- */

let nextId = 1;
const pending = new Map();
let readyResolve;
let ready = new Promise((resolve) => (readyResolve = resolve));
let headless = false; // `Chitthi --mcp`: an agent is connected for the life of the process

function call(wc, name, args) {
  return new Promise((resolve, reject) => {
    if (!wc || wc.isDestroyed()) return reject(new Error('The Chitthi window is closed.'));
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${name} took too long.`));
    }, CALL_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    wc.send('agent:call', { id, name, args: args || {} });
  });
}

/**
 * A file name with a copy number before its extension.
 * @param {string} base the file name, e.g. `card.png`
 * @param {number} copy the copy number
 * @returns {string} e.g. `card (2).png`
 */
const numbered = (base, copy) => base.replace(/(\.[^.]*)?$/, (extension) => ` (${copy})${extension || ''}`);

/**
 * Registers the agent IPC: tool replies from the page, writing output files, reading photos by path, the live
 * server's status and switch.
 * @param {() => Electron.WebContents | null} getLiveContents the open window's page, for the live server
 */
function registerAgentIpc(getLiveContents) {
  on('agent:reply', (_e, id, result) => {
    if (id === 0) return readyResolve && readyResolve();
    const waiter = pending.get(id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    pending.delete(id);
    waiter.resolve(result);
  });
  handle('agent:writeFiles', async (_e, files) => {
    const dir = outDir();
    await fsp.mkdir(dir, { recursive: true });
    const out = [];
    for (const entry of Array.isArray(files) ? files.slice(0, 20) : []) {
      // eslint-disable-next-line no-control-regex -- control characters are not allowed in file names
      const base = path.basename(String(entry.name || 'chitthi-file')).replace(/[<>:"|?*\u0000-\u001f]/g, '_') || 'chitthi-file';
      let file = path.join(dir, base);
      // An existing name gets a copy number before its extension: "card (2).png".
      for (let copy = 2; fs.existsSync(file); ) file = path.join(dir, numbered(base, copy++));
      await fsp.writeFile(file, Buffer.from(entry.data));
      out.push(file);
    }
    return out;
  });
  handle('agent:readPhoto', async (_e, photoPath) => {
    // Reading a photo by path is for agents only: refused unless an agent can be connected (headless or live).
    if (!headless && !live) throw new Error('Photos can be added by path only while an agent is connected.');
    const file = path.resolve(String(photoPath || ''));
    const ext = path.extname(file).toLowerCase(),
      raw = RAW_EXTS.has(ext),
      type = raw ? 'image/x-raw' : PHOTO_TYPES[ext];
    if (!type) throw new Error('Only JPG, PNG, WebP or camera RAW photos can be added.');
    const st = await fsp.stat(file);
    const max = raw ? RAW_MAX : PHOTO_MAX;
    if (!st.isFile() || st.size > max) throw new Error(`That photo is missing or larger than ${max / 1048576} MB.`);
    const buf = await fsp.readFile(file);
    return { name: path.basename(file), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), type };
  });
  handle('agent:status', () => liveStatus());
  handle('agent:setLive', async (_e, on) => {
    if (on) await startLive(getLiveContents);
    else await stopLive();
    return liveStatus();
  });
}

/* ---------- the MCP server (same handlers for both transports) ---------- */

function buildServer(getContents) {
  const server = new Server(
    { name: 'chitthi', title: 'Chitthi Studio', version: app.getVersion() },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} },
      instructions:
        'Chitthi designs postcards, calendars, frame prints and fridge magnets and exports print-ready files. Start with get_design or new_design; use check_design and render_preview before exporting. Photos: respect the Pexels license (credits are kept automatically) and mark AI pictures (generate_image does).',
    },
  );
  let listing = null;
  const list = async () => (listing = listing || (await call(getContents(), '__list', {})));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await list()).tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: tool.destructive, openWorldHint: /pexels|write_|generate_/.test(tool.name) },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const reply = await call(getContents(), req.params.name, req.params.arguments || {});
    if (!reply || !reply.ok) return { isError: true, content: [{ type: 'text', text: (reply && reply.error) || 'The tool failed.' }] };
    const content = [{ type: 'text', text: reply.text || 'Done.' }];
    if (reply.json !== undefined) content.push({ type: 'text', text: JSON.stringify(reply.json, null, 2) });
    if (reply.image) content.push({ type: 'image', data: reply.image.data, mimeType: reply.image.mimeType });
    if (reply.paths && reply.paths.length) content.push({ type: 'text', text: `Files written:\n${reply.paths.join('\n')}` });
    return { content, ...(reply.json !== undefined && reply.json && typeof reply.json === 'object' && !Array.isArray(reply.json) ? { structuredContent: reply.json } : {}) };
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: (await list()).resources }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const reply = await call(getContents(), '__resource', { uri: req.params.uri });
    if (!reply || reply.ok === false) throw new Error((reply && reply.error) || 'Unknown resource');
    return { contents: [{ uri: reply.uri, mimeType: reply.mimeType, text: reply.text }] };
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: (await list()).prompts }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const reply = await call(getContents(), '__prompt', { name: req.params.name, arguments: req.params.arguments || {} });
    if (!reply || reply.ok === false) throw new Error((reply && reply.error) || 'Unknown prompt');
    return { description: reply.description, messages: [{ role: 'user', content: { type: 'text', text: reply.text } }] };
  });
  return server;
}

/* ---------- headless: `Chitthi --mcp` over stdio ---------- */

/**
 * `Chitthi --mcp`: loads the page in a hidden window, waits for its agent tools, then serves MCP on loopback HTTP and
 * starts the stdio relay (the process quits when the relay ends).
 * @param {{ url: string, preload: string }} options the page's URL and the preload script
 * @returns {Promise<void>} once the relay has started
 * @throws {Error} when the page or its tools don't start
 */
async function startHeadless({ url, preload }) {
  headless = true;
  registerAgentIpc(() => null);
  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 1000,
    webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  await win.loadURL(url).catch((error) => {
    if (!String(error && error.message).includes('ERR_ABORTED')) throw error;
  });
  await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error('The Chitthi agent tools didn’t start.')), 60_000))]);
  // The protocol runs over loopback HTTP; a relay in Node mode carries the real stdio (see mcp-stdio.cjs).
  const srv = await listen(() => win.webContents);
  const script = path.join(__dirname.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked'), 'mcp-stdio.cjs');
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', CHITTHI_MCP_URL: `http://127.0.0.1:${srv.port}/mcp`, CHITTHI_MCP_TOKEN: srv.token };
  const relay = spawn(process.execPath, [script], { stdio: 'inherit', env, windowsHide: true });
  relay.on('exit', () => app.quit());
  relay.on('error', (error) => {
    process.stderr.write(`Chitthi MCP relay failed: ${error.message}
`);
    app.exit(1);
  });
}

/* ---------- live: Streamable HTTP on 127.0.0.1 with a token ---------- */

let live = null; // { server: http.Server, port, token }

function liveStatus() {
  return live ? { on: true, url: `http://127.0.0.1:${live.port}/mcp`, token: live.token } : { on: false, url: '', token: '' };
}

async function startLive(getLiveContents) {
  if (live) return;
  live = await listen(getLiveContents);
}

/**
 * An MCP endpoint on 127.0.0.1 (random port) that only accepts requests with the token and no browser Origin.
 * @param {() => Electron.WebContents | null} getContents the page the tools run in
 * @returns {Promise<{ server: import('node:http').Server, port: number, token: string }>} the listening server
 */
async function listen(getContents) {
  const token = crypto.randomBytes(24).toString('base64url');
  const srv = http.createServer(async (req, res) => {
    const deny = (code, msg) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: msg }, id: null }));
    };
    try {
      const target = new URL(req.url || '/', 'http://127.0.0.1');
      // Web pages can't reach this: no browser Origin, loopback Host only (DNS rebinding), and the token.
      if (req.headers.origin) return deny(403, 'Browsers may not connect.');
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(String(req.headers.host || ''))) return deny(403, 'Bad host.');
      const auth = String(req.headers.authorization || '');
      const given = Buffer.from(auth.replace(/^Bearer\s+/i, ''));
      const want = Buffer.from(token);
      if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return deny(401, 'Missing or wrong token.');
      if (target.pathname !== '/mcp') return deny(404, 'Not found.');
      if (req.method !== 'POST') return deny(405, 'Use POST.');
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) return deny(413, 'Request too large.');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      // Stateless: a fresh server and transport per request, all driving the same open window.
      const server = buildServer(() => getContents());
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) deny(500, error && error.message ? error.message : 'Server error.');
    }
  });
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', resolve);
  });
  return { server: srv, port: srv.address().port, token };
}

/** Stops the live MCP server, if it runs. */
async function stopLive() {
  if (!live) return;
  const server = live.server;
  live = null;
  await new Promise((resolve) => server.close(() => resolve()));
}

app.on('before-quit', () => {
  if (live) live.server.close();
});

module.exports = { registerAgentIpc, startHeadless, stopLive };
