/*
 * Desktop launcher.
 *   node electron/dev.mjs         Vite dev server + Electron pointed at it (hot reload keeps working)
 *   node electron/dev.mjs --prod  Electron on the built dist/, as users get it
 */
import { spawn } from 'node:child_process';
import electronPath from 'electron';

// Editors built on Electron (VS Code) export ELECTRON_RUN_AS_NODE, which would start Electron as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let server = null;
if (!process.argv.includes('--prod')) {
  const { createServer } = await import('vite');
  server = await createServer();
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) {
    console.error('Vite dev server did not start.');
    process.exit(1);
  }
  env.CHITTHI_DEV_URL = url;
  console.log(`Chitthi desktop (dev) → ${url}`);
}

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('exit', async (code) => {
  await server?.close();
  process.exit(code ?? 0);
});
