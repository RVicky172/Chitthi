// ESLint for the app (src/), the Electron main process (electron/), the Node scripts (scripts/) and dev tools (tools/). Run with `npm run lint`.
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/*
 * The coding standards (specs/coding-standards.md, 407 plan §4): names, JSDoc, sizes, cognitive complexity and the
 * layers' import direction, for the shipped code (src/, electron/) and the tests. They start as warnings everywhere;
 * a folder in FINISHED has them as errors (it joins when its 407 clean-up task is done). `npm run standards` counts
 * the findings per folder and rule.
 */

/** Folders whose standards rules are errors: globs, added as 407's clean-up tasks finish them. */
const FINISHED = [
  // 407 T030–T036: the whole engine (video core, timeline, renderer, layers and masks, photo pipeline, print, GPU).
  'src/engine/**',
];

/** The code the standards rules apply to. */
const STANDARDS_FILES = ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'electron/**/*.{cjs,mjs}'];

/** Files exempt from the size rules: data tables and tests (Q4). */
const SIZE_EXEMPT = ['src/data/**', 'tests/**'];

/** The layers' import direction (data → engine → state → components): each folder and what it must not import. */
const LAYERS = [
  {
    files: ['src/data/**'],
    group: ['../**', '!../types', '@/**', '!@/data/**', '!@/types'],
    message: 'src/data/ imports nothing of the app but the shared types (src/types.ts).',
  },
  {
    files: ['src/engine/**'],
    group: ['**/state/**', '**/components/**', '@/state/**', '@/components/**'],
    message: 'src/engine/ never imports state/ or components/ (layers depend downwards).',
  },
  { files: ['src/state/**'], group: ['**/components/**', '@/components/**'], message: 'src/state/ never imports components/.' },
];

/**
 * Sonar's recommended rules (cognitive complexity, duplicate strings, identical branches, nested ternaries …), less
 * its AWS CDK rules: there is no AWS code here, and they were a fifth of the lint time.
 */
const SONAR_RULES = Object.keys(sonarjs.configs.recommended.rules).filter(
  (rule) => sonarjs.configs.recommended.rules[rule] !== 'off' && !rule.startsWith('sonarjs/aws-'),
);

/**
 * The TypeScript files a tsconfig covers, so type-aware rules can run on them (tests/e2e and the root configs are in
 * no tsconfig).
 */
const TYPED_FILES = '{src/**/*.{ts,tsx},tests/{unit,integration,support,selftest}/**/*.ts}';

/**
 * A preset's rules at another severity, keeping their options.
 * @param {import('eslint').Linter.Config[]} preset a flat-config preset
 * @param {'warn' | 'error'} severity the new severity (rules turned off stay off)
 * @param {Set<string>} [skip] rules to leave out
 * @returns {import('eslint').Linter.RulesRecord} the rules
 */
function presetRules(preset, severity, skip = new Set()) {
  const rules = Object.assign({}, ...preset.map((config) => config.rules ?? {}));
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([rule]) => !skip.has(rule))
      .map(([rule, setting]) => {
        const [level, ...options] = Array.isArray(setting) ? setting : [setting];
        return [rule, level === 'off' || level === 0 ? 'off' : [severity, ...options]];
      }),
  );
}

/** typescript-eslint's `recommended` rules, already errors for all TypeScript: the strict presets don't change them. */
const TS_RECOMMENDED = new Set(Object.keys(Object.assign({}, ...tseslint.configs.recommended.map((config) => config.rules ?? {}))));

/**
 * The rules that need type information (AC-13) and React's current rules (AC-12), for TypeScript files.
 * @param {string[]} files the files' globs
 * @param {'warn' | 'error'} severity how a finding is reported
 * @returns {import('eslint').Linter.Config[]} the config blocks
 */
function typedStandards(files, severity) {
  return [
    {
      files: files.map((glob) => [glob, '**/*.{ts,tsx}']),
      plugins: { 'react-hooks': reactHooks },
      rules: presetRules([reactHooks.configs['recommended-latest']], severity, new Set(['react-hooks/rules-of-hooks'])),
    },
    {
      files: files.map((glob) => [glob, TYPED_FILES]),
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
      rules: {
        ...presetRules([...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked], severity, TS_RECOMMENDED),
        '@typescript-eslint/consistent-type-definitions': [severity, 'interface'],
        // Numbers in template strings are fine (`${percent} %`); objects, null and undefined still aren't (D-040).
        '@typescript-eslint/restrict-template-expressions': [severity, { allowNumber: true }],
        // A one-line arrow handler may call a void function (`onClick={() => setOpen(false)}`) (D-040).
        '@typescript-eslint/no-confusing-void-expression': [severity, { ignoreArrowShorthand: true }],
      },
    },
  ];
}

/**
 * The standards rules for some files, at one severity.
 * @param {string[]} files the files' globs (a folder, e.g. `src/engine/**`, or a file pattern)
 * @param {'warn' | 'error'} severity how a finding is reported
 * @returns {import('eslint').Linter.Config[]} the config blocks
 */
function standards(files, severity) {
  // React components are documented by their props interface and return JSX: no `@returns` for them.
  const notComponent = ':not([id.name=/^[A-Z]/])';
  return [
    {
      files,
      plugins: { jsdoc, sonarjs },
      rules: {
        'id-length': [severity, { min: 2, exceptions: ['_', 'x', 'y'], properties: 'never' }],
        'jsdoc/require-jsdoc': [
          severity,
          {
            publicOnly: true,
            require: { FunctionDeclaration: true, ArrowFunctionExpression: true, FunctionExpression: true, ClassDeclaration: true },
            contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
          },
        ],
        'jsdoc/require-param': [severity, { checkDestructuredRoots: false }],
        'jsdoc/require-returns': [
          severity,
          { contexts: [`FunctionDeclaration${notComponent}`, 'FunctionExpression', 'ArrowFunctionExpression'] },
        ],
        'max-lines-per-function': [severity, { max: 80, skipBlankLines: true, skipComments: true }],
        // A long file asks for a review, never an error (Q4).
        'max-lines': ['warn', { max: 800 }],
        ...Object.fromEntries(SONAR_RULES.map((rule) => [rule, severity])),
        'sonarjs/cognitive-complexity': [severity, 15],
      },
    },
    // In TypeScript the types are in the code, not in JSDoc (in plain .cjs / .mjs, JSDoc types are the types).
    { files: files.map((glob) => [glob, '**/*.{ts,tsx}']), rules: { 'jsdoc/no-types': severity } },
    // Components may be longer than functions (Q4).
    {
      files: files.map((glob) => [glob, '**/*.tsx']),
      rules: { 'max-lines-per-function': [severity, { max: 250, skipBlankLines: true, skipComments: true }] },
    },
    ...typedStandards(files, severity),
    { files: SIZE_EXEMPT, rules: { 'max-lines-per-function': 'off', 'max-lines': 'off' } },
    ...LAYERS.map((layer) => ({
      // Only the layer's files among `files` (a FINISHED file in another layer must not get this layer's rule).
      files: layer.files.flatMap((layerGlob) => files.map((glob) => [glob, layerGlob])),
      rules: { 'no-restricted-imports': [severity, { patterns: [{ group: layer.group, message: layer.message }] }] },
    })),
  ];
}

export default tseslint.config(
  { ignores: ['.claude', 'dist', 'dist-lib', 'tools/roadmap-dashboard/.build', 'release', 'node_modules', 'ds-bundle', '.design-sync', '.ds-sync', 'print-samples-src', 'Print Samples', 'electron/resources', 'test-results', 'playwright-report'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', '*.ts', 'tools/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    // The Rules of Hooks are errors everywhere; React's newer rules (recommended-latest) come with the standards below.
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
  ...standards(STANDARDS_FILES, 'warn'),
  ...(FINISHED.length ? standards(FINISHED, 'error') : []),
);
