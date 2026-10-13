import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

export default defineConfig(({ mode }) => {
  // PEXELS_API_KEY (from .env.local) has no VITE_ prefix, so it stays on the server: the dev and preview servers
  // forward ./api/pexels/* to api.pexels.com and add the key there. Without a key the app asks the user for one.
  const key = loadEnv(mode, process.cwd(), '').PEXELS_API_KEY?.trim();
  const proxy: Record<string, ProxyOptions> = key
    ? {
        '/api/pexels': {
          target: 'https://api.pexels.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/pexels/, ''),
          headers: { Authorization: key },
        },
      }
    : {};
  // vite preview serves the production Content Security Policy from the nginx config, so the browser tests
  // (npm run test:e2e) catch anything the policy would block on a real server.
  const csp = /Content-Security-Policy "([^"]+)"/.exec(readFileSync('nginx/security-headers.conf', 'utf8'))?.[1];
  return {
    plugins: [react()],
    // `@/` is `src/`: how tests (and, later, app code) import the app, whatever folder they are in (407 D1).
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    base: './',
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    // The segmentation worker (src/ai/segment/) is an ES module worker: ONNX Runtime Web imports modules.
    worker: { format: 'es' },
    // ONNX Runtime Web is already an ES module; pre-bundling it on first use would reload the dev page mid-run.
    optimizeDeps: { exclude: ['onnxruntime-web'] },
    // Agent worktrees (.claude/worktrees, D-030) hold copies of the repo: not watched, not tested twice.
    server: { port: 5173, proxy, watch: { ignored: ['**/.claude/worktrees/**'] } },
    // Unit and integration tests live in tests/ (407); the dev tools keep theirs. src/ is still listed while they move.
    test: {
      include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'src/**/*.test.ts', 'tools/**/*.test.{ts,mjs}'],
      exclude: [...configDefaults.exclude, '.claude/**'],
    },
    // Preview adds the server's Pexels key to /api/pexels: keep it on this machine, never on a public address.
    preview: { host: 'localhost', proxy, headers: csp ? { 'Content-Security-Policy': csp } : {} },
  };
});
