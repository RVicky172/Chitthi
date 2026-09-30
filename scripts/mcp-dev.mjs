#!/usr/bin/env node
/*
 * npm run mcp: Chitthi's MCP server from source, for development and for connecting agents to a checkout
 * (e.g. `claude mcp add chitthi-dev -- npm --prefix <repo> run --silent mcp`). Starts its own Vite dev server (own
 * port and dependency cache, silent: stdout carries the MCP protocol) and runs Electron with --mcp against it.
 * The installed app does the same with `Chitthi --mcp`.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// No trailing separator: on Windows a trailing backslash would escape the argument's closing quote.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const server = await createServer({
  root,
  configFile: `${root}/vite.config.ts`,
  cacheDir: `${root}/node_modules/.vite-mcp`,
  logLevel: 'silent',
  server: { port: 5197, strictPort: false },
});
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5197/';
process.stderr.write(`Chitthi MCP (dev) using ${url}\n`);

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, CHITTHI_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE; // set inside Electron-based editors; it would stop Electron opening a window
// stdio is inherited all the way down to the relay Chitthi starts (electron/mcp-stdio.cjs).
const child = spawn(electron, [root, '--mcp'], { stdio: 'inherit', env });
child.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
