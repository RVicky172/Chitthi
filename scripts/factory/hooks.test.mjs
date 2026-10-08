// The Claude Code hook wrappers in .claude/hooks/ (402 §3), run as Claude Code runs them: a process with the hook's
// JSON on stdin, exit 2 = refused.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOOK = join(import.meta.dirname, '../../.claude/hooks/pre-tool.mjs');
let repo;
let worktree;

function hook(input, { dir = repo, env = {} } = {}) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CHITTHI_FACTORY_HOOKS: '', ...env },
    encoding: 'utf8',
  });
  return { code: r.status, err: r.stderr };
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'factory-hook-'));
  mkdirSync(join(repo, '.git'));
  writeFileSync(join(repo, '.git/HEAD'), 'ref: refs/heads/feat/404-y\n');
  mkdirSync(join(repo, 'specs/features/404-y'), { recursive: true });
  writeFileSync(join(repo, 'specs/features/404-y/spec.md'), '# 404 — Y\n\n**Status:** Draft <!-- … -->\n');
  mkdirSync(join(repo, 'specs/features/402-x'), { recursive: true });
  writeFileSync(join(repo, 'specs/features/402-x/spec.md'), '# 402 — X\n\n**Status:** In Progress <!-- … -->\n');
  // A worktree: .git is a file naming its git dir, whose HEAD is on feat/402-x.
  worktree = mkdtempSync(join(tmpdir(), 'factory-wt-'));
  mkdirSync(join(repo, '.git/worktrees/wt'), { recursive: true });
  writeFileSync(join(repo, '.git/worktrees/wt/HEAD'), 'ref: refs/heads/feat/402-x\n');
  writeFileSync(join(worktree, '.git'), `gitdir: ${join(repo, '.git/worktrees/wt')}\n`);
  mkdirSync(join(worktree, 'specs/features/402-x'), { recursive: true });
  writeFileSync(join(worktree, 'specs/features/402-x/spec.md'), '# 402 — X\n\n**Status:** In Progress\n');
});
afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(worktree, { recursive: true, force: true });
});

describe('pre-tool hook', () => {
  it('refuses git tag with the reason, allows git status', () => {
    const r = hook({ tool_name: 'Bash', tool_input: { command: 'git tag v9' } });
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/guardrails.*git tag/);
    expect(hook({ tool_name: 'PowerShell', tool_input: { command: 'git status' } }).code).toBe(0);
  });

  it('refuses an edit under src/ while the spec is Draft, allows specs/', () => {
    expect(hook({ tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/engine/x.ts') } }).code).toBe(2);
    expect(hook({ tool_name: 'Write', tool_input: { file_path: join(repo, 'specs/features/404-y/plan.md') } }).code).toBe(0);
  });

  it('reads the branch of a worktree', () => {
    expect(hook({ tool_name: 'Edit', tool_input: { file_path: join(worktree, 'src/engine/x.ts') } }, { dir: worktree }).code).toBe(0);
  });

  it('fails open on its own error, and logs it', () => {
    expect(hook('not json').code).toBe(0);
    expect(readFileSync(join(repo, '.factory/hook-errors.log'), 'utf8')).toMatch(/pre-tool: SyntaxError/);
  });

  it('CHITTHI_FACTORY_HOOKS=off turns it off', () => {
    expect(hook({ tool_name: 'Bash', tool_input: { command: 'git tag v9' } }, { env: { CHITTHI_FACTORY_HOOKS: 'off' } }).code).toBe(0);
  });

  it('answers within 150 ms a call (20 calls)', () => {
    const times = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      hook({ tool_name: i % 2 ? 'Bash' : 'Edit', tool_input: i % 2 ? { command: 'npm run check && git push' } : { file_path: join(repo, 'src/x.ts') } });
      times.push(performance.now() - t0);
    }
    expect(Math.max(...times)).toBeLessThan(150);
  });
});
