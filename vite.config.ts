import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

/**
 * Fails the production build when any chunk holds a module from tests/ (407 AC-3): tests, their helpers and the in-app
 * self-test never ship. (main.tsx loads the self-test only when `import.meta.env.DEV`, which the build removes.)
 * @returns the build-only plugin
 */
function noTestCode(): Plugin {
  return {
    name: 'chitthi:no-test-code',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        const testModule = Object.keys(output.modules).find((id) => /[\\/]tests[\\/]/.test(id));
        if (testModule) this.error(`${output.fileName} contains test code (${testModule}): app code must not import tests/`);
      }
    },
  };
}

/** The print renderer's modules (render.ts and what it draws through, engine/patterns.ts included). */
const PRINT_RENDERER =
  /[\\/]src[\\/]engine[\\/](render|themeBackground|printText|photoSlots|postalDecor|frontText|cardFront|cardBack|calendarDraw|patterns)\.ts$/;

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
  // vite preview serves the production Content Security Policy and Permissions-Policy from the nginx config, so the
  // browser tests (npm run test:e2e) catch anything they would block on a real server (the microphone, 209).
  const nginx = readFileSync('nginx/security-headers.conf', 'utf8');
  const csp = /Content-Security-Policy "([^"]+)"/.exec(nginx)?.[1];
  const permissions = /Permissions-Policy "([^"]+)"/.exec(nginx)?.[1];
  return {
    plugins: [react(), noTestCode()],
    // `@/` is `src/`: how tests (and, later, app code) import the app, whatever folder they are in (407 D1).
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    base: './',
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rolldownOptions: {
        output: {
          codeSplitting: {
            // Only these modules: their dependencies (design.ts, layout.ts …) stay where they were.
            includeDependenciesRecursively: false,
            // The print renderer stays one chunk, as when it was one file (render.ts until 407 T033): lazy screens
            // reach calendarDraw.ts alone, and without this the rest would fall into the entry chunk.
            groups: [{ name: 'render', test: PRINT_RENDERER }],
          },
        },
      },
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
    preview: {
      host: 'localhost',
      proxy,
      headers: { ...(csp ? { 'Content-Security-Policy': csp } : {}), ...(permissions ? { 'Permissions-Policy': permissions } : {}) },
    },
  };
});
