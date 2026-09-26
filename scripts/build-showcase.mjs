// Launches scripts/build-showcase.cjs in Electron. Needs the dev server (npm run dev) running.
// Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, so it is removed (as in electron/dev.mjs).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const url = process.env.CHITTHI_DEV_URL || 'http://localhost:5173/';
try {
  await fetch(url);
} catch {
  console.error(`The dev server isn't running at ${url}. Start it with  npm run dev  in another terminal, then run this again.`);
  process.exit(1);
}
const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env, CHITTHI_DEV_URL: url, ...(process.argv.includes('--quote') ? { CHITTHI_TASK: 'quote' } : {}) };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, [new URL('./build-showcase.cjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'inherit', env }).on('exit', (c) => process.exit(c ?? 0));
