// Gate lock (402 §6, T060, AC-16): one gate run at a time across every line (worktree) of the repo. Take, wait,
// release, a stale holder taken over, and the path shared by all worktrees (git's common dir).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gateLockPath, isAlive, releaseLock, takeLock, withGateLock } from './lock.mjs';

let dir;
let path;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'chitthi-lock-'));
  path = join(dir, 'factory-gates.lock');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A pid that certainly belonged to a process that has ended. */
function deadPid() {
  const r = spawnSync(process.execPath, ['-e', '0']);
  return r.pid;
}

describe('takeLock / releaseLock', () => {
  it('takes a free lock: the file holds { pid, feature, since }', () => {
    const r = takeLock(path, { feature: '204' }, { now: () => new Date('2026-10-08T10:00:00Z') });
    expect(r.taken).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ pid: process.pid, feature: '204', since: '2026-10-08T10:00:00.000Z' });
  });

  it('a held lock is not taken; the answer names its holder', () => {
    expect(takeLock(path, { feature: '204' }).taken).toBe(true);
    const r = takeLock(path, { feature: '205' });
    expect(r.taken).toBe(false);
    expect(r.holder).toMatchObject({ pid: process.pid, feature: '204' });
  });

  it('release removes our own lock, and only ours', () => {
    const mine = takeLock(path, { feature: '204' });
    expect(releaseLock(path, { pid: 1234, since: mine.lock.since })).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(releaseLock(path, mine.lock)).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(releaseLock(path, mine.lock)).toBe(false); // already gone: no error
  });

  it('a lock whose pid is gone is stale and taken over', () => {
    const pid = deadPid();
    expect(isAlive(pid)).toBe(false);
    writeFileSync(path, JSON.stringify({ pid, feature: '203', since: '2026-10-08T09:00:00.000Z' }));
    const r = takeLock(path, { feature: '204' });
    expect(r.taken).toBe(true);
    expect(r.stale).toMatchObject({ pid, feature: '203' });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ pid: process.pid, feature: '204' });
  });

  it('isAlive: this process yes, an ended one no', () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(deadPid())).toBe(false);
  });

  it('an unreadable lock is held while fresh (being written), stale once old', () => {
    writeFileSync(path, '');
    const t = Date.now();
    expect(takeLock(path, {}, { now: () => new Date(t) }).taken).toBe(false);
    expect(takeLock(path, {}, { now: () => new Date(t + 60_000) }).taken).toBe(true);
  });
});

describe('withGateLock', () => {
  it('runs the function holding the lock, returns its value, releases after', async () => {
    const value = await withGateLock(async () => {
      expect(JSON.parse(readFileSync(path, 'utf8')).feature).toBe('204');
      return 42;
    }, { path, feature: '204' });
    expect(value).toBe(42);
    expect(existsSync(path)).toBe(false);
  });

  it('releases when the function throws', async () => {
    await expect(withGateLock(async () => { throw new Error('red'); }, { path })).rejects.toThrow('red');
    expect(existsSync(path)).toBe(false);
  });

  it('waits while another line holds the lock, says so once, then runs', async () => {
    const other = { pid: process.pid, feature: '203', since: new Date().toISOString() };
    writeFileSync(path, JSON.stringify(other));
    setTimeout(() => releaseLock(path, other), 80);
    const waits = [];
    const t0 = Date.now();
    await withGateLock(async () => {}, { path, feature: '204', pollMs: 10, onWait: (h) => waits.push(h) });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(60);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({ feature: '203' });
  });

  it('two runs at once never overlap', async () => {
    const spans = [];
    const run = (name) => withGateLock(async () => {
      const start = performance.now();
      await new Promise((r) => setTimeout(r, 40));
      spans.push({ name, start, end: performance.now() });
    }, { path, feature: name, pollMs: 5 });
    await Promise.all([run('203'), run('204')]);
    spans.sort((a, b) => a.start - b.start);
    expect(spans).toHaveLength(2);
    expect(spans[1].start).toBeGreaterThanOrEqual(spans[0].end);
  });
});

describe('gateLockPath', () => {
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  const real = (p) => realpathSync.native(p).toLowerCase(); // Windows: case and 8.3 names differ between APIs

  it('is <git common dir>/factory-gates.lock, the same file from every worktree', () => {
    const repo = join(dir, 'repo');
    git(dir, 'init', '-q', repo);
    for (const [k, v] of [['user.name', 'T'], ['user.email', 't@example.com'], ['commit.gpgsign', 'false'], ['core.hooksPath', join(dir, 'no-hooks')], ['core.autocrlf', 'false']]) git(repo, 'config', k, v);
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'a');
    const wt = join(dir, 'wt');
    git(repo, 'worktree', 'add', '-q', '-b', 'side', wt);
    const main = gateLockPath(repo);
    expect(real(join(main, '..'))).toBe(real(join(repo, '.git')));
    expect(main.endsWith('factory-gates.lock')).toBe(true);
    expect(real(join(gateLockPath(wt), '..'))).toBe(real(join(main, '..')));
  });
});
