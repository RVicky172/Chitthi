/*
 * Gate lock (402 plan §6, AC-16): only one gate run at a time across every line (worktree) of the repo, since the
 * self-test and e2e use fixed ports. The lock is `<git common dir>/factory-gates.lock`, which all worktrees share,
 * created with open(…, 'wx') and holding { pid, feature, since }. A lock whose pid has ended is stale and taken over.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { resolve, join } from 'node:path';

const FRESH_MS = 10_000; // an unreadable lock younger than this is still being written by its taker

/** `<git common dir>/factory-gates.lock` for the repo (or worktree) at root. */
export function gateLockPath(root = process.cwd()) {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return join(resolve(root, common), 'factory-gates.lock');
}

/** Whether a process with this pid is running (EPERM: it exists but belongs to someone else). */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function readHolder(path) {
  try {
    const h = JSON.parse(readFileSync(path, 'utf8'));
    return h && typeof h === 'object' && Number.isInteger(h.pid) ? h : null;
  } catch {
    return null;
  }
}

/**
 * Tries once to take the lock. → { taken: true, lock, stale? } or { taken: false, holder }. A holder whose pid has
 * ended (or an unreadable file older than FRESH_MS) is removed and the lock taken; `stale` is that old holder.
 */
export function takeLock(path, { feature = '—' } = {}, { now = () => new Date(), alive = isAlive } = {}) {
  let stale;
  for (let attempt = 0; attempt < 2; attempt++) {
    const lock = { pid: process.pid, feature, since: now().toISOString() };
    try {
      const fd = openSync(path, 'wx');
      try {
        writeSync(fd, JSON.stringify(lock));
      } finally {
        closeSync(fd);
      }
      return stale ? { taken: true, lock, stale } : { taken: true, lock };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const holder = readHolder(path);
    if (holder ? alive(holder.pid) : isFresh(path, now)) return { taken: false, holder: holder ?? { pid: null, feature: '?', since: null } };
    stale = holder ?? { pid: null };
    try {
      unlinkSync(path);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return { taken: false, holder: readHolder(path) ?? { pid: null, feature: '?', since: null } };
}

function isFresh(path, now) {
  try {
    return now().getTime() - statSync(path).mtimeMs < FRESH_MS;
  } catch {
    return false; // gone meanwhile: the retry takes it
  }
}

/** Removes the lock if it is still the one we took (same pid and since). → whether it was removed. */
export function releaseLock(path, lock) {
  const holder = readHolder(path);
  if (!holder || holder.pid !== lock.pid || holder.since !== lock.since) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs fn holding the gate lock: waits (polling every pollMs) while another line holds it, calling onWait(holder)
 * whenever the holder changes, and releases it afterwards, also when fn throws.
 */
export async function withGateLock(fn, { root = process.cwd(), path, feature = '—', pollMs = 2000, onWait = () => {} } = {}) {
  const file = path ?? gateLockPath(root);
  let lastHolder = null;
  let r;
  while (!(r = takeLock(file, { feature })).taken) {
    const key = `${r.holder.pid}|${r.holder.since}`;
    if (key !== lastHolder) {
      lastHolder = key;
      onWait(r.holder);
    }
    await new Promise((res) => setTimeout(res, pollMs));
  }
  try {
    return await fn();
  } finally {
    releaseLock(file, r.lock);
  }
}
