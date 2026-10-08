#!/usr/bin/env node
/*
 * Claude Code PreToolUse hook (402 plan §3): refuses an edit under src/ or electron/ while the branch's feature has
 * no approved spec, and the commands in scripts/factory/rules.mjs (sed -i, Prettier on src/, force push, git tag,
 * reset --hard …). Exit 2 refuses, and Claude Code shows the reason (stderr) to the agent.
 * Fails open: if this script itself breaks, the call goes ahead and the error is logged to .factory/hook-errors.log,
 * so a bug here can't lock anyone out. CHITTHI_FACTORY_HOOKS=off turns the hooks off for one session.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { commandAllowed, editAllowed } from '../../scripts/factory/rules.mjs';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

/** The branch, from .git/HEAD; in a worktree .git is a file pointing at its own git dir. */
function branch() {
  let git = join(root, '.git');
  if (existsSync(git) && statSync(git).isFile()) git = readFileSync(git, 'utf8').replace(/^gitdir:\s*/, '').trim();
  const head = readFileSync(isAbsolute(git) ? join(git, 'HEAD') : join(root, git, 'HEAD'), 'utf8').trim();
  return head.replace(/^ref:\s*refs\/heads\//, '');
}

function specStatus(nnn) {
  const dir = join(root, 'specs/features');
  const folder = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${nnn}-`)) : undefined;
  if (!folder || !existsSync(join(dir, folder, 'spec.md'))) return null;
  return /\*\*Status:\*\*\s*([A-Za-z ]+?)\s*(<!--|$|\*\*)/m.exec(readFileSync(join(dir, folder, 'spec.md'), 'utf8'))?.[1] ?? 'Draft';
}

function decide(input) {
  const tool = input.tool_name;
  const args = input.tool_input ?? {};
  if (tool === 'Bash' || tool === 'PowerShell') return commandAllowed(args.command ?? '');
  const file = args.file_path ?? args.notebook_path;
  if (!file) return { ok: true };
  return editAllowed(isAbsolute(file) ? relative(root, file) : file, branch(), specStatus);
}

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  if (process.env.CHITTHI_FACTORY_HOOKS === 'off') process.exit(0);
  try {
    const r = decide(JSON.parse(raw));
    if (!r.ok) {
      process.stderr.write(`Refused by the project's guardrails (.claude/hooks/pre-tool.mjs): ${r.reason}`);
      process.exit(2);
    }
    process.exit(0);
  } catch (e) {
    try {
      mkdirSync(join(root, '.factory'), { recursive: true });
      appendFileSync(join(root, '.factory/hook-errors.log'), `${new Date().toISOString()} pre-tool: ${e?.stack ?? e}\n`);
    } catch {
      // Nowhere to log: still fail open.
    }
    process.exit(0);
  }
});
