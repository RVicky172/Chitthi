#!/usr/bin/env node
/*
 * npm test: starts its own Vite dev server (its own port and dependency cache, so it never disturbs `npm run dev`),
 * runs scripts/test.cjs in Electron against it, and exits with the result.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const cacheDir = 'node_modules/.vite-test';
const server = await createServer({ configFile: 'vite.config.ts', cacheDir, logLevel: 'error', server: { port: 5198, strictPort: false } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5198/';
console.log(`Self-test against ${url}`);

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, CHITTHI_TEST_URL: url };
// Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would stop Electron opening a window.
delete env.ELECTRON_RUN_AS_NODE;
const code = await new Promise((done) =>
  spawn(electron, [new URL('./test.cjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'inherit', env }).on('exit', (c) => done(c ?? 1)),
);
await server.close();
rmSync(cacheDir, { recursive: true, force: true });
process.exit(code);
