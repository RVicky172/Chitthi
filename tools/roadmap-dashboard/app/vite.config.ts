// The roadmap dashboard's React app. Built by `npm run roadmap` into ../.build (git-ignored) and served by
// ../server.mjs; `npm run roadmap -- --dev` runs it through Vite's middleware with hot reload instead.
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: at('.'),
  base: '/',
  publicDir: false,
  plugins: [react()],
  logLevel: 'warn',
  build: {
    outDir: at('../.build'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0, // fonts as files: the CSP has no data: fonts
  },
  // The Schibsted Grotesk font is the app's own file under src/assets/fonts.
  server: { fs: { allow: [at('../../..')] } },
});
