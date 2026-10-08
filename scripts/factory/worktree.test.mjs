// The loop's command line, its worktree line and batch intake (402 §6, T061): argument handling, where a feature's
// worktree goes and which branch it uses, the worktree made in a throwaway repo (junctions to the main checkout's
// git-ignored folders, removed junctions first), and the checks on what a spec-writer run may change. AC-15, AC-16.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gateLockPath, releaseLock, takeLock } from './lock.mjs';
import { featureBranch, intakeCheck, lockedGates, parseArgs, prepareWorktree, prompts, removeWorktree, runIntake, worktreeDir } from './run.mjs';

describe('parseArgs', () => {
  it('reads a feature run with its flags and defaults', () => {
    expect(parseArgs(['402'])).toEqual({ nnn: '402', once: false, plan: false, budgetUsd: 10, maxTurns: 40, worktree: false, removeWorktree: false, intake: null });
    expect(parseArgs(['--budget', '3', '203', '--once', '--max-turns', '20', '--worktree'])).toMatchObject({ nnn: '203', once: true, budgetUsd: 3, maxTurns: 20, worktree: true });
  });

  it('reads --intake with a comma list (and a list in the next words), no feature number', () => {
    expect(parseArgs(['--intake', '203,204'])).toMatchObject({ nnn: null, intake: ['203', '204'] });
    expect(parseArgs(['--intake', '203, 204,205', '--budget', '4'])).toMatchObject({ intake: ['203', '204', '205'], budgetUsd: 4 });
    expect(parseArgs(['--intake', '203,203'])).toMatchObject({ intake: ['203'] });
  });

  it('refuses what makes no sense, with the usage', () => {
    for (const argv of [
      [],
      ['40'],
      ['402', '403'],
      ['402', '--budget'],
      ['402', '--budget', '-1'],
      ['402', '--max-turns', 'x'],
      ['--intake'],
      ['--intake', '203,x'],
      ['--intake', '203', '204'],
      ['402', '--intake', '203'],
      ['--intake', '203', '--worktree'],
      ['402', '--worktree', '--remove-worktree'],
      ['402', '--frobnicate'],
    ])
      expect(() => parseArgs(argv), argv.join(' ')).toThrow(/usage/);
  });

  it('reads --remove-worktree for one feature', () => {
    expect(parseArgs(['203', '--remove-worktree'])).toMatchObject({ nnn: '203', removeWorktree: true, worktree: false });
  });
});

describe('worktreeDir and featureBranch', () => {
  it('puts the worktree next to the main checkout, in <name>-wt/NNN', () => {
    const main = join('D:', 'CodeBase', 'Chitthi');
    expect(worktreeDir(main, '203')).toBe(join('D:', 'CodeBase', 'Chitthi-wt', '203'));
  });

  it('uses the one existing feat/NNN-* branch', () => {
    expect(featureBranch('203', ['main', 'feat/203-compositing', 'feat/2030-x'], [])).toEqual({ branch: 'feat/203-compositing', create: false });
  });

  it('creates feat/<folder> from the feature folder when the branch is missing', () => {
    expect(featureBranch('203', ['main', 'feat/204-decoder'], ['202-edit-operations', '203-compositing'])).toEqual({ branch: 'feat/203-compositing', create: true });
  });

  it('refuses two candidate branches, or no branch and no folder', () => {
    expect(() => featureBranch('203', ['feat/203-a', 'feat/203-b'], [])).toThrow(/feat\/203-a, feat\/203-b/);
    expect(() => featureBranch('203', ['main'], ['204-x'])).toThrow(/no feat\/203-\* branch and no specs\/features\/203-\*/);
  });
});

// ── A throwaway repo shaped like Chitthi (main checkout with git-ignored node_modules and resources) ─────────────

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

function makeRepo() {
  const base = mkdtempSync(join(tmpdir(), 'factory-wt-'));
  roots.push(base);
  const root = join(base, 'Chitthi');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Factory Test'], ['user.email', 'factory@example.invalid'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false'], ['core.hooksPath', '.git/no-hooks']])
    git(root, 'config', k, v);
  // As in Chitthi: `node_modules` without a slash, the resources with one (a junction is not a directory to git).
  write(root, '.gitignore', 'node_modules\nelectron/resources/fonts/\nelectron/resources/libraw/\n.factory/\n');
  write(root, 'specs/roadmap.md', '# Roadmap\n\n| # | Item | Spec | Status | Needs |\n| --- | --- | --- | --- | --- |\n| 203 | Compositing (P2.3) | — | ⬜ | — |\n| 204 | Decoder pool (P2.4) | — | ⬜ | — |\n');
  write(root, 'specs/features/203-compositing/spec.md', '# 203 — Compositing\n\n**Status:** Approved\n');
  write(root, 'README.md', 'probe\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  write(root, 'node_modules/vitest/index.js', 'export {};\n');
  write(root, 'electron/resources/libraw/dcraw_emu.exe', 'bin');
  return root;
}

describe('prepareWorktree and removeWorktree (a real git repo)', () => {
  it('creates feat/203-* from main in <name>-wt/203, links node_modules and the resources, and is clean', () => {
    const root = makeRepo();
    git(root, 'checkout', '-q', '-b', 'feat/402-x'); // whatever the main checkout is on, the new branch starts at main
    write(root, 'other.md', 'not on main\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'other');
    const logs = [];
    const wt = prepareWorktree('203', { root, log: (l) => logs.push(l) });
    expect(wt.path).toBe(join(dirname(root), `${basename(root)}-wt`, '203'));
    expect(wt).toMatchObject({ branch: 'feat/203-compositing', created: true });
    expect(wt.links).toEqual(['node_modules', 'electron/resources/libraw']); // fonts: not in the main checkout
    expect(git(wt.path, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feat/203-compositing');
    expect(git(wt.path, 'rev-parse', 'HEAD')).toBe(git(root, 'rev-parse', 'main'));
    expect(existsSync(join(wt.path, 'other.md'))).toBe(false);
    expect(lstatSync(join(wt.path, 'node_modules')).isSymbolicLink()).toBe(true);
    expect(readdirSync(join(wt.path, 'node_modules'))).toEqual(['vitest']);
    expect(existsSync(join(wt.path, 'electron/resources/libraw/dcraw_emu.exe'))).toBe(true);
    expect(git(wt.path, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(logs.join('\n')).toMatch(/feat\/203-compositing/);

    // Run again: the same worktree, nothing new.
    expect(prepareWorktree('203', { root, log: () => {} })).toMatchObject({ path: wt.path, created: false, links: [] });

    // Removal: the junctions first, so nothing is deleted through them; then the worktree. The branch stays.
    const removed = removeWorktree('203', { root, log: () => {} });
    expect(removed).toMatchObject({ path: wt.path, unlinked: ['node_modules', 'electron/resources/libraw'] });
    expect(existsSync(wt.path)).toBe(false);
    expect(existsSync(join(root, 'node_modules/vitest/index.js'))).toBe(true);
    expect(existsSync(join(root, 'electron/resources/libraw/dcraw_emu.exe'))).toBe(true);
    expect(git(root, 'branch', '--list', 'feat/203-compositing')).toMatch(/feat\/203-compositing/);
  });

  it('makes the worktree again when its folder was deleted by hand (prunes the stale entry first)', () => {
    const root = makeRepo();
    const wt = prepareWorktree('203', { root, log: () => {} });
    for (const p of wt.links) rmdirSync(join(wt.path, p)); // the links first, as always (only the links go)
    rmSync(wt.path, { recursive: true, force: true });
    expect(existsSync(join(root, 'node_modules/vitest/index.js'))).toBe(true);
    const again = prepareWorktree('203', { root, log: () => {} });
    expect(again).toMatchObject({ path: wt.path, branch: 'feat/203-compositing', created: false, links: ['node_modules', 'electron/resources/libraw'] });
    expect(existsSync(join(wt.path, 'README.md'))).toBe(true);
    removeWorktree('203', { root, log: () => {} });
  });

  it('uses an existing feat/NNN-* branch as it is', () => {
    const root = makeRepo();
    git(root, 'branch', 'feat/204-decoder-pool');
    const wt = prepareWorktree('204', { root, log: () => {} });
    expect(wt).toMatchObject({ branch: 'feat/204-decoder-pool', created: false });
    removeWorktree('204', { root, log: () => {} });
  });

  it('refuses a branch checked out in the main checkout, and a feature with no branch or folder', () => {
    const root = makeRepo();
    git(root, 'checkout', '-q', '-b', 'feat/203-compositing');
    expect(() => prepareWorktree('203', { root, log: () => {} })).toThrow(/checked out in/);
    expect(() => prepareWorktree('205', { root, log: () => {} })).toThrow(/no feat\/205-\*/);
  });

  it('refuses to remove a worktree that does not exist', () => {
    const root = makeRepo();
    expect(() => removeWorktree('203', { root, log: () => {} })).toThrow(/no worktree/);
  });
});

// ── Batch intake ─────────────────────────────────────────────────────────────────────────────────────────────────

const DRAFT = '# 204 — Decoder pool\n\n**Status:** Draft\n\n## Open Questions\n\n- **Q1** [NEEDS CLARIFICATION] How many? _Proposed:_ 4.\n- **Q2** [NEEDS CLARIFICATION] x\n';

describe('lockedGates (the loop takes the gate lock, so two lines never run gates at once)', () => {
  it('waits while another line holds the lock, says so, then runs and releases it', async () => {
    const root = makeRepo();
    const path = gateLockPath(root);
    const other = takeLock(path, { feature: '204' }); // our own pid: alive, so held until released
    expect(other.taken).toBe(true);
    const events = [];
    const run = (gates, info) => info.withLock(async () => (events.push(`run ${info.feature} ${gates.join(',')}`), { ok: true, gates: [] }));
    const gatesRun = lockedGates({ pollMs: 20, run, onWait: (h) => events.push(`wait ${h.feature}`), onTaken: () => events.push('taken') });
    setTimeout(() => releaseLock(path, other.lock), 100);
    const r = await gatesRun(['check'], { feature: '203', task: 'T010', root });
    expect(r.ok).toBe(true);
    expect(events).toEqual(['wait 204', 'taken', 'run 203 check']);
    expect(existsSync(path)).toBe(false);
  });
});

describe('intakeCheck', () => {
  it('accepts a Draft spec in its folder and the roadmap row, counting the open questions', () => {
    const r = intakeCheck({ nnn: '204', changed: ['specs/features/204-decoder-pool/spec.md', 'specs/roadmap.md'], specs: { 'specs/features/204-decoder-pool/spec.md': DRAFT } });
    expect(r).toEqual({ ok: true, problems: [], spec: 'specs/features/204-decoder-pool/spec.md', questions: 2 });
  });

  it('flags a missing spec, a status other than Draft, a plan, tasks or code', () => {
    expect(intakeCheck({ nnn: '204', changed: ['specs/roadmap.md'], specs: {} }).problems).toEqual(['no specs/features/204-*/spec.md was written']);
    const approved = intakeCheck({ nnn: '204', changed: ['specs/features/204-x/spec.md'], specs: { 'specs/features/204-x/spec.md': DRAFT.replace('Draft', 'Approved') } });
    expect(approved.problems).toEqual(['specs/features/204-x/spec.md is not `**Status:** Draft`']);
    const more = intakeCheck({ nnn: '204', changed: ['specs/features/204-x/spec.md', 'specs/features/204-x/plan.md', 'src/a.ts', 'specs/features/203-y/spec.md'], specs: { 'specs/features/204-x/spec.md': DRAFT } });
    expect(more.ok).toBe(false);
    expect(more.problems).toEqual(['changed files outside the draft and the roadmap: specs/features/204-x/plan.md, src/a.ts, specs/features/203-y/spec.md']);
  });
});

describe('runIntake (scripted spec-writer, real repo)', () => {
  const writer =
    (root, { extra, status = 'Draft', cost = 0.2 } = {}) =>
    async ({ agent, prompt }) => {
      const nnn = /\*\*(\d{3})\b/.exec(prompt)[1];
      const folder = nnn === '204' ? '204-decoder-pool' : `${nnn}-item`;
      write(root, `specs/features/${folder}/spec.md`, DRAFT.replace('204', nnn).replace('Draft', status));
      extra?.(root, nnn);
      return { agent, result: `Draft written. Open questions: Q1, Q2.`, subtype: 'success', costUsd: cost, turns: 9, denials: [] };
    };

  it('drafts each item with the spec-writer, skips items with a spec, and reports the drafts', async () => {
    const root = makeRepo();
    const calls = [];
    const call = writer(root);
    const r = await runIntake(['203', '204', '205'], { root, log: () => {} }, { callClaude: (c) => (calls.push(c), call(c)) });
    expect(calls.map((c) => c.agent)).toEqual(['spec-writer']); // 203 has a spec; 205 is not on the roadmap
    expect(calls[0].prompt).toMatch(/\*\*204 — Decoder pool \(P2\.4\)\*\*/);
    expect(calls[0].args).toEqual(expect.arrayContaining(['--permission-mode', 'acceptEdits', '--max-turns', '40']));
    expect(r.items).toEqual([
      { nnn: '203', outcome: 'skipped', why: 'specs/features/203-compositing/ exists already' },
      { nnn: '204', outcome: 'drafted', spec: 'specs/features/204-decoder-pool/spec.md', questions: 2 },
      { nnn: '205', outcome: 'skipped', why: '205 is not on specs/roadmap.md' },
    ]);
    expect(r).toMatchObject({ stop: null, costUsd: 0.2, turns: 9 });
  });

  it('stops the batch at a draft that wrote more than a spec, leaving the files for a person', async () => {
    const root = makeRepo();
    const call = writer(root, { extra: (root, nnn) => write(root, `specs/features/${nnn}-item/plan.md`, 'plan') });
    write(root, 'specs/roadmap.md', '| # | Item | Spec | Status | Needs |\n| --- | --- | --- | --- | --- |\n| 205 | A (P2.5) | — | ⬜ | — |\n| 206 | B (P2.6) | — | ⬜ | — |\n');
    const r = await runIntake(['205', '206'], { root, log: () => {} }, { callClaude: call });
    expect(r.items).toEqual([{ nnn: '205', outcome: 'problem', problems: ['changed files outside the draft and the roadmap: specs/features/205-item/plan.md'] }]);
    expect(r.stop).toMatchObject({ kind: 'question' });
    expect(existsSync(join(root, 'specs/features/205-item/plan.md'))).toBe(true);
  });

  it('stops on the budget before a call it cannot afford', async () => {
    const root = makeRepo();
    write(root, 'specs/roadmap.md', '| # | Item | Spec | Status | Needs |\n| --- | --- | --- | --- | --- |\n| 205 | A (P2.5) | — | ⬜ | — |\n| 206 | B (P2.6) | — | ⬜ | — |\n');
    const r = await runIntake(['205', '206'], { root, budgetUsd: 1, log: () => {} }, { callClaude: writer(root, { cost: 0.7 }) });
    expect(r.items.map((i) => i.outcome)).toEqual(['drafted']);
    expect(r.stop).toMatchObject({ kind: 'budget' });
  });

  it('has an intake prompt that names the item, the vision document and the limits', () => {
    const p = prompts.intake({ nnn: '204', title: 'Decoder pool (P2.4)', date: '2026-10-08' });
    expect(p).toMatch(/\*\*204 — Decoder pool \(P2\.4\)\*\*/);
    expect(p).toMatch(/specs\/vision\/editor-implementation\.md/);
    expect(p).toMatch(/Status:\*\* Draft/);
    expect(p).not.toMatch(/\{\{/);
  });
});
