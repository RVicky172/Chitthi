#!/usr/bin/env node
/*
 * Gates as code (402 plan §2): the gates a change needs, from the rules in specs/workflow.md, run in order, each
 * recorded in .factory/runs/<time>-<feature>-<task>.json (software-factory.md §4.3) for the dashboard and the
 * task's Result note.
 *   node scripts/factory/gates.mjs [--verify] [--feature NNN] [--task Tnnn] [--area ui:editors] [--dry]
 * Changed files come from git (against HEAD, plus untracked). --verify runs the whole Definition of Done; --dry
 * prints the gates without running them. Exits 1 if a gate is red.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withGateLock } from './lock.mjs';

export const DOD = ['check', 'build', 'e2e', 'selftest', 'mcp', 'licenses'];
const ORDER = ['check', 'build', 'selftest', 'e2e', 'mcp', 'licenses'];

const norm = (p) => p.replace(/\\/g, '/');
const isTest = (p) => /\.test\.[cm]?[jt]sx?$/.test(p);
const CODE = /^(src|electron|scripts|e2e)\/|^[^/]+\.config\.[cm]?[jt]s$|^package(-lock)?\.json$|^tsconfig[^/]*\.json$|^index\.html$/;
const SELFTEST = /^src\/(engine|data|agent|dev|ai)\//; // what renders, exports or is an agent tool (testing-strategy.md)
const MCP = /^electron\/|^src\/agent\/|^scripts\/mcp-[^/]+$/;
const LICENSES = /^package(-lock)?\.json$/;
const BUILD = /^nginx\/|^[^/]*vite\.config\.ts$|^scripts\/check-bundle\.mjs$|^index\.html$/;
const UI = /^src\/(components|state|styles)\/|^src\/(App|main)\.tsx$|^src\/styles\.css$|^src\/data\/docs\.ts$|^index\.html$|^nginx\//;

/** The e2e file that covers a UI path (e2e/<area>.e2e.ts). */
const AREAS = [
  [/^src\/data\/docs\.ts$|^src\/components\/DocsPage\.tsx$/, 'docs'],
  [/^src\/components\/(studio|ig)\/|^src\/state\/video\.ts$|^src\/styles\/36-media-studio\.css$/, 'editors'],
  [/^src\/components\/(InstagramStudio\.tsx|SettingsDialog\.tsx|ai\/)|^src\/state\/instagram\.ts$|^src\/styles\/35-instagram\.css$/, 'instagram'],
];
function e2eArea(p, task) {
  const e2e = /^e2e\/([^/]+)\.e2e\.ts$/.exec(p);
  if (e2e) return e2e[1];
  if (!UI.test(p) || isTest(p)) return null;
  if (task.area?.startsWith('ui:')) return task.area.slice(3);
  return AREAS.find(([re]) => re.test(p))?.[1] ?? 'app';
}

/** The gates a change needs, in run order: check, build, selftest, e2e:<area>…, mcp, licenses. */
export function chooseGates(paths, task = {}, { verify = false } = {}) {
  if (verify) return [...DOD];
  const gates = new Set();
  const areas = [];
  for (const p of paths.map(norm)) {
    if (CODE.test(p)) gates.add('check');
    if (BUILD.test(p)) gates.add('build');
    if (SELFTEST.test(p) && !isTest(p)) gates.add('selftest');
    if (MCP.test(p)) gates.add('mcp');
    if (LICENSES.test(p)) gates.add('licenses');
    const a = e2eArea(p, task);
    if (a && !areas.includes(a)) areas.push(a);
  }
  return ORDER.flatMap((g) => (g === 'e2e' ? areas.map((a) => `e2e:${a}`) : gates.has(g) ? [g] : []));
}

const COMMANDS = { check: 'npm run check', build: 'npm run build', e2e: 'npm run test:e2e', selftest: 'npm test', mcp: 'npm run test:mcp', licenses: 'npm run check:licenses' };
export const commandFor = (gate) => (gate.startsWith('e2e:') ? `npx playwright test e2e/${gate.slice(4)}.e2e.ts` : COMMANDS[gate]);

const lastLine = (output) => output.trim().split(/\r?\n/).filter(Boolean).pop()?.trim() ?? '';

function summarizeE2e(output) {
  const counts = [];
  const names = { failed: [], flaky: [] };
  let list = null;
  for (const line of output.split(/\r?\n/)) {
    const c = /^\s+(\d+) (passed|failed|flaky|skipped|did not run)\b/.exec(line);
    if (c) {
      counts.push([c[2], c[1]]);
      list = names[c[2]] ?? null;
    } else if (list && /›/.test(line)) list.push(line.split('›').pop().replace(/[─\s]+$/, '').trim());
    else if (list && line.trim()) list = null;
  }
  const order = ['passed', 'failed', 'flaky', 'skipped', 'did not run'];
  const text = counts.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, n]) => `${n} ${k}`).join(', ');
  const detail = [names.failed.join('; '), names.flaky.length ? `flaky: ${names.flaky.join('; ')}` : ''].filter(Boolean).join('; ');
  return { failed: names.failed.length > 0 || counts.some(([k, n]) => k === 'failed' && n !== '0'), summary: (text || lastLine(output)) + (detail ? `: ${detail}` : '') };
}

function summarizeCheck(output) {
  const ts = (output.match(/error TS\d+/g) ?? []).length;
  if (ts) return `typecheck: ${ts} error${ts === 1 ? '' : 's'}`;
  const lint = /✖ \d+ problems? \((\d+) errors?, (\d+) warnings?\)/.exec(output);
  if (lint && lint[1] !== '0') return `lint: ${lint[1]} error${lint[1] === '1' ? '' : 's'}`;
  const failed = /Tests\s+(\d+) failed/.exec(output);
  if (failed) return `unit: ${failed[1]} failed`;
  const passed = /Tests\s+(\d+) passed/.exec(output);
  if (!passed) return lastLine(output);
  return `${passed[1]} tests passed, lint ${lint ? `${lint[1]} errors / ${lint[2]} warnings` : 'clean'}`;
}

/** What a gate's output says, in one line; a non-zero exit is always red. */
export function summarize(gate, output, code) {
  let ok = code === 0;
  let summary;
  if (gate === 'check') summary = summarizeCheck(output);
  else if (gate === 'e2e' || gate.startsWith('e2e:')) {
    const e = summarizeE2e(output);
    summary = e.summary;
    if (e.failed) ok = false;
  } else if (gate === 'selftest') {
    const s = /(\d+) checks passed, (\d+) failed/.exec(output);
    const fails = [...output.matchAll(/^\s*✗ (.+)$/gm)].slice(0, 3).map((m) => m[1].trim());
    summary = s ? `${s[1]} checks passed, ${s[2]} failed${fails.length ? `: ${fails.join('; ')}` : ''}` : lastLine(output);
    if (s && s[2] !== '0') ok = false;
  } else if (gate === 'mcp') summary = /MCP smoke test passed/.test(output) ? 'MCP smoke test passed' : (/^(\d+ failed)$/m.exec(output)?.[1] ?? lastLine(output));
  else if (gate === 'licenses') {
    const l = /(\d+) shipped packages, all on the allowed list/.exec(output);
    summary = l ? `${l[1]} shipped packages, all allowed` : lastLine(output);
  } else summary = lastLine(output);
  return { ok, summary };
}

/** Runs one shell command in root; resolves with its exit code and its combined output (also echoed). */
export function execCommand(cmd, root, { echo = true } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE; // the self-test and MCP suites must open Electron (CLAUDE.md)
    const child = spawn(cmd, { cwd: root, shell: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const take = (chunk) => {
      output += chunk;
      if (echo) process.stdout.write(chunk);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
    child.on('error', (e) => resolve({ code: 1, output: output + String(e) }));
  });
}

/**
 * Runs the gates in order and records the run. A red `check` (the fast gate) stops the run: later gates would only
 * repeat its failure. `withLock` serialises gate runs between lines (402 §6): the command line passes the gate lock
 * (lock.mjs); the default just runs, for tests.
 */
export async function runGates(gates, { feature = '—', task = '—', root = process.cwd(), exec = execCommand, now = () => new Date(), withLock = (fn) => fn() } = {}) {
  const at = now();
  const results = [];
  await withLock(async () => {
    for (const name of gates) {
      const t0 = performance.now();
      const { code, output } = await exec(commandFor(name), root);
      const r = { name, ...summarize(name, output, code), ms: Math.round(performance.now() - t0) };
      results.push(r);
      if (name === 'check' && !r.ok) break;
    }
  });
  const run = { at: at.toISOString(), feature, task, ok: results.every((g) => g.ok), gates: results };
  const dir = join(root, '.factory/runs');
  mkdirSync(dir, { recursive: true });
  const stamp = at.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  writeFileSync(join(dir, `${stamp}-${feature}-${task}.json`), JSON.stringify(run, null, 2) + '\n');
  return run;
}

async function changedFiles(root) {
  const git = async (args) => (await execCommand(`git ${args}`, root, { echo: false })).output.split(/\r?\n/).filter(Boolean);
  return [...new Set([...(await git('diff --name-only HEAD')), ...(await git('ls-files --others --exclude-standard'))])];
}

async function main(argv) {
  const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const root = process.cwd();
  const branch = (await execCommand('git rev-parse --abbrev-ref HEAD', root, { echo: false })).output.trim();
  const feature = opt('--feature') ?? /^feat\/(\d{3})-/.exec(branch)?.[1] ?? '—';
  const task = opt('--task') ?? '—';
  const verify = argv.includes('--verify');
  const files = verify ? [] : await changedFiles(root);
  const gates = chooseGates(files, { area: opt('--area') }, { verify });
  console.log(`Gates for ${feature} ${task} (${verify ? 'Definition of Done' : `${files.length} changed files`}): ${gates.join(', ') || 'none'}`);
  if (argv.includes('--dry')) return 0;
  const withLock = (fn) =>
    withGateLock(fn, {
      root,
      feature,
      onWait: (h) => console.log(`waiting for gates: ${h.feature} (pid ${h.pid ?? '?'}, since ${h.since ?? '?'})`),
    });
  const run = await runGates(gates, { feature, task, root, withLock });
  console.log('\nGate run:');
  for (const g of run.gates) console.log(`  ${g.ok ? '✓' : '✗'} ${g.name.padEnd(14)} ${String(Math.round(g.ms / 1000)).padStart(4)} s  ${g.summary}`);
  console.log(run.ok ? 'All gates green.' : 'A gate is red.');
  return run.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(await main(process.argv.slice(2)));
