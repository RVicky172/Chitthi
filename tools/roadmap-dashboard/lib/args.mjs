// Command-line options of `npm run roadmap`.
export const DEFAULT_PORT = 5180;

export function parseArgs(argv) {
  const r = { port: DEFAULT_PORT, open: true, dev: false, help: false, root: null, staticDir: null, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') r.open = false;
    else if (a === '--dev') r.dev = true;
    else if (a === '-h' || a === '--help') r.help = true;
    else if (a === '--port' || a.startsWith('--port=')) {
      const v = a === '--port' ? argv[++i] : a.slice('--port='.length);
      if (!/^\d+$/.test(v ?? '') || Number(v) > 65535) r.error = '--port needs a number from 0 to 65535';
      else r.port = Number(v);
    } else if (a === '--root') r.root = argv[++i] ?? null; // another checkout (tests)
    else if (a === '--static') r.staticDir = argv[++i] ?? null; // serve a ready build, skip building (tests)
    else r.error = `Unknown option ${a}`;
  }
  return r;
}
