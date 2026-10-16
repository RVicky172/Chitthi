#!/usr/bin/env node
/*
 * The standards report (407 plan §1): per folder and rule, how far the code is from the coding standards, so every
 * task of 407 can record its folder's numbers going to 0. It counts:
 *   - the ESLint findings of the standards rules (names, JSDoc, sizes, cognitive complexity, React, types, layers),
 *     from ESLint's JSON output;
 *   - the errors `noUncheckedIndexedAccess` would add, from `tsc -p tsconfig.app.json` with the flag on (the flag is
 *     turned on for src/ once this count is 0, Q13).
 *
 *   npm run standards                     the table, and the JSON in standards-report.json
 *   npm run standards -- --folder src/engine  only src/engine and its subfolders
 *   npm run standards -- --json out.json  the JSON somewhere else
 *   npm run standards -- --by-rule        one column per rule instead of per standard
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The ESLint rules the coding standards add (plan §4); other rules are the old gate and are not counted. */
const STANDARDS_RULE = /^(id-length|max-lines|max-lines-per-function|no-restricted-imports|jsdoc\/|sonarjs\/|react-hooks\/|@typescript-eslint\/)/;
/** The name the compiler's unchecked-index errors are counted under. */
export const UNCHECKED_INDEX = 'tsc/noUncheckedIndexedAccess';
/** A compiler error's first line: `path(line,col): error TSnnnn: message` (continuation lines are indented). */
const TSC_ERROR = /^(\S[^(]*)\(\d+,\d+\): error TS\d+:/;

/**
 * @typedef {{ folder: string; rule: string }} Finding one finding, by the folder of its file and its rule
 * @typedef {{ filePath: string; messages: { ruleId: string | null }[] }} LintResult one file of ESLint's JSON output
 * @typedef {{ total: number; rules: Record<string, number> }} Counts a number of findings, in all and per rule
 * @typedef {{ total: number; rules: Record<string, number>; folders: Record<string, Counts> }} Report
 */

/**
 * The folder of a file, relative to the repo, with `/`.
 * @param {string} filePath the file's path, absolute or relative to `root`
 * @param {string} root the repo's folder
 * @returns {string} e.g. `src/engine/gpu`
 */
export function folderOf(filePath, root) {
  const parts = relative(root, filePath).split(/[\\/]/);
  return parts.slice(0, -1).join('/') || '.';
}

/**
 * The standards rules' findings in ESLint's JSON output.
 * @param {LintResult[]} lintResults ESLint's `--format json` output
 * @param {string} root the repo's folder
 * @returns {Finding[]} one per message of a standards rule
 */
export function lintFindings(lintResults, root) {
  return lintResults.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId !== null && STANDARDS_RULE.test(message.ruleId))
      .map((message) => ({ folder: folderOf(result.filePath, root), rule: /** @type {string} */ (message.ruleId) })),
  );
}

/**
 * The errors in the compiler's output (run with `noUncheckedIndexedAccess`, so on a clean tree every error is one of
 * the flag's).
 * @param {string} compilerOutput `tsc --pretty false` output
 * @param {string} root the repo's folder
 * @returns {Finding[]} one per error
 */
export function uncheckedIndexFindings(compilerOutput, root) {
  return compilerOutput
    .split(/\r?\n/)
    .map((line) => TSC_ERROR.exec(line)?.[1])
    .filter((filePath) => filePath !== undefined)
    .map((filePath) => ({ folder: folderOf(filePath, root), rule: UNCHECKED_INDEX }));
}

/**
 * Adds one finding to a count.
 * @param {Counts} counts the count to add to
 * @param {string} rule the finding's rule
 */
function addTo(counts, rule) {
  counts.total += 1;
  counts.rules[rule] = (counts.rules[rule] ?? 0) + 1;
}

/**
 * Counts findings per folder and rule.
 * @param {Finding[]} findings every finding
 * @param {string} [folderPrefix] only folders equal to this or under it
 * @returns {Report} totals and per-folder counts, folders sorted by name
 */
export function summarize(findings, folderPrefix = '') {
  const prefix = folderPrefix.replace(/\/+$/, '');
  const inScope = (folder) => !prefix || folder === prefix || folder.startsWith(`${prefix}/`);
  /** @type {Report} */
  const report = { total: 0, rules: {}, folders: {} };
  for (const { folder, rule } of findings.filter((finding) => inScope(finding.folder))) {
    addTo(report, rule);
    addTo((report.folders[folder] ??= { total: 0, rules: {} }), rule);
  }
  report.folders = Object.fromEntries(Object.entries(report.folders).sort(([left], [right]) => left.localeCompare(right)));
  return report;
}

/**
 * The table's columns, in order: each standard and the rules that count for it (the JSON keeps every rule).
 * @type {{ name: string; matches: (rule: string) => boolean }[]}
 */
export const GROUPS = [
  { name: 'names', matches: (rule) => rule === 'id-length' },
  { name: 'jsdoc', matches: (rule) => rule.startsWith('jsdoc/') },
  { name: 'function length', matches: (rule) => rule === 'max-lines-per-function' },
  { name: 'long files', matches: (rule) => rule === 'max-lines' },
  { name: 'complexity', matches: (rule) => rule === 'sonarjs/cognitive-complexity' },
  { name: 'sonar other', matches: (rule) => rule.startsWith('sonarjs/') },
  { name: 'react', matches: (rule) => rule.startsWith('react-hooks/') },
  { name: 'types', matches: (rule) => rule.startsWith('@typescript-eslint/') },
  { name: 'layers', matches: (rule) => rule === 'no-restricted-imports' },
  { name: 'unchecked index', matches: (rule) => rule === UNCHECKED_INDEX },
];

/**
 * The column a rule counts in: the first group that matches it.
 * @param {string} rule an ESLint rule, or `UNCHECKED_INDEX`
 * @returns {string} the group's name (the rule itself if none matches)
 */
export function groupOf(rule) {
  return GROUPS.find((group) => group.matches(rule))?.name ?? rule;
}

/**
 * Counts per table column.
 * @param {Counts} counts a folder's or the total's counts
 * @param {boolean} byRule one column per rule instead of per group
 * @returns {Record<string, number>} column name → count
 */
function columnsOf(counts, byRule) {
  /** @type {Record<string, number>} */
  const columns = {};
  for (const [rule, count] of Object.entries(counts.rules)) {
    const column = byRule ? rule : groupOf(rule);
    columns[column] = (columns[column] ?? 0) + count;
  }
  return columns;
}

/**
 * The report as a text table: one row per folder, one column per standard (or per rule), and a total row.
 * @param {Report} report the counts
 * @param {{ byRule?: boolean }} [options] `byRule`: one column per rule
 * @returns {string} the table, or a line saying there is nothing to fix
 */
export function formatTable(report, { byRule = false } = {}) {
  if (report.total === 0) return 'standards-report: 0 findings.';
  const order = GROUPS.map((group) => group.name);
  const rank = (column) => (order.includes(column) ? order.indexOf(column) : order.length);
  const columns = Object.keys(columnsOf(report, byRule)).sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
  const header = ['folder', ...columns, 'total'];
  const rowOf = (name, counts) => {
    const counted = columnsOf(counts, byRule);
    return [name, ...columns.map((column) => String(counted[column] ?? 0)), String(counts.total)];
  };
  const rows = Object.entries(report.folders).map(([folder, counts]) => rowOf(folder, counts));
  const totalRow = rowOf('total', report);
  const table = [header, ...rows, totalRow];
  const widths = header.map((_, column) => Math.max(...table.map((row) => row[column].length)));
  const line = (row) => row.map((cell, column) => (column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column]))).join('  ');
  return [line(header), ...rows.map(line), line(totalRow)].join('\n');
}

/**
 * Runs a command and returns its standard output (both tools exit 1 when they find something; that is expected).
 * @param {string} command the program
 * @param {string[]} args its arguments
 * @returns {string} its output
 */
function outputOf(command, args) {
  const run = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (run.error || (run.status !== 0 && run.status !== 1)) {
    throw new Error(`${command} ${args.join(' ')} failed (${run.status}): ${run.error?.message ?? run.stderr}`);
  }
  return run.stdout;
}

/**
 * The value after a command-line option.
 * @param {string} name e.g. `--folder`
 * @returns {string | undefined} its value, if given
 */
function option(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

// Run as a script (not when a test imports it).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = process.cwd();
  const lintResults = JSON.parse(outputOf('node', ['node_modules/eslint/bin/eslint.js', '.', '--format', 'json']));
  const compilerOutput = outputOf('node', [
    'node_modules/typescript-native/bin/tsc',
    ...['-p', 'tsconfig.app.json', '--noEmit', '--noUncheckedIndexedAccess', '--pretty', 'false', '--tsBuildInfoFile', 'null'],
  ]);
  const report = summarize([...lintFindings(lintResults, root), ...uncheckedIndexFindings(compilerOutput, root)], option('--folder'));
  const jsonPath = option('--json') ?? 'standards-report.json';
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${formatTable(report, { byRule: process.argv.includes('--by-rule') })}\n\n(JSON, every rule: ${jsonPath})`);
}
