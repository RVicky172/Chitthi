// ESLint for the app (src/), the Electron main process (electron/), the Node scripts (scripts/) and dev tools (tools/). Run with `npm run lint`.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-lib', 'tools/roadmap-dashboard/.build', 'release', 'node_modules', 'ds-bundle', '.design-sync', '.ds-sync', 'print-samples-src', 'Print Samples', 'electron/resources', 'test-results', 'playwright-report'] },
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts', '*.ts', 'tools/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    // The classic hook rules only: the app doesn't use the React Compiler, so its rules don't apply.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Callbacks keep their full positional signature (pattern painters take ctx, t, r, m), so unused args are fine.
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['electron/**/*.cjs', 'scripts/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  {
    files: ['electron/**/*.mjs', 'scripts/**/*.mjs', '*.js'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
  // Dev tooling in tools/ (specs/features/404): Node modules and their tests; its React app is linted with src/ above.
  {
    files: ['tools/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
);
