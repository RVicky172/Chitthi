import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readJsonFile, tempMini } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));

function run(dir, ...args) {
  const r = spawnSync(process.execPath, [CLI, '--root', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SPECS_TODAY: '2026-02-03' },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const synced = () => {
  const dir = tempMini();
  run(dir, 'sync');
  return dir;
};
const text = (dir, path) => readFileSync(join(dir, path), 'utf8');
const betaJson = (dir) => readJsonFile(join(dir, 'specs/features/102-beta/feature.json'));

describe('cli', () => {
  it('sync writes the generated files, then check passes', () => {
    const dir = tempMini();
    expect(run(dir, 'check').code).toBe(1); // nothing generated yet
    expect(run(dir, 'sync')).toMatchObject({ code: 0, out: expect.stringContaining('specs/features/102-beta/plan.md') });
    expect(run(dir, 'check')).toMatchObject({ code: 0, out: expect.stringContaining('2 features, 3 items') });
  });

  it('start, block, done and undone change the JSON and the Markdown in one step', () => {
    const dir = synced();
    expect(run(dir, 'start', '102', 'T004')).toMatchObject({ code: 0, out: expect.stringContaining('102 T004 in-progress') });
    expect(text(dir, 'specs/features/102-beta/tasks.md')).toContain('- [ ] **T004** — Release.\n  - **In progress** since 2026-02-03');
    expect(run(dir, 'block', '102', 'T004', '--reason', 'Waits for 101.').code).toBe(0);
    expect(text(dir, 'specs/features/102-beta/tasks.md')).toContain('  - **Blocked:** Waits for 101.');
    const r = run(dir, 'done', '102', 'T002', '--commit', 'abc1234', '--result', 'Works.');
    expect(r).toMatchObject({ code: 0, out: expect.stringContaining('102 T002 done (2026-02-03)') });
    expect(betaJson(dir).tasks.items.byId.T002).toMatchObject({ status: 'done', commits: ['abc1234'], notes: ['Works.'] });
    expect(text(dir, 'specs/features/102-beta/tasks.md')).toContain('- [x] **T002** — Beta.');
    expect(run(dir, 'undone', '102', 'T001').code).toBe(0);
    expect(betaJson(dir).tasks.items.byId.T001.status).toBe('todo');
    expect(run(dir, 'check').code).toBe(0);
  });

  it('done and undone tick criteria', () => {
    const dir = synced();
    expect(run(dir, 'done', '102', 'AC-1').code).toBe(0);
    expect(text(dir, 'specs/features/102-beta/spec.md')).toContain('- [x] **AC-1:** Beta slips.');
    expect(run(dir, 'undone', '102', 'AC-1').code).toBe(0);
    expect(text(dir, 'specs/features/102-beta/spec.md')).toContain('- [ ] **AC-1:** Beta slips.');
  });

  it('status updates feature, roadmap and the generated Markdown', () => {
    const dir = synced();
    expect(run(dir, 'status', '102', 'implemented').code).toBe(0);
    expect(text(dir, 'specs/features/102-beta/spec.md')).toContain('**Status:** Implemented');
    expect(text(dir, 'specs/roadmap.md')).toContain('| 102 | Beta \\| the slip one (P1.2) | [spec](features/102-beta/spec.md) | ✔️ half way | 101 |');
    expect(run(dir, 'check').code).toBe(0);
  });

  it('new creates the folder, feature.json and a generated spec.md; the check passes', () => {
    const dir = synced();
    expect(run(dir, 'new', '103', 'gamma', 'Gamma').code).toBe(0);
    expect(readJsonFile(join(dir, 'specs/features/103-gamma/feature.json'))).toMatchObject({ id: '103', status: 'draft' });
    expect(text(dir, 'specs/features/103-gamma/spec.md')).toMatch(/^<!-- Generated[^\n]*\n\n# 103 — Gamma\n/);
    expect(existsSync(join(dir, 'specs/features/103-gamma/plan.md'))).toBe(false);
    expect(run(dir, 'check')).toMatchObject({ code: 0 });
  });

  it('refuses bad commands with exit 1 and one line', () => {
    const dir = synced();
    for (const args of [
      ['done', '102', 'T009'],
      ['done', '199', 'T001'],
      ['block', '102', 'T004'],
      ['frob'],
      ['status', '102'],
      ['start', '102'],
    ]) {
      const r = run(dir, ...args);
      expect(r.code, args.join(' ')).toBe(1);
      expect(r.err.trim().split('\n').length, r.err).toBe(1);
    }
    expect(run(dir, 'done', '199', 'T001').err).toContain('No feature 199');
    expect(run(dir, 'block', '102', 'T004').err).toContain('needs a reason');
  });
});
