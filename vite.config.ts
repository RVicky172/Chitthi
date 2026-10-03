import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

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
    base: './',
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    server: { port: 5173, proxy },
    // Preview adds the server's Pexels key to /api/pexels: keep it on this machine, never on a public address.
    preview: { host: 'localhost', proxy, headers: csp ? { 'Content-Security-Policy': csp } : {} },
  };
});
