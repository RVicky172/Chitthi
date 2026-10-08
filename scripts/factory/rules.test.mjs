// Guardrails (402 §3): which edits and commands an agent may make. The hooks in .claude/hooks/ call these.
import { describe, expect, it } from 'vitest';
import { afterCheck, changedPaths, commandAllowed, editAllowed, stopAction } from './rules.mjs';

describe('editAllowed', () => {
  const statuses = { 402: 'In Progress', 202: 'In Progress', 401: 'Implemented', 403: 'Approved', 404: 'Draft' };
  const status = (nnn) => statuses[nnn] ?? null;
  const cases = [
    ['src on an In Progress feature', 'src/engine/edits.ts', 'feat/402-software-factory', true],
    ['electron on an Approved feature', 'electron/main.cjs', 'feat/403-x', true],
    ['src on an Implemented feature (a fix after Verify)', 'src/ai/segment/index.ts', 'feat/401-ai-models-on-device', true],
    ['src on a Draft spec', 'src/engine/edits.ts', 'feat/404-y', false],
    ['electron with no spec folder', 'electron/main.cjs', 'feat/203-compositing', false],
    ['specs on a Draft spec', 'specs/features/404-y/spec.md', 'feat/404-y', true],
    ['memory and docs, no spec', 'docs/MCP.md', 'feat/203-compositing', true],
    ['scripts, no spec', 'scripts/factory/rules.mjs', 'feat/203-compositing', true],
    ['src on main (a fix, P3)', 'src/engine/edits.ts', 'main', true],
    ['src on a fix branch (P3)', 'src/engine/edits.ts', 'fix/crop-rounding', true],
    ['Windows separators', 'src\\engine\\edits.ts', 'feat/404-y', false],
    ['a path outside the repo', '../elsewhere/src/x.ts', 'feat/404-y', true],
  ];
  it.each(cases)('%s', (_name, path, branch, ok) => {
    expect(editAllowed(path, branch, status).ok).toBe(ok);
  });
  it('says why', () => {
    expect(editAllowed('src/x.ts', 'feat/404-y', status).reason).toMatch(/404.*Draft.*Approved/);
    expect(editAllowed('src/x.ts', 'feat/203-compositing', status).reason).toMatch(/no spec for 203/);
  });
});

describe('commandAllowed', () => {
  const cases = [
    ['sed -i', "sed -i 's/a/b/' src/x.ts", false],
    ['sed --in-place', 'sed --in-place=.bak s/a/b/ file.md', false],
    ['sed -i with a suffix', "sed -i.bak 's/a/b/' x", false],
    ['sed -n (read only)', "sed -n '1,20p' specs/roadmap.md", true],
    ['prettier writing src', 'npx prettier --write src/state/video.ts', false],
    ['prettier -w on src', 'npx prettier@3 -w "src/**/*.ts"', false],
    ['npm run format (writes src)', 'npm run format', false],
    ['prettier check', 'npx prettier --check src', true],
    ['prettier writing a new script', 'npx prettier --write scripts/factory/rules.mjs', true],
    ['git push', 'git push origin feat/402-software-factory', true],
    ['git push -f', 'git push -f', false],
    ['git push --force', 'git push --force origin main', false],
    ['git push --force-with-lease', 'git push --force-with-lease', false],
    ['git push +refspec', 'git push origin +main', false],
    ['git -C push --force', 'git -C ../wt push --force', false],
    ['git tag', 'git tag v2.10.0', false],
    ['git tag -a', 'git tag -a v1 -m x', false],
    ['git tag -d', 'git tag -d v1', false],
    ['git tag (list)', 'git tag', true],
    ['git tag -l', 'git tag -l "v2*"', true],
    ['git reset --hard', 'git reset --hard HEAD~1', false],
    ['git reset --soft', 'git reset HEAD~1 --soft', true],
    ['git clean -fd', 'git clean -fd', false],
    ['git clean -n (dry run)', 'git clean -n', true],
    ['git restore .', 'git restore .', false],
    ['git checkout -- .', 'git checkout -- .', false],
    ['git restore --staged', 'git restore --staged src/x.ts', true],
    ['chained, second part bad', 'npm run check && git push --force', false],
    ['piped', 'echo y | git clean -fdx', false],
    ['PowerShell chain', 'npm run check; if ($?) { git push --force }', false],
    ['newlines', 'npm run check\ngit tag v1', false],
    ['commit message mentioning a refused command', 'git commit -m "docs: never git push --force or sed -i"', true],
    [
      'heredoc commit message',
      "git commit -F - <<'EOF'\nfeat(402): rules\n\nRefuses git push --force and git tag.\nEOF",
      true,
    ],
    ['npm test', 'npm test', true],
    ['git status', 'git status --short', true],
  ];
  it.each(cases)('%s', (_name, command, ok) => {
    expect(commandAllowed(command).ok).toBe(ok);
  });
  it('says why', () => {
    expect(commandAllowed('git push --force').reason).toMatch(/force/i);
    expect(commandAllowed('git tag v1').reason).toMatch(/tag/);
    expect(commandAllowed("sed -i 's/a/b/' x").reason).toMatch(/sed -i/);
  });
});

describe('the Stop hook', () => {
  it('reads changed paths from git status --porcelain, renames and untracked included', () => {
    const porcelain = [' M src/engine/edits.ts', 'M  docs/MCP.md', '?? scripts/factory/rules.mjs', 'R  src/a.ts -> src/b.ts', ' D src/old.ts', '?? "src/with space.ts"', ''].join('\n');
    expect(changedPaths(porcelain)).toEqual([
      { path: 'src/engine/edits.ts', untracked: false, deleted: false },
      { path: 'docs/MCP.md', untracked: false, deleted: false },
      { path: 'scripts/factory/rules.mjs', untracked: true, deleted: false },
      { path: 'src/b.ts', untracked: false, deleted: false },
      { path: 'src/old.ts', untracked: false, deleted: true },
      { path: 'src/with space.ts', untracked: true, deleted: false },
    ]);
  });

  it('passes when no code changed, or the same code already passed', () => {
    expect(stopAction({ codeChanged: false })).toBe('pass');
    expect(stopAction({ codeChanged: true, hash: 'a', passedHash: 'a' })).toBe('pass');
    expect(stopAction({ codeChanged: true, hash: 'b', passedHash: 'a' })).toBe('check');
    expect(stopAction({ codeChanged: true, hash: 'b' })).toBe('check');
  });
  it('blocks a red check once, then lets the turn end and records it', () => {
    expect(afterCheck({ ok: true, active: false })).toBe('pass');
    expect(afterCheck({ ok: false, active: false })).toBe('block');
    expect(afterCheck({ ok: false, active: true })).toBe('give-up');
    expect(afterCheck({ ok: true, active: true })).toBe('pass');
  });
});
