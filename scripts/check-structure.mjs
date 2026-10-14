#!/usr/bin/env node
/*
 * Part of `npm run check` (407 AC-1): tests stay out of the app. Every test lives in tests/ (unit, integration,
 * support, e2e, selftest), so src/ holds no test file or test helper, and app code imports nothing from tests/,
 * except main.tsx loading the in-app self-test in development builds (import.meta.env.DEV, never in production).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Test files, by name. */
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
/** Test helpers, by name. */
const TEST_HELPER = /\.testkit\.[cm]?[jt]sx?$/;
/** Import specifiers in a file: static imports and exports, dynamic import(). */
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g;
/** The one import of tests/ the app may make. */
const ALLOWED = { path: 'src/main.tsx', specifier: '../tests/selftest/selftest' };

/**
 * What is wrong with the app's files.
 * @param {{ path: string; text: string }[]} files every file under src/, with paths relative to the repo and `/`
 * @returns {string[]} one line per problem, in the files' order; empty when the structure is right
 */
export function structureProblems(files) {
  const problems = [];
  for (const { path, text } of files) {
    if (TEST_FILE.test(path)) problems.push(`${path}: a test file in src/ (tests go in tests/unit, tests/integration or tests/e2e)`);
    else if (TEST_HELPER.test(path)) problems.push(`${path}: a test helper in src/ (it goes in tests/support)`);
    for (const match of text.matchAll(IMPORT)) {
      const specifier = match[2];
      if (!/(^|\/)tests\//.test(specifier)) continue;
      if (path === ALLOWED.path && specifier === ALLOWED.specifier) continue;
      problems.push(`${path}: imports '${specifier}' (app code must not import tests/)`);
    }
  }
  return problems;
}

/**
 * Every file under a folder, recursively.
 * @param {string} folder the folder to read
 * @returns {string[]} the files' paths
 */
function filesUnder(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

// Run as a script (not when a test imports it).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = filesUnder('src').map((path) => ({ path: relative('.', path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));
  const problems = structureProblems(files);
  if (problems.length) {
    console.error(`check-structure: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`check-structure: ${files.length} files in src/, no tests in them, none importing tests/.`);
}
