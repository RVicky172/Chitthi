// The headless runs' allow-list (D-014, 402 §5 "Permissions"): what the implementer and the reviewer may run in
// `claude -p`, where nobody can answer a permission prompt.
import { describe, expect, it } from 'vitest';
import { IMPLEMENTER_COMMANDS, REVIEWER_COMMANDS, allowedTools, allowedToolsArgs } from './permissions.mjs';

describe('allow-list', () => {
  it('gives the implementer exactly the D-014 commands, for Bash and PowerShell', () => {
    expect(IMPLEMENTER_COMMANDS).toEqual(['npm run:*', 'npm test:*', 'npx vitest:*', 'npx playwright test:*', 'git status:*', 'git diff:*', 'git log:*', 'git show:*', 'node scripts/*']);
    const tools = allowedTools('implementer');
    expect(tools).toHaveLength(18);
    expect(tools).toContain('Bash(npm run:*)');
    expect(tools).toContain('PowerShell(npm run:*)');
    expect(tools).toContain('Bash(node scripts/*)');
    expect(tools).toContain('PowerShell(node scripts/*)');
  });

  it('never puts `:*` straight after a path separator (it needs a word boundary, so it matches no subpath)', () => {
    // 403 T004: `node scripts/:*` refused `node scripts/factory/fixtures/stream/generate.mjs` headless
    for (const c of [...IMPLEMENTER_COMMANDS, ...REVIEWER_COMMANDS]) expect(c, c).not.toMatch(/[/\\]:\*$/);
  });

  it('gives the reviewer a read-only subset: git reads, vitest, npm run check', () => {
    expect(REVIEWER_COMMANDS).toEqual(['git status:*', 'git diff:*', 'git log:*', 'git show:*', 'npx vitest:*', 'npm run check:*']);
    const tools = allowedTools('reviewer');
    expect(tools).toContain('Bash(git diff:*)');
    expect(tools).toContain('PowerShell(npm run check:*)');
    // Nothing that can run arbitrary scripts or any npm script.
    expect(tools.some((t) => /npm run:\*|node scripts|playwright|npm test/.test(t))).toBe(false);
  });

  it('every reviewer command is something the implementer may also run', () => {
    const covered = (cmd) => IMPLEMENTER_COMMANDS.some((rule) => cmd.startsWith(rule.replace(/:\*$/, '')));
    for (const c of REVIEWER_COMMANDS) expect(covered(c.replace(/:\*$/, '')), c).toBe(true);
  });

  it('turns a role into one --allowedTools argument, comma-separated', () => {
    const args = allowedToolsArgs('reviewer');
    expect(args).toHaveLength(2);
    expect(args[0]).toBe('--allowedTools');
    expect(args[1].split(',')).toEqual(allowedTools('reviewer'));
  });

  it('refuses an unknown role', () => {
    expect(() => allowedTools('admin')).toThrow(/role/);
  });
});
