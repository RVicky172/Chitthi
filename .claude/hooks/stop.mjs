#!/usr/bin/env node
/*
 * Claude Code Stop hook (402 plan §3): an agent can't end its turn while `npm run check` fails on code it changed.
 * Only runs the check when code (anything `npm run check` covers) differs from the last green run: the hash of the
 * changed code is kept in .factory/check-ok. A red check blocks the turn once (exit 2, the failure on stderr); if
 * the agent tries to stop again with it still red, the turn ends and the failure is recorded in
 * .factory/stop-hook.json (and in the loop's .factory/state.json when a loop is running).
 * Fails open like pre-tool.mjs; CHITTHI_FACTORY_HOOKS=off turns it off.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chooseGates, summarize } from '../../scripts/factory/gates.mjs';
import { afterCheck, changedPaths, stopAction } from '../../scripts/factory/rules.mjs';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const factory = join(root, '.factory');
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout ?? '';

function codeHash(code) {
  const h = createHash('sha1');
  h.update(git(['diff', 'HEAD', '--', ...code.filter((c) => !c.untracked).map((c) => c.path)]));
  for (const c of code.filter((x) => x.untracked && existsSync(join(root, x.path)) && statSync(join(root, x.path)).isFile()))
    h.update(c.path).update(readFileSync(join(root, c.path)));
  return h.digest('hex');
}

function record(summary) {
  const at = new Date().toISOString();
  writeFileSync(join(factory, 'stop-hook.json'), JSON.stringify({ at, ok: false, summary }, null, 2) + '\n');
  const state = join(factory, 'state.json');
  if (existsSync(state)) {
    const s = JSON.parse(readFileSync(state, 'utf8'));
    writeFileSync(state, JSON.stringify({ ...s, stop: { kind: 'check-red', reason: summary, at } }, null, 2) + '\n');
  }
}

function main(input) {
  const code = changedPaths(git(['status', '--porcelain', '-uall'])).filter((c) => chooseGates([c.path]).includes('check'));
  const hash = code.length ? codeHash(code) : '';
  const okFile = join(factory, 'check-ok');
  const passedHash = existsSync(okFile) ? readFileSync(okFile, 'utf8').trim() : '';
  if (stopAction({ codeChanged: code.length > 0, hash, passedHash }) === 'pass') return 0;

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = spawnSync('npm run check', { cwd: root, shell: true, env, encoding: 'utf8', timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  mkdirSync(factory, { recursive: true });
  const action = afterCheck({ ok: r.status === 0, active: Boolean(input.stop_hook_active) });
  if (action === 'pass') {
    writeFileSync(okFile, hash + '\n');
    return 0;
  }
  const tail = output.trim().split(/\r?\n/).slice(-40).join('\n');
  const { summary } = summarize('check', output, r.status ?? 1);
  if (action === 'give-up') {
    record(summary);
    return 0;
  }
  process.stderr.write(`npm run check fails on the code you changed. Fix it before ending your turn (the project's Stop hook, .claude/hooks/stop.mjs).\n${summary}\n\n${tail}`);
  return 2;
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  if (process.env.CHITTHI_FACTORY_HOOKS === 'off') process.exit(0);
  try {
    process.exit(main(raw.trim() ? JSON.parse(raw) : {}));
  } catch (e) {
    try {
      mkdirSync(factory, { recursive: true });
      appendFileSync(join(factory, 'hook-errors.log'), `${new Date().toISOString()} stop: ${e?.stack ?? e}\n`);
    } catch {
      // Nowhere to log: still fail open.
    }
    process.exit(0);
  }
});
