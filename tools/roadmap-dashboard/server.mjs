#!/usr/bin/env node
// npm run roadmap [-- --port <n>] [-- --no-open] [-- --dev]: the roadmap dashboard on http://localhost:5180.
// Builds the React app (app/) into .build/ and serves it; --dev serves it through Vite with hot reload instead.
// See tools/roadmap-dashboard/README.md.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../specs-index/lib/paths.mjs';
import { DEFAULT_PORT, parseArgs } from './lib/args.mjs';
import { createDashboardServer } from './lib/server.mjs';

const APP_CONFIG = fileURLToPath(new URL('./app/vite.config.ts', import.meta.url));
const BUILD_DIR = fileURLToPath(new URL('./.build/', import.meta.url));

const HELP = `Usage: npm run roadmap [-- options]

  --port <n>   port on 127.0.0.1 (default ${DEFAULT_PORT}; 0 picks a free one)
  --no-open    don't open the browser
  --dev        serve the app through Vite with hot reload (for working on the dashboard)
  --help       this text

Reads specs/ and memory/; the only change it makes is moving a task on a board (and regenerating the Markdown
after any change to the JSON). Ctrl + C stops it.`;

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
if (args.error) {
  console.error(`roadmap: ${args.error}. Try npm run roadmap -- --help`);
  process.exit(1);
}

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  const fallback = () => console.log(`Open ${url} in your browser.`);
  try {
    const child = spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', fallback);
    child.unref();
  } catch {
    fallback();
  }
}

let staticDir = args.staticDir ? resolve(args.staticDir) : null;
if (!staticDir && !args.dev) {
  const started = Date.now();
  const { build } = await import('vite');
  await build({ configFile: APP_CONFIG, logLevel: 'warn' });
  staticDir = BUILD_DIR;
  console.log(`Built the dashboard in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

const server = createDashboardServer({ root: args.root ? resolve(args.root) : REPO_ROOT, staticDir });
if (args.dev) {
  const { createServer } = await import('vite');
  server.setVite(
    await createServer({ configFile: APP_CONFIG, appType: 'spa', server: { middlewareMode: true, hmr: { server } } }),
  );
}
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE')
    console.error(`roadmap: Port ${args.port} is in use. Try: npm run roadmap -- --port ${args.port + 1}`);
  else console.error(`roadmap: ${e.message}`);
  process.exit(1);
});
server.listen(args.port, '127.0.0.1', () => {
  const url = `http://localhost:${server.address().port}`;
  console.log(`Roadmap dashboard: ${url}${args.dev ? '  (dev, hot reload)' : ''}  (Ctrl + C stops it)`);
  if (args.open) openBrowser(url);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
