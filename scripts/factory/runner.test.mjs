// The orchestrator's runner (402 §5, T052): start checks, the implementer → gates → review → commit loop, the stash on
// every stop before a commit and the loop state, run against a throwaway git repo with a scripted `claude` and scripted
// gates (no real agent, no npm). AC-11, AC-12, AC-14.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gateLockPath, releaseLock, takeLock } from './lock.mjs';
import { depsChanged, fillPrompt, parseClaudeJson, prompts, runFeature, taskChecks } from './run.mjs';

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────

const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function git(root, ...args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}
const write = (root, p, text) => {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), text);
};
const read = (root, p) => readFileSync(join(root, p), 'utf8');

const TASKS = [
  '# 999 — Probe · Tasks',
  '',
  '## Work',
  '',
  '- [ ] **T010** — Add the greeting. · files: `src/a.mjs` · test: `src/a.test.mjs`',
  '- [ ] **T011** — Add the farewell. · files: `src/b.mjs`',
  '- [ ] **T090** — Verify the feature.',
  '',
].join('\n');
const PKG = JSON.stringify({ name: 'probe', private: true, scripts: { check: 'echo ok' }, devDependencies: { vitest: '^4.0.0' } }, null, 2) + '\n';

/** A temp repo shaped like Chitthi: roadmap, one feature folder, package.json; on `branch`. */
function makeRepo({ branch = 'feat/999-probe', tasks = TASKS } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'factory-runner-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Factory Test'], ['user.email', 'factory@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false'], ['core.hooksPath', '.git/no-hooks']])
    git(root, 'config', k, v);
  write(root, '.gitignore', 'node_modules/\n.factory/\n');
  write(root, 'package.json', PKG);
  write(root, 'specs/roadmap.md', '# Roadmap\n\n## Phase 9\n\n| # | Item | Spec | Status | Needs |\n| --- | --- | --- | --- | --- |\n| 999 | Probe greeting (P9.9) | [spec](features/999-probe/spec.md) | 🚧 | — |\n');
  write(root, 'specs/features/999-probe/spec.md', '# 999 — Probe greeting\n\n**Status:** Approved\n\n- [ ] **AC-1:** says hello.\n');
  write(root, 'specs/features/999-probe/plan.md', '# 999 — Plan\n\nWrite a greeting.\n');
  write(root, 'specs/features/999-probe/tasks.md', tasks);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  if (branch !== 'main') git(root, 'checkout', '-q', '-b', branch);
  return root;
}

/** What the implementer does to tasks.md: tick the task and add a dated Result note under it. */
function tick(root, id, note = true) {
  const p = 'specs/features/999-probe/tasks.md';
  const lines = read(root, p).split('\n');
  const i = lines.findIndex((l) => l.startsWith(`- [ ] **${id}**`));
  lines[i] = lines[i].replace('- [ ]', '- [x]');
  if (note) lines.splice(i + 1, 0, `  - **Result (2026-10-08):** done; check 5 passed.`);
  write(root, p, lines.join('\n'));
}

/** A scripted implementer step: edits the repo like an agent would and returns a recorded-looking result. */
const implement =
  ({ id = 'T010', file = 'src/a.mjs', marker = 'FACTORY: done', cost = 0.3, turns = 7, doTick = true, note = true, subtype = 'success', denials = [], edit } = {}) =>
  (root) => {
    write(root, file, `export const hello = () => 'hi ${Math.random()}';\n`);
    if (doTick && !read(root, 'specs/features/999-probe/tasks.md').includes(`- [x] **${id}**`)) tick(root, id, note);
    edit?.(root);
    return { result: `Wrote ${file}, tests green.\n\n${marker}`, subtype, costUsd: cost, turns, denials, structured: undefined };
  };
const review =
  (ok = true, reasons = [], cost = 0.1) =>
  () => ({ result: '', subtype: 'success', costUsd: cost, turns: 3, denials: [], structured: { ok, reasons } });

function fakeClaude(root, script) {
  const calls = [];
  const fn = async (call) => {
    calls.push(call);
    const step = script.shift();
    if (!step) throw new Error(`unexpected claude call for ${call.agent}`);
    return step(root, call);
  };
  return Object.assign(fn, { calls, left: script });
}

function fakeGates(results) {
  const calls = [];
  const fn = async (gates, info) => {
    calls.push({ gates, ...info });
    const ok = results.shift();
    if (ok === undefined) throw new Error('unexpected gate run');
    return { at: '2026-10-08T00:00:00.000Z', feature: info.feature, task: info.task, ok, gates: [{ name: 'check', ok, ms: 5, summary: ok ? '5 tests passed, lint clean' : 'unit: 1 failed' }] };
  };
  return Object.assign(fn, { calls });
}

async function run(root, script, gateResults, opts = {}) {
  const claude = fakeClaude(root, script);
  const gates = fakeGates(gateResults);
  const states = [];
  const lines = [];
  const result = await runFeature('999', { root, log: (l) => lines.push(l), ...opts }, { callClaude: claude, runGates: gates, onState: (s) => states.push(structuredClone(s)) });
  return { result, claude, gates, states, lines };
}

const commits = (root) => git(root, 'rev-list', '--count', 'main..HEAD');
const status = (root) => git(root, 'status', '--porcelain');
const stashes = (root) => git(root, 'stash', 'list', '--format=%gs');
const loopState = (root) => JSON.parse(read(root, '.factory/state.json'));

// ── pure helpers ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('fillPrompt', () => {
  it('fills every {{placeholder}}', () => {
    expect(fillPrompt('Task {{tasks}} of {{feature}}: {{feature}}', { tasks: 'T010', feature: '999' })).toBe('Task T010 of 999: 999');
  });
  it('refuses a placeholder it has no value for (a typo in a template)', () => {
    expect(() => fillPrompt('Do {{taks}}', { tasks: 'T010' })).toThrow(/taks/);
  });
});

describe('prompts (scripts/factory/prompts/*.md)', () => {
  const f = { id: '402', folder: '402-software-factory', title: 'Software factory' };
  const t10 = { id: 'T050', text: 'Failing tests for decide. · files: `run.test.mjs`' };
  const t11 = { id: 'T051', text: 'decide in run.mjs. · files: `run.mjs`' };

  it('implement: names the feature, the task, its text and the end marker', () => {
    const p = prompts.implement(f, [t11]);
    expect(p).toMatch(/402/);
    expect(p).toMatch(/specs\/features\/402-software-factory/);
    expect(p).toMatch(/T051/);
    expect(p).toMatch(/decide in run\.mjs/);
    expect(p).toMatch(/FACTORY: done/);
    expect(p).not.toMatch(/\{\{/);
  });

  it('implement: a test-first pair is done in one turn, both tasks named', () => {
    const p = prompts.implement(f, [t10, t11]);
    expect(p).toMatch(/T050 \+ T051/);
    expect(p).toMatch(/one turn/i);
  });

  it('retry: carries the feedback and the attempt', () => {
    const p = prompts.retry(f, [t11], { feedback: 'check: unit: 1 failed', attempt: 2, maxAttempts: 3 });
    expect(p).toMatch(/check: unit: 1 failed/);
    expect(p).toMatch(/2 of 3/);
    expect(p).toMatch(/FACTORY: done/);
    expect(p).not.toMatch(/\{\{/);
  });

  it('review: the task(s) and the scope of the change (git diff HEAD + untracked)', () => {
    const p = prompts.review(f, [t10, t11]);
    expect(p).toMatch(/T050 \+ T051/);
    expect(p).toMatch(/git diff HEAD/);
    expect(p).toMatch(/untracked/);
    expect(p).not.toMatch(/\{\{/);
  });
});

describe('taskChecks', () => {
  const text = ['- [x] **T010** — a', '  - **Result (2026-10-08):** done.', '- [x] **T011** — b', '- [ ] **T012** — c', '  - **Result (2026-10-08):** half.'].join('\n');
  it('ticked and dated Result note for every task of the batch', () => {
    expect(taskChecks(text, ['T010'])).toEqual({ ticked: true, resultNote: true });
    expect(taskChecks(text, ['T010', 'T011'])).toEqual({ ticked: true, resultNote: false });
    expect(taskChecks(text, ['T012'])).toEqual({ ticked: false, resultNote: true });
  });
  it('an undated Result note does not count', () => {
    expect(taskChecks('- [x] **T010** — a\n  - **Result:** done.', ['T010']).resultNote).toBe(false);
  });
});

describe('depsChanged', () => {
  const base = { scripts: { a: 'x' }, dependencies: { react: '^19' }, devDependencies: { vitest: '^4' } };
  it('sees added, removed and bumped packages', () => {
    expect(depsChanged(base, { ...base, dependencies: { react: '^19', zod: '^3' } })).toBe(true);
    expect(depsChanged(base, { ...base, devDependencies: {} })).toBe(true);
    expect(depsChanged(base, { ...base, devDependencies: { vitest: '^5' } })).toBe(true);
  });
  it('ignores scripts and key order', () => {
    expect(depsChanged(base, { devDependencies: { vitest: '^4' }, dependencies: { react: '^19' }, scripts: { factory: 'node x' } })).toBe(false);
  });
});

describe('parseClaudeJson', () => {
  it('reads the result event of --output-format json', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok\nFACTORY: done', num_turns: 12, total_cost_usd: 0.84, permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm -rf x' } }], structured_output: { ok: true, reasons: [] } });
    expect(parseClaudeJson(out)).toEqual({ result: 'ok\nFACTORY: done', subtype: 'success', costUsd: 0.84, turns: 12, denials: ['Bash: rm -rf x'], structured: { ok: true, reasons: [] } });
  });
  it('turns the max-turns error into its subtype', () => {
    expect(parseClaudeJson(JSON.stringify({ type: 'result', subtype: 'error_max_turns', num_turns: 41, total_cost_usd: 2 }))).toMatchObject({ subtype: 'error_max_turns', turns: 41, costUsd: 2, result: '' });
  });
  it('no JSON at all → an error result carrying the text', () => {
    expect(parseClaudeJson('Error: no schema with key or ref')).toMatchObject({ subtype: 'error_output', costUsd: 0, result: 'Error: no schema with key or ref' });
  });
});

// ── the runner ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('runFeature: start checks', () => {
  it('refuses on a branch that is not feat/999-*, calling nothing', async () => {
    const root = makeRepo({ branch: 'main' });
    const { result, claude } = await run(root, [implement()], [true], { once: true });
    expect(result.stop).toMatchObject({ kind: 'refused' });
    expect(result.stop.reason).toMatch(/feat\/999-/);
    expect(claude.calls).toHaveLength(0);
  });

  it('refuses another feature’s branch', async () => {
    const root = makeRepo({ branch: 'feat/998-other' });
    const { result } = await run(root, [], [], { once: true });
    expect(result.stop.kind).toBe('refused');
  });

  it('refuses a dirty tree and leaves it alone (no stash)', async () => {
    const root = makeRepo();
    write(root, 'notes.txt', 'mine');
    const { result, claude } = await run(root, [implement()], [true], { once: true });
    expect(result.stop).toMatchObject({ kind: 'refused' });
    expect(result.stop.reason).toMatch(/clean/);
    expect(claude.calls).toHaveLength(0);
    expect(stashes(root)).toBe('');
    expect(status(root)).toMatch(/notes\.txt/);
  });
});

describe('runFeature: the loop', () => {
  it('(a) one green task → one commit on the feature branch, its message, state phases, cost summed', async () => {
    const root = makeRepo();
    const { result, claude, gates, states } = await run(root, [implement({ cost: 0.3, turns: 7 }), review(true, [], 0.12)], [true], { once: true });
    expect(result.stop).toMatchObject({ kind: 'once' });
    expect(commits(root)).toBe('1');
    expect(git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feat/999-probe');
    expect(git(root, 'rev-list', '--count', 'main')).toBe('1'); // main untouched
    const msg = git(root, 'log', '-1', '--format=%B');
    expect(msg.split('\n')[0]).toBe('feat(999): add the greeting (P9.9)');
    expect(msg).toMatch(/Task: T010 \(999, run by the factory\)/);
    expect(msg).toMatch(/Co-Authored-By: Claude/);
    expect(git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual(['specs/features/999-probe/tasks.md', 'src/a.mjs']);
    expect(status(root)).toBe('');
    expect(result.costUsd).toBeCloseTo(0.42);
    expect(result.turns).toBe(10);
    // The calls: implementer with the D-014 list and the caps, then the reviewer with the verdict schema.
    expect(claude.calls.map((c) => c.agent)).toEqual(['implementer', 'reviewer']);
    const [ia, ra] = claude.calls.map((c) => c.args);
    expect(ia).toEqual(expect.arrayContaining(['--max-turns', '40', '--permission-mode', 'acceptEdits', '--allowedTools']));
    expect(ia[ia.indexOf('--max-budget-usd') + 1]).toBe('4.00');
    expect(ra[ra.indexOf('--json-schema') + 1]).toMatch(/"reasons"/);
    expect(ra[ra.indexOf('--json-schema') + 1]).not.toMatch(/\$schema/);
    expect(claude.calls[0].prompt).toMatch(/T010/);
    expect(gates.calls).toEqual([expect.objectContaining({ gates: ['check'], feature: '999', task: 'T010', root })]);
    // Loop state: every phase written, the last with the stop.
    expect(states.map((s) => s.phase)).toEqual(['start', 'implement', 'gates', 'review', 'commit', 'stopped']);
    const st = loopState(root);
    expect(st).toMatchObject({ feature: '999', task: 'T010', station: 'Implement', attempt: 1, costUsd: 0.42, turns: 10, stop: { kind: 'once' } });
    expect(st.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('its gate runs take the gate lock: waits for another line, shows it, runs holding it, releases it (AC-16)', async () => {
    const root = makeRepo();
    const lockFile = gateLockPath(root);
    const other = takeLock(lockFile, { feature: '204' }); // our own pid: alive, so held until released
    expect(other.taken).toBe(true);
    const claude = fakeClaude(root, [implement(), review(true)]);
    const ran = [];
    const runGatesBase = async (gates, info) =>
      info.withLock(async () => {
        ran.push({ gates, holder: JSON.parse(readFileSync(lockFile, 'utf8')).feature });
        return { at: '2026-10-08T00:00:00.000Z', feature: info.feature, task: info.task, ok: true, gates: [{ name: 'check', ok: true, ms: 5, summary: '5 tests passed' }] };
      });
    const states = [];
    const onState = (s) => {
      states.push(structuredClone(s));
      if (s.phase === 'waiting for gates: 204') {
        expect(loopState(root).phase).toBe('waiting for gates: 204'); // what the Loop panel reads
        setTimeout(() => releaseLock(lockFile, other.lock), 30);
      }
    };
    const result = await runFeature('999', { root, once: true, log: () => {} }, { callClaude: claude, runGatesBase, gatePollMs: 10, onState });
    expect(result.stop).toMatchObject({ kind: 'once' });
    expect(ran).toEqual([{ gates: ['check'], holder: '999' }]);
    expect(states.map((s) => s.phase)).toEqual(['start', 'implement', 'gates', 'waiting for gates: 204', 'gates', 'review', 'commit', 'stopped']);
    expect(existsSync(lockFile)).toBe(false);
    expect(commits(root)).toBe('1');
  });

  it('runs task after task up to Verify, one commit each', async () => {
    const root = makeRepo();
    const { result } = await run(root, [implement(), review(), implement({ id: 'T011', file: 'src/b.mjs' }), review()], [true, true]);
    expect(result.stop).toMatchObject({ kind: 'verify' });
    expect(result.commits).toHaveLength(2);
    expect(git(root, 'log', '-2', '--format=%s')).toBe('feat(999): add the farewell (P9.9)\nfeat(999): add the greeting (P9.9)');
    expect(status(root)).toBe('');
  });

  it('(b) red gates, then green on the retry → one commit, attempt 2, the feedback in the retry prompt', async () => {
    const root = makeRepo();
    const { result, claude, states } = await run(root, [implement(), implement(), review()], [false, true], { once: true });
    expect(result.stop.kind).toBe('once');
    expect(commits(root)).toBe('1');
    expect(claude.calls[1].agent).toBe('implementer');
    expect(claude.calls[1].prompt).toMatch(/check: unit: 1 failed/);
    expect(claude.calls[1].prompt).toMatch(/2 of 3/);
    expect(states.at(-2)).toMatchObject({ phase: 'commit', attempt: 2 });
  });

  it('a rejected review feeds its reasons into the retry', async () => {
    const root = makeRepo();
    const { claude } = await run(root, [implement(), review(false, [{ rule: 'test first', file: 'src/a.mjs', why: 'no test' }]), implement(), review()], [true, true], { once: true });
    expect(claude.calls[2].prompt).toMatch(/test first \(src\/a\.mjs\): no test/);
    expect(commits(root)).toBe('1');
  });

  it('(c) red three times → no commit, a stash naming the task and `retries`, tree clean, stop retries', async () => {
    const root = makeRepo();
    const { result, states } = await run(root, [implement(), implement(), implement()], [false, false, false], { once: true });
    expect(result.stop).toMatchObject({ kind: 'retries' });
    expect(commits(root)).toBe('0');
    expect(stashes(root)).toBe('On feat/999-probe: factory 999 T010 attempt 3: retries');
    expect(result.stop.stash).toMatch(/stash@\{0\}/);
    expect(result.stop.reason).toMatch(/stash@\{0\}/);
    expect(status(root)).toBe('');
    expect(loopState(root).stop).toMatchObject({ kind: 'retries', stash: result.stop.stash });
    expect(states.at(-1)).toMatchObject({ phase: 'stopped', attempt: 3 });
    // Nothing lost: the stash holds the agent's file.
    expect(git(root, 'stash', 'show', '--include-untracked', '--name-only', 'stash@{0}')).toMatch(/src\/a\.mjs/);
  });

  it('(d) FACTORY-STOP: dependency → stash, stop dependency with the agent’s reason', async () => {
    const root = makeRepo();
    const { result, gates } = await run(root, [implement({ marker: 'FACTORY-STOP: dependency: needs a zip library', doTick: false })], [], { once: true });
    expect(result.stop).toMatchObject({ kind: 'dependency' });
    expect(result.stop.reason).toMatch(/zip library/);
    expect(stashes(root)).toBe('On feat/999-probe: factory 999 T010 attempt 1: dependency');
    expect(status(root)).toBe('');
    expect(gates.calls).toHaveLength(0);
  });

  it('a package.json dependency added without a word → stop dependency, stashed', async () => {
    const root = makeRepo();
    const addDep = (r) => write(r, 'package.json', PKG.replace('"devDependencies": {', '"devDependencies": {\n    "left-pad": "^1.3.0",'));
    const { result } = await run(root, [implement({ edit: addDep })], [], { once: true });
    expect(result.stop.kind).toBe('dependency');
    expect(stashes(root)).toMatch(/attempt 1: dependency/);
  });

  it('the spec or plan changed → stop spec-change, stashed', async () => {
    const root = makeRepo();
    const { result } = await run(root, [implement({ edit: (r) => write(r, 'specs/features/999-probe/plan.md', '# changed\n') })], [], { once: true });
    expect(result.stop.kind).toBe('spec-change');
    expect(stashes(root)).toMatch(/spec-change/);
  });

  it('the turn cap → stop turns, stashed', async () => {
    const root = makeRepo();
    const { result } = await run(root, [implement({ subtype: 'error_max_turns', marker: '', doTick: false })], [], { once: true });
    expect(result.stop.kind).toBe('turns');
    expect(stashes(root)).toMatch(/attempt 1: turns/);
  });

  it('the budget spent → stop budget, stashed; the per-call cap never exceeds what is left', async () => {
    const root = makeRepo();
    const { result, claude } = await run(root, [implement({ cost: 0.6 })], [], { once: true, budgetUsd: 0.8 });
    expect(claude.calls[0].args[claude.calls[0].args.indexOf('--max-budget-usd') + 1]).toBe('0.80');
    expect(result.stop.kind).toBe('budget');
    expect(stashes(root)).toMatch(/attempt 1: budget/);
    expect(status(root)).toBe('');
  });

  it('reports permission denials in the retry feedback and the stop', async () => {
    const root = makeRepo();
    const denied = ['Bash: rm -rf dist'];
    const { result, claude } = await run(root, [implement({ doTick: false, denials: denied }), implement({ marker: 'FACTORY-STOP: question: which default?', denials: denied })], [], { once: true });
    expect(claude.calls[1].prompt).toMatch(/rm -rf dist/);
    expect(result.stop.kind).toBe('question');
    expect(result.stop.denials).toEqual(denied);
  });

  it('a stop before any task (Verify) stashes nothing and makes no call', async () => {
    const root = makeRepo({ tasks: '- [x] **T010** — a\n  - **Result (2026-10-08):** ok.\n- [ ] **T090** — Verify.\n' });
    const { result, claude } = await run(root, [], []);
    expect(result.stop.kind).toBe('verify');
    expect(claude.calls).toHaveLength(0);
    expect(stashes(root)).toBe('');
  });

  it('--plan prints the batch, the gate guess and the claude command lines, calling nothing', async () => {
    const root = makeRepo();
    const { result, claude, gates, lines } = await run(root, [], [], { plan: true });
    expect(claude.calls).toHaveLength(0);
    expect(gates.calls).toHaveLength(0);
    expect(result.plan).toMatchObject({ tasks: ['T010'], gates: ['check'] });
    const text = lines.join('\n');
    expect(text).toMatch(/claude -p .*--agent implementer/);
    expect(text).toMatch(/claude -p .*--agent reviewer .*--json-schema/);
    expect(existsSync(join(root, '.factory/state.json'))).toBe(false);
  });
});
